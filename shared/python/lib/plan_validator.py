#!/usr/bin/env python3

import uuid
import json
import logging
import re
import copy
from typing import Dict, Any, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

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

class PlanValidator:
    """Handles validation and repair of plans."""
    
    # Class constants
    CONTROL_FLOW_VERBS = {'WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT', 'REGROUP'}
    ALLOWED_ROLES = {'coordinator', 'researcher', 'coder', 'creative', 'critic', 'executor', 'domain expert'}
    
    def __init__(self, max_retries: int = 5, brain_call=None):
        self.max_retries = max_retries
        self.brain_call = brain_call
        self.plugin_map = {}

    def _parse_available_plugins(self, inputs: Dict[str, Any]) -> List[Any]:
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
        self.plugin_map = {}
        
        if not available_plugins:
            return []

        if not isinstance(available_plugins, list) or not all(isinstance(p, dict) for p in available_plugins):
            logger.error(f"Invalid availablePlugins format. Expected a list of dictionaries, got: {type(available_plugins)}")
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
        # Direct steps property
        if 'steps' in step and isinstance(step['steps'], list):
            return step['steps']
        
        # Nested in inputs.steps.value
        steps_input = step.get('inputs', {}).get('steps')
        if isinstance(steps_input, dict) and isinstance(steps_input.get('value'), list):
            return steps_input['value']
        
        return None

    def _analyze_plan_tree(self, plan: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Single traversal to collect step IDs and counts."""
        step_counts = {}
        
        def traverse(steps):
            for step in steps:
                if not isinstance(step, dict):
                    continue
                    
                step_id = step.get('id')
                if step_id is not None:
                    step_counts[step_id] = step_counts.get(step_id, 0) + 1
                
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    traverse(sub_plan)
        
        traverse(plan)
        return {'counts': step_counts}

    def _find_step_in_plan(self, plan: List[Dict[str, Any]], step_id: str) -> Optional[Dict[str, Any]]:
        """Finds a step in a potentially nested plan by its ID."""
        for step in plan:
            if step.get('id') == step_id:
                return step
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                found = self._find_step_in_plan(sub_plan, step_id)
                if found:
                    return found
        return None

    def _get_downstream_dependencies(self, start_step_id: str, plan: List[Dict[str, Any]]) -> Set[str]:
        """Builds a dependency graph and finds all downstream dependencies for a given step."""
        adj_list = {}
        
        def build_adj_list(current_plan):
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
                    build_adj_list(sub_plan)

        build_adj_list(plan)

        downstream_deps = set()
        queue = [start_step_id]
        visited = {start_step_id}

        while queue:
            current_step = queue.pop(0)
            if current_step in adj_list:
                for dependent_step in adj_list[current_step]:
                    if dependent_step not in visited:
                        dependent_step_obj = self._find_step_in_plan(plan, dependent_step)
                        if dependent_step_obj and dependent_step_obj.get('actionVerb') == 'REFLECT':
                            logger.info(f"Excluding REFLECT step {dependent_step} from FOREACH wrapping - it should remain at top level")
                            continue
                        
                        downstream_deps.add(dependent_step)
                        visited.add(dependent_step)
                        queue.append(dependent_step)

        return downstream_deps

    def _is_valid_uuid(self, uuid_string: str) -> bool:
        """Check if a string is a valid UUID."""
        try:
            uuid.UUID(uuid_string)
            return True
        except ValueError:
            return False

    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], step_to_wrap: Dict[str, Any],
                              source_step_id: str, source_output_name: str, target_input_name: str,
                              plugin_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Wraps a step in a FOREACH loop, including all dependent steps."""
        logger.info(f"Wrapping step {step_to_wrap['id']} in FOREACH for input '{target_input_name}'")

        step_to_wrap_original_id = step_to_wrap['id']

        # Collect steps to move into subplan, ensuring they are deep-copied
        downstream_deps = self._get_downstream_dependencies(step_to_wrap_original_id, plan)
        moved_step_ids = {step_to_wrap_original_id} | downstream_deps

        sub_plan = []
        for step_id_item in sorted(list(moved_step_ids)):
            original_step = next((s for s in plan if s.get('id') == step_id_item), None)
            if original_step:
                new_step = copy.deepcopy(original_step)
                # If this is the step that triggered the wrap, update its input
                if new_step['id'] == step_to_wrap_original_id:
                    # Check if the target_input_name is a nested reference (e.g., "script_parameters.search_results")
                    if '.' in target_input_name or '[' in target_input_name:
                        # Split the target_input_name into parts to traverse the nested structure
                        parts = re.findall(r'([a-zA-Z0-9_]+)(?:[[](\d+)]])?', target_input_name)
                        
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
                                            logger.warning(f"Step {new_step['id']}: Invalid list index or not a list at '{part_name}[{part_index}]'")
                                            break
                                    except json.JSONDecodeError:
                                        logger.warning(f"Step {new_step['id']}: Could not parse JSON for '{part_name}' at index '{part_index}'")
                                        break
                                else:
                                    logger.warning(f"Step {new_step['id']}: Input '{part_name}' not found or not a dict with 'value' for index '{part_index}'")
                                    break
                            else: # It's a dictionary key
                                if isinstance(current_input_level.get(part_name), dict) and 'value' in current_input_level[part_name]:
                                    try:
                                        dict_value = json.loads(current_input_level[part_name]['value'])
                                        if isinstance(dict_value, dict):
                                            if i == len(parts) - 1: # Last part, update the nested reference
                                                if isinstance(dict_value.get(part_name), dict) and 'sourceStep' in dict_value[part_name]:
                                                    dict_value[part_name]['sourceStep'] = "0"
                                                    dict_value[part_name]['outputName'] = "item"
                                            current_input_level[part_name]['value'] = json.dumps(dict_value)
                                            current_input_level = dict_value.get(part_name, {}) # Move deeper
                                        else:
                                            logger.warning(f"Step {new_step['id']}: Not a dictionary at '{part_name}'")
                                            break
                                    except json.JSONDecodeError:
                                        logger.warning(f"Step {new_step['id']}: Could not parse JSON for '{part_name}'")
                                        break
                                else:
                                    logger.warning(f"Step {new_step['id']}: Input '{part_name}' not found or not a dict with 'value'")
                                    break
                    else:
                        # Original logic for direct input name
                        if target_input_name in new_step.get('inputs', {}):
                            new_step['inputs'][target_input_name] = {
                                "outputName": "item",
                                "sourceStep": "0"  # "0" means parent step (the FOREACH step)
                            }
                sub_plan.append(new_step)

        # Collect outputs from the sub-plan for the FOREACH step's outputs
        sub_plan_outputs = {}
        for step in sub_plan:
            for out_name, out_desc in step.get('outputs', {}).items():
                sub_plan_outputs[out_name] = out_desc

        # Generate a new UUID for the FOREACH step
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

        # Create the REGROUP step
        # subplan_results is populated with the outputs of the steps
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

        def _rebuild_recursively(current_plan, moved_ids, fe_step, rg_step, wrap_id):
            output_plan = []
            inserted_fe_rg = False # Flag to ensure FOREACH/REGROUP are inserted only once
            for s in current_plan:
                if s.get('id') == wrap_id and not inserted_fe_rg:
                    output_plan.append(fe_step)
                    output_plan.append(rg_step)
                    inserted_fe_rg = True
                    # Do not append 's' itself, as it's now part of the sub-plan
                    continue 
                elif s.get('id') in moved_ids:
                    # This step has been moved into the sub-plan, so skip it in the main plan
                    continue
                else:
                    sub_p = self._get_sub_plan(s)
                    if sub_p:
                        rebuilt_sub = _rebuild_recursively(sub_p, moved_ids, fe_step, rg_step, wrap_id)
                        if 'steps' in s:
                            s['steps'] = rebuilt_sub
                        elif 'inputs' in s.get('inputs', {}):
                            s['inputs']['steps']['value'] = rebuilt_sub
                    output_plan.append(s)
            return output_plan

        new_plan = _rebuild_recursively(plan, moved_step_ids, foreach_step, regroup_step, step_to_wrap_original_id)

        # Update any steps outside the loop that depended on the original step_to_wrap
        for step in new_plan:
            if step['id'] == foreach_step_id or step['id'] == regroup_step_id:
                continue
            
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and input_def.get('sourceStep') == step_to_wrap_original_id:
                    logger.info(f"Updating step {step['id']} input '{input_name}' to reference REGROUP {regroup_step_id} result")
                    input_def['sourceStep'] = regroup_step_id
                    input_def['outputName'] = 'result' # REGROUP's output name

        logger.info(f"Created FOREACH step {foreach_step_id} with {len(sub_plan)} sub-steps")
        return new_plan

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any],
                           attempt: int = 1, previous_errors: List[str] = []) -> List[Dict[str, Any]]:
        """Validate and repair plan if needed, with retries. Only throw for truly critical failures."""
        try:
            logger.info(f"--- Validation Attempt {attempt}/{self.max_retries} ---")
            logger.debug(f"Plan: {json.dumps(plan, indent=2)}")

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
            logger.info(f"Found {len(wrappable_errors)} steps to wrap in FOREACH")
            if wrappable_errors:
                error = wrappable_errors[0]
                step_to_wrap = next((s for s in current_plan if s.get('id') == error['step_id']), None) # Changed 'number' to 'id'
                if step_to_wrap:
                    modified_plan = self._wrap_step_in_foreach(
                        current_plan, step_to_wrap, error['source_step_id'], # Changed 'source_step_number' to 'source_step_id'
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
            logger.debug(f"Errors: {json.dumps(actual_errors, indent=2)}")

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
        step_id = step.get('id', 'unknown')
        logger.info(f"Step {step_id}: Type of outputs in _validate_deliverable_outputs: {type(outputs)}")

        for output_name, output_def in outputs.items():
            if isinstance(output_def, dict):
                is_deliverable = output_def.get('isDeliverable', False)
                filename = output_def.get('filename')
                description = output_def.get('description')

                if not description:
                    errors.append(f"Step {step_id}: Output '{output_name}' requires 'description'")

                if is_deliverable and not filename:
                    errors.append(f"Step {step_id}: Output '{output_name}' marked deliverable but missing 'filename'")

                if filename:
                    if not isinstance(filename, str) or not filename.strip():
                        errors.append(f"Step {step_id}: Output '{output_name}' filename must be non-empty string")
                    elif not is_deliverable:
                        logger.warning(f"Step {step_id}: Output '{output_name}' has filename but not marked deliverable")

        return errors

    def _validate_embedded_references(self, step: Dict[str, Any], inputs: Dict[str, Any],
                                     available_outputs: Dict[str, Set[str]], errors: List[str],
                                     plan: List[Dict[str, Any]], plugin_map: Dict[str, Any]):
        """Handle embedded references in input values."""
        step_id = step.get('id', 'unknown')

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
                # Iterate through previous steps in the plan to find the source
                for prev_step in plan:
                    if prev_step.get('id') == step_id: # Stop when we reach the current step
                        break
                    prev_step_id = prev_step.get('id')
                    if prev_step_id in available_outputs and ref_output in available_outputs[prev_step_id]:
                        if ref_output not in inputs:
                            inputs[ref_output] = {"outputName": ref_output, "sourceStep": prev_step_id}
                        found_source = True
                        break

                if not found_source:
                    errors.append(
                        f"Step {step_id}: Input '{input_name}' contains embedded reference '{{{ref_output}}}' "
                        f"but cannot find the source"
                    )

    def _recursively_update_source_steps(self, data: Any, uuid_mapping: Dict[str, str]) -> Any:
        """Recursively updates sourceStep UUIDs within a data structure."""
        if isinstance(data, dict):
            if 'sourceStep' in data and data['sourceStep'] in uuid_mapping:
                data['sourceStep'] = uuid_mapping[data['sourceStep']]
            for key, value in data.items():
                data[key] = self._recursively_update_source_steps(value, uuid_mapping)
        elif isinstance(data, list):
            return [self._recursively_update_source_steps(item, uuid_mapping) for item in data]
        elif isinstance(data, str):
            # Attempt to parse string as JSON if it looks like a JSON object/array
            if data.strip().startswith('{') or data.strip().startswith('['):
                try:
                    parsed_data = json.loads(data)
                    updated_data = self._recursively_update_source_steps(parsed_data, uuid_mapping)
                    return json.dumps(updated_data)
                except json.JSONDecodeError:
                    pass # Not a JSON string, treat as regular string
        return data

    def _repair_plan_code_based(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Automatically repair common schema violations in the plan."""
        logger.info("[Repair] Starting code-based repair...")
        
        if not isinstance(plan, list):
            logger.warning("Plan is not a list")
            return []

        uuid_mapping = {}
        steps_to_remove = set()

        # First pass: Generate new UUIDs for invalid step IDs and build mapping
        for step in plan:
            if not isinstance(step, dict):
                continue

            current_step_id = step.get('id')
            if current_step_id is None or not self._is_valid_uuid(current_step_id):
                new_uuid = str(uuid.uuid4())
                logger.warning(f"Step {current_step_id}: Invalid or missing UUID. Replacing with {new_uuid}")
                step['id'] = new_uuid
                if current_step_id: # Only map if there was an old ID to map from
                    uuid_mapping[current_step_id] = new_uuid
        
        # Second pass: Apply UUID mapping and other repairs
        if uuid_mapping:
            logger.info(f"Propagating UUID changes: {uuid_mapping}")

        for step in plan:
            if not isinstance(step, dict):
                continue

            current_step_id = step.get('id')
            if current_step_id is None:
                continue

            # Apply UUID mapping to direct sourceStep references
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step_id = input_def['sourceStep']
                    if source_step_id in uuid_mapping:
                        logger.info(f"Updating sourceStep for step {current_step_id}, input '{input_name}': {source_step_id} -> {uuid_mapping[source_step_id]}")
                        input_def['sourceStep'] = uuid_mapping[source_step_id]
            
            # Recursively update sourceStep references within 'value' fields
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'value' in input_def:
                    original_value = input_def['value']
                    updated_value = self._recursively_update_source_steps(original_value, uuid_mapping)
                    if updated_value != original_value:
                        logger.info(f"Recursively updated sourceStep in input '{input_name}' for step {current_step_id}")
                        input_def['value'] = updated_value

            # Repair ambiguous inputs
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and all(k in input_def for k in ['outputName', 'sourceStep', 'value']):
                    logger.info(f"Input '{input_name}' has both value and source. Preferring source.")
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
                        logger.warning(f"Could not parse 'steps' JSON string")

            # Move direct 'steps' property to inputs
            if step.get('actionVerb') in self.CONTROL_FLOW_VERBS and 'steps' in step and isinstance(step['steps'], list):
                logger.info(f"Step {current_step_id}: Moving 'steps' to inputs")
                if 'inputs' not in step:
                    step['inputs'] = {}
                step['inputs']['steps'] = {'value': step['steps'], 'valueType': 'array'}
                del step['steps']

            # Recursively repair sub-plans
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                logger.info(f"Recursively repairing sub-plan in step {current_step_id}")
                repaired_sub = self._repair_plan_code_based(sub_plan) # Recursive call will populate uuid_mapping
                
                # Update the sub-plan in place
                if 'steps' in step:
                    step['steps'] = repaired_sub
                elif 'inputs' in step.get('inputs', {}):
                    step['inputs']['steps']['value'] = repaired_sub

        # Filter out moved steps (this logic seems to be for SEQUENCE, not directly relevant to current issue)
        if steps_to_remove:
            final_plan = [step for step in plan if step.get('id') not in steps_to_remove]
            logger.info(f"Removed {len(steps_to_remove)} steps moved into SEQUENCE blocks")
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
                logger.info(f"Step {step.get('id')}: Resolving alias '{old_name}' -> '{new_name}'")
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
            prompt = self._create_focused_repair_prompt(step_to_repair, errors, self.plugin_map.get(step_to_repair.get('actionVerb')))
            prompt_type = "single_step"
        else:
            logger.warning("Could not identify step to repair. Sending whole plan.")
            step_json = json.dumps(plan, indent=2)
            errors_text = '\n'.join([f"- {error}" for error in errors])
            prompt = f"""Fix the validation errors.\n\nERRORS: {errors_text}\n\nPLAN: {step_json}\n\nReturn ONLY the corrected JSON plan, no explanations."""
            prompt_type = "full_plan"

        logger.info(f"Attempting to repair {prompt_type} with {len(errors)} errors")

        if not self.brain_call:
            raise AccomplishError("Brain call not available", "brain_error")

        response = self.brain_call(prompt, inputs, "json")
        
        try:
            repaired_data = json.loads(response)
        except json.JSONDecodeError as e:
            raise AccomplishError(f"LLM repair failed: Invalid JSON response: {e}", "repair_error")

        if repaired_data == plan:
            raise AccomplishError("LLM repair failed: No changes made to the plan.", "repair_error")

        if prompt_type == "single_step" and isinstance(repaired_data, dict):
            plan[step_to_repair_index] = repaired_data
            return plan
        elif prompt_type == "full_plan" and isinstance(repaired_data, list):
            return repaired_data
        else:
            raise AccomplishError(f"LLM repair failed: Unexpected response format for {prompt_type} repair.", "repair_error")

    def _validate_plan(self, plan: List[Dict[str, Any]], available_plugins: List[Dict[str, Any]], 
                      parent_outputs: Dict[str, Set[str]] = None, 
                      all_consumed_outputs: Optional[Set[Tuple[str, str]]] = None) -> Dict[str, Any]:
        """Validate the plan against schema and plugin requirements."""
        errors = []
        wrappable_errors = []

        if all_consumed_outputs is None:
            all_consumed_outputs = set() # Initialize at the top-level call
        
        if not isinstance(plan, list):
            return {'valid': False, 'errors': ["Plan must be a list"], 'wrappable_errors': []}
        
        if not plan:
            return {'valid': True, 'errors': [], 'wrappable_errors': []}
        
        plugin_map = {plugin.get('verb', plugin.get('actionVerb', '')).upper(): plugin for plugin in available_plugins}
        logger.debug(f"PlanValidator: Plugin map keys from available_plugins: {list(plugin_map.keys())}")
        available_outputs = parent_outputs.copy() if parent_outputs else {}

        # Check for duplicate step IDs
        analysis = self._analyze_plan_tree(plan)
        duplicate_ids = [step_id for step_id, count in analysis['counts'].items() if count > 1]
        if duplicate_ids:
            errors.extend([f"Duplicate step ID {step_id} found" for step_id in duplicate_ids])
        
        all_produced_outputs = {} # {step_id: {output_name, ...}}

        # Populate available outputs and all_produced_outputs
        for step in plan:
            step_id = step.get('id')
            if step_id is None:
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
                action_verb = step.get('actionVerb')
                plugin_def = self.plugin_map.get(action_verb.upper()) # Use upper for lookup
                
                for output_name, output_def in list(outputs_dict.items()): # Iterate over a copy
                    # 1. Convert string descriptions to objects if they are not already
                    if isinstance(output_def, str):
                        outputs_dict[output_name] = {'description': output_def}
                        output_def = outputs_dict[output_name]

                    # 2. Align type from plugin manifest or ensure type for novel verbs
                    if plugin_def:
                        output_definitions_from_manifest = plugin_def.get('outputDefinitions', [])

                        if output_definitions_from_manifest:
                            # Try to find a direct match for output_name in manifest
                            manifest_output_def = next((out for out in output_definitions_from_manifest if out.get('name') == output_name), None)

                            # If no direct match, and only one output definition exists in manifest, use its type
                            if not manifest_output_def and len(output_definitions_from_manifest) == 1:
                                manifest_output_def = output_definitions_from_manifest[0]

                            if manifest_output_def and 'type' in manifest_output_def:
                                # Align the type in the plan's output definition
                                output_def['type'] = manifest_output_def['type']
                            else:
                                # If plugin_def exists but no matching output definition or type, it's a schema issue
                                errors.append(f"Step {step_id}: Output '{output_name}' in plan cannot align type with plugin manifest for '{action_verb}'.")
                        else:
                            # If plugin_def exists but no outputDefinitions, it's a schema issue
                            errors.append(f"Step {step_id}: Plugin '{action_verb}' has no outputDefinitions in its manifest.")
                    else:
                        # For novel verbs, ensure the output has a 'type' defined in the plan itself
                        if 'type' not in output_def:
                            errors.append(f"Step {step_id}: Output '{output_name}' for novel verb '{action_verb}' is missing 'type' information in the plan.")

                    step_outputs.add(output_name) # Add the output name to available_outputs
                
            available_outputs[step_id] = step_outputs
            all_produced_outputs[step_id] = step_outputs
        
        # Validate each step
        for i, step in enumerate(plan):
            step_id = step.get('id')
            if step_id is None:
                errors.append(f"Step {i+1}: Missing 'id' field")
                continue
        
            for field in ['actionVerb', 'inputs', 'outputs']:
                if field not in step:
                    errors.append(f"Step {step_id}: Missing field '{field}'")
        
            action_verb = step.get('actionVerb')
            if action_verb:
                # Convert action_verb to uppercase for case-insensitive lookup
                upper_action_verb = action_verb.upper()
                plugin_def = plugin_map.get(upper_action_verb)
                logger.debug(f"DEBUG: Step {step_id} - actionVerb: '{action_verb}' (normalized: '{upper_action_verb}'), plugin_def found: {plugin_def is not None}")
                if 'inputs' not in step or not isinstance(step['inputs'], dict):
                    logger.info(f"Step {step_id}: 'inputs' field is missing or not a dictionary.")
                    errors.append(f"Step {step_id}: 'inputs' field is missing or not a dictionary.")
                else:
                    self._validate_step_inputs(step, plugin_def, available_outputs, errors, wrappable_errors, plan, plugin_map, all_consumed_outputs)
        
            errors.extend(self._validate_deliverable_outputs(step))
        
            # Recursive validation for control flow
            if action_verb in self.CONTROL_FLOW_VERBS:
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    logger.info(f"Recursively validating sub-plan for step {step_id}")
                    sub_context = available_outputs.copy()
                    if action_verb == 'FOREACH':
                        # For FOREACH, the sub_context should see 'item' and 'index' as outputs of the FOREACH step
                        sub_context[step_id] = {'item', 'index'}
                    
                    sub_result = self._validate_plan(sub_plan, available_plugins, sub_context, all_consumed_outputs) # Pass all_consumed_outputs
                    if not sub_result['valid']:
                        errors.extend([f"Sub-plan of step {step_id}: {e}" for e in sub_result['errors']])
                    
                    # Only extend wrappable_errors if the sub-plan validation didn't already handle it
                    if not sub_result.get('handled_wrappable', False):
                        wrappable_errors.extend(sub_result.get('wrappable_errors', []))
        
            # Validate recommendedRole
            recommended_role = step.get('recommendedRole')
            if recommended_role:
                if recommended_role.lower() in [r.lower() for r in self.ALLOWED_ROLES]:
                    step['recommendedRole'] = recommended_role.lower()
                else:
                    logger.warning(f"Step {step_id}: Invalid recommendedRole '{recommended_role}', dropping")
                    del step['recommendedRole']
        
        
        return {'valid': len(errors) == 0 and len(wrappable_errors) == 0, 'errors': errors, 'wrappable_errors': wrappable_errors}

    def _validate_step_inputs(self, step: Dict[str, Any], plugin_def: Optional[Dict[str, Any]], 
                              available_outputs: Dict[str, Set[str]], errors: List[str], 
                              wrappable_errors: List[Dict[str, Any]], plan: List[Dict[str, Any]], 
                              plugin_map: Dict[str, Any], all_consumed_outputs: Set[Tuple[str, str]]):
        logger.debug(f"PlanValidator: Entered _validate_step_inputs for step {step.get('id')} ({step.get('actionVerb')})")
        step_id = step['id']
        inputs = step.get('inputs', {})
        action_verb = step.get('actionVerb')
        
        # Only get input_definitions if plugin_def is provided (for known verbs)
        input_definitions = plugin_def.get('inputDefinitions', []) if plugin_def else []

        # Validate embedded references (always applicable)
        self._validate_embedded_references(step, inputs, available_outputs, errors, plan, plugin_map)

        # Check required inputs (only for known verbs with plugin_def)
        if plugin_def:
            required_inputs = {inp['name']: inp for inp in input_definitions if inp.get('required', False)}
            
            for req_name, req_def in required_inputs.items():
                if req_name == 'missionId':  # Always injected by runtime
                    continue

                if req_name not in inputs:
                    errors.append(f"Step {step_id}: Missing required input '{req_name}' for '{action_verb}'")
                else:
                    input_entry = inputs[req_name]
                    # Check if it's a value-based input and if its value is empty for string types
                    if 'value' in input_entry and req_def.get('type') == 'string':
                        if not input_entry['value'] or (isinstance(input_entry['value'], str) and not input_entry['value'].strip()):
                            errors.append(f"Step {step_id}: Required string input '{req_name}' for '{action_verb}' cannot be empty.")

        # Validate each input (structural and dependency checks always applicable)
        for input_name, input_def in inputs.items():
            logger.debug(f"PlanValidator:   Step {step_id} Input {input_name}")
            # Special case for any input referencing sourceStep "0" (parent step)
            if isinstance(input_def, dict) and input_def.get('sourceStep') == '0':
                logger.debug(f"PlanValidator:   Skipping validation for input '{input_name}' referencing parent step (sourceStep '0') for step {step_id}")
                continue

            # Special handling for control flow 'steps'
            if action_verb in self.CONTROL_FLOW_VERBS and input_name == 'steps':
                is_valid = isinstance(input_def, list) or (
                    isinstance(input_def, dict) and isinstance(input_def.get('value'), list)
                )
                if not is_valid:
                    errors.append(f"Step {step_id}: Input 'steps' must be an array")
                continue

            if not isinstance(input_def, dict):
                errors.append(f"Step {step_id}: Input '{input_name}' must be a dictionary")
                continue

            has_value = 'value' in input_def
            has_output_name = 'outputName' in input_def
            has_source_step = 'sourceStep' in input_def

            # Validate input structure: ensure consistency between sourceStep and outputName
            if has_source_step != has_output_name:
                errors.append(f"Step {step_id}: Input '{input_name}' must either have both 'sourceStep' and 'outputName' or neither.")
            
            if not has_value and not has_source_step: # If no value and no source, it's an invalid input
                errors.append(f"Step {step_id}: Input '{input_name}' must have either a 'value' or a 'sourceStep' and 'outputName'.")
            # Also check for nested dependencies within 'value' fields of object/json types
            if has_value and input_def.get('valueType') in ['object', 'array']:
                self._extract_and_validate_nested_dependencies(
                    step_id, input_name, input_def['value'], available_outputs, errors, all_consumed_outputs, plan, plugin_map, wrappable_errors
                )

            # Validate sourceStep references if it's a dependency (always applicable)
            if has_source_step: # Implies has_output_name is also true due to previous check
                source_step_id = input_def['sourceStep']
                if source_step_id != '0':  # '0' means parent input
                    if source_step_id not in available_outputs:
                        errors.append(f"Step {step_id}: Input '{input_name}' references non-existent step {source_step_id}")
                    else: # Only check output_name if source_step_id exists
                        output_name = input_def['outputName']
                        if output_name not in available_outputs.get(source_step_id, set()):
                            errors.append(f"Step {step_id}: Input '{input_name}' references non-existent output '{output_name}' from step {source_step_id}")
                        else:
                            all_consumed_outputs.add((source_step_id, output_name))

                # Perform type compatibility check for dependency-based inputs
                # This is now always performed if sourceStep is present, using plugin_def if available, otherwise inferring.
                self._check_type_compatibility(step, input_name, input_def, plugin_def,
                                               plan, plugin_map, errors, wrappable_errors)

    def _extract_and_validate_nested_dependencies(self, step_id: str, input_name: str, value: Any,
                                                  available_outputs: Dict[str, Set[str]], errors: List[str],
                                                  all_consumed_outputs: Set[Tuple[str, str]],
                                                  plan: List[Dict[str, Any]], plugin_map: Dict[str, Any],
                                                  wrappable_errors: List[Dict[str, Any]]):
        """Recursively find and validate nested dependencies in object/array input values."""
        if isinstance(value, dict):
            # If the dictionary is a dependency reference itself
            if 'sourceStep' in value and 'outputName' in value:
                source_step_id = value['sourceStep']
                output_name = value['outputName']
                if source_step_id != '0':
                    if source_step_id not in available_outputs:
                        errors.append(f"Step {step_id}: Nested input '{input_name}' references non-existent step {source_step_id}")
                    elif output_name not in available_outputs.get(source_step_id, set()):
                        errors.append(f"Step {step_id}: Nested input '{input_name}' references non-existent output '{output_name}' from step {source_step_id}")
                    else:
                        all_consumed_outputs.add((source_step_id, output_name))
            else:
                # Otherwise, recurse into its values
                for k, v in value.items():
                    self._extract_and_validate_nested_dependencies(step_id, f"{input_name}.{k}", v, available_outputs, errors, all_consumed_outputs, plan, plugin_map, wrappable_errors)
        elif isinstance(value, list):
            for i, item in enumerate(value):
                self._extract_and_validate_nested_dependencies(step_id, f"{input_name}[{i}]", item, available_outputs, errors, all_consumed_outputs, plan, plugin_map, wrappable_errors)

    def _check_type_compatibility(self, step: Dict[str, Any], input_name: str, input_def: Dict[str, Any],
                                  current_plugin_def: Optional[Dict[str, Any]], plan: List[Dict[str, Any]],
                                  plugin_map: Dict[str, Any], errors: List[str], 
                                  wrappable_errors: List[Dict[str, Any]]):
        """Check type compatibility between source output and destination input."""
        step_id = step['id']
        action_verb = step['actionVerb']
        logger.debug(f"PlanValidator: Entered _check_type_compatibility for step {step_id} ({action_verb}), input '{input_name}'")

        source_step_id = input_def['sourceStep']
        source_output_name = input_def['outputName']
        
        logger.debug(f"PlanValidator:   Source: step {source_step_id} output '{source_output_name}'")

        # Get destination input type - try current plugin definition first
        dest_input_definitions = current_plugin_def.get('inputDefinitions', []) if current_plugin_def else []
        dest_input_def = None
        for inp_def in dest_input_definitions:
            if inp_def.get('name') == input_name or input_name in inp_def.get('aliases', []):
                dest_input_def = inp_def
                break

        dest_input_type = dest_input_def.get('type') if dest_input_def else None
        logger.debug(f"PlanValidator:   Destination input type from plugin def: {dest_input_type}")

        if not dest_input_def and not dest_input_type:
            errors.append(f"Step {step_id}: Input '{input_name}' not found or aliased in manifest for plugin '{action_verb}'.")
            return

        if not dest_input_type:
            errors.append(f"Step {step_id}: Input '{input_name}' in manifest for plugin '{action_verb}' is missing 'type'.")
            return

        # Find source step and its plugin definition
        source_step = next((s for s in plan if s.get('id') == source_step_id), None)
        if not source_step:
            errors.append(f"Step {step_id}: Source step {source_step_id} not found for input '{input_name}'.")
            return
        source_action_verb = source_step.get('actionVerb')
        source_plugin_def = plugin_map.get(source_action_verb.upper()) # Use upper for lookup
        if not source_plugin_def:
            errors.append(f"Step {step_id}: Plugin definition for source action verb '{source_action_verb}' (step {source_step_id}) not found.")
            return

        # Get source output definition from the source step in the plan
        source_outputs_in_plan = source_step.get('outputs', {})
        source_output_def_in_plan = source_outputs_in_plan.get(source_output_name)
        source_output_type = None
        actual_source_output_name = source_output_name  # Track the actual output name

        # Try to get type from plan first
        if source_output_def_in_plan and 'type' in source_output_def_in_plan:
            source_output_type = source_output_def_in_plan['type']

        if not source_output_type:
            errors.append(f"Step {step_id}: Could not determine type for output '{source_output_name}' from source step {source_step_id} in the plan.")
            return
        
        logger.debug(f"PlanValidator: Step {step_id}: Input '{input_name}' (dest_type: {dest_input_type}) vs. Source {source_step_id} output '{source_output_name}' (source_type: {source_output_type})")

        # --- Type Correction: Ensure plan's input_def['valueType'] matches manifest's dest_input_type ---
        # This applies to the input_def within the plan itself, not the source_output_type
        if 'valueType' in input_def and input_def['valueType'] != dest_input_type:
            logger.debug(f"PlanValidator: Step {step_id}: Correcting plan's input '{input_name}' valueType from '{input_def['valueType']}' to manifest type '{dest_input_type}'")
            input_def['valueType'] = dest_input_type
        elif 'valueType' not in input_def:
            # If valueType is missing in plan's input_def, add it to match manifest
            logger.debug(f"PlanValidator: Step {step_id}: Adding missing valueType '{dest_input_type}' to plan's input '{input_name}' to match manifest.")
            input_def['valueType'] = dest_input_type
        # --- End Type Correction ---


        # Check for wrappable mismatch (string input from array/list output)
        is_wrappable = (dest_input_type == 'string' and source_output_type in ['array', 'list'])
        
        logger.debug(f"PlanValidator: Step {step_id}: is_wrappable={is_wrappable} (source_output_type='{source_output_type}', dest_input_type='{dest_input_type}')")

        if is_wrappable and step.get('actionVerb') != 'FOREACH':
            # Use the actual source output name we found (handles name mismatches)
            final_output_name = actual_source_output_name
            wrappable_errors.append({
                "step_id": step_id,
                "source_step_id": source_step_id,
                "source_output_name": final_output_name,
                "target_input_name": input_name
            })
        else:
            # General type mismatch check (excluding the wrappable case, which is handled above)
            is_mismatch = not (
                dest_input_type == source_output_type or
                dest_input_type == 'any' or
                source_output_type == 'any' or
                dest_input_type == 'string' or
                source_output_type == 'string' or
                # Allow 'list' to match 'array' and vice-versa
                (dest_input_type == 'list' and source_output_type == 'array') or
                (dest_input_type == 'array' and source_output_type == 'list') or
                # Allow specific list types to match generic array/list
                (dest_input_type.startswith('list[') and (source_output_type == 'array' or source_output_type == 'list')) or
                ((dest_input_type == 'array' or dest_input_type == 'list') and source_output_type.startswith('list['))
            )
            if is_mismatch:
                errors.append(
                    f"Step {step_id}: Input '{input_name}' expects type '{dest_input_type}' (from manifest), "
                    f"but received '{source_output_type}' (from source manifest) from step {source_step_id} output '{source_output_name}'"
                )