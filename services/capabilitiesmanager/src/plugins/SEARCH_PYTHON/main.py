# --- Robust wrapper for deduplication, temp dir hygiene, and error escalation ---
import tempfile
import shutil
import hashlib

# Error handler integration (for unexpected/code errors only)
def send_to_errorhandler(error, context=None):
    try:
        import requests
        errorhandler_url = os.environ.get('ERRORHANDLER_URL', 'errorhandler:5090')
        payload = {
            'error': str(error),
            'context': context or ''
        }
        requests.post(f'http://{errorhandler_url}/analyze', json=payload, timeout=10)
    except Exception as e:
        print(f"Failed to send error to errorhandler: {e}")

_seen_hashes = set()

def robust_execute_plugin(inputs):
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in _seen_hashes:
            return [
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                    "error": "Duplicate input detected."
                }
            ]
        _seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="search_python_")
        os.environ["SEARCH_PYTHON_TEMP_DIR"] = temp_dir

        # Call the original plugin logic
        result = execute_plugin(inputs)

        # Strict output validation: must be a list
        if not isinstance(result, list) or not result:
            raise ValueError("Output schema validation failed: must be a non-empty list.")

        return result
    except Exception as e:
        # Only escalate to errorhandler for unexpected/code errors
        send_to_errorhandler(e, context=json.dumps(inputs))
        return [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Error: {str(e)}",
                "error": str(e)
            }
        ]
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")
#!/usr/bin/env python3
"""
SEARCH Plugin for Stage7 (Python Version)

This plugin searches SearchXNG for a given term and returns a list of links.
Converted from JavaScript to Python for better maintainability and consistency.
"""

import sys
import json
import os
import requests
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)
# BasicConfig for logging, in case not configured by environment
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

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


def search_duckduckgo(search_term: str) -> List[Dict[str, str]]:
    """
    Search DuckDuckGo for the given term
    
    Args:
        search_term: The term to search for
        
    Returns:
        List of search results with title and URL
    """
    print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Received search_term: '{search_term}'", file=sys.stderr)
    try:
        # Use DuckDuckGo Instant Answer API
        url = 'https://api.duckduckgo.com/'
        params = {
            'q': search_term,
            'format': 'json',
            'no_html': '1',
            'skip_disambig': '1'
        }
        print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Requesting URL: {url} with params: {json.dumps(params)}", file=sys.stderr)

        response = requests.get(url, params=params, timeout=10)

        print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Response status code: {response.status_code}", file=sys.stderr)
        print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Raw response content (first 500 chars): {response.text[:500]}", file=sys.stderr)
        
        response.raise_for_status()

        try:
            data = response.json()
            print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Parsed JSON data: {json.dumps(data, indent=2)}", file=sys.stderr)
        except json.JSONDecodeError as e_json:
            print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: JSON parsing failed: {str(e_json)}", file=sys.stderr)
            raise Exception(f"Failed to parse search results: {str(e_json)}") # Re-raise to be caught by the outer try-except
        
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
        
        print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Extracted results: {json.dumps(results, indent=2)}", file=sys.stderr)
        return results
        
    except requests.exceptions.RequestException as e_req:
        print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: RequestException: {str(e_req)}", file=sys.stderr)
        raise Exception(f"Failed to search DuckDuckGo: {str(e_req)}")
    # JSONDecodeError is handled above, this is a fallback if it's not caught there for some reason or occurs elsewhere.
    except json.JSONDecodeError as e_json_outer:
        print(f"DEBUG_SEARCH_PYTHON: search_duckduckgo: Outer JSONDecodeError: {str(e_json_outer)}", file=sys.stderr)
        raise Exception(f"Failed to parse search results (outer): {str(e_json_outer)}")


