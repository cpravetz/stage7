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
        self.brain_url = os.getenv('BRAIN_URL', 'brain:5070')
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

    def attempt_internal_resolution(self, question: str, inputs_map: Dict[str, Any]) -> Optional[str]:
        """
        Attempt to resolve the question internally before prompting the user.
        Returns the answer if resolved, None if user input is still needed.
        """
        try:
            # Check for common patterns that can be resolved automatically
            question_lower = question.lower()

            # Pattern 1: Questions about preferences that have reasonable defaults
            if any(phrase in question_lower for phrase in ['prefer', 'would you like', 'do you want']):
                if 'format' in question_lower:
                    return "JSON format"
                elif 'approach' in question_lower:
                    return "Use the most efficient approach"
                elif 'method' in question_lower:
                    return "Use the standard method"

            # Pattern 2: Questions about technical details that can be inferred
            if 'which' in question_lower and ('version' in question_lower or 'type' in question_lower):
                return "Use the latest stable version"

            # Pattern 3: Questions about file locations or paths
            if any(phrase in question_lower for phrase in ['where', 'location', 'path', 'directory']):
                if 'save' in question_lower or 'store' in question_lower:
                    return "Use the default location"

            # Pattern 4: Yes/No questions with reasonable defaults
            if question_lower.endswith('?') and any(word in question_lower for word in ['should', 'would', 'can', 'do']):
                # For most operational questions, default to "yes" for proceeding
                if any(phrase in question_lower for phrase in ['proceed', 'continue', 'start', 'begin', 'create', 'generate']):
                    return "yes"
                # For destructive actions, default to "no"
                elif any(phrase in question_lower for phrase in ['delete', 'remove', 'destroy', 'overwrite']):
                    return "no"

            # Pattern 5: Try to use Brain service for more complex questions
            if len(question) > 20:  # Only for substantial questions
                brain_answer = self.ask_brain_for_answer(question, inputs_map)
                if brain_answer:
                    return brain_answer

            return None  # Could not resolve internally

        except Exception as e:
            logger.warning(f"Error in internal resolution: {e}")
            return None

    def ask_brain_for_answer(self, question: str, inputs_map: Dict[str, Any]) -> Optional[str]:
        """
        Ask the Brain service to answer the question if it's something that can be resolved
        without user input (e.g., technical questions, best practices, etc.)
        """
        try:
            # Get auth token from inputs if available
            auth_token = None
            if '__brain_auth_token' in inputs_map:
                token_data = inputs_map['__brain_auth_token']
                if isinstance(token_data, dict) and 'value' in token_data:
                    auth_token = token_data['value']
                elif isinstance(token_data, str):
                    auth_token = token_data

            if not auth_token:
                return None

            # Prepare prompt for Brain
            prompt = f"""You are helping an AI agent resolve a question that would otherwise require user input.
Only answer if this is a technical question, best practice question, or something that has a reasonable default answer.
Do NOT answer if this requires user-specific preferences, personal information, or business decisions.

Question: {question}

If you can provide a reasonable answer, respond with just the answer (no explanation).
If this requires user input, respond with exactly: "REQUIRES_USER_INPUT"
"""

            headers = {'Authorization': f'Bearer {auth_token}', 'Content-Type': 'application/json'}

            response = requests.post(
                f"http://{self.brain_url}/chat",
                json={
                    "message": prompt,
                    "conversationType": "DIRECT_ANSWER",
                    "maxTokens": 100
                },
                headers=headers,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                answer = result.get('response', '').strip()

                if answer and answer != "REQUIRES_USER_INPUT" and len(answer) < 200:
                    logger.info(f"Brain resolved question internally: {question[:50]}... -> {answer[:50]}...")
                    return answer

            return None

        except Exception as e:
            logger.warning(f"Error asking Brain for answer: {e}")
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

            # First, try to resolve the question internally
            internal_answer = self.attempt_internal_resolution(question, inputs_map)
            if internal_answer:
                logger.info(f"Question resolved internally: {question[:50]}... -> {internal_answer[:50]}...")
                return [{
                    "success": True,
                    "name": "answer",
                    "resultType": PluginParameterType.STRING,
                    "result": internal_answer,
                    "resultDescription": f"Question resolved internally: {internal_answer}",
                    "mimeType": "text/plain"
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
        inputs_map = {}
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, val = item
                inputs_map[key] = val
            else:
                logger.warning(f"Skipping invalid input item: {item}")

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
