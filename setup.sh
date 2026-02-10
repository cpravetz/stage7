#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

# Function to pause script execution and wait for user input
press_any_key_to_continue() {
  echo ""
  read -n 1 -s -r -p "Press any key to continue..."
  echo ""
}

echo "🚀 Stage7 Setup and Launch Script 🚀"

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
press_any_key_to_continue

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
echo "============================================================================"
press_any_key_to_continue

# Function to generate a random secret string
generate_secret() {
  LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 32
}

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

# Update assistant-specific secrets to use the SHARED_SECRET if they are empty
echo "Updating assistant-specific secrets in .env if empty..."
ASSISTANT_SECRETS=(
  "PM_ASSISTANT_API_SECRET" "SALES_ASSISTANT_API_SECRET" "MARKETING_ASSISTANT_API_SECRET" "HR_ASSISTANT_API_SECRET"
  "FINANCE_ASSISTANT_API_SECRET" "SUPPORT_ASSISTANT_API_SECRET" "LEGAL_ASSISTANT_API_SECRET" "HEALTHCARE_ASSISTANT_API_SECRET"
  "EDUCATION_ASSISTANT_API_SECRET" "EVENT_ASSISTANT_API_SECRET" "EXECUTIVE_ASSISTANT_API_SECRET" "CAREER_ASSISTANT_API_SECRET"
  "CONTENT_CREATOR_ASSISTANT_API_SECRET" "SONGWRITER_ASSISTANT_API_SECRET" "SCRIPTWRITER_ASSISTANT_API_SECRET"
  "HOTEL_OPS_ASSISTANT_API_SECRET" "RESTAURANT_OPS_ASSISTANT_API_SECRET" "INVESTMENT_ADVISOR_API_SECRET"
  "SPORTS_WAGER_ADVISOR_API_SECRET" "CTO_ASSISTANT_API_SECRET" "PERFORMANCE_ANALYTICS_API_SECRET"
)

for SECRET_VAR in "${ASSISTANT_SECRETS[@]}"; do
  if grep -q "^${SECRET_VAR}=" "$ENV_FILE" && [ -z "$(grep "^${SECRET_VAR}=" "$ENV_FILE" | cut -d '=' -f2-)" ]; then
    sed -i '' -e "s/^${SECRET_VAR}=.*/${SECRET_VAR}=${GENERATED_SHARED_SECRET}/" "$ENV_FILE" 2>/dev/null || \
    sed -i "s/^${SECRET_VAR}=.*/${SECRET_VAR}=${GENERATED_SHARED_SECRET}/" "$ENV_FILE"
    echo "  - ${SECRET_VAR} set to SHARED_SECRET."
  fi
done
echo ".env file setup complete. ✅"
press_any_key_to_continue

# --- 3. Generate RSA keys ---
echo ""
echo "Checking for RSA keys..."
KEYS_DIR="./shared/keys"
PRIVATE_KEY_PATH="${KEYS_DIR}/private.key"
PUBLIC_KEY_PATH="${KEYS_DIR}/public.key"
PUBLIC_PEM_PATH="${KEYS_DIR}/public.pem"

mkdir -p "${KEYS_DIR}"

if [ ! -f "${PRIVATE_KEY_PATH}" ]; then
  echo "Generating RSA private key at ${PRIVATE_KEY_PATH}..."
  openssl genrsa -out "${PRIVATE_KEY_PATH}" 2048
  chmod 600 "${PRIVATE_KEY_PATH}"
  echo "RSA private key generated."
else
  echo "RSA private key already exists. Skipping generation."
fi

if [ ! -f "${PUBLIC_KEY_PATH}" ]; then
  echo "Generating RSA public key at ${PUBLIC_KEY_PATH} from private key..."
  openssl rsa -in "${PRIVATE_KEY_PATH}" -pubout -out "${PUBLIC_KEY_PATH}"
  echo "RSA public key generated."
else
  echo "RSA public key already exists. Skipping generation."
fi

if [ ! -f "${PUBLIC_PEM_PATH}" ]; then
  echo "Generating RSA public PEM key at ${PUBLIC_PEM_PATH} from private key..."
  openssl rsa -in "${PRIVATE_KEY_PATH}" -pubout -outform PEM -out "${PUBLIC_PEM_PATH}"
  echo "RSA public PEM key generated."
else
  echo "RSA public PEM key already exists. Skipping generation."
fi
echo "RSA key setup complete. ✅"
press_any_key_to_continue

# --- 4. Build Docker images ---
echo ""
echo "Building Docker images (this may take a while)..."
docker compose build --no-cache
echo "Docker images built. ✅"
press_any_key_to_continue

# --- 5. Start services ---
echo ""
echo "--- Starting Stage7 Services ---"

COMPOSE_COMMAND="docker compose up -d"
PROFILES_TO_RUN=""
USER_CHOICE=""

while true; do
  echo ""
  echo "Please select a deployment profile:"
  echo "1) Core System (Essential services like PostOffice, MissionControl, Brain, Frontend)"
  echo "2) All Assistants (Requires Core System to be running. Use with option 1 or 3)"
  echo "3) Core System + All Assistants (Recommended for full local development)"
  echo "4) Specific Assistant (You will be prompted to enter the assistant's name)"
  echo "5) Run All Services (Includes infrastructure, core system, and all assistants)"
  echo "Enter your choice (1-5): "
  read -r USER_CHOICE

  case $USER_CHOICE in
    1)
      PROFILES_TO_RUN="--profile core"
      echo "Selected: Core System"
      break
      ;;
    2)
      PROFILES_TO_RUN="--profile assistants"
      echo "Selected: All Assistants"
      echo "WARNING: This option assumes the 'core' services are already running or will be started separately."
      break
      ;;
    3)
      PROFILES_TO_RUN="--profile core --profile assistants"
      echo "Selected: Core System + All Assistants"
      break
      ;;
    4)
      echo "Enter the name of the specific assistant (e.g., pm-assistant, sales-assistant): "
      read -r ASSISTANT_NAME
      if [ -n "$ASSISTANT_NAME" ]; then
        PROFILES_TO_RUN="--profile core --profile $ASSISTANT_NAME"
        echo "Selected: Core System + Specific Assistant: $ASSISTANT_NAME"
        echo "Note: The 'core' profile is automatically included to ensure dependencies are met."
        break
      else
        echo "Assistant name cannot be empty. Please try again."
      fi
      ;;
    5)
      PROFILES_TO_RUN="" # No profiles specified means all services without explicit profiles run
      echo "Selected: Run All Services (Infrastructure, Core System, and All Assistants)"
      break
      ;;
    *)
      echo "Invalid choice. Please enter a number between 1 and 5."
      ;;
  esac
done

echo ""
echo "Initiating Docker Compose with selected profile(s)..."
$COMPOSE_COMMAND $PROFILES_TO_RUN

echo ""
echo "Stage7 setup and launch complete! 🎉"
echo "Access the frontend at http://localhost"
echo ""
echo "--- Debugging Information ---"
echo "You can access the RabbitMQ Management UI at http://localhost:15672"
echo "  - Username: stage7"
echo "  - Password: stage7password"
echo ""
echo "To check the status of core services:"
echo "  docker compose ps"
echo ""
echo "To view logs for a specific service (e.g., postoffice):"
echo "  docker compose logs -f postoffice"
echo "To stop services: docker compose down"