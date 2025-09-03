#!/usr/bin/env python3
"""
REFLECT Plugin - Rewritten to create schema-compliant plans
Handles reflection on mission progress and generates plans for next steps.
"""

import json
import logging
import sys
import time
import requests
import re
from typing import Dict, Any, List, Optional, Set

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

class ProgressTracker:
    def __init__(self):
        self.start_time = time.time()
        self.checkpoints = []

    def checkpoint(self, name: str):
        elapsed = time.time() - self.start_time
        self.checkpoints.append((name, elapsed))
        logger.info(f"CHECKPOINT: {name} at {elapsed:.2f}s")

progress = ProgressTracker()

class ReflectError(Exception):
    """Custom exception for REFLECT plugin errors"""
    def __init__(self, message: str, error_type: str = "general_error"):
        super().__init__(message)
        self.error_type = error_type

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs"""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise ReflectError("No authentication token found", "auth_error")

def get_mission_goal(mission_id: str, inputs: Dict[str, Any]) -> Optional[str]:
    """Fetches the mission goal from the Librarian service."""
    if not mission_id:
        return None
    
    try:
        auth_token = get_auth_token(inputs)
        librarian_url_input = inputs.get('librarian_url')
        if isinstance(librarian_url_input, dict) and 'value' in librarian_url_input:
            librarian_url = librarian_url_input['value']
        else:
            librarian_url = librarian_url_input if librarian_url_input is not None else 'librarian:5040'

        headers = {'Authorization': f'Bearer {auth_token}'}
        # Assuming the mission is stored in a 'missions' collection
        response = requests.get(f"http://{librarian_url}/loadData/{mission_id}?collection=missions", headers=headers)
        response.raise_for_status()
        mission_data = response.json()
        return mission_data.get('data', {}).get('goal')
    except Exception as e:
        logger.error(f"Error fetching mission {mission_id}: {e}")
        # Don't raise, just return None and let the caller decide what to do
        return None

def _extract_json_from_string(text: str) -> Optional[str]:
    """
    Extracts a JSON object or array string from a given text.
    Assumes the JSON is the primary content and attempts to find the outermost JSON structure.
    """
    text = text.strip()
    if not text:
        return None

    # Find the first and last occurrences of the JSON delimiters
    first_brace = text.find('{')
    first_bracket = text.find('[')
    last_brace = text.rfind('}')
    last_bracket = text.rfind(']')

    # Determine the start and end of the JSON string
    if first_bracket != -1 and last_bracket != -1 and first_bracket < last_bracket:
        # It's likely a JSON array
        start_index = first_bracket
        end_index = last_bracket
    elif first_brace != -1 and last_brace != -1 and first_brace < last_brace:
        # It's likely a JSON object
        start_index = first_brace
        end_index = last_brace
    else:
        return None # No valid JSON found

    json_candidate = text[start_index : end_index + 1]

    # Basic validation: check if the candidate string is likely JSON
    if not (json_candidate.startswith('{') and json_candidate.endswith('}')) and \
       not (json_candidate.startswith('[') and json_candidate.endswith(']')):
        return None

    return json_candidate

def call_brain(prompt: str, inputs: Dict[str, Any], response_type: str = "json") -> str:
    """Call Brain service with proper authentication and conversation type"""
    progress.checkpoint("brain_call_start")

    try:
        auth_token = get_auth_token(inputs)
        brain_url_input = inputs.get('brain_url')
        if isinstance(brain_url_input, dict) and 'value' in brain_url_input:
            brain_url = brain_url_input['value']
        else:
            brain_url = brain_url_input if brain_url_input is not None else 'brain:5070'

        # Set conversation type and system message based on response type
        if response_type == 'json':
            conversation_type = "TextToJSON"
            system_message = (
                "You are a planning assistant for a system of agents. Generate meaningful and actionable plans as JSON arrays. "
                "Plans must accomplish the provided goal, not simulate it. "
                "Each step must match the provided schema precisely.  You should attempt to use the available tools first to find solutions and complete tasks independently. Do not create steps to ask the user for information you can find elsewhere. "
                "Return ONLY valid JSON, no other text." 
            )
        else:
            conversation_type = "TextToText"
            system_message = "You are an autonomous agent. Your primary goal is to accomplish the user's mission by creating and executing plans.  Be resourceful and proactive."

        payload = {
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "conversationType": conversation_type,
            "temperature": 0.1
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {auth_token}'
        }

        logger.info(f"Calling Brain at: http://{brain_url}/chat (type: {conversation_type})")
        response = requests.post(
            f"http://{brain_url}/chat",
            json=payload,
            headers=headers,
            timeout=60  # Reduced timeout to 60 seconds
        )

        if response.status_code != 200:
            raise ReflectError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'result' not in result:
            raise ReflectError("Brain response missing result", "brain_response_error")

        raw_brain_response = result['result']

        if response_type == 'text':
            logger.info("Response type is TEXT. Not attempting JSON extraction.")
            progress.checkpoint("brain_call_success_text_response")
            return raw_brain_response

        # Attempt to extract clean JSON from the raw response
        extracted_json_str = _extract_json_from_string(raw_brain_response)

        if extracted_json_str:
            try:
                # Validate that the extracted string is indeed valid JSON
                json.loads(extracted_json_str)
                logger.info("Successfully extracted and validated JSON from Brain response.")
                logger.info(f"Raw JSON response from Brain: {extracted_json_str}")
                progress.checkpoint("brain_call_success")
                return extracted_json_str
            except json.JSONDecodeError as e:
                logger.warning(f"Extracted JSON is still invalid: {e}. Raw response: {raw_brain_response[:200]}...")
                # Fallback to raw response if extraction leads to invalid JSON
                progress.checkpoint("brain_call_success_with_warning")
                return raw_brain_response
        else:
            logger.warning(f"Could not extract JSON from Brain response. Raw response: {raw_brain_response[:200]}...")
            progress.checkpoint("brain_call_success_with_warning")
            return raw_brain_response

    except Exception as e:
        progress.checkpoint("brain_call_failed")
        logger.error(f"Brain call failed: {e}")
        raise ReflectError(f"Brain service call failed: {e}", "brain_error")

def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and validate inputs"""
    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        
        # Parse the input string as a list of [key, value] pairs
        input_list = json.loads(inputs_str)
        
        # Convert to dictionary
        inputs = {}
        for item in input_list:
            if isinstance(item, list) and len(item) == 2:
                key, value = item
                
                # Handle InputValue objects
                if isinstance(value, dict) and ('inputName' in value or 'value' in value or 'outputName' in value):
                    # This is likely an InputValue object. Extract the actual value.
                    if 'value' in value:
                        inputs[key] = value['value']
                    elif 'outputName' in value and 'sourceStep' in value:
                        # This is a reference to an output from a previous step
                        inputs[key] = {
                            "outputName": value['outputName'],
                            "sourceStep": value['sourceStep']
                        }
                    else:
                        # Fallback for malformed InputValue objects, keep as is
                        inputs[key] = value
                else:
                    # Regular key-value pair
                    inputs[key] = value
            else:
                logger.warning(f"Skipping invalid input item: {item}")
        
        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
        
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise ReflectError(f"Input validation failed: {e}", "input_error")

