# stage7 - A self-aware, self-optimizing, scalable, and flexible system for managing and executing complex missions using Large Language Models (LLMs) and custom plugins.

## Overview

stage7 is an advanced, self-modifying system designed to manage and execute complex missions using Large Language Models (LLMs) and custom plugins. The system is composed of several independent Node.js instances that interact with each other to collectively manage agents, process LLM conversations, and complete given missions.

The plugin ecosystem supports not only code-based plugins (Python, JavaScript, Container) but also definition-based plugins for OpenAPI and MCP tools. All plugin types are managed, discovered, and executed through a unified Plugin Marketplace and CapabilitiesManager, enabling seamless integration of external APIs and internal services as first-class plugins.

## Key Components

1. **MissionControl**: Manages the overall operation of the system, initializing and controlling missions.
2. **PostOffice**: Central message routing component that maintains a registry of available components and routes messages between entities.
3. **Brain**: Handles chat conversations, LLM content conversions, and selects the best LLM for processing based on the context.
4. **Frontend**: A React application that provides a user interface for interacting with the system.
5. **Engineer**: Responsible for creating and managing plugins.
6. **Librarian**: Manages data storage using Redis and MongoDB servers.
7. **CapabilitiesManager**: Handles ActionVerbs and Plugins.
8. **TrafficManager**: Manages agents and agent sets.
9. **SecurityManager**: Ensures system security.

## 🚀 Key Features

### Enterprise-Ready Plugin Ecosystem
- **Extensible Plugin Types**: Develop plugins in Python, JavaScript, any language via Docker containers, or as OpenAPI/MCP tool definitions
- **Production-Ready Plugins**: 10+ ready-to-use plugins (ACCOMPLISH, ASK_USER_QUESTION, SCRAPE, WEATHER, TEXT_ANALYSIS, API_CLIENT, CODE_EXECUTOR, DATA_TOOLKIT, SEARCH_PYTHON, TASK_MANAGER, CHAT, GET_USER_INPUT, FILE_OPS_PYTHON, and more)
- **Automated Plugin Creation**: Engineer service generates plugins automatically based on requirements
- **Definition-Based Plugins**: Integrate external APIs and proprietary services as plugins using OpenAPI or MCP tool definitions
- **Unified Plugin Marketplace**: Discover, distribute, and manage all plugin types (code, OpenAPI, MCP) across the ecosystem

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

### Prerequisites

- Docker and Docker Compose

### Environment Variables

Many environment variables are shared between containers.  The following variables are the ones you should
define.  Any that start with an asterisk (*) are defined in another section of the docker-compose file and
should not be changed.

**SHORTCUT**: The system will run with just one LLM provider keys set in the Brain service and the JWT key in securitymanager.  The JWT keys should be random. You do not need to worry about the other variables now.  Most are already set for you. 


  postoffice:
    environment:
      NODE_ENV: production
      PORT: &postofficePort 5020
      POSTOFFICE_URL: &postofficeUrl postoffice:5020
      SECURITYMANAGER_URL: &securitymanagerUrl securitymanager:5010
      MISSIONCONTROL_URL: &missioncontrolUrl missioncontrol:5030
      POSTOFFICE_CLIENT_SECRET: &postofficeSecret postOfficeAuthSecret

  missioncontrol:
    environment:
      NODE_ENV: production
      PORT: &missioncontrolPort 5030
      TRAFFICMANAGER_URL: &trafficmanagerUrl trafficmanager:5080
      LIBRARIAN_URL: &librarianUrl librarian:5040
      BRAIN_URL: &brainUrl brain:5070
      ENGINEER_URL: &engineerUrl engineer:5050
      MISSIONCONTROL_CLIENT_SECRET: &missioncontrolSecret missionControlAuthSecret

  trafficmanager:
    environment:
      NODE_ENV: production
      PORT: &trafficmanagerPort 5080
      TRAFFICMANAGER_CLIENT_SECRET: &trafficmanagerSecret trafficManagerAuthSecret

  brain:
    environment:
      NODE_ENV: production
      PORT: &brainPort 5070
      BRAIN_CLIENT_SECRET: &brainSecret brainAuthSecret
      # OpenAI API
      OPENAI_API_KEY=

      # Gemini API
      GEMINI_API_KEY=
      GEMINI_API_URL=

      # Huggingface API
      HUGGINGFACE_API_KEY=
      HUGGINGFACE_API_URL=

      # Anthropic API
      ANTHROPIC_API_KEY=
      ANTHROPIC_API_URL=

      # OpenRouter API
      OPENROUTER_API_KEY=

  agentset:
    environment:
      NODE_ENV: production
      TRAFFICMANAGER_URL: &trafficmanagerUrl
      CAPABILITIESMANAGER_URL: &capabilitiesmanagerUrl capabilitiesmanager:5060
      AGENTSET_CLIENT_SECRET: &agentsetSecret agentSetAuthSecret

  engineer:
    environment:
      NODE_ENV: production
      PORT: &engineerPort 5050
      ENGINEER_CLIENT_SECRET: &engineerSecret engineerAuthSecret

  capabilitiesmanager:
    environment:
      NODE_ENV: production
      PORT: &capabilitiesmanagerPort 5060
      ENGINEER_URL: &engineerUrl
      CAPABILITIESMANAGER_CLIENT_SECRET: &capabilitiesmanagerSecret capabilitiesManagerAuthSecret

  librarian:
    environment:
      NODE_ENV: production
      PORT: &librarianPort 5040
      LIBRARIAN_CLIENT_SECRET: &librarianSecret librarianAuthSecret
      REDIS_HOST=redis
      REDIS_PORT=6379
      MONGO_URI=mongodb://mongo:27017
      MONGO_DB=librarianDB

  securitymanager:
    environment:
      NODE_ENV: production
      PORT:  &securitymanagerPort 5010
      JWT_SECRET: your-secret-key
      ADMIN_SECRET: adminSecret
      SECURITYMANAGER_CLIENT_SECRET: &securitymanagerSecret securityManagerAuthSecret

  frontend:
    environment:
      - ENV REACT_APP_API_BASE_URL=http://localhost:5020
      - ENV REACT_APP_WS_URL=ws://localhost:5020

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/cpravetz/stage7.git
   cd stage7
   ```

2. Configure API keys for the LLMs you want to use by creating a `.env` file in the root directory with the following variables (you only need to provide keys for the LLMs you want to use):
   ```
   # OpenAI API
   OPENAI_API_KEY=your_openai_api_key

   # Gemini API
   GEMINI_API_KEY=your_gemini_api_key

   # Huggingface API
   HUGGINGFACE_API_KEY=your_huggingface_api_key

   # Anthropic API
   ANTHROPIC_API_KEY=your_anthropic_api_key

   # OpenRouter API
   OPENROUTER_API_KEY=your_openrouter_api_key
   ```

3. (Optional) Configure self-hosted LLMs by adding the following to your `.env` file:
   ```
   # Self-hosted LLM configuration
   OPENWEBUI_API_URL=http://your-openwebui-server:5000
   OPENWEBUI_API_KEY=your_openwebui_api_key
   ```

4. Build the system containers:
   ```bash
   docker compose build
   ```

5. Start the containers:
   ```bash
   docker compose up -d
   ```

6. Generate RSA keys for authentication (first time only):
   ```bash
   docker compose exec securitymanager node src/scripts/generate-keys.js
   ```

   **IMPORTANT SECURITY NOTE**: Never commit private keys to the repository. The `.gitignore` file is configured to exclude private keys, but always verify that sensitive files are not being committed.

7. On the host machine, the application will be available at [http://localhost:80](http://localhost:80).


### Usage

2. Create a new mission by providing a goal
3. Monitor the mission progress and interact with the system through the user interface

### First Steps After Installation

1. Access the frontend at `http://localhost:80`
2. Register a new account through the frontend interface
3. Start with a simple mission like "Create a basic todo list" to test the system
4. Monitor the agent creation and task execution through the UI
5. Review the Files tab to see the deliverables and shared files

