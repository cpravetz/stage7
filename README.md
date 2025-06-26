# stage7 - A self-aware, self-optimizing, scalable, and flexible system for managing and executing complex missions using Large Language Models (LLMs) and custom plugins.

## Overview

stage7 is an advanced, self-modifying system designed to manage and execute complex missions using Large Language Models (LLMs) and custom plugins. The system is composed of several independent Node.js instances that interact with each other to collectively manage agents, process LLM conversations, and complete given missions.

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
- **Multi-Language Support**: Develop plugins in Python, JavaScript, or any language via Docker containers
- **Production-Ready Plugins**: 5 ready-to-use plugins (ACCOMPLISH, GET_USER_INPUT, SCRAPE, WEATHER, TEXT_ANALYSIS)
- **Automated Plugin Creation**: Engineer service generates plugins automatically based on requirements
- **Plugin Marketplace**: Discover, distribute, and manage plugins across the ecosystem

### Advanced AI Capabilities
- **Self-modifying**: The system can create new plugins for itself using AI
- **Reflective**: Analyzes runtime errors and develops code improvements to address issues
- **Self-optimizing**: Uses context to route LLM conversations to the best available LLM for processing
- **Mission Planning**: ACCOMPLISH plugin creates comprehensive plans for complex goals

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
5. Review the work products tab to see mission results

### Example Missions

Here are some example missions to get you started:

1. "Research the latest trends in renewable energy and create a summary report"
2. "Analyze the Python code in my GitHub repository and suggest improvements"
3. "Create a marketing plan for a new mobile app"

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

1. **ACCOMPLISH** - Mission planning and goal achievement
   - Creates comprehensive plans for complex goals
   - Integrates with Brain service for AI-powered planning
   - Supports both direct answers and multi-step plans

2. **GET_USER_INPUT** - Interactive user input collection
   - Collects user input via PostOffice service
   - Supports multiple choice questions and validation
   - Handles timeouts and cancellation

3. **SCRAPE** - Web content extraction
   - Extracts content from web pages using BeautifulSoup4
   - Includes rate limiting and respectful scraping
   - Supports CSS selectors and attribute extraction

4. **WEATHER** - Weather information retrieval
   - Fetches weather data from OpenWeatherMap API
   - Provides comprehensive weather information
   - Supports location-based queries

5. **TEXT_ANALYSIS** - Comprehensive text analysis
   - Text statistics (word count, sentence count, etc.)
   - Keyword extraction with frequency analysis
   - Basic sentiment analysis

### Plugin Development

#### Supported Plugin Types

1. **Python Plugins** (Recommended)
   - Direct execution with dependency management
   - Full access to Python ecosystem
   - Enhanced error handling and logging

2. **JavaScript Plugins** (Legacy Support)
   - Sandbox execution with security controls
   - Node.js runtime environment
   - Maintained for backward compatibility

3. **Container Plugins** (Ultimate Flexibility)
   - Docker-based execution supporting any programming language
   - Complete isolation and resource management
   - HTTP API communication protocol

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
   - Follow the standard plugin template for your chosen language
   - Include comprehensive input/output definitions
   - Document dependencies and prerequisites
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
   - Plugins are signed using RSA keys
   - Signatures are verified before plugin execution
   - Sandbox environment for plugin execution

## Support

- GitHub Issues: Report bugs and feature requests
- Discussions: Ask questions and share ideas
- Wiki: Detailed documentation and guides
- Discord: Community chat and support

# API Documentation

## AgentSet

### POST /message
**Description:** Handles messages for the AgentSet or specific agents.

**Input:**
```json
{
  "forAgent?": "string",
  "content": {
    "missionId": "string"
  },
  "[other message properties]": "any"
}
```

**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if message delivery fails)

### POST /addAgent
**Description:** Adds a new agent to the set.

**Input:**
```json
{
  "agentId": "string",
  "actionVerb": "string",
  "inputs": "object",
  "missionId": "string",
  "missionContext": "string"
}
```

