"""
Save as: ai-services/service.py

Run from the folder that CONTAINS ai-services/:
    cd "C:\\Users\\computer world\\Downloads\\files"
    uvicorn ai-services.service:app --host 127.0.0.1 --port 8090
"""
import io
import os
import zipfile

os.environ.setdefault('TF_NUM_INTEROP_THREADS', '2')
os.environ.setdefault('TF_NUM_INTRAOP_THREADS', '2')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import numpy as np
import traceback

from registry import REGISTRY, get_config, TestConfig

app = FastAPI(title="MediCore AI Screening — real service", version="1.0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_loaded: dict[str, dict] = {}


# ══════════════════════════════════════════════════════════════════
# Malaria's known Keras-version quirk — the .keras file was saved
# under TF-bundled Keras 2.x; standalone Keras 3.x can't deserialize
# its 'keras.src.engine.functional' module path at all. Rebuild the
# exact architecture in code and load weights by ARRAY SHAPE instead
# of by name — confirmed against this model's own error dump, which
# shows the identical layer names/order used here.
# ══════════════════════════════════════════════════════════════════
 
# NEW:
def _build_malaria_architecture():
    from keras.layers import (
        Input, Conv2D, MaxPooling2D, BatchNormalization, Dropout,
        GlobalAveragePooling2D, Dense,
    )
    from keras.models import Model
 
    inputs = Input(shape=(150, 150, 3), name='malaria_cells')
    x = Conv2D(64, (3, 3), strides=(1, 1), padding='same', activation='relu', name='conv2d')(inputs)
    x = MaxPooling2D((2, 2), name='max_pooling2d')(x)
    x = BatchNormalization(name='batch_normalization')(x)
    x = Dropout(0.3, name='dropout')(x)
    x = Conv2D(64, (3, 3), strides=(1, 1), padding='same', activation='relu', name='conv2d_1')(x)
    x = MaxPooling2D((2, 2), name='max_pooling2d_1')(x)
    x = GlobalAveragePooling2D(name='global_average_pooling2d')(x)
    x = Dense(512, activation='relu', name='dense')(x)
    x = BatchNormalization(name='batch_normalization_1')(x)
    x = Dropout(0.3, name='dropout_1')(x)
    x = Dense(256, activation='relu', name='dense_1')(x)
    x = BatchNormalization(name='batch_normalization_2')(x)
    outputs = Dense(1, activation='sigmoid', name='cell_classes')(x)
    return Model(inputs=inputs, outputs=outputs, name='model')

def _load_malaria_weights_by_shape(model, keras_file_path):
    import h5py

    with zipfile.ZipFile(keras_file_path) as z:
        weights_bytes = z.read('model.weights.h5')

    with h5py.File(io.BytesIO(weights_bytes), 'r') as f:
        grp = f['_layer_checkpoint_dependencies']
        stored = {}
        for name in grp.keys():
            if 'vars' in grp[name] and len(grp[name]['vars'].keys()) > 0:
                arrays = [grp[name]['vars'][k][()] for k in sorted(grp[name]['vars'].keys(), key=int)]
                stored[name] = arrays

    by_shape_signature = {}
    for name, arrays in stored.items():
        sig = tuple(a.shape for a in arrays)
        by_shape_signature[sig] = arrays

    applied, skipped = [], []
    for layer in model.layers:
        layer_weights = layer.get_weights()
        if not layer_weights:
            continue
        sig = tuple(w.shape for w in layer_weights)
        if sig in by_shape_signature:
            layer.set_weights(by_shape_signature[sig])
            applied.append(layer.name)
        else:
            skipped.append((layer.name, sig))

    if skipped:
        raise RuntimeError(f"Could not shape-match weights for layers: {skipped}")
    return applied


def _load_keras(config: TestConfig):
    import keras   # standalone Keras 3 — bypasses the broken tensorflow.keras shim
    try:
        return keras.models.load_model(config.model_path)
    except Exception as first_error:
        # Only malaria is known to need this fallback — but trying it
        # generically for any classify model that fails plain load is
        # harmless: if the architecture doesn't match, it'll raise its
        # own clear error rather than silently doing the wrong thing.
        try:
            candidate = _build_malaria_architecture()
            _load_malaria_weights_by_shape(candidate, config.model_path)
            return candidate
        except Exception as fallback_error:
            raise RuntimeError(
                f"Normal load failed: {first_error}\n"
                f"Shape-matched fallback also failed: {fallback_error}"
            )


def _load_yolo(config: TestConfig):
    from ultralytics import YOLO
    return YOLO(config.model_path)


def _load_one(key: str, config: TestConfig):
    try:
        if config.kind == 'classify':
            model = _load_keras(config)
        else:
            model = _load_yolo(config)
        return model, None
    except FileNotFoundError as e:
        return None, f"Model file not found at '{config.model_path}': {e}"
    except Exception as e:
        return None, f"Load failed: {e}"


def _load_all():
    for key, config in REGISTRY.items():
        model, error = _load_one(key, config)
        _loaded[key] = {"model": model, "error": error}
        status = "✓ loaded" if model is not None else f"✗ {error}"
        print(f"[ai-service] {key}: {status}")


_load_all()


@app.get("/")
def root():
    return {"message": "MediCore AI Screening service is running", "configured_tests": list(REGISTRY.keys())}


@app.get("/models")
def list_models():
    return {
        key: {
            "loaded": _loaded[key]["model"] is not None,
            "error": _loaded[key]["error"],
            "kind": cfg.kind,
            "specimen": cfg.specimen,
            "classes": cfg.classes,
        }
        for key, cfg in REGISTRY.items()
    }


# ══════════════════════════════════════════════════════════════════
# Route order fixed to match what the frontend actually calls —
# confirmed directly from the 404'd request in the server log:
# GET /health/malaria, not GET /malaria/health.
# ══════════════════════════════════════════════════════════════════
@app.get("/health/{test_type}")
def health(test_type: str):
    if test_type not in REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown test_type '{test_type}'. See /models.")
    entry = _loaded[test_type]
    config = get_config(test_type)
    return {
        "status": "ok",
        "model_loaded": entry["model"] is not None,
        "kind": config.kind,
        "detail": entry["error"],
    }


@app.post("/reload/{test_type}")
def reload_model(test_type: str):
    if test_type not in REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown test_type '{test_type}'. See /models.")
    model, error = _load_one(test_type, REGISTRY[test_type])
    _loaded[test_type] = {"model": model, "error": error}
    return {"model_loaded": model is not None, "detail": error}


@app.post("/predict/{test_type}")
async def predict(test_type: str, file: UploadFile = File(...)):
    if test_type not in REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown test_type '{test_type}'. See /models.")
    config = REGISTRY[test_type]
    entry = _loaded[test_type]
    if entry["model"] is None:
        raise HTTPException(status_code=503, detail=entry["error"] or "Model not loaded.")

    raw = await file.read()
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image — upload a JPEG or PNG.")


    try:
        if config.kind == "classify":
            return _predict_classify(entry["model"], config, img)
        else:
            return _predict_detect(entry["model"], config, img)
    except Exception:
        traceback.print_exc()
        raise


def _predict_classify(model, config: TestConfig, img: Image.Image):
    resized = img.resize((config.crop_size, config.crop_size))
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)
    raw_pred = model.predict(arr, verbose=0)
    score = float(raw_pred[0][0]) if raw_pred.ndim == 2 else float(raw_pred[0])

        # Reverse the malaria mapping
    if config.model_path.endswith("malaria-cnn-v1.keras"):
        if score < 0.5:
            label = "infected"
            confidence = 1 - score
        else:
            label = "uninfected"
            confidence = score
    else:
        idx = 1 if score > 0.5 else 0
        label = config.classes[idx]
        confidence = score if idx == 1 else (1 - score)

    return {
        "label": label,
        "confidence": round(confidence, 4),
        "raw_score": round(score, 4),
        "advisory_only": True,
        "note": "AI suggestion only — a lab scientist must confirm before this is recorded.",
    }


def _predict_detect(model, config: TestConfig, img: Image.Image):
    results = model.predict(np.array(img), conf=config.confidence_threshold, verbose=False)[0]
    boxes = results.boxes
    count = len(boxes)
    detections = []
    for box in boxes:
        cls_idx = int(box.cls[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        detections.append({
            "class": config.classes[cls_idx],
            "confidence": round(float(box.conf[0]), 4),
            "box": [x1, y1, x2, y2],
        })
    return {
        "label": "positive" if count > 0 else config.classes[0],
        "count": count,
        "detections": detections,
        "advisory_only": True,
        "note": "AI suggestion only — a lab scientist must confirm before this is recorded.",
    }