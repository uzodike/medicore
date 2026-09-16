# MediCore HMS — Django Backend

Full Hospital Management System backend built with Django 4.2 + DRF + PostgreSQL + Redis + Channels.

---

## Quick Start

### 1. Clone & configure
```bash
git clone <repo>
cd medicore
cp .env.example .env
# Edit .env with your DB credentials and secret key
```

### 2. Run with Docker (recommended)
```bash
docker-compose up --build
docker-compose exec web python manage.py migrate
docker-compose exec web python manage.py createsuperuser
```

### 3. Run locally
```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

---

## Project Structure

```
medicore/
├── config/
│   ├── settings.py          # All Django settings
│   ├── urls.py              # Root URL routing
│   ├── asgi.py              # ASGI + Channels (WebSocket)
│   └── wsgi.py
│
├── core/
│   ├── models.py            # TimeStampedModel (abstract base)
│   ├── permissions.py       # Role-based permission classes
│   ├── pagination.py        # Standard paginator
│   └── utils.py             # ID generators
│
├── apps/
│   ├── accounts/            # Custom User model, JWT Auth
│   ├── patients/            # Patient + Medical History
│   ├── appointments/        # OPD scheduling & queue
│   ├── telemedicine/        # Sessions, WebSocket, e-Rx
│   ├── billing/             # Invoices, payments
│   ├── pharmacy/            # Drugs, prescriptions
│   ├── lab/                 # Orders, results
│   ├── nursing/             # Vitals, MAR
│   └── ipd/                 # Wards, beds, admissions
│
├── manage.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## User Roles & Permissions

| Role           | Key Access                                              |
|----------------|--------------------------------------------------------|
| `admin`        | Full access to all modules                              |
| `doctor`       | Workbench, prescriptions, lab orders, tele sessions    |
| `nurse`        | Vitals, MAR, triage, nursing notes                     |
| `receptionist` | Patient reg, appointments, billing                     |
| `pharmacist`   | Drug inventory, dispensing                             |
| `lab_tech`     | Lab orders, results entry                              |
| `radiologist`  | Radiology reports                                      |
| `patient`      | Own records, tele sessions                             |

---

## API Endpoints

### Authentication — `/api/v1/auth/`
| Method | Endpoint              | Description              | Permission  |
|--------|-----------------------|--------------------------|-------------|
| POST   | `login/`              | Get JWT access + refresh | Public      |
| POST   | `logout/`             | Blacklist refresh token  | Authenticated |
| POST   | `token/refresh/`      | Get new access token     | Public      |
| POST   | `register/`           | Create staff user        | Admin only  |
| GET    | `me/`                 | Current user profile     | Authenticated |
| PATCH  | `me/`                 | Update profile           | Authenticated |
| GET    | `users/`              | List all users           | Admin only  |
| POST   | `change-password/`    | Change own password      | Authenticated |

