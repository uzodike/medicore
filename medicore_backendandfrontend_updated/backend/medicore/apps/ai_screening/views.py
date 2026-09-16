# apps/ai_screening/views.py
#
# Complete file. Generic across every registry.py test_type — malaria,
# sickle_cell, tb_smear, microfilariae, and whatever gets added later.
# Replaces the old malaria-only apps/malaria_ai app for anything new
# built against this. AI fields are ALWAYS advisory; only a human
# confirm/review step counts clinically — see AIScreen model docstring.

import os
from django.conf import settings
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .models import AIScreen, AIScreenBox
from .serializers import AIScreenSerializer

AI_SERVICE_URL = getattr(settings, 'AI_SERVICE_URL', os.getenv('AI_SERVICE_URL', 'http://127.0.0.1:8090'))


# ── List / filter screens ─────────────────────────────────────────────────────

class AIScreenListView(generics.ListAPIView):
    """
    GET /ai-screening/screens/?test_type=tb_smear&patient=<uuid>&order_item=<uuid>
    test_type is optional — omit it to see screens across all tests.
    """
    serializer_class = AIScreenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AIScreen.objects.select_related('patient', 'confirmed_by').prefetch_related('boxes')
        test_type = self.request.query_params.get('test_type')
        patient = self.request.query_params.get('patient')
        order_item = self.request.query_params.get('order_item')
        status_f = self.request.query_params.get('status')
        if test_type:
            qs = qs.filter(test_type=test_type)
        if patient:
            qs = qs.filter(patient_id=patient)
        if order_item:
            qs = qs.filter(order_item_id=order_item)
        if status_f:
            qs = qs.filter(status=status_f)
        return qs


# ── Service health ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ai_service_status(request):
    """
    GET /ai-screening/status/?test_type=tb_smear
    Lets the Lab UI show 'AI screening unavailable for this test' honestly,
    per test_type, instead of one blanket up/down flag for everything.

    Also returns the registry's kind/classes/confidence_threshold for this
    test_type so the frontend never has to duplicate registry.py's
    classify-vs-detect knowledge in JavaScript — single source of truth
    stays in one file.
    """
    test_type = request.query_params.get('test_type')
    registry_info = {}
    if test_type:
        from ai_services.registry import get_config
        try:
            config = get_config(test_type)
            registry_info = {
                'kind': config.kind,
                'classes': config.classes,
                'confidence_threshold': config.confidence_threshold,
                'specimen': config.specimen,
            }
        except KeyError as e:
            return Response({'status': 'unknown_test_type', 'model_loaded': False, 'detail': str(e)}, status=400)

    try:
        import requests
        url = f'{AI_SERVICE_URL}/health'
        if test_type:
            url += f'/{test_type}'
        r = requests.get(url, timeout=3)
        health = r.json()
    except Exception as e:
        health = {'status': 'unreachable', 'model_loaded': False, 'detail': str(e)}

    return Response({**health, **registry_info})


# ── Create a screen + upload image in one step (what the Lab UI actually calls first) ──

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def screen_image_adhoc(request):
    """
    POST /ai-screening/screens/adhoc-upload/
    Body: test_type (str, required — one of registry.py's keys),
          patient (uuid, required), image (file, required),
          order_item (uuid, optional)

    Creates the AIScreen row AND runs inference in one call — this is the
    entry point the frontend hits when a lab scientist picks a file and
    clicks "Get AI suggestion" for any test.
    """
    test_type = request.data.get('test_type')
    patient_id = request.data.get('patient')
    image = request.FILES.get('image')
    order_item_id = request.data.get('order_item')

    if not test_type or not patient_id or not image:
        return Response({'error': 'test_type, patient, and image are required'}, status=400)

    from ai_services.registry import get_config
    try:
        config = get_config(test_type)
    except KeyError as e:
        return Response({'error': str(e)}, status=400)

    from apps.patients.models import Patient
    patient = get_object_or_404(Patient, pk=patient_id, is_deleted=False)

    screen = AIScreen.objects.create(
        test_type=test_type,
        patient=patient,
        order_item_id=order_item_id or None,
        image=image,
        status='awaiting_image',
    )

    _ai_error = _run_inference_and_update(screen, config)
    resp_data = {'screen': AIScreenSerializer(screen).data}
    if _ai_error:
        resp_data['ai_error'] = _ai_error
    return Response(resp_data, status=201)


# ── Upload/replace image on an existing screen row ───────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def upload_screen_image(request, pk):
    """
    POST /ai-screening/screens/<uuid:pk>/upload/
    For classify-kind tests (malaria, sickle_cell): sets ai_label/ai_confidence.
    For detect-kind tests (tb_smear, microfilariae): also creates one
    AIScreenBox per detection — unreviewed, source='ai' — so there's
    something concrete for a human to confirm/reject/extend in the
    review step, rather than just a bare positive/negative.
    """
    screen = get_object_or_404(AIScreen, pk=pk)
    image = request.FILES.get('image')
    if not image:
        return Response({'error': 'image is required'}, status=400)

    screen.image = image
    screen.save(update_fields=['image'])

    from ai_services.registry import get_config
    try:
        config = get_config(screen.test_type)
    except KeyError as e:
        return Response({'error': str(e)}, status=400)

    _ai_error = _run_inference_and_update(screen, config)
    resp_data = {'screen': AIScreenSerializer(screen).data}
    if _ai_error:
        resp_data['ai_error'] = _ai_error
    return Response(resp_data, status=200)