**Output:**
- 200: `{ "message": "string", "agentId": "string" }`

### POST /agent/:agentId/message
**Description:** Sends a message to a specific agent.

**Parameters:**
- agentId: string (in URL)

**Input:**
- Body: [message object]

**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if message delivery fails)

### GET /agent/:agentId/output
**Description:** Retrieves the output of a specific agent.

**Parameters:**
- agentId: string (in URL)

**Output:**
- 200: `{ "output": "any" }`
- 404: `{ "error": "string" }` (if agent not found)
- 500: `{ "error": "string" }` (if fetching output fails)

### POST /pauseAgents
**Description:** Pauses all agents for a specific mission.

**Input:**
```json
{
  "missionId": "string"
}
```

**Output:**
- 200: `{ "message": "string" }`

### POST /resumeAgents
**Description:** Resumes all agents for a specific mission.

**Input:**
```json
{
  "missionId": "string"
}
```

**Output:**
- 200: `{ "message": "string" }`

### POST /resumeAgent
**Description:** Resumes a specific agent.

**Input:**
```json
{
  "agentId": "string"
}
```

**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }` (if agent not found)

### POST /abortAgent
**Description:** Aborts a specific agent.

**Input:**
```json
{
  "agentId": "string"
}
```

**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }` (if agent not found)

### GET /statistics/:missionId
**Description:** Retrieves statistics for all agents in a mission.

**Parameters:**
- missionId: string (in URL)

**Output:**
- 200: `{ "agentsByStatus": "object", "agentsCount": "number" }`
- 400: "Missing missionId parameter" (if missionId is not provided)

### POST /updateFromAgent
**Description:** Updates agent status in the persistence layer.

**Input:**
```json
{
  "agentId": "string",
  "status": "string"
}
```

**Output:**
- 200: `{ "message": "string" }`
- 201: `{ "error": "string" }` (if agent not found)

### POST /saveAgent
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
- 500: `{ "error": "string" }` (if saving fails)

## Brain

### POST /chat
**Description:** Processes a chat request using a suitable LLM model.

**Input:**
```json
{
  "exchanges": "ExchangeType[]",
  "optimization?": "OptimizationType",
  "optionals?": "Record<string, any>",
  "ConversationType?": "LLMConversationType",
  "model?": "string"
}
```

**Output:**
- 200: `{ "response": "string", "mimeType": "string" }`
- 500: `{ "error": "string" }`

### POST /generate
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
- 200: `{ "response": "string", "mimeType": "string" }`
- 400: `{ "error": "string" }`

### GET /getLLMCalls
**Description:** Retrieves the total number of LLM calls made.

**Output:**
- 200: `{ "llmCalls": "number" }`

### GET /models
**Description:** Retrieves a list of all available LLM models.

**Output:**
- 200: `{ "models": "string[]" }`

## CapabilitiesManager

### POST /executeAction
**Description:** Executes a specific action verb (plugin).

**Input:**
```json
{
  "actionVerb": "string",
  "inputs": "Map<string, PluginInput>"
}
```

**Output:**
- 200: Array of PluginOutput objects (serialized)
- 500: `{ "success": false, "name": "error", "resultType": "PluginParameterType.ERROR", "result": "Error", "error": "string" }`

### POST /message
**Description:** Handles incoming messages for the CapabilitiesManager.

**Input:**
- Body: Message object (structure depends on the message type)

**Output:**
- 200: `{ "status": "Message received and processed" }`
- 500: `{ "status": "Error processing message", "error": "string" }`

### GET /availablePlugins
**Description:** Retrieves a list of all available plugins.

**Output:**
- 200: Array of PluginDefinition objects

### POST /storeNewPlugin
**Description:** Stores a new plugin in the registry.

**Input:**
- Body: PluginDefinition object

