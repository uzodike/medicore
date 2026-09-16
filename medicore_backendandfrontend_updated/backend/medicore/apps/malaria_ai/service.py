# ══════════════════════════════════════════════════════════════════
# Save as: apps/ai_microscopy/service.py (replaces the malaria-only
# version from before — same MicroscopySession/Field/Candidate models,
# now handles both classify and detect test kinds)
# ══════════════════════════════════════════════════════════════════
import io
import importlib
import numpy as np
from PIL import Image
from django.core.files.base import ContentFile
from django.utils import timezone

from ai_services.registry import get_config, TestConfig
from ai_services.microscopy.microscope_client import MicroscopeClient, GridPlan
from ai_services.microscopy.segment_candidates import segment_candidates
from .models import MicroscopySession, MicroscopyField, MicroscopyCandidate

_loaded_models: dict[str, object] = {}  # in-process cache, keyed by test_type


def _get_model(test_type: str, config: TestConfig):
    if test_type not in _loaded_models:
        if config.kind == 'classify':
            from tensorflow import keras
            _loaded_models[test_type] = keras.models.load_model(config.model_path)
        else:  # detect
            from ultralytics import YOLO
            _loaded_models[test_type] = YOLO(config.model_path)
    return _loaded_models[test_type]


def run_scan_for_order_item(lab_order_item, test_type: str, grid: GridPlan, microscope_url: str):
    config = get_config(test_type)
    model = _get_model(test_type, config)

    session = MicroscopySession.objects.create(
        lab_order_item=lab_order_item, test_type=test_type, status='scanning',
    )

    client = MicroscopeClient(base_url=microscope_url)
    total_positive = 0
    total_candidates = 0

    for x, y, image_bytes in client.scan_slide(grid, autofocus_each_position=True):
        pil_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')

        field = MicroscopyField.objects.create(session=session, stage_x=x, stage_y=y)
        field.image.save(f'field_{x}_{y}.jpg', ContentFile(image_bytes), save=True)

        if config.kind == 'classify':
            results = _run_classify(pil_img, model, config)
        else:
            results = _run_detect(pil_img, model, config)

        field.candidate_count = len(results)
        field.save(update_fields=['candidate_count'])

        for r in results:
            total_candidates += 1
            if r['predicted_class'] != config.classes[0]:  # class[0] = negative/background
                total_positive += 1

            crop_pil = r['crop_image']  # PIL image, whole field for 'detect', cropped for 'classify'
            buf = io.BytesIO()
            crop_pil.save(buf, format='JPEG')

            candidate_row = MicroscopyCandidate(
                field=field, predicted_class=r['predicted_class'], confidence=r['confidence'],
                x=r['x'], y=r['y'],
            )
            candidate_row.crop_image.save(
                f'crop_{x}_{y}_{r["x"]}_{r["y"]}.jpg', ContentFile(buf.getvalue()), save=False
            )
            candidate_row.save()

        session.fields_scanned += 1
        session.save(update_fields=['fields_scanned'])

    session.status = 'pending_review'
    session.ai_summary = {
        'test_kind': config.kind,
        'total_fields': session.fields_scanned,
        'total_objects_examined': total_candidates,
        'positive_count': total_positive,
        'positive_rate_pct': round(100 * total_positive / total_candidates, 2) if total_candidates else 0,
    }
    session.save(update_fields=['status', 'ai_summary'])
    return session


def _run_classify(pil_img: Image.Image, model, config: TestConfig) -> list[dict]:
    """One crop per candidate object, one classifier call per crop."""
    np_img = np.array(pil_img)[:, :, ::-1]  # RGB -> BGR for cv2-based segmentation
    candidates = segment_candidates(np_img, min_area=config.min_area, max_area=config.max_area,
                                     crop_size=config.crop_size)
    results = []
    for cand in candidates:
        resized = np.array(Image.fromarray(cand.crop[:, :, ::-1]).resize((config.crop_size, config.crop_size)))
        batch = np.expand_dims(resized.astype('float32') / 255.0, axis=0)
        probs = model.predict(batch, verbose=0)[0]
        idx = int(np.argmax(probs))
        results.append({
            'predicted_class': config.classes[idx],
            'confidence': float(probs[idx]),
            'x': cand.x, 'y': cand.y,
            'crop_image': Image.fromarray(cand.crop[:, :, ::-1]),
        })
    return results


def _run_detect(pil_img: Image.Image, model, config: TestConfig) -> list[dict]:
    """
    One detector call on the whole field — for microfilariae/stool
    O&P/UTI, where objects are found AND located in one pass rather
    than pre-cropped. Each detection becomes its own MicroscopyCandidate
    row, cropped from the box the model found, so the review UI and
    training-data pattern stay identical to the classify path.
    """
    yolo_results = model.predict(np.array(pil_img), conf=config.confidence_threshold, verbose=False)[0]
    results = []
    for box in yolo_results.boxes:
        cls_idx = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        crop = pil_img.crop((x1, y1, x2, y2))
        results.append({
            'predicted_class': config.classes[cls_idx],
            'confidence': conf,
            'x': x1, 'y': y1,
            'crop_image': crop,
        })
    return results


def confirm_session(session_id: int, reviewer, overrides: dict[int, str] | None = None):
    """Unchanged from before — human confirmation is required regardless
    of whether the test used classify or detect under the hood."""
    session = MicroscopySession.objects.select_related('lab_order_item').get(id=session_id)

    if overrides:
        for candidate_id, corrected_class in overrides.items():
            MicroscopyCandidate.objects.filter(id=candidate_id).update(reviewer_override=corrected_class)

    session.status = 'confirmed'
    session.reviewed_by = reviewer
    session.confirmed_at = timezone.now()
    session.save(update_fields=['status', 'reviewed_by', 'confirmed_at'])

    item = session.lab_order_item
    summary = session.ai_summary
    item.result_value = f"{summary['positive_rate_pct']}% positive ({summary['positive_count']}/{summary['total_objects_examined']} objects)"
    item.result_status = 'completed'
    item.performed_by = reviewer
    item.flag = 'P' if summary['positive_count'] > 0 else 'N'
    item.save()
    return session