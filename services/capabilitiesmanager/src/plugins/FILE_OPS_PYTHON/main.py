#!/usr/bin/env python3
"""
FILE_OPS Plugin for Stage7 (Python Version)

This plugin provides services for file operations: read, write, append.
Converted from JavaScript to Python for better maintainability and consistency.
"""

import sys
import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional


class InputValue:
    """Represents a plugin input parameter in the new format"""
    def __init__(self, inputName: str, value: Any, valueType: str, args: Dict[str, Any] = None):
        self.inputName = inputName
        self.value = value
        self.valueType = valueType
        self.args = args or {}



class PluginOutput:
    """Represents a plugin output result"""
    def __init__(self, success: bool, name: str, result_type: str, 
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
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


def create_success_output(name: str, result: Any, result_type: str = "string", 
                         description: str = "Plugin executed successfully") -> PluginOutput:
    """Helper function to create a successful output"""
    return PluginOutput(
        success=True,
        name=name,
        result_type=result_type,
        result=result,
        result_description=description
    )


def create_error_output(name: str, error_message: str, 
                       description: str = "Plugin execution failed") -> PluginOutput:
    """Helper function to create an error output"""
    return PluginOutput(
        success=False,
        name=name,
        result_type="error",
        result=None,
        result_description=description,
        error=error_message
    )


def validate_file_path(file_path: str) -> str:
    """
    Validate and normalize file path for security
    
    Args:
        file_path: The file path to validate
        
    Returns:
        Normalized file path
        
    Raises:
        ValueError: If path is invalid or unsafe
    """
    if not file_path:
        raise ValueError("File path cannot be empty")
    
    # Convert to Path object for better handling
    path = Path(file_path)
    
    # Check for path traversal attempts
    if '..' in path.parts:
        raise ValueError("Path traversal not allowed")
    
    # Ensure path is not absolute (for security)
    if path.is_absolute():
        raise ValueError("Absolute paths not allowed")
    
    return str(path)


def read_file(file_path: str) -> str:
    """
    Read content from a file
    
    Args:
        file_path: Path to the file to read
        
    Returns:
        File content as string
    """
    validated_path = validate_file_path(file_path)
    
    try:
        with open(validated_path, 'r', encoding='utf-8') as file:
            return file.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"File not found: {file_path}")
    except PermissionError:
        raise PermissionError(f"Permission denied: {file_path}")
    except UnicodeDecodeError:
        raise ValueError(f"File is not valid UTF-8: {file_path}")


def write_file(file_path: str, content: str) -> None:
    """
    Write content to a file
    
    Args:
        file_path: Path to the file to write
        content: Content to write
    """
    validated_path = validate_file_path(file_path)
    
    try:
        # Create directory if it doesn't exist
        Path(validated_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(validated_path, 'w', encoding='utf-8') as file:
            file.write(content)
    except PermissionError:
        raise PermissionError(f"Permission denied: {file_path}")
    except OSError as e:
        raise OSError(f"Failed to write file {file_path}: {str(e)}")


def append_file(file_path: str, content: str) -> None:
    """
    Append content to a file
    
    Args:
        file_path: Path to the file to append to
        content: Content to append
    """
    validated_path = validate_file_path(file_path)
    
    try:
        # Create directory if it doesn't exist
        Path(validated_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(validated_path, 'a', encoding='utf-8') as file:
            file.write(content)
    except PermissionError:
        raise PermissionError(f"Permission denied: {file_path}")
    except OSError as e:
        raise OSError(f"Failed to append to file {file_path}: {str(e)}")


def execute_plugin(inputs: Dict[str, InputValue]) -> List[PluginOutput]:
    """
    Main plugin execution function for FILE_OPS plugin
    
    Args:
        inputs: Dictionary of input parameters
        
    Returns:
        List of PluginOutput objects
    """
    try:
        # Get required inputs
        path_input = inputs.get('path')
        operation_input = inputs.get('operation')
        
        if not path_input:
            return [create_error_output("error", "Missing required input: path")]
        
        if not operation_input:
            return [create_error_output("error", "Missing required input: operation")]
        
        file_path = path_input.input_value
        operation = operation_input.input_value
        
        # Validate inputs
        if not isinstance(file_path, str) or not file_path.strip():
            return [create_error_output("error", "Path must be a non-empty string")]
        
        if not isinstance(operation, str) or operation not in ['read', 'write', 'append']:
            return [create_error_output("error", "Operation must be 'read', 'write', or 'append'")]
        
        file_path = file_path.strip()
        operation = operation.lower().strip()
        
        # Handle different operations
        if operation == 'read':
            try:
                content = read_file(file_path)
                return [create_success_output("result", content, "string", 
                                            f"Read content from {file_path}")]
            except Exception as e:
                return [create_error_output("error", str(e))]
        
        elif operation in ['write', 'append']:
            # Get content input
            content_input = inputs.get('content')
            content = content_input.input_value if content_input else ""
            
            # Convert content to string if needed
            if content is None:
                content = ""
            elif not isinstance(content, str):
                content = str(content)
            
            try:
                if operation == 'write':
                    write_file(file_path, content)
                    return [create_success_output("result", None, "null", 
                                                f"Saved content to {file_path}")]
                else:  # append
                    append_file(file_path, content)
                    return [create_success_output("result", None, "null", 
                                                f"Appended content to {file_path}")]
            except Exception as e:
                return [create_error_output("error", str(e))]
        
        else:
            return [create_error_output("error", f"Unknown operation: {operation}")]
        
    except Exception as e:
        return [create_error_output("error", f"Unexpected error: {str(e)}")]


def main():
    """Main entry point for the plugin"""
    try:
        # Read plugin root path from command line argument
        plugin_root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
        
        # Add plugin root to Python path for local imports
        sys.path.insert(0, plugin_root)
        
        # Read input from stdin
        input_data = sys.stdin.read().strip()
        if not input_data:
            raise ValueError("No input data provided")
        
        # Parse JSON input
        raw_inputs = json.loads(input_data)
        
        # Convert to InputValue objects
        inputs = {}
        for key, value in raw_inputs.items():
            if isinstance(value, dict) and 'value' in value:
                inputs[key] = InputValue(value['value'], value.get('args', {}))
            else:
                inputs[key] = InputValue(value)
        
        # Execute the plugin
        outputs = execute_plugin(inputs)
        
        # Convert outputs to dictionaries and print as JSON
        output_dicts = [output.to_dict() for output in outputs]
        print(json.dumps(output_dicts, indent=2))
        
    except Exception as e:
        # Handle any errors in the main execution
        error_output = create_error_output("error", str(e), "Plugin execution failed")
        print(json.dumps([error_output.to_dict()], indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
