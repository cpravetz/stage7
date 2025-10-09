#!/usr/bin/env python3
"""
Stage7 Python Plugin Template

This is a template for creating Python plugins for the Stage7 system.
Replace the placeholder code with your actual plugin implementation.

Plugin Structure:
- main.py: Entry point for the plugin (this file)
- requirements.txt: Python dependencies
- manifest.json: Plugin metadata and configuration
- README.md: Plugin documentation

Input/Output Format:
- Input: JSON object with plugin inputs via stdin
- Output: JSON array of PluginOutput objects to stdout
"""

import sys
import json
import os
from typing import Dict, List, Any, Optional

# Import from the installed shared library package
try:
    from stage7_shared_lib import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA
except ImportError:
    # Fallback to direct import for development/testing
    plugin_dir = os.path.dirname(os.path.realpath(__file__))
    shared_lib_path = os.path.abspath(os.path.join(plugin_dir, '../../shared/python/lib'))
    if shared_lib_path not in sys.path:
        sys.path.insert(0, shared_lib_path)
    try:
        from plan_validator import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA
    except ImportError:
        # If shared library is not available, define dummy functions
        class PlanValidator:
            """Dummy plan validator for template"""
            pass

        class AccomplishError(Exception):
            """Dummy error class for template"""
            pass

        # Dummy schema constants
        PLAN_STEP_SCHEMA = {}
        PLAN_ARRAY_SCHEMA = {}

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs"""
    # Try CapabilitiesManager token first (for calling Librarian, PostOffice, etc.)
    if '__auth_token' in inputs:
        token_data = inputs['__auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    # Fallback to Brain token if available
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise ValueError("No authentication token found in inputs")

def get_brain_auth_token(inputs: Dict[str, Any]) -> str:
    """Get Brain authentication token specifically for calling Brain service"""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise ValueError("No Brain authentication token found in inputs")


class InputValue:
    """Represents a plugin input parameter in the new format"""
    def __init__(self, value: Any, valueType: str = "string", args: Dict[str, Any] = None):
        self.value = value
        self.valueType = valueType
        self.args = args or {}

    @property
    def input_value(self):
        """Backward compatibility property"""
        return self.value


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


def execute_plugin(inputs: Dict[str, InputValue]) -> List[PluginOutput]:
    """
    Main plugin execution function.
    
    Args:
        inputs: Dictionary of input parameters
        
    Returns:
        List of PluginOutput objects
        
    TODO: Replace this template implementation with your actual plugin logic
    """
    try:
        # Example: Get input parameters
        # Replace these with your actual input parameter names
        example_input = inputs.get('example_input')
        if not example_input:
            return [create_error_output("error", "Missing required input: example_input")]
        
        input_value = example_input.input_value
        
        # TODO: Implement your plugin logic here
        # This is just a template example
        result = f"Processed input: {input_value}"
        
        # Return successful result
        return [create_success_output("result", result, "string", "Successfully processed input")]
        
    except Exception as e:
        # Handle any unexpected errors
        return [create_error_output("error", str(e), "Unexpected error occurred")]


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
                inputs[key] = InputValue(value['value'], value.get('valueType', 'string'), value.get('args', {}))
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
