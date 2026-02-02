# Plugin Configuration and Secrets Management

This guide explains how developers can access configuration and secrets within the plugins they build for the Stage 7 agent ecosystem.

## Overview

The system provides a centralized way to manage configuration, including sensitive data like API keys, for all types of plugins. Configuration is managed by administrators and stored securely. At runtime, this configuration is injected into your plugin's environment.

However, the exact mechanism for accessing this configuration differs depending on the type of plugin you are developing.

## Configuration by Plugin Type

### JavaScript Plugins

JavaScript plugins receive the richest set of configuration data. When your plugin is executed, it is passed a single `environment` object with the following structure:

```typescript
interface environmentType {
  // An object containing environment variables from the host system,
  // plus special tokens like S7_CM_TOKEN and S7_BRAIN_TOKEN.
  env: { [key: string]: string };

  // An array of key-value pairs containing secrets and configuration
  // specific to your plugin, as configured by an administrator.
  credentials: { key: string; value: string; }[];
}
```

#### Accessing Secrets (Credentials)

To access a specific secret (e.g., an API key for `my_external_service`), you can find it in the `credentials` array. It is recommended to convert this array into a more convenient Map for easy lookups.

**Example:**

```javascript
// Inside your plugin's execute function

// The environment object is passed by the executor
async function execute(inputs, environment) {
  // Convert credentials array to a Map for easy access
  const secrets = new Map(environment.credentials.map(c => [c.key, c.value]));

  const apiKey = secrets.get('MY_EXTERNAL_SERVICE_API_KEY');

  if (!apiKey) {
    throw new Error('Required API key MY_EXTERNAL_SERVICE_API_KEY is not configured!');
  }

  // Use the apiKey to make an API call...
  // ...
}
```

#### Accessing Environment Variables

You can access system-level environment variables and special Stage 7 tokens directly from the `env` object.

**Example:**

```javascript
// Inside your plugin's execute function

async function execute(inputs, environment) {
  const brainAuthToken = environment.env.S7_BRAIN_TOKEN;
  const missionId = inputs.find(i => i.inputName === 'missionId')?.value;

  // Use the token to make an authenticated call to the Brain service
  // ...
}
```

### Python Plugins

Python plugins receive their configuration primarily through environment variables.

#### Accessing Secrets (Credentials)

Your plugin-specific secrets are passed in a single environment variable, `S7_PLUGIN_CREDENTIALS`. This variable contains a JSON string representing an array of key-value pairs. Your Python script must read this variable and parse the JSON to access the secrets.

**Example:**

```python
import os
import json

# It's recommended to create a helper function to load credentials
def get_plugin_secrets():
    """
    Loads and parses plugin-specific credentials from the environment.
    Returns a dictionary of secrets.
    """
    secrets_json = os.environ.get('S7_PLUGIN_CREDENTIALS')
    if not secrets_json:
        return {}
    
    try:
        # The JSON structure is a list of {'key': k, 'value': v} objects
        credentials_list = json.loads(secrets_json)
        # Convert the list to a simple {k: v} dict for easy access
        return {item['key']: item['value'] for item in credentials_list}
    except (json.JSONDecodeError, TypeError):
        # Handle potential errors if the env var is malformed
        return {}

# Inside your main execution logic
def execute():
    secrets = get_plugin_secrets()
    api_key = secrets.get('MY_EXTERNAL_SERVICE_API_KEY')

    if not api_key:
        # It's good practice to raise an error or handle the missing key
        raise ValueError('Required API key MY_EXTERNAL_SERVICE_API_KEY is not configured!')

    # Use the api_key to make an API call...
    # ...
```

#### Accessing Environment Variables

Other system-level configuration and Stage 7 tokens are also passed as standard environment variables. You can access them directly using `os.environ.get()`.

**Example:**

```python
import os

# Inside your main execution logic
def execute():
    # Access the Brain authentication token
    brain_auth_token = os.environ.get('S7_BRAIN_TOKEN')
    
    # Note: Inputs like missionId are passed via stdin, not environment variables.
    # Your plugin's main loop should read and parse all inputs from stdin.
    
    # Use the token to make an authenticated call to the Brain service
    # ...
```

### Container Plugins

Container plugins receive all configuration exclusively through environment variables. When your container is started, the environment is built from three sources, layered in the following order (where later sources override earlier ones):

