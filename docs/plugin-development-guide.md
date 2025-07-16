# Stage7 Plugin Development Guide

## 🚀 Overview

Stage7 now supports **three types of plugins** with a modern, enterprise-ready architecture:

- **Python Plugins**: Direct execution with dependency management
- **JavaScript Plugins**: Sandbox execution with security controls (legacy support)
- **Container Plugins**: Docker-based execution supporting any programming language

## 📋 Production Plugin Set

The following plugins are ready for immediate use:

### Core Plugins
- **ACCOMPLISH**: Mission planning and goal achievement
- **ASK_USER_QUESTION**: Interactive user input collection
- **SCRAPE**: Web content extraction with rate limiting

### Utility Plugins
- **WEATHER**: Weather information retrieval via OpenWeatherMap API
- **TEXT_ANALYSIS**: Comprehensive text analysis (statistics, keywords, sentiment)

## 🐍 Python Plugin Development

### Quick Start

1. **Create Plugin Directory**:
   ```bash
   mkdir services/capabilitiesmanager/src/plugins/MY_PLUGIN
   cd services/capabilitiesmanager/src/plugins/MY_PLUGIN
   ```

2. **Create main.py**:
   ```python
   #!/usr/bin/env python3
   import json
   import sys
   from typing import Dict, List, Any

   class PluginParameterType:
       STRING = "string"
       NUMBER = "number"
       BOOLEAN = "boolean"
       ARRAY = "array"
       OBJECT = "object"
       ERROR = "ERROR"

   def execute(inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
       try:
           # Extract inputs
           input_value = None
           for key, value in inputs_map.items():
               if key == 'input':
                   if isinstance(value, dict) and 'inputValue' in value:
                       input_value = value['inputValue']
                   else:
                       input_value = value
                   break

           # Plugin logic here
           result = f"Processed: {input_value}"

           return [{
               "success": True,
               "name": "result",
               "resultType": PluginParameterType.STRING,
               "resultDescription": "Plugin execution result",
               "result": result,
               "mimeType": "text/plain"
           }]

       except Exception as e:
           return [{
               "success": False,
               "name": "error",
               "resultType": PluginParameterType.ERROR,
               "resultDescription": "Plugin execution error",
               "result": None,
               "error": str(e)
           }]

   def main():
       try:
           inputs_str = sys.stdin.read().strip()
           if not inputs_str:
               raise ValueError("No input provided")

           inputs_list = json.loads(inputs_str)
           inputs_map = {item[0]: item[1] for item in inputs_list}

           results = execute(inputs_map)
           print(json.dumps(results))

       except Exception as e:
           error_result = [{
               "success": False,
               "name": "error",
               "resultType": PluginParameterType.ERROR,
               "resultDescription": "Plugin execution error",
               "result": None,
               "error": str(e)
           }]
           print(json.dumps(error_result))

   if __name__ == "__main__":
       main()
   ```

3. **Create requirements.txt**:
   ```
   requests>=2.28.0
   # Add your dependencies here
   ```

4. **Create manifest.json**:
   ```json
   {
     "id": "plugin-MY_PLUGIN",
     "verb": "MY_PLUGIN",
     "description": "Brief description of your plugin",
     "explanation": "Detailed explanation of what your plugin does",
     "inputDefinitions": [
       {
         "name": "input",
         "required": true,
         "type": "string",
         "description": "Input description"
       }
     ],
     "outputDefinitions": [
       {
         "name": "result",
         "required": true,
         "type": "string",
         "description": "Output description"
       }
     ],
     "language": "python",
     "entryPoint": {
       "main": "main.py",
       "packageSource": {
         "type": "local",
         "path": "./",
         "requirements": "requirements.txt"
       }
     },
     "repository": {
       "type": "local"
     },
     "security": {
       "permissions": [],
       "sandboxOptions": {},
       "trust": {
         "signature": ""
       }
     },
     "distribution": {
       "downloads": 0,
       "rating": 0
     },
     "version": "1.0.0"
   }
   ```

### Best Practices

- **Error Handling**: Always wrap plugin logic in try-catch blocks
- **Input Validation**: Validate all inputs before processing
- **Authentication**: Use SecurityManager for service-to-service calls
- **Logging**: Use Python logging module for debugging
- **Dependencies**: Keep requirements.txt minimal and up-to-date

## 🐳 Container Plugin Development

### Quick Start

