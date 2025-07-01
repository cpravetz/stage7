# JavaScript to Python Plugin Migration Guide

This guide provides step-by-step instructions for converting existing JavaScript plugins to Python in the Stage7 system.

## Overview

As part of Phase 4 implementation, we are migrating from JavaScript to Python as the primary plugin development language. This migration provides:

- **Better AI/ML Integration**: Python's rich ecosystem for AI and data processing
- **Improved Maintainability**: Cleaner, more readable code
- **Enhanced Security**: Better sandboxing and dependency management
- **Unified Development Experience**: Consistent tooling and frameworks

## Migration Process

### 1. Analyze the JavaScript Plugin

Before starting migration, understand the existing plugin:

```bash
# Review the JavaScript plugin structure
ls services/capabilitiesmanager/src/plugins/PLUGIN_NAME/
cat services/capabilitiesmanager/src/plugins/PLUGIN_NAME/manifest.json
```

Key elements to identify:
- Input/output definitions
- Core functionality
- External dependencies
- Security requirements

### 2. Create Python Plugin Structure

Use the CLI tool to create a new Python plugin:

```bash
python tools/python-plugin-cli.py create PLUGIN_NAME --verb PLUGIN_VERB
```

This creates:
- `plugins/PLUGIN_NAME/main.py` - Main implementation
- `plugins/PLUGIN_NAME/manifest.json` - Plugin metadata
- `plugins/PLUGIN_NAME/requirements.txt` - Dependencies
- `plugins/PLUGIN_NAME/README.md` - Documentation

### 3. Convert the Manifest

Update the manifest.json with Python-specific settings:

```json
{
  "language": "python",
  "entryPoint": {
    "main": "main.py",
    "function": "execute_plugin"
  },
  "version": "2.0.0",
  "metadata": {
    "migrated_from": "javascript",
    "migration_date": "2024-12-01"
  }
}
```

### 4. Implement Core Logic

Convert JavaScript logic to Python following these patterns:

#### Input Handling
**JavaScript:**
```javascript
const { searchTerm } = input.args;
```

**Python:**
```python
search_term_input = inputs.get('searchTerm')
search_term = search_term_input.input_value if search_term_input else None
```

#### HTTP Requests
**JavaScript:**
```javascript
const response = await axios.get(url, { params: { q: term } });
```

**Python:**
```python
response = requests.get(url, params={'q': term}, timeout=10)
response.raise_for_status()
```

#### Error Handling
**JavaScript:**
```javascript
return {
    success: false,
    resultType: 'error',
    error: error.message
};
```

**Python:**
```python
return [create_error_output("error", str(e))]
```

#### Success Response
**JavaScript:**
```javascript
return {
    success: true,
    resultType: 'array',
    result: results
};
```

**Python:**
```python
return [create_success_output("results", results, "array")]
```

### 5. Handle Dependencies

Convert JavaScript dependencies to Python equivalents:

| JavaScript | Python | Purpose |
|------------|--------|---------|
| `axios` | `requests` | HTTP requests |
| `fs/promises` | `pathlib`, `open()` | File operations |
| `cheerio` | `beautifulsoup4` | HTML parsing |
| `lodash` | Built-in functions | Utility functions |

Add to `requirements.txt`:
```
requests>=2.31.0
beautifulsoup4>=4.12.0
```

### 6. Enhance Security

Python plugins include enhanced security features:

```python
def validate_file_path(file_path: str) -> str:
    """Validate file path for security"""
    if '..' in Path(file_path).parts:
        raise ValueError("Path traversal not allowed")
    if Path(file_path).is_absolute():
        raise ValueError("Absolute paths not allowed")
    return str(Path(file_path))
```

### 7. Test the Migration

Validate and test the converted plugin:

```bash
# Validate plugin structure
python tools/python-plugin-cli.py validate plugins/PLUGIN_NAME

# Test with sample input
python tools/python-plugin-cli.py test plugins/PLUGIN_NAME --input '{"param": {"value": "test"}}'
```

## Migration Examples

### Example 1: SEARCH Plugin

