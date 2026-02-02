# L1 Plugin Creation Guide

## Overview

This guide explains how to create L1 plugins that enable SDK tools to execute through the Core Engine. Each SDK tool needs a corresponding L1 plugin.

## Plugin Structure

Each plugin consists of:
- `manifest.json` - Plugin metadata and configuration
- `main.py` - Plugin implementation
- `requirements.txt` - Python dependencies
- `README.md` - Documentation

## Directory Structure

```
services/capabilitiesmanager/src/plugins/
└── PLUGIN_NAME/
    ├── manifest.json
    ├── main.py
    ├── requirements.txt
    └── README.md
```

## Manifest.json Template

```json
{
  "id": "plugin-PLUGIN_NAME",
  "verb": "PLUGIN_NAME",
  "description": "Brief description of what the plugin does",
  "explanation": "Detailed explanation of capabilities",
  "inputDefinitions": [
    {
      "name": "action",
      "required": true,
      "type": "string",
      "description": "The action to perform",
      "aliases": ["operation", "command"]
    },
    {
      "name": "payload",
      "required": true,
      "type": "object",
      "description": "Action-specific parameters",
      "aliases": ["data", "params"]
    }
  ],
  "outputDefinitions": [
    {
      "name": "result",
      "required": true,
      "type": "object",
      "description": "Operation result"
    },
    {
      "name": "success",
      "required": true,
      "type": "boolean",
      "description": "Success indicator"
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
    "permissions": ["net.fetch"],
    "sandboxOptions": {
      "timeout": 30000
    }
  },
  "configuration": [
    {
      "key": "API_KEY",
      "description": "API key for authentication",
      "required": true,
      "type": "string",
      "credentialSource": "ENV_API_KEY",
      "sensitive": true
    }
  ],
  "version": "1.0.0",
  "metadata": {
    "author": "Stage7 Development Team",
    "tags": ["category", "keywords"],
    "category": "productivity",
    "license": "MIT"
  },
  "semanticDescription": "Semantic description for discovery",
  "capabilityKeywords": ["keyword1", "keyword2"],
  "usageExamples": [
    "Example usage 1",
    "Example usage 2"
  ]
}
```

## Main.py Template

```python
#!/usr/bin/env python3
"""
PLUGIN_NAME Plugin - Description
"""

import sys
import json
import logging
import os
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Extract input value, handling aliases and wrappers."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params'], default={})
        
        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Missing required parameter 'action'"
            }]
        
        # Route to action handlers
        # TODO: Implement action handlers
        
        return [{
            "success": True,
            "name": "result",
            "resultType": "object",
            "result": {},
            "resultDescription": f"Result of {action} operation"
        }]
        
    except Exception as e:
        logger.error(f"Error: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse JSON input from stdin."""
    payload = json.loads(inputs_str)
    inputs_dict = {}
    if isinstance(payload, dict):
        if payload.get('_type') == 'Map':
            for entry in payload.get('entries', []):
                if isinstance(entry, list) and len(entry) == 2:
                    inputs_dict[entry[0]] = entry[1]
        else:
            inputs_dict = {k: v for k, v in payload.items() if k not in ('_type', 'entries')}
    return inputs_dict

def main():
    """Entry point."""
    try:
        input_data = sys.stdin.read().strip()
        inputs_dict = parse_inputs(input_data) if input_data else {}
        result = execute_plugin(inputs_dict)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps([{"success": False, "error": str(e)}]))

if __name__ == "__main__":
    main()
```

## SDK Tool to Plugin Mapping

Each SDK tool needs a corresponding plugin. See `docs/v2/v2-implementation-gap-analysis.md` for the complete list.

## Testing

After creating a plugin:
1. Restart CapabilitiesManager to load the plugin
2. Test via MissionControl `/message` endpoint
3. Verify plugin appears in PluginRegistry

## Next Steps

Create plugins for all SDK tools listed in the gap analysis document.

