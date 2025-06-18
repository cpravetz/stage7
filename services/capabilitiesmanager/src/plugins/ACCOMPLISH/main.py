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
    VERB_SCHEMAS = {
        'SEARCH': {'required': ['searchTerm'], 'optional': []},
        'SCRAPE': {'required': ['url', 'selector', 'attribute', 'limit'], 'optional': []},
        'GET_USER_INPUT': {'required': ['question', 'answerType'], 'optional': ['choices']},
        'FILE_OPERATION': {'required': ['path', 'operation'], 'optional': ['content']},
        'DECIDE': {'required': ['condition', 'trueSteps', 'falseSteps'], 'optional': []},
        'WHILE': {'required': ['condition', 'steps'], 'optional': []},
        'UNTIL': {'required': ['condition', 'steps'], 'optional': []}
    }

    def __init__(self):
        self.brain_url = os.getenv('BRAIN_URL', 'brain:5070')
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

    def query_brain(self, prompt: str, brain_token: Optional[str] = None) -> Optional[str]:
        """Query the Brain service with authentication"""
        try:
            # Use provided brain token or fall back to getting our own
            token_to_use = brain_token or self.token
            if not token_to_use:
                self.token = self.get_auth_token()
                token_to_use = self.token
                if not token_to_use:
                    raise Exception("Failed to obtain authentication token")

            headers = {
                'Authorization': f'Bearer {token_to_use}',
                'Content-Type': 'application/json'
            }

            logger.info(f"Querying Brain at {self.brain_url}/chat with token: {token_to_use[:20]}...")

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

Available action verbs for plans and THEIR REQUIRED INPUTS:
SEARCH:
    description: Searches DuckDuckGo for a given term.
    inputs: {{"searchTerm": "value_for_search_term_goes_here"}} REQUIRED!
SCRAPE:
    description: Scrapes content from a given URL.
    inputs: {{"url": "url_goes_here", "selector": "css_selector", "attribute": "e.g., text, href", "limit": 0}} REQUIRED!
GET_USER_INPUT:
    description: Requests input from the user.
    inputs: {{"question": "question_for_user", "answerType": "string|number|boolean"}} REQUIRED!
    optional_inputs: {{"choices": ["option1", "option2"]}}
FILE_OPERATION:
    description: Performs file operations.
    inputs: {{"path": "/path/to/file", "operation": "read|write|create|delete"}} REQUIRED! (content is required for 'write' operation, provide as {{"content": "content_value"}})
DECIDE:
    description: Conditional branching.
    inputs: {{"condition": "expression_evaluating_to_true_or_false", "trueSteps": [], "falseSteps": []}} REQUIRED!
WHILE:
    description: Repeat steps while a condition is true.
    inputs: {{"condition": "expression_evaluating_to_true_or_false", "steps": []}} REQUIRED!
UNTIL:
    description: Repeat steps until a condition becomes true.
    inputs: {{"condition": "expression_evaluating_to_true_or_false", "steps": []}} REQUIRED!

CRITICALLY IMPORTANT: For each step in the plan, you MUST include all REQUIRED inputs for the specified 'verb'.
The 'inputs' field for each step MUST be a JSON object containing all required parameters for that verb.
Failure to include all required inputs for a verb will make the plan unusable.
Ensure all JSON string values are properly escaped.

