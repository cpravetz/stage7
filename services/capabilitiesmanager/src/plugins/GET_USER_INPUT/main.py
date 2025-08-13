# --- Robust wrapper for deduplication, temp dir hygiene, and error escalation ---
import tempfile
import shutil
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

_seen_hashes = set()

def robust_execute_plugin(inputs):
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in _seen_hashes:
            return [
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                    "error": "Duplicate input detected."
                }
            ]
        _seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="get_user_input_")
        os.environ["GET_USER_INPUT_TEMP_DIR"] = temp_dir

        # Call the original plugin logic
        result = execute_plugin(inputs)

        # Strict output validation: must be a list or dict
        if not isinstance(result, (list, dict)):
            raise ValueError("Output schema validation failed: must be a list or dict.")

        return result
    except Exception as e:
        # Only escalate to errorhandler for unexpected/code errors
        send_to_errorhandler(e, context=json.dumps(inputs))
        return [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Error: {str(e)}",
                "error": str(e)
            }
        ]
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")
#!/usr/bin/env python3
"""
ASK_USER_QUESTION Plugin - Python Implementation
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
    DIRECT_ANSWER = "DIRECT_ANSWER"
    PLUGIN = "plugin"
    ERROR = "ERROR"

class GetUserInputPlugin:
    def __init__(self):
        self.postoffice_url = os.getenv('POSTOFFICE_URL', 'postoffice:5020')
        self.security_manager_url = os.getenv('SECURITYMANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
    def get_auth_token(self) -> Optional[str]:
        """Get authentication token from SecurityManager"""
        try:
            response = requests.post(
                f"http://{self.security_manager_url}/auth/service",
                json={
                    "componentType": "CapabilitiesManager",
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
        """Send user input request to PostOffice service and return request ID"""
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
                timeout=10
            )
            logger.info(f"PostOffice response status: {response.status_code}")
            logger.info(f"PostOffice response headers: {response.headers}")
            logger.info(f"PostOffice response text: {response.text}")
            response.raise_for_status()
            data = response.json()
            # Expect PostOffice to return a request_id for async tracking
            return data.get('request_id')
        except Exception as e:
            logger.error(f"Failed to send user input request: {e}")
            return None

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ASK_USER_QUESTION plugin asynchronously"""
        try:
            # Extract inputs
            question = None
            choices = None
            answer_type = 'text'

            for key, value in inputs_map.items():
                if key == 'question':
                    if isinstance(value, dict) and 'value' in value:
                        question = value['value']
                    else:
                        question = value
                elif key == 'choices':
                    if isinstance(value, dict) and 'value' in value:
                        choices = value['value']
                    else:
                        choices = value
                elif key == 'answerType':
                    if isinstance(value, dict) and 'value' in value:
                        answer_type = value['value']
                    else:
                        answer_type = value

            if not question:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Question is required for ASK_USER_QUESTION plugin",
                    "result": None,
                    "error": "No question provided to ASK_USER_QUESTION plugin"
                }]

            # Add condition: if question includes 'upload', set answerType to 'File'
            if 'upload' in question.lower():
                answer_type = 'file'

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

            # Send request to PostOffice and get request_id
            request_id = self.send_user_input_request(request_data)

            if request_id is None:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Failed to send user input request to PostOffice service",
                    "result": None,
                    "error": "PostOffice service unavailable or did not return request_id"
                }]

            # Return a pending result with the request_id for async handling
            return [{
                "success": True,
                "name": "pending_user_input",
                "resultType": PluginParameterType.STRING,
                "resultDescription": "User input requested, awaiting response.",
                "result": None,
                "request_id": request_id,
                "mimeType": "application/x-user-input-pending"
            }]

        except Exception as e:
            logger.error(f"ASK_USER_QUESTION plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error in ASK_USER_QUESTION plugin execution",
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