# Plan step schema for validation
PLAN_STEP_SCHEMA = {
    "type": "object",
    "properties": {
        "number": {
            "type": "integer",
            "minimum": 1,
            "description": "Sequential step number"
        },
        "actionVerb": {
            "type": "string",
            "description": "The action to be performed in this step. It may be one of the plugin actionVerbs or a new actionVerb for a new type of task."
        },
        "description": {
            "type": "string",
            "description": "A thorough description of the task to be performed in this step so that an agent or LLM can execute without needing external context beyond the inputs and output specification."
        },
        "inputs": {
            "type": "object",
            "patternProperties": {
                "^[a-zA-Z][a-zA-Z0-9_]*$": {
                "type": "object",
                "properties": {
                    "value": {
                        "type": "string",
                        "description": "Constant string value for this input"
                    },
                    "valueType": {
                        "type": "string",
                        "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"],
                        "description": "The natural type of the Constant input value"
                    },
                    "outputName": {
                        "type": "string",
                        "description": "Reference to an output from a previous step at the same level or higher"
                    },
                    "sourceStep": {
                        "type": "integer",
                        "minimum": 0, 
                        "description": "The step number that produces the output for this input. Use 0 to refer to an input from the parent step."
                    },
                    "args": {
                        "type": "object",
                        "description": "Additional arguments for the input"
                    }
                },
                "oneOf": [
                    {"required": ["value", "valueType"]},
                    {"required": ["outputName", "sourceStep"]}
                ],
                "additionalProperties": False,
            },
            "additionalProperties": False,
        },
        "outputs": {
            "type": "object",
            "patternProperties": {
                "^[a-zA-Z][a-zA-Z0-9_]*$": {
                    "type": "string",
                    "description": "Thorough description of the expected output"
                }
            },
            "additionalProperties": False,
            "description": "Expected outputs from this step, for control flow, should match the final outputs of the sub-plan(s)"
        },
        "recommendedRole": {
            "type": "string",
            "description": "Suggested role type for the agent executing this step. Allowed values are Coordinator, Researcher, Coder, Creative, Critic, Executor, and Domain Expert "
        }
    },
    "required": ["number", "actionVerb", "inputs", "description", "outputs"],
    "additionalProperties": False
    }
}

