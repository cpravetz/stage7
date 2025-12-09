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

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {'value':...} wrapper."""
    raw_val = inputs.get(key)
    
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    
    if raw_val is None:
        return default

    if isinstance(raw_val, dict) and 'value' in raw_val:
        # Return the value, but if it's None, return the default
        return raw_val['value'] if raw_val['value'] is not None else default
    
    return raw_val if raw_val is not None else default

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

        # Extract inputs using a helper that handles aliases and data wrappers
        method = _get_input(inputs, 'method', ['httpMethod', 'verb', 'http_method'])
        url = _get_input(inputs, 'url', ['endpoint', 'uri'])
        headers = _get_input(inputs, 'headers', ['http_headers', 'hdrs', 'header'], default={})
        body = _get_input(inputs, 'body', ['payload', 'data'], default={})
        auth = _get_input(inputs, 'auth', ['authentication', 'credentials', 'auth_info'], default={})

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

        return [
            {
                "success": True,
                "name": "api_response",
                "resultType": "object",
                "result": {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "body": response_body
                },
                "resultDescription": "The response from the API call."
            }
        ]
    except Exception as e:
        # Log the error locally and return a structured error output
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"Unexpected error during API request execution",
            "mimeType": "text/plain"
        }]
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict.

    Handles multiple input formats:
    - Plain dict: {"method": "GET", "url": "..."}
    - Array of pairs: [["method", "GET"], ["url", "..."]]
    - Map format: {"_type": "Map", "entries": [["method", "GET"], ...]}
    """
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {}

        # Case 1: Plain dict (most common from pluginExecutor.ts)
        if isinstance(payload, dict):
            # Check for Map format with entries
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                # Plain dict - copy all non-meta keys
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        # Case 2: Array of [key, value] pairs
        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value
                else:
                    logger.debug(f"Skipping invalid input item in array: {item}")

        else:
            logger.warning(f"Unexpected input format: {type(payload).__name__}")

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {e}")
        raise
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise

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
            inputs_dict = parse_inputs(input_data)

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