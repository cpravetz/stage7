# stage7 - Seakaytee's Agent Platform

### Here for the Career Coach Assistant with job search services?

The Career Coach is one of the sample Assistants provided with stage7 and has job search/apply/prep skills. If that is what you are looking for, see the [Job Search Quickstart](./JOBSEARCH_QUICKSTART.md)

## Overview

stage7 is a modern, self-hosted agent platform built on a clean microservices architecture. It provides durable workflow execution, dynamic assistant loading, MCP-native tool integration, and an entity-centric user interface.

The system is composed of independent Node.js services that communicate via REST and WebSocket, with Temporal.io providing durable mission execution and Redis providing caching and task queuing.

## Key Components

### Core Agentic Services (Primary)
- **Unified API Gateway**: Single entry point for routing requests to backend services with service registry and health checks.
- **MCP Server Runtime**: Native Model Context Protocol (MCP) server implementation with tool registry, stdio/HTTP transport.
- **Shared Worker Pool**: Dynamic worker pool for executing assistant tasks with Redis-backed task queue and retry logic.
- **Brain/LLM Layer**: Modern LLM orchestration with structured output sampling (Zod), semantic Redis caching, token-aware context windows, and cost-based model routing.
- **Temporal.io Workflow Engine**: Durable workflow execution for missions with state persistence, saga patterns, and crash fault-tolerance.
- **Recurring Missions and Entity Memory**: The Temporal service manages recurring schedules persisted through Artifacts, while Artifacts-backed entity memory rollups provide concise context nudges within the existing service boundaries.
- **Vault Integration**: AES-256-GCM encrypted secret storage for credentials, API keys, and configuration
- **Monitoring and Visualization**: The frontend also offers tools for observing system and agent behavior:
     - **Brain Metrics**: The Brain page surfaces live telemetry from the brain service. Users can view:
       - **Cache statistics**: Semantic cache hit and miss counts.
       - **Circuit breaker state**: Per-provider open or closed state and its failure count.
       - **Call log**: Recent completions, cache hits, and errors, with token usage per call.
       - **Available models**: The models the configured providers expose.
       This data helps in identifying provider failures and cache effectiveness.
     - **Dashboard Service Health**: The Dashboard polls the gateway service registry and shows the
       reported health of every registered service, alongside running missions and the live event feed.
     - **Agent Network Graph**: A dynamic, interactive graph visualizing the relationships and communication flow between agents within a mission. This graph allows users to:
       - **Observe Agent Interactions**: See which agents are communicating with each other and the nature of their interactions.
       - **Track Task Delegation**: Visualize the delegation of tasks from one agent to another.
       - **Identify Bottlenecks**: Pinpoint agents that are overloaded or causing delays in the mission execution.
       - **Understand Mission Flow**: Gain a holistic view of how a complex mission is being executed by the distributed agent system.
       - **Inspect Agent State**: Click on individual agents to view their current status, assigned role, and recent activities.

### Infrastructure

The platform requires the following infrastructure services:
- **MongoDB**: Document persistence for mission and agent state
- **Redis**: Caching, task queuing, and session storage

## 🚀 Key Features

### Assistant Development Kit (ADK)
- **Contract-Driven Composition**: Define Assistant identity, product objects, tools, skills, workflows, lanes, context, approval, configuration, and persistence through typed contracts.
- **Reusable Builders**: Compose custom Assistants with `createTool`, `createSkill`, `createWorkflow`, `createWorkflowStage`, `createWorkflowLane`, and `createAssistant`.
- **Workflow Governance**: Validate stage transitions, lane references, object context, configuration, approval requirements, and persistence policies before runtime use.
- **Runtime Workflow Views**: Browse registered workflows and build runtime stage/action views through the tool-executor workflow and workspace APIs.
- **Full Documentation**: See the current [ADK documentation](./docs/ADK/README.md) and [developer guide](./docs/ADK/ADK_DEVELOPER_GUIDE.md). Older architecture documents are historical references.

### Enterprise-Ready Tool Ecosystem
- **Extensible Tool Types**: Register tools in TypeScript, Python, any language via Docker containers, or as OpenAPI/MCP tool definitions
- **Skills as Tools**: Assistant skills are authored declaratively and compiled into tools with JSON input and output schemas by the tool-executor, then discovered through the Tools page and the tool-executor APIs
- **Mission Learning and Batch Execution**: Successful mission trajectories can be compiled into registered ADK skills, and up to 20 registered tools can be run sequentially under a final output schema.
- **Definition-Based Tools**: Integrate external APIs and proprietary services using OpenAPI or MCP tool definitions
- **Unified Discovery**: The gateway and tool-executor expose one registry of tools with schema introspection and health checks

For generated-skill review guidance, batch API details, recurring mission requirements, and entity-memory behavior, see the [User Guide](./docs/USER_GUIDE.md) and [Tool & Skill Development Guide](./docs/ADK/TOOL-DEVELOPMENT.md).