1. **Create Plugin Directory**:
   ```bash
   mkdir container-plugins/my-plugin
   cd container-plugins/my-plugin
   ```

2. **Create app.py** (Flask application):
   ```python
   from flask import Flask, request, jsonify
   import logging

   app = Flask(__name__)
   logging.basicConfig(level=logging.INFO)

   @app.route('/health', methods=['GET'])
   def health():
       return jsonify({"status": "healthy"})

   @app.route('/execute', methods=['POST'])
   def execute():
       try:
           data = request.get_json()
           # Plugin logic here
           result = f"Processed: {data}"
           
           return jsonify({
               "success": True,
               "result": result
           })
       except Exception as e:
           return jsonify({
               "success": False,
               "error": str(e)
           }), 500

   if __name__ == '__main__':
       app.run(host='0.0.0.0', port=8080)
   ```

3. **Create Dockerfile**:
   ```dockerfile
   FROM python:3.9-slim

   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt

   COPY app.py .
   EXPOSE 8080

   CMD ["python", "app.py"]
   ```

4. **Create requirements.txt**:
   ```
   flask>=2.0.0
   ```

5. **Create manifest.json**:
   ```json
   {
     "id": "plugin-MY_CONTAINER",
     "verb": "MY_CONTAINER",
     "description": "Container-based plugin",
     "language": "container",
     "container": {
       "dockerfile": "Dockerfile",
       "buildContext": "./",
       "image": "stage7/my-plugin:1.0.0",
       "ports": [{"container": 8080, "host": 0}],
       "environment": {},
       "resources": {
         "memory": "256m",
         "cpu": "0.5"
       },
       "healthCheck": {
         "path": "/health",
         "interval": "30s",
         "timeout": "10s",
         "retries": 3
       }
     },
     "api": {
       "endpoint": "/execute",
       "method": "POST",
       "timeout": 30000
     },
     "version": "1.0.0"
   }
   ```

## 🧪 Testing Your Plugins

### Integration Test Suite

Run the comprehensive test suite:

```bash
node scripts/test-plugin-ecosystem.js
```

### Manual Testing

1. **Test Plugin Discovery**:
   ```bash
   curl http://localhost:5060/plugins
   ```

2. **Test Plugin Execution**:
   ```bash
   curl -X POST http://localhost:5060/execute \
     -H "Content-Type: application/json" \
     -d '{"actionVerb": "MY_PLUGIN", "inputs": {"input": "test"}}'
   ```

## 📚 Plugin Examples

### Authentication Example (Python)
```python
import requests
import os

def get_auth_token():
    security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
    response = requests.post(
        f"http://{security_manager_url}/generateToken",
        json={
            "clientId": "MY_PLUGIN",
            "clientSecret": os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        }
    )
    return response.json().get('token')
```

### Service Integration Example (Python)
```python
def call_brain_service(prompt):
    token = get_auth_token()
    brain_url = os.getenv('BRAIN_URL', 'brain:5030')
    
    response = requests.post(
        f"http://{brain_url}/chat",
        json={"exchanges": [{"role": "user", "content": prompt}]},
        headers={'Authorization': f'Bearer {token}'}
    )
    return response.json()
```

## 🔧 Development Tools

### Engineer Service
Create plugins automatically:
```bash
curl -X POST http://localhost:5080/createPlugin \
  -H "Content-Type: application/json" \
  -d '{
    "verb": "NEW_PLUGIN",
    "context": {"goal": "Create a new plugin"},
    "guidance": "Plugin requirements",
    "language": "python"
  }'
```

### Marketplace Service
Discover and manage plugins:
```bash
# List all plugins
curl http://localhost:5050/plugins

# Get specific plugin
curl http://localhost:5050/plugins/plugin-MY_PLUGIN
```

## 🚀 Deployment

1. **Build Services**:
   ```bash
   docker compose build
   ```

2. **Start System**:
   ```bash
   docker compose up -d
   ```

3. **Verify Plugin Availability**:
   ```bash
   curl http://localhost:5020/plugins
   ```

## 📖 Additional Resources

- **Architecture Documentation**: `docs/gemini-cm-architecture-update.md`
- **Plugin Examples**: `examples/python-plugins/`
- **Container Templates**: `examples/container-plugins/`
- **Test Suite**: `scripts/test-plugin-ecosystem.js`

---

## 🎉 Ready to Build!

The Stage7 plugin ecosystem is now enterprise-ready with support for any programming language. Start building your plugins today! 🚀
