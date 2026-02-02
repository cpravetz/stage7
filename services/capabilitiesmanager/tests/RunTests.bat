@echo off
REM Capabilities Manager Test Suite Runner
REM This script installs dependencies and runs tests

REM Check if we're in the right directory
if not exist pytest.ini (
    echo Error: pytest.ini not found. Please run this from services/capabilitiesmanager/tests/
    exit /b 1
)

echo.
echo ============================================================
echo Capabilities Manager Test Suite
echo ============================================================
echo.

REM Install test dependencies if not already installed
echo Installing test dependencies...
pip install -q -r requirements-test.txt
if errorlevel 1 (
    echo Error: Failed to install dependencies
    exit /b 1
)
echo Dependencies installed successfully.
echo.

REM Run all tests with verbose output
echo Running all tests...
pytest -v
if errorlevel 1 (
    echo Some tests failed
    exit /b 1
)

echo.
echo ============================================================
echo Test run completed successfully!
echo ============================================================
echo.
echo Optional commands:
echo   pytest -m finance -v              # Finance tests
echo   pytest -m healthcare -v           # Healthcare tests
echo   pytest -m cloud -v                # Cloud tests
echo   pytest --cov=src/plugins --cov-report=html  # Coverage
echo   python test_index.py              # Test index
echo.
pause