### Example Missions

Here are some example missions that highlight the system's advanced, long-term, and adaptive capabilities:

1.  "Continuously monitor global climate data, identify emerging patterns, and generate weekly reports on potential environmental impacts and policy recommendations."
2.  "Develop and maintain a personalized learning curriculum for AI ethics, adapting content based on my progress, current events, and new research in the field."
3.  "Act as my strategic business advisor, analyzing market trends, competitor activities, and internal performance metrics to provide quarterly strategic recommendations for growth and innovation."
4.  "Orchestrate the end-to-end development lifecycle of a new software feature, from requirements gathering and design to coding, testing, deployment, and post-launch monitoring, ensuring adherence to best practices and continuous improvement."
5.  "Manage my digital presence across multiple platforms, curating content, engaging with my audience, and optimizing strategies based on performance analytics to foster community growth and brand recognition."

### Using Self-Hosted LLMs

Stage7 supports integration with self-hosted LLM models through various interfaces. Here's a quick overview:

1. **Supported Interfaces**:
   - OpenWebUI Interface (compatible with OpenWebUI, LM Studio, Ollama, etc.)
   - Direct Llama.cpp Interface
   - Hugging Face Text Generation Interface

2. **Basic Configuration**:
   - Add the following to your `.env` file:
     ```
     # For OpenWebUI or compatible servers
     OPENWEBUI_API_URL=http://your-openwebui-server:5000
     OPENWEBUI_API_KEY=your_openwebui_api_key
     ```

3. **Supported Models**:
   - Llama 3 (8B, 70B)
   - Mistral (7B, 8x7B)
   - Qwen (7B, 14B, 72B)
   - Phi-3 (3.8B, 14B)
   - Any other model compatible with the OpenAI API format

4. **Detailed Guide**:
   - For comprehensive instructions, see [SELF_HOSTED_LLM_GUIDE.md](SELF_HOSTED_LLM_GUIDE.md)

### Troubleshooting

Common issues and solutions:

1. **Connection Errors**
   - Verify all containers are running: `docker compose ps`
   - Check container logs: `docker compose logs [service-name]`
   - Ensure all required ports are available
   - For authentication issues: `docker compose logs securitymanager`

2. **LLM Integration Issues**
   - Verify API keys are correctly set in environment variables
   - Check Brain service logs for API response errors: `docker compose logs brain`
   - Ensure sufficient API credits/quota
   - For self-hosted LLMs, check network connectivity between containers and the LLM server
   - Verify the LLM server supports the OpenAI API format

3. **Performance Issues**
   - Monitor container resource usage: `docker stats`
   - Consider increasing container resource limits
   - Check Redis and MongoDB performance
   - For self-hosted LLMs, ensure the host has sufficient resources


## Development

### Project Structure

- `services/`: Contains individual service components
- `shared/`: Shared utilities and types used across services
- `services/mcsreact/`: React frontend application
- `errorhandler/`: Error handling utility - analyzes runtime errors and develops code improvements to address
- `docker-compose.yaml`: Docker Compose file for running the system

### Adding a New Service

1. Create a new directory under `services/`
2. Implement the service using the BaseEntity class from the shared library
3. Add the service to the Docker Compose file

## Contributing

### Code Style Guidelines

As stage7 was developed by LLMs, it has not always adhered to standards.  This is something that
will be addressed as the system stabilizes and matures.  You can help us avoid additional tech debts to resolve
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


## 🔌 Plugin Ecosystem

Stage7 features an enterprise-ready plugin ecosystem supporting multiple programming languages and deployment methods.

### Production Plugins (Ready to Use)


#### Core Production Plugins
1. **ACCOMPLISH** – Mission planning and goal achievement
2. **ASK_USER_QUESTION** – Interactive user input collection
3. **SCRAPE** – Web content extraction
4. **WEATHER** – Weather information retrieval
5. **TEXT_ANALYSIS** – Comprehensive text analysis
6. **API_CLIENT** – Generic REST API client for any third-party API (OpenAPI/REST)
7. **CODE_EXECUTOR** – Securely execute code snippets in Python/JavaScript
8. **DATA_TOOLKIT** – Parse, query, and transform JSON, CSV, SQL, and more
9. **SEARCH_PYTHON** – Internet search using SearchXNG
10. **TASK_MANAGER** – Self-planning, task and subtask management
11. **CHAT** – Interactive chat session management
12. **GET_USER_INPUT** – User input collection (form-based)
13. **FILE_OPS_PYTHON** – File operations and manipulation

#### Definition-Based Plugins (OpenAPI & MCP Tools)
- **OpenAPI Tools**: Integrate any OpenAPI 3.0+ compatible API as a plugin. Define endpoints, authentication, and action verbs via OpenAPI specs. Managed and executed like any other plugin.
- **MCP Tools**: Integrate proprietary or internal services as plugins using MCP tool definitions. Enables agents to call internal business logic or workflows as plugins.

### Plugin Development

#### Supported Plugin Types


1. **Python Plugins** – Direct execution with dependency management
2. **JavaScript Plugins** – Node.js sandboxed execution (legacy)
3. **Container Plugins** – Docker-based, any language, full isolation
4. **OpenAPI Tools** – External API integration via OpenAPI 3.0+ definitions
5. **MCP Tools** – Internal/proprietary service integration via MCP tool definitions

All plugin types are managed, discovered, and executed through a unified Plugin Marketplace and CapabilitiesManager.

#### Quick Start Guide

