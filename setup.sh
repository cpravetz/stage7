#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

# Function to pause script execution and wait for user input
press_any_key_to_continue() {
  echo ""
  read -n 1 -s -r -p "Press any key to continue..."
  echo ""
}

# Function to generate a random secret string
generate_secret() {
  LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 32
}

echo "🚀 Stage7 Setup and Launch Script 🚀"
echo ""
echo "Profile Structure:"
echo "  - NextGen services are the default and always run"
echo "  - All services are managed via Docker Compose"
echo "  - Assistant selection: STAGE7_ASSISTANTS controls which assistants load"
echo "  - Use --assistants to select one, many, or custom assistants"
echo ""

# --- Parse arguments ---
SELECTED_ASSISTANTS=""
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
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# --- 1. Check for Docker and Docker Compose prerequisites ---
echo "Checking prerequisites: Docker and Docker Compose..."
if ! command -v docker &> /dev/null
then
    echo "Docker is not installed. Please install Docker Desktop or Docker Engine:"
    echo "  https://docs.docker.com/get-docker/"
    exit 1
fi
if ! command -v docker compose &> /dev/null
then
    echo "Docker Compose (V2) is not installed. Please install or enable it:"
    echo "  https://docs.docker.com/compose/install/"
    exit 1
fi
echo "Docker and Docker Compose are installed. ✅"

# --- 2. Setup .env file ---
echo ""
echo "Setting up .env file..."
ENV_FILE=".env"
ENV_EXAMPLE_FILE=".env.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "'.env' file not found. Creating from '$ENV_EXAMPLE_FILE'."
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  echo "'.env' created."
else
  echo "'.env' file already exists. Skipping creation."
fi

echo ""
echo "============================================================================"
echo "ACTION REQUIRED: Please review and edit your '.env' file."
echo "----------------------------------------------------------------------------"
echo "  - Open the '.env' file in your preferred text editor."
echo "  - Fill in your API keys (e.g., GROQ_API_KEY) and any other custom settings."
echo "  - Ensure 'SHARED_SECRET' and 'ADMIN_SECRET' are left blank for auto-generation,"
echo "    unless you want to set them manually."
echo "  - Set STAGE7_ASSISTANTS to select specific assistants (optional)."
echo "    Format: comma-separated assistant IDs (e.g., cto,hr)"
echo "    Leave empty to load all assistants."
echo "============================================================================"

# Function to generate a random secret string

# Generate and set SHARED_SECRET if not already set or empty
if grep -q "^SHARED_SECRET=" "$ENV_FILE" && [ -z "$(grep '^SHARED_SECRET=' "$ENV_FILE" | cut -d '=' -f2-)" ]; then
  echo "Generating SHARED_SECRET..."
  GENERATED_SHARED_SECRET=$(generate_secret)
  # Use sed to replace the line, handling potential Windows line endings and ensuring only value is changed
  sed -i '' -e "s/^SHARED_SECRET=.*/SHARED_SECRET=${GENERATED_SHARED_SECRET}/" "$ENV_FILE" 2>/dev/null || \
  sed -i "s/^SHARED_SECRET=.*/SHARED_SECRET=${GENERATED_SHARED_SECRET}/" "$ENV_FILE"
  echo "SHARED_SECRET set in .env"
else
  echo "SHARED_SECRET already set or has a value in .env. Skipping generation."
  GENERATED_SHARED_SECRET=$(grep '^SHARED_SECRET=' "$ENV_FILE" | cut -d '=' -f2-)
fi

# Generate and set ADMIN_SECRET if not already set or empty
if grep -q "^ADMIN_SECRET=" "$ENV_FILE" && [ -z "$(grep '^ADMIN_SECRET=' "$ENV_FILE" | cut -d '=' -f2-)" ]; then
  echo "Generating ADMIN_SECRET..."
  GENERATED_ADMIN_SECRET=$(generate_secret)
  sed -i '' -e "s/^ADMIN_SECRET=.*/ADMIN_SECRET=${GENERATED_ADMIN_SECRET}/" "$ENV_FILE" 2>/dev/null || \
  sed -i "s/^ADMIN_SECRET=.*/ADMIN_SECRET=${GENERATED_ADMIN_SECRET}/" "$ENV_FILE"
  echo "ADMIN_SECRET set in .env"
