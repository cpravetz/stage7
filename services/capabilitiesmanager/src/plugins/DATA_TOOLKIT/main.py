import json
import csv
import io
import sys
import os
import logging
from typing import Any, Dict, List

# Configure logging
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

def query_json(inputs):
    """Queries a JSON object using basic key-value filtering."""
    json_object = inputs.get("json_object")
    query = inputs.get("query")

    if not isinstance(json_object, list):
        if isinstance(json_object, dict):
            json_object = [json_object] # Convert single object to a list containing it
        else:
            return PluginOutput(False, "query_json_error", "error", None, "JSON object must be a list of dictionaries or a single dictionary.", "JSON object must be a list of dictionaries or a single dictionary.").to_dict()

    if not isinstance(query, dict):
        return PluginOutput(False, "query_json_error", "error", None, "Query must be a dictionary of key-value pairs.", "Query must be a dictionary of key-value pairs.").to_dict()

    def matches(item, query):
        for key, value in query.items():
            if item.get(key) != value:
                return False
        return True

    results = [item for item in json_object if isinstance(item, dict) and matches(item, query)]
    return PluginOutput(True, "query_results", "array", results, "Results of JSON query.").to_dict()

def validate_json(inputs):
    """Validates a JSON string."""
    json_string = inputs.get("json_string")
    try:
        json.loads(json_string)
        return PluginOutput(True, "validation_result", "object", {"is_valid": True, "error": None}, "JSON validation successful.").to_dict()
    except json.JSONDecodeError as e:
        return PluginOutput(False, "validation_result", "object", {"is_valid": False, "error": str(e)}, "JSON validation failed.", str(e)).to_dict()

def csv_to_json(inputs):
    """Converts CSV data to a JSON array of objects."""
    csv_data = inputs.get("csv_data")
    try:
        csv_file = io.StringIO(csv_data)
        reader = csv.DictReader(csv_file)
        json_data = list(reader)
        return PluginOutput(True, "json_data", "array", json_data, "CSV data converted to JSON.").to_dict()
    except Exception as e:
        return PluginOutput(False, "csv_to_json_error", "error", None, "Failed to convert CSV to JSON.", str(e)).to_dict()

def json_to_csv(inputs):
    """Converts a JSON array of objects to CSV data."""
    json_data = inputs.get("json_data")
    if not json_data:
        return PluginOutput(True, "csv_data", "string", "", "Empty JSON data, returning empty CSV.").to_dict()
    
    try:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=json_data[0].keys())
        writer.writeheader()
        writer.writerows(json_data)
        return PluginOutput(True, "csv_data", "string", output.getvalue(), "JSON data converted to CSV.").to_dict()
    except Exception as e:
        return PluginOutput(False, "json_to_csv_error", "error", None, "Failed to convert JSON to CSV.", str(e)).to_dict()

def execute_plugin(operation, inputs):
    """
    Main entry point for the DATA_TOOLKIT plugin.
    """
    operations = {
        "query_json": query_json,
        "validate_json": validate_json,
        "csv_to_json": csv_to_json,
        "json_to_csv": json_to_csv,
    }

    if operation not in operations:
        return PluginOutput(False, "operation_error", "error", None, f"Operation '{operation}' not supported.", f"Operation '{operation}' not supported.").to_dict()

    result = operations[operation](inputs)

    # The result from sub-functions is already a dictionary representation of PluginOutput
    return result

if __name__ == "__main__":
    # Read inputs from stdin
    inputs_str = sys.stdin.read().strip()
    if not inputs_str:
        raise ValueError("No input provided")

    # Parse inputs - expecting a list of [key, value] pairs
    inputs_list = json.loads(inputs_str)
    
    # Convert the list of pairs into a dictionary
    inputs_dict = {}
    for item in inputs_list:
        if isinstance(item, list) and len(item) == 2:
            key, val = item
            if isinstance(key, dict):
                sys.stderr.write(f"Warning: Skipping invalid input item with dictionary as key: {item}\n")
                continue
            inputs_dict[key] = val
        else:
            sys.stderr.write(f"Warning: Skipping invalid input item: {item}\n")

    # Extract the operation from the inputs_dict
    operation = inputs_dict.get("operation")
    if isinstance(operation, dict):
        operation = operation.get('value')
        
    if not operation:
        raise ValueError("Missing required input: operation")

    # Pass the rest of the inputs_dict to execute_plugin
    result = execute_plugin(operation, inputs_dict)
    print(json.dumps(result))