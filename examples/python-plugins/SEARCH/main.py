#!/usr/bin/env python3
# DEBUG: main.py
"""
SEARCH Plugin for Stage7

This plugin searches DuckDuckGo for a given term and returns a list of links.
Converted from JavaScript to Python for better maintainability and consistency.
"""

import sys
import json
import os
import requests
from typing import Dict, List, Any, Optional

# DEBUG: Imports successful


class PluginInput:
    """Represents a plugin input parameter"""
    def __init__(self, input_value: Any, args: Dict[str, Any] = None):
        self.input_value = input_value
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


def search_duckduckgo(search_term: str) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo for the given term
    
    Args:
        search_term: The term to search for
        
    Returns:
        List of search results with title and URL
    """
    print(f"DEBUG: search_duckduckgo: Received search_term: '{search_term}'", file=sys.stderr)
    try:
        # Use DuckDuckGo Instant Answer API
        url = 'https://api.duckduckgo.com/'
        params = {
            'q': search_term,
            'format': 'json',
            'no_html': '1',
            'skip_disambig': '1'
        }
        print(f"DEBUG: search_duckduckgo: Requesting URL: {url} with params: {json.dumps(params)}", file=sys.stderr)

        response = requests.get(url, params=params, timeout=10)

        print(f"DEBUG: search_duckduckgo: Response status code: {response.status_code}", file=sys.stderr)
        print(f"DEBUG: search_duckduckgo: Raw response content (first 500 chars): {response.text[:500]}", file=sys.stderr)
        
        response.raise_for_status()

        try:
            data = response.json()
            print(f"DEBUG: search_duckduckgo: Parsed JSON data: {json.dumps(data, indent=2)}", file=sys.stderr)
        except json.JSONDecodeError as e:
            print(f"DEBUG: search_duckduckgo: JSON parsing failed: {str(e)}", file=sys.stderr)
            raise Exception(f"Failed to parse search results: {str(e)}")
        
        results = []
        
        # Extract results from RelatedTopics
        if 'RelatedTopics' in data:
            for topic in data['RelatedTopics']:
                if isinstance(topic, dict) and 'Text' in topic and 'FirstURL' in topic:
                    if topic['Text'] and topic['FirstURL']:
                        results.append({
                            'title': topic['Text'],
                            'url': topic['FirstURL']
                        })
        
        # If no RelatedTopics, try Abstract
        if not results and 'Abstract' in data and data['Abstract']:
            if 'AbstractURL' in data and data['AbstractURL']:
                results.append({
                    'title': data['Abstract'],
                    'url': data['AbstractURL']
                })
        
        # If still no results, try Definition
        if not results and 'Definition' in data and data['Definition']:
            if 'DefinitionURL' in data and data['DefinitionURL']:
                results.append({
                    'title': data['Definition'],
                    'url': data['DefinitionURL']
                })
        
        print(f"DEBUG: search_duckduckgo: Extracted results: {json.dumps(results, indent=2)}", file=sys.stderr)
        return results
        
    except requests.exceptions.RequestException as e:
        print(f"DEBUG: search_duckduckgo: RequestException: {str(e)}", file=sys.stderr)
        raise Exception(f"Failed to search DuckDuckGo: {str(e)}")
    # JSONDecodeError is now handled within the try block for response.json()
    # except json.JSONDecodeError as e:
    #     print(f"DEBUG: search_duckduckgo: JSONDecodeError: {str(e)}", file=sys.stderr)
    #     raise Exception(f"Failed to parse search results: {str(e)}")


def execute_plugin(inputs: Dict[str, PluginInput]) -> List[PluginOutput]:
    """
    Main plugin execution function for SEARCH plugin
    
    Args:
        inputs: Dictionary of input parameters
        
    Returns:
        List of PluginOutput objects
    """
    # DEBUG: Log received inputs
    try:
        inputs_log_str = json.dumps({k: v.input_value if isinstance(v, PluginInput) else v for k, v in inputs.items()})
        print(f"DEBUG: execute_plugin: Received inputs: {inputs_log_str}", file=sys.stderr)
    except Exception as log_e:
        print(f"DEBUG: execute_plugin: Error logging inputs: {str(log_e)}", file=sys.stderr)

    outputs: List[PluginOutput]
    try:
        # Get search term input
        search_term_input = inputs.get('searchTerm')
        if not search_term_input:
            return [create_error_output("error", "Missing required input: searchTerm")]
        
        search_term = search_term_input.input_value
        if not search_term or not isinstance(search_term, str):
            return [create_error_output("error", "Search term must be a non-empty string")]
        
        search_term = search_term.strip()
        if not search_term:
            return [create_error_output("error", "Search term cannot be empty")]
        
        # Perform the search
        results = search_duckduckgo(search_term)
        
        if not results:
            return [create_success_output("results", [], "array", 
                                        f"No search results found for '{search_term}'")]
        
        # Return successful results
        outputs = [create_success_output("results", results, "array",
                                         f"Found {len(results)} search results for '{search_term}'")]
        
    except Exception as e:
        print(f"DEBUG: execute_plugin: Caught exception: {str(e)}", file=sys.stderr)
        outputs = [create_error_output("error", f"Search failed: {str(e)}")]

    # DEBUG: Log returned outputs
    try:
        outputs_log_str = json.dumps([o.to_dict() for o in outputs])
        print(f"DEBUG: execute_plugin: Returning outputs: {outputs_log_str}", file=sys.stderr)
    except Exception as log_e:
        print(f"DEBUG: execute_plugin: Error logging outputs: {str(log_e)}", file=sys.stderr)

    return outputs


def main():
    """Main entry point for the plugin"""
    # DEBUG: Starting main function
    print("DEBUG: main: Plugin script started.", file=sys.stderr)
    try:
        # Read plugin root path from command line argument
        plugin_root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
        print(f"DEBUG: main: Plugin root path: {plugin_root}", file=sys.stderr)
        
        # Add plugin root to Python path for local imports
        sys.path.insert(0, plugin_root)
        
        # Read input from stdin
        input_data = sys.stdin.read().strip()
        print(f"DEBUG: main: Raw input_data from stdin: '{input_data}'", file=sys.stderr)
        if not input_data:
            # Adding stderr log for this specific error case
            print("DEBUG: main: No input data provided, raising ValueError.", file=sys.stderr)
            raise ValueError("No input data provided")
        
        # Parse JSON input
        raw_inputs = json.loads(input_data)
        print(f"DEBUG: main: Parsed raw_inputs: {json.dumps(raw_inputs)}", file=sys.stderr)
        
        # Convert to PluginInput objects
        inputs: Dict[str, PluginInput] = {}
        for key, value in raw_inputs.items():
            if isinstance(value, dict) and 'inputValue' in value:
                inputs[key] = PluginInput(value['inputValue'], value.get('args', {}))
            else:
                # Handle cases where the value might not be a dict, e.g., direct string or number
                inputs[key] = PluginInput(value)
        print(f"DEBUG: main: Converted inputs dictionary: {json.dumps({k: v.input_value for k, v in inputs.items()})}", file=sys.stderr)
        
        # Execute the plugin
        outputs = execute_plugin(inputs)
        
        # Convert outputs to dictionaries and print as JSON
        output_dicts = [output.to_dict() for output in outputs]
        print(json.dumps(output_dicts, indent=2))
        # DEBUG: Successfully printed JSON output to stdout
        print("DEBUG: main: Successfully printed JSON output to stdout.", file=sys.stderr)
        
    except Exception as e:
        # Handle any errors in the main execution
        print(f"DEBUG: main: Caught exception in main try-except block: {str(e)}", file=sys.stderr)
        error_output = create_error_output("error", str(e), "Plugin execution failed")
        # Ensure this also goes to stdout as per plugin communication protocol
        print(json.dumps([error_output.to_dict()], indent=2))
        sys.exit(1)


if __name__ == "__main__":
    # DEBUG: Script execution started
    print("DEBUG: __main__: Script execution started.", file=sys.stderr)
    main()
