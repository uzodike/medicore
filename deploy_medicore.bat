@echo off
REM ════ MediCore FULL DEPLOY: build frontend → collectstatic → start ════
set FRONTEND=C:\Users\computer world\Downloads\files\medicore_frontend_updated1\frontend
set BACKEND=C:\Users\computer world\Downloads\files\medicore_backendandfrontend_updated\backend\medicore
set VENV=C:\Users\computer world\Downloads\files\medicore_env

echo [1/4] Building frontend...
cd /d "%FRONTEND%"
set NODE_OPTIONS=--max-old-space-size=2048
call npm run build
if errorlevel 1 ( echo BUILD FAILED — fix errors above & pause & exit /b 1 )

echo [2/4] Collecting static files...
cd /d "%BACKEND%"
call "%VENV%\Scripts\activate.bat"
python manage.py collectstatic --noinput

echo [3/4] Applying migrations...
python manage.py migrate

echo [4/4] Starting services...
call "%~dp0start_medicore.bat"