def _run_inference_and_update(screen, config):
    """
    Shared inference call used by both upload entry points above.
    Returns an error message string on failure, or None on success —
    the caller is responsible for surfacing it in the response, since
    AIScreen has no field to persist a transient service-down message.
    """
    try:
        import requests
        screen.image.seek(0)
        resp = requests.post(
            f'{AI_SERVICE_URL}/predict/{screen.test_type}',
            files={'file': (screen.image.name, screen.image.read(), 'application/octet-stream')},
            timeout=30,
        )
        if resp.status_code == 503:
            return resp.json().get('detail', 'Model not loaded on the inference service.')
        resp.raise_for_status()
        data = resp.json()

        screen.ai_label = data.get('label', '')
        screen.ai_confidence = data.get('confidence')
        screen.ai_model_version = data.get('model_version', '')
        screen.ai_raw_response = data

        if config.kind == 'detect':
            # Store each proposed box as its own row — nothing here
            # counts as confirmed yet, that only happens in the review step.
            for det in data.get('detections', []):
                x1, y1, x2, y2 = det['box']
                AIScreenBox.objects.create(
                    screen=screen, x1=x1, y1=y1, x2=x2, y2=y2,
                    predicted_class=det['class'], source='ai',
                    ai_confidence=det['confidence'],
                )
            screen.status = 'pending'   # pending BOX REVIEW, not just a status confirm
        else:
            screen.status = 'pending'

        screen.save(update_fields=['ai_label', 'ai_confidence', 'ai_model_version',
                                    'ai_raw_response', 'status'])
        return None
    except Exception as e:
        return f'AI screening service unreachable ({e}). Image saved — enter the result manually.'


# ── Detect-kind: list boxes for the review UI ────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_boxes_for_screen(request, pk):
    """
    GET /ai-screening/screens/<uuid:pk>/boxes/
    Feeds the review UI: every box currently on this screen — AI's
    proposals plus any the reviewer has already added — so a
    bounding-box overlay can be rendered for the reviewer to act on.
    """
    screen = get_object_or_404(AIScreen, pk=pk)
    boxes = screen.boxes.all().values(
        'id', 'x1', 'y1', 'x2', 'y2', 'predicted_class',
        'source', 'ai_confidence', 'confirmed', 'rejected',
    )
    return Response({
        'screen_id': screen.id,
        'image_url': screen.image.url if screen.image else None,
        'boxes': list(boxes),
    })


# ── Detect-kind: submit box review ───────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_box_review(request, pk):
    """
    POST /ai-screening/screens/<uuid:pk>/review/
    Body:
        confirmed_box_ids: [id, id, ...]   — AI boxes the reviewer agrees with
        rejected_box_ids:  [id, id, ...]   — AI boxes that are false positives
        new_boxes: [{x1, y1, x2, y2, predicted_class}, ...]  — real objects
                    the AI missed entirely, drawn by the reviewer
    """
    screen = get_object_or_404(AIScreen, pk=pk)
    data = request.data

    confirmed_ids = data.get('confirmed_box_ids', [])
    rejected_ids = data.get('rejected_box_ids', [])
    new_boxes = data.get('new_boxes', [])

    if confirmed_ids:
        AIScreenBox.objects.filter(id__in=confirmed_ids, screen=screen).update(
            confirmed=True, rejected=False)
    if rejected_ids:
        AIScreenBox.objects.filter(id__in=rejected_ids, screen=screen).update(
            confirmed=False, rejected=True)
    for nb in new_boxes:
        AIScreenBox.objects.create(
            screen=screen, x1=nb['x1'], y1=nb['y1'], x2=nb['x2'], y2=nb['y2'],
            predicted_class=nb['predicted_class'], source='human', confirmed=True,
        )

    # Overall screen status derives from whether any real (confirmed,
    # non-rejected) boxes exist after review — not from the AI's original
    # count, which may have included false positives.
    real_box_count = screen.boxes.filter(confirmed=True, rejected=False).count()
    screen.status = 'confirmed_positive' if real_box_count > 0 else 'confirmed_negative'
    screen.confirmed_by = request.user
    screen.confirmed_at = timezone.now()
    screen.save(update_fields=['status', 'confirmed_by', 'confirmed_at'])

    return Response({
        'screen': AIScreenSerializer(screen).data,
        'confirmed_box_count': real_box_count,
    })


# ── Classify-kind: simple confirm (no boxes involved) ────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_screen(request, pk):
    """
    POST /ai-screening/screens/<uuid:pk>/confirm/
    For classify-kind tests (malaria, sickle_cell) — the mandatory human
    sign-off, mirroring the old malaria_ai app's confirm_screen exactly.
    Body: status ('confirmed_positive' | 'confirmed_negative' |
                   'inconclusive' | 'overridden'), notes (optional).

    This does NOT touch the patient's official LabOrder result — the lab
    scientist still enters/releases that through the normal Lab results
    flow; this just records who confirmed the AI suggestion and whether
    they agreed.
    """
    screen = get_object_or_404(AIScreen, pk=pk)
    new_status = request.data.get('status')
    valid = {'confirmed_positive', 'confirmed_negative', 'inconclusive', 'overridden'}
    if new_status not in valid:
        return Response({'error': f'status must be one of: {", ".join(sorted(valid))}'}, status=400)

    screen.status = new_status
    screen.confirmed_by = request.user
    screen.confirmed_at = timezone.now()
    screen.scientist_notes = request.data.get('notes', screen.scientist_notes)
    screen.save(update_fields=['status', 'confirmed_by', 'confirmed_at', 'scientist_notes', 'updated_at'])

    return Response(AIScreenSerializer(screen).data)