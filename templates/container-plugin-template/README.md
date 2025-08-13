# Container Plugin Template

This template provides a foundation for creating containerized plugins for the Stage7 system.

## Overview

Container plugins run in isolated Docker containers and communicate with the CapabilitiesManager via HTTP API. This provides:

- **Multi-language Support**: Use any programming language that can serve HTTP
- **Enhanced Security**: Strong isolation between plugins and host system
- **Scalability**: Independent plugin scaling and resource management
- **Portability**: Consistent execution across environments

## Template Structure

```
container-plugin-template/
├── Dockerfile              # Container build instructions
├── server.py              # HTTP server for plugin API
├── plugin_logic.py        # Your plugin implementation
├── requirements.txt       # Python dependencies
├── manifest.json          # Plugin configuration
└── README.md             # This file
```

## Quick Start

1. **Copy the template**:
   ```bash
   cp -r templates/container-plugin-template my-plugin
   cd my-plugin
   ```

2. **Update the manifest**:
   - Change `id`, `verb`, and `name` in `manifest.json`
   - Update `inputDefinitions` and `outputDefinitions`
   - Modify container image name

3. **Implement your logic**:
   - Edit `plugin_logic.py` to implement your plugin functionality
   - Update `requirements.txt` if you need additional dependencies

4. **Test locally**:
   ```bash
   # Build the container
   docker build -t my-plugin:1.0.0 .
   
   # Run the container
   docker run -p 8080:8080 my-plugin:1.0.0
   
   # Test the health endpoint
   curl http://localhost:8080/health
   
   # Test plugin execution
   curl -X POST http://localhost:8080/execute \
     -H "Content-Type: application/json" \
     -d '{"inputs": {"example_input": {"value": "test"}}}'
   ```

## Plugin Implementation

### Core Function

Implement your plugin logic in the `execute_plugin` function in `plugin_logic.py`:

```python
def execute_plugin(inputs: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    # Your implementation here
    return {
        'success': True,
        'outputs': {
            'result': 'your result'
        }
    }
```

### Input/Output Format

**Input Format**:
```json
{
  "inputs": {
    "parameter_name": {
      "value": "actual_value",
      "args": {}
    }
  },
  "context": {
    "trace_id": "execution-trace-id",
    "plugin_id": "your-plugin-id",
    "version": "1.0.0"
  }
}
```

**Output Format**:
```json
{
  "success": true,
  "outputs": {
    "result": "your result data",
    "additional_output": "more data"
  }
}
```

### Error Handling

Return error responses in this format:
```json
{
  "success": false,
  "error": "Error description"
}
```

## Container Configuration

### Dockerfile

The template Dockerfile:
- Uses Python 3.11 slim base image
- Installs system dependencies
- Copies and installs Python requirements
- Exposes port 8080
- Includes health check
- Runs the plugin server

### Manifest Configuration

Key container configuration in `manifest.json`:

```json
{
  "container": {
    "dockerfile": "Dockerfile",
    "buildContext": "./",
    "image": "stage7/your-plugin:1.0.0",
    "ports": [{"container": 8080, "host": 0}],
    "environment": {"PLUGIN_ENV": "production"},
    "resources": {"memory": "256m", "cpu": "0.5"},
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
  }
}
```

## Best Practices

1. **Resource Management**: Set appropriate memory and CPU limits
2. **Health Checks**: Implement robust health checking
3. **Error Handling**: Provide clear error messages
4. **Logging**: Use structured logging for debugging
5. **Security**: Validate all inputs and sanitize outputs
6. **Performance**: Optimize for fast startup and execution
7. **Documentation**: Document your plugin's inputs, outputs, and behavior

## Deployment

Once your plugin is ready:

1. Build and tag the container image
2. Push to a container registry (if needed)
3. Install the plugin in Stage7 using the CapabilitiesManager API
4. Test execution through the Stage7 system

## Troubleshooting

- **Container won't start**: Check Dockerfile and dependencies
- **Health check fails**: Verify the `/health` endpoint responds correctly
- **Plugin execution fails**: Check logs in the container
- **Timeout errors**: Increase timeout values in manifest
- **Resource issues**: Adjust memory/CPU limits in container config
