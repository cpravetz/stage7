#!/usr/bin/env python3

import json
import logging
import re
import copy
from typing import Dict, Any, List, Optional, Set, Tuple

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
        "number": {"type": "integer", "minimum": 1,"description": "Unique step number"},
        "actionVerb": {"type": "string","description": "The action to be performed in this step. It may be one of the plugin actionVerbs or a new actionVerb for a new type of task."},
        "description": {"type": "string","description": "A thorough description of the task to be performed in this step so that an agent or LLM can execute without needing external context beyond the inputs and output specification."},
        "inputs": {
            "type": "object",
            "patternProperties": {
                "^[a-zA-Z][a-zA-Z0-9_]*$": {
                    "type": "object",
                    "properties": {
                        "value": {"type": "string","description": "Constant string value for this input"},
                        "valueType": {"type": "string", "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"],"description": "The natural type of the Constant input value"},
                        "outputName": {"type": "string","description": "Reference to an output from a previous step at the same level or higher"},
                        "sourceStep": {"type": "integer", "minimum": 0,"description": "The step number that produces the output for this input. Use 0 to refer to an input from the parent step."},
                        "args": {"type": "object","description": "Additional arguments for the input"}
                    },
                    "oneOf": [
                        {"required": ["value", "valueType"]},
                        {"required": ["outputName", "sourceStep"]}
                    ],
                    "additionalProperties": False,
                }
            },
            "additionalProperties": False,
        },
        "outputs": {
            "type": "object",
            "patternProperties": {
                "^[a-zA-Z][a-zA-Z0-9_]*$": {
                    "oneOf": [
                        {"type": "string",
                         "description": "Thorough description of the expected output"
                        },
                        {
                            "type": "object",
                            "properties": {
                                "description": {
                                    "type": "string",
                                    "description": "Thorough description of the expected output"
                                },
                                "isDeliverable": {
                                    "type": "boolean",
                                    "description": "Whether this output is a final deliverable for the user"
                                },
                                "filename": {
                                    "type": "string",
                                    "description": "User-friendly filename for the deliverable"
                                }
                            },
                            "required": ["description"],
                            "additionalProperties": False
                        }
                    ]
                }
            },
            "additionalProperties": False,
        },
        "recommendedRole": {"type": "string", "description": "Suggested role type for the agent executing this step. Allowed values are Coordinator, Researcher, Coder, Creative, Critic, Executor, and Domain Expert"}
    },
    "required": ["number", "actionVerb", "inputs", "outputs"],
    "additionalProperties": False
}

PLAN_ARRAY_SCHEMA = {
    "type": "array",
    "items": PLAN_STEP_SCHEMA,
}