For detailed plugin development instructions, see:
- **Plugin Development Guide**: `docs/plugin-development-guide.md`
- **Deployment Guide**: `docs/deployment-guide.md`
- **Architecture Documentation**: `docs/gemini-cm-architecture-update.md`

#### Testing Your Plugins

Run the comprehensive plugin ecosystem test suite:
```bash
node scripts/test-plugin-ecosystem.js
```

### Plugin Development Best Practices


1. **Plugin Structure**
   - Follow the standard plugin template for your chosen language or definition format (OpenAPI/MCP)
   - Include comprehensive input/output definitions
   - Document dependencies, prerequisites, and authentication requirements
   - Provide usage examples and clear documentation

2. **Security Considerations**
   - Use proper authentication for service-to-service calls
   - Validate all inputs before processing
   - Follow principle of least privilege
   - Use container isolation for untrusted code

3. **Testing Requirements**
   - Unit tests for core functionality
   - Integration tests with the plugin ecosystem
   - Performance benchmarks and resource usage analysis
   - Error handling and edge case scenarios

### Security Guidelines

1. **Authentication and Authorization**
   - Stage7 uses RS256 asymmetric key authentication for service-to-service communication
   - RSA keys are generated during first-time setup and stored in the `services/security/keys` directory
   - The public key is distributed to all services for token verification
   - Each service has its own client secret defined in the environment variables
   - **CRITICAL**: Never commit private keys to the repository
   - If you suspect keys have been compromised, use the `regenerate-keys.js` script to create new keys
   - Always verify that `.gitignore` is properly configured to exclude sensitive files

2. **Code Security**
   - No hardcoded credentials
   - Proper input validation
   - Secure communication between services
   - Regular dependency updates

3. **Data Protection**
   - Proper handling of sensitive data
   - Compliance with data protection regulations
   - Secure storage practices

4. **Plugin Security**
   - All plugin types (code, OpenAPI, MCP) are signed using RSA keys
   - Signatures are verified before plugin execution
   - Sandbox or secure environment for all plugin execution, including external API calls

## Support

- GitHub Issues: Report bugs and feature requests
- Discussions: Ask questions and share ideas
- Wiki: Detailed documentation and guides
- Discord: Community chat and support

### AgentSet

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the AgentSet service.
**Output:**
- 200: `{ "status": "healthy", "timestamp": "string", "message": "string", "agentCount": "number" }`

#### GET /ready
**Description:** Checks if the AgentSet service is ready to accept requests.
**Output:**
- 200: `{ "ready": "boolean", "timestamp": "string", "message": "string", "registeredWithPostOffice": "boolean" }`

#### POST /message
**Description:** Handles messages for the AgentSet or specific agents.
**Input:**
```json
{
  "forAgent?": "string",
  "content": {
    "missionId?": "string",
    "[other message properties]": "any"
  },
  "missionId?": "string"
}
```
**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if message delivery fails)

#### POST /addAgent
**Description:** Adds a new agent to the set.
**Input:**
```json
{
  "agentId": "string",
  "actionVerb": "string",
  "inputs": "object",
  "missionId": "string",
  "missionContext": "string",
  "roleId?": "string",
  "roleCustomizations?": "any"
}
```
**Output:**
- 200: `{ "message": "string", "agentId": "string" }`

#### POST /createSpecializedAgent
**Description:** Creates a new specialized agent with a specific role.
**Input:**
```json
{
  "roleId": "string",
  "missionId": "string",
  "missionContext": "string"
}
```
**Output:**
- 200: `{ "agentId": "string" }`

#### POST /removeAgent
**Description:** Endpoint for agents to notify of their terminal state for removal from the AgentSet.
**Input:**
```json
{
  "agentId": "string",
  "status": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId or status are missing)
- 500: `{ "error": "string" }` (if processing removal fails)

#### POST /agent/:agentId/message
**Description:** Sends a message to a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Input:**
- Body: `any` (message object)
**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if message delivery fails)

#### GET /agent/:agentId
**Description:** Retrieves the state of a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `AgentState` object (detailed agent state)
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if fetching agent state fails)

#### GET /agent/:agentId/output
**Description:** Retrieves the final output of a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "agentId": "string", "status": "string", "finalOutput?": "any", "message?": "string", "lastCompletedStepId?": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if fetching output fails)

#### POST /pauseAgents
**Description:** Pauses all agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`

