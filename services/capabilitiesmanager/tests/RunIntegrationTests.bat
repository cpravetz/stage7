@echo off
REM Integration Tests Only
REM Runs only integration tests

if not exist pytest.ini (
    echo Error: pytest.ini not found. Please run from services/capabilitiesmanager/tests/
    exit /b 1
)

echo.
echo Installing test dependencies...
pip install -q -r requirements-test.txt

echo.
echo ============================================================
echo Running Integration Tests
echo ============================================================
echo.

pytest integration/ -m integration -v

echo.
echo ============================================================
echo Integration tests completed!
echo ============================================================
echo.
pause
