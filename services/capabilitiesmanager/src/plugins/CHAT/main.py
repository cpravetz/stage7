#!/usr/bin/env python3
"""
CHAT Plugin - Manages interactive chat sessions with the user.
"""

import sys
import json
import requests
import os
import time
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Environment Variables & Constants
POSTOFFICE_URL = os.getenv('POSTOFFICE_URL', 'http://postoffice:5020')
SECURITY_MANAGER_URL = os.getenv('SECURITY_MANAGER_URL', 'http://securitymanager:5010')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
PLUGIN_CLIENT_ID = "CapabilitiesManager"

def get_auth_token():
    """Gets or refreshes the auth token from the Security Manager."""
    if not CLIENT_SECRET:
        logger.error("CLIENT_SECRET is not set. Cannot authenticate.")
        raise Exception("Plugin is not configured with a client secret.")

    try:
        logger.info(f"Requesting auth token from {SECURITY_MANAGER_URL}")
        response = requests.post(
            f"{SECURITY_MANAGER_URL}/auth/service",
            json={"componentType": PLUGIN_CLIENT_ID, "clientSecret": CLIENT_SECRET},
            timeout=15
        )
        response.raise_for_status()
        token_data = response.json()
        auth_token = token_data.get('token')
        if not auth_token:
            logger.error("Failed to obtain auth token: 'token' field missing in response.")
            raise Exception("Failed to obtain auth token")
        logger.info("Successfully obtained auth token.")
        return auth_token
    except requests.exceptions.RequestException as e:
        logger.error(f"Error contacting Security Manager: {e}")
        raise Exception(f"Error contacting security manager: {e}")

def ASK_USER_QUESTION(prompt: str) -> str:
    """
    Sends a prompt to the user via the PostOffice and waits for their response.
    """
    token = get_auth_token()
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 1. Send the request to PostOffice to ask the user a question
    request_id = None
    try:
        logger.info(f"Sending user input request to {POSTOFFICE_URL}")
        request_data = {"question": prompt, "answerType": "text"}
        response = requests.post(
            f"{POSTOFFICE_URL}/sendUserInputRequest",
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
    response_url = f"{POSTOFFICE_URL}/getUserInputResponse/{request_id}"
    max_wait_seconds = 300  # 5 minutes timeout
    poll_interval_seconds = 2
    start_time = time.time()

    logger.info(f"Polling for response at {response_url}")
    while time.time() - start_time < max_wait_seconds:
        try:
            poll_response = requests.get(response_url, headers=headers, timeout=10)
            if poll_response.status_code == 200:
                data = poll_response.json()
                if data.get('status') == 'completed' and 'response' in data:
                    logger.info(f"Received user response for request_id: {request_id}")
                    return data['response']
                # If status is 'pending' or other, continue polling
            else:
                # Log non-200 responses but continue polling unless it's a fatal error
                logger.warning(f"Polling for user response returned status {poll_response.status_code}")
        except requests.exceptions.RequestException as e:
            logger.warning(f"Polling request failed: {e}. Retrying...")

        time.sleep(poll_interval_seconds)

    logger.error(f"Timed out waiting for user response for request_id: {request_id}")
    raise Exception("Timed out waiting for user response")

def execute_plugin(inputs):
    """
    Execute the CHAT plugin with the given inputs.
    """
    message = inputs.get("message", "")

    if not message:
        return {
            "success": False,
            "error": "The 'message' parameter is required.",
            "outputs": []
        }

    try:
        # Get user response to the message
        user_response = ASK_USER_QUESTION(message)

        return {
            "success": True,
            "outputs": [
                {
                    "name": "response",
                    "value": user_response,
                    "type": "string"
                }
            ]
        }
    except Exception as e:
        logger.error(f"Chat plugin execution failed: {str(e)}")
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