def search_searxng(search_term: str) -> List[Dict[str, str]]:
    """
    Search SearxNG for the given term as a backup if DuckDuckGo fails.
    Returns a list of results with title and url.
    """
    print(f"DEBUG_SEARCH_PYTHON: search_searxng: Received search_term: '{search_term}'", file=sys.stderr)
    try:
        # You may want to use your own SearxNG instance for reliability
        searxng_url = 'https://searxng.site/search'
        params = {
            'q': search_term,
            'format': 'json',
            'categories': 'general',
            'language': 'en',
        }
        print(f"DEBUG_SEARCH_PYTHON: search_searxng: Requesting URL: {searxng_url} with params: {json.dumps(params)}", file=sys.stderr)
        response = requests.get(searxng_url, params=params, timeout=10)
        print(f"DEBUG_SEARCH_PYTHON: search_searxng: Response status code: {response.status_code}", file=sys.stderr)
        print(f"DEBUG_SEARCH_PYTHON: search_searxng: Raw response content (first 500 chars): {response.text[:500]}", file=sys.stderr)
        response.raise_for_status()
        data = response.json()
        print(f"DEBUG_SEARCH_PYTHON: search_searxng: Parsed JSON data: {json.dumps(data, indent=2)[:500]}", file=sys.stderr)
        results = []
        for r in data.get('results', []):
            if r.get('title') and r.get('url'):
                results.append({'title': r['title'], 'url': r['url']})
        print(f"DEBUG_SEARCH_PYTHON: search_searxng: Extracted results: {json.dumps(results, indent=2)}", file=sys.stderr)
        return results
    except Exception as e:
        print(f"DEBUG_SEARCH_PYTHON: search_searxng: Exception: {str(e)}", file=sys.stderr)
        raise Exception(f"Failed to search SearxNG: {str(e)}")


def execute_plugin(inputs: Dict[str, InputValue]) -> List[PluginOutput]:
    """
    Main plugin execution function for SEARCH plugin
    
    Args:
        inputs: Dictionary of input parameters as InputValue instances
        
    Returns:
        List of PluginOutput objects
    """
    outputs_final: List[PluginOutput]
    try:
        # DEBUG_SEARCH_PYTHON: Log received inputs
        try:
            inputs_log_str = json.dumps({k: v.value if isinstance(v, InputValue) else v for k, v in inputs.items()})
            print(f"DEBUG_SEARCH_PYTHON: execute_plugin: Received inputs: {inputs_log_str}", file=sys.stderr)
        except Exception as log_e:
            print(f"DEBUG_SEARCH_PYTHON: execute_plugin: Error logging inputs: {str(log_e)}", file=sys.stderr)

        logger.info(f"SEARCH_PYTHON execute_plugin(): Received inputs: { {k: (v.value if isinstance(v, InputValue) else v) for k, v in inputs.items()} }")

        search_term_input_obj = inputs.get('searchTerm')
        if search_term_input_obj:
            logger.info(f"SEARCH_PYTHON execute_plugin(): searchTerm InputValue object: value='{search_term_input_obj.value}', type={type(search_term_input_obj.value)}")
        else:
            logger.warning("SEARCH_PYTHON execute_plugin(): 'searchTerm' key not found in inputs.")

        # Get search term input
        search_term_input = inputs.get('searchTerm')
        if not search_term_input:
            return [create_error_output("error", "Missing required input: searchTerm")]
        
        search_term = search_term_input.value
        if not search_term or not isinstance(search_term, str):
            return [create_error_output("error", "Search term must be a non-empty string")]
        
        search_term = search_term.strip()
        if not search_term:
            return [create_error_output("error", "Search term cannot be empty")]
        
        # Perform the search
        try:
            results = search_duckduckgo(search_term)
        except Exception as ddg_exc:
            print(f"DEBUG_SEARCH_PYTHON: execute_plugin: DuckDuckGo search failed: {str(ddg_exc)}", file=sys.stderr)
            results = []
            ddg_error = str(ddg_exc)
        else:
            ddg_error = None

        # If DuckDuckGo failed or returned no results, try SearxNG
        if not results:
            print(f"DEBUG_SEARCH_PYTHON: execute_plugin: No results from DuckDuckGo, trying SearxNG...", file=sys.stderr)
            try:
                results = search_searxng(search_term)
            except Exception as searx_exc:
                print(f"DEBUG_SEARCH_PYTHON: execute_plugin: SearxNG search failed: {str(searx_exc)}", file=sys.stderr)
                # If both fail, return error output
                error_msg = f"DuckDuckGo failed: {ddg_error}. SearxNG failed: {str(searx_exc)}"
                return [create_error_output("error", error_msg)]
            if not results:
                return [create_success_output("results", [], "array", 
                    f"No search results found for '{search_term}' (tried DuckDuckGo and SearxNG)")]
        
        # Return successful results
        outputs_final = [create_success_output("results", results, "array",
                                    f"Found {len(results)} search results for '{search_term}'")]
        
    except Exception as e:
        print(f"DEBUG_SEARCH_PYTHON: execute_plugin: Caught exception: {str(e)}", file=sys.stderr)
        outputs_final = [create_error_output("error", f"Search failed: {str(e)}")]

    # DEBUG_SEARCH_PYTHON: Log returned outputs
    try:
        outputs_log_str = json.dumps([o.to_dict() for o in outputs_final])
        print(f"DEBUG_SEARCH_PYTHON: execute_plugin: Returning outputs: {outputs_log_str}", file=sys.stderr)
    except Exception as log_e:
        print(f"DEBUG_SEARCH_PYTHON: execute_plugin: Error logging outputs: {str(log_e)}", file=sys.stderr)

    return outputs_final


