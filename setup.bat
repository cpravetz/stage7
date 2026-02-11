@echo off
REM Stage7 Setup Launcher for Windows
REM This batch file launches the PowerShell setup script

echo Launching Stage7 Setup Script...
echo.

REM Check if PowerShell is available
where powershell >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: PowerShell is not installed or not in PATH.
    echo Please install PowerShell and try again.
    pause
    exit /b 1
)

REM Run the PowerShell script with execution policy bypass
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

REM Keep window open if there was an error
if %ERRORLEVEL% neq 0 (
    echo.
    echo Setup encountered an error. Please check the messages above.
    pause
)
