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
    ANY = "any"
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

    ALLOWED_VALUE_TYPES = ['string', 'number', 'boolean', 'array', 'object', 'plan', 'plugin', 'any']

    def __init__(self):
        self.brain_url = os.getenv('BRAIN_URL', 'brain:5070')
        self.security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
    def get_internal_verb_requirements_for_prompt(self) -> str:
        """Generates a string listing required inputs for verbs defined in VERB_SCHEMAS."""
        lines = []
        for verb, schema in self.VERB_SCHEMAS.items():
            if schema.get('required'):
                lines.append(f"- For '{verb}': {', '.join(schema['required'])}")
        return "\n".join(lines) if lines else "No specific internal verb requirements overridden."

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
        self.security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None

    def get_internal_verb_requirements_for_prompt(self) -> str:
        """Generates a string listing required inputs for verbs defined in VERB_SCHEMAS."""
        lines = []
        for verb, schema in self.VERB_SCHEMAS.items():
            if schema.get('required'):
                lines.append(f"- For '{verb}': {', '.join(schema['required'])}")
        return "\n".join(lines) if lines else "No specific internal verb requirements overridden."        
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
Your task is to decide on the best way to to achieve the following goal: '{goal}' and provide a response in one of the JSON formats below.

DO NOT include any schemas, explanations, markdown formatting, or additional text outside the JSON object.

1. If the best option for reaching the goal should be to sub-divide into smaller steps, respond with a plan as a JSON object.  Plans must conform to this schema!

{{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {{
    "type": "object",
    "properties": {{
      "number": {{
        "type": "integer",
        "minimum": 1,
        "description": "Sequential step number"
      }},
      "actionVerb": {{
        "type": "string",
        "description": "The action to be performed in this step. It may be one of the plugin actionVerbs or a new actionVerb for a new type of task."
      }},
      "inputs": {{
        "type": "object",
        "patternProperties": {{
          "^[a-zA-Z][a-zA-Z0-9_]*$": {{
            "type": "object",
            "properties": {{
              "value": {{
                "type": "string",
                "description": "Constant string value for this input"
              }},
              "outputName": {{
                "type": "string",
                "description": "Reference to an output from a previous step"
              }},
              "valueType": {{
                "type": "string",
                "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"],
                "description": "The expected type of the input value"
              }},
              "args": {{
                "type": "object",
                "description": "Additional arguments for the input"
              }}
            }},
            "required": ["valueType"],
            "oneOf": [
              {{"required": ["value"]}},
              {{"required": ["outputName"]}}
            ],
            "additionalProperties": false
          }}
        }},
        "additionalProperties": false,
        "description": "Input parameters for this step"
      }},
      "description": {{
        "type": "string",
        "description": "Thorough description of what this step does and context needed to understand it"
      }},
      "outputs": {{
        "type": "object",
        "patternProperties": {{
          "^[a-zA-Z][a-zA-Z0-9_]*$": {{
            "type": "string",
            "description": "Thorough description of the expected output"
          }}
        }},
        "additionalProperties": false,
        "description": "Expected outputs from this step"
      }},
      "dependencies": {{
        "type": "array",
        "items": {{
          "type": "object",
          "patternProperties": {{
            "^[a-zA-Z][a-zA-Z0-9_]*$": {{
              "type": "integer",
              "minimum": 1,
              "description": "Step number that produces the output for the input with this name"
            }}
          }},
          "additionalProperties": false,
          "minProperties": 1,
          "maxProperties": 1
        }},
        "description": "Array of objects mapping all the outputNames of the inputs to the producing step numbers.  This eliminates issues with multiple steps producing outputs with identical names."
      }},
      "recommendedRole": {{
        "type": "string",
        "description": "Suggested role type for the agent executing this step"
      }}
    }},
    "required": ["number", "actionVerb", "inputs", "description", "outputs", "dependencies"],
    "additionalProperties": false
  }},
  "description": "Schema for a workflow consisting of sequential steps with dependencies"
}}