**Output:**
- 200: `{ "message": "Plugin registered successfully", "pluginId": "string" }`
- 500: `{ "error": "string" }`

**Error Handling:**
For any unhandled errors in the above endpoints:
- 500: `{ "success": false, "resultType": "error", "error": "string" }`

## Engineer

### POST /createPlugin
**Description:** Creates a new plugin based on the provided verb, context, and guidance.

**Input:**
```json
{
  "verb": "string",
  "context": "Map<string, PluginInput>",
  "guidance": "string"
}
```
Note: The body should be serialized, as it's deserialized using MapSerializer.transformFromSerialization

**Output:**
- 200: PluginDefinition object or empty object `{}`
- 500: `{ "error": "string" }`

### POST /message
**Description:** Handles incoming messages for the Engineer.

**Input:**
- Body: Message object (structure depends on the message type)

**Output:**
- 200: `{ "status": "Message received and processed" }`

### GET /statistics
**Description:** Retrieves statistics about newly created plugins.

**Output:**
- 200: `{ "newPlugins": "string[]" }`

## Librarian

### POST /storeData
**Description:** Stores data in either MongoDB or Redis.

**Input:**
```json
{
  "id": "string",
  "data": "any",
  "storageType": "'mongo' | 'redis'",
  "collection?": "string"
}
```

**Output:**
- 200: `{ "status": "string", "id": "string" }`
- 400: `{ "error": "string" }` (if id or data is missing, or if storage type is invalid)
- 500: `{ "error": "string", "details": "string" }`

### GET /loadData/:id
**Description:** Loads data from either MongoDB or Redis.

**Parameters:**
- id: string (in URL)

**Query:**
- storageType: 'mongo' | 'redis' (default: 'mongo')
- collection: string (default: 'mcsdata')

**Output:**
- 200: `{ "data": "any" }`
- 400: `{ "error": "string" }` (if id is missing or storage type is invalid)
- 404: `{ "error": "string" }` (if data is not found)
- 500: `{ "error": "string", "details": "string" }`

### POST /queryData
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

### GET /getDataHistory/:id
**Description:** Retrieves the version history of data.

**Parameters:**
- id: string (in URL)

**Output:**
- 200: `{ "history": "DataVersion[]" }`
- 400: `{ "error": "string" }` (if id is missing)
- 500: `{ "error": "string", "details": "string" }`

### POST /searchData
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
- 500: `{ "error": "string", "details": "string" }`

### DELETE /deleteData/:id
**Description:** Deletes data from both MongoDB and Redis.

**Parameters:**
- id: string (in URL)

**Output:**
- 200: `{ "message": "string" }`
- 400: `{ "error": "string" }` (if id is missing)
- 500: `{ "error": "string", "details": "string" }`

### POST /storeWorkProduct
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

### GET /loadWorkProduct/:stepId
**Description:** Loads a work product from MongoDB.

**Parameters:**
- stepId: string (in URL)

**Output:**
- 200: `{ "data": "WorkProduct" }`
- 400: `{ "error": "string" }` (if stepId is missing)
- 404: `{ "error": "string" }` (if work product is not found)
- 500: `{ "error": "string", "details": "string" }`

### GET /getSavedMissions
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

## MissionControl

### POST /message
**Description:** Handles various types of messages for mission control operations.

**Input:**
```json
{
  "type": "MessageType",
  "sender": "string",
  "content": "any",
  "clientId": "string",
  "missionId?": "string"
}
```

**Output:**
- 200: `{ "message": "Message processed successfully" }`
- 502: `{ "error": "Internal server error" }`

**Message Types and their corresponding actions:**

**MessageType.CREATE_MISSION**
- Creates a new mission
- Required content: `{ "goal": "string", "name?": "string", "missionContext?": "string" }`

**MessageType.PAUSE**
- Pauses an existing mission
- Required: missionId in the request body

**MessageType.RESUME**
- Resumes a paused mission
- Required: missionId in the request body

