@echo off
REM ════ MediCore START: Daphne (API + frontend on :8080) + Cloudflare ════
set BACKEND=C:\Users\computer world\Downloads\files\medicore_backendandfrontend_updated\backend\medicore
set VENV=C:\Users\computer world\Downloads\files\medicore_env
set CFCONFIG=C:\Users\computer world\.cloudflared\configmed.yml

cd /d "%BACKEND%"
start "MediCore Server" cmd /k ""%VENV%\Scripts\activate.bat" && daphne -b 127.0.0.1 -p 8080 config.asgi:application"


timeout /t 4 /nobreak >nul
start "Cloudflare Tunnel" cmd /k cloudflared tunnel --config "%CFCONFIG%" run

echo.
echo  MediCore live at https://daibi-hillsmedicalcentre.online
echo  (Do NOT run npm run dev — production serves the built frontend from Daphne)