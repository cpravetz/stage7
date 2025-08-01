def query_json(inputs):
    """Queries a JSON object using a JSONPath expression."""
    json_object = inputs.get("json_object")
    expression = inputs.get("expression")
    jsonpath_expression = parse(expression)
    matches = [match.value for match in jsonpath_expression.find(json_object)]
    return {"result": matches}

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

def execute_sql_on_json(inputs):
    """Executes a SQL query on a JSON array of objects."""
    json_data = inputs.get("json_data")
    sql_query = inputs.get("sql_query")
    
    # DuckDB can query a list of dictionaries directly
    result = duckdb.query(sql_query, my_table=json_data).to_df().to_dict(orient='records')
    return result

def execute_plugin(operation, inputs):
    """
    Main entry point for the DATA_TOOLKIT plugin.
    """
    operations = {
        "query_json": query_json,
        "validate_json": validate_json,
        "csv_to_json": csv_to_json,
        "json_to_csv": json_to_csv,
        "execute_sql_on_json": execute_sql_on_json,
    }

    if operation not in operations:
        return {"error": f"Operation '{operation}' not supported."}

    return operations[operation](inputs)
import json
import csv
import io
from jsonpath_ng import jsonpath, parse
import duckdb
import tempfile
import shutil
import os
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

seen_hashes = set()

def execute_plugin(operation, inputs):
    temp_dir = None
    try:
        # Deduplication: hash the operation and inputs
        hash_input = json.dumps({'operation': operation, 'inputs': inputs}, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in seen_hashes:
            return {"error": "Duplicate input detected. This operation/input combination has already failed. Aborting to prevent infinite loop."}
        seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="data_toolkit_")
        os.environ["DATA_TOOLKIT_TEMP_DIR"] = temp_dir

        operations = {
            "query_json": query_json,
            "validate_json": validate_json,
            "csv_to_json": csv_to_json,
            "json_to_csv": json_to_csv,
            "execute_sql_on_json": execute_sql_on_json,
        }

        if operation not in operations:
            return {"error": f"Operation '{operation}' not supported."}

        result = operations[operation](inputs)

        # Strict output validation (example: must be dict, not None)
        if result is None or not isinstance(result, (dict, list)):
            raise ValueError("Output schema validation failed: result must be dict or list.")

        return result
    except Exception as e:
        # Only escalate to errorhandler for unexpected/code errors
        send_to_errorhandler(e, context=json.dumps({'operation': operation, 'inputs': inputs}))
        return {"error": f"Unexpected error: {str(e)}"}
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")