**Original JavaScript (simplified):**
```javascript
const axios = require('axios');

async function execute(input) {
    const { searchTerm } = input.args;
    const response = await axios.get('https://api.duckduckgo.com/', {
        params: { q: searchTerm, format: 'json' }
    });
    
    const results = response.data.RelatedTopics.map(topic => ({
        title: topic.Text,
        url: topic.FirstURL
    }));
    
    return {
        success: true,
        resultType: 'array',
        result: results
    };
}
```

**Converted Python:**
```python
import requests

def execute_plugin(inputs):
    search_term_input = inputs.get('searchTerm')
    search_term = search_term_input.input_value
    
    response = requests.get('https://api.duckduckgo.com/', 
                          params={'q': search_term, 'format': 'json'},
                          timeout=10)
    response.raise_for_status()
    data = response.json()
    
    results = []
    for topic in data.get('RelatedTopics', []):
        if 'Text' in topic and 'FirstURL' in topic:
            results.append({
                'title': topic['Text'],
                'url': topic['FirstURL']
            })
    
    return [create_success_output("results", results, "array")]
```

### Example 2: FILE_OPS Plugin

**Original JavaScript:**
```javascript
import fs from 'fs/promises';

export async function execute(operation, path, content) {
    switch (operation) {
        case 'read':
            const data = await fs.readFile(path, 'utf-8');
            return { success: true, result: data };
        case 'write':
            await fs.writeFile(path, content || '');
            return { success: true, result: null };
    }
}
```

**Converted Python:**
```python
from pathlib import Path

def execute_plugin(inputs):
    operation = inputs.get('operation').input_value
    file_path = inputs.get('path').input_value
    
    if operation == 'read':
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()
        return [create_success_output("result", content, "string")]
    
    elif operation == 'write':
        content = inputs.get('content').input_value or ""
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(content)
        return [create_success_output("result", None, "null")]
```

## Migration Checklist

- [ ] Analyze original JavaScript plugin functionality
- [ ] Create new Python plugin structure using CLI tool
- [ ] Convert manifest.json to Python format
- [ ] Implement core logic in main.py
- [ ] Convert dependencies to Python equivalents
- [ ] Add enhanced security and validation
- [ ] Update input/output handling
- [ ] Test plugin functionality
- [ ] Update documentation
- [ ] Add to examples directory
- [ ] Update Docker configuration if needed

## Best Practices for Migration

### 1. Maintain Compatibility
- Keep the same input/output interface
- Preserve plugin behavior and functionality
- Maintain version compatibility

### 2. Enhance Security
- Add input validation
- Implement path traversal protection
- Use secure defaults

### 3. Improve Error Handling
- Provide detailed error messages
- Handle edge cases gracefully
- Use structured error responses

### 4. Add Documentation
- Update README with Python-specific information
- Document new security features
- Provide usage examples

### 5. Test Thoroughly
- Test all input combinations
- Verify error handling
- Check performance characteristics

## Deployment Considerations

### Docker Updates
Update Dockerfiles to include Python dependencies:

```dockerfile
# Install Python dependencies for migrated plugins
RUN if [ -f examples/python-plugins/PLUGIN_NAME/requirements.txt ]; then \
    python3 -m pip install --user -r examples/python-plugins/PLUGIN_NAME/requirements.txt; \
    fi
```

### Plugin Registry
Update plugin registry to prefer Python versions:

1. Install Python version alongside JavaScript version
2. Test Python version thoroughly
3. Update default plugin selection to use Python version
4. Deprecate JavaScript version

## Troubleshooting

### Common Issues

1. **Import Errors**
   - Ensure all dependencies are in requirements.txt
   - Check Python module availability

2. **Path Issues**
   - Use pathlib for cross-platform compatibility
   - Validate file paths for security

3. **JSON Serialization**
   - Ensure all output objects are JSON serializable
   - Handle datetime and other special types

4. **Performance Differences**
   - Python may have different performance characteristics
   - Optimize critical paths if needed

### Getting Help

- Review existing Python plugin examples
- Use the validation tool for structure issues
- Check the Python plugin development guide
- Contact the development team for assistance

## Conclusion

Migrating from JavaScript to Python plugins provides significant benefits in maintainability, security, and development experience. Follow this guide systematically to ensure successful migration while maintaining functionality and compatibility.
