@echo off
setlocal enabledelayedexpansion

echo.
echo 🔍 Checking for running processes...
echo.

set SERVER_PORT=3001
set CLIENT_PORT=3000
set FOUND=0

:: Check if SERVER_PORT is in use
echo Checking port %SERVER_PORT% (Backend Server)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SERVER_PORT% ^| findstr LISTENING') do (
    set PID=%%a
    if !PID! NEQ 0 (
        echo 🛑 Killing process !PID! on port %SERVER_PORT%...
        taskkill /PID !PID! /F >nul 2>&1
        set FOUND=1
    )
)

:: Check if CLIENT_PORT is in use
echo Checking port %CLIENT_PORT% (Frontend Client)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CLIENT_PORT% ^| findstr LISTENING') do (
    set PID=%%a
    if !PID! NEQ 0 (
        echo 🛑 Killing process !PID! on port %CLIENT_PORT%...
        taskkill /PID !PID! /F >nul 2>&1
        set FOUND=1
    )
)

echo.
if %FOUND% EQU 1 (
    echo ✅ All processes stopped successfully!
) else (
    echo ℹ️  No processes were running.
)
echo.

endlocal
