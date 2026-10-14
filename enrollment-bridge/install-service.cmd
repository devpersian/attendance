@echo off
rem install-service.cmd - one double-click entry point to register the bridge
rem as a TRUE Windows service (visible in services.msc) via WinSW.
rem Self-elevates: if not admin, it re-launches itself through PowerShell RunAs.

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0winsw.ps1"
if %errorlevel% neq 0 (
  echo.
  echo Installation FAILED. Common causes: no internet access for the WinSW
  echo download, Node.js not on PATH, or .NET Framework 4.x missing.
)
echo.
pause