class PlanValidator:
    """Handles validation and repair of plans."""
    
    # Class constants
    CONTROL_FLOW_VERBS = {'WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT'}
    ALLOWED_ROLES = {'coordinator', 'researcher', 'coder', 'creative', 'critic', 'executor', 'domain expert'}
    
    def __init__(self, max_retries: int = 3, brain_call=None):
        self.max_retries = max_retries
        self.brain_call = brain_call
        self.plugin_map = {}

    def _parse_available_plugins(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse available plugins from inputs, handling various formats."""
        available_plugins_raw = inputs.get('availablePlugins', [])
        
        if isinstance(available_plugins_raw, str):
            try:
                available_plugins_raw = json.loads(available_plugins_raw)
            except json.JSONDecodeError:
                return []
        
        if isinstance(available_plugins_raw, dict):
            return available_plugins_raw.get('value', [])
        
        return available_plugins_raw if isinstance(available_plugins_raw, list) else []

    def _initialize_plugin_map(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Initializes the plugin map from the available plugins in the inputs."""
        available_plugins = self._parse_available_plugins(inputs)
        self.plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
        return available_plugins

    def _get_sub_plan(self, step: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Extracts a sub-plan from a step, if one exists."""
        # Direct steps property
        if 'steps' in step and isinstance(step['steps'], list):
            return step['steps']
        
        # Nested in inputs.steps.value
        steps_input = step.get('inputs', {}).get('steps')
        if isinstance(steps_input, dict) and isinstance(steps_input.get('value'), list):
            return steps_input['value']
        
        return None

    def _analyze_plan_tree(self, plan: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Single traversal to collect step numbers, counts, and max number."""
        step_counts = {}
        max_num = 0
        
        def traverse(steps):
            nonlocal max_num
            for step in steps:
                if not isinstance(step, dict):
                    continue
                    
                num = step.get('number')
                if num is not None:
                    step_counts[num] = step_counts.get(num, 0) + 1
                    max_num = max(max_num, int(num))
                
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    traverse(sub_plan)
        
        traverse(plan)
        logger.info(f"Plan analysis: max_step={max_num}, step_counts={step_counts}")
        return {'max': max_num, 'counts': step_counts}

    def _get_downstream_dependencies(self, start_step_number: int, plan: List[Dict[str, Any]]) -> Set[int]:
        """Builds a dependency graph and finds all downstream dependencies for a given step."""
        adj_list = {step.get('number'): [] for step in plan if step.get('number') is not None}
        
        for step in plan:
            step_num = step.get('number')
            if step_num is None:
                continue
                
            for input_def in step.get('inputs', {}).values():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    if source_step in adj_list:
                        adj_list[source_step].append(step_num)

        downstream_deps = set()
        queue = [start_step_number]
        visited = {start_step_number}

        while queue:
            current_step = queue.pop(0)
            if current_step in adj_list:
                for dependent_step in adj_list[current_step]:
                    if dependent_step not in visited:
                        visited.add(dependent_step)
                        downstream_deps.add(dependent_step)
                        queue.append(dependent_step)
        
        return downstream_deps

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any], 
                           attempt: int = 1, previous_errors: List[str] = []) -> List[Dict[str, Any]]:
        """Validate and repair plan if needed, with retries. Only throw for truly critical failures."""
        try:
            logger.info(f"--- Validation Attempt {attempt}/{self.max_retries} ---")

            if attempt > self.max_retries:
                logger.warning(f"Plan validation failed after {self.max_retries} attempts. Returning plan.")
                return plan

            # Code-based repair first
            current_plan = self._repair_plan_code_based(plan)
            available_plugins = self._initialize_plugin_map(inputs)

            # Apply input alias resolution
            current_plan = self._resolve_input_aliases(current_plan, available_plugins)

            validation_result = self._validate_plan(current_plan, available_plugins)

            # Handle wrappable errors (FOREACH candidates)
            wrappable_errors = validation_result.get('wrappable_errors', [])
            if wrappable_errors:
                logger.info(f"Found {len(wrappable_errors)} steps to wrap in FOREACH")
                error = wrappable_errors[0]
                step_to_wrap = next((s for s in current_plan if s.get('number') == error['step_number']), None)
                if step_to_wrap:
                    modified_plan = self._wrap_step_in_foreach(
                        current_plan, step_to_wrap, error['source_step_number'],
                        error['source_output_name'], error['target_input_name'], self.plugin_map
                    )
                    return self.validate_and_repair(modified_plan, goal, inputs, attempt + 1, validation_result['errors'])

            # Handle validation errors
            if validation_result['valid']:
                logger.info("Plan validation successful")
                return current_plan

            actual_errors = validation_result['errors']
            if not actual_errors:
                logger.warning("Plan validation failed but no specific errors reported.")
                return current_plan

            logger.warning(f"Attempt {attempt}: Validation failed with {len(actual_errors)} errors")

            # Try LLM repair
            try:
                repaired_plan = self._repair_plan_with_llm(current_plan, actual_errors, goal, inputs, previous_errors)
                return self.validate_and_repair(repaired_plan, goal, inputs, attempt + 1, actual_errors)
            except Exception as e:
                logger.error(f"LLM repair failed: {e}")
                # Instead of throwing, return best effort plan unless truly critical
                return current_plan
        except Exception as e:
            logger.error(f"Critical error in plan validation: {e}")
            raise AccomplishError(str(e), "critical_error")

    def _find_embedded_references(self, value: str) -> Set[str]:
        """Find all embedded references in a string value (e.g., {output_name} or [output_name])."""
        return set(re.findall(r'[{[]([a-zA-Z0-9_]+)[}\]]', value))

    def _validate_deliverable_outputs(self, step: Dict[str, Any]) -> List[str]:
        """Validate deliverable output properties."""
        errors = []
        outputs = step.get('outputs', {})
        step_number = step.get('number', 'unknown')

        for output_name, output_def in outputs.items():
            if isinstance(output_def, dict):
                is_deliverable = output_def.get('isDeliverable', False)
                filename = output_def.get('filename')
                description = output_def.get('description')

                if not description:
                    errors.append(f"Step {step_number}: Output '{output_name}' requires 'description'")

                if is_deliverable and not filename:
                    errors.append(f"Step {step_number}: Output '{output_name}' marked deliverable but missing 'filename'")

                if filename:
                    if not isinstance(filename, str) or not filename.strip():
                        errors.append(f"Step {step_number}: Output '{output_name}' filename must be non-empty string")
                    elif not is_deliverable:
                        logger.warning(f"Step {step_number}: Output '{output_name}' has filename but not marked deliverable")

        return errors

    def _validate_embedded_references(self, step: Dict[str, Any], inputs: Dict[str, Any], 
                                     available_outputs: Dict[int, Set[str]], errors: List[str]):
        """Handle embedded references in input values."""
        step_number = step.get('number', 0)

        for input_name, input_def in list(inputs.items()):
            if not isinstance(input_def, dict) or 'value' not in input_def:
                continue

            value = input_def.get('value')
            if not isinstance(value, str):
                continue

            referenced_outputs = self._find_embedded_references(value)

            for ref_output in referenced_outputs:
                # Skip if already properly declared
                if ref_output in inputs and (
                    ('outputName' in inputs[ref_output] and 'sourceStep' in inputs[ref_output]) or
                    ('value' in inputs[ref_output] and 'valueType' in inputs[ref_output])
                ):
                    continue

                # Find source step
                found_source = False
                for source_step in range(step_number - 1, -1, -1):
                    if source_step in available_outputs and ref_output in available_outputs[source_step]:
                        if ref_output not in inputs:
                            inputs[ref_output] = {"outputName": ref_output, "sourceStep": source_step}
                        found_source = True
                        break

                if not found_source:
                    errors.append(
                        f"Step {step_number}: Input '{input_name}' contains embedded reference '{{{ref_output}}}' "
                        f"but cannot find the source"
                    )

    def _repair_plan_code_based(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Automatically repair common schema violations in the plan."""
        logger.info("[Repair] Starting code-based repair...")
        
        if not isinstance(plan, list):
            logger.warning("Plan is not a list")
            return []

        plan_map = {s.get('number'): s for s in plan if isinstance(s, dict) and s.get('number') is not None}
        steps_to_remove = set()

        for step in plan:
            if not isinstance(step, dict):
                continue

            current_step_number = step.get('number')
            if current_step_number is None:
                continue

            # Ensure number is integer
            if not isinstance(step['number'], int):
                try:
                    step['number'] = int(step['number'])
                except (ValueError, TypeError):
                    step['number'] = None

            # Repair ambiguous inputs
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and all(k in input_def for k in ['outputName', 'sourceStep', 'value']):
                    logger.info(f"[Repair] Input '{input_name}' has both value and source. Preferring source.")
                    del input_def['value']

            # Repair steps input for control flow
            if step.get('actionVerb') in self.CONTROL_FLOW_VERBS:
                steps_input = step.get('inputs', {}).get('steps')
                if isinstance(steps_input, dict) and isinstance(steps_input.get('value'), str):
                    try:
                        parsed_steps = json.loads(steps_input['value'])
                        if isinstance(parsed_steps, list):
                            steps_input['value'] = parsed_steps
                            steps_input['valueType'] = "array"
                    except (json.JSONDecodeError, ValueError):
                        logger.warning(f"[Repair] Could not parse 'steps' JSON string")

            # Move direct 'steps' property to inputs
            if step.get('actionVerb') in self.CONTROL_FLOW_VERBS and 'steps' in step and isinstance(step['steps'], list):
                logger.info(f"[Repair] Step {current_step_number}: Moving 'steps' to inputs")
                if 'inputs' not in step:
                    step['inputs'] = {}
                step['inputs']['steps'] = {'value': step['steps'], 'valueType': 'array'}
                del step['steps']

            # Repair SEQUENCE with integer array
            if step.get('actionVerb') == 'SEQUENCE':
                steps_input = step.get('inputs', {}).get('steps')
                if isinstance(steps_input, dict):
                    steps_value = steps_input.get('value')
                    if isinstance(steps_value, list) and all(isinstance(item, int) for item in steps_value):
                        logger.info(f"[Repair] Step {current_step_number}: Resolving SEQUENCE integer array")
                        repaired_sub_plan = []
                        for step_num in steps_value:
                            if step_num in plan_map:
                                repaired_sub_plan.append(copy.deepcopy(plan_map[step_num]))
                                steps_to_remove.add(step_num)
                        steps_input['value'] = repaired_sub_plan

            # Recursively repair sub-plans
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                logger.info(f"[Repair] Recursively repairing sub-plan in step {current_step_number}")
                repaired_sub = self._repair_plan_code_based(sub_plan)
                
                # Update the sub-plan in place
                if 'steps' in step:
                    step['steps'] = repaired_sub
                elif 'steps' in step.get('inputs', {}):
                    step['inputs']['steps']['value'] = repaired_sub

        # Filter out moved steps
        if steps_to_remove:
            final_plan = [step for step in plan if step.get('number') not in steps_to_remove]
            logger.info(f"[Repair] Removed {len(steps_to_remove)} steps moved into SEQUENCE blocks")
            return final_plan
        
        return plan

    def _classify_error_type(self, error: str) -> str:
        """Classify validation errors into categories."""
        error_lower = error.lower()
        
        if 'missing required input' in error_lower:
            return 'missing_input'
        elif 'invalid reference' in error_lower or 'sourceStep' in error_lower:
            return 'invalid_reference'
        elif 'cannot find the source' in error_lower:
            return 'unsourced_reference'
        elif 'type mismatch' in error_lower or ('expected' in error_lower and 'got' in error_lower):
            return 'type_mismatch'
        elif 'missing required field' in error_lower:
            return 'missing_field'
        return 'generic'

    def _resolve_input_aliases(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Resolve input aliases for all steps based on plugin definitions."""
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}

        for step in plan:
            action_verb = step.get('actionVerb')
            plugin_def = plugin_map.get(action_verb)
            if not plugin_def:
                continue

            inputs = step.get('inputs', {})
            input_definitions = plugin_def.get('inputDefinitions', [])

            # Create alias map
            alias_map = {}
            for input_def in input_definitions:
                canonical_name = input_def.get('name')
                alias_map[canonical_name] = canonical_name
                for alias in input_def.get('aliases', []):
                    alias_map[alias] = canonical_name

            # Rename aliases
            inputs_to_rename = {}
            for input_name in list(inputs.keys()):
                if input_name in alias_map:
                    canonical_name = alias_map[input_name]
                    if input_name != canonical_name and canonical_name not in inputs:
                        inputs_to_rename[input_name] = canonical_name

            # Apply renames
            for old_name, new_name in inputs_to_rename.items():
                logger.info(f"Step {step.get('number')}: Resolving alias '{old_name}' -> '{new_name}'")
                inputs[new_name] = inputs.pop(old_name)

        return plan

    def _create_focused_repair_prompt(self, step_to_repair: Dict[str, Any], errors: List[str], 
                                     plugin_definition: Dict[str, Any] = None) -> str:
        """Create a focused repair prompt based on error type."""
        primary_error_type = self._classify_error_type(errors[0]) if errors else 'generic'
        step_json = json.dumps(step_to_repair, indent=2)
        errors_text = '\n'.join([f"- {error}" for error in errors])

        if primary_error_type == 'missing_input':
            missing_input = None
            for error in errors:
                match = re.search(r"Missing required input '([^']+)'", error)
                if match:
                    missing_input = match.group(1)
                    break

            plugin_info = ""
            if plugin_definition and missing_input:
                for input_def in plugin_definition.get('inputDefinitions', []):
                    if input_def.get('name') == missing_input:
                        plugin_info = f"\nRequired input '{missing_input}':\n- Type: {input_def.get('type')}\n- Description: {input_def.get('description')}"
                        break

            return f"""Fix the missing required input in this JSON step.

ERROR: {errors_text}

STEP: {step_json}
{plugin_info}

TASK: Add the missing input with either 'value'/'valueType' or 'outputName'/'sourceStep'.
Return ONLY the corrected JSON step, no explanations."""

        elif primary_error_type == 'invalid_reference':
            return f"""Fix the invalid reference in this JSON step.

ERROR: {errors_text}

STEP: {step_json}

TASK: Correct the sourceStep/outputName references.
Return ONLY the corrected JSON step, no explanations."""

        elif primary_error_type == 'unsourced_reference':
            variable = None
            for error in errors:
                match = re.search(r"contains embedded reference '\{([^}]+)\}'", error)
                if match:
                    variable = match.group(1)
                    break

            return f"""Fix the unsourced embedded reference.

ERROR: {errors_text}

STEP: {step_json}

TASK: Provide source for '{{{variable}}}' variable.
Return ONLY the corrected JSON step or plan segment, no explanations."""

        return f"""Fix the validation errors.

ERRORS: {errors_text}

STEP: {step_json}

TASK: Correct the errors while preserving intent.
Return ONLY the corrected JSON step, no explanations."""

    def _repair_plan_with_llm(self, plan: List[Dict[str, Any]], errors: List[str], goal: str, 
                             inputs: Dict[str, Any], previous_errors: List[str]) -> List[Dict[str, Any]]:
        """Ask LLM to repair the plan based on validation errors."""
        step_to_repair = None
        
        # Find step to repair
        for error in errors:
            match = re.search(r"Step (\d+):", error)
            if match:
                step_number = int(match.group(1))
                step_to_repair = next((s for s in plan if s.get('number') == step_number), None)
                if step_to_repair:
                    break

        if not step_to_repair:
            logger.warning("Could not identify step to repair. Sending whole plan.")
            step_json = json.dumps(plan, indent=2)
            prompt_type = "full_plan"
            plugin_definition = None
        else:
            # Pre-process control flow steps
            step_copy = copy.deepcopy(step_to_repair)
            if step_copy.get('actionVerb') in self.CONTROL_FLOW_VERBS and 'steps' in step_copy and isinstance(step_copy['steps'], list):
                if 'inputs' not in step_copy:
                    step_copy['inputs'] = {}
                step_copy['inputs']['steps'] = {'value': step_copy['steps'], 'valueType': 'array'}
                del step_copy['steps']

            step_json = json.dumps(step_copy, indent=2)
            prompt_type = "single_step"
            
            available_plugins = self._parse_available_plugins(inputs)
            plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
            plugin_definition = plugin_map.get(step_to_repair.get('actionVerb'))

        # Create prompt
        if prompt_type == "single_step":
            prompt = self._create_focused_repair_prompt(step_copy, errors, plugin_definition)
        else:
            errors_text = '\n'.join([f"- {error}" for error in errors])
            prompt = f"""Fix the validation errors.

ERRORS: {errors_text}

PLAN: {step_json}

Return ONLY the corrected JSON plan, no explanations."""

        logger.info(f"Attempting to repair {prompt_type} with {len(errors)} errors")

        # Try repair
        for attempt in range(self.max_retries):
            try:
                if not self.brain_call:
                    raise AccomplishError("Brain call not available", "brain_error")
                    
                response = self.brain_call(prompt, inputs, "json")
                repaired_data = json.loads(response)

                if isinstance(repaired_data, list):
                    step_numbers = [s.get('number') for s in repaired_data if isinstance(s, dict)]
                    top_level_numbers = [s.get('number') for s in plan if isinstance(s, dict)]
                    
                    has_step_one = 1 in step_numbers
                    spans_multiple_top_level = all(n in top_level_numbers for n in step_numbers) and len(step_numbers) > 1

                    if has_step_one or spans_multiple_top_level:
                        logger.info("LLM returned full plan replacement")
                        return repaired_data
                    else:
                        logger.info("LLM returned sub-steps")
                        if step_to_repair:
                            repaired_step = copy.deepcopy(step_to_repair)
                            if 'steps' in repaired_step:
                                repaired_step['steps'] = repaired_data
                            elif 'inputs' in repaired_step and 'steps' in repaired_step['inputs']:
                                if isinstance(repaired_step['inputs']['steps'], dict):
                                    repaired_step['inputs']['steps']['value'] = repaired_data
                                else:
                                    repaired_step['inputs']['steps'] = {"value": repaired_data, "valueType": "array"}
                            
                            for i, step in enumerate(plan):
                                if step.get('number') == repaired_step.get('number'):
                                    plan[i] = repaired_step
                                    return plan
                        
                        return repaired_data
                        
                elif isinstance(repaired_data, dict):
                    if all(k.isdigit() for k in repaired_data.keys()):
                        return [repaired_data[k] for k in sorted(repaired_data.keys(), key=int)]

                    repaired_step = repaired_data
                    if step_to_repair and repaired_step.get('number') != step_to_repair.get('number'):
                        raise ValueError(f"Repaired step number mismatch")

                    for i, step in enumerate(plan):
                        if step.get('number') == repaired_step.get('number'):
                            plan[i] = repaired_step
                            return plan

                    raise ValueError("Repaired step number not found in plan")
                else:
                    raise ValueError("LLM response not valid JSON")

            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"LLM repair failed attempt {attempt + 1}: {e}")
                if attempt == self.max_retries - 1:
                    raise AccomplishError(f"LLM repair failed after {self.max_retries} attempts", "repair_error")

        raise AccomplishError("Unexpected repair loop exit", "repair_error")

    def _validate_plan(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]], 
                      parent_outputs: Dict[int, Set[str]] = None) -> Dict[str, Any]:
        """Validate the plan against schema and plugin requirements."""
        errors = []
        wrappable_errors = []

        if not isinstance(plan, list):
            return {'valid': False, 'errors': ["Plan must be a list"], 'wrappable_errors': []}
        
        if not plan:
            return {'valid': True, 'errors': [], 'wrappable_errors': []}
        
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
        available_outputs = parent_outputs.copy() if parent_outputs else {}

        # Check for duplicate step numbers
        analysis = self._analyze_plan_tree(plan)
        duplicate_numbers = [num for num, count in analysis['counts'].items() if count > 1]
        if duplicate_numbers:
            errors.extend([f"Duplicate step number {num} found" for num in duplicate_numbers])
        
        # Populate available outputs
        for step in plan:
            step_number = step.get('number')
            if step_number is None:
                continue
                
            step_outputs = set()
            outputs_dict = step.get('outputs', {})
        
            # Repair list to dict
            if isinstance(outputs_dict, list):
                repaired = {}
                for i, item in enumerate(outputs_dict):
                    if isinstance(item, dict) and 'description' in item:
                        base_name = re.sub(r'[^a-zA-Z0-9_]', '', item['description'].split(' ')[0]).lower() or "output"
                        repaired[f"{base_name}_{i}"] = item
                    else:
                        repaired[f"output_{i}"] = {'description': str(item)}
                step['outputs'] = repaired
                outputs_dict = repaired

            if isinstance(outputs_dict, dict):
                for output_name in outputs_dict.keys():
                    step_outputs.add(output_name)
                    
                    action_verb = step.get('actionVerb')
                    plugin_def = plugin_map.get(action_verb)
                    if plugin_def:
                        output_defs = plugin_def.get('outputDefinitions', [])
                        direct_match = next((out for out in output_defs if out.get('name') == output_name), None)
                        
                        if not direct_match and len(output_defs) == 1:
                            inferred_name = output_defs[0].get('name')
                            if inferred_name:
                                step_outputs.add(inferred_name)
                
            available_outputs[step_number] = step_outputs
        
        # Validate each step
        for i, step in enumerate(plan):
            step_number = step.get('number')
            if step_number is None:
                errors.append(f"Step {i+1}: Missing 'number' field")
                continue
        
            for field in ['actionVerb', 'inputs', 'outputs']:
                if field not in step:
                    errors.append(f"Step {step_number}: Missing field '{field}'")
        
            action_verb = step.get('actionVerb')
            if action_verb:
                plugin_def = plugin_map.get(action_verb)
                if plugin_def:
                    self._validate_step_inputs(step, plugin_def, available_outputs, errors, wrappable_errors, plan, plugin_map)
        
            errors.extend(self._validate_deliverable_outputs(step))
        
            # Recursive validation for control flow
            if action_verb in self.CONTROL_FLOW_VERBS:
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    logger.info(f"Recursively validating sub-plan for step {step_number}")
                    sub_context = available_outputs.copy()
                    if action_verb == 'FOREACH':
                        # For FOREACH, the sub_context should see 'item' and 'index' as outputs of the FOREACH step
                        sub_context[step_number] = {'item', 'index'}
                    
                    sub_result = self._validate_plan(sub_plan, available_plugins, sub_context)
                    if not sub_result['valid']:
                        errors.extend([f"Sub-plan of step {step_number}: {e}" for e in sub_result['errors']])
                    
                    # Only extend wrappable_errors if the sub-plan validation didn't already handle it
                    if not sub_result.get('handled_wrappable', False):
                        wrappable_errors.extend(sub_result.get('wrappable_errors', []))
        
            # Validate recommendedRole
            recommended_role = step.get('recommendedRole')
            if recommended_role:
                if recommended_role.lower() in [r.lower() for r in self.ALLOWED_ROLES]:
                    step['recommendedRole'] = recommended_role.lower()
                else:
                    logger.warning(f"Step {step_number}: Invalid recommendedRole '{recommended_role}', dropping")
                    del step['recommendedRole']
        
        return {'valid': len(errors) == 0 and len(wrappable_errors) == 0, 'errors': errors, 'wrappable_errors': wrappable_errors}

    def _validate_step_inputs(self, step: Dict[str, Any], plugin_def: Dict[str, Any], 
                              available_outputs: Dict[int, Set[str]], errors: List[str], 
                              wrappable_errors: List[Dict[str, Any]], plan: List[Dict[str, Any]], 
                              plugin_map: Dict[str, Any]):
        """Validate inputs for a single step against plugin definition."""
        step_number = step['number']
        inputs = step.get('inputs', {})
        input_definitions = plugin_def.get('inputDefinitions', [])

        # Validate embedded references
        self._validate_embedded_references(step, inputs, available_outputs, errors)

        # Check required inputs
        required_inputs = {inp['name']: inp for inp in input_definitions if inp.get('required', False)}
        
        for req_name in required_inputs.keys():
            if req_name == 'missionId':  # Always injected by runtime
                continue
            if req_name not in inputs:
                errors.append(f"Step {step_number}: Missing required input '{req_name}' for '{step['actionVerb']}'")

        # Validate each input
        for input_name, input_def in inputs.items():
            # Special case for FOREACH loop items
            if isinstance(input_def, dict) and input_def.get('outputName') == 'item':
                continue

            # Special handling for control flow 'steps'
            if step.get('actionVerb') in self.CONTROL_FLOW_VERBS and input_name == 'steps':
                is_valid = isinstance(input_def, list) or (
                    isinstance(input_def, dict) and isinstance(input_def.get('value'), list)
                )
                if not is_valid:
                    errors.append(f"Step {step_number}: Input 'steps' must be an array")
                continue

            if not isinstance(input_def, dict):
                errors.append(f"Step {step_number}: Input '{input_name}' must be a dictionary")
                continue

            has_value = 'value' in input_def
            has_output_name = 'outputName' in input_def
            has_source_step = 'sourceStep' in input_def

            # Validate input structure
            if has_value and has_output_name:
                logger.warning(f"Step {step_number}: Input '{input_name}' has both value and outputName")
            elif has_output_name and not has_source_step:
                errors.append(f"Step {step_number}: Input '{input_name}' has outputName but missing sourceStep")
            elif has_source_step and not has_output_name:
                errors.append(f"Step {step_number}: Input '{input_name}' has sourceStep but missing outputName")
            elif not has_value and not has_output_name:
                errors.append(f"Step {step_number}: Input '{input_name}' must have value or outputName/sourceStep")

            # Validate sourceStep references
            if has_source_step:
                source_step_num = input_def['sourceStep']
                if source_step_num != 0:  # 0 means parent input
                    if source_step_num not in available_outputs:
                        errors.append(f"Step {step_number}: Input '{input_name}' references non-existent step {source_step_num}")
                    elif has_output_name:
                        output_name = input_def['outputName']
                        if output_name not in available_outputs.get(source_step_num, set()):
                            errors.append(f"Step {step_number}: Input '{input_name}' references non-existent output '{output_name}' from step {source_step_num}")
            
            # Type compatibility check
            if has_source_step and has_output_name:
                self._check_type_compatibility(step, input_name, input_def, input_definitions, 
                                              plan, plugin_map, errors, wrappable_errors)

    def _check_type_compatibility(self, step: Dict[str, Any], input_name: str, input_def: Dict[str, Any],
                                  input_definitions: List[Dict[str, Any]], plan: List[Dict[str, Any]],
                                  plugin_map: Dict[str, Any], errors: List[str], 
                                  wrappable_errors: List[Dict[str, Any]]):
        """Check type compatibility between source output and destination input."""
        source_step_number = input_def['sourceStep']
        source_output_name = input_def['outputName']
        step_number = step['number']

        # Get destination input type
        dest_input_def = next((inp for inp in input_definitions if inp.get('name') == input_name), None)
        if not dest_input_def:
            return
        
        dest_input_type = dest_input_def.get('type') # Corrected from 'valueType'
        if not dest_input_type:
            return

        # Find source step
        source_step = next((s for s in plan if s.get('number') == source_step_number), None)
        if not source_step:
            return

        source_action_verb = source_step.get('actionVerb')
        source_plugin_def = plugin_map.get(source_action_verb)
        if not source_plugin_def:
            return

        source_output_type = None
        source_output_defs = source_plugin_def.get('outputDefinitions', [])

        # 1. Try to find direct match in plugin's output definitions by name
        direct_match_output_def = next((out for out in source_output_defs if out.get('name') == source_output_name), None)
        if direct_match_output_def:
            source_output_type = direct_match_output_def.get('type')

        # 2. If no direct match, and only one output definition exists for the source plugin, use its type
        # This handles cases where the plan might use a custom output name for a plugin with a single output.
        if not source_output_type and len(source_output_defs) == 1:
            single_output_def = source_output_defs[0]
            source_output_type = single_output_def.get('type')

        if not source_output_type:
            # If we still don't have a source_output_type, it means we couldn't determine it from the plugin manifest.
            # This will cause is_mismatch to be True, which is the desired behavior for an unknown type.
            errors.append(f"Step {step_number}: Could not determine type for output '{original_source_output_name}' from step {source_step_number}")
            return # Cannot proceed with type compatibility if source type is unknown

        # Check for type mismatch
        is_mismatch = False

        # Allow implicit conversions
        if dest_input_type == 'string' and source_output_type in ['boolean', 'number']:
            return  # Allowed
        elif dest_input_type == 'array' and source_output_type == 'string':
            return  # Allowed
        else:
            is_mismatch = (dest_input_type != source_output_type and
                          dest_input_type != 'any' and source_output_type != 'any')

        # Check if wrappable in FOREACH
        is_wrappable = (dest_input_type in ['string', 'number', 'object'] and
                       source_output_type in ['array', 'list'])

        if is_wrappable and step.get('actionVerb') != 'FOREACH':
            actual_output_name = source_output_def.get('name')
            wrappable_errors.append({
                "step_number": step_number,
                "source_step_number": source_step_number,
                "source_output_name": actual_output_name,
                "target_input_name": input_name
            })
        elif is_mismatch:
            errors.append(
                f"Step {step_number}: Input '{input_name}' expects type '{dest_input_type}', "
                f"but received '{source_output_type}' from step {source_step_number} output '{source_output_name}'"
            )

    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], step_to_wrap: Dict[str, Any], 
                              source_step_number: int, source_output_name: str, target_input_name: str, 
                              plugin_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Wraps a step in a FOREACH loop, including all dependent steps."""
        logger.info(f"Wrapping step {step_to_wrap['number']} in FOREACH for input '{target_input_name}'")

        analysis = self._analyze_plan_tree(plan)
        foreach_step_number = analysis['max'] + 1
        step_to_wrap_original_number = step_to_wrap['number']

        # Collect steps to move into subplan, ensuring they are deep-copied
        downstream_deps = self._get_downstream_dependencies(step_to_wrap_original_number, plan)
        moved_step_numbers = {step_to_wrap_original_number} | downstream_deps
        
        sub_plan = []
        for step_num in sorted(list(moved_step_numbers)):
            original_step = next((s for s in plan if s.get('number') == step_num), None)
            if original_step:
                new_step = copy.deepcopy(original_step)
                # If this is the step that triggered the wrap, update its input
                if new_step['number'] == step_to_wrap_original_number:
                    if target_input_name in new_step.get('inputs', {}):
                        new_step['inputs'][target_input_name] = {
                            "outputName": "item",
                            "sourceStep": foreach_step_number
                        }
                sub_plan.append(new_step)

        # Collect outputs from the sub-plan for the FOREACH step's outputs
        sub_plan_outputs = {}
        for step in sub_plan:
            for out_name, out_desc in step.get('outputs', {}).items():
                sub_plan_outputs[out_name] = out_desc

        # Create the new FOREACH step with its unique number
        foreach_step = {
            "number": foreach_step_number,
            "actionVerb": "FOREACH",
            "description": f"Iterate over '{source_output_name}' from step {source_step_number}",
            "inputs": {
                "array": {"outputName": source_output_name, "sourceStep": source_step_number},
                "steps": {"value": sub_plan, "valueType": "array"}
            },
            "outputs": sub_plan_outputs,
            "recommendedRole": "Coordinator"
        }

        # Reconstruct the plan, removing moved steps and inserting the FOREACH step
        new_plan = []
        inserted_foreach = False
        for step in plan:
            if step['number'] not in moved_step_numbers:
                new_plan.append(step)
            elif step['number'] == step_to_wrap_original_number and not inserted_foreach:
                new_plan.append(foreach_step)
                inserted_foreach = True

        # Update any steps outside the loop that depended on the moved steps
        for step in new_plan:
            if step['number'] == foreach_step_number:
                continue
            
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and input_def.get('sourceStep') in moved_step_numbers:
                    logger.info(f"Updating step {step['number']} input '{input_name}' to reference FOREACH {foreach_step_number}")
                    # The outputName from the moved step should be preserved as the FOREACH loop will expose it.
                    input_def['sourceStep'] = foreach_step_number

        logger.info(f"Created FOREACH step {foreach_step_number} with {len(sub_plan)} sub-steps")
        return new_plan