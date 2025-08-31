#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Streamlined Version
Handles mission planning and novel action verbs with LLM-driven approach
"""

import json
import logging
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

class AccomplishError(Exception):
    """Custom exception for ACCOMPLISH plugin errors"""
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
    raise AccomplishError("No authentication token found", "auth_error")

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
        brain_url = inputs.get('brain_url', {}).get('value', 'brain:5070')

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
            raise AccomplishError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'result' not in result:
            raise AccomplishError("Brain response missing result", "brain_response_error")

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
        raise AccomplishError(f"Brain service call failed: {e}", "brain_error")


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
                
                # Special handling for 'availablePlugins'
                if key == 'availablePlugins': # Removed isinstance(value, str)
                    if isinstance(value, dict) and 'value' in value: # Check if it's a serialized InputValue
                        inputs[key] = value['value'] # Extract the actual list of manifests
                    else:
                        inputs[key] = value # Keep as is if not the expected InputValue format
                else:
                    inputs[key] = value
            else:
                logger.warning(f"Skipping invalid input item: {item}")
        
        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
        
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise AccomplishError(f"Input validation failed: {e}", "input_error")

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
        
    def _validate_plan(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate plan structure and completeness"""
        errors = []
        logger.info("Starting plan validation...")

        if not isinstance(plan, list) or len(plan) == 0:
            return {'valid': False, 'errors': ['Plan must be a non-empty array']}
        
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}

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

            action_verb = step.get('actionVerb')
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
            validation_result = self._validate_plan(plan, inputs.get('availablePlugins', []))
            
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
                raise AccomplishError(
                    f"Plan validation failed after {self.max_retries} attempts. Last errors: {validation_result['errors']}", 
                    "validation_error"
                )
        
        raise AccomplishError("Unexpected validation loop exit", "validation_error")

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
            available_plugins = inputs.get('availablePlugins', [])
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
                    raise AccomplishError(f"LLM repair produced invalid JSON after {max_attempts} attempts: {e}", "repair_error")
            except Exception as e:
                if attempt == max_attempts - 1:
                    raise AccomplishError(f"LLM repair call failed after {max_attempts} attempts: {e}", "repair_call_error")
                logger.warning(f"LLM repair call failed on attempt {attempt + 1}: {e}, retrying...")
                continue
        
        # This line should be unreachable
        raise AccomplishError("Unexpected LLM repair loop exit", "repair_error")



