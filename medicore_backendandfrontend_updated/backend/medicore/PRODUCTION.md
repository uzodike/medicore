# MediCore HMS — Production on Your Laptop (Cloudflare Tunnel)

## Architecture
ONE port does everything: Daphne (:8080) serves the API, the telemedicine
WebSockets, AND the built React frontend. Cloudflare Tunnel exposes that one
port to the internet over HTTPS — no router/port-forwarding, laptop stays
behind NAT. HTTPS from Cloudflare unlocks PWA install + camera/mic on phones
with zero browser flags.

## 1. Database (PostgreSQL you installed)
In pgAdmin or psql:
    CREATE DATABASE medicore_domizion;
    CREATE USER medicore WITH PASSWORD '<strong-password>';
    GRANT ALL PRIVILEGES ON DATABASE medicore_domizion TO medicore;
Update backend .env: DB_NAME=medicore_domizion, DB_USER=medicore, DB_PASSWORD=...
Then:  python manage.py migrate  &&  python manage.py createsuperuser

## 2. Backend production .env
    DEBUG=False
    SECRET_KEY=<generate: python -c "import secrets;print(secrets.token_urlsafe(64))">
    ALLOWED_HOSTS=localhost,127.0.0.1,<your-tunnel-hostname>
    CSRF_TRUSTED_ORIGINS=https://<your-tunnel-hostname>
    FRONTEND_URL=https://<your-tunnel-hostname>
(With a quick tunnel the hostname changes every run — see §5. With a domain
it is fixed, e.g. domizion.medicore.ng.)

## 3. Apply the kit
- settings_production_additions.py → paste blocks into config/settings.py
  (whitenoise middleware line, frontend-dist static config, security block, media)
- urls_additions.py → bottom of config/urls.py (media + SPA catch-all)
- teleRTC_patch.txt → edit frontend/src/lib/teleRTC.js
- pip install whitenoise

## 4. Build the frontend
    cd frontend
    (in .env REMOVE/blank VITE_API_URL and VITE_TELE_WS_URL — relative URLs in prod)
    npm run build
Then:  python manage.py collectstatic --noinput

## 5. Cloudflare
Install cloudflared (winget install Cloudflare.cloudflared).
NO DOMAIN YET (demo mode):
    cloudflared tunnel --url http://localhost:8080
  → gives a random https://xxxx.trycloudflare.com. Works fully (HTTPS, PWA,
    camera, WebSockets) BUT the URL changes every restart and carries no SLA.
    Fine for the Domizion demo; NOT for go-live.
WITH A DOMAIN (recommended, ~₦15k/yr for a .com.ng / $10 .com):
    1. Add domain to Cloudflare (free plan), point nameservers.
    2. cloudflared tunnel login
    3. cloudflared tunnel create medicore
    4. cloudflared tunnel route dns medicore domizion.yourdomain.com
    5. Config file %USERPROFILE%\.cloudflared\config.yml:
         tunnel: medicore
         credentials-file: <printed on create>
         ingress:
           - hostname: domizion.yourdomain.com
             service: http://localhost:8080
           - service: http_status:404
    6. cloudflared tunnel run medicore   (stable URL forever)
    7. cloudflared service install       (runs on boot)

## 6. Run it
Double-click start_medicore.bat (edit venv path inside if different).
Set Windows power settings: never sleep on AC; daphne+cloudflared auto-start
via 'cloudflared service install' + Task Scheduler for the bat (At log on).

## 7. MULTI-HOSPITAL ISOLATION — read this part carefully
The current schema has NO hospital/tenant column — every table assumes ONE
hospital. If two hospitals shared one database today, each would see the
other's patients. Until that changes, isolation = SEPARATE INSTANCES:

  Per hospital: its own Postgres DATABASE (medicore_domizion, medicore_xyz),
  its own .env, its own Daphne port (8080, 8081, ...), its own tunnel
  hostname (domizion.yourdomain.com, xyz.yourdomain.com).

This is genuinely the strongest isolation possible (physical, not logical —
a bug can never leak across databases), it's how many HMS vendors actually
run small clients, and one laptop comfortably runs 2–3 instances. Copy the
bat file per hospital with its port.

When you outgrow this (5+ hospitals), the proper upgrade is django-tenants
(one codebase, one Postgres, schema-per-hospital, hospital resolved from the
subdomain). That's a real project — say the word when you're there.

## 8. Go-live checklist
[ ] DEBUG=False (verify: a bad URL shows a plain 404, not a yellow traceback)
[ ] All seeded/demo passwords rotated; delete demo patients
[ ] python manage.py check --deploy  → fix anything it flags
[ ] Backups: schedule nightly  pg_dump -U medicore medicore_domizion > backup_%date%.sql
    (Task Scheduler) + copy to a USB drive or cloud weekly. A hospital's data
    on one laptop with no backup is the single biggest risk in this setup.
[ ] UPS / power plan for the laptop (NEPA is part of your threat model)
[ ] Test from a phone on mobile data: login, video call, PWA install
