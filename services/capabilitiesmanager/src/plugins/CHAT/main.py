import sys
import json
import requests
import os
import time
import logging
import tempfile
import shutil
import hashlib
from typing import Dict, Any

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Environment Variables & Constants
POSTOFFICE_URL = os.getenv('POSTOFFICE_URL', 'http://postoffice:5020')
SECURITYMANAGER_URL = os.getenv('SECURITYMANAGER_URL', 'http://securitymanager:5010')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
PLUGIN_CLIENT_ID = "CapabilitiesManager"

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs"""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise Exception(f"Error retrieving auth token")


def ASK_USER_QUESTION(prompt: str, inputs: Dict[str, Any]) -> str:
    """
    Sends a prompt to the user via the PostOffice and waits for their response.
    """
    token = get_auth_token(inputs)
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 1. Send the request to PostOffice to ask the user a question
    request_id = None
    try:
        postoffice_url = POSTOFFICE_URL
        if not postoffice_url.startswith('http://') and not postoffice_url.startswith('https://'):
            postoffice_url = f"http://{postoffice_url}"

        logger.info(f"Sending user input request to {postoffice_url}")
        request_data = {"question": prompt, "answerType": "text"}
        response = requests.post(
            f"{postoffice_url}/sendUserInputRequest",
            json=request_data,
            headers=headers,
            timeout=15
        )
        response.raise_for_status()
        response_data = response.json()
        request_id = response_data.get('request_id')
        if not request_id:
            logger.error("PostOffice did not return a request_id.")
            raise Exception("PostOffice did not return a request_id")
        logger.info(f"User input request sent. request_id: {request_id}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending user input request to PostOffice: {e}")
        raise Exception(f"Error sending user input request: {e}")

    # 2. Poll PostOffice for the user's response
    response_url = f"{postoffice_url}/getUserInputResponse/{request_id}"
    max_wait_seconds = 300  # 5 minutes timeout
    poll_interval_seconds = 2
    waited = 0
    while waited < max_wait_seconds:
        try:
            poll_response = requests.get(response_url, headers=headers, timeout=10)
            if poll_response.status_code == 200:
                poll_data = poll_response.json()
                if poll_data.get('status') == 'completed':
                    answer = poll_data.get('answer', '')
                    # Strict output schema validation
                    if not isinstance(answer, str):
                        raise ValueError("Answer must be a string.")
                    return answer
            elif poll_response.status_code == 404:
                pass  # Not ready yet
        except Exception as poll_err:
            logger.warning(f"Polling error: {poll_err}")
        time.sleep(poll_interval_seconds)
        waited += poll_interval_seconds
    raise Exception("Timed out waiting for user response.")

def execute_plugin(inputs):
    """
    Execute the CHAT plugin with the given inputs.
    """
    message = inputs.get("message", "")

    if not message:
        return [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": None,
                "resultDescription": "The 'message' parameter is required.",
                "error": "The 'message' parameter is required.",
                "mimeType": "text/plain"
            }
        ]

    try:
        # Get user response to the message
        user_response = ASK_USER_QUESTION(message, inputs)

        return [
            {
                "success": True,
                "name": "response",
                "resultType": "string",
                "result": user_response,
                "resultDescription": "User's response to the chat message",
                "mimeType": "text/plain"
            }
        ]
    except Exception as e:
        logger.error(f"Chat plugin execution failed: {str(e)}")
        return [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": None,
                "resultDescription": f"Chat plugin execution failed: {str(e)}",
                "error": str(e),
                "mimeType": "text/plain"
            }
        ]

def main():
    """Main entry point for the plugin."""
    try:
        # Read inputs from stdin
        input_data = sys.stdin.read().strip()
        if not input_data:
            logger.error("No input data received")
            result = [
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "result": None,
                    "resultDescription": "No input data received",
                    "error": "No input data received",
                    "mimeType": "text/plain"
                }
            ]
        else:
            # Parse the input data
            inputs_array = json.loads(input_data)
            inputs_dict = {}
            for item in inputs_array:
                if isinstance(item, list) and len(item) == 2:
                    key, val = item
                    inputs_dict[key] = val # val is already the raw value
                else:
                    logger.warning(f"Skipping invalid input item: {item}")

            # Execute the plugin
            result = execute_plugin(inputs_dict)

        # Output the result as JSON
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {str(e)}")
        result = [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": None,
                "resultDescription": f"Failed to parse input JSON: {str(e)}",
                "error": f"Failed to parse input JSON: {str(e)}",
                "mimeType": "text/plain"
            }
        ]
        print(json.dumps(result))
    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": None,
                "resultDescription": f"Plugin execution failed: {str(e)}",
                "error": f"Plugin execution failed: {str(e)}",
                "mimeType": "text/plain"
            }
        ]
        print(json.dumps(result))

if __name__ == "__main__":
    main()