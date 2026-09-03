@echo off
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\SahamLens Native"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0payload.zip' -DestinationPath '%INSTALL_DIR%' -Force"
start "" /D "%INSTALL_DIR%" "%INSTALL_DIR%\SahamLens.WinUI.exe"
exit /b 0
