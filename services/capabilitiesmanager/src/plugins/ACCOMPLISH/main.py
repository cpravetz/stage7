#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Python Implementation
Accomplishes a given goal or creates a plan to achieve it
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
    PLAN = "plan"
    ERROR = "ERROR"

class AccomplishPlugin:
    def __init__(self):
        self.brain_url = os.getenv('BRAIN_URL', 'brain:5030')
        self.security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
    def get_auth_token(self) -> Optional[str]:
        """Get authentication token from SecurityManager"""
        try:
            response = requests.post(
                f"http://{self.security_manager_url}/generateToken",
                json={
                    "clientId": "ACCOMPLISH_Plugin",
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

    def query_brain(self, prompt: str) -> Optional[str]:
        """Query the Brain service with authentication"""
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
                f"http://{self.brain_url}/chat",
                json={
                    "exchanges": [{"role": "user", "content": prompt}],
                    "optimization": "accuracy"
                },
                headers=headers,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
            return data.get('result') or data.get('response', '')
        except Exception as e:
            logger.error(f"Failed to query Brain: {e}")
            return None

    def generate_prompt(self, goal: str) -> str:
        """Generate the prompt for the Brain service"""
        return f"""You are an AI assistant that helps accomplish goals by either providing direct answers or creating detailed plans.

Given the goal: "{goal}"

Analyze this goal and determine the best approach:

1. If the goal can be accomplished with a direct answer or simple response, respond with a JSON object in this format:
{{
    "type": "DIRECT_ANSWER",
    "answer": "Your direct answer or solution here"
}}

2. If the goal requires multiple steps or actions to accomplish, create a detailed plan and respond with a JSON object in this format:
{{
    "type": "PLAN",
    "plan": [
        {{
            "number": 1,
            "verb": "ACTION_VERB",
            "description": "Description of what this step does",
            "inputs": {{
                "inputName": "inputValue"
            }},
            "outputs": {{
                "outputName": "Expected output description"
            }},
            "dependencies": []
        }}
    ]
}}

Available action verbs for plans:
SEARCH - searches DuckDuckGo for a given term and returns a list of links
    (required input: searchTerm)
SCRAPE - scrapes content from a given URL
    (required inputs: url, selector, attribute, limit)
GET_USER_INPUT - requests input from the user
    (required inputs: question, answerType) (optional input: choices)
FILE_OPERATION - performs file operations like read, write, create, delete
    (required inputs: path, operation, content)
DECIDE - Conditional branching based on a condition
    (required inputs: condition, trueSteps[], falseSteps[])
WHILE - Repeat steps while a condition is true
    (required inputs: condition, steps[])
UNTIL - Repeat steps until a condition becomes true
    (required inputs: condition, steps[])

Important guidelines:
- Use specific, actionable verbs for each step
- Include all necessary inputs for each step
- Define clear outputs that subsequent steps can use
- Keep steps focused and atomic
- Include dependencies between steps when one step needs output from another
- Make sure the plan is executable and will achieve the stated goal

Goal to analyze: {goal}"""

    def convert_json_to_tasks(self, json_plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert JSON plan to task format"""
        try:
            if not json_plan or not isinstance(json_plan, list):
                logger.error("Cannot convert JSON to tasks. Invalid JSON plan format")
                return []

            # First pass: Create a map of output keys to step numbers
            output_to_step_map = {}
            for index, step in enumerate(json_plan):
                if step.get('outputs'):
                    for output_key in step['outputs'].keys():
                        output_to_step_map[output_key] = step.get('number', index + 1)

            tasks = []
            for index, step in enumerate(json_plan):
                inputs = {}
                plan_dependencies = []

                # Process inputs
                if step.get('inputs'):
                    for input_name, input_value in step['inputs'].items():
                        if isinstance(input_value, str) and input_value.startswith('${') and input_value.endswith('}'):
                            # This is a reference to another step's output
                            ref_key = input_value[2:-1]  # Remove ${ and }
                            if ref_key in output_to_step_map:
                                source_step = output_to_step_map[ref_key]
                                plan_dependencies.append({
                                    "stepNumber": source_step,
                                    "outputName": ref_key
                                })
                                inputs[input_name] = {
                                    "inputValue": input_value,
                                    "args": {},
                                    "dependencyOutputs": [{
                                        "stepNumber": source_step,
                                        "outputName": ref_key
                                    }]
                                }
                            else:
                                inputs[input_name] = {
                                    "inputValue": input_value,
                                    "args": {}
                                }
                        else:
                            inputs[input_name] = {
                                "inputValue": input_value,
                                "args": {}
                            }

                task = {
                    "verb": step.get('verb', 'UNKNOWN'),
                    "inputs": inputs,
                    "description": step.get('description', ''),
                    "expectedOutputs": step.get('outputs', {}),
                    "dependencies": plan_dependencies
                }
                tasks.append(task)

            return tasks
        except Exception as e:
            logger.error(f"Error converting JSON to tasks: {e}")
            return []

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ACCOMPLISH plugin"""
        try:
            # Extract goal from inputs
            goal = None
            for key, value in inputs_map.items():
                if key == 'goal':
                    if isinstance(value, dict) and 'inputValue' in value:
                        goal = value['inputValue']
                    else:
                        goal = value
                    break

            if not goal:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "result": None,
                    "error": "No goal provided to ACCOMPLISH plugin"
                }]

            # Generate prompt and query Brain
            prompt = self.generate_prompt(goal)
            response = self.query_brain(prompt)

            if not response:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Failed to get response from Brain service",
                    "result": None,
                    "error": "Brain service unavailable or returned empty response"
                }]

            # Parse Brain response
            try:
                parsed_response = json.loads(response)
                response_type = parsed_response.get('type', '').upper()

                if response_type == 'PLAN':
                    tasks = self.convert_json_to_tasks(parsed_response.get('plan', []))
                    return [{
                        "success": True,
                        "name": "plan",
                        "resultType": PluginParameterType.PLAN,
                        "resultDescription": f"A plan to: {goal}",
                        "result": tasks,
                        "mimeType": "application/json"
                    }]
                elif response_type == 'DIRECT_ANSWER':
                    return [{
                        "success": True,
                        "name": "answer",
                        "resultType": PluginParameterType.STRING,
                        "resultDescription": "Direct answer from Brain",
                        "result": parsed_response.get('answer', ''),
                        "mimeType": "text/plain"
                    }]
                else:
                    raise ValueError(f"Invalid response type from Brain: {response_type}")

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Brain response as JSON: {e}")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Invalid JSON response from Brain service",
                    "result": None,
                    "error": f"JSON parsing error: {str(e)}"
                }]

        except Exception as e:
            logger.error(f"ACCOMPLISH plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error in ACCOMPLISH plugin execution",
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
        plugin = AccomplishPlugin()
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