Rules for creating a plan:
1. Number each step sequentially using the "number" field.
2. Use specific, actionable verbs or phrases for each step using the "actionVerb" field (e.g., ANALYZE_CSV, ANALYZE_AUDIOFILE, PREDICT, WRITE_TEXT, WRITE_CODE, BOOK_A_CAR).
3. The schema of each step MUST be exactly as defined above. Every field is mandatory, but the "inputs" field may be an empty object ({{}}).
4. Each input in the "inputs" object MUST be an object with either (a) a 'value' property that is a string constant OR (b) an 'outputName' property that exactly matches an outputName from a previous step. Include the expected or known input value type as valueType and include optional args if the consuming step will need them.
5. List dependencies for each step as an object in the "dependencies" field, where property names are the output keys needed and values are the step numbers that provide the required output (e.g., {{"outputname": 1}}). There MUST be a dependency entry for every input that comes from a previous step output.
6. Specify the outputs of each step in the "outputs" field. At least one output is mandatory.
7. Prioritize Output Naming for Dependencies: When a step's output is intended to be used as an input for a subsequent step, ensure the name of that output precisely matches the inputName expected by the dependent step. Avoid generic output names if the output is specifically consumed by another step.
8. Aim for 5-10 steps in the plan, but more or fewer is acceptable, breaking down complex tasks as necessary.
9. Be very thorough in your "description" fields. This is the only context or instruction the performer will have.
10. Ensure the final step produces the desired outcome or mission of the goal.
11. For each step, include a "recommendedRole" field with one of the available agent roles that would be best suited for the task.
12. Create at least one output for every step.
13. When using actionVerbs, ensure the required inputs are there and produced by preceeding steps using the correct name.  For example, a DELEGATE step should have a subAgentGoal defined as a goal and either provided as a constant in the step or defined by a preceeding step as an output named subAgenGoal.
14. DO NOT RETURN THE SCHEMA - JUST THE PLAN!

Available Agent Roles:
- coordinator: Coordinates activities of other agents, manages task allocation, and ensures mission success. Good for planning, delegation, and monitoring.
- researcher: Gathers, analyzes, and synthesizes information from various sources. Good for information gathering and data analysis.
- creative: Generates creative ideas, content, and solutions to problems. Good for idea generation and content creation.
- critic: Evaluates ideas, plans, and content, providing constructive feedback. Good for quality assessment and risk identification.
- executor: Implements plans and executes tasks with precision and reliability. Good for task execution and process following.
- domain_expert: Provides specialized knowledge and expertise in a specific domain. Good for technical analysis and expert advice.

IMPORTANT: Your response MUST be a valid JSON object with no additional text or formatting. The JSON must start with {{ and end with }} and must include one of the three types: "DIRECT_ANSWER", "PLAN", or "PLUGIN".

Plugins are available to execute steps of the plan. Some have required inputs - required properties for the inputs object.
The `available_plugins_str` (provided by the system) lists these:
{available_plugins_str}

