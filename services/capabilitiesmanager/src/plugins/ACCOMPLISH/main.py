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
import io

# Custom log handler to capture logs in memory
class InMemoryLogHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.log_buffer = io.StringIO()

    def emit(self, record):
        msg = self.format(record)
        self.log_buffer.write(msg + '\n')

    def get_logs(self):
        return self.log_buffer.getvalue()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add in-memory log handler to capture logs
memory_handler = InMemoryLogHandler()
memory_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(memory_handler)

# Add a property to logger to get logs
def get_logger_logs():
    return memory_handler.get_logs()

logger.logs = property(get_logger_logs)

class PluginParameterType:
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    PLAN = "plan"
    DIRECT_ANSWER = "DIRECT_ANSWER"
    PLUGIN = "plugin"
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
                    "optimization": "accuracy",
                    "ConversationType": "text/code" # Explicitly request JSON/code output
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

    def generate_prompt(self, goal: str, available_plugins_str: str, mission_context_str: str) -> str:
        """Generate the prompt for the Brain service"""
        prompt = f"""
You are a planning assistant. Your ONLY task is to generate one of the following JSON outputs to achieve the following goal: '{goal}'.

You MUST respond with ONLY a JSON object in ONLY ONE of these three formats. DO NOT include any explanations, markdown formatting, or additional text outside the JSON object.

1. If you have a full and complete answer to the goal, respond with a JSON object in this format:

{{
    "type": "DIRECT_ANSWER",
    "answer": "Your direct answer here"
}}

2. When the goal is discrete and can be accomplished most efficiently with a new plugin, define one. Creating a plugin should be avoided when the goal can be accomplished with a plan. If you determine a plugin is needed, respond with a JSON object in this format:

{{
    "type": "PLUGIN",
    "plugin": {{
        "id": "plugin-{{verb}}",
        "verb": "{{verb}}",
        "description": "A short description of the plugin",
        "explanation": "A more complete description including inputs, process overview, and outputs than a software engineer can use to build the plugin",
        "inputDefinitions": [
            {{
                "name": "{{input name}}",
                "required": true/false,
                "type": "string",
                "description": "Brief explanation of the input"
            }},
            // ... more inputs ...
        ]
    }}
}}


3. If the goal can be sub-divided into smaller steps, respond with a plan as a JSON object in this format:

{{
    "type": "PLAN",
    "context": "Any overarching points or introduction to the plan you want to share",
    "plan": [
        {{
            "number": 1,
            "verb": "DESCRIPTIVE_ACTION_VERB",
            "description": "Brief description of the step",
            "inputs": {{
                "inputName1": {{"value": "predeterminedValue"}},
                "inputName2": {{"outputKey": "outputKeyFromPreviousStep"}}
            }},
            "dependencies": {{}},
            "outputs": {{
                "outputKey1": "Description of output1",
                "outputKey2": "Description of output2"
            }},
            "recommendedRole": "coordinator"
        }},
        {{
            "number": 2,
            "verb": "ANOTHER_ACTION",
            "description": "Description of another step",
            "inputs": {{
                "inputName3": {{"outputKey": "outputKey2"}}
            }},
            "dependencies": {{"outputKey2": 1}},
            "outputs": {{
                "outputKey3": "Description of output3"
            }},
            "recommendedRole": "researcher"
        }}
    ]
}}

Guidelines for creating a plan:
1. Number each step sequentially.
2. Use specific, actionable verbs or phrases for each step (e.g. ANALYZE_CSV, ANALYZE_AUDIOFILE, PREDICT, WRITE_TEXT, WRITE_CODE, BOOK_A_CAR).
3. The schema of the step must be as defined above - every field is mandatory but inputs field may be empty.
4. Each step input should be an object with either a 'value' property for predetermined values or an 'outputKey' property referencing an output from a previous step.
5. List dependencies for each step as an object with the property names being the outputs needed and the values being the step number that provides the required input like: {"outputname": 1}
There MUST be a dependency entry for every input that comes from a previous step output.
6. Specify the outputs of each step. At least one output is mandatory.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields. This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or mission of the goal.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. Input values may be determined by preceding steps. In those instances set the value to 'undefined'.
12. For each step, include a "recommendedRole" field with one of the available agent roles that would be best suited for the task.

Available Agent Roles:
- coordinator: Coordinates activities of other agents, manages task allocation, and ensures mission success. Good for planning, delegation, and monitoring.
- researcher: Gathers, analyzes, and synthesizes information from various sources. Good for information gathering and data analysis.
- creative: Generates creative ideas, content, and solutions to problems. Good for idea generation and content creation.
- critic: Evaluates ideas, plans, and content, providing constructive feedback. Good for quality assessment and risk identification.
- executor: Implements plans and executes tasks with precision and reliability. Good for task execution and process following.
- domain_expert: Provides specialized knowledge and expertise in a specific domain. Good for technical analysis and expert advice.

IMPORTANT: Your response MUST be a valid JSON object with no additional text or formatting. The JSON must start with {{ and end with }} and must include one of the three types: "DIRECT_ANSWER", "PLAN", or "PLUGIN".

Plugins are available to execute steps of the plan. Some have required inputs - required properties for the inputs object. These plugins include:
{available_plugins_str}

Mission Context: {mission_context_str}
Goal to achieve: {goal}
"""
        return prompt.strip()

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

    def validate_and_assign_dependencies(self, plan_data: List[Dict[str, Any]], initial_inputs: List[str]) -> Optional[str]:
        """
        Ensures all steps have well-defined dependencies. The first step's inputs must match initial_inputs.
        All other steps' inputs must be satisfied by initial_inputs, previous step outputs, or GET_USER_INPUT steps.
        Returns error string if validation fails, None otherwise. Modifies plan_data in-place to assign dependencies.
        """
        output_keys = {}  # output_name -> step_number
        step_numbers = {}
        for idx, step in enumerate(plan_data):
            step_number = step.get('number', idx + 1)
            step_numbers[step_number] = step
            step.setdefault('dependencies', [])
            # Register outputs for future steps
            for output_name in step.get('outputs', {}):
                output_keys[output_name] = step_number

        for idx, step in enumerate(plan_data):
            step_number = step.get('number', idx + 1)
            dependencies = set()
            inputs_dict = step.get('inputs', {})
            if not isinstance(inputs_dict, dict):
                return f"Step {idx+1} has invalid 'inputs' field (must be a dictionary)."
            for input_name, input_value in inputs_dict.items():
                if isinstance(input_value, str) and input_value.startswith('${') and input_value.endswith('}'):
                    ref_key = input_value[2:-1]
                    if ref_key in output_keys:
                        dependencies.add(output_keys[ref_key])
                    elif ref_key in initial_inputs:
                        continue  # Satisfied by initial inputs
                    else:
                        return f"Step {idx+1} input '{input_name}' references unknown source '{ref_key}'. Plan is invalid."
                elif idx == 0:
                    # First step: input must be in initial_inputs
                    if input_name not in initial_inputs:
                        return f"First step input '{input_name}' not in initial inputs. Plan is invalid."
                else:
                    # For other steps, input must be in initial_inputs or produced by previous steps
                    if input_name not in initial_inputs and input_name not in output_keys:
                        return f"Step {idx+1} input '{input_name}' not satisfied by initial inputs or previous outputs. Plan is invalid."
            # Assign dependencies
            step['dependencies'] = list(dependencies)
        return None

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
                "result": {"logs": logger.logs},
                "error": str(e)
            }]

    def normalize_plan_dependencies(self, plan_data: List[Dict[str, Any]]):
        """
        Normalize dependencies in the plan so that any 'step_X' string references are converted to step numbers.
        Modifies plan_data in-place.
        """
        # Build a mapping from 'step_1', 'step_2', ... to step number
        label_to_number = {}
        for idx, step in enumerate(plan_data):
            step_number = step.get('number', idx + 1)
            label_to_number[f'step_{step_number}'] = step_number
        # Normalize dependencies in each step
        for step in plan_data:
            deps = step.get('dependencies', [])
            new_deps = []
            for dep in deps:
                if isinstance(dep, str) and dep.startswith('step_') and dep in label_to_number:
                    # Replace 'step_X' with the corresponding step number
                    new_deps.append(label_to_number[dep])
                else:
                    new_deps.append(dep)
            step['dependencies'] = new_deps

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ACCOMPLISH plugin"""
        try:
            logger.info(f"Execute method called with inputs_map: {inputs_map}")

            # Extract goal, brain token, available_plugins, and mission_context from inputs
            goal = None
            brain_token = None
            available_plugins_str = "No specific plugins listed as available." # Default
            mission_context_str = "No overall mission context provided." # Default
            conversation_history = [] # Default

            for key, value_obj in inputs_map.items():
                logger.info(f"Processing input key: {key}, value_obj: {value_obj}")
                input_value = value_obj.get('inputValue') if isinstance(value_obj, dict) else value_obj

                if key == 'goal':
                    goal = str(input_value) if input_value is not None else None
                    logger.info(f"Found goal: {goal}")
                elif key == 'available_plugins': # Expecting a string, potentially pre-formatted
                    if isinstance(input_value, list): # If agent sends a list of plugin names
                        available_plugins_str = "\n".join([f"- {p}" for p in input_value]) if input_value else "No plugins listed."
                    elif isinstance(input_value, str) and input_value.strip():
                        available_plugins_str = input_value
                    logger.info(f"Found available_plugins: {available_plugins_str}")
                elif key == 'mission_context':
                    if isinstance(input_value, str) and input_value.strip():
                        mission_context_str = input_value
                    logger.info(f"Found mission_context: {mission_context_str}")
                elif key == 'conversation_history':
                    if isinstance(input_value, list):
                        conversation_history = input_value
                    logger.info(f"Found conversation_history (length): {len(conversation_history)}")
                elif key in ['__brain_auth_token', 'token']: # Keep existing token logic
                    brain_token = str(input_value) if input_value is not None else None
                    logger.info(f"Found brain token from key {key}: {brain_token[:20] if brain_token else 'None'}...")

            logger.info(f"Final goal: {goal}")
            logger.info(f"Final available_plugins_str: {available_plugins_str}")
            logger.info(f"Final mission_context_str: {mission_context_str}")
            logger.info(f"Final conversation_history length: {len(conversation_history)}")
            logger.info(f"Brain token available: {bool(brain_token)}")

            if not goal:
                logger.error("No goal provided to ACCOMPLISH plugin")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "result": {"logs": logger.logs},
                    "error": "No goal provided to ACCOMPLISH plugin"
                }]

            # Generate prompt and query Brain
            prompt = self.generate_prompt(goal, available_plugins_str, mission_context_str)
            logger.info(f"Generated prompt for Brain: {prompt[:500]}...") # Log start of prompt
            response = self.query_brain(prompt, brain_token)

            if not response:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Failed to get response from Brain service",
                    "result": {"logs": logger.logs},
                    "error": "Brain service unavailable or returned empty response"
                }]

            # Parse Brain response
            try:
                parsed = json.loads(response)
                # Handle PLAN (array), DIRECT_ANSWER, or PLUGIN
                if isinstance(parsed, list):
                    plan_data = parsed
                    # --- Normalize dependencies (handles step_X) before validation and conversion ---
                    self.normalize_plan_dependencies(plan_data)
                    validation_error_message = self.validate_plan_data(plan_data)
                    if validation_error_message:
                        return [{
                            "success": False,
                            "name": "plan_validation_error",
                            "resultType": PluginParameterType.ERROR,
                            "resultDescription": validation_error_message,
                            "result": {"logs": logger.logs},
                            "error": validation_error_message
                        }]
                    initial_inputs_names = list(inputs_map.keys())
                    dep_error = self.validate_and_assign_dependencies(plan_data, initial_inputs_names)
                    if dep_error:
                        return [{
                            "success": False,
                            "name": "plan_dependency_error",
                            "resultType": PluginParameterType.ERROR,
                            "resultDescription": dep_error,
                            "result": {"logs": logger.logs},
                            "error": dep_error
                        }]
                    tasks = self.convert_json_to_tasks(plan_data)
                    if tasks and isinstance(tasks, list) and len(tasks) == 1 and tasks[0].get("resultType") == PluginParameterType.ERROR:
                        return tasks
                    logger.info(f"Successfully processed plan for goal: {goal}")
                    return [{
                        "success": True,
                        "name": "plan",
                        "resultType": PluginParameterType.PLAN,
                        "resultDescription": f"A plan to: {goal}",
                        "result": tasks,
                        "mimeType": "application/json",
                        "logs": logger.logs
                    
                    }]
                elif isinstance(parsed, dict):
                    if parsed.get("type") == "DIRECT_ANSWER":
                        logger.info(f"Received DIRECT_ANSWER: {parsed}")
                        return [{
                            "success": True,
                            "name": "direct_answer",
                            "resultType": "DIRECT_ANSWER",
                            "resultDescription": f"Direct answer for: {goal}",
                            "result": parsed.get("answer"),
                            "explanation": parsed.get("explanation", "")
                        }]
                    elif parsed.get("type") == "PLUGIN":
                        logger.info(f"Received PLUGIN: {parsed}")
                        return [{
                            "success": True,
                            "name": "plugin",
                            "resultType": "PLUGIN",
                            "resultDescription": f"Plugin recommendation for: {goal}",
                            "result": {
                                "recommendedPlugin": parsed.get("recommendedPlugin"),
                                "reason": parsed.get("reason", "")
                            }
                        }]
                    else:
                        logger.error(f"Unknown object type in Brain response: {parsed}")
                        return [{
                            "success": False,
                            "name": "brain_response_format_error",
                            "resultType": PluginParameterType.ERROR,
                            "resultDescription": "Brain returned an unknown object type.",
                            "result": {"logs": logger.logs},
                            "error": f"Unknown object type: {parsed}"
                        }]
                else:
                    logger.error(f"Brain response is not a JSON array or recognized object. Response: {response[:500]}")
                    return [{
                        "success": False,
                        "name": "brain_response_format_error",
                        "resultType": PluginParameterType.ERROR,
                        "resultDescription": "Brain did not return a JSON array or recognized object.",
                        "result": {"logs": logger.logs},
                        "error": "Brain response was not a list or recognized object."
                    }]
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Brain response as JSON: {e}. Response: {response[:500]}")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Invalid JSON response from Brain service",
                    "result": {"logs": logger.logs},
                    "error": f"JSON parsing error: {str(e)}"
                }]
        except Exception as e:
            logger.error(f"ACCOMPLISH plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error in ACCOMPLISH plugin execution",
                "result": {"logs": logger.logs},
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