**MessageType.ABORT**
- Aborts an existing mission
- Required: missionId in the request body

**MessageType.SAVE**
- Saves the current state of a mission
- Required: missionId in the request body
- Optional: missionName in the request body

**MessageType.LOAD**
- Loads a previously saved mission
- Required: missionId in the request body

**MessageType.USER_MESSAGE**
- Handles a user message for a specific mission
- Required content: `{ "missionId": "string", "message": "string" }`

## PostOffice

### POST /message
**Description:** Handles incoming messages for routing.

**Input:**
- Body: Message object (structure depends on the message type)

**Output:**
- 200: `{ "status": "string" }`

### POST /sendMessage
**Description:** Handles incoming messages from clients.

**Input:**
- Body: Message object

**Output:**
- 200: `{ "status": "string" }`
- 404: `{ "error": "string" }` (if recipient not found)
- 500: `{ "error": "string" }`

### POST /securityManager/*
**Description:** Routes security-related requests to the SecurityManager.

**Input:** Varies based on the specific security request

**Output:** Depends on the SecurityManager's response

### POST /registerComponent
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
- 500: `{ "error": "string" }`

### GET /requestComponent
**Description:** Requests information about registered components.

**Query Parameters:**
- guid?: string
- type?: string

**Output:**
- 200: `{ "components": "Component[]" }`
- 400: `{ "error": "string" }`
- 404: `{ "error": "string" }`

### GET /getServices
**Description:** Retrieves URLs of registered services.

**Output:**
- 200: `{ "[serviceName: string]": "string" }`

### POST /submitUserInput
**Description:** Submits user input for a specific request.

**Input:**
```json
{
  "requestId": "string",
  "response": "any"
}
```

**Output:**
- 200: `{ "message": "string" }`
- 404: `{ "error": "string" }`

### POST /createMission
**Description:** Creates a new mission.

**Input:**
```json
{
  "goal": "string",
  "clientId": "string"
}
```

**Headers:**
- Authorization: string

**Output:**
- 200: Response from MissionControl
- 401: `{ "error": "string" }`
- 404: `{ "error": "string" }`

### POST /loadMission
**Description:** Loads a previously saved mission.

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

### GET /librarian/retrieve/:id
**Description:** Retrieves a work product from the Librarian.

**Parameters:**
- id: string (in URL)

**Output:**
- 200: Work product data
- 404: `{ "error": "string" }`
- 500: `{ "error": "string" }`

### GET /getSavedMissions
**Description:** Retrieves saved missions for the authenticated user.

**Headers:**
- Authorization: string

**Output:**
- 200: Array of saved mission objects
- 401: `{ "error": "string" }`
- 500: `{ "error": "string" }`

## SecurityManager

### POST /register
**Description:** Registers a new user.

**Input:**
```json
{
  "email": "string",
  "password": "string",
  "name?": "string"
}
```

**Output:**
- 201: `{ "token": "string", "user": { "id": "string", "email": "string" } }`
- 400: `{ "message": "string" }` (if user already exists)
- 500: `{ "message": "string" }`

### POST /login
**Description:** Authenticates a user and returns a JWT token.

**Input:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Output:**
- 200: `{ "token": "string", "user": { "id": "string", "email": "string" } }`
- 401: `{ "message": "string" }` (if authentication fails)

### POST /logout
**Description:** Logs out a user (client-side handled).

**Output:**
- 200: `{ "message": "Logout successful" }`

### POST /refresh-token
**Description:** Refreshes an expired JWT token.

**Input:**
```json
{
  "refreshToken": "string"
}
```

**Output:**
- 200: `{ "token": "string", "user": { "id": "string", "email": "string" } }`
- 401: `{ "message": "string" }` (if refresh token is invalid)

### POST /verify
**Description:** Verifies a JWT token.

**Headers:**
- Authorization: "Bearer [token]"

**Output:**
- 200: `{ "valid": true, "user": "DecodedToken" }`
- 401: `{ "valid": false, "message": "string" }`