class RobustMissionPlanner:
    """Streamlined LLM-driven mission planner"""
    
    def __init__(self):
        self.max_retries = 3
        self.max_llm_switches = 2
        self.validator = PlanValidator()
    
    def plan(self, inputs: Dict[str, Any]) -> str:
        """Main interface method - create plan and return as JSON string"""
        goal = inputs.get('goal', {}).get('value', '')
        if not goal:
            raise AccomplishError("Missing required 'goal' input", "input_error")
        
        plan = self.create_plan(goal, inputs)

        # Wrap the plan in the expected PluginOutput format
        plugin_output = {
            "success": True,
            "name": "plan",
            "resultType": "plan",
            "resultDescription": f"A plan to: {goal[:100]}{'...' if len(goal) > 100 else ''}",
            "result": plan,
            "mimeType": "application/json"
        }

        return json.dumps([plugin_output], indent=2)

    def _create_detailed_plugin_guidance(self, inputs: Dict[str, Any]) -> str:
        """Create a detailed list of available plugins with input specs and descriptions."""
        available_plugins = inputs.get('availablePlugins', [])
        if not available_plugins:
            return "No plugins are available for use in the plan."

        guidance_lines = ["Available Plugins & Input Specifications:"]
        for plugin in available_plugins:
            action_verb = plugin.get('actionVerb', 'UNKNOWN')
            description = plugin.get('description', 'No description available.')
            input_definitions = plugin.get('inputDefinitions', [])
            input_guidance = plugin.get('inputGuidance', '')

            guidance_lines.append(f"\nPlugin: {action_verb}")
            guidance_lines.append(f"  Description: {description}")
            if input_definitions:
                guidance_lines.append("  Inputs:")
                for input_def in input_definitions:
                    input_name = input_def.get('name', 'UNKNOWN')
                    input_desc = input_def.get('description', 'No description.')
                    value_type = input_def.get('valueType', 'any')
                    guidance_lines.append(f"    - {input_name} (type: {value_type}): {input_desc}")
            else:
                guidance_lines.append("  Inputs: None required.")
            guidance_lines.append(f"{input_guidance}")
        return "\n".join(guidance_lines)

    def _inject_progress_checks(self, plan: List[Dict[str, Any]], goal: str) -> List[Dict[str, Any]]:
        if not plan:
            return []

        # Add a single REFLECT step at the end of the plan.
        all_outputs = set()
        for step in plan:
            if 'outputs' in step and isinstance(step['outputs'], dict):
                all_outputs.update(step['outputs'].keys())

        completed_steps_summary = f"The following outputs have been produced: {', '.join(all_outputs)}"

        # Get the last step's outputs for dependency
        last_step = plan[-1]
        last_step_outputs = list(last_step.get('outputs', {}).keys())
        if not last_step_outputs:
            last_step_outputs = ["completion"]  # Fallback if no outputs defined
            
        reflection_question = (
            f"Analyze the effectiveness of the executed plan against the mission goal:\n"
            f"1. Have all objectives been met?\n"
            f"2. What specific outcomes were achieved?\n"
            f"3. What challenges or gaps emerged?\n"
            f"4. What adjustments or additional steps are needed?"
        )

        check_step = {
            "number": len(plan) + 1,
            "actionVerb": "REFLECT",
            "description": "Analyze mission progress and effectiveness, determine if goals were met, and recommend next steps.",
            "inputs": {
                "mission_goal": {"value": goal, "valueType": "string"},
                "plan_history": {
                    "outputName": last_step_outputs[0],
                    "sourceStep": last_step["number"],
                    "valueType": "string"
                },
                "work_products": {"value": completed_steps_summary, "valueType": "string"},
                "question": {"value": reflection_question, "valueType": "string"}
            },
            "outputs": {
                "analysis": "Detailed analysis of plan effectiveness and goal achievement",
                "recommendations": "Specific recommendations for next steps or adjustments",
                "status": "Mission status: complete, partially_complete, or needs_revision"
            }
        }
        
        plan.append(check_step)
        
        # Renumber all steps sequentially
        for i, step in enumerate(plan):
            step['number'] = i + 1

        return plan

    def create_plan(self, goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create a robust plan using a decoupled, multi-phase LLM approach with retries."""
        progress.checkpoint("planning_start")
        logger.info(f"🎯 Creating plan for goal: {goal[:100]}...")

        try:
            prose_plan = self._get_prose_plan(goal, inputs)
        except Exception as e:
            logger.exception(f"❌ Failed to generate prose plan after all retries: {e}") # Changed to logger.exception
            raise AccomplishError(f"Could not generate a prose plan: {e}", "prose_plan_error")

        try:
            structured_plan = self._convert_to_structured_plan(prose_plan, goal, inputs)
        except Exception as e:
            logger.exception(f"❌ Failed to convert prose plan to structured JSON after all retries: {e}") # Changed to logger.exception
            raise AccomplishError(f"Could not convert prose to structured plan: {e}", "json_conversion_error")

        try:
            validated_plan = self.validator.validate_and_repair(structured_plan, goal, inputs)
            logger.info(f"✅ Successfully created and validated plan with {len(validated_plan)} steps")
        except Exception as e:
            logger.exception(f"❌ Failed to validate and repair the plan after all retries: {e}") # Changed to logger.exception
            raise AccomplishError(f"Could not validate or repair the plan: {e}", "validation_error")

        try:
            plan_with_checks = self._inject_progress_checks(validated_plan, goal)
            logger.info(f"✅ Successfully injected progress checks, new plan has {len(plan_with_checks)} steps")
            return plan_with_checks
        except Exception as e:
            logger.exception(f"❌ Failed to inject progress checks: {e}") # Changed to logger.exception
            return validated_plan


    def _get_prose_plan(self, goal: str, inputs: Dict[str, Any]) -> str:
        """Phase 1: Get a well-thought prose plan from LLM with retries."""
        logger.info("🧠 Phase 1: Requesting prose plan from LLM...")

        # Create the prompt for prose plan generation
        plugin_guidance = self._create_detailed_plugin_guidance(inputs)
        context = inputs.get('context', {}).get('value', '')
        prompt = f"""You are an expert strategic planner. Create a comprehensive, well-thought plan to accomplish this goal:

GOAL: {goal}

{plugin_guidance}

CONTEXT:
{context}

Write a detailed prose plan (3-5 paragraphs) that thoroughly explains:
- The strategic approach you would take
- The key phases or areas of work
- The specific actions and research needed
- How LLMs can be used in this effort
- How the pieces fit together
- Why this approach will achieve the goal

Be specific, actionable, and comprehensive. Think deeply about THIS specific goal.

IMPORTANT: Return ONLY plain text for the plan. NO markdown formatting, NO code blocks, NO special formatting.
"""

        # Retry logic for getting the prose plan
        for attempt in range(self.max_retries):
            try:
                response = call_brain(prompt, inputs, "text")
                if not response or len(response.strip()) < 100:
                    logger.warning(f"Attempt {attempt + 1}: LLM returned an insufficient prose plan.")
                    continue # Retry on insufficient content
                
                logger.info(f"✅ Received prose plan ({len(response)} chars)")
                return response.strip()
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} to get prose plan failed: {e}")
                if attempt == self.max_retries - 1:
                    raise # Re-raise the last exception if all retries fail
        
        raise AccomplishError("Could not generate a valid prose plan after multiple attempts.", "prose_plan_error")
    
    def _convert_to_structured_plan(self, prose_plan: str, goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 2: Convert prose plan to structured JSON with retries."""
        logger.info("🔧 Phase 2: Converting to structured JSON...")

        plugin_guidance = self._create_detailed_plugin_guidance(inputs)
        # Define the schema for the entire plan (an array of steps)
        PLAN_ARRAY_SCHEMA = {
            "type": "array",
            "items": PLAN_STEP_SCHEMA,
            "description": "A list of sequential steps to accomplish a goal."
        }
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)

        # Example of a multi-step plan to guide the LLM
        example_plan = [
            {
                "number": 1,
                "actionVerb": "RESEARCH",
                "inputs": {
                    "topic": {"value": "latest AI trends", "valueType": "string"}
                },
                "description": "Research current trends in AI.",
                "outputs": {"research_results": "Summary of AI trends"},
                "recommendedRole": "Researcher"
            },
            {
                "number": 2,
                "actionVerb": "ANALYZE",
                "inputs": {
                    "data": {"outputName": "research_results", "sourceStep": 1}
                },
                "description": "Analyze the research findings.",
                "outputs": {"analysis_report": "Report on key findings"},
                "recommendedRole": "Analyst"
            }
        ]
        example_plan_json = json.dumps(example_plan, indent=2)
        
        prompt = f"""You are an expert system for converting prose plans into structured JSON according to a strict schema.

**1. THE GOAL:**
---
{goal}
---

**2. THE PROSE PLAN:**
---
{prose_plan}
---

**3. THE JSON SCHEMA FOR THE ENTIRE PLAN (ARRAY OF STEPS):**
---
{schema_json}
---

**4. EXAMPLE OF A VALID MULTI-STEP PLAN:**
---
{example_plan_json}
---

**5. YOUR TASK:**
Follow these steps to create the final JSON output:

**STEP A: Internal Analysis & Self-Correction (Your Internal Monologue)**
1.  **Analyze:** Read the Goal and Prose Plan to fully understand the user's intent and the required sequence of actions.
2.  **Verify Schema:** Carefully study the JSON SCHEMA. Your output must follow it perfectly.
3.  **Restate the Plan as Explicit Steps:** Identify a list of steps that will be taken to achieve the Goal. Each Step should be a clear, actionable task with one or more outputs.
4.  **Check Dependencies:** For each step, ensure its `inputs` that depend on previous steps correctly reference the `outputName` and `sourceStep`.
5.  **Validate Inputs:** Ensure every input for each step is properly defined and has either a static literal `value` or a dynamic `outputName` and `sourceStep` reference from a prior step.
6.  **Final Check:** Before generating the output, perform a final check to ensure the entire JSON structure is valid and fully compliant with the schema.

**STEP B: Generate Final JSON (Your Final Output)**
After your internal analysis and self-correction is complete, provide ONLY the final, valid JSON array of steps.

**CRITICAL DEPENDENCY RULES:**
- **Multi-step plans are essential:** Break down complex goals into multiple, sequential steps.
- **Dependencies are crucial for flow:** Every step that uses an output from a previous step MUST declare that dependency in its `inputs` object using `outputName` and `sourceStep`.
- **Prioritize autonomous information gathering:** Use tools like SEARCH, SCRAPE, DATA_TOOLKIT, TEXT_ANALYSIS, TRANSFORM, and FILE_OPERATION to gather information and perform tasks.
- **Avoid unnecessary ASK_USER_QUESTION:** Only use 'ASK_USER_QUESTION' for subjective opinions, permissions, or clarification). Do NOT use it for delegating research or data collection that the agent can perform.
- **CRITICAL for recommendedRole:** The `recommendedRole` field MUST be one of the following exact values: 'Coordinator', 'Researcher', 'Coder', 'Creative', 'Critic', 'Executor', 'Domain Expert'. Ensure strict adherence to these values.
- **CRITICAL for sourceStep:**
    - Use `sourceStep: 0` ONLY for inputs that are explicitly provided in the initial mission context (the "PARENT STEP INPUTS" section if applicable, or the overall mission goal).
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `number` of that preceding step.
    - Every input in your plan MUST be resolvable either from the initial mission context (using `sourceStep: 0`) or from an output of a previous step in the plan.
- **For 'THINK' actionVerb:** The `inputs` for 'THINK' MUST include a `prompt` field with a string value that clearly states the thinking task.
- **Example for `sourceStep`:** If Step 2 needs `research_results` from Step 1, and Step 1 outputs `{{ "research_results": "..." }}`, then Step 2's inputs would be `{{ "research": {{'outputName': "research_results", "sourceStep": 1, "valueType": "string"}} }}`.
- **Completeness:** The generated plan must be a complete and executable plan that will fully accomplish the goal. It should not be a partial plan or an outline. It should include all the necessary steps to produce the final deliverables.
- **Iterative Processes/Feedback Loops:** If the prose plan describes a continuous feedback loop, iterative process, or any form of repetition, you MUST translate this into an appropriate looping construct (e.g., using 'WHILE', 'REPEAT', or 'FOREACH' actionVerbs) within the JSON plan. Do not simply list the steps once if they are intended to be repeated.

{plugin_guidance}
"""

        for attempt in range(self.max_retries):
            try:
                response = call_brain(prompt, inputs, "json")
                plan = json.loads(response)
                
                if isinstance(plan, list):
                    logger.info(f"✅ Received structured plan with {len(plan)} steps")
                    return plan
                else:
                    logger.warning(f"Attempt {attempt + 1}: Response is not a JSON array. Response: {response}")
                    continue

            except json.JSONDecodeError as e:
                logger.warning(f"Attempt {attempt + 1}: JSON parsing failed: {e}. Response: {response}")
                if attempt == self.max_retries - 1:
                    raise AccomplishError(f"Failed to parse structured plan JSON: {e}", "json_parse_error")
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}: Brain call for JSON conversion failed: {e}")
                if attempt == self.max_retries - 1:
                    raise # Re-raise the last exception

        raise AccomplishError("Could not generate a valid structured plan after multiple attempts.", "json_conversion_error")
    

