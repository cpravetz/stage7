# API_CLIENT Plugin Design

This document outlines the design for the `API_CLIENT` plugin, a generic interface for interacting with third-party RESTful APIs.

## 1. File Structure

The `API_CLIENT` plugin will be located in `services/capabilitiesmanager/src/plugins/API_CLIENT` and will have the following file structure:

```
services/capabilitiesmanager/src/plugins/API_CLIENT/
├── manifest.json
├── openapi.json
├── main.py
├── requirements.txt
└── README.md
```

## 2. manifest.json

The `manifest.json` file defines the plugin's metadata, including its ID, description, input and output definitions, and security settings.

```json
{
  "id": "plugin-API_CLIENT",
  "verb": "API_CLIENT",
  "description": "A generic interface for interacting with third-party RESTful APIs.",
  "explanation": "This plugin provides a command to make HTTP requests to any RESTful API, handling various authentication methods and returning the full HTTP response.",
  "inputDefinitions": [
    {
      "name": "method",
      "required": true,
      "type": "string",
      "description": "The HTTP method (e.g., GET, POST, PUT, DELETE)."
    },
    {
      "name": "url",
      "required": true,
      "type": "string",
      "description": "The API endpoint URL."
    },
    {
      "name": "headers",
      "required": false,
      "type": "object",
      "description": "A dictionary of HTTP headers."
    },
    {
      "name": "body",
      "required": false,
      "type": "object",
      "description": "The request body for methods like POST or PUT."
    },
    {
      "name": "auth",
      "required": false,
      "type": "object",
      "description": "Authentication details (e.g., API key, bearer token)."
    }
  ],
  "outputDefinitions": [
    {
      "name": "status_code",
      "required": true,
      "type": "number",
      "description": "The HTTP status code of the response."
    },
    {
      "name": "headers",
      "required": true,
      "type": "object",
      "description": "The response headers."
    },
    {
      "name": "body",
      "required": true,
      "type": "object",
      "description": "The response body."
    }
  ],
  "language": "python",
  "entryPoint": {
    "main": "main.py",
    "function": "execute_plugin"
  },
  "repository": {
    "type": "local"
  },
  "security": {
    "permissions": [
      "network.request"
    ]
  },
  "version": "1.0.0",
  "metadata": {
    "author": "Stage7 Development Team",
    "tags": ["api", "rest", "http", "client"],
    "category": "utility",
    "license": "MIT"
  }
}
```

## 3. openapi.json

The `openapi.json` file provides a detailed API specification for the plugin, following the OpenAPI 3.0 standard.

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "API_CLIENT Plugin API",
    "version": "1.0.0",
    "description": "API for making requests to third-party RESTful APIs."
  },
  "paths": {
    "/make_request": {
      "post": {
        "summary": "Make an HTTP request",
        "operationId": "make_request",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "method": {
                    "type": "string",
                    "description": "The HTTP method."
                  },
                  "url": {
                    "type": "string",
                    "description": "The API endpoint URL."
                  },
                  "headers": {
                    "type": "object",
                    "description": "A dictionary of HTTP headers."
                  },
                  "body": {
                    "type": "object",
                    "description": "The request body."
                  },
                  "auth": {
                    "type": "object",
                    "description": "Authentication details."
                  }
                },
                "required": ["method", "url"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Request successful.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status_code": {
                      "type": "number",
                      "description": "The HTTP status code."
                    },
                    "headers": {
                      "type": "object",
                      "description": "The response headers."
                    },
                    "body": {
                      "type": "object",
                      "description": "The response body."
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## 4. High-Level Logic for main.py

The `main.py` file will contain the core logic for the `API_CLIENT` plugin. It will use the `requests` library to make HTTP requests and will include a strategy for handling various authentication methods.

### Authentication Strategy

The plugin will support multiple authentication methods, including API keys, bearer tokens, and basic authentication. The authentication details will be passed in the `auth` parameter of the `make_request` command. To enhance security, the plugin will integrate with the `TokenService` to securely store and retrieve sensitive credentials.

When a request is made with authentication details, the plugin will first check if the credentials are already stored in the `TokenService`. If not, it will store them for future use. This approach avoids exposing sensitive information in the agent's memory or logs.

### Main Logic

```python
import sys
import json
import requests
# Import the TokenService client (to be implemented)
# from security_client import TokenService

def execute_plugin(inputs):
    """
    Executes the API_CLIENT plugin.
    """
    method = inputs.get("method")
    url = inputs.get("url")
    headers = inputs.get("headers", {})
    body = inputs.get("body", {})
    auth = inputs.get("auth", {})

    if not method or not url:
        return json.dumps({
            "status_code": 400,
            "headers": {},
            "body": {"error": "Method and URL are required."}
        })

    # Handle authentication
    if auth:
        auth_type = auth.get("type")
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {auth.get('token')}"
        elif auth_type == "api_key":
            headers[auth.get("key")] = auth.get("value")
        # Add other authentication methods as needed

    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=body
        )

        return json.dumps({
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "body": response.json()
        })

    except requests.exceptions.RequestException as e:
        return json.dumps({
            "status_code": 500,
            "headers": {},
            "body": {"error": str(e)}
        })

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_data = json.loads(sys.argv[1])
        print(execute_plugin(input_data))