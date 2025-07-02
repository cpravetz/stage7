# Stage7 Python Plugin Development Guide

This guide provides comprehensive instructions for developing Python plugins for the Stage7 system.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Plugin Structure](#plugin-structure)
4. [Development Workflow](#development-workflow)
5. [API Reference](#api-reference)
6. [Best Practices](#best-practices)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

## Overview

Python is the preferred language for developing Stage7 plugins due to its:
- Rich ecosystem for AI/ML and data processing
- Simple and readable syntax
- Extensive standard library
- Strong community support

### Why Python for Stage7 Plugins?

- **Consistency**: Unified development experience across plugins
- **AI/ML Integration**: Natural fit for AI-powered capabilities
- **Rapid Development**: Quick prototyping and iteration
- **Maintainability**: Clean, readable code that's easy to maintain

## Getting Started

### Prerequisites

- Python 3.9 or higher
- Stage7 development environment
- Basic understanding of JSON and REST APIs

### Quick Start

1. **Create a new plugin using the CLI tool:**
   ```bash
   python tools/python-plugin-cli.py create my_plugin --verb MY_ACTION
   ```

2. **Navigate to your plugin directory:**
   ```bash
   cd plugins/my_plugin
   ```

3. **Implement your plugin logic in `main.py`**

4. **Test your plugin:**
   ```bash
   python ../tools/python-plugin-cli.py test .
   ```

## Plugin Structure

Every Python plugin must have the following structure:

```
my_plugin/
├── main.py           # Main plugin entry point
├── manifest.json     # Plugin metadata and configuration
├── requirements.txt  # Python dependencies
├── README.md        # Plugin documentation
└── tests/           # Plugin tests (optional but recommended)
    └── test_my_plugin.py
```

### Core Files

#### main.py
The main entry point that implements the plugin logic. Must contain:
- `execute_plugin(inputs)` function
- `main()` function for CLI execution
- Input/output handling
- Error management

#### manifest.json
Plugin metadata including:
- Plugin identification (id, verb, version)
- Input/output definitions
- Security permissions
- Configuration options

#### requirements.txt
Python dependencies in pip format:
```
requests>=2.31.0
numpy>=1.24.0
```

## Development Workflow

### 1. Planning Your Plugin

Before coding, define:
- **Purpose**: What problem does your plugin solve?
- **Inputs**: What data does it need?
- **Outputs**: What results does it produce?
- **Dependencies**: What external libraries are required?
- **Security**: What permissions does it need?

### 2. Creating the Plugin

Use the CLI tool to create a new plugin:
```bash
python tools/python-plugin-cli.py create weather_checker --verb GET_WEATHER
```

### 3. Implementing the Logic

Edit `main.py` to implement your plugin:

```python
def execute_plugin(inputs: Dict[str, InputValue]) -> List[PluginOutput]:
    try:
        # Get inputs
        location = inputs.get('location')
        if not location:
            return [create_error_output("error", "Missing location input")]
        
        # Process data
        weather_data = fetch_weather(location.input_value)
        
        # Return results
        return [create_success_output("weather", weather_data, "object")]
        
    except Exception as e:
        return [create_error_output("error", str(e))]
```

### 4. Updating the Manifest

Update `manifest.json` with your plugin details:

```json
{
  "id": "plugin-GET_WEATHER",
  "verb": "GET_WEATHER",
  "description": "Fetches weather information for a location",
  "inputDefinitions": [
    {
      "name": "location",
      "required": true,
      "type": "string",
      "description": "City name or coordinates"
    }
  ],
  "outputDefinitions": [
    {
      "name": "weather",
      "required": true,
      "type": "object",
      "description": "Weather data object"
    }
  ]
}
```

### 5. Testing

Test your plugin locally:
```bash
python tools/python-plugin-cli.py test plugins/weather_checker --input '{"location": {"value": "London,UK"}}'
```

### 6. Validation

Validate your plugin structure:
```bash
python tools/python-plugin-cli.py validate plugins/weather_checker
```

## API Reference

### InputValue Class

Represents an input parameter:
```python
class InputValue:
    def __init__(self, input_value: Any, args: Dict[str, Any] = None):
        self.input_value = input_value  # The actual input value
        self.args = args or {}          # Additional arguments
```

### PluginOutput Class

Represents an output result:
```python
class PluginOutput:
    def __init__(self, success: bool, name: str, result_type: str, 
                 result: Any, result_description: str, error: str = None):
        self.success = success                    # Success flag
        self.name = name                         # Output name
        self.result_type = result_type           # Type: string, object, array, etc.
        self.result = result                     # Actual result data
        self.result_description = result_description  # Human-readable description
        self.error = error                       # Error message (if any)
```

### Helper Functions

#### create_success_output()
```python
def create_success_output(name: str, result: Any, result_type: str = "string", 
                         description: str = "Plugin executed successfully") -> PluginOutput
```

#### create_error_output()
```python
def create_error_output(name: str, error_message: str, 
                       description: str = "Plugin execution failed") -> PluginOutput
```

### Main Function Template

```python
def execute_plugin(inputs: Dict[str, InputValue]) -> List[PluginOutput]:
    """
    Main plugin execution function
    
    Args:
        inputs: Dictionary of input parameters
        
    Returns:
        List of PluginOutput objects
    """
    try:
        # Your plugin logic here
        pass
    except Exception as e:
        return [create_error_output("error", str(e))]
```

## Best Practices

### 1. Input Validation

Always validate inputs before processing:
```python
# Check for required inputs
required_input = inputs.get('required_param')
if not required_input:
    return [create_error_output("error", "Missing required parameter")]

# Validate input types
if not isinstance(required_input.input_value, str):
    return [create_error_output("error", "Parameter must be a string")]
```

### 2. Error Handling

Use comprehensive error handling:
```python
try:
    # Plugin logic
    result = process_data(input_data)
    return [create_success_output("result", result)]
except ValueError as e:
    return [create_error_output("validation_error", f"Invalid input: {e}")]
except requests.RequestException as e:
    return [create_error_output("network_error", f"Network error: {e}")]
except Exception as e:
    return [create_error_output("error", f"Unexpected error: {e}")]
```

### 3. Security

- Request only necessary permissions in manifest.json
- Validate and sanitize all inputs
- Use environment variables for sensitive data
- Avoid executing arbitrary code

### 4. Performance

- Set appropriate timeout values
- Handle large data efficiently
- Use streaming for large outputs
- Implement proper resource cleanup

### 5. Documentation

- Write clear descriptions in manifest.json
- Include usage examples in README.md
- Document input/output formats
- Provide troubleshooting information

## Testing

### Unit Tests

Create comprehensive unit tests:
```python
import unittest
from main import execute_plugin, InputValue

class TestMyPlugin(unittest.TestCase):
    def test_valid_input(self):
        inputs = {'param': InputValue('valid_value')}
        outputs = execute_plugin(inputs)
        self.assertTrue(outputs[0].success)
    
    def test_invalid_input(self):
        inputs = {}
        outputs = execute_plugin(inputs)
        self.assertFalse(outputs[0].success)
```

### Integration Tests

Test with the Stage7 system:
```bash
# Test via CapabilitiesManager API
curl -X POST http://localhost:5060/executeAction \
  -H "Content-Type: application/json" \
  -d '{"actionVerb": "MY_ACTION", "inputs": {"param": {"value": "test"}}}'
```

## Deployment

### 1. Package Your Plugin

```bash
# Using Stage7 packaging system
curl -X POST http://localhost:5060/plugins/package \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "MY_ACTION", "version": "1.0.0"}'
```

### 2. Publish to Repository

```bash
curl -X POST http://localhost:5060/plugins/publish \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "MY_ACTION", "version": "1.0.0"}'
```

### 3. Install in Environment

```bash
curl -X POST http://localhost:5060/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "MY_ACTION", "version": "1.0.0"}'
```

## Troubleshooting

### Common Issues

1. **Import Errors**
   - Ensure all dependencies are in requirements.txt
   - Check Python path configuration

2. **JSON Parsing Errors**
   - Validate JSON output format
   - Ensure proper encoding

3. **Permission Errors**
   - Check security permissions in manifest.json
   - Verify file system access rights

4. **Timeout Issues**
   - Increase timeout values in manifest.json
   - Optimize plugin performance

### Debug Mode

Enable debug logging in your plugin:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def execute_plugin(inputs):
    logger.debug(f"Received inputs: {inputs}")
    # Plugin logic
```

### Getting Help

- Check the Stage7 documentation
- Review example plugins
- Contact the development team
- Use the validation tool for structure issues