#### POST /abortAgents
**Description:** Signals all agents for a specific mission to abort.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`

#### POST /delegateTask
**Description:** Delegates a task to another agent.
**Input:**
```json
{
  "delegatorId": "string",
  "recipientId": "string",
  "request": {
    "taskId": "string",
    "taskType": "string",
    "description": "string",
    "inputs": "object",
    "deadline?": "string",
    "priority?": "string",
    "context?": "object"
  }
}
```
**Output:**
- 200: `{ "taskId": "string", "accepted": "boolean", "reason?": "string", "estimatedCompletion?": "string" }`
- 500: `{ "error": "string" }`

#### POST /taskUpdate
**Description:** Updates the status of a delegated task.
**Input:**
```json
{
  "taskId": "string",
  "status": "string",
  "result?": "any",
  "error?": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /conflictVote
**Description:** Submits a vote for a conflict resolution.
**Input:**
```json
{
  "conflictId": "string",
  "agentId": "string",
  "vote": "any",
  "explanation?": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /resolveConflict
**Description:** Resolves a conflict.
**Input:**
```json
{
  "conflictId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### GET /agent/:agentId/conflicts
**Description:** Retrieves conflicts involving a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "conflicts": "array" }`
- 500: `{ "error": "string" }`

#### GET /conflicts/unresolved
**Description:** Retrieves all unresolved conflicts.
**Output:**
- 200: `{ "conflicts": "array" }`
- 500: `{ "error": "string" }`

#### POST /agent/:agentId/role
**Description:** Assigns a role to an agent.
**Parameters:**
- `agentId`: string (in URL)
**Input:**
```json
{
  "roleId": "string",
  "customizations?": "object"
}
```
**Output:**
- 200: `{ "specialization": "object" }`
- 500: `{ "error": "string" }`

#### GET /agent/:agentId/specialization
**Description:** Retrieves the specialization details for a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "specialization": "object" }`
- 500: `{ "error": "string" }`

#### GET /role/:roleId/agents
**Description:** Retrieves agents assigned to a specific role.
**Parameters:**
- `roleId`: string (in URL)
**Output:**
- 200: `{ "agents": "array" }`
- 500: `{ "error": "string" }`

#### GET /roles
**Description:** Retrieves all available roles.
**Output:**
- 200: `{ "roles": "array" }`
- 500: `{ "error": "string" }`

#### POST /roles
**Description:** Creates a new role.
**Input:**
- Body: `AgentRole` object (excluding `id`)
**Output:**
- 200: `{ "role": "object" }`
- 500: `{ "error": "string" }`

#### POST /findBestAgent
**Description:** Finds the best agent for a given task based on role, knowledge domains, and mission.
**Input:**
```json
{
  "roleId": "string",
  "knowledgeDomains?": "string[]",
  "missionId?": "string"
}
```
**Output:**
- 200: `{ "agentId": "string" }`
- 500: `{ "error": "string" }`

#### POST /findAgentWithRole
**Description:** Finds an agent with a specific role within a mission.
**Input:**
```json
{
  "roleId": "string",
  "missionId?": "string"
}
```
**Output:**
- 200: `{ "agentId": "string" | null }`
- 500: `{ "error": "string" }`

#### POST /agent/:agentId/prompt
**Description:** Generates a specialized system prompt for an agent based on a task description.
**Parameters:**
- `agentId`: string (in URL)
**Input:**
```json
{
  "taskDescription": "string"
}
```
**Output:**
- 200: `{ "prompt": "string" }`
- 500: `{ "error": "string" }`

#### GET /knowledgeDomains
**Description:** Retrieves all available knowledge domains.
**Output:**
- 200: `{ "domains": "array" }`
- 500: `{ "error": "string" }`

#### POST /knowledgeDomains
**Description:** Creates a new knowledge domain.
**Input:**
- Body: `KnowledgeDomain` object (excluding `id`)
**Output:**
- 200: `{ "domain": "object" }`
- 500: `{ "error": "string" }`

#### POST /knowledgeItems
**Description:** Adds a new knowledge item to a domain.
**Input:**
- Body: `KnowledgeItem` object (excluding `id`, `createdAt`, `updatedAt`, `version`)
**Output:**
- 200: `{ "item": "object" }`
- 500: `{ "error": "string" }`

#### POST /knowledgeItems/query
**Description:** Queries knowledge items based on specified options.
**Input:**
```json
{
  "domains?": "string[]",
  "tags?": "string[]",
  "query?": "string",
  "limit?": "number",
  "offset?": "number"
}
```
**Output:**
- 200: `{ "items": "array" }`
- 500: `{ "error": "string" }`

#### POST /domainContext
**Description:** Generates domain-specific context for a task.
**Input:**
```json
{
  "domainIds": "string[]",
  "taskDescription": "string"
}
```
**Output:**
- 200: `{ "context": "string" }`
- 500: `{ "error": "string" }`

#### POST /importKnowledge
**Description:** Imports knowledge from an external source into a domain.
**Input:**
```json
{
  "domainId": "string",
  "source": "string",
  "format": "'url' | 'file' | 'api'"
}
```
**Output:**
- 200: `{ "items": "array" }`
- 500: `{ "error": "string" }`

#### POST /collaboration/message
**Description:** Handles collaboration messages from other agent sets.
**Input:**
- Body: `CollaborationMessage` object
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /resumeAgents
**Description:** Resumes all agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`

#### POST /resumeAgent
**Description:** Resumes a specific agent.
**Input:**
```json
{
  "agentId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId is missing)
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### POST /abortAgent
**Description:** Aborts a specific agent.
**Input:**
```json
{
  "agentId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId is missing)
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### GET /statistics/:missionId
**Description:** Retrieves statistics for all agents in a mission.
**Parameters:**
- `missionId`: string (in URL)
**Output:**
- 200: `{ "agentsByStatus": "object", "agentsCount": "number", "memoryUsage": "object", "lastGC": "number", "totalSteps": "number" }`
- 400: `string` (if missionId is not provided)
- 500: `{ "error": "string" }`

#### POST /updateFromAgent
**Description:** Updates agent status and statistics from an agent.
**Input:**
```json
{
  "agentId": "string",
  "status": "string",
  "statistics?": "object"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### GET /agent/step/:stepId
**Description:** Retrieves details for a specific step.
**Parameters:**
- `stepId`: string (in URL)
**Output:**
- 200: `{ "verb": "string", "description": "string", "status": "string", "dependencies": "array", "inputReferences": "object", "inputValues": "object", "results": "any", "agentId": "string" }`
- 400: `{ "error": "string" }` (if stepId is missing)
- 404: `{ "error": "string" }` (if step not found)
- 500: `{ "error": "string" }`

#### POST /saveAgent
**Description:** Saves the current state of an agent to the persistence layer.
**Input:**
```json
{
  "agentId": "string"
}
```
**Output:**
- 200: `{ "message": "string", "agentId": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

### Brain

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the Brain service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### POST /chat
**Description:** Processes a chat request using a suitable LLM model.
**Input:**
```json
{
  "exchanges": "ExchangeType[]",
  "optimization?": "OptimizationType",
  "optionals?": "Record<string, any>",
  "conversationType?": "LLMConversationType"
}
```
**Output:**
- 200: `{ "result": "string", "confidence": "number", "model": "string", "requestId": "string" }`
- 500: `{ "error": "string" }`

#### POST /generate
**Description:** Generates content using a specified or automatically selected LLM model.
**Input:**
```json
{
  "modelName?": "string",
  "optimization?": "OptimizationType",
  "conversationType": "LLMConversationType",
  "convertParams": {
    "max_length?": "number",
    "[other conversion parameters]": "any"
  }
}
```
**Output:**
- 200: `{ "result": "string", "mimeType": "string" }`
- 500: `{ "error": "string" }`

#### GET /getLLMCalls
**Description:** Retrieves the total number of LLM calls made.
**Output:**
- 200: `{ "llmCalls": "number" }`

#### GET /models
**Description:** Retrieves a list of all available LLM models.
**Output:**
- 200: `{ "models": "string[]" }`

#### POST /performance/reset-blacklists
**Description:** Resets all blacklisted models, making them available for selection again.
**Input:** None
**Output:**
- 200: `{ "success": "boolean", "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /feedback
**Description:** Processes feedback related to model performance or plan generation.
**Input:**
```json
{
  "type": "string",
  "success": "boolean",
  "quality_score?": "number",
  "plan_steps?": "any",
  "attempt_number?": "number",
  "error_type?": "string",
  "feedback_scores?": "object"
}
```
**Output:**
- 200: `{ "success": "boolean", "message": "string", "feedback_type": "string", "feedback_success": "boolean" }`
- 400: `{ "error": "string" }` (if unknown feedback type)
- 500: `{ "error": "string" }`

### CapabilitiesManager

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### POST /executeAction
**Description:** Executes a specific action verb (plugin, OpenAPI tool, or MCP tool).
**Input:**
```json
{
  "actionVerb": "string",
  "inputValues": "object",
  "outputs?": "object"
}
```
**Output:**
- 200: `PluginOutput[]` (serialized array of plugin output objects)
- 400: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }` (for invalid actionVerb or input validation errors)
- 401: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }` (for authentication errors)
- 500: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }` (for internal errors or plugin execution failures)

#### GET /health
**Description:** Checks the health status of the CapabilitiesManager service.
**Output:**
- 200: `{ "status": "string", "service": "string", "initialization": "object" }`

#### GET /ready
**Description:** Checks if the CapabilitiesManager service is ready to accept requests.
**Output:**
- 200: `{ "ready": "boolean", "service": "string", "initialization": "object" }` (if ready)
- 503: `{ "ready": "boolean", "service": "string", "initialization": "object" }` (if not ready)

#### GET /plugins
**Description:** Retrieves a list of all registered plugins.
**Query Parameters:**
- `repository?`: `string` (e.g., "local", "github", "librarian-definition")
**Output:**
- 200: `{ "plugins": "PluginLocator[]" }`

#### GET /plugins/:id
**Description:** Retrieves a specific plugin by its ID.
**Parameters:**
- `id`: string (in URL)
**Query Parameters:**
- `repository?`: `string`
**Output:**
- 200: `{ "plugin": "PluginManifest" | "DefinitionManifest" }`
- 404: `{ "error": "string" }`

#### POST /plugins
**Description:** Stores a new plugin or updates an existing one.
**Input:**
- Body: `PluginManifest` or `DefinitionManifest` object
**Output:**
- 201: `{ "success": "boolean" }` (for new plugin)
- 200: `{ "success": "boolean" }` (for update)
- 400: `{ "error": "string", "details": "string" }`

#### PUT /plugins/:id
**Description:** Updates an existing plugin by its ID.
**Parameters:**
- `id`: string (in URL)
**Input:**
- Body: `PluginManifest` or `DefinitionManifest` object
**Output:**
- 200: `{ "success": "boolean" }`
- 400: `{ "error": "string", "details": "string" }`

#### DELETE /plugins/:id
**Description:** Deletes a plugin by its ID.
**Parameters:**
- `id`: string (in URL)
**Query Parameters:**
- `repository?`: `string` (e.g., "librarian-definition")
**Output:**
- 200: `{ "success": "boolean" }`
- 400: `{ "error": "string", "details": "string" }`

#### GET /pluginRepositories
**Description:** Retrieves a list of active plugin repositories.
**Output:**
- 200: `{ "repositories": "object[]" }`

#### POST /message
**Description:** Handles incoming messages for the CapabilitiesManager.
**Input:**
- Body: `Message` object (structure depends on the message type)
**Output:**
- 200: `{ "status": "string" }`
- 500: `{ "error": "object" }` (structured error object)

#### GET /availablePlugins
**Description:** Retrieves a list of all available plugins (code plugins, OpenAPI tools, and MCP tools).
**Output:**
- 200: `PluginLocator[]` (array of plugin locator objects)
- 500: `{ "error": "object" }` (structured error object)

#### POST /generatePluginContext
**Description:** Generates intelligent plugin context based on a goal and constraints.
**Input:**
```json
{
  "goal": "string",
  "constraints?": "object"
}
```
**Output:**
- 200: `object` (generated context)
- 400: `{ "error": "string" }` (if goal is missing or invalid)
- 500: `{ "error": "object" }` (structured error object)

### Engineer

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the Engineer service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### GET /ready
**Description:** Checks if the Engineer service is ready to accept requests.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### POST /createPlugin
**Description:** Creates a new plugin based on the provided verb, context, guidance, and optional language.
**Input:**
```json
{
  "verb": "string",
  "context": "object",
  "guidance": "string",
  "language?": "string"
}
```
**Output:**
- 200: `PluginDefinition` object or empty object `{}`
- 500: `{ "error": "string" }`

#### POST /tools/openapi
**Description:** Registers a new OpenAPI tool.
**Input:**
```json
{
  "name": "string",
  "description?": "string",
  "specUrl": "string",
  "authentication?": "object",
  "metadata?": "object",
  "baseUrl?": "string"
}
```
**Output:**
- 200: `{ "success": "boolean", "tool?": "OpenAPITool", "errors?": "string[]", "warnings?": "string[]", "discoveredOperations?": "array" }`
- 500: `{ "error": "string" }`

#### GET /tools/openapi/:id
**Description:** Retrieves a specific OpenAPI tool by its ID.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: `OpenAPITool` object
- 404: `{ "error": "string" }` (if tool not found)
- 500: `{ "error": "string" }`

#### POST /validate
**Description:** Validates a plugin manifest and optionally its code.
**Input:**
```json
{
  "manifest": "object",
  "code?": "string"
}
```
**Output:**
- 200: `{ "valid": "boolean", "issues": "string[]" }`
- 500: `{ "error": "string" }`

#### POST /message
**Description:** Handles incoming messages for the Engineer.
**Input:**
- Body: `Message` object (structure depends on the message type)
**Output:**
- 200: `{ "status": "string" }`

#### GET /statistics
**Description:** Retrieves statistics about newly created plugins.
**Output:**
- 200: `{ "newPlugins": "string[]" }`

### Librarian

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the Librarian service.
**Output:**
- 200: `{ "status": "healthy", "timestamp": "string", "message": "string" }`

#### POST /assets/:collection/:id
**Description:** Stores a large asset (e.g., file, binary data) in a specified collection.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Input:** Raw binary data or file stream in the request body. `Content-Type` header should be set.
**Output:**
- 201: `{ "message": "string", "id": "string", "size": "number" }`
- 500: `{ "error": "string" }`

#### GET /assets/:collection/:id
**Description:** Retrieves a large asset from a specified collection.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Output:**
- 200: Raw binary data or file stream. `Content-Type` header will be set based on stored metadata.
- 404: `{ "error": "string" }` (if asset not found)
- 500: `{ "error": "string" }`

#### POST /storeData
**Description:** Stores data in either MongoDB or Redis.
**Input:**
```json
{
  "id?": "string",
  "data": "any",
  "storageType": "'mongo' | 'redis'",
  "collection?": "string"
}
```
**Output:**
- 200: `{ "status": "string", "id": "string" }`
- 400: `{ "error": "string" }` (if data is missing or if storage type is invalid)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadData/:id
**Description:** Loads data from either MongoDB or Redis by ID.
**Parameters:**
- `id`: string (in URL)
**Query:**
- `storageType`: "'mongo' | 'redis'" (default: "'mongo'")
- `collection`: `string` (default: "'mcsdata'")
**Output:**
- 200: `{ "data": "any" }`
- 400: `{ "error": "string" }` (if ID is missing or storage type is invalid)
- 404: `{ "error": "string" }` (if data is not found)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadData
**Description:** Loads data from MongoDB by query parameters. This endpoint is used for specific collections that allow loading all items without an explicit ID.
**Query:**
- `storageType`: "'mongo'" (only mongo supported for this endpoint)
- `collection`: `string` (e.g., "'domain_knowledge'", "'knowledge_domains'", "'agent_specializations'", "'agents'")
**Output:**
- 200: `any[]` (array of data objects)
- 400: `{ "error": "string" }` (if collection or storageType is invalid)
- 500: `{ "error": "string", "details": "string" }`

#### POST /queryData
**Description:** Queries data from MongoDB.
**Input:**
```json
{
  "collection": "string",
  "query": "object",
  "limit?": "number"
}
```
**Output:**
- 200: `{ "data": "any[]" }`
- 400: `{ "error": "string" }` (if collection or query is missing)
- 500: `{ "error": "string", "details": "string" }`

#### GET /getDataHistory/:id
**Description:** Retrieves the version history of data.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: `{ "history": "DataVersion[]" }`
- 400: `{ "error": "string" }` (if ID is missing)
- 500: `{ "error": "string", "details": "string" }`

#### POST /searchData
**Description:** Searches data in MongoDB with advanced options.
**Input:**
```json
{
  "collection": "string",
  "query?": "object",
  "options?": "object"
}
```
**Output:**
- 200: `{ "data": "any[]" }`
- 400: `{ "error": "string" }` (if collection is missing)
- 500: `{ "error": "string" }`

#### DELETE /deleteData/:id
**Description:** Deletes data from both MongoDB and Redis.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if ID is missing)
- 500: `{ "error": "string" }`

#### POST /storeWorkProduct
**Description:** Stores a work product in MongoDB.
**Input:**
```json
{
  "agentId": "string",
  "stepId": "string",
  "data": "any"
}
```
**Output:**
- 200: `{ "status": "string", "id": "string" }`
- 400: `{ "error": "string" }` (if agentId or stepId is missing)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadWorkProduct/:stepId
**Description:** Loads a work product from MongoDB.
**Parameters:**
- `stepId`: string (in URL)
**Output:**
- 200: `{ "data": "WorkProduct" }`
- 400: `{ "error": "string" }` (if stepId is missing)
- 404: `{ "error": "string" }` (if work product is not found)
- 500: `{ "error": "string", "details": "string" }`

#### GET /loadAllWorkProducts/:agentId
**Description:** Loads all work products for a specific agent from MongoDB.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `WorkProduct[]` (array of work product objects)
- 400: `{ "error": "string" }` (if agentId is missing)
- 500: `{ "error": "string" }`

#### GET /getSavedMissions
**Description:** Retrieves saved missions for a user.
**Input:**
```json
{
  "userId": "string"
}
```
**Output:**
- 200: `{ "id": "string", "name": "string" }[]`
- 500: `{ "error": "string", "details": "string" }`

#### DELETE /deleteCollection
**Description:** Deletes an entire collection from MongoDB.
**Query:**
- `collection`: string (in query, name of the collection to delete)
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if collection is missing)
- 500: `{ "error": "string" }`

### MissionControl

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### POST /message
**Description:** Handles various types of messages for mission control operations.
**Input:**
```json
{
  "type": "MessageType",
  "sender": "string",
  "content": "any",
  "clientId": "string",
  "missionId?": "string",
  "userId?": "string",
  "missionName?": "string"
}
```
**Output:**
- 200: `{ "message": "string", "missionId?": "string", "status?": "string", "name?": "string", "result?": "any", "mission?": "object" }`
- 500: `{ "error": "string", "message": "string" }`

**Message Types and their corresponding actions (handled internally by `processMessage`):**

*   **MessageType.CREATE_MISSION**
    *   Creates a new mission.
    *   Required `content`: `{ "goal": "string", "name?": "string", "missionContext?": "string" }`
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.PAUSE**
    *   Pauses an existing mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.RESUME**
    *   Resumes a paused mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.ABORT**
    *   Aborts an existing mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **MessageType.SAVE**
    *   Saves the current state of a mission.
    *   Required: `missionId` in the request body.
    *   Optional: `missionName` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string", "name": "string" }`
*   **MessageType.LOAD**
    *   Loads a previously saved mission.
    *   Required: `missionId` in the request body.
    *   Returns: `{ "missionId": "string", "status": "string", "mission": "object" }`
*   **MessageType.USER_MESSAGE**
    *   Handles a user message for a specific mission.
    *   Required `content`: `{ "missionId": "string", "message": "string" }`
    *   Returns: `{ "missionId": "string", "status": "string" }`
*   **Other Message Types**
    *   Handled by the base class.
    *   Returns: `{ "status": "string" }`

#### POST /agentStatisticsUpdate
**Description:** Handles updates to agent statistics from the TrafficManager.
**Input:**
```json
{
  "agentId": "string",
  "missionId": "string",
  "statistics": "object",
  "timestamp": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if missionId is invalid)
- 500: `{ "error": "string" }`

#### POST /userInputResponse
**Description:** Handles responses to pending user input requests.
**Input:**
```json
{
  "requestId": "string",
  "response": "any"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }` (if no pending user input for requestId)
- 500: `{ "error": "string" }`

### PostOffice

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the PostOffice service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### GET /ready
**Description:** Checks if the PostOffice service is ready to accept requests.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### POST /assets/:collection/:id
**Description:** Stores a large asset (e.g., file, binary data) via the FileUploadManager.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Input:** Raw binary data or file stream in the request body. `Content-Type` header should be set.
**Output:**
- 201: `{ "message": "string", "id": "string", "size": "number" }`
- 500: `{ "error": "string" }`

#### GET /assets/:collection/:id
**Description:** Retrieves a large asset via the FileUploadManager.
**Parameters:**
- `collection`: string (in URL)
- `id`: string (in URL)
**Output:**
- 200: Raw binary data or file stream. `Content-Type` header will be set based on stored metadata.
- 404: `{ "error": "string" }` (if asset not found)
- 500: `{ "error": "string" }`

#### POST /registerComponent
**Description:** Registers a new component with the PostOffice.
**Input:**
```json
{
  "id": "string",
  "type": "string",
  "url": "string"
}
```
**Output:**
- 200: `{ "status": "string" }`
- 400: `{ "error": "string" }` (if missing fields)
- 500: `{ "error": "string" }`

#### POST /message
**Description:** Handles incoming messages for routing to other components.
**Input:**
- Body: `Message` object (structure depends on the message type)
**Output:**
- 200: `{ "status": "string" }`

#### POST /sendMessage
**Description:** Handles incoming messages from clients for routing.
**Input:**
- Body: `Message` object
**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if recipient not found)
- 500: `{ "error": "string" }`

#### POST /securityManager/*
**Description:** Routes security-related requests to the SecurityManager.
**Input:** Varies based on the specific security request
**Output:** Depends on the SecurityManager's response

#### GET /requestComponent
**Description:** Requests information about registered components.
**Query Parameters:**
- `id?`: string (component ID)
- `type?`: string (component type)
**Output:**
- 200: `{ "component": "Component" }` (if ID provided) or `{ "components": "Component[]" }` (if type provided)
- 400: `{ "error": "string" }` (if neither ID nor type provided)
- 404: `{ "error": "string" }` (if component not found)

#### GET /getServices
**Description:** Retrieves URLs of registered services.
**Output:**
- 200: `{ "[serviceName: string]": "string" }`

#### POST /submitUserInput
**Description:** Submits user input for a specific request, optionally including files.
**Input:**
```json
{
  "requestId": "string",
  "response": "any"
}
```
**Files (multipart/form-data):**
- `file`: `Express.Multer.File[]` (if `answerType` is 'file')
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if files missing for 'file' answerType)
- 404: `{ "error": "string" }` (if user input request not found)
- 500: `{ "error": "string" }`

#### POST /sendUserInputRequest
**Description:** Sends a user input request to connected clients.
**Input:**
```json
{
  "question": "string",
  "answerType?": "string",
  "choices?": "string[]"
}
```
**Output:**
- 200: `{ "request_id": "string" }`
- 500: `{ "error": "string" }`

#### POST /createMission
**Description:** Creates a new mission by forwarding the request to MissionControl.
**Input:**
```json
{
  "goal": "string",
  "clientId": "string"
}
```
**Headers:**
- `Authorization`: `string` (JWT token)
**Output:**
- 200: Response from MissionControl
- 401: `{ "error": "string" }`
- 504: `{ "error": "string" }` (if MissionControl is unavailable)

#### POST /loadMission
**Description:** Loads a previously saved mission by forwarding the request to MissionControl.
**Input:**
```json
{
  "missionId": "string",
  "clientId": "string"
}
```
**Output:**
- 200: Response from MissionControl
- 500: `{ "error": "string" }`

#### GET /librarian/retrieve/:id
**Description:** Retrieves a work product from the Librarian.
**Parameters:**
- `id`: string (in URL)
**Output:**
- 200: Work product data
- 404: `{ "error": "string" }`
- 500: `{ "error": "string" }`

#### GET /getSavedMissions
**Description:** Retrieves saved missions for the authenticated user.
**Headers:**
- `Authorization`: `string` (JWT token)
**Output:**
- 200: Array of saved mission objects
- 401: `{ "error": "string" }`
- 500: `{ "error": "string" }`

#### GET /step/:stepId
**Description:** Retrieves details for a specific step by forwarding the request to AgentSet.
**Parameters:**
- `stepId`: string (in URL)
**Output:**
- 200: Step details object
- 400: `{ "error": "string" }`
- 404: `{ "error": "string" }`
- 500: `{ "error": "string" }`

#### GET /brain/performance
**Description:** Retrieves model performance data from the Brain service.
**Output:**
- 200: `{ "success": "boolean", "performanceData": "array" }`
- 404: `{ "error": "string" }` (if Brain service not available)
- 500: `{ "error": "string" }`

#### GET /brain/performance/rankings
**Description:** Retrieves model rankings based on conversation type and metric from the Brain service.
**Query Parameters:**
- `conversationType?`: `string` (e.g., "TextToText", "TextToCode")
- `metric?`: `string` (e.g., "overall", "successRate", "averageLatency")
**Output:**
- 200: `{ "success": "boolean", "rankings": "array" }`
- 404: `{ "error": "string" }` (if Brain service not available)
- 500: `{ "error": "string" }`

#### POST /brain/evaluations
**Description:** Submits model evaluation data to the Brain service.
**Input:**
```json
{
  "modelName": "string",
  "conversationType": "string",
  "requestId": "string",
  "prompt": "string",
  "response": "string",
  "scores": "object"
}
```
**Output:**
- 200: `{ "success": "boolean" }`
- 500: `{ "error": "string" }`

#### Plugin Management Endpoints (handled by PluginManager)
*   **POST /plugins**
*   **GET /plugins**
*   **GET /plugins/:id**
*   **PUT /plugins/:id**
*   **DELETE /plugins/:id**
(Refer to CapabilitiesManager API documentation for details on these endpoints, as they are proxied through PostOffice)

### SecurityManager

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the SecurityManager service.
**Output:**
- 200: `{ "status": "string", "message": "string" }`

#### GET /public-key
**Description:** Retrieves the public key used for JWT verification.
**Output:**
- 200: `string` (Public key in PEM format)
- 500: `{ "error": "string" }`

#### POST /register
**Description:** Registers a new user.
**Input:**
```json
{
  "email": "string",
  "password": "string",
  "firstName?": "string",
  "lastName?": "string",
  "username?": "string",
  "name?": "string"
}
```
**Output:**
- 201: `{ "message": "string", "accessToken": "string", "refreshToken": "string", "user": "object" }`
- 400: `{ "message": "string" }` (if email/password missing or email already registered)
- 500: `{ "message": "string" }`

#### POST /login
**Description:** Authenticates a user and returns JWT tokens.
**Input:**
```json
{
  "email": "string",
  "password": "string"
}
```
**Output:**
- 200: `{ "message": "string", "accessToken": "string", "refreshToken": "string", "user": "object", "requireMfa?": "boolean", "userId?": "string", "tempToken?": "string" }`
- 400: `{ "message": "string" }` (if email/password missing)
- 401: `{ "message": "string" }` (if authentication fails)
- 403: `{ "message": "string" }` (if account locked)
- 500: `{ "message": "string" }`

#### POST /logout
**Description:** Logs out a user by revoking their tokens.
**Input:**
```json
{
  "revokeAll?": "boolean"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 401: `{ "message": "string" }` (if authentication required)
- 500: `{ "message": "string" }`

#### POST /auth/refresh-token
**Description:** Refreshes an expired access token using a refresh token.
**Input:**
```json
{
  "refreshToken": "string"
}
```
**Output:**
- 200: `{ "message": "string", "accessToken": "string" }`
- 400: `{ "message": "string" }` (if refresh token missing)
- 401: `{ "message": "string" }` (if refresh token is invalid or expired)
- 500: `{ "message": "string" }`

#### POST /verify
**Description:** Verifies a JWT token.
**Input:**
- Body: `{ "token?": "string" }` (optional, token can also be in Authorization header)
**Headers:**
- `Authorization`: `Bearer [token]`
**Output:**
- 200: `{ "valid": "boolean", "user": "object" }`
- 400: `{ "valid": "boolean", "error": "string" }` (if no token provided or invalid format)
- 401: `{ "valid": "boolean", "error": "string" }` (if token is invalid, expired, or revoked)
- 500: `{ "valid": "boolean", "error": "string" }`

#### POST /auth/service
**Description:** Authenticates a service component and issues a JWT token.
**Input:**
```json
{
  "componentType": "string",
  "clientSecret": "string"
}
```
**Output:**
- 200: `{ "authenticated": "boolean", "token": "string" }`
- 401: `{ "authenticated": "boolean", "error": "string" }` (if authentication fails)
- 500: `{ "error": "string" }`

#### POST /verifyMfaToken
**Description:** Verifies an MFA token during login.
**Input:**
```json
{
  "userId": "string",
  "token": "string"
}
```
**Output:**
- 200: `{ "message": "string", "accessToken": "string", "refreshToken": "string", "user": "object" }`
- 400: `{ "message": "string" }` (if userId or token missing)
- 401: `{ "message": "string" }` (if invalid MFA token)
- 500: `{ "message": "string" }`

#### POST /verifyEmail
**Description:** Verifies a user's email address using a verification token.
**Input:**
```json
{
  "token": "string"
}
```
**Output:**
- 200: `{ "message": "string", "user": "object" }`
- 400: `{ "message": "string" }` (if token missing)
- 401: `{ "message": "string" }` (if invalid or expired token)
- 500: `{ "message": "string" }`

#### POST /requestPasswordReset
**Description:** Requests a password reset email for a user.
**Input:**
```json
{
  "email": "string"
}
```
**Output:**
- 200: `{ "message": "string" }` (always returns success to prevent email enumeration)
- 400: `{ "message": "string" }` (if email missing)

#### POST /resetPassword
**Description:** Resets a user's password using a reset token.
**Input:**
```json
{
  "token": "string",
  "newPassword": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if token or newPassword missing)
- 401: `{ "message": "string" }` (if invalid or expired token)
- 500: `{ "message": "string" }`

#### POST /changePassword
**Description:** Changes the authenticated user's password.
**Input:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if passwords missing)
- 401: `{ "message": "string" }` (if authentication required or current password incorrect)
- 500: `{ "message": "string" }`

#### POST /enableMfa
**Description:** Initiates the MFA setup process for the authenticated user.
**Input:** None
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string", "mfaSecret": "string", "qrCodeUrl": "string" }`
- 401: `{ "message": "string" }` (if authentication required)
- 500: `{ "message": "string" }`

#### POST /verifyMfaSetup
**Description:** Verifies the MFA setup for the authenticated user.
**Input:**
```json
{
  "token": "string"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if token missing)
- 401: `{ "message": "string" }` (if authentication required or invalid MFA token)
- 500: `{ "message": "string" }`

#### POST /disableMfa
**Description:** Disables MFA for the authenticated user.
**Input:**
```json
{
  "token": "string"
}
```
**Headers:**
- `Authorization`: `Bearer [accessToken]`
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "message": "string" }` (if token missing)
- 401: `{ "message": "string" }` (if authentication required or invalid MFA token)
- 500: `{ "message": "string" }`

## TrafficManager

**Note:** The API documentation provided below is a snapshot of the available endpoints and their expected inputs/outputs. For the most accurate and up-to-date API specifications, please refer directly to the service code.

#### GET /health
**Description:** Checks the health status of the TrafficManager service.
**Output:**
- 200: `{ "status": "ok", "message": "string" }`

#### GET /ready
**Description:** Checks if the TrafficManager service is ready to accept requests.
**Output:**
- 200: `{ "status": "ok", "message": "string" }`

#### POST /message
**Description:** Handles incoming messages for the TrafficManager, potentially forwarding them to specific agents.
**Input:**
```json
{
  "type": "MessageType",
  "sender": "string",
  "content": "any",
  "forAgent?": "string"
}
```
**Output:**
- 200: `{ "status": "string" }` (e.g., "Message forwarded to agent", "Message received and processed by TrafficManager")
- 500: `{ "error": "string" }`

#### POST /createAgent
**Description:** Creates a new agent and assigns it to an AgentSet.
**Input:**
```json
{
  "actionVerb": "string",
  "inputs": "object",
  "dependencies?": "string[]",
  "missionId": "string",
  "missionContext": "string"
}
```
**Output:**
- 200: `{ "message": "string", "agentId": "string", "response?": "any" }`
- 500: `{ "error": "string" }`

#### POST /pauseAgents
**Description:** Pauses agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /abortAgents
**Description:** Aborts agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### POST /resumeAgents
**Description:** Resumes paused agents for a specific mission.
**Input:**
```json
{
  "missionId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### GET /getAgentStatistics/:missionId
**Description:** Retrieves agent statistics for a specific mission.
**Parameters:**
- `missionId`: string (in URL)
**Output:**
- 200: `TrafficManagerStatistics` object:
```json
{
  "agentStatisticsByType": {
    "totalAgents": "number",
    "agentCountByStatus": "object",
    "agentSetCount": "number"
  },
  "agentStatisticsByStatus": "object"
}
```
- 400: `string` (if missionId is not provided)
- 500: `{ "error": "string" }`

#### POST /checkBlockedAgents
**Description:** Checks for blocked agents and resumes them if their dependencies are met.
**Input:**
```json
{
  "completedAgentId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if completedAgentId is missing)
- 500: `{ "error": "string" }`

#### GET /dependentAgents/:agentId
**Description:** Retrieves agents that depend on a specific agent.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `string[]` (array of dependent agent IDs)
- 500: `{ "error": "string" }`

#### POST /distributeUserMessage
**Description:** Distributes a user message to relevant agents within a mission.
**Input:**
```json
{
  "type": "MessageType.USER_MESSAGE",
  "sender": "user",
  "recipient": "agents",
  "content": {
    "missionId": "string",
    "message": "string"
  },
  "clientId": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### GET /getAgentLocation/:agentId
**Description:** Retrieves the AgentSet URL where a specific agent is located.
**Parameters:**
- `agentId`: string (in URL)
**Output:**
- 200: `{ "agentId": "string", "agentSetUrl": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }`

#### POST /updateAgentLocation
**Description:** Updates the location (AgentSet URL) of an agent.
**Input:**
```json
{
  "agentId": "string",
  "agentSetUrl": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if agentId or agentSetUrl are missing)
- 500: `{ "error": "string" }`

#### POST /agentStatisticsUpdate
**Description:** Handles agent statistics updates from AgentSets and forwards them to MissionControl.
**Input:**
```json
{
  "agentId": "string",
  "status": "string",
  "statistics?": "object",
  "missionId": "string",
  "timestamp?": "string"
}
```
**Output:**
- 200: `{ "message": "string" }`
- 500: `{ "error": "string" }`

#### GET /mission/:missionId/roster
**Description:** Retrieves the roster of agents currently active in a specific mission.
**Parameters:**
- `missionId`: string (in URL)
**Output:**
- 200: `Agent[]` (array of agent objects)
- 400: `{ "error": "string" }` (if missionId is missing)
- 500: `{ "error": "string" }`