### POST /auth/service
**Description:** Authenticates a service component and issues a JWT token.

**Input:**
```json
{
  "componentType": "string",
  "clientSecret": "string"
}
```

**Output:**
- 200: `{ "authenticated": true, "token": "string" }`
- 401: `{ "authenticated": false, "message": "string" }`

### GET /profile
**Description:** Retrieves the profile information of the authenticated user.

**Authentication:** Required (JWT token)

**Headers:**
- Authorization: "Bearer [token]"

**Output:**
- 200: `{ "user": { "id": "string", "email": "string", "username": "string" } }`
- 401: Unauthorized (if JWT authentication fails)

### PUT /profile
**Description:** Updates the profile information of the authenticated user.

**Authentication:** Required (JWT token)

**Headers:**
- Authorization: "Bearer [token]"

**Input:**
```json
{
  "username": "string"
}
```
Note: Other fields may be added as needed

**Output:**
- 200: `{ "user": { "id": "string", "email": "string" } }`
- 401: Unauthorized (if JWT authentication fails)
- 500: `{ "message": "Error updating profile" }`

## TrafficManager

### POST /message
**Description:** Handles incoming messages for the TrafficManager.

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
- 200: `{ "status": "Message forwarded to agent" }` or `{ "status": "Message received and processed by TrafficManager" }`
- 500: `{ "error": "Failed to forward message to agent" }`

### POST /createAgent
**Description:** Creates a new agent and assigns it to an AgentSet.

**Input:**
```json
{
  "actionVerb": "string",
  "inputs": "Map<string, PluginInput>",
  "dependencies": "string[]",
  "missionId": "string",
  "missionContext": "string"
}
```

**Output:**
- 200: `{ "message": "Agent created and assigned.", "agentId": "string", "response": "any" }`
- 200: `{ "message": "Agent created but waiting for dependencies.", "agentId": "string" }`
- 500: `{ "error": "Failed to create agent" }`

### POST /checkDependencies
**Description:** Checks dependencies for an agent.

**Input:**
```json
{
  "agentId": "string"
}
```

**Output:** Response depends on implementation details

### POST /pauseAgents
**Description:** Pauses agents for a specific mission.

**Input:**
```json
{
  "missionId": "string"
}
```

**Output:**
- 200: Success response
- 500: Error response

### POST /abortAgents
**Description:** Aborts agents for a specific mission.

**Input:**
```json
{
  "missionId": "string"
}
```

**Output:** Response depends on implementation details

### POST /resumeAgents
**Description:** Resumes paused agents for a specific mission.

**Input:**
```json
{
  "missionId": "string"
}
```

**Output:** Response depends on implementation details

### GET /getAgentStatistics/:missionId
**Description:** Retrieves agent statistics for a specific mission.

**Parameters:**
- missionId: string (in URL)

**Output:**
- 200: TrafficManagerStatistics object:
```json
{
  "agentStatisticsByType": {
    "totalAgents": "number",
    "agentCountByStatus": "Object",
    "agentSetCount": "number"
  },
  "agentStatisticsByStatus": "Map<string, Array>"
}
```
- 400: `{ "error": "Missing missionId parameter" }`
- 500: `{ "error": "Failed to fetch agent statistics" }`

### POST /checkBlockedAgents
**Description:** Checks for blocked agents.

**Input:** Details not specified in the file

**Output:** Response depends on implementation details

### GET /dependentAgents/:agentId
**Description:** Retrieves dependent agents for a specific agent.

**Parameters:**
- agentId: string (in URL)

**Output:**
- 200: string[] (array of dependent agent IDs)
- 500: `{ "error": "Failed to get dependent agents" }`

### POST /distributeUserMessage
**Description:** Distributes a user message to relevant agents.

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
- 200: `{ "message": "User message distributed successfully" }`
- 500: `{ "error": "Failed to distribute user message" }`
