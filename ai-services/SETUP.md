# Malaria AI Screening — Phase 1 setup

## What this is (and isn't)
A REAL, working system for advisory malaria cell screening: upload one
cropped blood-cell image, get an AI suggestion, a lab scientist confirms or
overrides before anything counts. It does NOT touch the official LabOrder
result automatically — that stays a manual, human action in your existing
Results & Upload flow, exactly as before.

**It ships today with no trained model.** I can't download the NIH dataset
or train weights in my sandbox (no internet access to Kaggle/datasets).
Every other piece — service, database, API, UI — is real and complete; it
just has nothing to predict with until you supply `malaria-cnn-v1.keras`.
Until then, `GET /health` reports `model_loaded: false` and the Lab UI
panel honestly shows "AI service unavailable" instead of faking a result.

## 1. Get a trained model (~20 min, free, one-time)
Full steps in `ai-services/malaria/model/README.md` — short version: run your
`malaria-cells-classification-cnn.ipynb` on Kaggle with a free GPU, download
the resulting `.keras` file, place it at
`ai-services/malaria/model/malaria-cnn-v1.keras`.

## 0. Before you start: Python version matters here
This service needs its OWN Python — TensorFlow does not support very new
Python versions (3.13/3.14). The rewritten `start_malaria_ai.bat` finds a
compatible one (3.10/3.11/3.12) automatically via the Windows `py` launcher,
completely separate from whatever Python your Django backend uses. If none
of those are installed, it will tell you clearly and the window will STAY
OPEN so you can read the message (earlier version closed instantly on error
— fixed). Install Python 3.11 from python.org if prompted, then re-run.

## 1. Threshold: run this in your Kaggle notebook first
`threshold_sweep_cell.py` in this zip — paste it into a new cell after your
evaluation cell (it reuses `val_preds`/`val_true` you already computed).
It shows the false-negative/false-positive tradeoff at several cutoffs so
you pick a threshold based on evidence, not a guess. Once you have a number
you're comfortable with, set it via env var when starting the service:
    set MALARIA_UNINFECTED_THRESHOLD=0.65
    start_malaria_ai.bat
(Default is 0.65 if you don't set this — biased toward catching more real
infections at the cost of more false alarms, which is the safer direction
for a screening tool, but your own sweep is the real answer.)

## 2. Install the inference service
    cd ai-services/malaria
    (double-click) start_malaria_ai.bat
This creates a venv, installs FastAPI + TensorFlow-CPU, and starts the
service on http://127.0.0.1:8090. Leave this running alongside Daphne —
it's a separate process on purpose, so TensorFlow's memory never fights
Postgres/Daphne/your Vite build on the same laptop.

Verify: open http://127.0.0.1:8090/health in a browser.
  - No model yet → {"model_loaded": false, "detail": "No model file at ..."}
  - Model in place → {"model_loaded": true, "detail": null}

## 3. Wire it into Django
- Copy `django_app/*.py` and `django_app/migrations/` into
  `apps/malaria_ai/` (create the folder).
- Add to `config/settings.py`:
    INSTALLED_APPS += ['apps.malaria_ai']
    MALARIA_AI_URL = config('MALARIA_AI_URL', default='http://127.0.0.1:8090')
- Add to `config/urls.py`:
    path('api/v1/malaria-ai/', include('apps.malaria_ai.urls')),
- Add to your `requirements.txt`: `requests` (if not already there — Django
  uses it to call the microservice).
- Run:
    python manage.py makemigrations malaria_ai
    python manage.py migrate
- Restart Daphne.

## 4. Wire the panel into the Lab page
`MalariaCellScreen.jsx` → `src/components/lab/`
`malariaAI.js` → `src/api/`

In `LabPage.jsx`, wherever a malaria-microscopy order is open (Results &
Upload tab, or the order detail view), add:

    import MalariaCellScreen from '../../components/lab/MalariaCellScreen'
    ...
    <MalariaCellScreen
        patientId={order.patient}
        patientName={order.patient_name}
        labOrderId={order.id}
    />

Tell me the exact component/line where malaria orders render in your
current LabPage.jsx and I'll wire this in precisely rather than you
guessing the insertion point.

## 5. Production (Cloudflare deployment)
The AI service only needs to be reachable from Django, not the internet —
keep `MALARIA_AI_URL=http://127.0.0.1:8090` in production too; it never
needs a tunnel or public exposure. Add it to `start_medicore.bat` as a
third window, same pattern as Daphne + cloudflared.

## What "Phase 1" deliberately does NOT do yet
- Whole-slide/field photos (many cells + debris) — needs a segmentation
  step first (Phase 2), or staff crop to one cell before uploading.
- Auto-filling the official LabOrder result — by design; a human always
  finalizes results through the existing flow.
- Any diagnosis claim — this is screening/triage support only.