class PlanValidator:
    """Handles validation and repair of plans."""
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries

    def _standardize_input_name(self, input_name: str, plugin_input_definitions: Dict[str, Any]) -> str:
        """Heuristic to map a given input name to a known plugin input name."""
        known_names = list(plugin_input_definitions.keys())
        if input_name in known_names:
            return input_name
        
        # Check for pluralization
        if input_name.endswith('s') and input_name[:-1] in known_names:
            return input_name[:-1]
        
        # Check for a more general case like 'tool_name' -> 'toolname'
        if input_name.replace('_', '') in [name.replace('_', '') for name in known_names]:
            for name in known_names:
                if input_name.replace('_', '') == name.replace('_', ''):
                    return name
        
        return input_name
        
    def _validate_plan(self, plan: List[Dict[str, Any]], available_plugins_wrapped: List[Dict[str, Any]], inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Validate plan structure and completeness"""
        errors = []
        logger.info("Starting plan validation...")

        if not isinstance(plan, list) or len(plan) == 0:
            return {'valid': False, 'errors': ['Plan must be a non-empty array']}
        
        available_plugins = inputs.get('availablePlugins', []) # Direct get, default to empty list
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins if isinstance(plugin, dict)} # Defensive check

        step_numbers = set()
        step_outputs: Dict[int, Set[str]] = {}
        for i, step in enumerate(plan):
            step_num = step.get('number', i + 1)
            step_numbers.add(step_num)
            if 'outputs' in step and isinstance(step['outputs'], dict):
                step_outputs[step_num] = set(step['outputs'].keys())
            else:
                step_outputs[step_num] = set()

        for i, step in enumerate(plan):
            step_num = step.get('number', i + 1)
            
            required_fields = ['number', 'actionVerb', 'inputs', 'description', 'outputs']
            for field in required_fields:
                if field not in step:
                    errors.append(f"Step {step_num}: Missing required field '{field}'")
            
            allowed_fields = required_fields + ['recommendedRole']
            for field in list(step.keys()):
                if field not in allowed_fields:
                    logger.warning(f"Step {step_num}: Removing unexpected property '{field}'")
                    del step[field]
            
            if 'outputs' in step and isinstance(step['outputs'], dict):
                output_names = set()
                for output_name, output_details in list(step['outputs'].items()):
                    if isinstance(output_details, str):
                        step['outputs'][output_name] = {'description': output_details}
                        output_details = step['outputs'][output_name]

                    if not isinstance(output_details, dict) or 'description' not in output_details:
                        errors.append(f"Step {step_num}: Output '{output_name}' is missing 'description' or is malformed.")
                        continue

                    if not isinstance(output_details['description'], str):
                        errors.append(f"Step {step_num}: Output '{output_name}' has an invalid description type (expected string).")
                    if output_name in output_names:
                        errors.append(f"Step {step_num}: Duplicate output name '{output_name}'.")
                    output_names.add(output_name)

            if 'inputs' in step and isinstance(step['inputs'], dict):
                for input_name, input_def in list(step['inputs'].items()):
                    if not isinstance(input_def, dict):
                        if isinstance(input_def, (str, int, float, bool)):
                            step['inputs'][input_name] = {
                                "value": input_def,
                                "valueType": "string" if isinstance(input_def, str) else "number" if isinstance(input_def, (int, float)) else "boolean"
                            }
                            input_def = step['inputs'][input_name]
                        else:
                            errors.append(f"Step {step_num}: Input '{input_name}' is malformed.")
                            continue

                    is_value_set = 'value' in input_def
                    is_output_set = 'outputName' in input_def and 'sourceStep' in input_def

                    if not (is_value_set or is_output_set):
                        errors.append(f"Step {step_num}: Input '{input_name}' must have 'value' or 'outputName' and 'sourceStep'.")
                        continue

                    if is_value_set and is_output_set:
                        logger.info(f"Step {step_num}: Repairing input '{input_name}', preferring output reference.")
                        del input_def['value']
                        if 'valueType' in input_def: del input_def['valueType']

                    if 'outputName' in input_def and 'sourceStep' in input_def:
                        source_step_num = input_def['sourceStep']
                        if not isinstance(source_step_num, int) or source_step_num < 0:
                            errors.append(f"Step {step_num}: Input '{input_name}' has invalid source step: {source_step_num}")
                            continue
                        
                        if source_step_num > 0:
                            if source_step_num >= step_num:
                                errors.append(f"Step {step_num}: Input '{input_name}' refers to future step {source_step_num}")
                            if source_step_num not in step_numbers:
                                errors.append(f"Step {step_num}: Input '{input_name}' refers to non-existent step {source_step_num}")
                                continue
                            
                            source_step = next((s for s in plan if s.get('number') == source_step_num), None)
                            if source_step:
                                # Get the actual outputs of the source step (which might have been remediated)
                                actual_source_step_outputs = set(source_step.get('outputs', {}).keys())
                                
                                # Primary check: Does the input's outputName exist in the source step's actual outputs?
                                if input_def['outputName'] not in actual_source_step_outputs:
                                    # If not, try to find a suitable replacement
                                    found_match = False
                                    # Heuristic 1: If there's only one output in the source step, use it.
                                    if len(actual_source_step_outputs) == 1:
                                        correct_name = list(actual_source_step_outputs)[0]
                                        logger.info(f"Step {step_num}: Repairing input '{input_name}' by changing outputName from '{input_def['outputName']}' to '{correct_name}' (single output heuristic).")
                                        input_def['outputName'] = correct_name
                                        found_match = True
                                    # Heuristic 2: Check for similar names (e.g., case-insensitive, pluralization)
                                    # This would require a more complex string matching logic, similar to _standardize_input_name
                                    # For now, let's stick to the single output heuristic or report an error.

                                    if not found_match:
                                        # If no remediation, report an error
                                        errors.append(f"Step {step_num}: Input '{input_name}' refers to output '{input_def['outputName']}' which is not found in source step {source_step_num}'s outputs: {list(actual_source_step_outputs)}.")
                                else:
                                    # Output name is valid in the source step's outputs, no action needed.
                                    pass
                            else:
                                # This case should ideally be caught by earlier non-existent step check, but for robustness:
                                errors.append(f"Step {step_num}: Input '{input_name}' refers to non-existent source step {source_step_num}.")

                    if input_name == "missionId":
                        mission_id = inputs.get('missionId', {}).get('value')
                        if mission_id:
                            step['inputs'][input_name] = {"value": mission_id, "valueType": "string"}

            action_verb = step.get('actionVerb')
            if action_verb == 'UNKNOWN':
                errors.append(f"The actionVerb for Step {step_num} is an invalid value: {action_verb}")
            if action_verb in plugin_map:
                plugin_definition = plugin_map[action_verb]
                plugin_input_definitions = {inp.get('name'): inp for inp in plugin_definition.get('inputDefinitions', [])}
                
                if 'inputs' in step and isinstance(step['inputs'], dict):
                    original_inputs = step['inputs'].copy()
                    cleaned_inputs = {}
                    for input_name, input_def in original_inputs.items():
                        standardized_name = self._standardize_input_name(input_name, plugin_input_definitions)
                        cleaned_inputs[standardized_name] = input_def
                    step['inputs'] = cleaned_inputs

                required_inputs_by_plugin = {name for name, definition in plugin_input_definitions.items() if definition.get('required')}
                
                if 'inputs' in step and isinstance(step['inputs'], dict):
                    provided_inputs = set(step['inputs'].keys())
                    missing_required = required_inputs_by_plugin - provided_inputs
                    if missing_required:
                        errors.append(f"Step {step_num} (verb '{action_verb}'): Missing required inputs: {', '.join(missing_required)}")

                # Check if the step's outputs match the plugin's output definitions
                expected_outputs_from_plugin = {out.get('name'): out for out in plugin_definition.get('outputDefinitions', [])} # Get name and full definition
                actual_outputs_in_step = step.get('outputs', {})

                # Identify missing outputs and add them
                for output_name, output_def in expected_outputs_from_plugin.items():
                    if output_name not in actual_outputs_in_step:
                        logger.info(f"Step {step_num} (verb '{action_verb}'): Adding missing output '{output_name}' from plugin definition.")
                        # Add the missing output with its description from the plugin definition
                        actual_outputs_in_step[output_name] = {'description': output_def.get('description', f"Output '{output_name}' from {action_verb} plugin.")}
                        # No error added, as it's remediated

                # Identify extra outputs and remove them
                outputs_to_remove = [name for name in actual_outputs_in_step.keys() if name not in expected_outputs_from_plugin]
                for output_name in outputs_to_remove:
                    logger.info(f"Step {step_num} (verb '{action_verb}'): Removing unexpected output '{output_name}'.")
                    del actual_outputs_in_step[output_name]
                    # No error added, as it's remediated

                # After remediation, ensure the step's outputs are updated
                step['outputs'] = actual_outputs_in_step

        return {'valid': len(errors) == 0, 'errors': errors}

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 3: Validate and repair plan if needed, with retries."""
        logger.info("🔍 Phase 3: Validating and repairing plan...")

        # Initial code-based repair
        plan = self._repair_plan_code_based(plan)

        for attempt in range(self.max_retries):
            validation_result = self._validate_plan(plan, inputs.get('availablePlugins', []), inputs)
            
            if validation_result['valid']:
                logger.info("✅ Plan validation successful")
                return plan
            
            logger.warning(f"Attempt {attempt + 1}: Plan validation failed with errors: {validation_result['errors']}")
            
            if attempt < self.max_retries - 1:
                logger.info("🔧 Attempting to repair plan with LLM...")
                try:
                    plan = self._repair_plan_with_llm(plan, validation_result['errors'], goal, inputs)
                    plan = self._repair_plan_code_based(plan) # Repair again after LLM changes
                except Exception as e:
                    logger.error(f"Plan repair failed on attempt {attempt + 1}: {e}")
            else:
                raise ReflectError(
                    f"Plan validation failed after {self.max_retries} attempts. Last errors: {validation_result['errors']}", 
                    "validation_error"
                )
        
        raise ReflectError("Unexpected validation loop exit", "validation_error")

    def _repair_plan_code_based(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Automatically repair common schema violations in the plan."""
        logger.info("[Repair] Starting code-based repair...")
        
        if not isinstance(plan, list):
            logger.warning("Plan is not a list. Cannot repair.")
            return []

        for step in plan:
            if not isinstance(step, dict):
                logger.warning("Step is not a dictionary. Skipping.")
                continue

            # Ensure 'number' is an integer
            if 'number' in step and not isinstance(step['number'], int):
                try:
                    step['number'] = int(step['number'])
                except (ValueError, TypeError):
                    logger.warning(f"Failed to convert step number '{step['number']}' to integer. Removing.")
                    del step['number']

            # Repair inputs
            if 'inputs' in step and isinstance(step['inputs'], dict):
                for input_name, input_def in step['inputs'].items():
                    if isinstance(input_def, dict):
                        has_output_name = 'outputName' in input_def
                        has_source_step = 'sourceStep' in input_def
                        has_value = 'value' in input_def

                        if has_output_name and has_source_step:
                            # Dependent input: only allow outputName, sourceStep, and args
                            allowed_keys = ['outputName', 'sourceStep', 'args']
                            keys_to_delete = [key for key in list(input_def.keys()) if key not in allowed_keys]
                            for key in keys_to_delete:
                                logger.info(f"[Repair] Dependent input '{input_name}': Deleting extraneous key '{key}'")
                                del input_def[key]
                        elif has_value:
                            # Constant input: only allow value, valueType, and args
                            allowed_keys = ['value', 'valueType', 'args']
                            keys_to_delete = [key for key in list(input_def.keys()) if key not in allowed_keys]
                            for key in keys_to_delete:
                                logger.info(f"[Repair] Constant input '{input_name}': Deleting extraneous key '{key}'")
                                del input_def[key]
                        else:
                            # Malformed input def, try to make sense of it
                            if has_output_name:
                                logger.warning(f"Input '{input_name}' has 'outputName' but no 'sourceStep'. Adding sourceStep: 0 as a guess.")
                                input_def['sourceStep'] = 0
                            elif has_source_step:
                                logger.warning(f"Input '{input_name}' has 'sourceStep' but no 'outputName'. Removing.")
                                del step['inputs'][input_name]
                                

            # Recursively repair sub-plans
            if 'steps' in step and isinstance(step['steps'], list):
                logger.info(f"[Repair] Recursively repairing sub-plan in step {step.get('number')}")
                step['steps'] = self._repair_plan_code_based(step['steps'])
                
        logger.info(f"[Repair] Finished code-based repair.")
        return plan

    def _repair_plan_with_llm(self, plan: List[Dict[str, Any]], errors: List[str], goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Ask LLM to repair the plan based on validation errors"""
        
        # Identify the step to be repaired
        step_to_repair = None
        for error in errors:
            match = re.search(r"Step (\d+):", error)
            if match:
                step_number = int(match.group(1))
                for step in plan:
                    if step.get('number') == step_number:
                        step_to_repair = step
                        break
            if step_to_repair:
                break

        if not step_to_repair:
            logger.warning("Could not identify a single step to repair from errors. Sending the whole plan.")
            step_to_repair_json = json.dumps(plan, indent=2)
            prompt_type = "full_plan"
            plugin_guidance = "Schema for multiple steps is complex. Please refer to the full plan and error messages."
        else:
            step_to_repair_json = json.dumps(step_to_repair, indent=2)
            prompt_type = "single_step"
            
            # Get the plugin definition for the failed step
            action_verb = step_to_repair.get('actionVerb')
            available_plugins_wrapped = inputs.get('availablePlugins', {"value": []})
            available_plugins = available_plugins_wrapped.get('value', [])
            plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
            plugin_definition = plugin_map.get(action_verb)

            plugin_guidance = ""
            if plugin_definition:
                guidance_lines = [f"Plugin Schema for '{action_verb}':"]
                description = plugin_definition.get('description', 'No description available.')
                input_definitions = plugin_definition.get('inputDefinitions', [])
                guidance_lines.append(f"  Description: {description}")
                if input_definitions:
                    guidance_lines.append("  Inputs Required:")
                    for input_def in input_definitions:
                        input_name = input_def.get('name', 'UNKNOWN')
                        input_desc = input_def.get('description', 'No description.')
                        value_type = input_def.get('valueType', 'any')
                        required = ' (required)' if input_def.get('required') else ''
                        guidance_lines.append(f"    - {input_name} (type: {value_type}){required}: {input_desc}")
                else:
                    guidance_lines.append("  Inputs: None required.")
                plugin_guidance = "\n".join(guidance_lines)
            else:
                plugin_guidance = f"No specific plugin schema found for action verb '{action_verb}'."

        errors_text = '\n'.join([f"- {error}" for error in errors])
        
        prompt = f"""You are an expert system for correcting JSON data that fails to conform to a schema.

**1. THE GOAL:**
---
{goal}
---

**2. THE INVALID JSON OBJECT:**
---
{step_to_repair_json}
---

**3. PLUGIN SCHEMA:**
---
{plugin_guidance}
---

**4. THE VALIDATION ERRORS:**
---
{errors_text}
---

**5. YOUR TASK:**
Your task is to fix the JSON object provided in section 2 to make it valid.
- **Analyze the error:** The error message in section 4 says required inputs are missing.
- **Consult the schema:** Look at the 'Inputs Required' in section 3 to see what the plugin needs.
- **Examine the invalid object:** Look at the 'inputs' in section 2.
- **Correct the object:** Modify the JSON object to include all required inputs with correct names and values/sources.

**CRITICAL REQUIREMENTS:**
- **JSON ONLY:** Your entire response MUST be a single, valid JSON object for the step.
- **NO EXTRA TEXT:** Do NOT include explanations, comments, or markdown like ` ```json `.
- **PRESERVE INTENT:** Fix ONLY the specific errors while preserving the plan's original intent.
- **IMPORTANT**: If an input has both `value` and `outputName`/`sourceStep`, choose the outputName and sourceStep if the 'sourceStep' does product the 'outputName'.

Return the corrected JSON object for the step:"""
        
        logger.info(f"🔧 Asking LLM to repair {prompt_type} with {len(errors)} validation errors...")

        max_attempts = 2
        for attempt in range(max_attempts):
            try:
                response = call_brain(prompt, inputs, "json")
                repaired_step = json.loads(response)

                if not isinstance(repaired_step, dict):
                    raise ValueError("LLM response is not a JSON object for a single step.")
                
                # Find the step to replace in the original plan
                for i, step in enumerate(plan):
                    if step.get('number') == repaired_step.get('number'):
                        plan[i] = repaired_step
                        logger.info(f"Successfully replaced step {repaired_step.get('number')} in the plan.")
                        return plan

                # If we couldn't find the step to replace, something is wrong
                logger.error(f"Could not find step {repaired_step.get('number')} to replace in the plan.")
                raise ValueError("Repaired step number does not match any existing step.")

            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"LLM repair JSON parsing failed on attempt {attempt + 1}: {e}")
                if attempt < max_attempts - 1:
                    continue
                else:
                    raise ReflectError(f"LLM repair produced invalid JSON after {max_attempts} attempts: {e}", "repair_error")
            except Exception as e:
                if attempt == max_attempts - 1:
                    raise ReflectError(f"LLM repair call failed after {max_attempts} attempts: {e}", "repair_call_error")
                logger.warning(f"LLM repair call failed on attempt {attempt + 1}: {e}, retrying...")
                continue
        
        # This line should be unreachable
        raise ReflectError("Unexpected LLM repair loop exit", "repair_error")


class ReflectHandler:
    """Handles reflection requests by generating schema-compliant plans"""

    def __init__(self):
        self.validator = PlanValidator()

    def handle(self, inputs: Dict[str, Any]) -> str:
        try:
            logger.info("ReflectHandler starting...")

            # Extract reflection information
            reflection_info = self._extract_reflection_info(inputs)

            # Get mission goal
            mission_goal = get_mission_goal(reflection_info.get("missionId"), inputs)
            if not mission_goal:
                mission_goal = "No mission goal provided"

            reflection_info["mission_goal"] = mission_goal

            # Ask Brain for reflection handling approach
            brain_response = self._ask_brain_for_reflection_handling(reflection_info, inputs)

            # Interpret and format response
            return self._format_response(brain_response, reflection_info, inputs)

        except Exception as e:
            logger.error(f"Reflection handling failed: {e}")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Reflection handling failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _extract_reflection_info(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Extract reflection information from inputs"""
        mission_id_input = inputs.get('missionId')
        if isinstance(mission_id_input, dict) and 'value' in mission_id_input:
            mission_id = str(mission_id_input['value']).strip()
        else:
            mission_id = str(mission_id_input).strip() if mission_id_input is not None else ''

        plan_history_input = inputs.get('plan_history')
        if isinstance(plan_history_input, dict) and 'value' in plan_history_input:
            plan_history = str(plan_history_input['value']).strip()
        else:
            plan_history = str(plan_history_input).strip() if plan_history_input is not None else ''

        work_products_input = inputs.get('work_products')
        if isinstance(work_products_input, dict) and 'value' in work_products_input:
            work_products = str(work_products_input['value']).strip()
        else:
            work_products = str(work_products_input).strip() if work_products_input is not None else ''

        question_input = inputs.get('question')
        if isinstance(question_input, dict) and 'value' in question_input:
            question = str(question_input['value']).strip()
        else:
            question = str(question_input).strip() if question_input is not None else ''

        logger.info(f"DEBUG REFLECT: mission_id = '{mission_id}' (type: {type(mission_id)})") # Add this line
        logger.info(f"DEBUG REFLECT: plan_history = '{plan_history[:50]}...' (type: {type(plan_history)})") # Add this line
        logger.info(f"DEBUG REFLECT: work_products = '{work_products[:50]}...' (type: {type(work_products)})") # Add this line
        logger.info(f"DEBUG REFLECT: question = '{question[:50]}...' (type: {type(question)})") # Add this line

        return {
            "missionId": mission_id,
            "plan_history": plan_history,
            "work_products": work_products,
            "question": question,
        }
    
    def _ask_brain_for_reflection_handling(self, reflection_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Ask Brain how to handle the reflection request"""
        mission_goal = reflection_info['mission_goal']
        plan_history = reflection_info['plan_history']
        work_products = reflection_info['work_products']
        question = reflection_info['question']
        mission_id = reflection_info['missionId']

        PLAN_ARRAY_SCHEMA = {
            "type": "array",
            "items": PLAN_STEP_SCHEMA,
            "description": "A list of sequential steps to accomplish a goal."
        }
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)

        prompt = f"""You are an expert system analyst for mission reflection and planning. A mission is in progress and needs reflection to determine next steps.

MISSION ID: {mission_id}
MISSION GOAL: {mission_goal}
PLAN HISTORY: {plan_history}
WORK PRODUCTS: {work_products}
REFLECTION QUESTION: {question}

PARENT STEP INPUTS: {json.dumps(inputs)}

Your task is to reflect on the mission progress and determine the best course of action. Consider these options in order of preference:

1.  **Provide a Direct Answer:** If the reflection question can be answered directly with the given context and the mission is complete or no further action is needed, provide a JSON object with a single key "direct_answer".
2.  **Create a Plan:** If the mission is NOT complete and requires multiple steps to achieve the remaining objectives, generate a new, concise plan to achieve the remaining objectives. The plan should be a JSON array of steps following the established schema.

**CRITICAL CONSTRAINTS:**
- You are an autonomous agent. Your primary goal is to solve problems independently.
- Do not use the `ASK_USER_QUESTION` verb to seek information from the user that can be found using other tools like `SEARCH` or `SCRAPE`. Your goal is to be resourceful and autonomous.
- If creating a plan, ensure it builds upon the existing plan history and work products.

**RESPONSE FORMATS:**

-   **For a Direct Answer:** {{"direct_answer": "Your answer here"}}
-   **For a Plan:** A JSON array of steps defined with the schema below.

Plan Schema
{schema_json}

- **CRITICAL for Plan Inputs, sourceStep:**
    - Step inputs are generally sourced from the outputs of other steps and less often fixed with constant values.
    - All inputs for each step must be explicitly defined either as a constant `value` or by referencing an `outputName` from a `sourceStep` within the plan or from the `PARENT STEP INPUTS`. Do not assume implicit data structures or properties of inputs.
    - Use `sourceStep: 0` ONLY for inputs that are explicitly provided in the "PARENT STEP INPUTS" section above.
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `number` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP" (using `sourceStep: 0`) or from an output of a previous step in the plan.
- **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.

CRITICAL: The actionVerb for each step MUST be a valid, existing plugin actionVerb (from the provided list) or a descriptive, new actionVerb (e.g., 'ANALYZE_DATA', 'GENERATE_REPORT'). It MUST NOT be 'UNKNOWN' or 'NOVEL_VERB'.
"""

        try:
            return call_brain(prompt, inputs, "json")
        except Exception as e:
            logger.error(f"Brain call failed for reflection: {e}")
            return json.dumps({"error": f"Brain call failed: {str(e)}"})

    def _clean_brain_response(self, response: str) -> str:
        """Clean Brain response by removing markdown code blocks and extra formatting"""
        if not response or not response.strip():
            return "{}"

        # Remove markdown code blocks
        response = response.strip()

        # Remove ```json and ``` markers
        if response.startswith('```json'):
            response = response[7:]  # Remove ```json
        elif response.startswith('```'):
            response = response[3:]   # Remove ```

        if response.endswith('```'):
            response = response[:-3]  # Remove trailing ```

        # Clean up whitespace
        response = response.strip()

        # If still empty, return empty object
        if not response:
            return "{}"

        return response

    def _format_response(self, brain_response: Any, reflection_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            # If brain_response is already a parsed JSON object
            if isinstance(brain_response, dict):
                response_data = brain_response
            else:
                # Clean and parse the response
                cleaned_response = self._clean_brain_response(brain_response)
                response_data = json.loads(cleaned_response)

            # Handle direct answer
            if "direct_answer" in response_data:
                return json.dumps([{ 
                    "success": True,
                    "name": "answer",
                    "resultType": "string",
                    "result": response_data["direct_answer"],
                    "resultDescription": "Reflection analysis complete",
                    "mimeType": "text/plain"
                }])

            # Handle plan
            elif isinstance(response_data, list) and len(response_data) > 0:
                # Validate and repair the plan
                goal = reflection_info['mission_goal']
                validated_plan = self.validator.validate_and_repair(response_data, goal, inputs)
                
                return json.dumps([{ 
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "result": validated_plan,
                    "resultDescription": "Generated new plan based on mission progress",
                    "mimeType": "application/json"
                }])

            else:
                # Fallback for unexpected response
                return json.dumps([{ 
                    "success": True,
                    "name": "answer",
                    "resultType": "string",
                    "result": json.dumps(response_data),
                    "resultDescription": "Unexpected but valid response format",
                    "mimeType": "application/json"
                }])

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Brain response as JSON: {e}")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Invalid JSON response: {str(e)}",
                "resultDescription": "Brain response parsing failed",
                "mimeType": "text/plain"
            }])
        except Exception as e:
            logger.error(f"Response formatting failed: {e}")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": str(e),
                "resultDescription": "Response formatting failed",
                "mimeType": "text/plain"
            }])

def reflect(inputs: Dict[str, Any]) -> str:
    """Main reflection logic."""
    try:
        handler = ReflectHandler()
        return handler.handle(inputs)
    except Exception as e:
        logger.error(f"REFLECT plugin failed: {e}")
        return json.dumps([{ 
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"REFLECT plugin failed: {str(e)}",
            "mimeType": "text/plain"
        }])

def main():
    """Main execution block."""
    try:
        input_str = sys.stdin.read()
        inputs = parse_inputs(input_str)
        result = reflect(inputs)
        print(result)
    except Exception as e:
        logger.error(f"REFLECT plugin execution failed: {e}")
        error_output = json.dumps([{ 
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"REFLECT plugin execution failed: {str(e)}",
            "mimeType": "text/plain"
        }])
        print(error_output)


if __name__ == "__main__":
    main()
