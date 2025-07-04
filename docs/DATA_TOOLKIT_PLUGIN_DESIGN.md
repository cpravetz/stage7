# DATA_TOOLKIT Plugin Design

This document outlines the design for the `DATA_TOOLKIT` plugin, which provides tools for processing and manipulating structured data formats.

## 1. File Structure

The plugin will be located in `services/capabilitiesmanager/src/plugins/DATA_TOOLKIT/` and will have the following structure:

```
services/capabilitiesmanager/src/plugins/DATA_TOOLKIT/
├── manifest.json
├── openapi.json
├── main.py
├── requirements.txt
└── README.md
```

## 2. `manifest.json`

```json
{
  "id": "plugin-DATA_TOOLKIT",
  "verb": "DATA_TOOLKIT",
  "description": "A set of tools for processing and manipulating structured data formats like JSON, CSV, and SQL.",
  "explanation": "This plugin provides commands to parse, query, and transform data from various sources, which is a critical capability for data analysis, reporting, and many other complex tasks.",
  "language": "python",
  "entryPoint": {
    "main": "main.py",
    "function": "execute_plugin"
  },
  "repository": {
    "type": "local"
  },
  "security": {
    "permissions": []
  },
  "version": "1.0.0",
  "metadata": {
    "author": "Stage7 Development Team",
    "tags": ["data", "json", "csv", "sql", "toolkit"],
    "category": "utility",
    "license": "MIT"
  }
}
```

## 3. `openapi.json`

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "DATA_TOOLKIT Plugin API",
    "version": "1.0.0",
    "description": "API for processing and manipulating structured data."
  },
  "paths": {
    "/query_json": {
      "post": {
        "summary": "Query a JSON object using a JSONPath expression.",
        "operationId": "query_json",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "json_object": {
                    "type": "object",
                    "description": "The JSON object to query."
                  },
                  "expression": {
                    "type": "string",
                    "description": "The JSONPath expression."
                  }
                },
                "required": ["json_object", "expression"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Query successful.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "result": {
                      "type": "array",
                      "items": {}
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/validate_json": {
      "post": {
        "summary": "Validate a JSON string.",
        "operationId": "validate_json",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "json_string": {
                    "type": "string",
                    "description": "The JSON string to validate."
                  }
                },
                "required": ["json_string"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Validation check complete.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "is_valid": {
                      "type": "boolean"
                    },
                    "error": {
                      "type": "string",
                      "nullable": true
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/csv_to_json": {
      "post": {
        "summary": "Convert CSV data to a JSON array of objects.",
        "operationId": "csv_to_json",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "csv_data": {
                    "type": "string",
                    "description": "The CSV data as a string."
                  }
                },
                "required": ["csv_data"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Conversion successful.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/json_to_csv": {
      "post": {
        "summary": "Convert a JSON array of objects to CSV data.",
        "operationId": "json_to_csv",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "array",
                "items": {
                  "type": "object"
                },
                "description": "A JSON array of objects."
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Conversion successful.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "csv_data": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/execute_sql_on_json": {
      "post": {
        "summary": "Execute a SQL query on a JSON array of objects.",
        "operationId": "execute_sql_on_json",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "json_data": {
                    "type": "array",
                    "items": {
                      "type": "object"
                    },
                    "description": "The JSON data to query."
                  },
                  "sql_query": {
                    "type": "string",
                    "description": "The SQL query to execute."
                  }
                },
                "required": ["json_data", "sql_query"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Query successful.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## 4. `main.py` High-Level Logic

The `main.py` file will contain the core logic for the plugin. It will have a main `execute_plugin` function that dispatches to the appropriate data manipulation function based on the `operation` parameter.

```python
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

    return operations[operation](inputs)
```

## 5. `requirements.txt`

```
jsonpath-ng
duckdb
```

## 6. `README.md`

```md
# DATA_TOOLKIT Plugin

This plugin provides a suite of tools for data manipulation, including support for JSON, CSV, and SQL-based queries on structured data.

## Features

- **JSON Querying:** Use JSONPath expressions to extract data from JSON objects.
- **JSON Validation:** Check if a string is a valid JSON object.
- **CSV/JSON Conversion:** Easily convert data between CSV and JSON formats.
- **SQL on JSON:** Run SQL queries directly on JSON data without needing a traditional database.

## Usage

To use this plugin, specify the desired operation and provide the required inputs. See the `openapi.json` file for detailed API specifications.