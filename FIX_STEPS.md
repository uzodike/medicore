# Production fix — single origin (3 edits + 2 bat files)

## 1. config/settings.py — make FRONTEND_DIST configurable
REPLACE this line (≈line 73):
    FRONTEND_DIST = BASE_DIR.parent.parent / 'frontend' / 'dist'   # adjust if layout differs
WITH:
    from pathlib import Path as _P
    FRONTEND_DIST = _P(config('FRONTEND_DIST',
        default=str(BASE_DIR.parent.parent / 'frontend' / 'dist')))

## 2. backend .env — add/confirm these lines
    FRONTEND_DIST=C:\Users\computer world\Downloads\files\medicore_frontend_updated1\frontend\dist
    ALLOWED_HOSTS=localhost,127.0.0.1,daibi-hillsmedicalcentre.online
    CSRF_TRUSTED_ORIGINS=https://daibi-hillsmedicalcentre.online
    FRONTEND_URL=https://daibi-hillsmedicalcentre.online
    DEBUG=False

## 3. Cloudflare config — replace %USERPROFILE%\.cloudflared\config.yml
with the config.yml in this kit (root domain → 8080 ONLY; no :3000, no api
subdomain needed — same origin means no CORS, and the api. DNS record can be
deleted or left unused).

## Then run deploy_medicore.bat (full rebuild + start) — afterwards day-to-day
## you only need start_medicore.bat unless code changed.

## Verify (in order):
1. https://daibi-hillsmedicalcentre.online loads WITHOUT npm run dev running
   (kill the Vite terminal — production must not depend on it!)
2. Login → register patient → patient name appears in Appointments search
3. F12 → Application → Service Workers → Unregister once → Ctrl+Shift+R
   (evicts the bundle cached from the old :3000 origin)