class NovelVerbHandler:
    """Handles novel action verbs by recommending plugins or providing direct answers"""

    def __init__(self):
        self.validator = PlanValidator()
        self.goal_planner = RobustMissionPlanner()

    def handle(self, inputs: Dict[str, Any]) -> str:
        try:
            logger.info("NovelVerbHandler starting...")

            # Extract verb information
            verb_info = self._extract_verb_info(inputs)

            # Ask Brain for handling approach
            brain_response = self._ask_brain_for_verb_handling(verb_info, inputs)

            # Interpret and format response
            return self._format_response(brain_response, verb_info, inputs)

        except Exception as e:
            logger.error(f"Novel verb handling failed: {e}")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Novel verb handling failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _extract_verb_info(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Extract verb information from inputs"""
        if 'novel_actionVerb' in inputs:
            novel_verb_data = inputs['novel_actionVerb']

            # Ensure novel_verb_data is a dictionary if it's a list of lists
            if isinstance(novel_verb_data, list):
                temp_dict = {}
                for item in novel_verb_data:
                    if isinstance(item, list) and len(item) == 2:
                        temp_dict[item[0]] = item[1]
                    else:
                        logger.warning(f"Skipping invalid item in novel_actionVerb list: {item}")
                novel_verb_data = temp_dict
            
            # Now novel_verb_data should be a dictionary or already was
            if isinstance(novel_verb_data, dict):
                if 'value' in novel_verb_data and isinstance(novel_verb_data['value'], dict):
                    # Structured format from CapabilitiesManager
                    verb_info = novel_verb_data['value']
                    return {
                        "id": verb_info.get('id', 'novel_plugin'),
                        "verb": verb_info.get('verb', 'NOVEL_VERB'),
                        "description": verb_info.get('description', ''),
                        "context": verb_info.get('context', ''),
                        "inputValues": verb_info.get('inputValues', {}),
                        "outputs": {},
                    }
                else:
                    # Legacy string format or direct string value
                    goal_text = novel_verb_data.get('value', '') if isinstance(novel_verb_data, dict) else novel_verb_data
                    return {
                        "id": "novel_plugin",
                        "verb": "NOVEL_VERB",
                        "description": str(goal_text), # Ensure it's a string
                        "context": str(goal_text),    # Ensure it's a string
                        "inputValues": {},
                        "outputs": {}
                    }
            else:
                logger.warning(f"novel_actionVerb is neither a dict nor a list: {type(novel_verb_data)}")

        # Fallback
        return {
            "id": "novel_plugin",
            "verb": "NOVEL_VERB",
            "description": "A novel plugin.",
            "context": "",
            "inputValues": {},
            "outputs": {}
        }
    
    def _ask_brain_for_verb_handling(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Ask Brain how to handle the novel verb"""
        verb = verb_info['verb']
        description = verb_info.get('description', 'No description provided')
        context = verb_info.get('context', description)
        PLAN_ARRAY_SCHEMA = {
            "type": "array",
            "items": PLAN_STEP_SCHEMA,
            "description": "A list of sequential steps to accomplish a goal."
        }
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)

        prompt = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported.

VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}

PARENT STEP INPUTS: {json.dumps(inputs)}

Your task is to determine the best way to accomplish the goal of the novel verb "{verb}". Consider these options in order of preference:

1.  **Provide a Direct Answer:** If the task is simple enough to be answered directly with the given context and available tools, provide a JSON object with a single key "direct_answer".
2.  **Create a Plan:** If the task is complex and requires multiple steps, breaking it down into a sequence of actions using available tools, then create a plan. The plan should be a JSON array of steps. This is the preferred option for complex tasks that can be broken down.
3.  **Recommend a Plugin:** If the task requires a new, complex, and reusable capability that is not covered by existing tools and would be beneficial for future use, recommend the development of a new plugin by providing a JSON object with a "plugin" key.

**CRITICAL CONSTRAINTS:**
- You MUST NOT use the novel verb "{verb}" in your plan.
- You are an autonomous agent. Your primary goal is to solve problems independently.
- Do not use the `ASK_USER_QUESTION` verb to seek information from the user that can be found using other tools like `SEARCH` or `SCRAPE`. Your goal is to be resourceful and autonomous.

**RESPONSE FORMATS:**

-   **For a Plan:** A JSON array of steps defined with the schema below.
-   **For a Direct Answer:** {{"direct_answer": "Your answer here"}}
-   **For a Plugin Recommendation:** {{"plugin": {{"id": "new_plugin_id", "description": "Description of the new plugin"}}}}

