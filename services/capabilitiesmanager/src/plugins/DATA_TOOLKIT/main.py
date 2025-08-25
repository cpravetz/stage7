import json
import csv
import io
from jsonpath_ng import jsonpath, parse
import duckdb

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

    result = operations[operation](inputs)

    # Ensure result is a dictionary or list for JSON serialization
    if result is None:
        return {"result": None} # Or handle as an error if None is not expected

    return result
