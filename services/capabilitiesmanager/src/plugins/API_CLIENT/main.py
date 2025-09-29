#!/usr/bin/env python3
"""
API_CLIENT Plugin - A generic interface for interacting with third-party RESTful APIs.
"""

import sys
import json
import requests
import logging
import tempfile
import shutil
import os
import hashlib

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

seen_hashes = set()

def execute_plugin(inputs):
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in seen_hashes:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Duplicate input detected",
                "resultDescription": "This input combination has already failed. Aborting to prevent infinite loop.",
                "mimeType": "text/plain",
                "error": "Duplicate input detected"
            }]
        seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="api_client_")
        os.environ["API_CLIENT_TEMP_DIR"] = temp_dir

        # Extract inputs, handling both wrapped and raw values
        method = None
        url = None
        headers = {}
        body = {}
        auth = {}

        for key, value in inputs.items():
            if key == 'method':
                if isinstance(value, dict) and 'value' in value:
                    method = value['value']
                else:
                    method = value
            elif key == 'url':
                if isinstance(value, dict) and 'value' in value:
                    url = value['value']
                else:
                    url = value
            elif key == 'headers':
                if isinstance(value, dict) and 'value' in value:
                    headers = value['value'] if value['value'] else {}
                else:
                    headers = value if value else {}
            elif key == 'body':
                if isinstance(value, dict) and 'value' in value:
                    body = value['value'] if value['value'] else {}
                else:
                    body = value if value else {}
            elif key == 'auth':
                if isinstance(value, dict) and 'value' in value:
                    auth = value['value'] if value['value'] else {}
                else:
                    auth = value if value else {}

        if not method or not url:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameters",
                "resultDescription": "The 'method' and 'url' parameters are required.",
                "mimeType": "text/plain",
                "error": "The 'method' and 'url' parameters are required."
            }]

        if not isinstance(method, str):
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Invalid parameter type",
                "resultDescription": f"The 'method' parameter must be a string, but got {type(method).__name__}.",
                "mimeType": "text/plain",
                "error": "Invalid parameter type"
            }]

        # Authentication handling
        auth_strategy = None
        if auth:
            auth_type = auth.get("type")
            if auth_type == "bearer":
                headers["Authorization"] = f"Bearer {auth.get('token')}"
            elif auth_type == "api_key":
                headers[auth.get("key")] = auth.get("value")
            elif auth_type == "basic":
                auth_strategy = (auth.get("username"), auth.get("password"))

        response = requests.request(
            method=method.upper(),
            url=url,
            headers=headers,
            json=body if body else None,
            auth=auth_strategy,
            timeout=30
        )
        response.raise_for_status()  # Raise an exception for bad status codes

        # Try to parse the response body as JSON
        try:
            response_body = response.json()
        except json.JSONDecodeError:
            response_body = response.text

        output_list = [
                {
                    "name": "status_code",
                    "value": response.status_code,
                    "type": "number"
                },
                {
                    "name": "headers",
                    "value": dict(response.headers),
                    "type": "object"
                },
                {
                    "name": "body",
                    "value": response_body,
                    "type": "object" if isinstance(response_body, dict) else "string"
                }
            ]
        # Strict output validation
        if not isinstance(output_list, list):
            raise ValueError("Output schema validation failed: must be a list of outputs.")

        return output_list
    except Exception as e:
        # Log the error locally and return a structured error output
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"Unexpected error during API request execution",
            "mimeType": "text/plain",
            "error": str(e)
        }]
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")

def main():
    """Main entry point for the plugin."""
    try:
        # Read inputs from stdin
        input_data = sys.stdin.read().strip()
        if not input_data:
            logger.error("No input data received")
            result = [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "resultDescription": "Plugin received no input data on stdin",
                "mimeType": "text/plain",
                "error": "No input data received"
            }]
        else:
            # Parse the input data
            inputs_array = json.loads(input_data)
            inputs_dict = {}
            for item in inputs_array:
                if isinstance(item, list) and len(item) == 2:
                    key, val = item
                    inputs_dict[key] = val
                else:
                    logger.warning(f"Skipping invalid input item: {item}")

            # Execute the plugin
            result = execute_plugin(inputs_dict)

        # Output the result as JSON
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {str(e)}")
        result = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": "Failed to parse input JSON",
            "mimeType": "text/plain",
            "error": str(e)
        }]
        print(json.dumps(result))
    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = {
            "success": False,
            "error": f"Plugin execution failed: {str(e)}",
            "outputs": []
        }
        print(json.dumps(result))

if __name__ == "__main__":
    main()