Additionally, for clarity, here are the known required inputs for some common verbs based on this plugin's internal definitions (ensure these are always provided for the respective verbs):
{self.get_internal_verb_requirements_for_prompt()}
When using these or any other actionVerbs, ensure ALL their required inputs (as specified in their definitions) are present.

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
                "description": "Complete explanation of the input"
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
                logger.error(f"Invalid step at index {i}: not a JSON object. Step: {step}")
                return f"Step at index {i} is not a JSON object."

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
                return f"Step {i+1} has invalid 'inputs' field. Must be a JSON object."
            
            actionVerb = step['actionVerb'] # Use the validated verb
            for input_name, input_value_obj in inputs_dict.items():
                if not isinstance(input_value_obj, dict):
                    return f"Step {i+1} input '{input_name}' is not an object. Expected {{'value': '...'}} or {{'outputName': '...'}}."

                # Validate presence of 'valueType'
                if 'valueType' not in input_value_obj:
                    input_value_obj['valueType'] = PluginParameterType.ANY
                if input_value_obj['valueType'] not in self.ALLOWED_VALUE_TYPES:
                    input_value_obj['valueType'] = PluginParameterType.ANY

                has_value = 'value' in input_value_obj
                has_output_key = 'outputName' in input_value_obj
                
                if not (has_value ^ has_output_key): # Exactly one of 'value' or 'outputName' must be present
                    return f"Step {i+1} input '{input_name}' has neither a 'value' nor 'outputName' property. It must contain one or the other property with a string value."

                # Ensure no other keys are present except 'value', 'outputName', 'valueType', and optional 'args'
                # allowed_keys = {'value', 'outputName', 'valueType', 'args'}
                # if not set(input_value_obj.keys()).issubset(allowed_keys):
                #    return f"Step {i+1} input '{input_name}' contains unexpected keys. Allowed keys: {allowed_keys}"

            # Validate required inputs based on VERB_SCHEMAS
            if actionVerb in self.VERB_SCHEMAS:
                schema = self.VERB_SCHEMAS[actionVerb]
                for required_input_name in schema.get('required', []):
                    if required_input_name not in inputs_dict:
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) missing required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
                    # Further check if the required input's value/outputName is truly present/non-empty
                    input_val_obj = inputs_dict[required_input_name]
                    if 'value' in input_val_obj and (input_val_obj['value'] is None or (isinstance(input_val_obj['value'], str) and not input_val_obj['value'].strip())):
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) has empty or null 'value' for required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
                    if 'outputName' in input_val_obj and (input_val_obj['outputName'] is None or (isinstance(input_val_obj['outputName'], str) and not input_val_obj['outputName'].strip())):
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) has empty or null 'outputName' for required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
        
                # Validate 'dependencies'
                dependencies = step.get('dependencies', []) # Default to empty list
                # If dependencies is an empty object, treat as empty list
                if isinstance(dependencies, dict) and len(dependencies) == 0:
                    dependencies = []
                if isinstance(dependencies, dict):
                    # Transform dict of dependencies to list of single-key dicts
                    new_deps = []
                    for k, v in dependencies.items():
                        new_deps.append({k: v})
                    dependencies = new_deps
                if not isinstance(dependencies, list):
                    return f"Step {i+1} has invalid 'dependencies' field. Must be a list of objects."

                for dep in dependencies:
                    if not isinstance(dep, dict) or len(dep) != 1:
                        return f"Step {i+1} has an invalid dependency item: '{dep}'. Each item must be a single key-value pair object."
                    
                    dep_output_key, dep_step_number = list(dep.items())[0]

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
            tasks = []
            for step in json_plan:
                # The new implementation will pass the `inputs` from the language model's plan directly through,
                # as the downstream `createFromPlan` function is responsible for processing this structure.
                task = {
                    "actionVerb": step['actionVerb'],
                    "inputReferences": step.get('inputs', {}),  # Pass inputs directly
                    "description": step['description'],
                    "outputs": step['outputs'],
                    "dependencies": step.get('dependencies', []), # Pass dependencies directly
                    "recommendedRole": step.get('recommendedRole')
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

    def auto_repair_plan(self, goal: str, available_plugins_str: str, mission_context_str: str, invalid_plan: list, validation_error: str, brain_token: Optional[str] = None) -> Optional[list]:
        """
        Ask the Brain to revise the invalid plan to correct the validation error.
        If the error is due to an input not being produced by any previous step, explicitly inform the Brain of this fact in the prompt.
        """
        logger.info('Auto-repairing plan...')

    def get_internal_verb_requirements_for_prompt(self) -> str:
        """Generates a string listing required inputs for verbs defined in VERB_SCHEMAS."""
        lines = []
        for verb, schema in self.VERB_SCHEMAS.items():
            if schema.get('required'):
                lines.append(f"- For '{verb}': {', '.join(schema['required'])}")
        return "\n".join(lines) if lines else "No specific internal verb requirements overridden."

    def auto_repair_plan(self, goal: str, available_plugins_str: str, mission_context_str: str, invalid_plan: list, validation_error: str, brain_token: Optional[str] = None) -> Optional[list]:
        """
        Ask the Brain to revise the invalid plan to correct the validation error.
        If the error is due to an input not being produced by any previous step, explicitly inform the Brain of this fact in the prompt.
        """
        logger.info('Auto-repairing plan...')

        # Try to extract missing input(s) from the validation error message
        missing_input_hint = ""
        import re
        
        # Check for missing required input error
        missing_req_match = re.search(r"missing required input '([^']+)' for verb '([^']+)'", validation_error) # Corrected regex
        if missing_req_match:
            missing_input = missing_req_match.group(1)
            verb = missing_req_match.group(2)
            step_number_match = re.search(r"\(step (\d+)\)", validation_error)
            step_number_info = f" for step {step_number_match.group(1)}" if step_number_match else ""
            
            if verb in self.VERB_SCHEMAS and self.VERB_SCHEMAS[verb].get('required'):
                required_list = ", ".join(self.VERB_SCHEMAS[verb]['required'])
                missing_input_hint = (
                    f"\n\nIMPORTANT NOTE: The error is: \"{validation_error}\". "
                    f"This means for the step{step_number_info} using actionVerb '{verb}', an input is missing. "
                    f"According to this plugin's internal definitions, the verb '{verb}' absolutely requires the following inputs: [{required_list}]. "
                    f"Please ensure the revised plan provides ALL of these required inputs for the '{verb}' step."
                )
            else:
                 missing_input_hint = f"\n\nNOTE: The error indicates a missing input for verb '{verb}'{step_number_info}. Please ensure all its necessary inputs are provided."
        else:
            # Check for input not produced error
            not_produced_match = re.search(r"input '([^']+)' is not produced by any previous step", validation_error)
            if not_produced_match:
                missing_input = not_produced_match.group(1)
                missing_input_hint = f"\n\nNOTE: The error is: \"{validation_error}\". This means the input '{missing_input}' for a step was expected to come from a previous step's output, but no previous step produces an output with this name. Please revise the plan to either correctly name the output in a preceding step or provide this input as a constant value if appropriate. Ensure all dependencies are correctly defined."
            # Check for structural input errors (e.g. trueSteps not an object)
            elif "is not an object. Expected {'value': '...'} or {'outputName': '...'}" in validation_error:
                input_name_match = re.search(r"input '([^']+)' is not an object", validation_error)
                input_name = input_name_match.group(1) if input_name_match else "a specific input"
                missing_input_hint = (
                    f"\n\nIMPORTANT NOTE: The error is: \"{validation_error}\". "
                    f"This means that for {input_name} (e.g., 'trueSteps', 'steps'), the plan provided a direct array (e.g., `[{...}]`) or other non-object type. "
                    f"However, this input MUST be an object, containing either a 'value' key (for a literal array of steps) or an 'outputName' key (if referencing steps from a previous output). "
                    f"For example, if you intend to provide a list of steps directly, it should be formatted like: `\"{input_name}\": {{\"value\": [...]}}`. "
                    f"Please correct the structure for this input in the revised plan."
                )


        repair_prompt = f"""
You previously generated this plan:

{json.dumps(invalid_plan, indent=2)}

However, the following validation error was found:
"{validation_error}"{missing_input_hint}

The plan was intended to address the goal: '{goal}'

Revise the plan to correct the error. Only return the corrected plan as a JSON array, with no explanations or extra text.
"""
        response = self.query_brain(repair_prompt, brain_token)
        if not response:
            return None
        try:
            parsed = json.loads(response)
            if isinstance(parsed, list):
                return parsed
            elif isinstance(parsed, dict) and "items" in parsed and isinstance(parsed["items"], list):
                return parsed["items"]
            else:
                return None
        except Exception as e:
            logger.error(f"Failed to parse auto-repaired plan: {e}")
            return None

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ACCOMPLISH plugin"""
        try:
            logger.info(f"Execute method called with goal: {inputs_map['goal']}")

            # Extract goal, brain token, available_plugins, and mission_context from inputs
            goal = None
            brain_token = None
            available_plugins_str = "No specific plugins listed as available." # Default
            mission_context_str = "No overall mission context provided." # Default

            for key, value_obj in inputs_map.items():
                input_value = value_obj.get('value') if isinstance(value_obj, dict) else value_obj

                if key == 'goal':
                    if isinstance(input_value, dict) and 'inputValue' in input_value:
                        goal = str(input_value['inputValue']) if input_value['inputValue'] is not None else None
                        logger.info(f"Extracted goal from nested 'inputValue': {goal}")
                    else:
                        goal = str(input_value) if input_value is not None else None
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

            logger.info(f"Final available_plugins_str: {available_plugins_str}")
            logger.info(f"Final mission_context_str: {mission_context_str}")

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

            max_retries_for_single_step = 1
            for attempt in range(max_retries_for_single_step + 1):
                # Generate prompt and query Brain
                current_prompt = self.generate_prompt(goal, available_plugins_str, mission_context_str)
                if attempt > 0: # This is a retry attempt
                    logger.info(f"Retrying Brain query for goal '{goal}' due to previous single-step response. Attempt {attempt}.")
                    current_prompt = f"The previous response was a single step, which is insufficient. Please provide a complete plan, a direct answer, or a plugin suggestion for the goal: '{goal}'.\n\nOriginal prompt context:\n{current_prompt}"

                logger.info(f"Generated prompt for Brain (attempt {attempt+1}): {current_prompt[:500]}...")
                response = self.query_brain(current_prompt, brain_token)

                if not response:
                    logger.error("Failed to get response from Brain service")
                    # If it's the last attempt, return the error, otherwise loop will continue if retries left
                    if attempt == max_retries_for_single_step:
                        return [{
                            "success": False, "name": "error", "resultType": PluginParameterType.ERROR,
                            "resultDescription": "Failed to get response from Brain service after retries.",
                            "result": {"logs": memory_handler.get_logs()},
                            "error": "Brain service unavailable or returned empty response after retries."
                        }]
                    continue # Try again if retries left

                # Parse Brain response
                try:
                    parsed = json.loads(response)
                    logger.info(f"Model response received (attempt {attempt+1}): {response[:500]}...")

                    # Handle PLAN, DIRECT_ANSWER, or PLUGIN
                    if isinstance(parsed, dict) and parsed.get("type") == "PLAN" and \
                       (isinstance(parsed.get("plan"), list) or isinstance(parsed.get("items"), list) or isinstance(parsed.get("value"), list)):
                        if isinstance(parsed.get("plan"), list):
                            plan_data = parsed.get("plan")
                        elif isinstance(parsed.get("items"), list):
                            plan_data = parsed.get("items")
                        else:
                            plan_data = parsed.get("value")
                        logger.info(f"Successfully parsed top-level PLAN object. Plan length: {len(plan_data)}")

                        validation_error_message = self.validate_plan_data(plan_data)
                        repair_attempts = 0
                        max_repair_attempts = 3 # Max repair attempts for a given plan
                        while validation_error_message and repair_attempts < max_repair_attempts:
                            logger.warning(f"Plan validation failed: {validation_error_message}. Attempting auto-repair (repair attempt {repair_attempts+1}).")
                            repaired_plan = self.auto_repair_plan(goal, available_plugins_str, mission_context_str, plan_data, validation_error_message, brain_token)
                            if not repaired_plan:
                                logger.error("Auto-repair failed to produce a new plan.")
                                break
                            plan_data = repaired_plan
                            validation_error_message = self.validate_plan_data(plan_data)
                            repair_attempts += 1

                        if validation_error_message:
                            return [{
                                "success": False, "name": "plan_validation_error", "resultType": PluginParameterType.ERROR,
                                "resultDescription": validation_error_message, "result": {"logs": memory_handler.get_logs()},
                                "error": validation_error_message
                            }]

                        tasks = self.convert_json_to_tasks(plan_data)
                        if tasks and isinstance(tasks, list) and tasks[0].get("resultType") == PluginParameterType.ERROR:
                             return tasks # Propagate error from conversion
                        logger.info(f"Successfully processed plan for goal: {goal}")
                        return [{
                            "success": True, "name": "plan", "resultType": PluginParameterType.PLAN,
                            "resultDescription": f"A plan to: {goal}", "result": tasks,
                            "mimeType": "application/json", "logs": memory_handler.get_logs()
                        }]

                    elif isinstance(parsed, dict) and parsed.get("type") == "DIRECT_ANSWER":
                        logger.info(f"Received DIRECT_ANSWER: {parsed}")
                        return [{"success": True, "name": "direct_answer", "resultType": "DIRECT_ANSWER",
                                 "resultDescription": f"Direct answer for: {goal}", "result": parsed.get("answer"),
                                 "explanation": parsed.get("explanation", "")}]

                    elif isinstance(parsed, dict) and parsed.get("type") == "PLUGIN":
                        logger.info(f"Received PLUGIN: {parsed}")
                        return [{"success": True, "name": "plugin", "resultType": "PLUGIN",
                                 "resultDescription": f"Plugin recommendation for: {goal}",
                                 "result": parsed.get("plugin", {})}]

                    # Check if the response is a single step object
                    elif isinstance(parsed, dict) and 'actionVerb' in parsed and 'number' in parsed and \
                         'inputs' in parsed and 'outputs' in parsed and 'description' in parsed:
                        logger.warning(f"Brain response was a single step object (attempt {attempt+1}). This is considered incomplete.")
                        if attempt < max_retries_for_single_step:
                            continue # Trigger retry by continuing the loop
                        else: # Max retries reached for single step
                            return [{
                                "success": False, "name": "incomplete_brain_response_single_step",
                                "resultType": PluginParameterType.ERROR,
                                "resultDescription": "Brain returned a single step after retries. A complete plan, direct answer, or plugin suggestion was expected.",
                                "result": {"logs": memory_handler.get_logs(), "original_response": response[:1000]},
                                "error": "Incomplete response from Brain: single step received after retries."
                            }]
                    else: # Unrecognized format
                        logger.error(f"Brain response is not a recognized JSON object (PLAN, DIRECT_ANSWER, PLUGIN) nor a valid single step. Response: {response[:500]}")
                        return [{
                            "success": False, "name": "brain_response_format_error", "resultType": PluginParameterType.ERROR,
                            "resultDescription": "Brain did not return a recognized JSON object type.",
                            "result": {"logs": memory_handler.get_logs()},
                            "error": f"Unrecognized JSON object type: {parsed.get('type', 'N/A')}"
                        }]

                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse Brain response as JSON (attempt {attempt+1}): {e}. Response: {response[:500]}")
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

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)

        inputs_map = {item[0]: item[1] for item in inputs_list}

        # Debug: Check if goal is in the inputs
        if not ('goal' in inputs_map):
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
