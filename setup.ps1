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
Write-Host ""
Write-Host "Profile Structure:"
Write-Host "  - NextGen services are the default and always run"
Write-Host "  - All services are managed via Docker Compose"
Write-Host ""

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

Write-Host ".env file setup complete. ✅"
Press-Any-Key-To-Continue

# --- 3. Tear down any old / orphan containers before rebuilding ---
Write-Host ""
Write-Host "Tearing down previous deployment (if any) to free ports and remove orphans..."
docker compose down --remove-orphans --timeout 30
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: docker compose down returned a non-zero exit code. Continuing." -ForegroundColor Yellow
}

# --- 4. Build Docker images ---
Write-Host ""
Write-Host "Building Docker images..."
docker compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker compose build failed." -ForegroundColor Red
    exit 1
}
Write-Host "Docker images built. ✅"
Press-Any-Key-To-Continue

# --- 5. Start services ---
Write-Host ""
Write-Host "--- Starting Stage7 Services ---"
Write-Host "Initiating Docker Compose..."
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
Write-Host "To check the status of core services:"
Write-Host "  docker compose ps"
Write-Host ""
Write-Host "To view logs for a specific service (e.g., gateway):"
Write-Host "  docker compose logs -f gateway"
Write-Host "To stop services: docker compose down"
