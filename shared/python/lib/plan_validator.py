#!/usr/bin/env python3

import uuid
import json
import logging
import re
import copy
import os
import sys
from typing import Dict, Any, List, Optional, Set, Tuple

# Configure logging if not already configured
if not logging.root.handlers:
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
    )

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG) # Ensure DEBUG level is active

logger.debug("plan_validator.py: Module loaded.")

class AccomplishError(Exception):
    """Custom exception for ACCOMPLISH plugin errors"""
    def __init__(self, message: str, error_type: str = "general_error"):
        super().__init__(message)
        self.error_type = error_type

# Plan step schema for validation
PLAN_STEP_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string", "format": "uuid", "description": "Unique step ID (UUID)"},
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
                        "sourceStep": {"type": "string", "format": "uuid", "description": "The step ID (UUID) that produces the output for this input. Use '0' to refer to an input from the parent step."}, 
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
                                "description": {"type": "string","description": "Thorough description of the expected output"},
                                "type": {"type": "string", "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any", "list", "list[string]", "list[number]", "list[boolean]", "list[object]", "list[any]"],"description": "The type of the output"},
                                "isDeliverable": {"type": "boolean","description": "Whether this output is a final deliverable for the user"},
                                "filename": {"type": "string","description": "User-friendly filename for the deliverable"}
                            },
                            "required": ["description", "type"],
                            "additionalProperties": False
                        }
                    ]
                }
            },
            "additionalProperties": False,
        },
        "recommendedRole": {"type": "string", "description": "Suggested role type for the agent executing this step. Allowed values are Coordinator, Researcher, Coder, Creative, Critic, Executor, and Domain Expert"}
    },
    "required": ["id", "actionVerb", "inputs", "outputs"],
    "additionalProperties": False
}

PLAN_ARRAY_SCHEMA = {
    "type": "array",
    "items": PLAN_STEP_SCHEMA,
}