def main():
    """Main entry point for the plugin"""
    print("DEBUG_SEARCH_PYTHON: main: Plugin script started.", file=sys.stderr)
    try:
        # Read plugin root path from command line argument
        plugin_root = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
        print(f"DEBUG_SEARCH_PYTHON: main: Plugin root path: {plugin_root}", file=sys.stderr)
        
        # Add plugin root to Python path for local imports
        sys.path.insert(0, plugin_root)
        
        # Read input from stdin
        input_data = sys.stdin.read().strip()
        print(f"DEBUG_SEARCH_PYTHON: main: Raw input_data from stdin: '{input_data}'", file=sys.stderr)
        logger.info(f"SEARCH_PYTHON main(): Raw input_data from stdin: {input_data}") # Keep existing logger call
        if not input_data:
            print("DEBUG_SEARCH_PYTHON: main: No input data provided, raising ValueError.", file=sys.stderr)
            raise ValueError("No input data provided")
        
        # Parse JSON input (which is an array of [key, value_dict] pairs)
        input_list_of_pairs = json.loads(input_data)
        print(f"DEBUG_SEARCH_PYTHON: main: Parsed input_list_of_pairs: {json.dumps(input_list_of_pairs)}", file=sys.stderr)
        
        if not isinstance(input_list_of_pairs, list):
            print(f"DEBUG_SEARCH_PYTHON: main: Input data is not a list as expected. Type: {type(input_list_of_pairs)}", file=sys.stderr)
            raise ValueError("Input data should be a JSON array of [key, value] pairs.")

        # Convert to InputValue objects
        inputs: Dict[str, InputValue] = {}
        for item in input_list_of_pairs:
            if not (isinstance(item, (list, tuple)) and len(item) == 2):
                print(f"DEBUG_SEARCH_PYTHON: main: Invalid item format in input_list_of_pairs: {item}", file=sys.stderr)
                raise ValueError(f"Each item in the input array should be a [key, value] pair. Found: {item}")

            key, value_dict = item

            if isinstance(value_dict, dict) and 'value' in value_dict:
                inputs[key] = InputValue(value_dict['value'], value_dict.get('args', {}))
            else:
                # This case might occur if a non-standard InputValue structure is sent,
                # or if the value is simple (though CapabilitiesManager usually sends the full structure).
                # For robustness, we'll still wrap it, but this path is less expected for typical inputs.
                print(f"DEBUG_SEARCH_PYTHON: main: Value for key '{key}' is not a standard InputValue dict, wrapping directly: {value_dict}", file=sys.stderr)
                inputs[key] = InputValue(value_dict)

        inputs_for_logging = {k: (v.input_value if isinstance(v, InputValue) else v) for k, v in inputs.items()}
        # This log is already covered by the DEBUG_SEARCH_PYTHON one below, but kept for compatibility with existing logs if any
        print(f"DEBUG_SEARCH_PYTHON: main: Converted inputs dictionary (showing values): {json.dumps(inputs_for_logging)}", file=sys.stderr)
        
        # Execute the plugin
        outputs = execute_plugin(inputs)
        
        # Convert outputs to dictionaries and print as JSON
        output_dicts = [output.to_dict() for output in outputs]
        print(json.dumps(output_dicts, indent=2))
        print("DEBUG_SEARCH_PYTHON: main: Successfully printed JSON output to stdout.", file=sys.stderr)
        
    except Exception as e:
        # Handle any errors in the main execution
        print(f"DEBUG_SEARCH_PYTHON: main: Caught exception in main try-except block: {str(e)}", file=sys.stderr)
        error_output = create_error_output("error", str(e), "Plugin execution failed")
        # Ensure this also goes to stdout as per plugin communication protocol
        print(json.dumps([error_output.to_dict()], indent=2))
        sys.exit(1)


if __name__ == "__main__":
    print("DEBUG_SEARCH_PYTHON: __main__: Script execution started.", file=sys.stderr)
    main()
