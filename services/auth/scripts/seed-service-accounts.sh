#!/bin/sh
# Seed the documents API service accounts into the auth service.
#
# The artifacts documents router requires a bearer token; internal callers
# exchange SERVICE_AUTH_ID / SERVICE_API_KEY (see .env.example) for a service
# token at runtime. This script registers the matching accounts with auth.
# Re-seeding an existing account is refused by auth and ignored here, so the
# script is safe to run on every stack start. An account is only seeded when
# its API key is non-empty: an empty key would make auth generate a random one
# the caller could never match.
set -e

AUTH_URL="${AUTH_URL:-http://auth:4300}"

until curl -sf "$AUTH_URL/api/auth/health" >/dev/null 2>&1; do
  sleep 2
done

seed() {
  name="$1"
  service_id="$2"
  api_key="$3"
  if [ -z "$api_key" ]; then
    echo "auth-bootstrap: $service_id API key is empty; skipping seed"
    return 0
  fi
  curl -s -o /dev/null -X POST "$AUTH_URL/api/auth/services" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"serviceId\":\"$service_id\",\"apiKey\":\"$api_key\"}" || true
}

seed Brain "$BRAIN_SERVICE_AUTH_ID" "$BRAIN_SERVICE_API_KEY"
seed Temporal "$TEMPORAL_SERVICE_AUTH_ID" "$TEMPORAL_SERVICE_API_KEY"
seed ToolExecutor "$TOOL_EXECUTOR_SERVICE_AUTH_ID" "$TOOL_EXECUTOR_SERVICE_API_KEY"

echo "auth-bootstrap: service account seeding complete"
