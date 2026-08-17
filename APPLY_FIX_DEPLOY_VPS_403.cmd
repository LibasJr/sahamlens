@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FIX_DEPLOY_VPS_403.ps1"
echo.
pause