logger.debug("plan_validator.py: PlanValidator class definition starting.")
class PlanValidator:
    """Handles validation and repair of plans."""
    
    # Class constants
    CONTROL_FLOW_VERBS = {'WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT', 'REGROUP'}
    ALLOWED_ROLES = {'coordinator', 'researcher', 'coder', 'creative', 'critic', 'executor', 'domain expert'}
    
    def __init__(self, max_retries: int = 5, brain_call=None):
        logger.debug("PlanValidator: Initializing PlanValidator.")
        self.max_retries = max_retries
        self.brain_call = brain_call
        self.plugin_map = {}

    def _parse_available_plugins(self, inputs: Dict[str, Any]) -> List[Any]:
        """Parse available plugins from inputs, handling various formats."""
        logger.debug("PlanValidator: _parse_available_plugins called.")
        available_plugins_raw = inputs.get('availablePlugins', [])
        
        if isinstance(available_plugins_raw, str):
            try:
                available_plugins_raw = json.loads(available_plugins_raw)
            except json.JSONDecodeError:
                logger.debug("PlanValidator: _parse_available_plugins - raw string is not JSON. Returning empty list.")
                return []
        
        if isinstance(available_plugins_raw, dict):
            logger.debug("PlanValidator: _parse_available_plugins - raw is dict, extracting 'value'.")
            return available_plugins_raw.get('value', [])
        
        logger.debug(f"PlanValidator: _parse_available_plugins - returning list (type: {type(available_plugins_raw)}).")
        return available_plugins_raw if isinstance(available_plugins_raw, list) else []

    def _initialize_plugin_map(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Initializes the plugin map from the available plugins in the inputs."""
        logger.debug("PlanValidator: _initialize_plugin_map called.")
        available_plugins = self._parse_available_plugins(inputs)
        self.plugin_map = {}
        
        if not available_plugins:
            logger.debug("PlanValidator: _initialize_plugin_map - no available plugins.")
            return []

        if not isinstance(available_plugins, list) or not all(isinstance(p, dict) for p in available_plugins):
            logger.error(f"PlanValidator: Invalid availablePlugins format. Expected a list of dictionaries, got: {type(available_plugins)}")
            return []

        # List of manifests
        for plugin in available_plugins:
            action_verb = plugin.get('verb')
            if action_verb:
                self.plugin_map[action_verb.upper()] = plugin
        logger.debug(f"PlanValidator: Initialized plugin_map with {len(self.plugin_map)} entries. Keys: {list(self.plugin_map.keys())}")
        return available_plugins

    def _get_sub_plan(self, step: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Extracts a sub-plan from a step, if one exists."""
        logger.debug(f"PlanValidator: _get_sub_plan called for step ID: {step.get('id')}")
        # Direct steps property
        if 'steps' in step and isinstance(step['steps'], list):
            logger.debug(f"PlanValidator: _get_sub_plan - found direct 'steps' property.")
            return step['steps']
        
        # Nested in inputs.steps.value
        steps_input = step.get('inputs', {}).get('steps')
        if isinstance(steps_input, dict) and isinstance(steps_input.get('value'), list):
            logger.debug(f"PlanValidator: _get_sub_plan - found nested 'inputs.steps.value'.")
            return steps_input['value']
        
        logger.debug(f"PlanValidator: _get_sub_plan - no sub-plan found for step ID: {step.get('id')}.")
        return None

    def _get_downstream_dependencies(self, start_step_id: str, plan: List[Dict[str, Any]], all_steps: Dict[str, Any]) -> Set[str]:
        """Builds a dependency graph and finds all downstream dependencies for a given step."""
        logger.debug(f"PlanValidator: _get_downstream_dependencies called for start_step_id: {start_step_id}")
        adj_list = {}
        
        def build_adj_list(current_plan):
            logger.debug(f"PlanValidator: build_adj_list - traversing plan of length {len(current_plan)}.")
            for step in current_plan:
                step_id = step.get('id')
                if step_id is None:
                    continue
                if step_id not in adj_list:
                    adj_list[step_id] = []

                for input_def in step.get('inputs', {}).values():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        source_step = input_def['sourceStep']
                        if source_step != '0': # Changed from 0 to '0' as sourceStep is now string
                            if source_step not in adj_list:
                                adj_list[source_step] = []
                            adj_list[source_step].append(step_id)
                
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    logger.debug(f"PlanValidator: build_adj_list - recursing into sub-plan for step {step_id}.")
                    build_adj_list(sub_plan)

        build_adj_list(plan)
        logger.debug(f"PlanValidator: _get_downstream_dependencies - Adjacency list built: {adj_list}")

        downstream_deps = set()
        queue = [start_step_id]
        visited = {start_step_id}

        while queue:
            current_step = queue.pop(0)
            if current_step in adj_list:
                for dependent_step in adj_list[current_step]:
                    if dependent_step not in visited:
                        dependent_step_obj = all_steps.get(dependent_step)
                        if dependent_step_obj and dependent_step_obj.get('actionVerb') == 'REFLECT':
                            logger.info(f"Excluding REFLECT step {dependent_step} from FOREACH wrapping - it should remain at top level")
                            continue
                        
                        downstream_deps.add(dependent_step)
                        visited.add(dependent_step)
                        queue.append(dependent_step)
        logger.debug(f"PlanValidator: _get_downstream_dependencies - Found downstream dependencies for {start_step_id}: {downstream_deps}")
        return downstream_deps

    def _is_valid_uuid(self, uuid_string: str) -> bool:
        """Check if a string is a valid UUID and not a placeholder."""
        logger.debug(f"PlanValidator: _is_valid_uuid called for: {uuid_string}")
        if not isinstance(uuid_string, str) or not uuid_string:
            return False
        # Reject known placeholder UUIDs
        if "0000-0000-0000" in uuid_string:
            logger.debug(f"PlanValidator: _is_valid_uuid - '{uuid_string}' is a placeholder UUID.")
            return False
        try:
            uuid.UUID(uuid_string)
            return True
        except ValueError:
            logger.debug(f"PlanValidator: _is_valid_uuid - '{uuid_string}' is not a valid UUID.")
            return False

    def _recursively_update_dependencies(self, plan: List[Dict[str, Any]], moved_step_ids: Set[str], regroup_step_id: str):
        """Recursively update dependencies pointing to moved steps."""
        logger.debug(f"PlanValidator: _recursively_update_dependencies called.")
        for step in plan:
            if not isinstance(step, dict):
                continue

            # Update dependencies in the current step's inputs
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and input_def.get('sourceStep') in moved_step_ids:
                    original_source = input_def.get('sourceStep')
                    logger.info(f"PlanValidator: Updating step {step['id']} input '{input_name}' to reference REGROUP {regroup_step_id} result (was pointing to moved step {original_source})")
                    input_def['sourceStep'] = regroup_step_id
                    input_def['outputName'] = 'result'  # REGROUP's output name

            # Recurse into sub-plans
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                logger.debug(f"PlanValidator: _recursively_update_dependencies - recursing into sub-plan for step {step.get('id')}.")
                self._recursively_update_dependencies(sub_plan, moved_step_ids, regroup_step_id)
        logger.debug("PlanValidator: _recursively_update_dependencies completed.")

    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], step_to_wrap_id: str,
                              source_step_id: str, source_output_name: str, target_input_name: str,
                              plugin_map: Dict[str, Any], all_steps: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Wraps a step in a FOREACH loop, including all dependent steps."""
        logger.debug(f"PlanValidator: _wrap_step_in_foreach called for step ID: {step_to_wrap_id}")
        
        step_to_wrap_obj = all_steps.get(step_to_wrap_id)
        if not step_to_wrap_obj:
            logger.error(f"PlanValidator: Step to wrap with ID {step_to_wrap_id} not found in all_steps.")
            return plan

        logger.info(f"PlanValidator: Wrapping step {step_to_wrap_obj['id']} in FOREACH for input '{target_input_name}'")

        # Collect steps to move into subplan, ensuring they are deep-copied
        downstream_deps = self._get_downstream_dependencies(step_to_wrap_id, plan, all_steps)
        moved_step_ids = {step_to_wrap_id} | downstream_deps
        logger.debug(f"PlanValidator: _wrap_step_in_foreach - Moved step IDs: {moved_step_ids}")

        sub_plan_steps_ordered = []
        def find_and_order_moved_steps(current_plan_segment):
            if not isinstance(current_plan_segment, list):
                return
            for step in current_plan_segment:
                if not isinstance(step, dict):
                    continue
                if step.get('id') in moved_step_ids:
                    if not any(s['id'] == step.get('id') for s in sub_plan_steps_ordered):
                        sub_plan_steps_ordered.append(step)
                
                sub_p = self._get_sub_plan(step)
                if sub_p:
                    find_and_order_moved_steps(sub_p)

        find_and_order_moved_steps(plan)

        sub_plan = []
        for original_step in sub_plan_steps_ordered:
            new_step = copy.deepcopy(original_step)
            # If this is the step that triggered the wrap, update its input
            if new_step['id'] == step_to_wrap_id:
                logger.debug(f"PlanValidator: _wrap_step_in_foreach - Updating input for step {new_step['id']}.")
                # Check if the target_input_name is a nested reference (e.g., "script_parameters.search_results")
                if '.' in target_input_name or '[' in target_input_name:
                    # Split the target_input_name into parts to traverse the nested structure
                    parts = re.findall(r'([a-zA-Z0-9_]+)(?:\[(\d+)\])?', target_input_name)
                        
                    current_input_level = new_step['inputs']
                    for i, (part_name, part_index) in enumerate(parts):
                        if part_index: # It's an array index
                            if isinstance(current_input_level.get(part_name), dict) and 'value' in current_input_level[part_name]:
                                try:
                                    list_value = json.loads(current_input_level[part_name]['value'])
                                    if isinstance(list_value, list) and int(part_index) < len(list_value):
                                        if i == len(parts) - 1: # Last part, update the nested reference
                                            if isinstance(list_value[int(part_index)], dict) and 'sourceStep' in list_value[int(part_index)]:
                                                list_value[int(part_index)]['sourceStep'] = "0"
                                                list_value[int(part_index)]['outputName'] = "item"
                                        current_input_level[part_name]['value'] = json.dumps(list_value)
                                        current_input_level = list_value[int(part_index)] # Move deeper
                                    else:
                                        logger.warning(f"PlanValidator: Step {new_step['id']}: Invalid list index or not a list at '{part_name}[{part_index}]'")
                                        break
                                except json.JSONDecodeError:
                                    logger.warning(f"PlanValidator: Step {new_step['id']}: Could not parse JSON for '{part_name}' at index '{part_index}'")
                                    break
                            else:
                                logger.warning(f"PlanValidator: Step {new_step['id']}: Input '{part_name}' not found or not a dict with 'value' for index '{part_index}'")
                                break
                        else: # It's a dictionary key
                            if part_name in current_input_level and isinstance(current_input_level.get(part_name), dict):
                                if i == len(parts) - 1: # Last part, update the reference
                                    current_input_level[part_name] = {
                                        "outputName": "item",
                                        "sourceStep": "0"  # "0" means parent step (the FOREACH step)
                                    }
                                else:
                                    # If it's a nested dictionary, move deeper
                                    if 'value' in current_input_level[part_name] and isinstance(current_input_level[part_name]['value'], str):
                                        try:
                                            nested_value = json.loads(current_input_level[part_name]['value'])
                                            if isinstance(nested_value, dict):
                                                current_input_level = nested_value
                                            else:
                                                logger.warning(f"PlanValidator: Step {new_step['id']}: Nested input '{part_name}' is not a dictionary.")
                                                break
                                        except json.JSONDecodeError:
                                            logger.warning(f"PlanValidator: Step {new_step['id']}: Could not parse JSON for nested input '{part_name}'.")
                                            break
                                    else:
                                        current_input_level = current_input_level[part_name]
                            else:
                                logger.warning(f"PlanValidator: Step {new_step['id']}: Input '{part_name}' not found or not a dictionary.")
                                break
                else:
                    # Original logic for direct input name
                    if target_input_name in new_step.get('inputs', {}):
                        new_step['inputs'][target_input_name] = {
                            "outputName": "item",
                            "sourceStep": "0"  # "0" means parent step (the FOREACH step)
                        }
                sub_plan.append(new_step)
        logger.debug(f"PlanValidator: _wrap_step_in_foreach - Sub-plan created with {len(sub_plan)} steps.")

        # Create the FOREACH step
        foreach_step_id = str(uuid.uuid4())
        foreach_step = {
            "id": foreach_step_id,
            "actionVerb": "FOREACH",
            "description": f"Iterate over '{source_output_name}' from step {source_step_id}",
            "inputs": {
                "array": {"outputName": source_output_name, "sourceStep": source_step_id},
                "steps": {"value": sub_plan, "valueType": "array"}
            },
            "outputs": {
                "steps": {"description": "The endsteps to be executed for each instance of the subplan.", "type": "array"},
            },
            "recommendedRole": "Coordinator"
        }
        logger.debug(f"PlanValidator: _wrap_step_in_foreach - FOREACH step created: {foreach_step_id}.")

        # Create the REGROUP step
        regroup_step_id = str(uuid.uuid4())
        regroup_step = {
            "id": regroup_step_id,
            "actionVerb": "REGROUP",
            "description": f"Regroup results from FOREACH step {foreach_step_id}",
            "inputs": {
                "stepIdsToRegroup": {"outputName": "steps", "sourceStep": foreach_step_id, "valueType": "array"},
            },
            "outputs": {
                "result": {"description": "A single array containing all the items from the input arrays.", "type": "array"}
            },
            "recommendedRole": "Coordinator"
        }
        logger.debug(f"PlanValidator: _wrap_step_in_foreach - REGROUP step created: {regroup_step_id}.")

        def _rebuild_recursively(current_plan, moved_ids, fe_step, rg_step, wrap_id):
            output_plan = []
            inserted_fe_rg = False
            for s in current_plan:
                if s.get('id') == wrap_id and not inserted_fe_rg:
                    output_plan.append(fe_step)
                    output_plan.append(rg_step)
                    inserted_fe_rg = True
                    continue
                elif s.get('id') in moved_ids:
                    continue
                else:
                    sub_p = self._get_sub_plan(s)
                    if sub_p:
                        logger.debug(f"PlanValidator: _rebuild_recursively - recursing into sub-plan for step {s.get('id')}.")
                        rebuilt_sub = _rebuild_recursively(sub_p, moved_ids, fe_step, rg_step, wrap_id)
                        if 'steps' in s:
                            s['steps'] = rebuilt_sub
                        elif 'inputs' in s and 'steps' in s['inputs'] and 'value' in s['inputs']['steps']:
                            s['inputs']['steps']['value'] = rebuilt_sub
                    output_plan.append(s)
            return output_plan

        new_plan = _rebuild_recursively(plan, moved_step_ids, foreach_step, regroup_step, step_to_wrap_id)

        # Update any steps outside the loop that depended on any of the moved steps
        for step in new_plan:
            if step.get('id') in [foreach_step_id, regroup_step_id]:
                continue
            
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and input_def.get('sourceStep') in moved_step_ids:
                    original_source = input_def.get('sourceStep')
                    logger.info(f"PlanValidator: Updating step {step['id']} input '{input_name}' to reference REGROUP {regroup_step_id} result (was pointing to moved step {original_source})")
                    input_def['sourceStep'] = regroup_step_id
                    input_def['outputName'] = 'result'

        logger.info(f"PlanValidator: Created FOREACH step {foreach_step_id} with {len(sub_plan)} sub-steps")
        return new_plan

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any],
                           attempt: int = 1, previous_errors: List[str] = []) -> List[Dict[str, Any]]:
        """
        Validates and repairs a plan using a flattened, iterative approach.
        This method first builds a comprehensive, flat representation of the entire plan,
        then iterates through the steps to validate and repair them in a single pass.
        """
        logger.info(f"--- Plan Validation Attempt {attempt}/{self.max_retries} ---")
        logger.debug(f"PlanValidator.validate_and_repair: Starting attempt {attempt}.")
        if attempt > self.max_retries:
            logger.error(f"PlanValidator: Plan validation failed after {self.max_retries} attempts. Returning original plan.")
            return plan

        try:
            logger.debug("PlanValidator: validate_and_repair - Initializing plugin map.")
            # Initialize plugin definitions from inputs
            self.plugin_map.clear()
            available_plugins = self._initialize_plugin_map(inputs)

            logger.debug("PlanValidator: validate_and_repair - Building flat plan representation.")
            # 1. Build the flat representation of the plan
            flat_plan_repr = self._build_flat_plan_representation(plan)
            all_steps = flat_plan_repr['steps']
            step_parents = flat_plan_repr['parents']
            step_outputs = flat_plan_repr['outputs']
            uuid_map = flat_plan_repr['uuid_map']
            
            logger.debug(f"PlanValidator: validate_and_repair - UUID map: {uuid_map}")
            # Apply UUID fixes throughout the entire plan structure using the generated map
            if uuid_map:
                logger.debug("PlanValidator: validate_and_repair - Applying UUID map recursively.")
                plan = self._apply_uuid_map_recursive(plan, uuid_map)
                # Re-build representation after modification
                logger.debug("PlanValidator: validate_and_repair - Re-building flat plan representation after UUID fix.")
                flat_plan_repr = self._build_flat_plan_representation(plan)
                all_steps = flat_plan_repr['steps']
                step_parents = flat_plan_repr['parents']
                step_outputs = flat_plan_repr['outputs']

            # 2. Iteratively validate and repair
            errors = []
            wrappable_errors = []
            
            logger.debug("PlanValidator: validate_and_repair - Getting execution order.")
            # Get a topological sort of the plan if possible, otherwise use plan order
            execution_order = self._get_execution_order(plan, all_steps)
            logger.debug(f"PlanValidator: validate_and_repair - Execution order: {execution_order}")

            for step_id in execution_order:
                step = all_steps.get(step_id)
                if not step:
                    logger.warning(f"PlanValidator: validate_and_repair - Step ID {step_id} not found in all_steps during iteration.")
                    continue

                logger.debug(f"PlanValidator: validate_and_repair - Validating step: {step_id}")
                # Determine available outputs for the current step
                current_available_outputs = self._get_available_outputs_for_step(step_id, execution_order, step_outputs, step_parents, all_steps)
                
                # Validate the step
                step_errors, step_wrappable = self._validate_step(
                    step,
                    current_available_outputs,
                    all_steps,
                    step_parents
                )
                errors.extend(step_errors)
                wrappable_errors.extend(step_wrappable)
            logger.debug(f"PlanValidator: validate_and_repair - Total errors: {len(errors)}, Wrappable errors: {len(wrappable_errors)}")

            # 3. Handle errors and decide on next actions
            if not errors and not wrappable_errors:
                logger.info("PlanValidator: Plan validation successful.")
                return plan

            if wrappable_errors:
                logger.info(f"PlanValidator: Found {len(wrappable_errors)} candidates for FOREACH wrapping.")
                # For simplicity, handle one wrappable error per attempt
                error_to_wrap = wrappable_errors[0]
                modified_plan = self._wrap_step_in_foreach(
                    plan,
                    error_to_wrap['step_id'],
                    error_to_wrap['source_step_id'],
                    error_to_wrap['source_output_name'],
                    error_to_wrap['target_input_name'],
                    self.plugin_map,
                    all_steps
                )
                # After modification, re-run the entire validation process
                logger.debug("PlanValidator: validate_and_repair - Re-running validation after FOREACH wrapping.")
                return self.validate_and_repair(modified_plan, goal, inputs, attempt + 1, errors)

            if errors:
                logger.warning(f"PlanValidator: Plan validation failed with {len(errors)} errors: {errors}")
                # Attempt LLM repair if configured
                if self.brain_call:
                    try:
                        logger.debug("PlanValidator: validate_and_repair - Attempting LLM repair.")
                        repaired_plan = self._repair_plan_with_llm(plan, errors, goal, inputs, previous_errors)
                        # After LLM repair, re-run the entire validation process
                        logger.debug("PlanValidator: validate_and_repair - Re-running validation after LLM repair.")
                        return self.validate_and_repair(repaired_plan, goal, inputs, attempt + 1, errors)
                    except Exception as e:
                        logger.error(f"PlanValidator: LLM repair failed: {e}. Returning plan as-is.")
                        return plan
                else:
                    logger.warning("PlanValidator: No brain_call configured. Cannot attempt LLM repair.")
                    return plan
            
            return plan

        except Exception as e:
            logger.critical(f"PlanValidator: Critical error during plan validation: {e}", exc_info=True)
            # In case of a critical failure, return the plan to avoid losing it.
            return plan

    def _build_flat_plan_representation(self, plan: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Traverses the nested plan structure once to build a flat representation.
        - Repairs missing or invalid UUIDs.
        - Maps all steps by their ID.
        - Maps the parent of each step.
        - Maps the outputs produced by each step.
        """
        logger.debug("PlanValidator: _build_flat_plan_representation called.")
        steps_map = {}
        parent_map = {}
        outputs_map = {}
        uuid_map = {}

        def traverse(sub_plan: List[Dict[str, Any]], parent_id: Optional[str]):
            logger.debug(f"PlanValidator: _build_flat_plan_representation - traverse called for parent_id: {parent_id}, sub_plan length: {len(sub_plan) if sub_plan else 0}.")
            if not isinstance(sub_plan, list):
                logger.warning(f"PlanValidator: _build_flat_plan_representation - sub_plan is not a list (type: {type(sub_plan)}). Skipping.")
                return

            for i, step in enumerate(sub_plan):
                if not isinstance(step, dict):
                    logger.warning(f"PlanValidator: _build_flat_plan_representation - step at index {i} is not a dictionary (type: {type(step)}). Skipping.")
                    continue

                # --- UUID Repair ---
                original_id = step.get('id')
                if not original_id or not self._is_valid_uuid(original_id):
                    new_id = str(uuid.uuid4())
                    logger.warning(f"PlanValidator: Replacing invalid/missing step ID '{original_id}' with '{new_id}'.")
                    step['id'] = new_id
                    if original_id:
                        uuid_map[original_id] = new_id
                
                step_id = step['id']

                # --- Populate Maps ---
                if step_id in steps_map:
                    # Handle duplicate IDs by creating a new one
                    new_id = str(uuid.uuid4())
                    logger.warning(f"PlanValidator: Duplicate step ID '{step_id}' found. Replacing with new ID '{new_id}'.")
                    uuid_map[step_id] = new_id
                    step['id'] = new_id
                    step_id = new_id

                steps_map[step_id] = step
                if parent_id:
                    parent_map[step_id] = parent_id
                
                # --- Process Outputs ---
                step_outputs = set()
                outputs = step.get('outputs', {})
                if isinstance(outputs, dict):
                    for output_name, output_def in outputs.items():
                        step_outputs.add(output_name)
                        # Basic output repair
                        if isinstance(output_def, str):
                            logger.debug(f"PlanValidator: _build_flat_plan_representation - Repairing output '{output_name}' for step {step_id} (string to dict).")
                            step['outputs'][output_name] = {'description': output_def}
                outputs_map[step_id] = step_outputs

                # --- Recurse into Sub-plans ---
                sub_plan_steps = self._get_sub_plan(step)
                if sub_plan_steps:
                    logger.debug(f"PlanValidator: _build_flat_plan_representation - Recursing into sub-plan for step {step_id}.")
                    traverse(sub_plan_steps, step_id)

        traverse(plan, None)
        logger.debug(f"PlanValidator: _build_flat_plan_representation completed. Total steps: {len(steps_map)}.")
        
        return {
            "steps": steps_map,
            "parents": parent_map,
            "outputs": outputs_map,
            "uuid_map": uuid_map
        }

    def _apply_uuid_map_recursive(self, data: Any, mapping: Dict[str, str]) -> Any:
        """
        Recursively traverses a plan structure (dictionaries and lists) and replaces
        any 'sourceStep' values that are keys in the provided mapping.
        It also handles 'sourceStep' references embedded within JSON strings.
        """
        logger.debug("PlanValidator: _apply_uuid_map_recursive called.")
        if isinstance(data, dict):
            new_dict = {}
            for k, v in data.items():
                if k == 'sourceStep' and v in mapping:
                    logger.debug(f"PlanValidator: _apply_uuid_map_recursive - Updating sourceStep reference from '{v}' to '{mapping[v]}'.")
                    new_dict[k] = mapping[v]
                else:
                    new_dict[k] = self._apply_uuid_map_recursive(v, mapping)
            return new_dict
        elif isinstance(data, list):
            logger.debug("PlanValidator: _apply_uuid_map_recursive - Recursing into list.")
            return [self._apply_uuid_map_recursive(item, mapping) for item in data]
        elif isinstance(data, str):
            try:
                # Check if the string is a JSON object or array that might contain references
                # Avoid parsing simple strings that are not JSON objects/arrays
                if data.strip().startswith(('{', '[')):
                    parsed_json = json.loads(data)
                    if isinstance(parsed_json, (dict, list)):
                        logger.debug("PlanValidator: _apply_uuid_map_recursive - Found JSON string, recursing into it.")
                        # Recurse into the parsed JSON
                        repaired_json = self._apply_uuid_map_recursive(parsed_json, mapping)
                        # Return the repaired structure as a JSON string, ensuring no extra whitespace
                        return json.dumps(repaired_json, separators=(',', ':'))
            except (json.JSONDecodeError, TypeError):
                # Not a JSON string, or not a type that can be loaded, return as is
                pass
            return data
        else:
            return data

    def _get_execution_order(self, plan: List[Dict[str, Any]], all_steps: Dict[str, Any]) -> List[str]:
        """
        Determines the execution order of steps. For now, it's a simple traversal.
        This can be enhanced with topological sort later if complex dependencies require it.
        """
        logger.debug("PlanValidator: _get_execution_order called.")
        order = []
        
        def traverse(sub_plan):
            logger.debug(f"PlanValidator: _get_execution_order - traverse called for sub_plan length: {len(sub_plan) if sub_plan else 0}.")
            for step in sub_plan:
                step_id = step.get('id')
                if step_id and step_id in all_steps:
                    order.append(step_id)
                    sub_plan_steps = self._get_sub_plan(step)
                    if sub_plan_steps:
                        traverse(sub_plan_steps)
        
        traverse(plan)
        logger.debug(f"PlanValidator: _get_execution_order completed. Order: {order}")
        return order

    def _get_available_outputs_for_step(self, step_id: str, execution_order: List[str], 
                                        all_outputs: Dict[str, Set[str]], parents: Dict[str, str], 
                                        all_steps: Dict[str, Any]) -> Dict[str, Set[str]]:
        """
        Determines all outputs available to a given step. This includes outputs from:
        1. All preceding steps in the same sub-plan.
        2. The direct parent step and all its ancestors.
        3. All preceding steps in an ancestor's sub-plan.
        """
        logger.debug(f"PlanValidator: _get_available_outputs_for_step called for step ID: {step_id}")
        available = {}
        try:
            current_index = execution_order.index(step_id)
        except ValueError:
            logger.warning(f"PlanValidator: _get_available_outputs_for_step - Step ID {step_id} not found in execution_order. Returning empty available outputs.")
            return available
        
        # Add outputs from all preceding steps in the execution order
        for i in range(current_index):
            prev_step_id = execution_order[i]
            if prev_step_id in all_outputs:
                available[prev_step_id] = all_outputs[prev_step_id]

        # Add outputs from parent hierarchy (for sub-plans)
        # This is implicitly handled by the execution order traversal, but for FOREACH-like
        # scopes, we need to add the parent's special outputs.
        parent_id = parents.get(step_id)
        while parent_id:
            if parent_id not in available:
                 available[parent_id] = all_outputs.get(parent_id, set())
            
            parent_step = all_steps.get(parent_id)
            if parent_step and parent_step.get('actionVerb') == 'FOREACH':
                # Add 'item' and 'index' from the FOREACH parent
                logger.debug(f"PlanValidator: _get_available_outputs_for_step - Adding 'item' and 'index' from FOREACH parent {parent_id}.")
                available[parent_id].add('item')
                available[parent_id].add('index')

            parent_id = parents.get(parent_id)
            
        logger.debug(f"PlanValidator: _get_available_outputs_for_step - Available outputs for {step_id}: {available}")
        return available

    def _validate_step(self, step: Dict[str, Any], available_outputs: Dict[str, Set[str]],
                       all_steps: Dict[str, Any], parents: Dict[str, str]) -> Tuple[List[str], List[Dict[str, Any]]]:
        """
        Validates a single step.
        Returns a tuple of (errors, wrappable_errors).
        """
        logger.debug(f"PlanValidator: _validate_step called for step ID: {step.get('id')}")
        errors = []
        wrappable_errors = []
        step_id = step['id']
        action_verb = step.get('actionVerb')

        if not action_verb:
            errors.append(f"Step {step_id}: Missing 'actionVerb'.")
            logger.debug(f"PlanValidator: _validate_step - Error: Missing actionVerb for step {step_id}.")
            return errors, wrappable_errors

        plugin_def = self.plugin_map.get(action_verb.upper())
        logger.debug(f"PlanValidator: _validate_step - Plugin definition for {action_verb}: {plugin_def is not None}")

        # --- Validate Inputs ---
        inputs = step.get('inputs', {})
        if not isinstance(inputs, dict):
            errors.append(f"Step {step_id}: 'inputs' must be a dictionary.")
            logger.debug(f"PlanValidator: _validate_step - Error: Inputs not a dict for step {step_id}.")
            return errors, wrappable_errors

        # Check for required inputs
        if plugin_def:
            logger.debug(f"PlanValidator: _validate_step - Checking required inputs for {action_verb}.")
            for req_input in plugin_def.get('inputDefinitions', []):
                if req_input.get('required') and req_input.get('name') not in inputs:
                    errors.append(f"Step {step_id}: Missing required input '{req_input['name']}' for '{action_verb}'.")
                    logger.debug(f"PlanValidator: _validate_step - Error: Missing required input '{req_input['name']}' for step {step_id}.")

        # Check each input
        for input_name, input_def in inputs.items():
            logger.debug(f"PlanValidator: _validate_step - Validating input '{input_name}' for step {step_id}.")
            if not isinstance(input_def, dict):
                errors.append(f"Step {step_id}: Input '{input_name}' is not a valid dictionary.")
                logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' not a dict for step {step_id}.")
                continue

            if 'value' in input_def:
                # It's a static value, could validate type here if needed
                logger.debug(f"PlanValidator: _validate_step - Input '{input_name}' has a static value.")
                pass
            elif 'sourceStep' in input_def and 'outputName' in input_def:
                source_step_id = input_def['sourceStep']
                output_name = input_def['outputName']
                logger.debug(f"PlanValidator: _validate_step - Input '{input_name}' references output '{output_name}' from step '{source_step_id}'.")

                # Check if source exists and is available
                if source_step_id == '0': # Special case for parent-provided inputs
                    parent_id = parents.get(step_id)
                    if not parent_id:
                        errors.append(f"Step {step_id}: Input '{input_name}' references parent ('0'), but has no parent.")
                        logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references parent but no parent found for step {step_id}.")
                    # Further validation could check if parent *can* provide this output
                elif source_step_id not in available_outputs:
                    errors.append(f"Step {step_id}: Input '{input_name}' references unavailable step '{source_step_id}'.")
                    logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references unavailable step '{source_step_id}' for step {step_id}.")
                elif output_name not in available_outputs.get(source_step_id, set()):
                    errors.append(f"Step {step_id}: Input '{input_name}' references unavailable output '{output_name}' from step '{source_step_id}'.")
                    logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references unavailable output '{output_name}' from step '{source_step_id}' for step {step_id}.")
                else:
                    # --- Type Compatibility Check ---
                    source_step = all_steps.get(source_step_id)
                    if source_step:
                        logger.debug(f"PlanValidator: _validate_step - Checking type compatibility for input '{input_name}' from step {step_id}.")
                        type_error, wrappable = self._check_type_compatibility(
                            step, input_name, input_def, source_step, output_name
                        )
                        if type_error:
                            errors.append(type_error)
                        if wrappable:
                            wrappable_errors.append(wrappable)
            else:
                errors.append(f"Step {step_id}: Input '{input_name}' must have 'value' or both 'sourceStep' and 'outputName'.")
                logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' missing value/sourceStep/outputName for step {step_id}.")

        # --- Validate Outputs ---
        logger.debug(f"PlanValidator: _validate_step - Validating deliverable outputs for step {step_id}.")
        errors.extend(self._validate_deliverable_outputs(step))

        logger.debug(f"PlanValidator: _validate_step completed for step {step_id}. Errors: {len(errors)}, Wrappable: {len(wrappable_errors)}.")
        return errors, wrappable_errors

    def _check_type_compatibility(self, dest_step: Dict[str, Any], dest_input_name: str, dest_input_def: Dict[str, Any],
                                  source_step: Dict[str, Any], source_output_name: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """
        Checks type compatibility between a source output and a destination input.
        Returns a tuple: (error_message, wrappable_error_dict).
        One of the two will be None.
        """
        logger.debug(f"PlanValidator: _check_type_compatibility called for dest_step {dest_step.get('id')} input {dest_input_name}.")
        dest_action_verb = dest_step['actionVerb'].upper()
        dest_plugin_def = self.plugin_map.get(dest_action_verb)
        
        source_action_verb = source_step['actionVerb'].upper()
        source_plugin_def = self.plugin_map.get(source_action_verb)

        # Determine source output type first, as it might be needed for dest_input_type inference
        source_output_type = None
        source_output_def = source_step.get('outputs', {}).get(source_output_name)
        if isinstance(source_output_def, dict) and 'type' in source_output_def:
            source_output_type = source_output_def['type']
        
        # Fallback to plugin definition if not in plan step
        if not source_output_type and source_plugin_def:
             for out_def in source_plugin_def.get('outputDefinitions', []):
                if out_def.get('name') == source_output_name:
                    source_output_type = out_def.get('type')
                    break
        
        if not source_output_type:
            logger.debug(f"PlanValidator: _check_type_compatibility - Could not determine source_output_type for {source_output_name}.")
            return (f"Step {dest_step['id']}: Could not determine type for output '{source_output_name}' from step {source_step['id']}.", None)

        # Determine destination input type
        dest_input_type = None
        if dest_plugin_def:
            for in_def in dest_plugin_def.get('inputDefinitions', []):
                if in_def.get('name') == dest_input_name:
                    dest_input_type = in_def.get('type')
                    break
        
        # If dest_input_type is not explicitly defined in the manifest, try to infer it
        if not dest_input_type:
            if 'valueType' in dest_input_def: # For static values
                dest_input_type = dest_input_def['valueType']
                logger.debug(f"PlanValidator: _check_type_compatibility - Inferred dest_input_type '{dest_input_type}' from valueType for input '{dest_input_name}'.")
            elif 'sourceStep' in dest_input_def and 'outputName' in dest_input_def: # For references
                dest_input_type = source_output_type # Use the source's output type
                logger.debug(f"PlanValidator: _check_type_compatibility - Inferred dest_input_type '{dest_input_type}' from source_output_type for input '{dest_input_name}'.")
            else:
                # If we still can't determine the type, it's an error
                logger.debug(f"PlanValidator: _check_type_compatibility - Could not determine dest_input_type for {dest_input_name}.")
                return (f"Step {dest_step['id']}: Could not determine type for input '{dest_input_name}'.", None)

        logger.debug(f"PlanValidator: _check_type_compatibility - Input '{dest_input_name}' (expected: {dest_input_type}) vs Output '{source_output_name}' (actual: {source_output_type}).")
        # --- The Actual Check ---
        
        # Case 1: Mismatch suggests FOREACH wrapping
        is_wrappable = dest_input_type == 'string' and source_output_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]']
        if is_wrappable:
            logger.debug(f"PlanValidator: _check_type_compatibility - Wrappable error detected for step {dest_step['id']}.")
            wrappable_info = {
                "step_id": dest_step['id'],
                "source_step_id": source_step['id'],
                "source_output_name": source_output_name,
                "target_input_name": dest_input_name
            }
            return (None, wrappable_info)

        # Case 2: General type mismatch
        types_compatible = (
            dest_input_type == source_output_type or
            dest_input_type == 'any' or source_output_type == 'any' or
            # Allow string-based compatibility for interpolation
            (dest_input_type == 'string' and source_output_type in ['number', 'boolean']) or # Allow implicit conversion of number/boolean to string
            (dest_input_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]'] and source_output_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]'])
        )

        if not types_compatible:
            error_msg = (f"Step {dest_step['id']}: Type mismatch for input '{dest_input_name}'. "
                         f"Expected '{dest_input_type}' but got '{source_output_type}' from step {source_step['id']}.")
            logger.debug(f"PlanValidator: _check_type_compatibility - Type mismatch error: {error_msg}")
            return (error_msg, None)

        logger.debug(f"PlanValidator: _check_type_compatibility - Types compatible for step {dest_step['id']} input {dest_input_name}.")
        return (None, None)

    def _find_embedded_references(self, value: str) -> Set[str]:
        """Find all embedded references in a string value (e.g., {output_name} or [output_name])."""
        logger.debug(f"PlanValidator: _find_embedded_references called for value: {value}")
        references = set(re.findall(r'[{[]([a-zA-Z0-9_]+)[}\]]', value))
        logger.debug(f"PlanValidator: _find_embedded_references - Found references: {references}")
        return references

    def _validate_deliverable_outputs(self, step: Dict[str, Any]) -> List[str]:
        """Validate deliverable output properties."""
        logger.debug(f"PlanValidator: _validate_deliverable_outputs called for step ID: {step.get('id')}")
        errors = []
        outputs = step.get('outputs', {})
        step_id = step.get('id', 'unknown')
        logger.debug(f"PlanValidator: Step {step_id}: Type of outputs in _validate_deliverable_outputs: {type(outputs)}")

        for output_name, output_def in outputs.items():
            logger.debug(f"PlanValidator: _validate_deliverable_outputs - Checking output '{output_name}' for step {step_id}.")
            if isinstance(output_def, dict):
                is_deliverable = output_def.get('isDeliverable', False)
                filename = output_def.get('filename')
                description = output_def.get('description')

                if not description:
                    errors.append(f"Step {step_id}: Output '{output_name}' requires 'description'")
                    logger.debug(f"PlanValidator: _validate_deliverable_outputs - Error: Output '{output_name}' missing description for step {step_id}.")

                if is_deliverable and not filename:
                    errors.append(f"Step {step_id}: Output '{output_name}' marked deliverable but missing 'filename'")
                    logger.debug(f"PlanValidator: _validate_deliverable_outputs - Error: Deliverable output '{output_name}' missing filename for step {step_id}.")

                if filename:
                    if not isinstance(filename, str) or not filename.strip():
                        errors.append(f"Step {step_id}: Output '{output_name}' filename must be non-empty string")
                        logger.debug(f"PlanValidator: _validate_deliverable_outputs - Error: Filename not a non-empty string for output '{output_name}' for step {step_id}.")
                    elif not is_deliverable:
                        logger.warning(f"PlanValidator: Step {step_id}: Output '{output_name}' has filename but not marked deliverable")

        logger.debug(f"PlanValidator: _validate_deliverable_outputs completed for step {step_id}. Errors: {len(errors)}.")
        return errors

    def _classify_error_type(self, error: str) -> str:
        """Classify validation errors into categories."""
        logger.debug(f"PlanValidator: _classify_error_type called for error: '{error}'")
        error_lower = error.lower()
        
        if 'missing required input' in error_lower:
            logger.debug(f"PlanValidator: _classify_error_type - Classified as 'missing_input'.")
            return 'missing_input'
        elif 'invalid reference' in error_lower or 'sourceStep' in error_lower:
            logger.debug(f"PlanValidator: _classify_error_type - Classified as 'invalid_reference'.")
            return 'invalid_reference'
        elif 'cannot find the source' in error_lower:
            logger.debug(f"PlanValidator: _classify_error_type - Classified as 'unsourced_reference'.")
            return 'unsourced_reference'
        elif 'type mismatch' in error_lower or ('expected' in error_lower and 'got' in error_lower):
            logger.debug(f"PlanValidator: _classify_error_type - Classified as 'type_mismatch'.")
            return 'type_mismatch'
        elif 'missing required field' in error_lower:
            logger.debug(f"PlanValidator: _classify_error_type - Classified as 'missing_field'.")
            return 'missing_field'
        logger.debug(f"PlanValidator: _classify_error_type - Classified as 'generic'.")
        return 'generic'

    def _create_focused_repair_prompt(self, step_to_repair: Dict[str, Any], errors: List[str], 
                                     plugin_definition: Dict[str, Any] = None) -> str:
        """Create a focused repair prompt based on error type."""
        logger.debug(f"PlanValidator: _create_focused_repair_prompt called for step ID: {step_to_repair.get('id')}.")
        primary_error_type = self._classify_error_type(errors[0]) if errors else 'generic'
        step_json = json.dumps(step_to_repair, indent=2)
        errors_text = '\n'.join([f"- {error}" for error in errors])
        logger.debug(f"PlanValidator: _create_focused_repair_prompt - Primary error type: {primary_error_type}")

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
                match = re.search(r"contains embedded reference '{{{([^}}]+)}}}'", error)
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
        logger.debug(f"PlanValidator: _repair_plan_with_llm called with {len(errors)} errors.")
        step_to_repair = None
        step_to_repair_index = -1

        # Find step to repair
        for error in errors:
            match = re.search(r"Step ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):", error)
            if match:
                step_id = match.group(1)
                for i, step in enumerate(plan):
                    if step.get('id') == step_id:
                        step_to_repair = step
                        step_to_repair_index = i
                        break
                if step_to_repair:
                    break

        if step_to_repair:
            logger.debug(f"PlanValidator: _repair_plan_with_llm - Identified step {step_to_repair.get('id')} for repair.")
            prompt = self._create_focused_repair_prompt(step_to_repair, errors, self.plugin_map.get(step_to_repair.get('actionVerb')))
            prompt_type = "single_step"
        else:
            logger.warning("PlanValidator: _repair_plan_with_llm - Could not identify step to repair. Sending whole plan.")
            step_json = json.dumps(plan, indent=2)
            errors_text = '\n'.join([f"- {error}" for error in errors])
            prompt = f"""Fix the validation errors.\n\nERRORS: {errors_text}\n\nPLAN: {step_json}\n\nReturn ONLY the corrected JSON plan, no explanations."""
            prompt_type = "full_plan"

        logger.info(f"PlanValidator: Attempting to repair {prompt_type} with {len(errors)} errors")

        if not self.brain_call:
            logger.error("PlanValidator: _repair_plan_with_llm - Brain call not available.")
            raise AccomplishError("Brain call not available", "brain_error")

        logger.debug(f"PlanValidator: _repair_plan_with_llm - Calling brain for repair.")
        response = self.brain_call(prompt, inputs, "json")
        logger.debug(f"PlanValidator: _repair_plan_with_llm - Brain call for repair returned.")
        
        try:
            repaired_data = json.loads(response)
            logger.debug("PlanValidator: _repair_plan_with_llm - Successfully parsed LLM repair response.")
        except json.JSONDecodeError as e:
            logger.error(f"PlanValidator: _repair_plan_with_llm - LLM repair failed: Invalid JSON response: {e}")
            raise AccomplishError(f"LLM repair failed: Invalid JSON response: {e}", "repair_error")

        if repaired_data == plan:
            logger.warning("PlanValidator: _repair_plan_with_llm - LLM repair failed: No changes made to the plan.")
            raise AccomplishError("LLM repair failed: No changes made to the plan.", "repair_error")

        if prompt_type == "single_step" and isinstance(repaired_data, dict):
            plan[step_to_repair_index] = repaired_data
            logger.debug(f"PlanValidator: _repair_plan_with_llm - Single step {step_to_repair.get('id')} repaired.")
            return plan
        elif prompt_type == "full_plan" and isinstance(repaired_data, list):
            logger.debug("PlanValidator: _repair_plan_with_llm - Full plan repaired.")
            return repaired_data
        else:
            logger.error(f"PlanValidator: _repair_plan_with_llm - LLM repair failed: Unexpected response format for {prompt_type} repair.")
            raise AccomplishError(f"LLM repair failed: Unexpected response format for {prompt_type} repair.", "repair_error")
