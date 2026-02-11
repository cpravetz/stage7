# Stage7 Setup and Launch Script for Windows
# PowerShell version of setup.sh

$ErrorActionPreference = "Stop" # Exit immediately if a command exits with a non-zero status

# Function to pause script execution and wait for user input
function Press-Any-Key-To-Continue {
    Write-Host ""
    Write-Host "Press any key to continue..." -NoNewline
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
}

Write-Host "🚀 Stage7 Setup and Launch Script 🚀"

# --- 1. Check for Docker and Docker Compose prerequisites ---
Write-Host "Checking prerequisites: Docker and Docker Compose..."

$dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerInstalled) {
    Write-Host "Docker is not installed. Please install Docker Desktop:" -ForegroundColor Red
    Write-Host "  https://docs.docker.com/get-docker/"
    exit 1
}

$dockerComposeInstalled = docker compose version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Compose (V2) is not installed. Please install or enable it:" -ForegroundColor Red
    Write-Host "  https://docs.docker.com/compose/install/"
    exit 1
}

Write-Host "Docker and Docker Compose are installed. ✅"
Press-Any-Key-To-Continue

# --- 2. Setup .env file ---
Write-Host ""
Write-Host "Setting up .env file..."
$ENV_FILE = ".env"
$ENV_EXAMPLE_FILE = ".env.example"

if (-not (Test-Path $ENV_FILE)) {
    Write-Host "'.env' file not found. Creating from '$ENV_EXAMPLE_FILE'."
    Copy-Item $ENV_EXAMPLE_FILE $ENV_FILE
    Write-Host "'.env' created."
} else {
    Write-Host "'.env' file already exists. Skipping creation."
}

Write-Host ""
Write-Host "============================================================================"
Write-Host "ACTION REQUIRED: Please review and edit your '.env' file."
Write-Host "----------------------------------------------------------------------------"
Write-Host "  - Open the '.env' file in your preferred text editor."
Write-Host "  - Fill in your API keys (e.g., GROQ_API_KEY) and any other custom settings."
Write-Host "  - Ensure 'SHARED_SECRET' and 'ADMIN_SECRET' are left blank for auto-generation,"
Write-Host "    unless you want to set them manually."
Write-Host "============================================================================"
Press-Any-Key-To-Continue

