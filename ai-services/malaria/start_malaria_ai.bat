@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set LOGFILE=malaria_service.log
set RESTART_COUNT=0

echo ============================================================ >> %LOGFILE%
echo Session started %date% %time% >> %LOGFILE%
echo ============================================================ >> %LOGFILE%

:FIND_PYTHON
set PYEXE=
for %%V in (3.11 3.12 3.10) do (
    if "!PYEXE!"=="" (
        py -%%V -c "print(1)" >nul 2>&1
        if not errorlevel 1 set PYEXE=py -%%V
    )
)
if "%PYEXE%"=="" (
    echo [ERROR] No compatible Python found ^(need 3.10-3.12^).
    pause
    exit /b 1
)

if not exist venv (
    %PYEXE% -m venv venv
    call venv\Scripts\activate.bat
    pip install -q -r requirements_ai_service.txt
) else (
    call venv\Scripts\activate.bat
)

:RUN
echo.
echo [Attempt !RESTART_COUNT!] Starting service on http://127.0.0.1:8090 ...
echo %date% %time% - Starting (attempt !RESTART_COUNT!) >> %LOGFILE%

uvicorn app:app --host 127.0.0.1 --port 8090 >> %LOGFILE% 2>&1

REM ── Capture the REAL exit code immediately — before any other
REM    command (including the echo/log line below) has a chance to
REM    overwrite %errorlevel% with its own exit code instead. This
REM    was the actual bug: the old script checked errorlevel AFTER
REM    an echo line had already reset it to 0, so it reported every
REM    crash as a clean stop and never restarted or showed why.
set UVICORN_EXIT=%errorlevel%

echo %date% %time% - Service stopped/crashed (exit code %UVICORN_EXIT%) >> %LOGFILE%

if %UVICORN_EXIT% equ 0 (
    echo Service was stopped intentionally ^(Ctrl+C^). Not restarting.
    echo %date% %time% - Clean stop, not restarting >> %LOGFILE%
    goto END
)

echo.
echo [CRASH] uvicorn exited with code %UVICORN_EXIT%. Last 20 log lines:
echo ----------------------------------------------------------------
powershell -Command "Get-Content '%LOGFILE%' -Tail 20"
echo ----------------------------------------------------------------

set /a RESTART_COUNT+=1
if !RESTART_COUNT! geq 10 (
    echo.
    echo [ERROR] Crashed 10 times in a row — something is fundamentally
    echo wrong, not a transient issue. See the log excerpt above, or the
    echo full %LOGFILE%, for the real error.
    pause
    exit /b 1
)

echo Service crashed. Restarting in 5 seconds... ^(attempt !RESTART_COUNT! of 10^)
timeout /t 5 /nobreak >nul
goto RUN

:END
pause