else
  echo "ADMIN_SECRET already set or has a value in .env. Skipping generation."
fi

echo ".env file setup complete. ✅"

# --- Interactive assistant selection if not provided via CLI ---
if [ -z "$SELECTED_ASSISTANTS" ]; then
  echo ""
  echo "============================================================================"
  echo "Assistant Selection"
  echo "============================================================================"
  echo "You can select which assistants to deploy:"
  echo "  1) All assistants (default - leave empty)"
  echo "  2) Specific assistants by ID (comma-separated)"
  echo "     Example: cto,hr"
  echo ""
  echo "Available assistant IDs from canonical catalog:"
  awk '/definition\(/{gsub(/.*'\''/,""); gsub(/'\''.*/,""); id=$0; getline; name=$0; gsub(/.*'\''/,""); gsub(/'\''.*/,""); print "    - " id " (" name ")"}' "$ENV_EXAMPLE_FILE" 2>/dev/null || true
  echo "    (Run with --assistants=<id1,id2,...> or edit STAGE7_ASSISTANTS in .env)"
  echo "============================================================================"
  read -p "Enter STAGE7_ASSISTANTS value (or press Enter for all): " SELECTED_ASSISTANTS
fi

# Update .env with selected assistants
if [ -n "$SELECTED_ASSISTANTS" ]; then
  if grep -q "^STAGE7_ASSISTANTS=" "$ENV_FILE"; then
    sed -i '' -e "s/^STAGE7_ASSISTANTS=.*/STAGE7_ASSISTANTS=${SELECTED_ASSISTANTS}/" "$ENV_FILE" 2>/dev/null || \
    sed -i "s/^STAGE7_ASSISTANTS=.*/STAGE7_ASSISTANTS=${SELECTED_ASSISTANTS}/" "$ENV_FILE"
  else
    echo "STAGE7_ASSISTANTS=${SELECTED_ASSISTANTS}" >> "$ENV_FILE"
  fi
  echo "STAGE7_ASSISTANTS set to: $SELECTED_ASSISTANTS"
else
  if grep -q "^STAGE7_ASSISTANTS=" "$ENV_FILE"; then
    sed -i '' -e "s/^STAGE7_ASSISTANTS=.*/STAGE7_ASSISTANTS=/" "$ENV_FILE" 2>/dev/null || \
    sed -i "s/^STAGE7_ASSISTANTS=.*/STAGE7_ASSISTANTS=/" "$ENV_FILE"
  fi
  echo "STAGE7_ASSISTANTS cleared (all assistants will load)"
fi

# --- 3. Tear down any old / orphan containers before rebuilding ---
echo ""
echo "Tearing down previous deployment (if any) to free ports and remove orphans..."
docker compose down --remove-orphans --timeout 30 || echo "Warning: docker compose down returned a non-zero exit code. Continuing."

# --- 4. Build Docker images ---
echo ""
echo "Building Docker images..."
if ! docker compose build --no-cache; then
    echo "Error: Docker compose build failed."
    exit 1
fi
echo "Docker images built. ✅"

# --- 5. Start services ---
echo ""
echo "--- Starting Stage7 Services ---"
echo "Initiating Docker Compose..."

# The --wait flag ensures Docker Compose waits for services to be healthy
# The --timeout flag specifies how long to wait for containers to become healthy (300 seconds)
COMPOSE_COMMAND="docker compose up -d --wait --timeout 300"

$COMPOSE_COMMAND

# Check if docker compose failed
if [ $? -ne 0 ]; then
  echo "Error: Docker compose up failed."
  echo "Tip: Check container logs with 'docker compose logs <service-name>' for more details."
  exit 1
fi

echo ""
echo "Stage7 setup and launch complete! 🎉"
echo "Access the frontend at http://localhost"
echo ""
echo "--- Debugging Information ---"
echo "To check the status of core services:"
echo "  docker compose ps"
echo ""
echo "To view logs for a specific service (e.g., gateway):"
echo "  docker compose logs -f gateway"
echo "To stop services: docker compose down"