# Function to generate a random secret string
function Generate-Secret {
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $secret = -join ((1..32) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    return $secret
}

# Function to get env value from file
function Get-Env-Value {
    param (
        [string]$FilePath,
        [string]$Key
    )
    
    $content = Get-Content $FilePath -ErrorAction SilentlyContinue
    foreach ($line in $content) {
        if ($line -match "^$Key=(.*)$") {
            return $matches[1].Trim()
        }
    }
    return $null
}

# Function to set env value in file
function Set-Env-Value {
    param (
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )
    
    $content = Get-Content $FilePath -ErrorAction SilentlyContinue
    $found = $false
    $newContent = @()
    
    foreach ($line in $content) {
        if ($line -match "^$Key=") {
            $newContent += "$Key=$Value"
            $found = $true
        } else {
            $newContent += $line
        }
    }
    
    if (-not $found) {
        $newContent += "$Key=$Value"
    }
    
    $newContent | Set-Content $FilePath
}

# Generate and set SHARED_SECRET if not already set or empty
$sharedSecret = Get-Env-Value -FilePath $ENV_FILE -Key "SHARED_SECRET"
if ((Get-Env-Value -FilePath $ENV_FILE -Key "SHARED_SECRET") -eq "") {
    Write-Host "Generating SHARED_SECRET..."
    $GENERATED_SHARED_SECRET = Generate-Secret
    Set-Env-Value -FilePath $ENV_FILE -Key "SHARED_SECRET" -Value $GENERATED_SHARED_SECRET
    Write-Host "SHARED_SECRET set in .env"
} else {
    Write-Host "SHARED_SECRET already set or has a value in .env. Skipping generation."
    $GENERATED_SHARED_SECRET = Get-Env-Value -FilePath $ENV_FILE -Key "SHARED_SECRET"
}

# Generate and set ADMIN_SECRET if not already set or empty
$adminSecret = Get-Env-Value -FilePath $ENV_FILE -Key "ADMIN_SECRET"
if ($adminSecret -eq "") {
    Write-Host "Generating ADMIN_SECRET..."
    $GENERATED_ADMIN_SECRET = Generate-Secret
    Set-Env-Value -FilePath $ENV_FILE -Key "ADMIN_SECRET" -Value $GENERATED_ADMIN_SECRET
    Write-Host "ADMIN_SECRET set in .env"
} else {
    Write-Host "ADMIN_SECRET already set or has a value in .env. Skipping generation."
}

# Update assistant-specific secrets to use the SHARED_SECRET if they are empty
Write-Host "Updating assistant-specific secrets in .env if empty..."
$ASSISTANT_SECRETS = @(
    "PM_ASSISTANT_API_SECRET", "SALES_ASSISTANT_API_SECRET", "MARKETING_ASSISTANT_API_SECRET", "HR_ASSISTANT_API_SECRET",
    "FINANCE_ASSISTANT_API_SECRET", "SUPPORT_ASSISTANT_API_SECRET", "LEGAL_ASSISTANT_API_SECRET", "HEALTHCARE_ASSISTANT_API_SECRET",
    "EDUCATION_ASSISTANT_API_SECRET", "EVENT_ASSISTANT_API_SECRET", "EXECUTIVE_ASSISTANT_API_SECRET", "CAREER_ASSISTANT_API_SECRET",
    "CONTENT_CREATOR_ASSISTANT_API_SECRET", "SONGWRITER_ASSISTANT_API_SECRET", "SCRIPTWRITER_ASSISTANT_API_SECRET",
    "HOTEL_OPS_ASSISTANT_API_SECRET", "RESTAURANT_OPS_ASSISTANT_API_SECRET", "INVESTMENT_ADVISOR_API_SECRET",
    "SPORTS_WAGER_ADVISOR_API_SECRET", "CTO_ASSISTANT_API_SECRET", "PERFORMANCE_ANALYTICS_API_SECRET"
)

foreach ($SECRET_VAR in $ASSISTANT_SECRETS) {
    $currentValue = Get-Env-Value -FilePath $ENV_FILE -Key $SECRET_VAR
    if ($currentValue -eq "") {
        Set-Env-Value -FilePath $ENV_FILE -Key $SECRET_VAR -Value $GENERATED_SHARED_SECRET
        Write-Host "  - $SECRET_VAR set to SHARED_SECRET."
    }
}
Write-Host ".env file setup complete. ✅"
Press-Any-Key-To-Continue

# --- 3. Generate RSA keys ---
Write-Host ""
Write-Host "Checking for RSA keys..."
$KEYS_DIR = ".\shared\keys"
$PRIVATE_KEY_PATH = Join-Path $KEYS_DIR "private.key"
$PUBLIC_KEY_PATH = Join-Path $KEYS_DIR "public.key"
$PUBLIC_PEM_PATH = Join-Path $KEYS_DIR "public.pem"

if (-not (Test-Path $KEYS_DIR)) {
    New-Item -ItemType Directory -Path $KEYS_DIR -Force | Out-Null
}

if (-not (Test-Path $PRIVATE_KEY_PATH)) {
    Write-Host "Generating RSA private key at $PRIVATE_KEY_PATH..."
    openssl genrsa -out $PRIVATE_KEY_PATH 2048 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: openssl command failed. Please ensure OpenSSL is installed and in your PATH." -ForegroundColor Red
        Write-Host "You can install OpenSSL via: winget install ShiningLight.OpenSSL" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "RSA private key generated."
} else {
    Write-Host "RSA private key already exists. Skipping generation."
}

if (-not (Test-Path $PUBLIC_KEY_PATH)) {
    Write-Host "Generating RSA public key at $PUBLIC_KEY_PATH from private key..."
    openssl rsa -in $PRIVATE_KEY_PATH -pubout -out $PUBLIC_KEY_PATH 2>$null
    Write-Host "RSA public key generated."
} else {
    Write-Host "RSA public key already exists. Skipping generation."
}

if (-not (Test-Path $PUBLIC_PEM_PATH)) {
    Write-Host "Generating RSA public PEM key at $PUBLIC_PEM_PATH from private key..."
    openssl rsa -in $PRIVATE_KEY_PATH -pubout -outform PEM -out $PUBLIC_PEM_PATH 2>$null
    Write-Host "RSA public PEM key generated."
} else {
    Write-Host "RSA public PEM key already exists. Skipping generation."
}
Write-Host "RSA key setup complete. ✅"
Press-Any-Key-To-Continue

# --- 4. Select Deployment Profile ---
Write-Host ""
Write-Host "--- Select Deployment Profile ---"

$PROFILES_LIST = ""
$USER_CHOICE = ""

while ($true) {
    Write-Host ""
    Write-Host "Please select a deployment profile:"
    Write-Host "1) Core System (Essential services like PostOffice, MissionControl, Brain, Frontend)"
    Write-Host "2) All Assistants (Requires Core System to be running. Use with option 1 or 3)"
    Write-Host "3) Core System + All Assistants (Recommended for full local development)"
    Write-Host "4) Specific Assistant (You will be prompted to enter the assistant's name)"
    Write-Host "5) Run All Services (Includes infrastructure, core system, and all assistants)"
    Write-Host "Enter your choice (1-5): " -NoNewline
    $USER_CHOICE = Read-Host

    switch ($USER_CHOICE) {
        "1" {
            $PROFILES_LIST = "core"
            Write-Host "Selected: Core System"
            break
        }
        "2" {
            $PROFILES_LIST = "assistants"
            Write-Host "Selected: All Assistants"
            Write-Host "WARNING: This option assumes the 'core' services are already running or will be started separately." -ForegroundColor Yellow
            break
        }
        "3" {
            $PROFILES_LIST = "core,assistants"
            Write-Host "Selected: Core System + All Assistants"
            break
        }
        "4" {
            Write-Host "Enter the name of the specific assistant (e.g., pm-assistant, sales-assistant): " -NoNewline
            $ASSISTANT_NAME = Read-Host
            if ($ASSISTANT_NAME) {
                $PROFILES_LIST = "core,$ASSISTANT_NAME"
                Write-Host "Selected: Core System + Specific Assistant: $ASSISTANT_NAME"
                Write-Host "Note: The 'core' profile is automatically included to ensure dependencies are met."
                break
            } else {
                Write-Host "Assistant name cannot be empty. Please try again." -ForegroundColor Red
            }
        }
        "5" {
            $PROFILES_LIST = "*"
            Write-Host "Selected: Run All Services (Infrastructure, Core System, and All Assistants)"
            break
        }
        default {
            Write-Host "Invalid choice. Please enter a number between 1 and 5." -ForegroundColor Red
        }
    }
    
    if ($PROFILES_LIST -ne "") {
        break
    }
}

# Set the environment variable for Docker Compose
$Env:COMPOSE_PROFILES = $PROFILES_LIST

# --- 5. Build Docker images ---
Write-Host ""
Write-Host "Building Docker images for selected profile(s)..."
docker compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker compose build failed." -ForegroundColor Red
    exit 1
}
Write-Host "Docker images built. ✅"
Press-Any-Key-To-Continue

# --- 6. Start services ---
Write-Host ""
Write-Host "--- Starting Stage7 Services ---"
Write-Host "Initiating Docker Compose with selected profile(s)..."
# The --wait flag ensures Docker Compose waits for services to be healthy
# The --timeout flag specifies how long to wait for containers to become healthy
$composeCommand = "docker compose up -d --wait --timeout 300"
Invoke-Expression $composeCommand
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker compose up failed." -ForegroundColor Red
    Write-Host "Tip: Check container logs with 'docker compose logs <service-name>' for more details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Stage7 setup and launch complete! 🎉"
Write-Host "Access the frontend at http://localhost"
Write-Host ""
Write-Host "--- Debugging Information ---"
Write-Host "You can access the RabbitMQ Management UI at http://localhost:15672"
Write-Host "  - Username: stage7"
Write-Host "  - Password: stage7password"
Write-Host ""
Write-Host "To check the status of core services:"
Write-Host "  docker compose ps"
Write-Host ""
Write-Host "To view logs for a specific service (e.g., postoffice):"
Write-Host "  docker compose logs -f postoffice"
Write-Host "To stop services: docker compose down"