### Advanced AI Capabilities
- **Self-modifying**: The system can create new plugins for itself using AI
- **Reflective**: Analyzes runtime errors and develops code improvements to address issues
- **Self-optimizing**: Uses context to route LLM conversations to the best available LLM for processing
- **Mission Planning**: ACCOMPLISH plugin creates comprehensive plans for complex goals
- **Agent Awareness & Specialization**: The system utilizes a sophisticated framework of agent roles to ensure tasks are handled by the most appropriate specialist.
  - **Dynamic Role Assignment**: For each step in a mission plan, the system assigns one of the following roles to the executing agent:
    - **Coordinator**: Orchestrates activities, manages task allocation, and breaks down complex goals.
    - **Researcher**: Gathers, analyzes, and synthesizes information from various sources.
    - **Creative**: Generates novel ideas, content, and solutions.
    - **Critic**: Evaluates plans and content, identifying potential risks and issues.
    - **Executor**: Implements plans and executes tasks with precision and reliability.
    - **Domain Expert**: Provides specialized knowledge in specific fields.
    - **Coder**: Develops, tests, and maintains software and code.
    - **Analyst**: Analyzes data and provides insights to support decision-making.
    - **Product Manager**: Defines product vision, strategy, and roadmap. Manages the product lifecycle from conception to launch.

### Scalable Architecture
- **Microservices Design**: Independent components that can be scaled as needed
- **Container Support**: Docker-based plugin execution with full isolation
- **Service Discovery**: Automatic service registration and discovery
- **Load Balancing**: Distribute workload across multiple service instances

### Security & Reliability
- **Authentication**: RS256 asymmetric key authentication for service-to-service communication
- **Plugin Sandboxing**: Secure execution environment for plugins
- **Error Handling**: Comprehensive error analysis and recovery mechanisms
- **Resource Management**: Container resource allocation and monitoring

## Getting Started

### Quick Start (Recommended)

The easiest way to set up and launch Stage7 is using the interactive `setup.sh` script. This script automates prerequisite checks, environment setup, Docker image builds, and service launches.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/cpravetz/stage7.git
    cd stage7
    ```

2.  **Run the setup script:**
    ```bash
    ./setup.sh
    ```
    The script will guide you through:
    *   Verifying Docker and Docker Compose V2 installation.
    *   Creating your `.env` file from `.env.example`.
    *   Selecting which assistants to deploy (all of them, or a list of IDs).
    *   Building all necessary Docker images.
    *   Starting the full stack and waiting for it to come up.

    The script tears the stack down before rebuilding, so expect a full rebuild
    on every run. For day-to-day work on a single service, use
    `./buildone.sh <service>` instead.

### Manual Setup & Launch

For advanced users, you can find detailed instructions for manual Docker builds, service-by-service rebuilds, assistant selection, and configuring environment variables directly in the [Docker Build & Deployment Guide](./DOCKER_BUILD_GUIDE.md). Each service reads only a subset of the environment; [env.summary](./env.summary) lists what each one reads and which variables have no effect.

### First Steps After Installation

1.  Access the frontend at `http://localhost:8080`.
2.  Register a new account through the frontend interface.
3.  Start with a simple mission (e.g., "Create a basic todo list") to test the system.
4.  Monitor agent creation and task execution through the UI.
5.  Review the Files tab to see deliverables and shared files.

### Using Self-Hosted LLMs

Stage7 supports integration with self-hosted LLM models through the Ollama and OpenWebUI providers, configured with `OLLAMA_API_BASE`, `OLLAMA_API_KEY`, `OPENWEB_URL`, and `OPENWEBUI_API_KEY` (see [env.summary](./env.summary)). For comprehensive instructions and configuration details, please refer to the [Self-Hosted LLM Guide](docs/ACTIVE_REFERENCE/SELF_HOSTED_LLM_GUIDE.md).

### Troubleshooting

Common issues and solutions:

1.  **Connection Errors**
    *   Verify all containers are running: `docker compose ps`
    *   Check container logs: `docker compose logs [service-name]`
    *   Ensure all required ports are available

2.  **LLM Integration Issues**
    *   Verify API keys are correctly set in environment variables (in your `.env` file).
    *   Check service logs for API response errors: `docker compose logs [service-name]`
    *   Ensure sufficient API credits/quota.
    *   For self-hosted LLMs, check network connectivity between containers and the LLM server.
    *   Verify the LLM server supports the OpenAI API format.

3.  **Performance Issues**
    *   Monitor container resource usage: `docker stats`
    *   Consider increasing container resource limits.
    *   Check Redis and MongoDB performance.
    *   For self-hosted LLMs, ensure the host has sufficient resources.

4. **Debugging Logs**
    *   Stage7 services now use structured logging (pino). To view human-readable logs for a specific service (e.g., gateway):
        ```bash
        docker compose logs -f gateway
        ```
    *   For advanced log analysis, consider setting up a centralized logging solution.

## Development

