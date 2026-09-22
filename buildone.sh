#!/bin/bash
# buildone.sh - Bash equivalent of buildone.bat
# Tears down, builds (optionally a specific service), and starts containers in detached mode.
#
# Usage:
#   ./buildone.sh                              # Rebuild and restart all services
#   ./buildone.sh <service>                    # Rebuild and restart a specific service
#   ./buildone.sh --assistants=<id1,id2,...>    # Rebuild with selected assistants
#
set -e

# Navigate to the script's directory (project root)
cd "$(dirname "$0")"

# Parse --assistants flag
SELECTED_ASSISTANTS=""
SERVICE_ARG=""
for arg in "$@"; do
  case "$arg" in
    --assistants=*)
      SELECTED_ASSISTANTS="${arg#--assistants=}"
      shift
      ;;
    --assistants)
      shift
      SELECTED_ASSISTANTS="$1"
      shift
      ;;
    *)
      SERVICE_ARG="$arg"
      shift
      ;;
  esac
done

# Profiles must be specified so Docker Compose includes profile-gated services.
# See docker-compose.yaml: infrastructure services (mongo, redis, rabbitmq, ...) have no
# profile; core services have "core"; assistant services have "assistants".
COMPOSE_PROFILES="--profile core --profile assistants"

echo "==> Stopping and removing containers..."
docker compose $COMPOSE_PROFILES down

echo "==> Building Docker images..."
if [ -n "$SELECTED_ASSISTANTS" ]; then
  echo "    (assistant selection: $SELECTED_ASSISTANTS)"
fi
if [ -n "$SERVICE_ARG" ]; then
  echo "    (target: $SERVICE_ARG)"
  if [ -n "$SELECTED_ASSISTANTS" ]; then
    STAGE7_ASSISTANTS="$SELECTED_ASSISTANTS" docker compose $COMPOSE_PROFILES build "$SERVICE_ARG"
  else
    docker compose $COMPOSE_PROFILES build "$SERVICE_ARG"
  fi
else
  if [ -n "$SELECTED_ASSISTANTS" ]; then
    STAGE7_ASSISTANTS="$SELECTED_ASSISTANTS" docker compose $COMPOSE_PROFILES build
  else
    docker compose $COMPOSE_PROFILES build
  fi
fi

echo "==> Starting containers..."
if [ -n "$SELECTED_ASSISTANTS" ]; then
  STAGE7_ASSISTANTS="$SELECTED_ASSISTANTS" docker compose $COMPOSE_PROFILES up -d
else
  docker compose $COMPOSE_PROFILES up -d
fi

echo "==> Done."
