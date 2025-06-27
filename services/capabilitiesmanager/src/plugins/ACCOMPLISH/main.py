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
    # Define required/optional inputs for specific verbs if known.
    # This helps validate the LLM's output against known plugin requirements.
    VERB_SCHEMAS = {
        'SEARCH': {'required': ['searchTerm'], 'optional': []},
        'SCRAPE': {'required': ['url', 'selector', 'attribute', 'limit'], 'optional': []},
        'GET_USER_INPUT': {'required': ['question', 'answerType'], 'optional': ['choices']},
        'FILE_OPERATION': {'required': ['path', 'operation'], 'optional': ['content']},
        'DECIDE': {'required': ['condition', 'trueSteps', 'falseSteps'], 'optional': []},
        'WHILE': {'required': ['condition', 'steps'], 'optional': []},
        'UNTIL': {'required': ['condition', 'steps'], 'optional': []},
        'DELEGATE': {'required': ['subAgentGoal'], 'optional': ['subAgentRole', 'subAgentTasks']} # Added for DELEGATE example
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
            logger.info(f"Raw brain response: {response}")
            data = response.json()
            return data.get('result') or data.get('response', '')
        except Exception as e:
            logger.error(f"Failed to query Brain: {e}")
            return None

    def generate_prompt(self, goal: str, available_plugins_str: str, mission_context_str: str) -> str:
        """Generate the prompt for the Brain service"""
        prompt = f"""
You are a planning assistant. Your ONLY task is to generate one of the following outputs in JSON format to achieve the following goal: '{goal}'.

DO NOT include any explanations, markdown formatting, or additional text outside the JSON object.

1. If the goal can be sub-divided into smaller steps, respond with a plan as a JSON object in this format:

{{
    "type": "PLAN",
    "context": "Any overarching points or introduction to the plan you want to share",
    "plan": [
        {{
            "number": 1,
            "actionVerb": "DESCRIPTIVE_ACTION_VERB",
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
            "actionVerb": "ANOTHER_ACTION",
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
1. Number each step sequentially using the "number" field.
2. Use specific, actionable verbs or phrases for each step using the "actionVerb" field (e.g., ANALYZE_CSV, ANALYZE_AUDIOFILE, PREDICT, WRITE_TEXT, WRITE_CODE, BOOK_A_CAR).
3. The schema of each step MUST be exactly as defined above. Every field is mandatory, but the "inputs" field may be an empty object ({{}}).
4. Each step input in the "inputs" object MUST be an object with EITHER a 'value' property for predetermined values OR an 'outputKey' property referencing an output from a previous step. DO NOT include "inputName", "inputValue", or "args" within the input definition objects inside the "inputs" field.
5. List dependencies for each step as an object in the "dependencies" field, where property names are the output keys needed and values are the step numbers that provide the required output (e.g., {{"outputname": 1}}). There MUST be a dependency entry for every input that comes from a previous step output.
6. Specify the outputs of each step in the "outputs" field. At least one output is mandatory.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your "description" fields. This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or mission of the goal.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. Input values may be determined by preceding steps. In those instances, use the 'outputKey' reference. For inputs whose values are not yet determined but will be provided at runtime (e.g., from user input), set the 'value' to `null`.
12. For each step, include a "recommendedRole" field with one of the available agent roles that would be best suited for the task.
13. Every step must have at least one output.

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

3. If you have the ability to provide a full and complete response that resolves the goal, respond with a JSON object in this format:

{{
    "type": "DIRECT_ANSWER",
    "answer": "Your direct answer here"
}}

For example, if the goal is "add two and three", you can respond with {{"type": "DIRECT_ANSWER", "answer": 5}}, or if the goal is "Write a memo", you can write the memo and return it as the answer value.

Plans, direct_answers and plugins are mutually exclusive. Do not return plans or plugins as direct_answers. You can only respond with one of the three types.

Mission Context: {mission_context_str}
"""
        return prompt.strip()

    def validate_plan_data(self, plan_data: List[Dict[str, Any]]) -> Optional[str]:
        """
        Validates the plan data from the LLM against the expected schema.
        Returns an error message string if validation fails, None otherwise.
        """
        if not isinstance(plan_data, list):
            logger.error("Invalid plan data: not a list.")
            return "Plan data is not a list."

        for i, step in enumerate(plan_data):
            if not isinstance(step, dict):
                logger.error(f"Invalid step at index {i}: not a dictionary. Step: {step}")
                return f"Step at index {i} is not a dictionary."

            # If 'actionVerb' is missing but 'verb' is present, copy it
            if 'actionVerb' not in step and 'verb' in step and isinstance(step['verb'], str) and step['verb'].strip():
                step['actionVerb'] = step['verb']

            # Validate mandatory fields and their types
            if 'actionVerb' not in step or not isinstance(step['actionVerb'], str) or not step['actionVerb'].strip():
                logger.error(f"Invalid or missing 'actionVerb' for step at index {i}. Step: {step}")
                return f"Invalid or missing 'actionVerb' (string) for step at index {i}."
            
            if 'number' not in step or not isinstance(step['number'], int) or step['number'] <= 0:
                logger.error(f"Invalid or missing 'number' for step at index {i}. Step: {step}")
                return f"Invalid or missing 'number' (positive integer) for step at index {i}."

            if 'description' not in step or not isinstance(step['description'], str) or not step['description'].strip():
                logger.error(f"Invalid or missing 'description' for step at index {i}. Step: {step}")
                return f"Invalid or missing 'description' (string) for step at index {i}."

            if 'recommendedRole' not in step or not isinstance(step['recommendedRole'], str) or not step['recommendedRole'].strip():
                logger.error(f"Invalid or missing 'recommendedRole' for step at index {i}. Step: {step}")
                return f"Invalid or missing 'recommendedRole' (string) for step at index {i}."

            # Validate 'inputs'
            inputs_dict = step.get('inputs')
            if not isinstance(inputs_dict, dict):
                return f"Step {i+1} has invalid 'inputs' field. Must be a dictionary."
            
            actionVerb = step['actionVerb'] # Use the validated verb
            for input_name, input_value_obj in inputs_dict.items():
                if not isinstance(input_value_obj, dict):
                    return f"Step {i+1} input '{input_name}' is not an object. Expected {{'value': '...'}} or {{'outputKey': '...'}}."
                
                has_value = 'value' in input_value_obj
                has_output_key = 'outputKey' in input_value_obj
                
                if not (has_value ^ has_output_key): # Exactly one of 'value' or 'outputKey' must be present
                    return f"Step {i+1} input '{input_name}' must contain exactly one of 'value' or 'outputKey'."
                
                # Ensure no other keys are present
                allowed_keys = {'value'} if has_value else {'outputKey'}
                if not set(input_value_obj.keys()).issubset(allowed_keys):
                    return f"Step {i+1} input '{input_name}' contains unexpected keys. Only '{'value' if has_value else 'outputKey'}' is allowed."

            # Validate required inputs based on VERB_SCHEMAS
            if actionVerb in self.VERB_SCHEMAS:
                schema = self.VERB_SCHEMAS[actionVerb]
                for required_input_name in schema.get('required', []):
                    if required_input_name not in inputs_dict:
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) missing required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
                    # Further check if the required input's value/outputKey is truly present/non-empty
                    input_val_obj = inputs_dict[required_input_name]
                    if 'value' in input_val_obj and (input_val_obj['value'] is None or (isinstance(input_val_obj['value'], str) and not input_val_obj['value'].strip())):
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) has empty or null 'value' for required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
                    if 'outputKey' in input_val_obj and (input_val_obj['outputKey'] is None or (isinstance(input_val_obj['outputKey'], str) and not input_val_obj['outputKey'].strip())):
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) has empty or null 'outputKey' for required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
        
            # Validate 'dependencies'
            dependencies = step.get('dependencies')
            if not isinstance(dependencies, dict):
                return f"Step {i+1} has invalid 'dependencies' field. Must be a dictionary."
            
            for dep_output_key, dep_step_number in dependencies.items():
                if not isinstance(dep_output_key, str) or not dep_output_key.strip():
                    return f"Step {i+1} has invalid dependency key '{dep_output_key}'. Must be a non-empty string."
                if not isinstance(dep_step_number, int) or dep_step_number <= 0:
                    return f"Step {i+1} has invalid dependency step number for output '{dep_output_key}'. Must be a positive integer."

            # Validate 'outputs'
            outputs = step.get('outputs')
            if not isinstance(outputs, dict) or not outputs: # Must be a non-empty dictionary
                return f"Step {i+1} has invalid or empty 'outputs' field. Must be a non-empty dictionary."
            for output_key, output_desc in outputs.items():
                if not isinstance(output_key, str) or not output_key.strip():
                    return f"Step {i+1} has invalid output key '{output_key}'. Must be a non-empty string."
                if not isinstance(output_desc, str) or not output_desc.strip():
                    return f"Step {i+1} has invalid output description for '{output_key}'. Must be a non-empty string."

        return None # All good

    def convert_json_to_tasks(self, json_plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert JSON plan to task format. Assumes detailed validation has passed."""
        try:
            # First pass: Create a map of output keys to step numbers
            output_to_step_map = {}
            for index, step in enumerate(json_plan):
                # Ensure 'number' exists and is an integer due to validation, default to index+1 for robustness
                step_number = step.get('number', index + 1) 
                if isinstance(step.get('outputs'), dict):
                    for output_key in step['outputs'].keys():
                        output_to_step_map[output_key] = step_number

            tasks = []
            for index, step in enumerate(json_plan):
                inputs_from_llm = step.get('inputs', {})
                processed_inputs = {}
                plan_dependencies = []

                for input_name, input_def_obj in inputs_from_llm.items():
                    if 'value' in input_def_obj:
                        # Direct value provided
                        processed_inputs[input_name] = {"inputValue": input_def_obj['value'], "args": {}}
                    elif 'outputKey' in input_def_obj:
                        # Reference to an output from a previous step
                        ref_key = input_def_obj['outputKey']
                        source_step_number = output_to_step_map.get(ref_key)

                        if source_step_number is not None:
                            # Add to plan_dependencies for the current task
                            plan_dependencies.append({
                                "stepNumber": source_step_number,
                                "outputName": ref_key
                            })
                            # Format inputValue as ${outputKey} for internal use
                            processed_inputs[input_name] = {
                                "inputValue": f"${{{ref_key}}}",
                                "args": {},
                                "dependencyOutputs": [{
                                    "stepNumber": source_step_number,
                                    "outputName": ref_key
                                }]
                            }
                        else:
                            logger.warning(f"Step {index+1} input '{input_name}' references unknown outputKey '{ref_key}'. Treating as null value.")
                            processed_inputs[input_name] = {"inputValue": None, "args": {}}
                    else:
                        # Should not happen if validate_plan_data passed, but for safety
                        logger.warning(f"Step {index+1} input '{input_name}' has an unexpected input definition format. Treating as null value.")
                        processed_inputs[input_name] = {"inputValue": None, "args": {}}

                # Process dependencies from the LLM (which should be an object: {"outputKey": stepNumber})
                llm_dependencies = step.get('dependencies', {})
                for output_key_depended_on, dep_step_number in llm_dependencies.items():
                    # Ensure this dependency isn't already covered by an input's dependencyOutput
                    # This avoids redundant entries if an input also implies a dependency
                    # The `plan_dependencies` list built above is for *inputs* that reference outputs.
                    # The 'dependencies' field in the LLM response is for general step dependencies.
                    # We merge these or ensure consistency. For simplicity, we'll just add
                    # general step dependencies here.
                    # A more robust solution might reconcile and deduplicate these.
                    # For now, append any direct step dependencies specified by the LLM that aren't tied to an input.
                    # The prompt specified dependency as {"outputname": 1}, which ties it to an output.
                    # So, these should largely overlap with `dependencyOutputs` on inputs.
                    # If not explicitly tied to an input, add as a general step dependency.
                    is_covered_by_input_dep = False
                    for existing_input_dep in processed_inputs.values():
                        if isinstance(existing_input_dep, dict) and existing_input_dep.get('dependencyOutputs'):
                            for dep_out in existing_input_dep['dependencyOutputs']:
                                if dep_out['stepNumber'] == dep_step_number and dep_out['outputName'] == output_key_depended_on:
                                    is_covered_by_input_dep = True
                                    break
                        if is_covered_by_input_dep:
                            break
                    
                    if not is_covered_by_input_dep:
                         plan_dependencies.append({
                            "stepNumber": dep_step_number,
                            "outputName": output_key_depended_on
                        })

                task = {
                    "actionVerb": step['actionVerb'], # Already validated to exist
                    "inputs": processed_inputs,
                    "description": step['description'], # Already validated
                    "expectedOutputs": step['outputs'], # Already validated to be non-empty dict
                    "dependencies": plan_dependencies # Use the list generated from inputs and LLM dependencies
                }
                tasks.append(task)
            return tasks
        except Exception as e:
            logger.error(f"Error converting JSON to tasks: {e}")
            return [{
                "success": False,
                "name": "task_conversion_error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Internal error converting plan to tasks: {str(e)}",
                "result": {"logs": memory_handler.get_logs()},
                "error": str(e)
            }]

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ACCOMPLISH plugin"""
        try:
            logger.info(f"Execute method called with inputs_map: {inputs_map}")

            # Extract goal, brain token, available_plugins, and mission_context from inputs
            goal = None
            brain_token = None
            available_plugins_str = "No specific plugins listed as available." # Default
            mission_context_str = "No overall mission context provided." # Default

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
                elif key in ['__brain_auth_token', 'token']: # Keep existing token logic
                    brain_token = str(input_value) if input_value is not None else None
                    logger.info(f"Found brain token from key {key}: {brain_token[:20] if brain_token else 'None'}...")

            logger.info(f"Final goal: {goal}")
            logger.info(f"Final available_plugins_str: {available_plugins_str}")
            logger.info(f"Final mission_context_str: {mission_context_str}")
            logger.info(f"Brain token available: {bool(brain_token)}")

            if not goal:
                logger.error("No goal provided to ACCOMPLISH plugin")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "result": {"logs": memory_handler.get_logs()},
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
                    "result": {"logs": memory_handler.get_logs()},
                    "error": "Brain service unavailable or returned empty response"
                }]

            # Parse Brain response
            try:
                # The response should already be cleaned by ensureJsonResponse in BaseInterface.ts
                parsed = json.loads(response)
                logger.info(f"Model response received: {response[:500]}...") # Log start of response

                # Handle PLAN (top-level object), DIRECT_ANSWER, or PLUGIN
                if isinstance(parsed, dict) and parsed.get("type") == "PLAN" and isinstance(parsed.get("plan"), list):
                    plan_data = parsed["plan"]
                    logger.info(f"Successfully parsed top-level PLAN object. Plan length: {len(plan_data)}")
                    validation_error_message = self.validate_plan_data(plan_data)
                    if validation_error_message:
                        return [{
                            "success": False,
                            "name": "plan_validation_error",
                            "resultType": PluginParameterType.ERROR,
                            "resultDescription": validation_error_message,
                            "result": {"logs": memory_handler.get_logs()},
                            "error": validation_error_message
                        }]
                    
                    tasks = self.convert_json_to_tasks(plan_data)
                    if tasks and isinstance(tasks, list) and len(tasks) == 1 and tasks[0].get("resultType") == PluginParameterType.ERROR:
                        return tasks # Propagate error from conversion
                    
                    logger.info(f"Successfully processed plan for goal: {goal}")
                    return [{
                        "success": True,
                        "name": "plan",
                        "resultType": PluginParameterType.PLAN,
                        "resultDescription": f"A plan to: {goal}",
                        "result": tasks,
                        "mimeType": "application/json",
                        "logs": memory_handler.get_logs()
                    }]
                elif isinstance(parsed, dict) and parsed.get("type") == "DIRECT_ANSWER":
                    logger.info(f"Received DIRECT_ANSWER: {parsed}")
                    return [{
                        "success": True,
                        "name": "direct_answer",
                        "resultType": "DIRECT_ANSWER",
                        "resultDescription": f"Direct answer for: {goal}",
                        "result": parsed.get("answer"),
                        "explanation": parsed.get("explanation", "")
                    }]
                elif isinstance(parsed, dict) and parsed.get("type") == "PLUGIN":
                    logger.info(f"Received PLUGIN: {parsed}")
                    return [{
                        "success": True,
                        "name": "plugin",
                        "resultType": "PLUGIN",
                        "resultDescription": f"Plugin recommendation for: {goal}",
                        "result": parsed.get("plugin", {}) # Return the entire plugin object
                    }]
                else:
                    logger.error(f"Brain response is not a recognized JSON object (PLAN, DIRECT_ANSWER, PLUGIN). Response: {response[:500]}")
                    return [{
                        "success": False,
                        "name": "brain_response_format_error",
                        "resultType": PluginParameterType.ERROR,
                        "resultDescription": "Brain did not return a recognized JSON object type.",
                        "result": {"logs": memory_handler.get_logs()},
                        "error": f"Unrecognized JSON object type: {parsed.get('type', 'N/A')}"
                    }]
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Brain response as JSON: {e}. Response: {response[:500]}")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Invalid JSON response from Brain service",
                    "result": {"logs": memory_handler.get_logs()},
                    "error": f"JSON parsing error: {str(e)}"
                }]
        except Exception as e:
            logger.error(f"ACCOMPLISH plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error in ACCOMPLISH plugin execution",
                "result": {"logs": memory_handler.get_logs()},
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
            "result": {"logs": memory_handler.get_logs()},
            "error": str(e)
        }]
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()

