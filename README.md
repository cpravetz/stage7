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

### Installation

1. Clone the repository:
   `git clone https://github.com/cpravetz/stage7.git`
2. Build the system containers, in the root directory (likely /stage7):
   `docker compose build`
3. Start the containers:
   `docker compose up`
4. The application will be available at [http://localhost:80](http://localhost:80).


### Usage

1. Access the frontend at `http://localhost:80`
2. Create a new mission by providing a goal
3. Monitor the mission progress and interact with the system through the user interface

## Development

### Project Structure

- `services/`: Contains individual service components
- `shared/`: Shared utilities and types used across services
- `services/mcsreact/`: React frontend application

### Adding a New Service

1. Create a new directory under `services/`
2. Implement the service using the BaseEntity class from the shared library
3. Add the service to the Docker Compose file

