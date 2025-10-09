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
    "required": ["number", "actionVerb", "inputs", "outputs"],
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


        
    def _find_max_step_number(self, plan: List[Dict[str, Any]]) -> int:
        max_num = 0
        step_numbers = []
        for step in plan:
            if isinstance(step, dict):
                num = step.get('number', 0)
                step_numbers.append(num)
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
        logger.info(f"_find_max_step_number: step_numbers={step_numbers}, max_num={max_num}")
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

        # Apply input alias resolution before validation
        current_plan = self._resolve_input_aliases(current_plan, available_plugins)

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
                    error_to_fix['target_input_name'],
                    plugin_map
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

        # Create a map of the plan by step number for easy lookup during repair
        plan_map = {s.get('number'): s for s in plan if isinstance(s, dict) and s.get('number') is not None}

        steps_to_remove = set()

        for i, step in enumerate(plan):
            if not isinstance(step, dict):
                logger.warning("Step is not a dictionary. Skipping.")
                continue

            current_step_number = step.get('number')
            if current_step_number is None:
                logger.warning(f"Step {i+1}: Missing 'number' field. Cannot process inputs for this step.")
                continue

            # Ensure 'number' is an integer
            if 'number' in step and not isinstance(step['number'], int):
                try:
                    step['number'] = int(step['number'])
                except (ValueError, TypeError):
                    step['number'] = None

            # Repair inputs for ambiguity
            if 'inputs' in step and isinstance(step['inputs'], dict):
                for input_name, input_def in step['inputs'].items():
                    if isinstance(input_def, dict):
                        if 'outputName' in input_def and 'sourceStep' in input_def and 'value' in input_def:
                            logger.info(f"[Repair] Input '{input_name}' has both value and source. Preferring source.")
                            del input_def['value']

            # Repair 'steps' input for control flow verbs if it's a string
            if step.get('actionVerb') in ['SEQUENCE', 'WHILE', 'UNTIL', 'FOREACH'] and \
               'steps' in step.get('inputs', {}) and \
               isinstance(step['inputs']['steps'], dict) and \
               'value' in step['inputs']['steps'] and \
               isinstance(step['inputs']['steps']['value'], str):
                try:
                    parsed_steps = json.loads(step['inputs']['steps']['value'])
                    if isinstance(parsed_steps, list):
                        step['inputs']['steps']['value'] = parsed_steps
                        step['inputs']['steps']['valueType'] = "array"
                except (json.JSONDecodeError, ValueError):
                    logger.warning(f"[Repair] Could not parse 'steps' JSON string for {step.get('actionVerb')}.")

            # Handle control flow steps with direct 'steps' property
            if step.get('actionVerb') in ['SEQUENCE', 'WHILE', 'UNTIL', 'FOREACH'] and \
               'steps' in step and isinstance(step['steps'], list):
                logger.info(f"[Repair] Step {current_step_number}: Moving direct 'steps' property to 'inputs.steps.value'.")
                if 'inputs' not in step: step['inputs'] = {}
                step['inputs']['steps'] = {'value': step['steps'], 'valueType': 'array'}
                del step['steps']

            # Special repair for SEQUENCE with integer array
            if step.get('actionVerb') == 'SEQUENCE':
                inputs = step.get('inputs', {})
                if 'steps' in inputs and isinstance(inputs['steps'], dict):
                    steps_value = inputs['steps'].get('value')
                    if isinstance(steps_value, list) and all(isinstance(item, int) for item in steps_value):
                        logger.info(f"[Repair] Step {current_step_number}: Resolving SEQUENCE with integer array to full step objects.")
                        repaired_sub_plan = []
                        for step_num in steps_value:
                            if step_num in plan_map:
                                repaired_sub_plan.append(copy.deepcopy(plan_map[step_num]))
                                steps_to_remove.add(step_num)
                            else:
                                logger.warning(f"[Repair] Could not find step object for number: {step_num} in SEQUENCE.")
                        step['inputs']['steps']['value'] = repaired_sub_plan

            # Recursively repair sub-plans
            if 'inputs' in step and 'steps' in step['inputs'] and isinstance(step['inputs']['steps'], dict) and \
               'value' in step['inputs']['steps'] and isinstance(step['inputs']['steps']['value'], list):
                logger.info(f"[Repair] Recursively repairing sub-plan in step {step.get('number')} inputs.steps.value")
                step['inputs']['steps']['value'] = self._repair_plan_code_based(step['inputs']['steps']['value'])

        # Filter out steps that were moved into SEQUENCE blocks
        if steps_to_remove:
            final_plan = [step for step in plan if step.get('number') not in steps_to_remove]
            logger.info(f"[Repair] Finished code-based repair. Removed {len(steps_to_remove)} steps that were moved into SEQUENCE blocks.")
            return final_plan
        
        logger.info(f"[Repair] Finished code-based repair. No steps removed.")
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

                    source_output_type = source_output_def.get('valueType')

                    # Debug type information
                    logger.debug(f"Type check: Step {step.get('number')} input '{input_name}' expects {dest_input_type}, Step {source_step_number} output '{source_output_name}' provides {source_output_type}")

                    # Only insert TRANSFORM if it's NOT an array/list type mismatch (handled by FOREACH)
                    if dest_input_type and source_output_type and dest_input_type != source_output_type and dest_input_type != 'any' and source_output_type != 'any' and source_output_type not in ['array', 'list']:
                        # Mismatch detected, insert TRANSFORM step
                        logger.info(f"Type mismatch detected: Step {step.get('number')} input '{input_name}' expects {dest_input_type} but Step {source_step_number} output '{source_output_name}' provides {source_output_type}, inserting TRANSFORM step")
                    else:
                        # Log why TRANSFORM was not inserted
                        if not dest_input_type:
                            logger.debug(f"No TRANSFORM: dest_input_type is None for Step {step.get('number')} input '{input_name}'")
                        elif not source_output_type:
                            logger.debug(f"No TRANSFORM: source_output_type is None for Step {source_step_number} output '{source_output_name}'")
                        elif dest_input_type == source_output_type:
                            logger.debug(f"No TRANSFORM: types match ({dest_input_type}) for Step {step.get('number')} input '{input_name}'")
                        elif dest_input_type == 'any' or source_output_type == 'any':
                            logger.debug(f"No TRANSFORM: 'any' type involved for Step {step.get('number')} input '{input_name}'")
                        elif source_output_type in ['array', 'list']:
                            logger.debug(f"No TRANSFORM: source is array/list type for Step {step.get('number')} input '{input_name}' (should use FOREACH)")
                        else:
                            logger.debug(f"No TRANSFORM: unknown reason for Step {step.get('number')} input '{input_name}'")

                    if dest_input_type and source_output_type and dest_input_type != source_output_type and dest_input_type != 'any' and source_output_type != 'any' and source_output_type not in ['array', 'list']:
    
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





    def _classify_error_type(self, error: str) -> str:
        """Classify validation errors into categories for focused repair prompts"""
        error_lower = error.lower()

        if 'missing required input' in error_lower:
            return 'missing_input'
        elif 'invalid reference' in error_lower or 'sourceStep' in error_lower:
            return 'invalid_reference'
        elif 'type mismatch' in error_lower or 'expected' in error_lower and 'got' in error_lower:
            return 'type_mismatch'
        elif 'missing required field' in error_lower:
            return 'missing_field'
        else:
            return 'generic'

    def _resolve_input_aliases(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Resolve input aliases for all steps based on plugin definitions"""
        # Create plugin map for quick lookup
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}

        for step in plan:
            action_verb = step.get('actionVerb')
            plugin_def = plugin_map.get(action_verb)

            if not plugin_def:
                continue

            inputs = step.get('inputs', {})
            input_definitions = plugin_def.get('inputDefinitions', [])

            # Create alias map: alias -> canonical_name
            alias_map = {}
            for input_def in input_definitions:
                canonical_name = input_def.get('name')
                aliases = input_def.get('aliases', [])

                # Add the canonical name to itself
                alias_map[canonical_name] = canonical_name

                # Add all aliases pointing to canonical name
                for alias in aliases:
                    alias_map[alias] = canonical_name

            # Check for inputs that need alias resolution
            inputs_to_rename = {}
            for input_name in list(inputs.keys()):
                if input_name in alias_map:
                    canonical_name = alias_map[input_name]
                    if input_name != canonical_name:
                        # This input uses an alias, rename it to canonical
                        inputs_to_rename[input_name] = canonical_name

            # Apply the renames
            for old_name, new_name in inputs_to_rename.items():
                if new_name not in inputs:  # Only rename if canonical name doesn't already exist
                    logger.info(f"Step {step.get('number')}: Resolving input alias '{old_name}' -> '{new_name}' for actionVerb '{action_verb}'")
                    inputs[new_name] = inputs.pop(old_name)
                else:
                    logger.warning(f"Step {step.get('number')}: Cannot resolve alias '{old_name}' -> '{new_name}' because '{new_name}' already exists")

            # Debug: Log if any aliases were found for this step
            if inputs_to_rename:
                logger.info(f"Step {step.get('number')}: Applied {len(inputs_to_rename)} alias resolutions for {action_verb}")
            elif action_verb in plugin_map:
                logger.debug(f"Step {step.get('number')}: No alias resolutions needed for {action_verb}")

        return plan

    def _create_focused_repair_prompt(self, step_to_repair: Dict[str, Any], errors: List[str], plugin_definition: Dict[str, Any] = None) -> str:
        """Create a focused repair prompt based on error type"""

        # Classify the primary error type
        primary_error_type = self._classify_error_type(errors[0]) if errors else 'generic'

        step_json = json.dumps(step_to_repair, indent=2)
        errors_text = '\n'.join([f"- {error}" for error in errors])

        if primary_error_type == 'missing_input':
            # Extract the missing input name from the error
            missing_input = None
            for error in errors:
                match = re.search(r"Missing required input '([^']+)'", error)
                if match:
                    missing_input = match.group(1)
                    break

            plugin_info = ""
            if plugin_definition and missing_input:
                input_defs = plugin_definition.get('inputDefinitions', [])
                for input_def in input_defs:
                    if input_def.get('name') == missing_input:
                        plugin_info = f"\nRequired input '{missing_input}' definition:\n- Type: {input_def.get('type', 'unknown')}\n- Description: {input_def.get('description', 'No description')}\n- Required: {input_def.get('required', False)}"
                        break

            return f"""Fix the missing required input in this JSON step object.

ERROR: {errors_text}

STEP TO FIX:
{step_json}
{plugin_info}

TASK: Add the missing required input '{missing_input}' to the inputs object. The input should either:
1. Have a "value" and "valueType" (for constants)
2. Have an "outputName" and "sourceStep" (to reference output from another step)

Return ONLY the corrected JSON step object, no explanations."""

        elif primary_error_type == 'invalid_reference':
            return f"""Fix the invalid step reference in this JSON step object.

ERROR: {errors_text}

STEP TO FIX:
{step_json}

TASK: Correct the sourceStep and/or outputName references to point to valid steps and outputs.

Return ONLY the corrected JSON step object, no explanations."""

        else:
            # Fall back to a shorter generic prompt
            return f"""Fix the validation errors in this JSON step object.

ERRORS: {errors_text}

STEP TO FIX:
{step_json}

TASK: Correct the errors while preserving the step's intent.

Return ONLY the corrected JSON step object, no explanations."""

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

        # Use focused repair prompt for single steps
        if prompt_type == "single_step":
            prompt = self._create_focused_repair_prompt(step_to_repair_copy, errors, plugin_definition)
        else:
            # Fall back to generic prompt for full plan repairs
            errors_text = '\n'.join([f"- {error}" for error in errors])
            prompt = f"""Fix the validation errors in this plan.

ERRORS: {errors_text}

PLAN TO FIX:
{step_to_repair_json}

Return ONLY the corrected JSON plan, no explanations."""

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

            required_fields = ['actionVerb', 'inputs', 'outputs']
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



    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], step_to_wrap: Dict[str, Any], source_step_number: int, source_output_name: str, target_input_name: str, plugin_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Wraps a step that expects a single item in a FOREACH loop, including all its dependent steps."""
        logger.info(f"Wrapping step {step_to_wrap['number']} in a FOREACH loop for input '{target_input_name}'.")

        # 1. Determine the FOREACH step number (next unused)
        max_step_number = self._find_max_step_number(plan)
        foreach_step_number = max_step_number + 1
        logger.info(f"Max step number in plan: {max_step_number}, assigning FOREACH step number: {foreach_step_number}")

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

        # 3. Create the subplan (keep original step numbers for global uniqueness)
        sub_plan = []

        # Sort steps by their original number to maintain order in subplan
        sorted_steps_to_move = sorted(steps_to_move_into_subplan_map.values(), key=lambda x: x['number'])

        logger.info(f"Creating sub-plan with {len(sorted_steps_to_move)} steps, keeping original step numbers for global uniqueness")

        for original_step in sorted_steps_to_move:
            new_step = copy.deepcopy(original_step) # Work on a copy
            # Keep original step number for global uniqueness across entire plan
            # new_step['number'] remains original_step['number']
            logger.info(f"Adding step {new_step['number']} ({new_step['actionVerb']}) to sub-plan")
            
            # Update inputs within the subplan
            for input_name, input_def in new_step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    original_input_source_step = input_def['sourceStep']

                    if original_input_source_step == source_step_number and input_name == target_input_name and original_step['number'] == step_to_wrap_original_number:
                        # This is the specific input that caused the wrapping in the original step_to_wrap
                        # The FOREACH execution expects this input to have outputName = "item" to inject the loop item
                        input_def['outputName'] = "item"
                        input_def['sourceStep'] = foreach_step_number # Reference the FOREACH step itself
                        logger.info(f"Updated input '{input_name}' in step {new_step['number']} to reference FOREACH item")
                    else:
                        # For other inputs that reference steps within the sub-plan, we need to ensure
                        # they use the actual output names from the plugin manifests, not the expected names
                        if 'outputName' in input_def and original_input_source_step in steps_to_move_into_subplan_map:
                            source_step = steps_to_move_into_subplan_map[original_input_source_step]
                            source_action_verb = source_step.get('actionVerb')

                            # Get the plugin definition for the source step
                            if source_action_verb and source_action_verb in plugin_map:
                                source_plugin_def = plugin_map[source_action_verb]
                                output_definitions = source_plugin_def.get('outputDefinitions', [])

                                # If the source plugin has only one output, use that output name
                                if len(output_definitions) == 1:
                                    actual_output_name = output_definitions[0].get('name')
                                    if actual_output_name and actual_output_name != input_def['outputName']:
                                        logger.info(f"Updating output reference in step {new_step['number']} input '{input_name}': '{input_def['outputName']}' -> '{actual_output_name}'")
                                        input_def['outputName'] = actual_output_name
                    # All other sourceStep references remain unchanged since step numbers are globally unique

            sub_plan.append(new_step)

        # Debug: Log the final sub-plan structure
        logger.info(f"Created sub-plan with {len(sub_plan)} steps (keeping original step numbers):")
        for step in sub_plan:
            logger.info(f"  Step {step['number']}: {step['actionVerb']} - inputs: {list(step.get('inputs', {}).keys())}")
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    logger.info(f"    Input '{input_name}' references step {input_def['sourceStep']}, output '{input_def.get('outputName')}'")

        # 4. Create the FOREACH step
        # Copy the outputs from the step being wrapped so dependent steps can reference them
        original_step = steps_to_move_into_subplan_map[step_to_wrap_original_number]
        foreach_outputs = copy.deepcopy(original_step.get('outputs', {}))

        # Create FOREACH step with explicit number assignment to avoid any reference issues
        foreach_step_number_final = int(foreach_step_number)  # Ensure it's an integer, not a reference

        foreach_step = {
            "number": foreach_step_number_final,
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
            "outputs": foreach_outputs,  # Use the same outputs as the wrapped step
            "recommendedRole": "Coordinator"
        }
        logger.info(f"Created FOREACH step with number {foreach_step_number}, replacing original step {step_to_wrap_original_number}")
        logger.info(f"FOREACH step immediately after creation: number={foreach_step['number']}, actionVerb={foreach_step['actionVerb']}")

        # 5. Reconstruct the main plan
        new_plan = []
        inserted_foreach = False
        for s in plan:
            if s['number'] in moved_original_step_numbers:
                # This step has been moved into the subplan
                if s['number'] == step_to_wrap_original_number and not inserted_foreach:
                    # Insert the FOREACH step at the position of the first moved step (step_to_wrap)
                    # CRITICAL: Ensure the FOREACH step keeps its assigned unique number
                    if foreach_step['number'] != foreach_step_number_final:
                        logger.error(f"CRITICAL BUG: FOREACH step number changed from {foreach_step_number_final} to {foreach_step['number']}!")
                        foreach_step['number'] = foreach_step_number_final  # Force correct number

                    logger.info(f"Inserting FOREACH step with number {foreach_step['number']} at position of original step {s['number']}")
                    logger.info(f"FOREACH step before insertion: {json.dumps(foreach_step, indent=2)}")
                    new_plan.append(foreach_step)
                    inserted_foreach = True
                    logger.info(f"FOREACH step after insertion: {json.dumps(new_plan[-1], indent=2)}")
                # Skip adding this step to the new_plan as it's now in the subplan
                logger.info(f"Skipping original step {s['number']} ({s.get('actionVerb')}) - moved to sub-plan")
            else:
                # This step is not moved, keep it in the main plan with its original number
                logger.info(f"Keeping original step {s['number']} ({s.get('actionVerb')}) in main plan")
                new_plan.append(s)

        # 6. Update any remaining steps that reference the wrapped step to reference the FOREACH step instead
        for step in new_plan:
            if step['number'] == foreach_step_number:
                continue  # Skip the FOREACH step itself

            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    # If this input references the original wrapped step, update it to reference the FOREACH step
                    if input_def['sourceStep'] == step_to_wrap_original_number:
                        logger.info(f"Updating step {step['number']} input '{input_name}' to reference FOREACH step {foreach_step_number} instead of wrapped step {step_to_wrap_original_number}")
                        input_def['sourceStep'] = foreach_step_number

        # Debug: Log the final plan structure
        logger.info(f"Final plan after FOREACH wrapping has {len(new_plan)} steps:")
        for step in new_plan:
            logger.info(f"  Step {step['number']}: {step['actionVerb']}")
            if step['actionVerb'] == 'FOREACH':
                logger.info(f"  FOREACH step details: {json.dumps(step, indent=4)}")

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
                logger.warning(f"Step {step_number}: Missing required input '{req_name}' for actionVerb '{step['actionVerb']}' - Available inputs: {list(inputs.keys())}")
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
                                source_output_type = source_output_def.get('valueType')

                                # Now, compare the types
                                if dest_input_type and source_output_type:
                                    if dest_input_type == 'array' and source_output_type == 'string':
                                        is_mismatch = False
                                    else:
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

