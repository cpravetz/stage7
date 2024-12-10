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

## Key Features

- Self-modifying: The system can create new plugins for itself.
- Reflective: Analyzes runtime errors and develops code improvements to address.
- Self-optimizing: Uses context to route LLM conversations to the best available LLM for processing.
- Scalable: Utilizes multiple independent components that can be scaled as needed.
- Flexible: Supports various LLMs and can be extended with custom plugins.

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
   `git clone https://github.com/cpravetz/stage7.git`
2. Provide API keys for the LLMs you want to useby editing the docker-compose file.
   You do not need all LLM services - one will suffice.

3. Build the system containers, in the root directory (likely /stage7):
   `docker compose build`
4. Start the containers:
   `docker compose up`
5. On the host machine, the application will be available at [http://localhost:80](http://localhost:80).


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

### Troubleshooting

Common issues and solutions:

1. **Connection Errors**
   - Verify all containers are running: `docker compose ps`
   - Check container logs: `docker compose logs [service-name]`
   - Ensure all required ports are available

2. **LLM Integration Issues**
   - Verify API keys are correctly set in environment variables
   - Check Brain service logs for API response errors
   - Ensure sufficient API credits/quota

3. **Performance Issues**
   - Monitor container resource usage: `docker stats`
   - Consider increasing container resource limits
   - Check Redis and MongoDB performance


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


### Plugin Development

Plugins are created by the engineer service as needed, but it is possible to create custom plugins and add them to
the library of initial plugins.

1. **Plugin Structure**
   - Follow the standard plugin template
   - Include comprehensive input/output definitions
   - Document dependencies and prerequisites
   - Provide usage examples
   - Provide prompt content to explain the plugin to our LLMs

2. **Testing Requirements**
   - Unit tests for core functionality
   - Integration tests with agent system
   - Performance benchmarks
   - Error handling scenarios

### Security Guidelines

1. **Code Security**
   - No hardcoded credentials
   - Proper input validation
   - Secure communication between services
   - Regular dependency updates

2. **Data Protection**
   - Proper handling of sensitive data
   - Compliance with data protection regulations
   - Secure storage practices

## Support

- GitHub Issues: Report bugs and feature requests
- Discussions: Ask questions and share ideas
- Wiki: Detailed documentation and guides
- Discord: Community chat and support

