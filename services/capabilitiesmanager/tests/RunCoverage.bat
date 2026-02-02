@echo off
REM Coverage Report Generator
REM Generates HTML coverage report for all tests

if not exist pytest.ini (
    echo Error: pytest.ini not found. Please run from services/capabilitiesmanager/tests/
    exit /b 1
)

echo.
echo Installing test dependencies...
pip install -q -r requirements-test.txt

echo.
echo ============================================================
echo Generating Coverage Report
echo ============================================================
echo.

pytest --cov=src/plugins --cov-report=html --cov-report=term -v

echo.
echo ============================================================
echo Coverage report generated in htmlcov/index.html
echo ============================================================
echo.
pause
