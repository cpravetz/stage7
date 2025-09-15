import json
import csv
import io
import sys

def query_json(inputs):
    """Queries a JSON object using basic key-value filtering."""
    json_object = inputs.get("json_object")
    query = inputs.get("query")

    if not isinstance(json_object, list):
        return {"error": "JSON object must be a list of dictionaries."}

    if not isinstance(query, dict):
        return {"error": "Query must be a dictionary of key-value pairs."}

    def matches(item, query):
        for key, value in query.items():
            if item.get(key) != value:
                return False
        return True

    results = [item for item in json_object if isinstance(item, dict) and matches(item, query)]
    return {"result": results}

def validate_json(inputs):
    """Validates a JSON string."""
    json_string = inputs.get("json_string")
    try:
        json.loads(json_string)
        return {"is_valid": True, "error": None}
    except json.JSONDecodeError as e:
        return {"is_valid": False, "error": str(e)}

def csv_to_json(inputs):
    """Converts CSV data to a JSON array of objects."""
    csv_data = inputs.get("csv_data")
    csv_file = io.StringIO(csv_data)
    reader = csv.DictReader(csv_file)
    return list(reader)

def json_to_csv(inputs):
    """Converts a JSON array of objects to CSV data."""
    json_data = inputs.get("json_data")
    if not json_data:
        return {"csv_data": ""}
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=json_data[0].keys())
    writer.writeheader()
    writer.writerows(json_data)
    return {"csv_data": output.getvalue()}

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
        return {"error": f"Operation '{operation}' not supported."}

    result = operations[operation](inputs)

    if result is None:
        return {"result": None}

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