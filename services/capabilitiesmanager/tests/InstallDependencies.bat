@echo off
REM Install Dependencies Only
REM Installs all test dependencies without running tests

if not exist requirements-test.txt (
    echo Error: requirements-test.txt not found. Please run from services/capabilitiesmanager/tests/
    exit /b 1
)

echo.
echo ============================================================
echo Installing Test Dependencies
echo ============================================================
echo.

pip install -r requirements-test.txt

echo.
echo ============================================================
echo Installation completed!
echo ============================================================
echo.
echo You can now run:
echo   RunTests.bat              - Run all tests
echo   RunUnitTests.bat          - Run unit tests only
echo   RunIntegrationTests.bat   - Run integration tests only
echo   RunCategory.bat finance   - Run specific category
echo   RunCoverage.bat           - Generate coverage report
echo.
pause
