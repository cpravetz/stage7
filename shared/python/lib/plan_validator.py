#!/usr/bin/env python3

import json
import logging
import re
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
        
    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 3: Validate and repair plan if needed, with retries."""
        logger.info("Phase 3: Validating and repairing plan...")

        # Store the plan for dependent input updates
        self._current_plan = plan

        # Initial code-based repair
        plan = self._repair_plan_code_based(plan)

        # Update the stored plan reference
        self._current_plan = plan

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

        previous_errors = []
        for attempt in range(self.max_retries):
            validation_result = self._validate_plan(plan, available_plugins)

            if validation_result['valid']:
                logger.info("Plan validation successful")
                return plan

            logger.warning(f"Attempt {attempt + 1}: Plan validation failed with errors: {validation_result['errors']}")

            if attempt < self.max_retries - 1:
                logger.info("Attempting to repair plan with LLM...")
                try:
                    plan = self._repair_plan_with_llm(plan, validation_result['errors'], goal, inputs, previous_errors)
                    plan = self._repair_plan_code_based(plan)  # Repair again after LLM changes
                    self._current_plan = plan  # Update stored plan reference
                    previous_errors = validation_result['errors']  # Update previous_errors for next iteration
                except Exception as e:
                    logger.error(f"Plan repair failed on attempt {attempt + 1}: {e}")
            else:
                raise AccomplishError(
                    f"Plan validation failed after {self.max_retries} attempts. Last errors: {validation_result['errors']}",
                    "validation_error"
                )

        raise AccomplishError("Unexpected validation loop exit", "validation_error")

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

            # Recursively repair sub-plans
            if 'steps' in step and isinstance(step['steps'], list):
                logger.info(f"[Repair] Recursively repairing sub-plan in step {step.get('number')}")
                step['steps'] = self._repair_plan_code_based(step['steps'])
                
        logger.info(f"[Repair] Finished code-based repair.")
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
            step_to_repair_json = json.dumps(step_to_repair, indent=2)
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
                    # LLM returned a full plan
                    logger.info("LLM returned a full repaired plan. Replacing the old plan.")
                    return repaired_data
                elif isinstance(repaired_data, dict):
                    # This case handles when the LLM returns a single step or the full plan as a dict with numeric keys
                    if all(k.isdigit() for k in repaired_data.keys()):
                         # It's a dict of steps, convert to a list
                        logger.info("LLM returned a dictionary of steps, converting to a plan list.")
                        return [repaired_data[k] for k in sorted(repaired_data.keys(), key=int)]

                    # It's a single repaired step
                    repaired_step = repaired_data
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

    def _validate_plan(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate the plan against the schema and plugin requirements."""
        errors = []

        if not isinstance(plan, list):
            errors.append("Plan must be a list of steps")
            return {'valid': False, 'errors': errors}

        if len(plan) == 0:
            errors.append("Plan cannot be empty")
            return {'valid': False, 'errors': errors}

        # Create a map of plugins for quick lookup
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}

        # Track outputs from previous steps
        available_outputs = {}  # step_number -> set of output names

        for i, step in enumerate(plan):
            step_number = step.get('number')
            if step_number is None:
                errors.append(f"Step {i+1}: Missing 'number' field")
                continue

            # Validate required fields
            required_fields = ['actionVerb', 'description', 'inputs', 'outputs']
            for field in required_fields:
                if field not in step:
                    errors.append(f"Step {step_number}: Missing required field '{field}'")

            # Validate actionVerb
            action_verb = step.get('actionVerb')
            if action_verb:
                plugin_def = plugin_map.get(action_verb)
                if plugin_def:
                    # Validate inputs against plugin definition
                    self._validate_step_inputs(step, plugin_def, available_outputs, errors, plan, plugin_map)
                else:
                    # For novel verbs, we can't validate inputs strictly
                    logger.info(f"Step {step_number}: actionVerb '{action_verb}' not found in plugin_map. Skipping strict input validation.")

            # Validate outputs against plugin definitions (allowing custom names)
            outputs = step.get('outputs', {})
            if isinstance(outputs, dict):
                if action_verb and plugin_def:
                    # Allow custom output names - just log what we're allowing
                    validated_outputs = self._fix_step_outputs(step, plugin_def, outputs)
                    step_outputs = set(validated_outputs.keys())
                else:
                    step_outputs = set(outputs.keys())
                available_outputs[step_number] = step_outputs
            else:
                errors.append(f"Step {step_number}: 'outputs' must be a dictionary")

            # Validate recommendedRole
            recommended_role = step.get('recommendedRole')
            if recommended_role:
                allowed_roles = ['Coordinator', 'Researcher', 'Coder', 'Creative', 'Critic', 'Executor', 'Domain Expert']
                if recommended_role not in allowed_roles:
                    # Drop the recommendedRole if it's not in the allowed list
                    logger.warning(f"Step {step_number}: Invalid 'recommendedRole' '{recommended_role}'. Dropping it.")
                    del step['recommendedRole']

        return {'valid': len(errors) == 0, 'errors': errors}

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

    def _validate_step_inputs(self, step: Dict[str, Any], plugin_def: Dict[str, Any], available_outputs: Dict[int, Set[str]], errors: List[str], plan: List[Dict[str, Any]], plugin_map: Dict[str, Any]):
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
        for req_name, req_def in required_inputs.items():
            if req_name not in inputs:
                errors.append(f"Step {step_number}: Missing required input '{req_name}' for actionVerb '{step['actionVerb']}'")

        # Validate each input
        for input_name, input_def in inputs.items():
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

                            if source_output_def:
                                source_output_type = source_output_def.get('type')

                                # Now, compare the types
                                if dest_input_type and source_output_type and dest_input_type != source_output_type:
                                    # Allow 'any' type to be compatible with anything
                                    if dest_input_type != 'any' and source_output_type != 'any':
                                        errors.append(
                                            f"Step {step_number}: Input '{input_name}' for actionVerb '{step['actionVerb']}' "
                                            f"expects type '{dest_input_type}', but received incompatible type "
                                            f"'{source_output_type}' from output '{source_output_name}' of step {source_step_number}."
                                        )

