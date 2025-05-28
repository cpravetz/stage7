# Stage7 Python Plugin Template

This is a template for creating Python plugins for the Stage7 system. Use this as a starting point for developing your own plugins.

## Plugin Structure

```
plugin-directory/
├── main.py           # Main plugin entry point
├── manifest.json     # Plugin metadata and configuration
├── requirements.txt  # Python dependencies
├── README.md        # This documentation file
└── tests/           # Optional: Plugin tests
    └── test_plugin.py
```

## Getting Started

1. **Copy this template** to create your new plugin
2. **Update manifest.json** with your plugin details:
   - Change `id` and `verb` to your plugin's action verb
   - Update `description` and `explanation`
   - Define your `inputDefinitions` and `outputDefinitions`
   - Set appropriate `security` permissions
   - Update `metadata` with author and tags

3. **Implement your plugin logic** in `main.py`:
   - Replace the `execute_plugin()` function with your implementation
   - Handle your specific input parameters
   - Return appropriate `PluginOutput` objects

4. **Add dependencies** to `requirements.txt` if needed

5. **Test your plugin** using the Stage7 testing framework

## Input/Output Format

### Input Format
Your plugin receives input as a JSON object via stdin:
```json
{
  "input_name": {
    "inputValue": "actual_value",
    "args": {}
  }
}
```

### Output Format
Your plugin should output a JSON array of results to stdout:
```json
[
  {
    "success": true,
    "name": "result_name",
    "resultType": "string",
    "result": "actual_result",
    "resultDescription": "Description of the result"
  }
]
```

## Plugin Development Guidelines

### 1. Error Handling
Always wrap your plugin logic in try-catch blocks and return appropriate error outputs:

```python
try:
    # Your plugin logic here
    result = process_input(input_value)
    return [create_success_output("result", result)]
except Exception as e:
    return [create_error_output("error", str(e))]
```

### 2. Input Validation
Validate all required inputs before processing:

```python
required_input = inputs.get('required_param')
if not required_input:
    return [create_error_output("error", "Missing required parameter: required_param")]
```

### 3. Security Considerations
- Only request necessary permissions in manifest.json
- Validate and sanitize all inputs
- Avoid executing arbitrary code
- Use secure HTTP requests (HTTPS)

### 4. Performance
- Set appropriate timeout values
- Handle large data efficiently
- Use streaming for large outputs when possible

## Testing Your Plugin

Create a test file in the `tests/` directory:

```python
import unittest
import json
from main import execute_plugin, PluginInput

class TestMyPlugin(unittest.TestCase):
    def test_basic_functionality(self):
        inputs = {
            'example_input': PluginInput('test_value')
        }
        outputs = execute_plugin(inputs)
        self.assertTrue(outputs[0].success)
        self.assertEqual(outputs[0].result, 'expected_result')

if __name__ == '__main__':
    unittest.main()
```

## Deployment

1. Package your plugin using the Stage7 packaging system
2. Publish to the plugin repository
3. Install and test in your Stage7 environment

## Support

For more information on Stage7 plugin development:
- Check the Stage7 documentation
- Review existing plugin examples
- Contact the development team for assistance