1.  **Host System Environment:** All environment variables from the `CapabilitiesManager`'s host system are passed into the container. This includes system variables and Stage 7 tokens like `S7_CM_TOKEN` and `S7_BRAIN_TOKEN`.
2.  **Plugin Manifest Environment:** Static key-value pairs defined in your plugin's `manifest.json` file under the `container.environment` section will be added or will override variables from the host.
3.  **Plugin-Specific Credentials:** Secure key-value secrets configured for your plugin by an administrator are added last, overriding any variables with the same key name from the previous sources.

Your application inside the container can access any of these values by reading standard environment variables.

#### Accessing Configuration

Regardless of the source, accessing configuration is the same. Below are examples for different languages.

**Example (Python):**

```python
import os

# Access a secret credential
api_key = os.environ.get('MY_EXTERNAL_SERVICE_API_KEY')

# Access a static variable from the manifest
log_level = os.environ.get('LOG_LEVEL', 'INFO') # Default to 'INFO'

# Access a Stage 7 token
brain_auth_token = os.environ.get('S7_BRAIN_TOKEN')

if not api_key:
    raise ValueError("Required env var MY_EXTERNAL_SERVICE_API_KEY is not configured!")

# ... your application logic
```

**Example (Node.js):**

```javascript
// Access a secret credential
const apiKey = process.env.MY_EXTERNAL_SERVICE_API_KEY;

// Access a static variable from the manifest
const logLevel = process.env.LOG_LEVEL || 'INFO';

// Access a Stage 7 token
const brainAuthToken = process.env.S7_BRAIN_TOKEN;

if (!apiKey) {
  throw new Error('Required env var MY_EXTERNAL_SERVICE_API_KEY is not configured!');
}

// ... your application logic
```

**Example (`Dockerfile`):**

You can also consume these environment variables directly within your Dockerfile, for example, to set runtime arguments.

```dockerfile
# Base image
FROM node:18-alpine

# ... copy your app files

# Use an environment variable to set a default command argument.
# The value of MY_APP_MODE can be provided by any of the three sources.
ENV MY_APP_MODE="production"
CMD ["node", "dist/index.js", "--mode", "${MY_APP_MODE}"]
```

### OpenAPI and MCP Tools

OpenAPI and MCP tools are declarative wrappers around existing APIs. As such, they do not have a "runtime" in the same way as JS, Python, or Container plugins. Their configuration, particularly for authentication, is handled within the tool's definition file.

Authentication is configured via an `authentication` block. The recommended way to provide the actual secret (like an API key or token) is to use the `credentialSource` field.

#### The `credentialSource` Pattern

The `credentialSource` field tells the `PluginExecutor` where to find the credential. Currently, this points to an environment variable on the `CapabilitiesManager` service's host machine.

**Example (MCP Tool Definition):**

Let's say you are wrapping an external service that requires an API key in a header called `X-Api-Key`.

1.  **Store the Secret:** An administrator must set an environment variable on the `CapabilitiesManager` host. For example:
    ```bash
    export MY_WEATHER_SERVICE_API_KEY="12345abcdef"
    ```

2.  **Reference it in the Tool Definition:** In your MCP tool's JSON definition, you reference this environment variable in the `authentication` block.

    ```json
    {
      "id": "my-weather-mcp-tool",
      "name": "My Weather Service",
      "authentication": {
        "type": "apiKey",
        "apiKey": {
          "in": "header",
          "name": "X-Api-Key",
          "credentialSource": "env:MY_WEATHER_SERVICE_API_KEY"
        }
      },
      "actionMappings": [
        // ... your action mappings
      ]
    }
    ```

When the agent executes an action using this tool, the `PluginExecutor` will:
1.  See the `authentication` block.
2.  Read the `credentialSource` value: `"env:MY_WEATHER_SERVICE_API_KEY"`.
3.  Look for an environment variable named `MY_WEATHER_SERVICE_API_KEY` on its host system.
4.  Inject the value of that variable ("12345abcdef") into the `X-Api-Key` header of the outgoing API request.

This pattern ensures that secrets are not hardcoded in the tool definitions themselves and can be managed securely by system administrators. The same pattern applies to `bearer` and `basic` authentication types.