### Project Structure

 - `services/`: NextGen service components (gateway, mcp-runtime, worker-pool, brain, temporal, vault, artifacts, auth, agent-runtime, tool-executor)
- `shared-nextgen/`: NextGen shared utilities and types
- `frontend-nextgen/`: React + Vite frontend application
- `docs/`: Documentation including the NextGen rebuild proposal
- `docker-compose.yaml`: Docker Compose file for running the system

### Adding a New Service

1. Create a new directory under `services/`
2. Implement the service with `src/`, `__tests__/`, `package.json`, `tsconfig.json`, and `dockerfile`
3. Use `@stage7-nextgen/shared` for shared utilities (not legacy shared packages)
4. Add the service to the Docker Compose file
5. Register the service with the Unified API Gateway for service discovery
6. Update `.env.example` with any new environment variables

## Contributing

### Code Style Guidelines

As stage7 was developed by LLMs, it has not always adhered to standards. This is something that
will be addressed as the system stabilizes and matures. You can help us avoid additional tech debts to resolve
by trying to comply with the following:

1. **TypeScript**
   - Use strict type checking
   - Follow interface-first design
   - Document complex type definitions
   - Use meaningful variable names

2. **React Components**
   - Use functional components with hooks
   - Implement proper error boundaries
   - Follow component composition patterns
   - Document props with TypeScript interfaces

3. **Testing**
   - Write unit tests for all new features
   - Include integration tests for component interactions
   - Maintain minimum 80% code coverage

### Pull Request Process

1. **Before Submitting**
   - Create a feature branch for your changes from the `develop` branch
   - Update documentation in-line
   - Add/update tests
   - Run linting and tests locally
   - Rebase on latest `develop`

2. **PR Requirements**
   - Clear description of changes
   - Link to related issue(s)
   - Screenshots for UI changes
   - Test coverage report
   - Updated documentation
   - Passing CI checks
## 🔌 Tool Ecosystem

Stage7 executes work through tools, which are compiled from assistant skills and served by the
tool-executor. There is no separate plugin service: skills, tools, and workflows are all defined in
the tool-executor and exposed through its APIs.

### How Tools Are Produced

- **Skills** are authored declaratively under `services/tool-executor/src/assistants/<id>/skills/`.
- The skill factory (`src/adk/code-skill-factory.ts`) turns each skill into a tool with a JSON input
  and output schema.
- The **tool-executor** registers those tools and serves discovery and execution endpoints.
- The **Tools page** in the frontend and the **MCP runtime** expose the same registry to users and
  agents.

### Tool Definition Formats

1. **Skills** – TypeScript modules authored against the ADK contracts.
2. **OpenAPI Tools** – External API integration described by an OpenAPI 3.0+ definition.
3. **MCP Tools** – Internal or proprietary services called through Model Context Protocol definitions.

#### Documentation

- **ADK overview**: `docs/ADK/ADK_OVERVIEW.md`
- **ADK developer guide**: `docs/ADK/ADK_DEVELOPER_GUIDE.md`
- **Assistant reference**: `docs/ADK/` (one document per assistant)

#### Verifying a Change

```bash
# Validate ADK contracts, skills, and tool schemas
npm run adk:validate

# Unit and integration tests
npm test
```

### Tool Development Best Practices

1. **Skill structure**
   - Follow the ADK contracts for input and output schemas
   - Declare every environment variable the skill reads, and give each one a default
   - Set an explicit `timeoutMs` and an emit deadline below it
   - Report a not-connected result rather than throwing when an optional endpoint is absent

2. **Security considerations**
   - Validate all inputs before processing
   - Follow the principle of least privilege for credentials
   - Use container isolation for untrusted code
   - Never hardcode API keys in a skill; read them from the credential provider or the environment

3. **Testing requirements**
   - Unit tests for core logic
   - Integration coverage of the tool's execution path
   - Error handling and edge case scenarios

### Security Guidelines

1. **Authentication and Authorization**
   - The `auth` service issues HS256 JWTs for users and service accounts, and the frontend stores the
     resulting token to call the gateway.
   - **Known gap**: the signing secret is a hardcoded default (`dev-secret-key`) with no environment
     override wired up. Treat the current auth flow as unsuitable for anything but local
     development until that secret is sourced from configuration.
   - Internal service-to-service calls on the compose network are not authenticated; they rely on
     network isolation.
   - Never commit `.env`, provider API keys, or the `MASTER_KEY` for the vault.

2. **Code Security**
   - No hardcoded credentials
   - Proper input validation
   - Regular dependency updates

3. **Data Protection**
   - Proper handling of sensitive data
   - Secure storage practices

4. **Tool Security**
   - Skills run through the tool-executor, which sandboxes code execution
   - Credentials for tools are resolved at run time by the credential provider, which can read from
     the vault
   - Container isolation is available for untrusted code execution

## Support

- GitHub Issues: Report bugs and feature requests
- Discussions: Ask questions and share ideas
- Wiki: Detailed documentation and guides
