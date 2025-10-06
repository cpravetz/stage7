#!/usr/bin/env python3

import json
import logging
import re
import copy
from typing import Dict, Any, List, Optional, Set

logger = logging.getLogger(__name__)

class AccomplishError(Exception):
    """Custom exception for ACCOMPLISH plugin errors"""
    def __init__(self, message: str, error_type: str = "general_error"):
        super().__init__(message)
        self.error_type = error_type

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
            "description": "Suggested role type for the agent executing this step. Allowed values are Coordinator, Researcher, Coder, Creative, Critic, Executor, and Domain Expert"
        }
    },
    "required": ["number", "actionVerb", "inputs", "description", "outputs"],
    "additionalProperties": False
    }
}

PLAN_ARRAY_SCHEMA = {
    "type": "array",
    "items": PLAN_STEP_SCHEMA,
    "description": "A list of sequential steps to accomplish a goal."
}

class PlanValidator:
    """Handles validation and repair of plans."""
    def __init__(self, max_retries: int = 3, brain_call=None):
        self.max_retries = max_retries
        self.brain_call = brain_call

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
        
    def _find_max_step_number(self, plan: List[Dict[str, Any]]) -> int:
        max_num = 0
        for step in plan:
            if isinstance(step, dict):
                num = step.get('number', 0)
                if num > max_num:
                    max_num = num

                sub_plan = None
                if 'steps' in step and isinstance(step['steps'], list):
                    sub_plan = step['steps']
                elif 'steps' in step.get('inputs', {}) and isinstance(step['inputs']['steps'], dict) and 'value' in step['inputs']['steps'] and isinstance(step['inputs']['steps']['value'], list):
                    sub_plan = step['inputs']['steps']['value']

                if sub_plan:
                    sub_max = self._find_max_step_number(sub_plan)
                    if sub_max > max_num:
                        max_num = sub_max
        return int(max_num)

    def _collect_all_step_numbers(self, plan: List[Dict[str, Any]]) -> Dict[int, int]:
        """Collect all step numbers from the plan and sub-plans, returning a count of each number."""
        step_counts = {}

        for step in plan:
            if isinstance(step, dict):
                num = step.get('number')
                if num is not None:
                    step_counts[num] = step_counts.get(num, 0) + 1

                # Recursively check sub-plans
                sub_plan = None
                if 'steps' in step and isinstance(step['steps'], list):
                    sub_plan = step['steps']
                elif 'steps' in step.get('inputs', {}) and isinstance(step['inputs']['steps'], dict) and 'value' in step['inputs']['steps'] and isinstance(step['inputs']['steps']['value'], list):
                    sub_plan = step['inputs']['steps']['value']

                if sub_plan:
                    sub_counts = self._collect_all_step_numbers(sub_plan)
                    for sub_num, sub_count in sub_counts.items():
                        step_counts[sub_num] = step_counts.get(sub_num, 0) + sub_count

        return step_counts

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any], attempt: int = 1, previous_errors: List[str] = []) -> List[Dict[str, Any]]:
        """Phase 3: Validate and repair plan if needed, with retries, using a recursive approach."""
        logger.info(f"--- Starting Validation Attempt {attempt}/{self.max_retries} ---")

        if attempt > self.max_retries:
            raise AccomplishError(
                f"Plan validation failed after {self.max_retries} attempts. Last errors: {previous_errors}",
                "validation_error"
            )

        # Always run code-based repair first
        current_plan = self._repair_plan_code_based(plan)
        
        available_plugins_raw = inputs.get('availablePlugins', [])
        if isinstance(available_plugins_raw, str):
            try:
                available_plugins_raw = json.loads(available_plugins_raw)
            except json.JSONDecodeError:
                available_plugins_raw = []
        if isinstance(available_plugins_raw, dict):
            available_plugins = available_plugins_raw.get('value', [])
        else:
            available_plugins = available_plugins_raw if isinstance(available_plugins_raw, list) else []
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
        current_plan = self._repair_data_type_mismatches(current_plan, plugin_map)
        self._current_plan = current_plan

        available_plugins_raw = inputs.get('availablePlugins', [])
        if isinstance(available_plugins_raw, str):
            try:
                available_plugins_raw = json.loads(available_plugins_raw)
            except json.JSONDecodeError:
                available_plugins_raw = []
        if isinstance(available_plugins_raw, dict):
            available_plugins = available_plugins_raw.get('value', [])
        else:
            available_plugins = available_plugins_raw if isinstance(available_plugins_raw, list) else []

        validation_result = self._validate_plan(current_plan, available_plugins)

        # Handle wrappable errors first
        wrappable_errors = validation_result.get('wrappable_errors', [])
        if wrappable_errors:
            logger.info(f"Found {len(wrappable_errors)} steps to wrap. Applying first one: {wrappable_errors[0]}")
            error_to_fix = wrappable_errors[0]
            step_to_wrap = next((s for s in current_plan if s.get('number') == error_to_fix['step_number']), None)
            
            if step_to_wrap:
                modified_plan = self._wrap_step_in_foreach(
                    current_plan,
                    step_to_wrap,
                    error_to_fix['source_step_number'],
                    error_to_fix['source_output_name'],
                    error_to_fix['target_input_name']
                )
                
                logger.info("Re-validating plan after FOREACH wrapping...")
                return self.validate_and_repair(modified_plan, goal, inputs, attempt + 1, validation_result['errors'])

        # Handle other validation errors
        if validation_result['valid']:
            logger.info("Plan validation successful")
            return current_plan

        # Check if we have actual errors to fix
        actual_errors = validation_result['errors']
        if not actual_errors:
            # If validation failed but no specific errors were captured, this indicates a logic bug
            # Log this case and treat it as successful since we can't repair unknown issues
            logger.warning(f"Attempt {attempt}: Plan validation failed but no specific errors were reported. "
                         f"This may indicate a validation logic issue. Treating as successful.")
            return current_plan

        logger.warning(f"Attempt {attempt}: Plan validation failed with errors: {actual_errors}")

        # Try to repair with LLM
        try:
            repaired_plan = self._repair_plan_with_llm(current_plan, actual_errors, goal, inputs, previous_errors)
            # After LLM repair, re-validate recursively
            return self.validate_and_repair(repaired_plan, goal, inputs, attempt + 1, actual_errors)
        except Exception as e:
            logger.error(f"LLM repair failed on attempt {attempt}: {e}")
            # If LLM repair fails, we still raise the final exception outside the loop
            raise AccomplishError(
                f"Plan validation failed after {self.max_retries} attempts. Last errors: {actual_errors}",
                "validation_error"
            )
        
    def _resolve_placeholder_to_reference(self, current_plan: List[Dict[str, Any]], current_step_number: int, placeholder_string: str) -> Optional[tuple[str, int, str]]:
        """
        Resolves a placeholder string (e.g., "{output_name}" or "[output_name]") to a tuple
        of (output_name, source_step_number, value_type) by searching previous steps.
        """
        # Match either {name} or [name] patterns
        match = re.match(r"[{[]([a-zA-Z0-9_]+)[}\]]", placeholder_string)
        if not match:
            return None
        
        output_name = match.group(1)
        
        # Search backward through the plan for the output
        for i in range(current_step_number - 1, -1, -1):
            if i == 0: # Special case for parent input
                # We can't determine the parent's output type here, assume string for now
                # This might need more sophisticated handling if parent inputs have diverse types
                return (output_name, 0, "string") 

            prev_step = current_plan[i-1] # Adjust index for 0-based list
            if 'outputs' in prev_step and output_name in prev_step['outputs']:
                # Found the output in a previous step
                # The actual valueType would be from the plugin's outputDefinition,
                # but we don't have that here. Default to 'string' or 'any'.
                return (output_name, prev_step['number'], "string") 
        
        return None

    def _find_embedded_references(self, value: str) -> Set[str]:
        """
        Find all embedded references in a string value (e.g., {output_name} or [output_name]).
        Returns a set of output names that are referenced.
        """
        # Match both {name} and [name] patterns
        matches = re.findall(r'[{[]([a-zA-Z0-9_]+)[}\]]', value)
        return set(matches)
    
    def _validate_embedded_references(self, step: Dict[str, Any], inputs: Dict[str, Any], available_outputs: Dict[int, Set[str]], errors: List[str]):
        """
        Handle embedded references in input values: add missing inputs if source is known, otherwise error.
        """
        step_number = step.get('number', 0)

        for input_name, input_def in list(inputs.items()):
            # Only check string values for embedded references
            if not isinstance(input_def, dict) or 'value' not in input_def:
                continue

            value = input_def.get('value')
            if not isinstance(value, str):
                continue

            # Find all embedded references in the value
            referenced_outputs = self._find_embedded_references(value)

            # Check each referenced output is properly declared as an input
            for ref_output in referenced_outputs:
                # Skip if this output name is already properly declared as an input
                if ref_output in inputs and (
                    ('outputName' in inputs[ref_output] and 'sourceStep' in inputs[ref_output]) or
                    ('value' in inputs[ref_output] and 'valueType' in inputs[ref_output])
                ):
                    continue

                # Find which previous step produces this output
                found_source = False
                for source_step in range(step_number - 1, -1, -1):
                    if source_step in available_outputs and ref_output in available_outputs[source_step]:
                        if ref_output not in inputs:
                            inputs[ref_output] = {"outputName": ref_output, "sourceStep": source_step}
                        found_source = True
                        break

                if not found_source:
                    errors.append(
                        f"Step {step_number}: Input '{input_name}' contains embedded reference '{{{ref_output}}}' " +
                        f"but cannot find the source of {ref_output} and that's what the LLM needs to help with"
                    )

    def _repair_plan_code_based(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Automatically repair common schema violations in the plan."""
        logger.info("[Repair] Starting code-based repair...")
        
        if not isinstance(plan, list):
            logger.warning("Plan is not a list. Cannot repair.")
            return []

        for i, step in enumerate(plan):
            if not isinstance(step, dict):
                logger.warning("Step is not a dictionary. Skipping.")
                continue

            current_step_number = step.get('number')
            if current_step_number is None:
                logger.warning(f"Step {i+1}: Missing 'number' field. Cannot process inputs for this step.")
                continue

            # Ensure 'number' is an integer
            if 'number' in step:
                if not isinstance(step['number'], int):
                    try:
                        # Attempt conversion to integer
                        converted_number = int(step['number'])
                        step['number'] = converted_number
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Failed to convert step number '{step['number']}' to integer: {e}. Setting to None.")
                        step['number'] = None # Set to None instead of deleting
                # If it's already an int, do nothing.
                # If it's None (from a previous failed conversion), it will be handled by _validate_plan

            # Repair inputs
            if 'inputs' in step and isinstance(step['inputs'], dict):
                for input_name, input_def in step['inputs'].items():
                    if isinstance(input_def, dict):
                        has_output_name = 'outputName' in input_def
                        has_source_step = 'sourceStep' in input_def
                        has_value = 'value' in input_def

                        if has_output_name and has_source_step:
                            # Dependent input: only allow outputName, sourceStep, and args
                            allowed_keys = ['outputName', 'sourceStep', 'args', 'valueType'] # Keep valueType for dependent inputs
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
                                

            # Repair 'steps' input for SEQUENCE, WHILE, UNTIL, FOREACH verbs
            if step.get('actionVerb') in ['SEQUENCE', 'WHILE', 'UNTIL', 'FOREACH'] and \
               'steps' in step.get('inputs', {}) and \
               isinstance(step['inputs']['steps'], dict) and \
               'value' in step['inputs']['steps'] and \
               isinstance(step['inputs']['steps']['value'], str):
                
                steps_input = step['inputs']['steps']
                original_value = steps_input['value']
                
                try:
                    # Attempt to parse as JSON array
                    parsed_steps = json.loads(original_value)
                    if isinstance(parsed_steps, list):
                        steps_input['value'] = parsed_steps
                        steps_input['valueType'] = "array"
                        logger.info(f"[Repair] Step {current_step_number}: Converted 'steps' input from JSON string to array for {step.get('actionVerb')}.")
                    else:
                        raise ValueError("Not a JSON array")
                except (json.JSONDecodeError, ValueError):
                    # If not a valid JSON array, wrap it in a THINK step
                    logger.warning(f"[Repair] Step {current_step_number}: 'steps' input for {step.get('actionVerb')} is a non-JSON string. Wrapping in THINK step.")
                    steps_input['value'] = [{
                        "number": float(f"{current_step_number}.1"), # Use float for sub-step numbering
                        "actionVerb": "THINK",
                        "description": original_value,
                        "inputs": {},
                        "outputs": {},
                        "recommendedRole": "Coordinator" # Default role
                    }]
                    steps_input['valueType'] = "array"

            # Handle control flow steps with direct 'steps' property (should be in inputs.steps.value)
            if (step.get('actionVerb') in ['SEQUENCE', 'WHILE', 'UNTIL', 'FOREACH'] and
                'steps' in step and isinstance(step['steps'], list)):

                logger.info(f"[Repair] Step {current_step_number}: Moving direct 'steps' property to 'inputs.steps.value' for {step.get('actionVerb')}.")

                # Ensure inputs exists
                if 'inputs' not in step:
                    step['inputs'] = {}

                # Move steps to proper location
                step['inputs']['steps'] = {
                    'value': step['steps'],
                    'valueType': 'array'
                }

                # Remove the direct steps property
                del step['steps']

            # Recursively repair sub-plans
            if 'steps' in step and isinstance(step['steps'], list):
                logger.info(f"[Repair] Recursively repairing sub-plan in step {step.get('number')}")
                step['steps'] = self._repair_plan_code_based(step['steps'])
            elif 'inputs' in step and 'steps' in step['inputs'] and isinstance(step['inputs']['steps'], dict) and 'value' in step['inputs']['steps'] and isinstance(step['inputs']['steps']['value'], list):
                logger.info(f"[Repair] Recursively repairing sub-plan in step {step.get('number')} inputs.steps.value")
                step['inputs']['steps']['value'] = self._repair_plan_code_based(step['inputs']['steps']['value'])
                
        logger.info(f"[Repair] Finished code-based repair.")
        return plan

    def _repair_data_type_mismatches(self, plan: List[Dict[str, Any]], plugin_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Finds data type mismatches between step outputs and subsequent inputs,
        and inserts a TRANSFORM step to correct them.
        """
        i = 0
        while i < len(plan):
            step = plan[i]
            step_number = step.get('number')
            if not step_number:
                i += 1
                continue

            inputs = step.get('inputs', {})
            action_verb = step.get('actionVerb')
            plugin_def = plugin_map.get(action_verb)
    
            if not plugin_def:
                i += 1
                continue
    
            input_definitions = plugin_def.get('inputDefinitions', [])
    
            for input_name, input_def in inputs.items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def and 'outputName' in input_def:
                    source_step_number = input_def['sourceStep']
                    source_output_name = input_def['outputName']
    
                    dest_input_def = next((inp for inp in input_definitions if inp.get('name') == input_name), None)
                    if not dest_input_def:
                        continue
    
                    dest_input_type = dest_input_def.get('valueType')
    
                    source_step = next((s for s in plan if s.get('number') == source_step_number), None)
                    if not source_step:
                        continue
    
                    source_action_verb = source_step.get('actionVerb')
                    source_plugin_def = plugin_map.get(source_action_verb)
                    if not source_plugin_def:
                        continue
    
                    source_output_definitions = source_plugin_def.get('outputDefinitions', [])
                    source_output_def = next((out for out in source_output_definitions if out.get('name') == source_output_name), None)
    
                    if not source_output_def and len(source_output_definitions) == 1:
                        source_output_def = source_output_definitions[0]
    
                    if not source_output_def:
                        continue
    
                    source_output_type = source_output_def.get('type')
    
                    # Only insert TRANSFORM if it's NOT an array/list type mismatch (handled by FOREACH)
                    if dest_input_type and source_output_type and dest_input_type != source_output_type and dest_input_type != 'any' and source_output_type != 'any' and source_output_type not in ['array', 'list']:
                        # Mismatch detected, insert TRANSFORM step
    
                        transform_step_number = self._find_max_step_number(plan) + 1 # Get a truly new, unused ID
                        new_output_name = f"{source_output_name}_as_{dest_input_type}"
    
                        # Construct the script based on target_type
                        script_value = ""
                        if dest_input_type == "string":
                            script_value = "print(str(params['source']))"
                        elif dest_input_type == "number":
                            script_value = "print(float(params['source']))" # or int()
                        elif dest_input_type == "boolean":
                            script_value = "print(bool(params['source']))"
                        elif dest_input_type == "object":
                            script_value = "import json; print(json.dumps(params['source']))" # Assume source is already object-like or can be JSON-ified
                        else: # Default to string conversion if unknown type
                            script_value = "print(str(params['source']))"
    
    
                        transform_step = {
                            "number": transform_step_number, # Assign the new unique ID
                            "actionVerb": "TRANSFORM",
                            "description": f"Transform '{source_output_name}' from {source_output_type} to {dest_input_type}.",
                            "inputs": {
                                "source": {
                                    "outputName": source_output_name,
                                    "sourceStep": source_step_number
                                },
                                "target_type": {
                                    "value": dest_input_type,
                                    "valueType": "string"
                                },
                                "script": { # Add the script input
                                    "value": script_value,
                                    "valueType": "string"
                                },
                                "script_parameters": { # Add script_parameters for the source
                                    "value": "{\"source\": params['source']}", # This needs to be a string representation of the dict
                                    "valueType": "object"
                                }
                            },
                            "outputs": {
                                new_output_name: f"The transformed {dest_input_type}."
                            }
                        }
   
                        # Insert the transform step
                        plan.insert(i, transform_step)
   
                        # Update the original step's input to reference the new TRANSFORM step
                        input_def['outputName'] = new_output_name
                        input_def['sourceStep'] = transform_step_number # Use the new unique ID
   
                        # Restart validation
                        i = -1
                        break
            if i == -1:
                break
            i += 1
        return plan

    def _repair_plan_with_llm(self, plan: List[Dict[str, Any]], errors: List[str], goal: str, inputs: Dict[str, Any], previous_errors: List[str]) -> List[Dict[str, Any]]:
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
            # Pre-process the step to fix common structural issues before sending to LLM
            step_to_repair_copy = copy.deepcopy(step_to_repair)

            # Fix FOREACH steps that have 'steps' property instead of 'inputs.steps.value'
            if (step_to_repair_copy.get('actionVerb') in ['FOREACH', 'WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'REPEAT'] and
                'steps' in step_to_repair_copy and
                isinstance(step_to_repair_copy['steps'], list)):

                # Move the steps to the proper inputs structure
                if 'inputs' not in step_to_repair_copy:
                    step_to_repair_copy['inputs'] = {}

                step_to_repair_copy['inputs']['steps'] = {
                    'value': step_to_repair_copy['steps'],
                    'valueType': 'array'
                }

                # Remove the old 'steps' property
                del step_to_repair_copy['steps']

                logger.info(f"Pre-processed control flow step {step_to_repair_copy.get('number')} to move 'steps' to 'inputs.steps.value'")

            step_to_repair_json = json.dumps(step_to_repair_copy, indent=2)
            prompt_type = "single_step"

            # Get the plugin definition for the failed step
            action_verb = step_to_repair.get('actionVerb')
            available_plugins_raw = inputs.get('availablePlugins', [])
            if isinstance(available_plugins_raw, str):
                try:
                    available_plugins_raw = json.loads(available_plugins_raw)
                except json.JSONDecodeError:
                    available_plugins_raw = []
            if isinstance(available_plugins_raw, dict):
                available_plugins = available_plugins_raw.get('value', [])
            else:
                available_plugins = available_plugins_raw if isinstance(available_plugins_raw, list) else []
            plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
            plugin_definition = plugin_map.get(action_verb)

            plugin_guidance = ""
            if plugin_definition:
                guidance_lines = [f"Plugin Schema for '{action_verb}':"]
                description = plugin_definition.get('description', 'No description available.')
                input_definitions = plugin_definition.get('inputDefinitions', [])
                guidance_lines.append(f"  Description: {description}")
                if input_definitions:
                    guidance_lines.append("  Inputs:")
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
        previous_errors_text = '\n'.join([f"- {error}" for error in previous_errors]) if previous_errors else "(None)"

        prompt = f"""You are an expert system for correcting JSON data that fails to conform to a schema.

1. THE GOAL:
{goal}

2. THE INVALID JSON OBJECT:
{step_to_repair_json}

3. PLUGIN DEFINITION:
{plugin_guidance}

4. THE CURRENT VALIDATION ERRORS:
{errors_text}

5. PREVIOUS VALIDATION ERRORS (if any):
{previous_errors_text}

6. THE SCHEMA FOR STEPS:
{json.dumps(PLAN_STEP_SCHEMA)}

7. YOUR TASK:
Your task is to fix the JSON object provided in section 2 to make it valid.
- Analyze the error: Understand the current validation errors, and consider the previous errors to identify persistent or new issues.
- Consult the schema: Ensure your fix adheres strictly to the PLAN_STEP_SCHEMA and the PLUGIN DEFINITION for the actionVerb.
- Examine the invalid object: Identify where the missing inputs should be added or where existing inputs need correction.
- Correct the object: Add the missing required inputs to the inputs object of the step. For each added input, ensure it has either:
    - A value and valueType (if it's a constant).
    - An outputName and sourceStep (if it's referencing an output from a previous step). If sourceStep is 0, it refers to an input from the parent step. Otherwise, it must refer to a preceding step in the plan.
- Source Inputs Properly: If an input is missing and it's expected to come from a previous step, ensure you correctly identify the sourceStep and outputName.

CRITICAL REQUIREMENTS:
- JSON ONLY: Your entire response MUST be a single, valid JSON object for the step.
- NO EXTRA TEXT: Do NOT include explanations, comments, or markdown like ```json.
- PRESERVE INTENT: Fix ONLY the specific errors while preserving the plan's original intent.
- STEP STRUCTURE: Return the complete step object with number, actionVerb, description, inputs, outputs, etc. Do NOT return just sub-arrays or partial data.
- CONTROL FLOW: For control flow verbs (FOREACH, WHILE, etc.), ensure sub-steps are properly placed in inputs.steps.value, not as a separate 'steps' property.
- IMPORTANT: If an input has both value and outputName/sourceStep, choose the outputName and sourceStep if the sourceStep does produce the outputName.

Return the corrected JSON object for the step."""

        logger.info(f"Attempting to repair {prompt_type} with {len(errors)} validation errors...")

        max_attempts = self.max_retries
        for attempt in range(max_attempts):
            try:
                if not self.brain_call:
                    raise AccomplishError("Brain call not available for LLM repair", "brain_error")
                response = self.brain_call(prompt, inputs, "json")
                repaired_data = json.loads(response)

                if isinstance(repaired_data, list):
                    # Check if this is actually a full plan or just sub-steps
                    step_numbers = [step.get('number') for step in repaired_data if isinstance(step, dict)]
                    has_step_one = 1 in step_numbers

                    # Check if the returned steps match top-level steps in the original plan
                    top_level_step_numbers = [step.get('number') for step in plan if isinstance(step, dict)]
                    returned_steps_are_top_level = all(num in top_level_step_numbers for num in step_numbers if isinstance(num, int))
                    spans_multiple_top_level = returned_steps_are_top_level and len(step_numbers) > 1

                    logger.info(f"LLM response analysis: step_numbers={step_numbers}, has_step_one={has_step_one}, "
                              f"top_level_steps={top_level_step_numbers}, returned_are_top_level={returned_steps_are_top_level}, "
                              f"spans_multiple_top_level={spans_multiple_top_level}")

                    if has_step_one or spans_multiple_top_level:
                        # This looks like a full plan replacement
                        logger.info("LLM returned a full repaired plan. Replacing the old plan.")
                        return repaired_data
                    else:
                        # This looks like sub-steps for a control flow step, treat as step content
                        logger.info("LLM returned sub-steps, treating as repaired step content.")
                        if step_to_repair:
                            # Update the step's sub-steps structure
                            repaired_step = copy.deepcopy(step_to_repair)
                            if 'steps' in repaired_step:
                                repaired_step['steps'] = repaired_data
                            elif 'inputs' in repaired_step and 'steps' in repaired_step['inputs']:
                                if isinstance(repaired_step['inputs']['steps'], dict):
                                    repaired_step['inputs']['steps']['value'] = repaired_data
                                else:
                                    repaired_step['inputs']['steps'] = {"value": repaired_data, "valueType": "array"}

                            # Replace the step in the plan
                            for i, step in enumerate(plan):
                                if step.get('number') == repaired_step.get('number'):
                                    plan[i] = repaired_step
                                    logger.info(f"Successfully updated sub-steps for step {repaired_step.get('number')}.")
                                    return plan

                        # Fallback: treat as full plan if we can't identify the step structure
                        logger.warning("Could not identify step structure, treating as full plan replacement.")
                        return repaired_data
                elif isinstance(repaired_data, dict):
                    # This case handles when the LLM returns a single step or the full plan as a dict with numeric keys
                    if all(k.isdigit() for k in repaired_data.keys()):
                         # It's a dict of steps, convert to a list
                        logger.info("LLM returned a dictionary of steps, converting to a plan list.")
                        return [repaired_data[k] for k in sorted(repaired_data.keys(), key=int)]

                    # It's a single repaired step
                    repaired_step = repaired_data
                    
                    # CRITICAL: Ensure the repaired step number matches the original step_to_repair number
                    if step_to_repair and repaired_step.get('number') != step_to_repair.get('number'):
                        raise ValueError(f"LLM returned repaired step with number {repaired_step.get('number')}, but expected {step_to_repair.get('number')}.")

                    # Find the step to replace in the original plan
                    for i, step in enumerate(plan):
                        if step.get('number') == repaired_step.get('number'):
                            plan[i] = repaired_step
                            logger.info(f"Successfully replaced step {repaired_step.get('number')} in the plan.")
                            return plan

                    # If we couldn't find the step to replace, something is wrong
                    logger.error(f"Could not find step {repaired_step.get('number')} to replace in the plan.")
                    raise ValueError("Repaired step number does not match any existing step.")
                else:
                    raise ValueError("LLM response is not a valid JSON object or array.")

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

    def _validate_plan(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]], parent_outputs: Dict[int, Set[str]] = None) -> Dict[str, Any]:
        """Validate the plan against the schema and plugin requirements."""
        errors = []
        wrappable_errors = [] # New list for FOREACH candidates

        if not isinstance(plan, list):
            errors.append("Plan must be a list of steps")
            return {'valid': False, 'errors': errors, 'wrappable_errors': []}

        if len(plan) == 0:
            # An empty sub-plan is valid
            return {'valid': True, 'errors': [], 'wrappable_errors': []}

        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
        # Initialize available_outputs with the context from the parent, if any
        available_outputs = parent_outputs.copy() if parent_outputs else {}

        # Validate unique step numbers globally (including sub-plans)
        all_step_numbers = self._collect_all_step_numbers(plan)
        duplicate_numbers = [num for num, count in all_step_numbers.items() if count > 1]
        if duplicate_numbers:
            for dup_num in duplicate_numbers:
                errors.append(f"Duplicate step number {dup_num} found. All step numbers must be globally unique across the entire plan including sub-plans.")

        # First pass to populate available_outputs for the current plan level
        for step in plan:
            step_number = step.get('number')
            if step_number is None: continue
            
            step_outputs = set()
            outputs_from_plan = step.get('outputs', {})
            if isinstance(outputs_from_plan, dict):
                for output_name_in_plan in outputs_from_plan.keys():
                    step_outputs.add(output_name_in_plan) # Add the declared output name

                    # Now, try to infer the actual plugin output name
                    action_verb = step.get('actionVerb')
                    plugin_def = plugin_map.get(action_verb)
                    if plugin_def:
                        output_definitions = plugin_def.get('outputDefinitions', [])
                        # Check if the declared output name matches a plugin output
                        direct_match = next((out for out in output_definitions if out.get('name') == output_name_in_plan), None)
                        
                        if not direct_match and len(output_definitions) == 1:
                            # If no direct match and only one plugin output, infer
                            inferred_output_name = output_definitions[0].get('name')
                            if inferred_output_name:
                                step_outputs.add(inferred_output_name) # Add the inferred name
                                logger.info(f"Step {step_number}: Inferring output '{output_name_in_plan}' maps to plugin output '{inferred_output_name}'.")
            
            available_outputs[step_number] = step_outputs

        # Second pass to validate
        for i, step in enumerate(plan):
            step_number = step.get('number')
            if step_number is None:
                errors.append(f"Step {i+1}: Missing 'number' field")
                continue

            required_fields = ['actionVerb', 'description', 'inputs', 'outputs']
            for field in required_fields:
                if field not in step:
                    errors.append(f"Step {step_number}: Missing required field '{field}'")

            action_verb = step.get('actionVerb')
            if action_verb:
                plugin_def = plugin_map.get(action_verb)
                if plugin_def:
                    self._validate_step_inputs(step, plugin_def, available_outputs, errors, wrappable_errors, plan, plugin_map)
                else:
                    logger.info(f"Step {step_number}: actionVerb '{action_verb}' not found in plugin_map. Skipping strict input validation.")

            # Recursive validation for control flow verbs
            control_flow_verbs = ['WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT']
            if action_verb in control_flow_verbs:
                sub_plan = None
                if 'steps' in step and isinstance(step['steps'], list):
                    sub_plan = step['steps']
                elif 'steps' in step.get('inputs', {}) and isinstance(step['inputs']['steps'], dict) and 'value' in step['inputs']['steps'] and isinstance(step['inputs']['steps']['value'], list):
                    sub_plan = step['inputs']['steps']['value']

                if sub_plan:
                    logger.info(f"Recursively validating sub-plan for step {step_number} ({action_verb})")
                    sub_plan_context = available_outputs.copy()
                    if action_verb == 'FOREACH':
                        # The FOREACH step itself provides 'item' and 'index' for its sub-plan
                        sub_plan_context[step_number] = {'item', 'index'}
                    
                    sub_validation_result = self._validate_plan(sub_plan, available_plugins, sub_plan_context)
                    
                    if not sub_validation_result['valid']:
                        errors.extend(f"Sub-plan of step {step_number} ({action_verb}): {e}" for e in sub_validation_result['errors'])
                    if sub_validation_result.get('wrappable_errors'):
                         wrappable_errors.extend(sub_validation_result['wrappable_errors'])

            recommended_role = step.get('recommendedRole')
            if recommended_role:
                allowed_roles = ['Coordinator', 'Researcher', 'Coder', 'Creative', 'Critic', 'Executor', 'Domain Expert']
                if recommended_role not in allowed_roles:
                    logger.warning(f"Step {step_number}: Invalid 'recommendedRole' '{recommended_role}'. Dropping it.")
                    del step['recommendedRole']

        return {'valid': len(errors) == 0 and len(wrappable_errors) == 0, 'errors': errors, 'wrappable_errors': wrappable_errors}

    def _fix_step_outputs(self, step: Dict[str, Any], plugin_def: Dict[str, Any], current_outputs: Dict[str, str]) -> Dict[str, str]:
        """Allow custom output names - just validate basic structure."""
        step_number = step.get('number')
        action_verb = step.get('actionVerb')

        # Get plugin output definitions
        output_definitions = plugin_def.get('outputDefinitions', [])
        if not output_definitions:
            return current_outputs

        # Simple validation: allow any output names, just log what we're allowing
        if len(current_outputs) > 0:
            logger.info(f"Step {step_number}: Allowing custom output names for '{action_verb}': {list(current_outputs.keys())}")
        else:
            logger.warning(f"Step {step_number}: No outputs defined for plugin '{action_verb}'")

        # Return outputs as-is - dependency validation will ensure references work
        return current_outputs

    def _update_dependent_inputs(self, source_step_number: int, old_output_name: str, new_output_name: str):
        """Update inputs in dependent steps that reference a renamed output.

        Note: This method is preserved for potential future use but is no longer called
        since we now allow custom output names without forced renaming.
        """
        if not hasattr(self, '_current_plan'):
            return

        for step in self._current_plan:
            step_inputs = step.get('inputs', {})
            for input_name, input_def in step_inputs.items():
                if (isinstance(input_def, dict) and
                    input_def.get('sourceStep') == source_step_number and
                    input_def.get('outputName') == old_output_name):

                    logger.info(f"Step {step.get('number')}: Updating input '{input_name}' to reference output '{new_output_name}' instead of '{old_output_name}'")
                    input_def['outputName'] = new_output_name

    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], step_to_wrap: Dict[str, Any], source_step_number: int, source_output_name: str, target_input_name: str) -> List[Dict[str, Any]]:
        """Wraps a step that expects a single item in a FOREACH loop, including all its dependent steps."""
        logger.info(f"Wrapping step {step_to_wrap['number']} in a FOREACH loop for input '{target_input_name}'.")

        # 1. Determine the FOREACH step number (next unused)
        foreach_step_number = self._find_max_step_number(plan) + 1
        
        step_to_wrap_original_number = step_to_wrap['number']

        # 2. Identify all steps that need to be moved into the subplan
        steps_to_move_into_subplan_map = {} # Key: original step number, Value: step object
        steps_to_move_into_subplan_map[step_to_wrap_original_number] = copy.deepcopy(step_to_wrap)

        # Find the index of step_to_wrap in the original plan
        start_index_of_step_to_wrap = -1
        for idx, step in enumerate(plan):
            if step.get('number') == step_to_wrap_original_number:
                start_index_of_step_to_wrap = idx
                break
        
        if start_index_of_step_to_wrap == -1:
            logger.error(f"Original step {step_to_wrap_original_number} not found in plan during FOREACH wrapping.")
            return plan # Should not happen if validation is correct

        # Collect candidate steps that are after step_to_wrap in the original plan
        candidate_steps_after_wrap = [copy.deepcopy(s) for s in plan[start_index_of_step_to_wrap + 1:]]
        
        # Set of original step numbers that are part of the subplan
        moved_original_step_numbers = {step_to_wrap_original_number}
        
        # Loop to find all transitive dependencies on steps already moved to subplan
        new_dependencies_found = True
        while new_dependencies_found:
            new_dependencies_found = False
            for current_step in candidate_steps_after_wrap:
                current_step_num = current_step.get('number')
                if current_step_num in moved_original_step_numbers:
                    continue # Already moved

                is_dependent = False
                for input_name, input_def in current_step.get('inputs', {}).items():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        if input_def['sourceStep'] in moved_original_step_numbers:
                            is_dependent = True
                            break
                
                if is_dependent:
                    steps_to_move_into_subplan_map[current_step_num] = current_step
                    moved_original_step_numbers.add(current_step_num)
                    new_dependencies_found = True

        # Now, add steps that depend on source_step_number (step1's array output)
        # and are after step_to_wrap, and not yet in the subplan.
        # This handles the "dependent on step1" part of the prompt.
        for current_step in plan[start_index_of_step_to_wrap + 1:]:
            current_step_num = current_step.get('number')
            if current_step_num in moved_original_step_numbers:
                continue

            for input_name, input_def in current_step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def and 'outputName' in input_def:
                    if input_def['sourceStep'] == source_step_number and input_def['outputName'] == source_output_name:
                        steps_to_move_into_subplan_map[current_step_num] = copy.deepcopy(current_step)
                        moved_original_step_numbers.add(current_step_num)
                        break 

        # 3. Create the subplan (steps retain their original numbers)
        sub_plan = []
        
        # Sort steps by their original number to maintain order in subplan
        sorted_steps_to_move = sorted(steps_to_move_into_subplan_map.values(), key=lambda x: x['number'])

        for original_step in sorted_steps_to_move:
            new_step = copy.deepcopy(original_step) # Work on a copy
            # new_step['number'] remains original_step['number'] as per user's clarification
            
            # Update inputs within the subplan
            for input_name, input_def in new_step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    original_input_source_step = input_def['sourceStep']
                    
                    if original_input_source_step == source_step_number and input_name == target_input_name and original_step['number'] == step_to_wrap_original_number:
                        # This is the specific input that caused the wrapping in the original step_to_wrap
                        input_def['outputName'] = "item"
                        input_def['sourceStep'] = foreach_step_number # Reference the FOREACH step itself
                    # Else: sourceStep remains original_input_source_step (no remapping to relative subplan numbers)

            sub_plan.append(new_step)

        # 4. Create the FOREACH step
        foreach_step = {
            "number": foreach_step_number,
            "actionVerb": "FOREACH",
            "description": f"Iterate over the '{source_output_name}' list from step {source_step_number} and for each item, execute the sub-plan.",
                                    "inputs": {
                                        "array": {  # Changed 'list' to 'array'
                                            "outputName": source_output_name,
                                            "sourceStep": source_step_number
                                        },
                                        "steps": { # steps is an input
                                            "value": sub_plan,
                                            "valueType": "array" # Assuming sub_plan is an array of steps
                                        }
                                    },
                                    "outputs": {
                                        f"{original_step.get('actionVerb').lower()}_results": "Aggregated results from the loop."
                                    },
                                    "recommendedRole": "Coordinator"        }

        # 5. Reconstruct the main plan
        new_plan = []
        inserted_foreach = False
        for s in plan:
            if s['number'] in moved_original_step_numbers:
                # This step has been moved into the subplan
                if s['number'] == step_to_wrap_original_number and not inserted_foreach:
                    # Insert the FOREACH step at the position of the first moved step (step_to_wrap)
                    new_plan.append(foreach_step)
                    inserted_foreach = True
                # Skip adding this step to the new_plan as it's now in the subplan
            else:
                # This step is not moved, keep it in the main plan with its original number
                new_plan.append(s)
        
        return new_plan

    def _validate_step_inputs(self, step: Dict[str, Any], plugin_def: Dict[str, Any], available_outputs: Dict[int, Set[str]], errors: List[str], wrappable_errors: List[Dict[str, Any]], plan: List[Dict[str, Any]], plugin_map: Dict[str, Any]):
        """Validate inputs for a single step against the plugin definition."""
        logger.info(f"_validate_step_inputs: Validating step: {step}")
        step_number = step['number']
        inputs = step.get('inputs', {})
        input_definitions = plugin_def.get('inputDefinitions', [])

        # First validate embedded references in input values
        self._validate_embedded_references(step, inputs, available_outputs, errors)

        # Create map of required inputs
        required_inputs = {inp['name']: inp for inp in input_definitions if inp.get('required', False)}

        # Check required inputs are present
        for req_name in required_inputs.keys():
            if req_name not in inputs:
                errors.append(f"Step {step_number}: Missing required input '{req_name}' for actionVerb '{step['actionVerb']}'")

        # Validate each input
        for input_name, input_def in inputs.items():
            # Special case for FOREACH loop items: trust that the loop provides this.
            if isinstance(input_def, dict) and input_def.get('outputName') == 'item':
                continue

            # Special handling for control flow verbs
            control_flow_verbs = ['WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT']
            if step.get('actionVerb') in control_flow_verbs and input_name == 'steps':
                # The 'steps' for a control flow verb can be a direct list of step objects,
                # or it can be a standard input object with a 'value' that is a list of steps.
                is_direct_list = isinstance(input_def, list)
                is_wrapped_list = isinstance(input_def, dict) and 'value' in input_def and isinstance(input_def['value'], list)

                if is_direct_list or is_wrapped_list:
                    # It's a valid structure for control flow steps.
                    # A more robust implementation could recursively call _validate_plan here.
                    pass
                else:
                    errors.append(f"Step {step_number}: Input 'steps' for '{step.get('actionVerb')}' must be an array of steps.")
                continue  # Skip generic input validation for the 'steps' block

            if not isinstance(input_def, dict):
                errors.append(f"Step {step_number}: Input '{input_name}' must be a dictionary")
                continue

            has_value = 'value' in input_def
            has_output_name = 'outputName' in input_def
            has_source_step = 'sourceStep' in input_def

            if has_value and has_output_name:
                # Both present - this is ambiguous, prefer outputName
                logger.warning(f"Step {step_number}: Input '{input_name}' has both 'value' and 'outputName'. Using 'outputName'.")
            elif has_output_name and not has_source_step:
                errors.append(f"Step {step_number}: Input '{input_name}' has 'outputName' but missing 'sourceStep'")
            elif has_source_step and not has_output_name:
                errors.append(f"Step {step_number}: Input '{input_name}' has 'sourceStep' but missing 'outputName'")
            elif not has_value and not has_output_name:
                errors.append(f"Step {step_number}: Input '{input_name}' must have either 'value' or 'outputName'/'sourceStep'")

            # Validate sourceStep references
            if has_source_step:
                source_step_num = input_def['sourceStep']
                if source_step_num != 0:  # 0 means parent input
                    if source_step_num not in available_outputs:
                        errors.append(f"Step {step_number}: Input '{input_name}' references sourceStep {source_step_num} which does not exist or has no outputs")
                    elif has_output_name:
                        output_name = input_def['outputName']
                        if source_step_num in available_outputs and output_name not in available_outputs[source_step_num]:
                            errors.append(f"Step {step_number}: Input '{input_name}' references output '{output_name}' from step {source_step_num} which does not exist")
            
            # Enforce Type Compatibility
            if has_source_step and has_output_name:
                source_step_number = input_def['sourceStep']
                source_output_name = input_def['outputName']

                # Find destination input definition from the current plugin
                dest_input_def = next((inp for inp in input_definitions if inp.get('name') == input_name), None)

                if dest_input_def:
                    dest_input_type = dest_input_def.get('valueType')

                    # Find source step from the plan
                    source_step = next((s for s in plan if s.get('number') == source_step_number), None)

                    if source_step:
                        source_action_verb = source_step.get('actionVerb')
                        source_plugin_def = plugin_map.get(source_action_verb)

                        if source_plugin_def:
                            source_output_definitions = source_plugin_def.get('outputDefinitions', [])
                            source_output_def = next((out for out in source_output_definitions if out.get('name') == source_output_name), None)

                            # If direct lookup fails, and there's only one output, assume it's the one.
                            if not source_output_def and len(source_output_definitions) == 1:
                                source_output_def = source_output_definitions[0]
                                logger.info(f"Step {step_number}: Inferring type for custom output '{source_output_name}' from the sole plugin output '{source_output_def.get('name')}'.")

                            if source_output_def:
                                source_output_type = source_output_def.get('type')

                                # Now, compare the types
                                if dest_input_type and source_output_type:
                                    is_mismatch = dest_input_type != source_output_type and dest_input_type != 'any' and source_output_type != 'any'
                                    is_wrappable = dest_input_type in ['string', 'number', 'object'] and source_output_type in ['array', 'list']

                                    if is_wrappable:
                                        # Don't wrap a step that's already a FOREACH
                                        if step.get('actionVerb') != 'FOREACH':
                                            # Get the actual output name from the source step that is an array
                                            actual_source_output_name = source_output_def.get('name') # Use the name from source_output_def
                                            wrappable_errors.append({
                                                "step_number": step_number,
                                                "source_step_number": source_step_number,
                                                "source_output_name": actual_source_output_name, # Use the actual output name
                                                "target_input_name": input_name
                                            })
                                    elif is_mismatch:
                                        errors.append(
                                            f"Step {step_number}: Input '{input_name}' for actionVerb '{step['actionVerb']}' "
                                            f"expects type '{dest_input_type}', but received incompatible type "
                                            f"'{source_output_type}' from output '{source_output_name}' of step {source_step_number}."
                                        )

