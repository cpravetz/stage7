import json
import os
import sys
import re
from typing import Any, Dict, List

class PluginOutput:
    """Represents a plugin output result."""
    def __init__(self, success: bool, name: str, result_type: str,
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        output = {
            "success": self.success,
            "name": self.name,
            "resultType": self.result_type,
            "result": self.result,
            "resultDescription": self.result_description
        }
        if self.error:
            output["error"] = self.error
        return output

def generate_document(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generates a document from a template and data."""
    try:
        template = inputs.get("template")
        data = inputs.get("data")

        if not isinstance(template, str):
            raise ValueError("Template must be a string.")
        if not isinstance(data, dict):
            raise ValueError("Data must be a JSON object.")

        def replace_placeholder(match):
            key = match.group(1)
            return str(data.get(key, match.group(0)))

        # Simple regex for {{variable}} style placeholders
        generated_text = re.sub(r"\{\{([^}]+)\}"", replace_placeholder, template)

        return [PluginOutput(True, "generated_document", "string", generated_text, "Document generated successfully.").to_dict()]

    except Exception as e:
        return [PluginOutput(False, "generate_document_error", "error", None, "Failed to generate document.", str(e)).to_dict()]


def execute_plugin(operation: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Main entry point for the DOC_GEN plugin.
    """
    operations = {
        "generate_document": generate_document,
    }

    if operation not in operations:
        return [PluginOutput(False, "operation_error", "error", None, f"Operation '{operation}' not supported.", f"Operation '{operation}' not supported.").to_dict()]

    return operations[operation](inputs)

if __name__ == "__main__":
    inputs_str = sys.stdin.read().strip()
    if not inputs_str:
        raise ValueError("No input provided")

    inputs_list = json.loads(inputs_str)
    
    inputs_dict = {}
    for item in inputs_list:
        if isinstance(item, list) and len(item) == 2:
            key, val = item
            if isinstance(key, dict):
                sys.stderr.write(f"Warning: Skipping invalid input item with dictionary as key: {item}\n")
                continue
            if isinstance(val, dict) and 'value' in val:
                inputs_dict[key] = val['value']
            else:
                inputs_dict[key] = val
        else:
            sys.stderr.write(f"Warning: Skipping invalid input item: {item}\n")

    operation = inputs_dict.get("operation")
        
    if not operation:
        raise ValueError("Missing required input: operation")

    result = execute_plugin(operation, inputs_dict)
    print(json.dumps(result))
