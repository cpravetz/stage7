#!/usr/bin/env python3
"""
API_CLIENT Plugin - A generic interface for interacting with third-party RESTful APIs.
"""

import sys
import json
import requests
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def execute_plugin(inputs):
    """
    A generic interface for interacting with third-party RESTful APIs.
    """
    method = inputs.get("method")
    url = inputs.get("url")
    headers = inputs.get("headers", {})
    body = inputs.get("body", {})
    auth = inputs.get("auth", {})

    if not method or not url:
        return {
            "success": False,
            "error": "The 'method' and 'url' parameters are required.",
            "outputs": []
        }

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

    try:
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

        return {
            "success": True,
            "outputs": [
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
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "outputs": []
        }

def main():
    """Main entry point for the plugin."""
    try:
        # Read inputs from stdin
        input_data = sys.stdin.read().strip()
        if not input_data:
            logger.error("No input data received")
            result = {
                "success": False,
                "error": "No input data received",
                "outputs": []
            }
        else:
            # Parse the input data
            inputs_array = json.loads(input_data)
            inputs_dict = {key: value["value"] for key, value in inputs_array}

            # Execute the plugin
            result = execute_plugin(inputs_dict)

        # Output the result as JSON
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {str(e)}")
        result = {
            "success": False,
            "error": f"Failed to parse input JSON: {str(e)}",
            "outputs": []
        }
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