Goal to analyze: {goal}"""

    def validate_plan_data(self, plan_data: List[Dict[str, Any]]) -> Optional[str]:
        """
        Validates the plan data from the LLM.
        Returns an error message string if validation fails, None otherwise.
        """
        if not isinstance(plan_data, list):
            logger.error("Invalid plan data: not a list.")
            return "Plan data is not a list."

        for i, step in enumerate(plan_data):
            if not isinstance(step, dict):
                logger.error(f"Invalid step at index {i}: not a dictionary. Step: {step}")
                return f"Step at index {i} is not a dictionary."

            verb = step.get('verb')
            if not verb or not isinstance(verb, str):
                logger.error(f"Invalid or missing verb for step at index {i}. Step: {step}")
                return f"Invalid or missing verb for step at index {i}."

            if verb not in self.VERB_SCHEMAS:
                logger.warning(f"Verb '{verb}' at step {i+1} is not in VERB_SCHEMAS. Skipping detailed input validation for this verb.")
                continue

            inputs_dict = step.get('inputs')
            if not isinstance(inputs_dict, dict):
                logger.error(f"Invalid 'inputs' field for verb '{verb}' at step {i+1}: not a dictionary. Inputs: {inputs_dict}")
                return f"Step {i+1} ('{verb}') has invalid 'inputs' field (must be a dictionary)."

            schema = self.VERB_SCHEMAS[verb]
            for required_input_name in schema.get('required', []):
                if required_input_name not in inputs_dict:
                    msg = f"Plan generation failed: LLM output for verb '{verb}' (step {i+1}) missing required input '{required_input_name}'."
                    logger.error(msg)
                    return msg

                input_value = inputs_dict.get(required_input_name)
                # Allow False or 0 as valid inputs
                if input_value is None or (isinstance(input_value, str) and not input_value.strip()):
                     msg = f"Plan generation failed: LLM output for verb '{verb}' (step {i+1}) has empty or null required input '{required_input_name}'."
                     logger.error(msg)
                     return msg
        return None # All good

    def convert_json_to_tasks(self, json_plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert JSON plan to task format. Assumes basic validation has passed."""
        try:
            # First pass: Create a map of output keys to step numbers
            output_to_step_map = {}
            for index, step in enumerate(json_plan): # json_plan is already validated to be a list of dicts
                if isinstance(step.get('outputs'), dict):
                    for output_key in step['outputs'].keys():
                        output_to_step_map[output_key] = step.get('number', index + 1)

            tasks = []
            for index, step in enumerate(json_plan): # step is a dict
                inputs_from_llm = step.get('inputs', {}) # Default to empty dict if 'inputs' is missing
                if not isinstance(inputs_from_llm, dict): # Should have been caught by validation if verb was known
                    logger.warning(f"Step {index+1} ('{step.get('verb')}') 'inputs' is not a dictionary. Treating as empty inputs. Inputs: {inputs_from_llm}")
                    inputs_from_llm = {}

                processed_inputs = {}
                plan_dependencies = []

                for input_name, input_value in inputs_from_llm.items():
                    if isinstance(input_value, str) and input_value.startswith('${') and input_value.endswith('}'):
                        ref_key = input_value[2:-1]
                        if ref_key in output_to_step_map:
                            source_step_number = output_to_step_map[ref_key]
                            plan_dependencies.append({
                                "stepNumber": source_step_number,
                                "outputName": ref_key
                            })
                            processed_inputs[input_name] = {
                                "inputValue": input_value, # This is the reference string itself
                                "args": {}, # args might be populated later by CM if needed
                                "dependencyOutputs": [{ # Explicitly state dependency
                                    "stepNumber": source_step_number,
                                    "outputName": ref_key
                                }]
                            }
                        else:
                            # Reference to an unknown output, pass as is
                            processed_inputs[input_name] = {"inputValue": input_value, "args": {}}
                    else:
                        # Literal value
                        processed_inputs[input_name] = {"inputValue": input_value, "args": {}}

                task = {
                    "verb": step.get('verb', 'UNKNOWN'), # Already validated to exist
                    "inputs": processed_inputs,
                    "description": step.get('description', ''),
                    "expectedOutputs": step.get('outputs', {}), # Allow empty or missing outputs
                    "dependencies": plan_dependencies
                }
                tasks.append(task)
            return tasks
        except Exception as e:
            logger.error(f"Error converting JSON to tasks: {e}")
            # It's crucial to return an error structure if conversion fails unexpectedly
            # However, the main validation for plan structure is now done before this.
            # This catch is for truly unexpected errors during the conversion itself.
            return [{
                "success": False,
                "name": "task_conversion_error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Internal error converting plan to tasks: {str(e)}",
                "result": None,
                "error": str(e)
            }]

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ACCOMPLISH plugin"""
        try:
            logger.info(f"Execute method called with inputs_map: {inputs_map}")

            # Extract goal and brain token from inputs
            goal = None
            brain_token = None

            for key, value in inputs_map.items():
                logger.info(f"Processing input key: {key}, value: {value}, type: {type(value)}")
                if key == 'goal':
                    if isinstance(value, dict) and 'inputValue' in value:
                        goal = value['inputValue']
                        logger.info(f"Found goal in inputValue: {goal}")
                    else:
                        goal = value
                        logger.info(f"Found goal as direct value: {goal}")
                elif key in ['__brain_auth_token', 'token']:
                    if isinstance(value, dict) and 'inputValue' in value:
                        brain_token = value['inputValue']
                        logger.info(f"Found brain token from key {key}: {brain_token[:20]}...")
                    elif isinstance(value, str):
                        brain_token = value
                        logger.info(f"Found brain token as direct value from key {key}: {brain_token[:20]}...")

            logger.info(f"Final goal value: {goal}")
            logger.info(f"Brain token available: {bool(brain_token)}")

            if not goal:
                logger.error("No goal found in inputs")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "result": None,
                    "error": "No goal provided to ACCOMPLISH plugin"
                }]

            # Generate prompt and query Brain
            prompt = self.generate_prompt(goal)
            response = self.query_brain(prompt, brain_token)

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
                    plan_data = parsed_response.get('plan', [])
                    validation_error_message = self.validate_plan_data(plan_data)
                    if validation_error_message:
                        return [{
                            "success": False,
                            "name": "plan_validation_error",
                            "resultType": PluginParameterType.ERROR,
                            "resultDescription": validation_error_message,
                            "result": None,
                            "error": validation_error_message
                        }]

                    tasks = self.convert_json_to_tasks(plan_data)
                    # If convert_json_to_tasks itself returns an error structure (e.g. due to its own try-except)
                    if tasks and isinstance(tasks, list) and len(tasks) == 1 and tasks[0].get("resultType") == PluginParameterType.ERROR:
                        return tasks

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

        # Debug: Log the raw input string
        logger.info(f"Raw input string: {inputs_str}")

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)
        logger.info(f"Parsed inputs list: {inputs_list}")

        inputs_map = {item[0]: item[1] for item in inputs_list}
        logger.info(f"Inputs map: {inputs_map}")

        # Debug: Check if goal is in the inputs
        if 'goal' in inputs_map:
            goal_value = inputs_map['goal']
            logger.info(f"Goal found in inputs: {goal_value}")
            if isinstance(goal_value, dict) and 'inputValue' in goal_value:
                logger.info(f"Goal inputValue: {goal_value['inputValue']}")
        else:
            logger.warning("Goal not found in inputs map")
            logger.info(f"Available keys: {list(inputs_map.keys())}")

        # Execute plugin
        plugin = AccomplishPlugin()
        results = plugin.execute(inputs_map)

        # Output results to stdout
        print(json.dumps(results))

    except Exception as e:
        logger.error(f"Main function error: {e}")
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
