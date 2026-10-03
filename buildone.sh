#!/usr/bin/env bash
# buildone.sh - rebuild and restart one Stage7 service, or the whole stack.
#
# This is the everyday iteration script. Unlike setup.sh it does not tear the
# stack down first, so a single-service rebuild does not take the other eleven
# containers offline. Use ./setup.sh for a from-scratch run.
#
# Usage:
#   ./buildone.sh                        # build every image, then start/recreate all
#   ./buildone.sh gateway                # build and recreate just gateway
#   ./buildone.sh tool-executor --no-cache
#   ./buildone.sh --assistants=cto,hr worker-pool
#   ./buildone.sh --down                 # stop and remove all containers
#
# Options:
#   --no-cache             pass --no-cache to the build
#   --assistants=<ids>     comma-separated assistant IDs, exported as
#                          STAGE7_ASSISTANTS for both the build and the start.
#                          Only worker-pool is pruned by its build, so rebuild
#                          worker-pool to actually shrink the image.
#   --down                 run "docker compose down --remove-orphans" and exit
#   -h, --help             show this help
#
# Service names come from docker-compose.yaml. There are no Compose profiles.
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
}

SERVICE=""
BUILD_EXTRA=""
SELECTED_ASSISTANTS=""
DO_DOWN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-cache)
      BUILD_EXTRA="--no-cache"
      shift
      ;;
    --assistants=*)
      SELECTED_ASSISTANTS="${1#--assistants=}"
      shift
      ;;
    --down)
      DO_DOWN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "buildone.sh: unknown option '$1' (try --help)" >&2
      exit 2
      ;;
    *)
      if [ -n "$SERVICE" ]; then
        echo "buildone.sh: unexpected argument '$1' (try --help)" >&2
        exit 2
      fi
      SERVICE="$1"
      shift
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "buildone.sh: docker is not on PATH" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "buildone.sh: Docker Compose V2 is required (run 'docker compose version')" >&2
  echo "buildone.sh: the hyphenated 'docker-compose' V1 command is not supported" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "buildone.sh: .env is missing. Copy .env.example to .env first:" >&2
  echo "buildone.sh:   cp .env.example .env" >&2
  exit 1
fi

if [ "$DO_DOWN" -eq 1 ]; then
  echo "==> Stopping and removing containers"
  docker compose down --remove-orphans
  echo "==> Done."
  exit 0
fi

# Compose would report an unknown name as a generic error, so check it here and
# list what is actually available.
VALID_SERVICES="$(docker compose config --services)"
if [ -n "$SERVICE" ] && ! printf '%s\n' "$VALID_SERVICES" | grep -qx "$SERVICE"; then
  echo "buildone.sh: unknown service '$SERVICE'" >&2
  echo "buildone.sh: available services:" >&2
  printf '%s\n' "$VALID_SERVICES" | sed 's/^/  /' >&2
  exit 2
fi

if [ -n "$SELECTED_ASSISTANTS" ]; then
  export STAGE7_ASSISTANTS="$SELECTED_ASSISTANTS"
  echo "==> Assistant selection: STAGE7_ASSISTANTS=$STAGE7_ASSISTANTS"
fi

if [ -n "$SERVICE" ]; then
  echo "==> Building $SERVICE"
  # shellcheck disable=SC2086
  docker compose build $BUILD_EXTRA "$SERVICE"
  echo "==> Recreating $SERVICE"
  docker compose up -d "$SERVICE"
  echo "==> Done. Logs: docker compose logs -f $SERVICE"
else
  echo "==> Building all service images"
  if [ -n "$BUILD_EXTRA" ]; then
    echo "    (--no-cache: every image will re-run npm install, this takes a while)"
  fi
  # shellcheck disable=SC2086
  docker compose build $BUILD_EXTRA
  echo "==> Starting and recreating all services"
  docker compose up -d
  echo "==> Done. Status: docker compose ps"
fi
