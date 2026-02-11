# Stage7 Docker Build & Deployment Guide

This guide provides instructions for building and deploying the Stage7 system using Docker and Docker Compose. The primary method for setup and launch is now the interactive `setup.sh` script.

## 1. Quick Start with `setup.sh` (Recommended)

The `setup.sh` script automates prerequisite checks, environment setup, Docker image builds, and service launches with profile selection.

### Usage:
```bash
./setup.sh
```
This will guide you through:
*   Checking for Docker and Docker Compose.
*   Creating/updating your `.env` file and auto-generating secrets.
*   Generating RSA keys for authentication.
*   Building all necessary Docker images (`docker compose build --no-cache`).
*   Prompting you to select a deployment profile (e.g., `core`, `assistants`, specific assistant, or all services).

## 2. Manual Docker Build & Launch

For advanced users or specific scenarios, you can manually build images and launch services.

### 2.1. Building Docker Images

All images are now defined in a single `docker-compose.yaml` file.

```bash
# Build all images (including the 'base' image first implicitly)
# The '--no-cache' ensures a clean build, useful after code changes.
docker compose build --no-cache
```

**Note on Base Image:** The `base` service (defined in `docker-compose.yaml` and built from `Dockerfile.base`) contains shared dependencies. Docker Compose intelligently reuses this image when building other services, significantly reducing overall build time. You no longer need to build the base image separately.

### 2.2. Launching Services with Profiles

Stage7 now uses Docker Compose Profiles to manage different deployment scenarios from a single `docker-compose.yaml` file.

*   **Infrastructure Services:** (MongoDB, Redis, RabbitMQ, Consul, SearXNG, ChromaDB) do not have a profile and are always started by `docker compose up`.
*   **Core System Services:** (PostOffice, MissionControl, Brain, AgentSet, Engineer, CapabilitiesManager, Librarian, SecurityManager, Frontend) are part of the `core` profile.
*   **Assistant Services:** All `*-assistant-api` services are part of the `assistants` profile, and each also has its own specific profile (e.g., `sales-assistant`).

#### Common Launch Commands:

*   **Launch all services (Infrastructure, Core System, all Assistants):**
    ```bash
    docker compose up -d
    ```
    *(This is equivalent to `./setup.sh` without any profile arguments)*

*   **Launch only Core System services (and infrastructure):**
    ```bash
    docker compose --profile core up -d
    ```
    *(This is useful for developing core platform features or if you want to selectively start assistants later)*

*   **Launch all Assistant services (and infrastructure, assuming core is running or will start):**
    ```bash
    docker compose --profile assistants up -d
    ```
    *(Typically used in conjunction with `--profile core` or if core services are already active)*

*   **Launch Core System + all Assistants (recommended for full local development):**
    ```bash
    docker compose --profile core --profile assistants up -d
    ```

*   **Launch Core System + a Specific Assistant (e.g., Sales Assistant):**
    ```bash
    docker compose --profile core --profile sales-assistant up -d
    ```
    *(Replace `sales-assistant` with the profile name of your desired assistant)*

## 3. Troubleshooting

*   **Common Errors:** Refer to the "Troubleshooting" section in the main `README.md` for general issues and solutions.
*   **Docker Desktop Memory:** Building and running many services can be memory-intensive. Ensure Docker Desktop's memory allocation is set to at least 4GB (recommended 8GB+) in Preferences → Resources.
*   **Clean Rebuild:** To force a complete rebuild without using Docker's build cache:
    ```bash
    docker compose build --no-cache
    ```
    *(This replaces individual service `--no-cache` builds)*

## 4. Port Assignments

Refer to the main `README.md` for a comprehensive list of exposed ports for all services and agents.

## 5. Architecture

The system's Docker architecture leverages a multi-stage build pattern and a shared `base` image for efficiency.

```
Dockerfile.base (builds once)
├── shared/
├── sdk/
└── errorhandler/

All agents and services (except infrastructure) build on cktmcs:base
├── services/postoffice/Dockerfile
├── agents/pm-assistant-api/Dockerfile
└── ... (all other services and agents)
```