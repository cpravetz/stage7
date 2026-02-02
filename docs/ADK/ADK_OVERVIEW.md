# Agent Development Kit (ADK) Overview

**Last Updated**: January 22, 2026

## Introduction

The Agent Development Kit (ADK) is a comprehensive framework designed to enable the creation, deployment, and management of intelligent, collaborative AI assistants. Built on a microservice architecture, the ADK provides developers and organizations with the tools needed to build domain-specific assistants that can interact with users, leverage external tools, and collaborate with other agents to accomplish complex tasks.

## Purpose and Principles

### Why the ADK Exists

The ADK addresses several key challenges in modern AI-driven applications:

1. **Complexity Abstraction**: Building AI assistants from scratch requires significant expertise in AI/ML, backend systems, and integration. The ADK simplifies this by providing reusable components and a structured framework.

2. **Collaboration**: Modern workflows often require multiple specialized agents working together. The ADK enables seamless collaboration between agents through a shared infrastructure.

3. **Extensibility**: Organizations need assistants tailored to their specific domains (e.g., product management, sales, healthcare). The ADK provides a flexible foundation for creating domain-specific agents.

4. **Human-AI Collaboration**: The ADK emphasizes "human-in-the-loop" interactions, ensuring that AI assistants can request input, approval, or clarification from users when needed.

### Core Principles

- **Simplicity**: Hide complexity behind intuitive APIs and abstractions.
- **Extensibility**: Easily add new tools, capabilities, and agents.
- **Collaboration**: Enable seamless interaction between agents and humans.
- **Transparency**: Provide clear visibility into agent actions and decision-making.

## Architecture Overview

The ADK follows a layered microservice architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                      L4: User Interface                     │
│                    (React Frontend - mcsreact)              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  L3: Domain-Specific Assistants             │
│  (PM, Sales, Marketing, HR, Finance, Healthcare, etc.)      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      L2: SDK & Agent Layer                  │
│         (Assistant SDK, AgentSet, Brain, Capabilities)       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   L1: Core Infrastructure Services          │
│         (PostOffice, Librarian, Security, MissionControl)   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Foundation Infrastructure                 │
│        (MongoDB, Redis, RabbitMQ, Consul, ChromaDB)         │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Assistant SDK**: The primary interface for developers to create and manage AI assistants. It provides classes like `Assistant`, `Tool`, and `Conversation` to abstract the complexity of the underlying engine.

2. **AgentSet**: Manages the pool of available agents and coordinates their activities.

3. **Brain**: Handles AI-based planning, reasoning, and decision-making using large language models (LLMs).

4. **CapabilitiesManager**: Executes plugins and tools, enabling agents to perform specific tasks (e.g., interacting with Jira, Confluence, or other external systems).

5. **Librarian**: Manages data, artifacts, and tool discovery, providing a knowledge base for agents.

6. **PostOffice**: Acts as the main API gateway and entry point for all communications.

## What the Agents Do

Agents built with the ADK are designed to assist users in domain-specific tasks. Examples include:

- **Product Manager Assistant**: Helps draft specifications, analyze user feedback, and manage Jira issues.
- **Sales Assistant**: Assists with customer interactions, CRM updates, and sales analytics.
- **Healthcare Patient Coordinator**: Manages patient care plans, schedules appointments, and handles medical documentation.
- **Executive Coach**: Provides leadership guidance, performance tracking, and decision support.

Each agent is equipped with tools tailored to its domain, enabling it to perform specialized tasks efficiently.

## User Interaction

Users interact with agents through a rich, intuitive interface that supports:

1. **Conversation Panel**: A chat-like interface for direct communication with the agent.
2. **Human-in-the-Loop Components**: Prompts for user input, approval, or selection when the agent needs guidance.
3. **Tool Output Visualization**: Clear, formatted displays of data returned by tools (e.g., Jira issues, Confluence pages).
4. **Workflow Initiation**: Quick-start buttons and contextual actions to begin common tasks.

### Example Interaction Flow

1. **User Initiates Task**: The user clicks a "Draft New Spec" button or sends a message like "Help me draft a product specification."
2. **Agent Responds**: The agent acknowledges the request and begins gathering information.
3. **Tool Usage**: The agent uses tools (e.g., JiraTool, ConfluenceTool) to retrieve relevant data.
4. **Human Input Request**: If needed, the agent asks for user input (e.g., "What are the key features?").
5. **Task Completion**: The agent completes the task and presents the results (e.g., a draft specification).

## Implementation Steps

### For Developers

1. **Define the Assistant**: Specify the assistant's role, personality, and available tools using the `Assistant` class.
2. **Create Tools**: Develop or integrate tools that the assistant will use to perform tasks.
3. **Implement Conversation Logic**: Define how the assistant will interact with users and handle different scenarios.
4. **Test**: Use the SDK's testability features to ensure the assistant behaves as expected.
5. **Deploy**: Deploy the assistant as a microservice within the ADK architecture.

### For End Users

1. **Access the Interface**: Open the frontend application (e.g., `mcsreact`).
2. **Select an Assistant**: Choose the assistant that matches your domain (e.g., Product Manager Assistant).
3. **Initiate a Task**: Use quick-start buttons or send a message to begin a task.
4. **Collaborate**: Provide input, approval, or clarification as requested by the assistant.
5. **Review Results**: View the outcomes of the assistant's actions and provide feedback.

## Benefits of the ADK

- **Rapid Development**: Build domain-specific assistants quickly using reusable components.
- **Scalability**: Deploy multiple assistants that can collaborate and share resources.
- **Flexibility**: Customize assistants to fit specific organizational needs.
- **Transparency**: Gain visibility into agent actions and decision-making processes.
- **Collaboration**: Enable seamless interaction between humans and AI agents.

## Getting Started

For detailed deployment and usage instructions, refer to the [Stage7 V2 Deployment Guide](docs/v2/DEPLOYMENT_GUIDE.md) and the [Assistant SDK API Design](docs/v2/l2-sdk-api-design.md).

## Conclusion

The Agent Development Kit (ADK) is a powerful framework for creating intelligent, collaborative AI assistants. By abstracting complexity, enabling extensibility, and emphasizing human-AI collaboration, the ADK empowers organizations to build domain-specific agents that enhance productivity and streamline workflows.