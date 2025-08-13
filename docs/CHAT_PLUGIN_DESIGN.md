# CHAT Plugin Design

This document outlines the design for the `CHAT` plugin, which enables interactive chat sessions with the user.

## 1. File Structure

The `CHAT` plugin will be located in `services/capabilitiesmanager/src/plugins/CHAT/` and will have the following structure:

```
CHAT/
├── manifest.json
├── openapi.json
└── main.py
```

## 2. manifest.json

```json
{
  "id": "plugin-CHAT",
  "verb": "CHAT",
  "description": "Manages interactive chat sessions with the user.",
  "explanation": "This plugin allows for starting, conducting, and ending a chat session to gather information or provide assistance.",
  "language": "python",
  "entryPoint": {
    "main": "main.py",
    "packageSource": {
      "type": "local",
      "path": "./"
    }
  },
  "api": {
    "type": "openapi",
    "url": "file://openapi.json"
  },
  "repository": {
    "type": "local"
  },
  "security": {
    "permissions": [],
    "sandboxOptions": {}
  },
  "distribution": {
    "downloads": 0,
    "rating": 0
  },
  "version": "1.0.0"
}
```

## 3. openapi.json

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "CHAT Plugin API",
    "version": "1.0.0",
    "description": "API for managing interactive chat sessions."
  },
  "paths": {
    "/start_chat": {
      "post": {
        "summary": "Start a new chat session",
        "operationId": "start_chat",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "initial_message": {
                    "type": "string",
                    "description": "An introductory message to start the chat."
                  }
                },
                "required": ["initial_message"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Chat session started successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "session_id": {
                      "type": "string",
                      "description": "A unique identifier for the chat session."
                    },
                    "response": {
                      "type": "string",
                      "description": "The user's first response."
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/send_message": {
      "post": {
        "summary": "Send a message to the user",
        "operationId": "send_message",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "session_id": {
                    "type": "string",
                    "description": "The ID of the current chat session."
                  },
                  "message": {
                    "type": "string",
                    "description": "The message to send to the user."
                  }
                },
                "required": ["session_id", "message"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message sent and response received.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "response": {
                      "type": "string",
                      "description": "The user's response to the message."
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/end_chat": {
      "post": {
        "summary": "End the chat session",
        "operationId": "end_chat",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "session_id": {
                    "type": "string",
                    "description": "The ID of the chat session to end."
                  }
                },
                "required": ["session_id"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Chat session ended successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "description": "A confirmation message."
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

The `main.py` file will contain the core logic for the CHAT plugin. It will be implemented as a Python script that uses a simple in-memory dictionary to manage chat sessions.

### Key Components:

*   **`chat_sessions` dictionary:** A global dictionary to store active chat sessions, with the `session_id` as the key.
*   **`start_chat` function:**
    *   Generates a unique `session_id`.
    *   Stores the new session in the `chat_sessions` dictionary.
    *   Sends the `initial_message` to the user through the agent's communication channel.
    *   Waits for and returns the user's response.
*   **`send_message` function:**
    *   Retrieves the session from the `chat_sessions` dictionary using the `session_id`.
    *   Sends the `message` to the user.
    *   Waits for and returns the user's response.
*   **`end_chat` function:**
    *   Removes the session from the `chat_sessions` dictionary.
    *   Returns a confirmation message.

This design provides a solid foundation for implementing the `CHAT` plugin.