Plan Schema
"{schema_json}"

- **CRITICAL for Plan Inputs, sourceStep:**
    - Step inputs are generally sourced from the outputs of other steps and less often fixed with constant values.
    - All inputs for each step must be explicitly defined either as a constant `value` or by referencing an `outputName` from a `sourceStep` within the plan or from the `PARENT STEP INPUTS`. Do not assume implicit data structures or properties of inputs.
    - Use `sourceStep: 0` ONLY for inputs that are explicitly provided in the "PARENT STEP INPUTS" section above.
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `number` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP INPUT" (using `sourceStep: 0`) or from an output of a previous step in the plan.
- **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.

CRITICAL: Respond with ONLY valid JSON in one of the three formats above. NO markdown, NO code blocks, NO extra text.
"""

        try:
            return call_brain(prompt, inputs, "json")
        except Exception as e:
            logger.error(f"Brain call failed for novel verb '{verb}': {e}")
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

    def _format_response(self, brain_response: Any, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            # If brain_response is already a parsed JSON object/array, use it directly
            # Otherwise, attempt to parse it as JSON
            if isinstance(brain_response, (dict, list)):
                data = brain_response
            else:
                # Attempt to clean and parse if it's a string
                cleaned_response = self._clean_brain_response(str(brain_response))
                data = json.loads(cleaned_response)

            if isinstance(data, list): # This is a plan
                # Validate and repair the plan
                validated_plan = self.validator.validate_and_repair(data, verb_info['description'], inputs)
                
                # Save the generated plan to Librarian
                # self._save_plan_to_librarian(verb_info['verb'], validated_plan, inputs)

                return json.dumps([{ 
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'",
                    "result": validated_plan,
                    "mimeType": "application/json"
                }])
            elif isinstance(data, dict): # Could be direct answer or plugin recommendation
                if "direct_answer" in data:
                    return json.dumps([{ 
                        "success": True,
                        "name": "direct_answer",
                        "resultType": "direct_answer",
                        "resultDescription": f"Direct answer for {verb_info['verb']}",
                        "result": data["direct_answer"],
                        "mimeType": "application/json"
                    }])
                elif "plugin" in data:
                    plugin_data = data["plugin"]
                    return json.dumps([{ 
                        "success": True,
                        "name": "plugin",
                        "resultType": "plugin",
                        "resultDescription": f"Plugin recommended: {plugin_data.get('id', 'unknown')}",
                        "result": plugin_data,
                        "mimeType": "application/json"
                    }])
                # If the dictionary is a single step, treat it as a plan with one step
                elif "actionVerb" in data and "number" in data:
                    validated_plan = self.validator.validate_and_repair([data], verb_info['description'], inputs)
                    # self._save_plan_to_librarian(verb_info['verb'], validated_plan, inputs)
                    return json.dumps([{
                        "success": True,
                        "name": "plan",
                        "resultType": "plan",
                        "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'",
                        "result": validated_plan,
                        "mimeType": "application/json"
                    }])
                else:
                    # Unexpected dictionary format
                    return json.dumps([{ 
                        "success": False,
                        "name": "error",
                        "resultType": "error",
                        "resultDescription": "Unexpected Brain response format (dictionary)",
                        "result": data,
                        "mimeType": "application/json"
                    }])
            else:
                # Truly unexpected format (e.g., non-JSON string that wasn't caught by _clean_brain_response)
                return json.dumps([{ 
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Unexpected Brain response format (non-JSON or unhandled type)",
                    "result": str(brain_response),
                    "mimeType": "text/plain"
                }])

        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse or process Brain response in _format_response: {e}")
            logger.error(f"Raw Brain response (type: {type(brain_response)}): {str(brain_response)[:500]}...")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Failed to process Brain response: {str(e)}",
                "result": str(brain_response),
                "mimeType": "text/plain"
            }])

    def _save_plan_to_librarian(self, verb: str, plan_data: List[Dict[str, Any]], inputs: Dict[str, Any]):
        """Saves the generated plan to the Librarian service."""
        try:
            auth_token = get_auth_token(inputs)
            librarian_url = inputs.get('librarian_url', {}).get('value', 'librarian:5040')
            
            payload = {
                "key": verb,
                "data": plan_data,
                "collection": 'actionPlans', 
                "storageType": 'mongo' 
            }
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {auth_token}'
            }
            
            logger.info(f"Attempting to save plan for verb '{verb}' to Librarian at: http://{librarian_url}/storeData")
            response = requests.post(
                f"http://{librarian_url}/storeData",
                json=payload,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully saved plan for verb '{verb}' to Librarian.")
            else:
                logger.error(f"Failed to save plan for verb '{verb}' to Librarian: {response.status_code} - {response.text}")
        except Exception as e:
            logger.error(f"Error saving plan for verb '{verb}' to Librarian: {e}")

class AccomplishOrchestrator:
    """Main orchestrator for ACCOMPLISH plugin"""

    def __init__(self):
        self.goal_planner = RobustMissionPlanner()
        self.novel_verb_handler = NovelVerbHandler()

    def execute(self, inputs_str: str) -> str:
        """Main execution method"""
        progress.checkpoint("orchestrator_execute_start")
        logger.info("ACCOMPLISH orchestrator starting...")

        try:
            # Parse inputs
            inputs = parse_inputs(inputs_str)
            progress.checkpoint("input_processed")

            # Route to appropriate handler
            if self._is_novel_verb_request(inputs):
                logger.info("Novel verb handling detected. Routing to NovelVerbHandler.")
                return self.novel_verb_handler.handle(inputs)
            else:
                logger.info("Mission goal planning detected. Routing to RobustMissionPlanner.")
                return self.goal_planner.plan(inputs)

        except Exception as e:
            logger.error(f"ACCOMPLISH execution failed: {e}")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"ACCOMPLISH execution failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _is_novel_verb_request(self, inputs: Dict[str, Any]) -> bool:
        """Check if this is a novel verb request"""
        return 'novel_actionVerb' in inputs

def main():
    """
    Main function to run the ACCOMPLISH plugin.
    Reads input from stdin, executes the orchestrator, and prints the result.
    """
    progress.checkpoint("main_start")
    logger.info("ACCOMPLISH plugin starting...")

    try:
        orchestrator = AccomplishOrchestrator()
        progress.checkpoint("orchestrator_created")

        # Read input from stdin
        import sys
        input_data = sys.stdin.read()
        progress.checkpoint("input_read")
        
        if not input_data:
            logger.warning("Input data is empty. Exiting.")
            return

        logger.info(f"Input received: {len(input_data)} characters")

        # Execute
        result = orchestrator.execute(input_data)

        # Output result
        print(result)
        progress.checkpoint("execution_complete")

    except json.JSONDecodeError as e:
        logger.error(f"ACCOMPLISH plugin failed due to JSON decoding error: {e}")
        error_result = json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": f"Invalid JSON input: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)
    except AccomplishError as e:
        logger.error(f"ACCOMPLISH plugin failed with a known error: {e}")
        error_result = json.dumps([{
            "success": False,
            "name": "error",
            "resultType": e.error_type,
            "resultDescription": f"ACCOMPLISH plugin failed: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)
    except Exception as e:
        logger.error(f"An unexpected error occurred in ACCOMPLISH plugin: {e}", exc_info=True)
        error_result = json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "unexpected_error",
            "resultDescription": f"An unexpected error occurred: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)

# Main execution
if __name__ == "__main__":
    main()