### Patients — `/api/v1/patients/`
| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/`                               | List patients (paginated)|
| POST   | `/`                               | Register new patient     |
| GET    | `/{patient_id}/`                  | Patient detail           |
| PATCH  | `/{patient_id}/`                  | Update patient           |
| DELETE | `/{patient_id}/`                  | Soft delete              |
| GET    | `/{patient_id}/history/`          | Medical history          |
| PATCH  | `/{patient_id}/history/`          | Update medical history   |

### Appointments — `/api/v1/appointments/`
| Method | Endpoint        | Description                   |
|--------|-----------------|-------------------------------|
| GET    | `/`             | List (filtered by role)       |
| POST   | `/`             | Book appointment              |
| GET    | `/{id}/`        | Appointment detail            |
| PATCH  | `/{id}/`        | Update status / triage        |
| GET    | `today/`        | Today's appointments          |

### Telemedicine — `/api/v1/telemedicine/`
| Method | Endpoint                    | Description                      |
|--------|-----------------------------|----------------------------------|
| GET    | `/`                         | All sessions                     |
| POST   | `/`                         | Schedule session                 |
| GET    | `/{id}/`                    | Session detail + messages        |
| PATCH  | `/{id}/`                    | Update session                   |
| POST   | `/{id}/start/`              | Mark live, return room_name      |
| POST   | `/{id}/end/`                | End session, save notes          |
| GET    | `live/`                     | Active live sessions             |
| GET    | `/{id}/messages/`           | Session chat history             |
| POST   | `/{id}/messages/`           | Send chat message                |
| GET    | `eprescriptions/`           | Doctor's e-prescriptions         |
| POST   | `eprescriptions/`           | Issue e-prescription             |

### Billing — `/api/v1/billing/`
| Method | Endpoint        | Description               |
|--------|-----------------|---------------------------|
| GET    | `/`             | Invoice list              |
| POST   | `/`             | Create invoice + items    |
| GET    | `/{id}/`        | Invoice detail            |
| POST   | `/{id}/pay/`    | Post payment              |

### Pharmacy — `/api/v1/pharmacy/`
| Method | Endpoint              | Description          |
|--------|-----------------------|----------------------|
| GET    | `drugs/`              | Drug inventory       |
| POST   | `drugs/`              | Add drug             |
| PATCH  | `drugs/{id}/`         | Update stock/price   |
| GET    | `drugs/low-stock/`    | Below reorder level  |
| GET    | `prescriptions/`      | All prescriptions    |
| POST   | `prescriptions/`      | Create prescription  |

### Lab — `/api/v1/lab/`
| Method | Endpoint          | Description           |
|--------|-------------------|-----------------------|
| GET    | `tests/`          | Lab test catalogue    |
| GET    | `orders/`         | Lab orders            |
| POST   | `orders/`         | Create order          |
| PATCH  | `orders/{id}/`    | Update status/results |

### Nursing — `/api/v1/nursing/`
| Method | Endpoint    | Description          |
|--------|-------------|----------------------|
| GET    | `vitals/`   | Vitals history       |
| POST   | `vitals/`   | Record vitals        |
| GET    | `mar/`      | Medication admin log |
| POST   | `mar/`      | Record administration|

### IPD — `/api/v1/ipd/`
| Method | Endpoint              | Description         |
|--------|-----------------------|---------------------|
| GET    | `wards/`              | All wards           |
| GET    | `beds/`               | Beds (filter by ward/status) |
| GET    | `admissions/`         | Active admissions   |
| POST   | `admissions/`         | Admit patient       |
| PATCH  | `admissions/{id}/`    | Discharge / transfer|
| GET    | `availability/`       | Bed counts per ward |

---

## WebSocket — Real-time Telemedicine

Connect to:
```
ws://localhost:8000/ws/tele/{room_name}/
```

Supported message types:
```json
{ "type": "offer",          "sdp": "..." }
{ "type": "answer",         "sdp": "..." }
{ "type": "ice-candidate",  "candidate": "..." }
{ "type": "chat",           "message": "Hello" }
{ "type": "mute",           "muted": true }
{ "type": "video-toggle",   "enabled": false }
```

---

## Database (PostgreSQL)

Key tables and relationships:

```
users ──────────────────────────────────────────────────┐
  id, email, role, first_name, last_name, department     │
                                                          │
patients ◄──────────────────────────────────────────────┘
  id, patient_id (PT-2024-XXXXXX), dob, blood_group      │
  └─► medical_histories (1:1)                            │
  └─► appointments ──────────────────────► users(doctor) │
  └─► tele_sessions ─────────────────────► users(doctor) │
  │     └─► session_messages                             │
  │     └─► eprescriptions                               │
  └─► invoices                                           │
  │     └─► invoice_items                                │
  └─► prescriptions ─────────────────────► drugs         │
  │     └─► prescription_items                           │
  │           └─► medication_administrations (MAR)       │
  └─► lab_orders ────────────────────────► lab_tests     │
  │     └─► lab_order_items (results)                    │
  └─► vital_records                                      │
  └─► admissions ────────────────────────► beds          │
                                               └─► wards │
```

---

## Running Tests
```bash
python manage.py test apps.accounts apps.patients apps.telemedicine
```

## API Documentation
Visit `http://localhost:8000/api/docs/` for the full interactive Swagger UI.

---

## Environment Variables (`.env`)

| Variable                          | Default        | Description                    |
|-----------------------------------|----------------|--------------------------------|
| `SECRET_KEY`                      | —              | Django secret key              |
| `DEBUG`                           | `True`         | Debug mode                     |
| `DB_NAME`                         | `medicore_db`  | PostgreSQL database name       |
| `DB_USER`                         | `medicore_user`| PostgreSQL user                |
| `DB_PASSWORD`                     | —              | PostgreSQL password            |
| `DB_HOST`                         | `localhost`    | PostgreSQL host                |
| `REDIS_URL`                       | `redis://...`  | Redis for Channels + Celery    |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | `60`         | Access token expiry            |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS`   | `7`          | Refresh token expiry           |
| `EMAIL_HOST_USER`                 | —              | SMTP sender email              |
| `EMAIL_HOST_PASSWORD`             | —              | SMTP app password              |

