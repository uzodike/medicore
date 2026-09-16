# apps/malaria_ai/views.py
#
# GENERALIZED — folds in the classify path (original malaria-only
# confirm_screen, unchanged logic) and the detect path (box review,
# previously prototyped in the now-abandoned apps/ai_screening) into
# one clean set of endpoints, all living in this one app.
import os
from django.conf import settings
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .models import MalariaScreen, MalariaScreenBox
from .serializers import MalariaScreenSerializer

# Reads AI_SERVICE_URL first (the current name going forward), falls
# back to the old MALARIA_AI_URL if that's still what's set in your
# environment — either name points at the same ai-services/service.py.
AI_SERVICE_URL = getattr(
    settings, 'AI_SERVICE_URL',
    os.getenv('AI_SERVICE_URL', os.getenv('MALARIA_AI_URL', 'http://127.0.0.1:8090'))
)


# ── List / filter screens ─────────────────────────────────────────────────────

class MalariaScreenListView(generics.ListAPIView):
    """
    GET /malaria/screens/?test_type=tb_smear&patient=<uuid>&order_item=<uuid>
    test_type is optional — omit it to see screens across all tests.
    """
    serializer_class = MalariaScreenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (MalariaScreen.objects
              .filter(is_deleted=False)
              .select_related('patient', 'confirmed_by')
              .prefetch_related('boxes'))
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


# ── Service health, per test_type ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ai_service_status(request):
    """
    GET /malaria/status/?test_type=tb_smear
    Defaults to 'malaria' if omitted, for backward compatibility with
    any caller that hasn't been updated to pass test_type yet.
    """
    test_type = request.query_params.get('test_type', 'malaria')
    try:
        import requests
        r = requests.get(f'{AI_SERVICE_URL}/health/{test_type}', timeout=3)
        data = r.json()
    except Exception as e:
        return Response({'status': 'unreachable', 'model_loaded': False, 'detail': str(e)})

    from .registry import get_config
    try:
        config = get_config(test_type)
        data.setdefault('kind', config.kind)
    except KeyError:
        pass
    return Response(data)


# ── Create a screen + upload image + run inference in one step ──────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def screen_image(request):
    """
    POST /malaria/screens/upload/
    Body: test_type (str, optional — defaults to 'malaria' for backward
          compatibility with the original malaria-only caller),
          patient (uuid, required), image (file, required),
          order_item (uuid, optional)
    """
    test_type = request.data.get('test_type', 'malaria')
    patient_id = request.data.get('patient')
    image = request.FILES.get('image')
    order_item_id = request.data.get('order_item')

    if not patient_id or not image:
        return Response({'error': 'patient and image are required'}, status=400)

    from .registry import get_config
    try:
        config = get_config(test_type)
    except KeyError as e:
        return Response({'error': str(e)}, status=400)

    from apps.patients.models import Patient
    patient = get_object_or_404(Patient, pk=patient_id, is_deleted=False)

    screen = MalariaScreen.objects.create(
        test_type=test_type, patient=patient,
        order_item_id=order_item_id or None, image=image,
    )

    ai_error = _run_inference(screen, config)
    resp_data = {'screen': MalariaScreenSerializer(screen).data}
    if ai_error:
        resp_data['ai_error'] = ai_error
    return Response(resp_data, status=201)


def _run_inference(screen, config):
    """
    Shared inference call. Returns an error message string on failure,
    or None on success — the caller surfaces it in the response since
    MalariaScreen has no field to persist a transient service-down message.
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
            # counts as confirmed yet, that only happens in box review.
            for det in data.get('detections', []):
                x1, y1, x2, y2 = det['box']
                MalariaScreenBox.objects.create(
                    screen=screen, x1=x1, y1=y1, x2=x2, y2=y2,
                    predicted_class=det['class'], source='ai',
                    ai_confidence=det['confidence'],
                )

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
    """GET /malaria/screens/<uuid:pk>/boxes/ — feeds the box-review overlay UI."""
    screen = get_object_or_404(MalariaScreen, pk=pk, is_deleted=False)
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
    POST /malaria/screens/<uuid:pk>/review/
    Body:
        confirmed_box_ids: [id, id, ...]   — AI boxes the reviewer agrees with
        rejected_box_ids:  [id, id, ...]   — AI boxes that are false positives
        new_boxes: [{x1, y1, x2, y2, predicted_class}, ...]  — real objects
                    the AI missed entirely, drawn by the reviewer
    """
    screen = get_object_or_404(MalariaScreen, pk=pk, is_deleted=False)
    data = request.data

    confirmed_ids = data.get('confirmed_box_ids', [])
    rejected_ids = data.get('rejected_box_ids', [])
    new_boxes = data.get('new_boxes', [])

    if confirmed_ids:
        MalariaScreenBox.objects.filter(id__in=confirmed_ids, screen=screen).update(
            confirmed=True, rejected=False)
    if rejected_ids:
        MalariaScreenBox.objects.filter(id__in=rejected_ids, screen=screen).update(
            confirmed=False, rejected=True)
    for nb in new_boxes:
        MalariaScreenBox.objects.create(
            screen=screen, x1=nb['x1'], y1=nb['y1'], x2=nb['x2'], y2=nb['y2'],
            predicted_class=nb['predicted_class'], source='human', confirmed=True,
        )

    real_box_count = screen.boxes.filter(confirmed=True, rejected=False).count()
    screen.status = 'confirmed_positive' if real_box_count > 0 else 'confirmed_negative'
    screen.confirmed_by = request.user
    screen.confirmed_at = timezone.now()
    screen.save(update_fields=['status', 'confirmed_by', 'confirmed_at'])

    return Response({
        'screen': MalariaScreenSerializer(screen).data,
        'confirmed_box_count': real_box_count,
    })


# ── Classify-kind: simple confirm (no boxes involved) ────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_screen(request, pk):
    """
    POST /malaria/screens/<uuid:pk>/confirm/
    Unchanged from the original malaria-only version — for classify-kind
    tests (malaria, sickle_cell). Body: status ('confirmed_positive' |
    'confirmed_negative' | 'inconclusive' | 'overridden'), notes (optional).

    This does NOT touch the patient's official LabOrder result — the lab
    scientist still enters/releases that through the normal Lab results
    flow; this just records who confirmed the AI suggestion and whether
    they agreed.
    """
    screen = get_object_or_404(MalariaScreen, pk=pk, is_deleted=False)
    new_status = request.data.get('status')
    valid = {'confirmed_positive', 'confirmed_negative', 'inconclusive', 'overridden'}
    if new_status not in valid:
        return Response({'error': f'status must be one of: {", ".join(sorted(valid))}'}, status=400)

    screen.status = new_status
    screen.confirmed_by = request.user
    screen.confirmed_at = timezone.now()
    screen.scientist_notes = request.data.get('notes', screen.scientist_notes)
    screen.save(update_fields=['status', 'confirmed_by', 'confirmed_at', 'scientist_notes', 'updated_at'])

    return Response(MalariaScreenSerializer(screen).data)