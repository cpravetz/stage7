#!/bin/bash
# buildone.sh - Bash equivalent of buildone.bat
# Tears down, builds (optionally a specific service), and starts containers in detached mode.
#
# Usage:
#   ./buildone.sh              # Rebuild and restart all services
#   ./buildone.sh <service>    # Rebuild and restart a specific service (e.g., postoffice)
#
set -e

# Navigate to the script's directory (project root)
cd "$(dirname "$0")"

# Profiles must be specified so Docker Compose includes profile-gated services.
# See docker-compose.yaml: infrastructure services (mongo, redis, rabbitmq, ...) have no
# profile; core services have "core"; assistant services have "assistants".
COMPOSE_PROFILES="--profile core --profile assistants"

# Optional service name argument (passed to "docker compose build")
SERVICE_ARG="${1:-}"

echo "==> Stopping and removing containers..."
docker compose $COMPOSE_PROFILES down

echo "==> Building Docker images..."
if [ -n "$SERVICE_ARG" ]; then
    echo "    (target: $SERVICE_ARG)"
    docker compose $COMPOSE_PROFILES build "$SERVICE_ARG"
else
    docker compose $COMPOSE_PROFILES build
fi

echo "==> Starting containers..."
docker compose $COMPOSE_PROFILES up -d

echo "==> Done."
