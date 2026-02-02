@echo off
REM Category Test Runner
REM Runs tests for a specific plugin category

if not exist pytest.ini (
    echo Error: pytest.ini not found. Please run from services/capabilitiesmanager/tests/
    exit /b 1
)

if "%1"=="" (
    echo.
    echo Usage: RunCategory ^<category^>
    echo.
    echo Available categories:
    echo   finance       - Finance plugins
    echo   healthcare    - Healthcare plugins
    echo   legal         - Legal plugins
    echo   career        - Career plugins
    echo   operations    - Hotel/Restaurant/Event operations
    echo   cloud         - Cloud integrations
    echo   communications - Communication plugins
    echo.
    exit /b 1
)

echo.
echo Installing test dependencies...
pip install -q -r requirements-test.txt

echo.
echo ============================================================
echo Running %1 Tests
echo ============================================================
echo.

pytest -m %1 -v

echo.
echo ============================================================
echo Category test run completed!
echo ============================================================
echo.
pause
