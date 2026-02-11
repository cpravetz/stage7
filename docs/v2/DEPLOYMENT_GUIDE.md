# Stage7 V2 Deployment Guide

**Last Updated**: January 4, 2026

## 1. Overview

This guide provides comprehensive instructions for deploying the Stage7 V2 system. The system is designed as a microservice architecture, orchestrated with Docker Compose. This document merges the high-level V2 architectural concepts with detailed, practical steps for configuration, deployment, and maintenance.

### 1.1. Architecture

The V2 architecture is composed of four primary layers, all running on a common infrastructure foundation.

```
┌─────────────────────────────────────────────────────────────┐
│                      L4: React Frontend                     │
│                    (mcsreact - port 80)                     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  L3: Assistant APIs (12+)                   │
│  pm(3000) sales(3002) marketing(3003) ... etc ...           │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      L2: SDK & Agent Layer                  │
│         (AgentSet, Brain, CapabilitiesManager, etc.)        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   L1: Core Infrastructure Services          │
│         (PostOffice, Librarian, Security, etc.)             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Foundation Infrastructure                 │
│        (MongoDB, Redis, RabbitMQ, Consul, etc.)             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2. Prerequisites

*   **Docker and Docker Compose:** Ensure you have a recent version installed and running.
*   **Node.js:** Version 20+ (for running any local scripts).
*   **Git:** For cloning the repository.
*   **`.env` file:** Create a `.env` file in the project root by copying `.env.example`. This is critical for providing secrets like API keys.

## 2. Service & Port Reference

The system is composed of several services, each with a designated port.

### 2.1. L3/L4: Frontend & Assistant APIs
| Service | Port | Description |
| :--- | :--- | :--- |
| **Frontend (mcsreact)** | **80** | The main web interface. |
| pm-assistant-api | 3000 | Product Manager Assistant |
| sales-assistant-api | 3002 | Sales Assistant |
| marketing-assistant-api| 3003 | Marketing Assistant |
| hr-assistant-api | 3004 | HR Assistant |
| finance-assistant-api | 3005 | Finance Assistant |
| support-assistant-api | 3006 | Customer Support Assistant |
| legal-assistant-api | 3007 | Legal Document Assistant |
| healthcare-assistant-api| 3008 | Healthcare Patient Coordinator |
| education-assistant-api | 3009 | Educational Tutor Assistant |
| event-assistant-api | 3010 | Event Planner Assistant |
| executive-assistant-api| 3011 | Executive Coach |
| career-assistant-api | 3012 | Job Search Agent |

### 2.2. L1/L2: Core Services
| Service | Port | Description |
| :--- | :--- | :--- |
| **SecurityManager** | **5010** | Handles authentication and authorization. |
| **PostOffice** | **5020** | The main API gateway and entry point. |
| **MissionControl** | **5030** | Manages missions and high-level state. |
| **Librarian** | **5040** | Manages data, artifacts, and tool discovery. |
| **Engineer** | **5050** | Manages plugin development and lifecycle. |
| **CapabilitiesManager**| **5060** | Executes plugins (tools). |
| **Brain** | **5070** | Handles LLM-based planning and reasoning. |
| **AgentSet** | **5100** | Coordinates the pool of available agents. |

### 2.3. Foundation Infrastructure
| Service | Port | Description |
| :--- | :--- | :--- |
| **MongoDB** | **27017** | Primary persistent database. |
| **Redis** | **6379** | In-memory cache and message broker. |
| **RabbitMQ** | **15672** | Management UI for the message queue. |
| **Consul** | **8500** | Service discovery and configuration. |
| **ChromaDB** | **8000** | Vector database for semantic search. |
| **SearXNG** | **8888** | Privacy-respecting metasearch engine. |

## 3. Environment Variables

Configuration is managed via environment variables defined in `docker-compose.yaml` and supplemented by a `.env` file in the project root.

### 3.1. Core Configuration
*   `SHARED_SECRET`: A secret shared between all services for initial trust. The default is `stage7AuthSecret`. **This must be changed in a production `.env` file.**
*   `NODE_ENV`: Should be set to `production` for deployed environments.

### 3.2. LLM & External API Keys
These **must** be provided in your `.env` file to enable the `brain` and various plugins to function.
```
# .env

