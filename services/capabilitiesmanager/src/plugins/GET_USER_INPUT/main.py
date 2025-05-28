#!/usr/bin/env python3
"""
GET_USER_INPUT Plugin - Python Implementation
Requests input from the user via PostOffice service
"""

import json
import sys
import os
import requests
from typing import Dict, List, Any, Optional, Union
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PluginParameterType:
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    ERROR = "ERROR"

class GetUserInputPlugin:
    def __init__(self):
        self.postoffice_url = os.getenv('POSTOFFICE_URL', 'postoffice:5020')
        self.security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
    def get_auth_token(self) -> Optional[str]:
        """Get authentication token from SecurityManager"""
        try:
            response = requests.post(
                f"http://{self.security_manager_url}/generateToken",
                json={
                    "clientId": "GET_USER_INPUT_Plugin",
                    "clientSecret": self.client_secret
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            return data.get('token')
        except Exception as e:
            logger.error(f"Failed to get auth token: {e}")
            return None

    def send_user_input_request(self, request_data: Dict[str, Any]) -> Optional[str]:
        """Send user input request to PostOffice service"""
        try:
            if not self.token:
                self.token = self.get_auth_token()
                if not self.token:
                    raise Exception("Failed to obtain authentication token")

            headers = {
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/json'
            }
            
            response = requests.post(
                f"http://{self.postoffice_url}/sendUserInputRequest",
                json=request_data,
                headers=headers,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
            return data.get('result', '')
        except Exception as e:
            logger.error(f"Failed to send user input request: {e}")
            return None

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the GET_USER_INPUT plugin"""
        try:
            # Extract inputs
            question = None
            choices = None
            answer_type = 'text'

            for key, value in inputs_map.items():
                if key == 'question':
                    if isinstance(value, dict) and 'inputValue' in value:
                        question = value['inputValue']
                    else:
                        question = value
                elif key == 'choices':
                    if isinstance(value, dict) and 'inputValue' in value:
                        choices = value['inputValue']
                    else:
                        choices = value
                elif key == 'answerType':
                    if isinstance(value, dict) and 'inputValue' in value:
                        answer_type = value['inputValue']
                    else:
                        answer_type = value

            if not question:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Question is required for GET_USER_INPUT plugin",
                    "result": None,
                    "error": "No question provided to GET_USER_INPUT plugin"
                }]

            # Prepare request data
            request_data = {
                "question": question,
                "answerType": answer_type or 'text'
            }

            # Add choices if provided
            if choices:
                if isinstance(choices, list):
                    request_data["choices"] = choices
                elif isinstance(choices, str):
                    # Try to parse as JSON array
                    try:
                        parsed_choices = json.loads(choices)
                        if isinstance(parsed_choices, list):
                            request_data["choices"] = parsed_choices
                        else:
                            request_data["choices"] = [choices]
                    except json.JSONDecodeError:
                        request_data["choices"] = [choices]
                else:
                    request_data["choices"] = [str(choices)]

            # Send request to PostOffice
            response = self.send_user_input_request(request_data)

            if response is None:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Failed to get user input from PostOffice service",
                    "result": None,
                    "error": "PostOffice service unavailable or returned empty response"
                }]

            return [{
                "success": True,
                "name": "answer",
                "resultType": PluginParameterType.STRING,
                "resultDescription": "User response",
                "result": response,
                "mimeType": "text/plain"
            }]

        except Exception as e:
            logger.error(f"GET_USER_INPUT plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error in GET_USER_INPUT plugin execution",
                "result": None,
                "error": str(e)
            }]

def main():
    """Main entry point for the plugin"""
    try:
        # Read inputs from stdin
        inputs_str = sys.stdin.read().strip()
        if not inputs_str:
            raise ValueError("No input provided")

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)
        inputs_map = {item[0]: item[1] for item in inputs_list}

        # Execute plugin
        plugin = GetUserInputPlugin()
        results = plugin.execute(inputs_map)

        # Output results to stdout
        print(json.dumps(results))

    except Exception as e:
        error_result = [{
            "success": False,
            "name": "error",
            "resultType": PluginParameterType.ERROR,
            "resultDescription": "Plugin execution error",
            "result": None,
            "error": str(e)
        }]
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
