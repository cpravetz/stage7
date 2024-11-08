# stage7 - A self-aware, self-optimizing, scalable, and flexible system for managing and executing complex missions using Large Language Models (LLMs) and custom plugins.

## Overview

stage7 is an advanced, self-modifying system designed to manage and execute complex missions using Large Language Models (LLMs) and custom plugins. The system is composed of several independent Node.js instances that interact with each other to collectively manage agents, process LLM conversations, and complete given missions.

## Key Components

1. **MissionControl**: Manages the overall operation of the system, initializing and controlling missions.
2. **PostOffice**: Central message routing component that maintains a registry of available components and routes messages between entities.
3. **Brain**: Handles conversations and selects the best LLM for processing based on the context.
4. **Frontend**: A React application that provides a user interface for interacting with the system.
5. **Engineer**: Responsible for creating and managing plugins.
6. **Librarian**: Manages data storage using Redis and MongoDB servers.
7. **CapabilitiesManager**: Handles ActionVerbs and Plugins.
8. **TrafficManager**: Manages agents and agent sets.
9. **SecurityManager**: Ensures system security (implementation details not provided).

## Key Features

- Self-modifying: The system can create new plugins for itself.
- Self-optimizing: Uses context to route LLM conversations to the best available LLM for processing.
- Scalable: Utilizes multiple independent components that can be scaled as needed.
- Flexible: Supports various LLMs and can be extended with custom plugins.

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- Docker and Docker Compose
- MongoDB
- Redis

### Installation

1. Clone the repository:
   `git clone https://github.com/cpravetz/CKTMCS.git`
2. Install dependencies:
   `npm install`
3. Start the development server:
   `npm start`
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

### Creating Plugins

Plugins can be created and managed through the Engineer component. Refer to the Engineer documentation for more details.

## Testing

Run tests for all services:


## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:80](http://localhost:80) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
