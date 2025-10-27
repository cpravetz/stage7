# stage7 - A self-aware, self-optimizing, scalable, and flexible system for managing and executing complex missions using Large Language Models (LLMs) and custom plugins.

## Overview

stage7 is an advanced, self-modifying system designed to manage and execute complex missions using Large Language Models (LLMs) and custom plugins. The system is composed of several independent Node.js instances that interact with each other to collectively manage agents, process LLM conversations, and complete given missions.

The plugin ecosystem supports not only code-based plugins (Python, JavaScript, Container) but also definition-based plugins for OpenAPI and MCP tools. All plugin types are managed, discovered, and executed through a unified Plugin Marketplace and CapabilitiesManager, enabling seamless integration of external APIs and internal services as first-class plugins.

## Key Components

1. **MissionControl**: Manages the overall operation of the system, initializing and controlling missions.
2. **PostOffice**: Central message routing component that maintains a registry of available components and routes messages between entities.
3. **Brain**: Handles chat conversations, LLM content conversions, and selects the best LLM for processing based on the context.
4. **Frontend**: A React application that provides a user interface for interacting with the system.
   - **Plugins and Tools Panel**: This integrated section in the UI, accessible via the 'Tools' menu in the sidebar, serves as the central hub for managing all types of plugins and external tools. It allows users to discover, configure, and interact with code-based plugins, OpenAPI tools, and MCP tools.

     - **Accessing the Panel**: Click on the 'Tools' option in the main navigation sidebar of the frontend.

     - **Adding a New Plugin/Tool**:
       - **Code Plugins (Python, JavaScript, Container)**:
         1. Navigate to the 'Plugins' tab within the 'Plugins and Tools Panel'.
         2. Click the 'Add New Plugin' button.
         3. Select the plugin type (Python, JavaScript, or Container).
         4. Upload your plugin code or provide the necessary container image details.
         5. Configure any required environment variables or dependencies.
         6. Save the plugin. The system will automatically validate and register it.
       - **OpenAPI Tools**:
         1. Navigate to the 'OpenAPI Tools' tab within the 'Plugins and Tools Panel'.
         2. Click the 'Add New OpenAPI Tool' button.
         3. Provide the OpenAPI specification URL or upload the OpenAPI JSON/YAML file.
         4. Configure any necessary authentication details (e.g., API keys, OAuth settings) for the external service.
         5. The system will parse the specification and list available actions.
         6. Save the tool.
       - **MCP Tools**:
         1. Navigate to the 'MCP Tools' tab within the 'Plugins and Tools Panel'.
         2. Click the 'Add New MCP Tool' button.
         3. Define the MCP tool's manifest, including its name, description, and the internal service endpoint it interacts with.
         4. Specify input and output schemas for the tool's actions.
         5. Save the tool.

     - **Discovering and Browsing Tools**: The main view of the panel displays a comprehensive list of all registered plugins and tools. Use the search bar and filtering options to quickly locate specific tools by name, type, or functionality.

     - **Configuring and Managing Tools**: Click on any listed plugin or tool to view its detailed information. From here, you can:
       - **Edit Settings**: Modify tool-specific configurations, suchs as API keys, base URLs, or other parameters.
       - **Update Code/Specs**: For code plugins, upload new versions of the code. For OpenAPI tools, update the specification.
       - **Enable/Disable**: Toggle the active status of a tool.
       - **Delete**: Remove a tool from the system.

     - **Triggering Tool Actions**: For tools that expose callable actions, select the desired action from the tool's detail view. Provide the required input parameters in the provided form. The system will execute the action, and its progress and results will be displayed in real-time.

     - **Monitoring Execution & Outputs**: The panel provides real-time feedback on tool execution, including status updates, logs, and the final output. These outputs can be directly utilized or referenced by agents in subsequent mission steps.

     - **Integrating into Missions**: All registered plugins and tools become available for agents to discover and use within their mission plans, enabling dynamic and extensible capabilities for complex tasks.

   - **Monitoring and Visualization**: The frontend also offers powerful tools for observing system and agent behavior:
     - **Module Performance Tabs**: These tabs provide real-time and historical performance metrics for each core system module (e.g., Brain, CapabilitiesManager, Librarian). Users can view:
       - **Resource Utilization**: CPU, memory, and network usage.
       - **Request Latency**: Average, P90, P99 latencies for API calls.
       - **Error Rates**: Number and types of errors encountered.
       - **Throughput**: Number of requests processed per second.
       - **LLM Specific Metrics**: For the Brain module, this includes LLM call counts, model-specific performance, and blacklisting status.
       This data helps in identifying bottlenecks, optimizing resource allocation, and ensuring system stability.
     - **Agent Network Graph**: A dynamic, interactive graph visualizing the relationships and communication flow between agents within a mission. This graph allows users to:
       - **Observe Agent Interactions**: See which agents are communicating with each other and the nature of their interactions.
       - **Track Task Delegation**: Visualize the delegation of tasks from one agent to another.
       - **Identify Bottlenecks**: Pinpoint agents that are overloaded or causing delays in the mission execution.
       - **Understand Mission Flow**: Gain a holistic view of how a complex mission is being executed by the distributed agent system.
       - **Inspect Agent State**: Click on individual agents to view their current status, assigned role, and recent activities.
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