# GitHub credentials for plugin management
GITHUB_TOKEN=ghp_...
GITHUB_USERNAME=your-github-username

# LLM API Keys
GROQ_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
# etc.
```

### 3.3. Plugin & GitHub Configuration
These are primarily located in the `engineer` and `capabilitiesmanager` service definitions in `docker-compose.yaml`.
*   `GIT_REPOSITORY_URL`: The URL to the Git repository where plugins are stored (e.g., `https://github.com/cpravetz/s7plugins.git`).
*   `DEFAULT_PLUGIN_REPOSITORY`: The default lookup method for plugins (`github` or `local`).

## 4. Deployment

### 4.1. Deployment Options

You can choose to run all services or only a subset. The `docker-compose.yaml` is configured with `depends_on` to automatically start required dependencies.

*   **Deploy Everything (Recommended First Run):**
    ```bash
    docker-compose up
    ```

*   **Deploy a Specific Assistant:**
    ```bash
    # This will also start PostOffice, SecurityManager, and all infrastructure.
    docker-compose up pm-assistant-api
    ```

*   **Deploy the Frontend and a Few Assistants:**
    ```bash
    docker-compose up frontend pm-assistant-api sales-assistant-api
    ```

*   **Deploy Core Services Only (for L1/L2 development):**
    ```bash
    docker-compose up missioncontrol brain librarian capabilitiesmanager
    ```

### 4.2. Standard Workflow

1.  **Build all service images:**
    ```bash
    docker-compose build
    ```
2.  **Start services in detached mode:**
    ```bash
    docker-compose up -d
    ```
3.  **View logs for a specific service:**
    ```bash
    docker-compose logs -f brain
    ```
4.  **Rebuild and restart a service after code changes:**
    ```bash
    docker-compose up -d --build pm-assistant-api
    ```
5.  **Stop all services:**
    ```bash
    docker-compose down
    ```
6.  **Stop and remove volumes (for a clean slate):**
    ```bash
    docker-compose down -v
    ```

## 5. Post-Deployment Verification

### 5.1. Check Service Status
Check that all expected containers are running:
```bash
docker-compose ps
```

### 5.2. Check Health Endpoints
Most core services have a `/health` endpoint.
```bash
# Check PostOffice (gateway)
curl http://localhost:5020/health

# Check Librarian (tool discovery)
curl http://localhost:5040/health

# Check Brain (planning)
curl http://localhost:5070/health
```

### 5.3. Access an Assistant API
```bash
# Access the PM Assistant's health endpoint
curl http://localhost:3000/health
```

### 5.4. Access Frontend
Open your browser to `http://localhost`. (Port 80 is the default).

## 6. Troubleshooting

*   **Service fails to start:** Check the logs (`docker-compose logs <service-name>`) for error messages. Often, it's a missing dependency that hasn't finished starting yet or a missing environment variable.
*   **`Port is already allocated`:** Another process on your machine is using a required port. You can either stop the other process or change the port mapping in `docker-compose.yaml`. For example, change `"3000:3000"` to `"3001:3000"` to map the container's port 3000 to your host machine's port 3001.
*   **Plugin loading issues:** Check the `capabilitiesmanager` logs. It will often report issues cloning from GitHub if the `GITHUB_TOKEN` is invalid or missing.
*   **Authentication errors:** Ensure the `SHARED_SECRET` in your `.env` file matches what services expect if you have overridden it.

## 7. Production Considerations

For a true production deployment, you should go beyond the base `docker-compose.yaml`:
*   **Secrets Management:** Use Docker Secrets or a dedicated secret manager instead of a plaintext `.env` file.
*   **Reverse Proxy:** Use a reverse proxy like Nginx or Traefik to manage incoming traffic, provide SSL termination, and load balance.
*   **Orchestration:** For multi-node scaling and high availability, migrate the Docker Compose setup to Docker Swarm or Kubernetes.
*   **Monitoring:** Set up a dedicated monitoring stack (e.g., Prometheus + Grafana) to scrape metrics from services.
*   **Backups:** Implement a robust backup strategy for the `mongo_data` and other persistent volumes.