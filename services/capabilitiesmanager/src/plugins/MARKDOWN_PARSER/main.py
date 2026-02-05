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

def extract_section(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extracts a section from a Markdown document."""
    try:
        markdown = inputs.get("markdown")
        header = inputs.get("header")

        if not isinstance(markdown, str) or not isinstance(header, str):
            raise ValueError("Markdown and header must be strings.")

        # Find the header and the next header of the same or lower level
        header_level = header.count("#")
        pattern = f"^{re.escape(header)}(.*?)(\n(#{'{'}{1,{header_level}}{'}'})[ ]|\Z)"
        match = re.search(pattern, markdown, re.DOTALL | re.MULTILINE)

        if match:
            section_content = match.group(1).strip()
            return [PluginOutput(True, "section_content", "string", section_content, f"Content of section '{header}' extracted.").to_dict()]
        else:
            return [PluginOutput(False, "section_not_found", "error", None, f"Section with header '{header}' not found.", f"Section with header '{header}' not found.").to_dict()]

    except Exception as e:
        return [PluginOutput(False, "extract_section_error", "error", None, "Failed to extract section.", str(e)).to_dict()]

def to_json(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Converts a Markdown document to a JSON object."""
    try:
        markdown = inputs.get("markdown")
        if not isinstance(markdown, str):
            raise ValueError("Markdown must be a string.")

        # This is a very basic conversion. A real implementation would be more robust.
        lines = markdown.strip().split('\n')
        json_obj = {}
        current_header = "content"
        json_obj[current_header] = []

        for line in lines:
            header_match = re.match(r"^(#+)\s+(.*)", line)
            if header_match:
                current_header = header_match.group(2).strip().lower().replace(" ", "_")
                json_obj[current_header] = []
            else:
                if line.strip():
                    json_obj[current_header].append(line.strip())
        
        # Join lists into strings
        for key, value in json_obj.items():
            json_obj[key] = "\n".join(value)


        return [PluginOutput(True, "json_data", "object", json_obj, "Markdown converted to JSON.").to_dict()]

    except Exception as e:
        return [PluginOutput(False, "to_json_error", "error", None, "Failed to convert Markdown to JSON.", str(e)).to_dict()]


def execute_plugin(operation: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Main entry point for the MARKDOWN_PARSER plugin.
    """
    operations = {
        "extract_section": extract_section,
        "to_json": to_json,
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
