@echo off
REM ============================================================================
REM buildone.bat - rebuild and restart one Stage7 service, or the whole stack.
REM
REM This is the everyday iteration script. Unlike setup.bat it does not tear the
REM stack down first, so a single-service rebuild does not take the other eleven
REM containers offline. Use setup.bat for a from-scratch run.
REM
REM Usage:
REM   buildone.bat                          build every image, then start all
REM   buildone.bat gateway                  build and recreate just gateway
REM   buildone.bat tool-executor --no-cache
REM   buildone.bat --assistants=cto,hr worker-pool
REM   buildone.bat --down                   stop and remove all containers
REM
REM Options:
REM   --no-cache             pass --no-cache to the build
REM   --assistants=<ids>     comma-separated assistant IDs, exported as
REM                          STAGE7_ASSISTANTS for both the build and the start
REM   --down                 run "docker compose down --remove-orphans" and exit
REM   -h, --help             show this help
REM
REM Requires Docker Desktop with Compose V2, invoked as "docker compose" (two
REM words). The retired hyphenated V1 command is not supported.
REM Service names come from docker-compose.yaml. There are no Compose profiles.
REM ============================================================================

setlocal EnableExtensions

pushd "%~dp0"

set "SERVICE="
set "NOCACHE="
set "ASSISTANTS="
set "DO_DOWN="

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="-h" goto usage
if /i "%~1"=="--help" goto usage
if /i "%~1"=="--no-cache" (
  set "NOCACHE=--no-cache"
  shift
  goto parse
)
if /i "%~1"=="--down" (
  set "DO_DOWN=1"
  shift
  goto parse
)
echo "%~1" | findstr /i /b /c:"--assistants=" >nul
if not errorlevel 1 (
  set "ASSISTANTS=%~1"
  shift
  goto parse
)
if defined SERVICE goto too_many_args
set "SERVICE=%~1"
shift
goto parse

:too_many_args
echo buildone.bat: too many arguments, expected at most one service name.
popd
exit /b 2

:usage
findstr /b /c:"REM " "%~f0"
popd
exit /b 0

:parsed
if defined DO_DOWN goto do_down

where docker >nul 2>nul
if errorlevel 1 (
  echo buildone.bat: docker is not on PATH.
  popd
  exit /b 1
)

docker compose version >nul 2>nul
if errorlevel 1 (
  echo buildone.bat: Docker Compose V2 is required. Run "docker compose version".
  echo buildone.bat: the hyphenated docker-compose V1 command is not supported.
  popd
  exit /b 1
)

if not exist ".env" (
  echo buildone.bat: .env is missing. Copy .env.example to .env first:
  echo buildone.bat:   copy .env.example .env
  popd
  exit /b 1
)

REM Compose reports an unknown name as a generic error, so check it here and
REM list what is actually available.
if defined SERVICE goto check_service
if defined ASSISTANTS set "STAGE7_ASSISTANTS=%ASSISTANTS:~13%"
if defined ASSISTANTS echo --- Assistant selection: STAGE7_ASSISTANTS=%STAGE7_ASSISTANTS%
echo --- Building all service images
docker compose build %NOCACHE%
if errorlevel 1 goto build_failed
echo --- Starting and recreating all services
docker compose up -d
goto done

:check_service
docker compose config --services | findstr /x /i /c:"%SERVICE%" >nul
if errorlevel 1 (
  echo buildone.bat: unknown service "%SERVICE%".
  echo buildone.bat: available services:
  docker compose config --services
  popd
  exit /b 2
)
if defined ASSISTANTS set "STAGE7_ASSISTANTS=%ASSISTANTS:~13%"
if defined ASSISTANTS echo --- Assistant selection: STAGE7_ASSISTANTS=%STAGE7_ASSISTANTS%
echo --- Building %SERVICE%
docker compose build %NOCACHE% %SERVICE%
if errorlevel 1 goto build_failed
echo --- Recreating %SERVICE%
docker compose up -d %SERVICE%
goto done

:do_down
echo --- Stopping and removing containers
docker compose down --remove-orphans
if errorlevel 1 (
  popd
  exit /b 1
)
echo --- Done.
popd
exit /b 0

:build_failed
echo buildone.bat: docker compose build failed. Nothing was restarted.
popd
exit /b 1

:done
echo --- Done. Status: docker compose ps
popd
exit /b 0
