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

# logger.debug("plan_validator.py: Module loaded.")

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
                    "type": "object",
                    "properties": {
                        "description": {"type": "string","description": "Thorough description of the expected output"},
                        "type": {"type": "string", "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any", "list", "list[string]", "list[number]", "list[boolean]", "list[object]", "list[any]"],"description": "The type of the output"},
                        "isDeliverable": {"type": "boolean","description": "Whether this output is a final deliverable for the user"},
                        "filename": {"type": "string","description": "User-friendly filename for when the output is a deliverable"}
                    },
                    "required": ["description", "type"],
                    "additionalProperties": False
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

# logger.debug("plan_validator.py: PlanValidator class definition starting.")
class PlanValidator:
    """Handles validation and repair of plans."""
    
    # Class constants
    CONTROL_FLOW_VERBS = {'WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT', 'REGROUP'}
    ALLOWED_ROLES = {'coordinator', 'researcher', 'coder', 'creative', 'critic', 'executor', 'domain expert'}
    
    def __init__(self, max_retries: int = 5, brain_call=None):
        # logger.debug("PlanValidator: Initializing PlanValidator.")
        self.max_retries = max_retries
        self.brain_call = brain_call
        self.plugin_map = {}

    def _parse_available_plugins(self, inputs: Dict[str, Any]) -> List[Any]:
        """Parse available plugins from inputs, handling various formats."""
        # logger.debug("PlanValidator: _parse_available_plugins called.")
        available_plugins_raw = inputs.get('availablePlugins', [])
    
    def _validate_plan_integrity(self, plan: List[Dict[str, Any]]) -> List[str]:
        """
        Performs a quick integrity check before full validation.
        Detects broken references and incomplete definitions.
        Returns list of issues found.
        """
        issues = []
        all_step_ids = {step.get('id') for step in plan if step.get('id')}
        
        for step in plan:
            step_id = step.get('id', 'unknown')
            inputs = step.get('inputs', {})
            
            if not isinstance(inputs, dict):
                continue
            
            for input_name, input_def in inputs.items():
                if not isinstance(input_def, dict):
                    continue
                
                # Check reference validity
                if 'sourceStep' in input_def:
                    source_id = input_def['sourceStep']
                    if source_id != '0' and source_id not in all_step_ids:
                        issues.append(f"Step {step_id} input '{input_name}' references non-existent step {source_id}")
                    
                    output_name = input_def.get('outputName')
                    source_step = next((s for s in plan if s.get('id') == source_id), None)
                    if source_step and output_name:
                        available_outputs = set(source_step.get('outputs', {}).keys())
                        if output_name not in available_outputs:
                            issues.append(f"Step {step_id} input '{input_name}' references output '{output_name}' "
                                        f"which is not defined in step {source_id}")
        
        return issues
        
        if isinstance(available_plugins_raw, str):
            try:
                available_plugins_raw = json.loads(available_plugins_raw)
            except json.JSONDecodeError:
                # logger.debug("PlanValidator: _parse_available_plugins - raw string is not JSON. Returning empty list.")
                return []
        
        if isinstance(available_plugins_raw, dict):
            # logger.debug("PlanValidator: _parse_available_plugins - raw is dict, extracting 'value'.")
            return available_plugins_raw.get('value', [])
        
        # logger.debug(f"PlanValidator: _parse_available_plugins - returning list (type: {type(available_plugins_raw)}).")
        return available_plugins_raw if isinstance(available_plugins_raw, list) else []

    def _initialize_plugin_map(self, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Initializes the plugin map from the available plugins in the inputs."""
        # logger.debug("PlanValidator: _initialize_plugin_map called.")
        available_plugins = self._parse_available_plugins(inputs)
        self.plugin_map = {}
        
        if not available_plugins:
            # logger.debug("PlanValidator: _initialize_plugin_map - no available plugins.")
            return []

        if not isinstance(available_plugins, list) or not all(isinstance(p, dict) for p in available_plugins):
            logger.error(f"PlanValidator: Invalid availablePlugins format. Expected a list of dictionaries, got: {type(available_plugins)}")
            return []

        # List of manifests
        for plugin in available_plugins:
            action_verb = plugin.get('verb')
            if action_verb:
                self.plugin_map[action_verb.upper()] = plugin
        # logger.debug(f"PlanValidator: Initialized plugin_map with {len(self.plugin_map)} entries. Keys: {list(self.plugin_map.keys())}")
        return available_plugins

    def _get_sub_plan(self, step: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Extracts a sub-plan from a step, if one exists."""
        # logger.debug(f"PlanValidator: _get_sub_plan called for step ID: {step.get('id')}")
        # Direct steps property
        if 'steps' in step and isinstance(step['steps'], list):
            # logger.debug(f"PlanValidator: _get_sub_plan - found direct 'steps' property.")
            return step['steps']
        
        # Nested in inputs.steps.value
        steps_input = step.get('inputs', {}).get('steps')
        if isinstance(steps_input, dict) and isinstance(steps_input.get('value'), list):
            # logger.debug(f"PlanValidator: _get_sub_plan - found nested 'inputs.steps.value'.")
            return steps_input['value']
        
        # logger.debug(f"PlanValidator: _get_sub_plan - no sub-plan found for step ID: {step.get('id')}.")
        return None

    def _get_downstream_dependencies(self, start_step_id: str, plan: List[Dict[str, Any]], all_steps: Dict[str, Any]) -> Set[str]:
        """Builds a dependency graph and finds all downstream dependencies for a given step."""
        # logger.debug(f"PlanValidator: _get_downstream_dependencies called for start_step_id: {start_step_id}")
        adj_list = {}

        def build_adj_list(current_plan):
            # logger.debug(f"PlanValidator: build_adj_list - traversing plan of length {len(current_plan)}.")
            for step in current_plan:
                step_id = step.get('id')
                if step_id is None:
                    continue
                if step_id not in adj_list:
                    adj_list[step_id] = []

                # Add dependencies from direct inputs
                for input_def in step.get('inputs', {}).values():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        source_step = input_def['sourceStep']
                        if source_step != '0' and source_step in all_steps:
                            if source_step not in adj_list:
                                adj_list[source_step] = []
                            adj_list[source_step].append(step_id)
                
                # Recurse into sub-plans
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    # logger.debug(f"PlanValidator: build_adj_list - recursing into sub-plan for step {step_id}.")
                    build_adj_list(sub_plan)

        build_adj_list(plan)
        # logger.debug(f"PlanValidator: _get_downstream_dependencies - Adjacency list built: {adj_list}")

        downstream_deps = set()
        queue = [start_step_id]
        visited = {start_step_id}

        while queue:
            current_step_id = queue.pop(0)
            if current_step_id in adj_list:
                for dependent_step_id in adj_list[current_step_id]:
                    if dependent_step_id not in visited:
                        downstream_deps.add(dependent_step_id)
                        visited.add(dependent_step_id)
                        queue.append(dependent_step_id)
                        
        # logger.debug(f"PlanValidator: _get_downstream_dependencies - Found downstream dependencies for {start_step_id}: {downstream_deps}")
        return downstream_deps

    def _is_valid_uuid(self, uuid_string: str) -> bool:
        """Check if a string is a valid UUID and not a placeholder."""
        # logger.debug(f"PlanValidator: _is_valid_uuid called for: {uuid_string}")
        if not isinstance(uuid_string, str) or not uuid_string:
            return False
        # Reject known placeholder UUIDs
        if "0000-0000-0000" in uuid_string:
            # logger.debug(f"PlanValidator: _is_valid_uuid - '{uuid_string}' is a placeholder UUID.")
            return False
        try:
            uuid.UUID(uuid_string)
            return True
        except ValueError:
            # logger.debug(f"PlanValidator: _is_valid_uuid - '{uuid_string}' is not a valid UUID.")
            return False

    def _recursively_update_dependencies(self, plan: List[Dict[str, Any]], regroup_map: Dict[Tuple[str, str], str]):
        """Recursively update dependencies based on the provided regroup_map."""
        # logger.debug(f"PlanValidator: _recursively_update_dependencies called with regroup_map.")
        for step in plan:
            if not isinstance(step, dict):
                continue

            # Update dependencies in the current step's inputs
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict):
                    original_source_id = input_def.get('sourceStep')
                    original_output_name = input_def.get('outputName')
                    
                    if (original_source_id, original_output_name) in regroup_map:
                        new_regroup_id = regroup_map[(original_source_id, original_output_name)]
                        logger.info(f"PlanValidator: Updating step {step['id']} input '{input_name}' to reference REGROUP {new_regroup_id} (was {original_source_id}.{original_output_name})")
                        input_def['sourceStep'] = new_regroup_id
                        input_def['outputName'] = 'result' # All REGROUP steps use 'result' output

            # Recurse into sub-plans (do this for all sub-plans so REGROUP references
            # are updated everywhere, including inside newly-created FOREACH blocks)
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                # logger.debug(f"PlanValidator: _recursively_update_dependencies - recursing into sub-plan for step {step.get('id')}.")
                self._recursively_update_dependencies(sub_plan, regroup_map)
        # logger.debug("PlanValidator: _recursively_update_dependencies completed.")

    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], step_to_wrap_id: str,
                              source_step_id: str, source_output_name: str, target_input_name: str,
                              all_steps: Dict[str, Any], scope_id: str) -> List[Dict[str, Any]]:
        """
        Wraps a step and its downstream dependencies in a FOREACH loop.
        Creates specific REGROUP steps for each unique output that is consumed by the rest of the plan.
        """
        # logger.debug(f"PlanValidator: _wrap_step_in_foreach called for step ID: {step_to_wrap_id}")

        step_to_wrap_obj = all_steps.get(step_to_wrap_id)
        if not step_to_wrap_obj:
            logger.error(f"PlanValidator: Step to wrap with ID {step_to_wrap_id} not found in all_steps.")
            return plan

        logger.info(f"PlanValidator: Wrapping step {step_to_wrap_obj['id']} in FOREACH for input '{target_input_name}'")

        # Find all downstream steps that should also be included in the sub-plan.
        string_consuming_deps = self._get_string_consuming_downstream_steps(step_to_wrap_id, all_steps)
        moved_step_ids = {step_to_wrap_id} | string_consuming_deps
        logger.info(f"PlanValidator: _wrap_step_in_foreach - Steps to move into FOREACH subplan: {moved_step_ids}")

        # Preserve an execution-consistent ordering for the sub-plan instead of arbitrary set iteration
        try:
            ordering = self._get_execution_order(plan, all_steps)
        except Exception:
            ordering = list(all_steps.keys())
        sub_plan = [copy.deepcopy(all_steps[step_id]) for step_id in ordering if step_id in moved_step_ids]

        for step in sub_plan:
            if step['id'] == step_to_wrap_id:
                step['inputs'][target_input_name] = {"outputName": "item", "sourceStep": "0"}
                break
        
        # logger.debug(f"PlanValidator: _wrap_step_in_foreach - Sub-plan created with {len(sub_plan)} steps.")

        foreach_step_id = str(uuid.uuid4())
        foreach_step = {
            "id": foreach_step_id,
            "actionVerb": "FOREACH",
            "description": f"Iterate over '{source_output_name}' from step {source_step_id}",
            "scope_id": scope_id,
            "inputs": {
                "array": {"outputName": source_output_name, "sourceStep": source_step_id},
                "steps": {"value": sub_plan, "valueType": "array"}
            },
            "outputs": {
                "steps": {"description": "The end steps to be executed for each instance of the subplan.", "type": "array"},
            },
            "recommendedRole": "Coordinator"
        }
        # logger.debug(f"PlanValidator: _wrap_step_in_foreach - FOREACH step created: {foreach_step_id}.")

        # --- Mark wrapped steps to prevent re-wrapping (idempotency) ---
        # Add _wrapped_by metadata to all steps that were moved into the FOREACH subplan
        for step_id in moved_step_ids:
            wrapped_step = all_steps.get(step_id)
            if wrapped_step:
                if '_metadata' not in wrapped_step:
                    wrapped_step['_metadata'] = {}
                wrapped_step['_metadata']['_wrapped_by'] = 'FOREACH'
                wrapped_step['_metadata']['_wrapper_step_id'] = foreach_step_id
                logger.debug(f"PlanValidator: Marked step {step_id} as wrapped by FOREACH {foreach_step_id}")

        # --- Multi-REGROUP Logic ---
        new_plan = [step for step in plan if step.get('id') not in moved_step_ids]
        
        external_dependencies = {} # Key: (source_id, output_name), Value: list of consumer steps
        for step in new_plan:
            for input_def in step.get('inputs', {}).values():
                # Be defensive: input_def may not contain outputName (older/novel formats)
                if isinstance(input_def, dict):
                    src = input_def.get('sourceStep')
                    out_name = input_def.get('outputName')
                    if src in moved_step_ids:
                        dep_key = (src, out_name)
                        if dep_key not in external_dependencies:
                            external_dependencies[dep_key] = []
                        external_dependencies[dep_key].append(step['id'])

        regroup_steps = []
        regroup_map = {} # Key: (source_id, output_name), Value: new_regroup_id
        
        if external_dependencies:
            logger.info(f"PlanValidator: Found {len(external_dependencies)} unique external dependencies on the sub-plan. Creating REGROUP steps.")
            for (source_id, output_name), consumers in external_dependencies.items():
                regroup_step_id = str(uuid.uuid4())
                regroup_map[(source_id, output_name)] = regroup_step_id
                
                source_step_desc = all_steps.get(source_id, {}).get('actionVerb', source_id)

                regroup_step = {
                    "id": regroup_step_id,
                    "actionVerb": "REGROUP",
                    "description": f"Collects '{output_name}' from all '{source_step_desc}' steps in FOREACH loop {foreach_step_id}",
                    "scope_id": scope_id,
                    "inputs": {
                        "foreach_results": {"outputName": "steps", "sourceStep": foreach_step_id},
                        "source_step_id_in_subplan": {"value": source_id, "valueType": "string"},
                        "output_to_collect": {"value": output_name, "valueType": "string"}
                    },
                    "outputs": {
                        "result": {"description": f"An array of all '{output_name}' outputs.", "type": "array"}
                    },
                    "recommendedRole": "Coordinator"
                }
                regroup_steps.append(regroup_step)
                logger.debug(f"PlanValidator: Created REGROUP step {regroup_step_id} for {source_id}.{output_name}.")

        # Always create a REGROUP for the final output of the sub-plan if it's not already covered
        if sub_plan:
            final_step_in_subplan_id = sub_plan[-1]['id']
            final_step_outputs = sub_plan[-1].get('outputs', {})
            for final_output_name in final_step_outputs.keys():
                if (final_step_in_subplan_id, final_output_name) not in regroup_map:
                    regroup_step_id = str(uuid.uuid4())
                    # We don't add this to regroup_map because no external steps are using it yet,
                    # but it makes the output available for future reflection or manual use.
                    
                    source_step_desc = all_steps.get(final_step_in_subplan_id, {}).get('actionVerb', final_step_in_subplan_id)

                    regroup_step = {
                        "id": regroup_step_id,
                        "actionVerb": "REGROUP",
                        "description": f"Collects final output '{final_output_name}' from all '{source_step_desc}' steps in FOREACH loop {foreach_step_id}",
                        "scope_id": scope_id,
                        "inputs": {
                            "foreach_results": {"outputName": "steps", "sourceStep": foreach_step_id},
                            "source_step_id_in_subplan": {"value": final_step_in_subplan_id, "valueType": "string"},
                            "output_to_collect": {"value": final_output_name, "valueType": "string"}
                        },
                        "outputs": {
                            "result": {"description": f"An array of all '{final_output_name}' outputs.", "type": "array"}
                        },
                        "recommendedRole": "Coordinator"
                    }
                    regroup_steps.append(regroup_step)
                    logger.info(f"PlanValidator: Created default REGROUP step {regroup_step_id} for final sub-plan output {final_step_in_subplan_id}.{final_output_name}.")

        # Find the position of the source step and insert the FOREACH and REGROUP steps after it
        inserted = False
        for i, step in enumerate(new_plan):
            if step.get('id') == source_step_id:
                new_plan.insert(i + 1, foreach_step)
                new_plan[i+2:i+2] = regroup_steps # Insert all regroup steps
                inserted = True
                break
        
        if not inserted:
            new_plan.insert(0, foreach_step)
            new_plan[1:1] = regroup_steps

        # Update dependencies in the rest of the plan using the new map
        self._recursively_update_dependencies(new_plan, regroup_map)

        logger.info(f"PlanValidator: Created FOREACH step {foreach_step_id} with {len(sub_plan)} sub-steps and {len(regroup_steps)} REGROUP steps.")
        return new_plan

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any],
                           attempt: int = 1, previous_errors: List[str] = []) -> List[Dict[str, Any]]:
        """
        Validates and transforms a plan using a recursive approach to handle
        nested structures like FOREACH loops correctly.
        """
        logger.info(f"--- Plan Validation and Transformation ---")
        logger.info(f"INPUT PLAN: {len(plan)} steps")
        for i, step in enumerate(plan):
            logger.info(f"  Input Step {i}: {step.get('actionVerb')} - {step.get('description', '')[:60]}")
        
        try:
            # NEW: Pre-validation integrity check before full validation
            integrity_issues = self._validate_plan_integrity(plan)
            if integrity_issues:
                logger.error(f"PlanValidator: Plan integrity issues found:")
                for issue in integrity_issues:
                    logger.error(f"  - {issue}")
            
            self.plugin_map.clear()
            self._initialize_plugin_map(inputs)
            
            # Start the recursive transformation
            transformed_plan, all_steps_map = self._transform_plan_recursive(plan)
            
            logger.info(f"OUTPUT PLAN: {len(transformed_plan)} steps")
            for i, step in enumerate(transformed_plan):
                logger.info(f"  Output Step {i}: {step.get('actionVerb')} - {step.get('description', '')[:60]}")
            
            if len(transformed_plan) < len(plan):
                logger.error(f"CRITICAL STEP LOSS: Input had {len(plan)} steps, output has {len(transformed_plan)} steps!")
            
            # Final validation pass (optional, as transformation should ensure validity)
            # errors = self._final_validation_pass(transformed_plan, all_steps_map)
            # if errors:
            #     logger.warning(f"Final plan has validation issues: {errors}")

            return transformed_plan

        except Exception as e:
            logger.critical(f"PlanValidator: Critical error during plan validation: {e}", exc_info=True)
            # In case of a critical failure, return the original plan to avoid losing it.
            return plan
    
    def _build_flat_representation(self, plan: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Recursively traverses the plan to build a flat representation."""
        # logger.debug("PlanValidator: _build_flat_representation called.")
        all_steps = {}
        parents = {}
        outputs = {}
        uuid_map = {}

        def traverse(current_plan: List[Dict[str, Any]], parent_id: Optional[str] = None):
            for step in current_plan:
                if not isinstance(step, dict):
                    continue
                
                original_id = step.get('id')
                new_id = original_id
                
                if not self._is_valid_uuid(original_id):
                    new_id = str(uuid.uuid4())
                    if original_id:
                        uuid_map[original_id] = new_id
                    step['id'] = new_id
                
                # A step's definition (all_steps) and its outputs (outputs) are unique by ID.
                # However, its parent relationship needs to be updated based on the current traversal path.
                all_steps[new_id] = step
                if parent_id:
                    parents[new_id] = parent_id
                
                step_outputs = {}
                for out_name, out_def in step.get('outputs', {}).items():
                    if isinstance(out_def, dict) and 'type' in out_def:
                        step_outputs[out_name] = out_def['type']
                    elif isinstance(out_def, str):
                        step_outputs[out_name] = 'string' # Assume string if only description is provided
                outputs[new_id] = step_outputs

                # Always recurse, even if the step itself was a duplicate, to handle its children.
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    traverse(sub_plan, new_id)

        traverse(plan)
        # logger.debug(f"PlanValidator: _build_flat_representation completed. Found {len(all_steps)} steps.")
        return {"steps": all_steps, "parents": parents, "outputs": outputs, "uuid_map": uuid_map}

    def _get_execution_order(self, plan: List[Dict[str, Any]], all_steps: Dict[str, Any]) -> List[str]:
        """
        Performs a topological sort on the plan to get a valid execution order.
        Handles steps within the current scope (not sub-plans).
        """
        # logger.debug("PlanValidator: _get_execution_order called.")
        
        # Build graph for the current plan level
        adj: Dict[str, List[str]] = {step.get('id'): [] for step in plan if step.get('id')}
        in_degree: Dict[str, int] = {step.get('id'): 0 for step in plan if step.get('id')}

        for step in plan:
            step_id = step.get('id')
            if not step_id:
                continue

            for input_def in step.get('inputs', {}).values():
                if isinstance(input_def, dict):
                    source_id = input_def.get('sourceStep')
                    # Only consider dependencies within the current plan level (present in adj)
                    if source_id and source_id in adj:
                        adj[source_id].append(step_id)
                        in_degree[step_id] = in_degree.get(step_id, 0) + 1
        
        # Kahn's algorithm for topological sort
        queue = [step_id for step_id, degree in in_degree.items() if degree == 0]
        execution_order = []
        
        while queue:
            current_id = queue.pop(0)
            execution_order.append(current_id)
            
            if current_id in adj:
                for neighbor_id in adj[current_id]:
                    in_degree[neighbor_id] -= 1
                    if in_degree[neighbor_id] == 0:
                        queue.append(neighbor_id)

        if len(execution_order) != len(adj):
            logger.warning(f"PlanValidator: Cycle detected in plan dependencies. Plan may be invalid. Order length: {len(execution_order)}, Adj length: {len(adj)}")
            # Fallback for cyclic dependencies: return all step ids, which might fail later but avoids a crash here
            return list(adj.keys())

        # logger.debug(f"PlanValidator: _get_execution_order completed. Order: {execution_order}")
        return execution_order

    def _apply_uuid_map_recursive(self, plan: List[Dict[str, Any]], uuid_map: Dict[str, str]) -> List[Dict[str, Any]]:
        """
        Recursively traverses the plan and updates all sourceStep references based on the uuid_map.
        """
        # logger.debug(f"PlanValidator: _apply_uuid_map_recursive called for plan with {len(plan)} steps.")
        for step in plan:
            if not isinstance(step, dict):
                continue

            # Update sourceStep in inputs
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    original_source_id = input_def['sourceStep']
                    if original_source_id in uuid_map:
                        new_source_id = uuid_map[original_source_id]
                        logger.info(f"PlanValidator: Remapping step '{step.get('id')}' input '{input_name}': sourceStep changed from '{original_source_id}' to '{new_source_id}'.")
                        input_def['sourceStep'] = new_source_id

            # Recurse into sub-plans
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                # logger.debug(f"PlanValidator: _apply_uuid_map_recursive - recursing into sub-plan for step {step.get('id')}.")
                self._apply_uuid_map_recursive(sub_plan, uuid_map)
        
        return plan

    def _transform_plan_recursive(self, plan: List[Dict[str, Any]], scope_id: str = "root",
                              full_step_map: Optional[Dict[str, Any]] = None,
                              full_parent_map: Optional[Dict[str, str]] = None,
                              full_output_map: Optional[Dict[str, Any]] = None
                             ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        The main recursive function that traverses and transforms the plan.
        It builds a representation of the current plan level, validates steps,
        and recursively calls itself on sub-plans.
        """
        # logger.debug(f"Entering _transform_plan_recursive for scope: {scope_id}")

        if full_step_map is None:
            # This is the top-level call. Build the full representation.
            flat_repr = self._build_flat_representation(plan)
            all_steps = flat_repr['steps']
            step_parents = flat_repr['parents']
            step_outputs = flat_repr['outputs']
            uuid_map = flat_repr['uuid_map']

            if uuid_map:
                plan = self._apply_uuid_map_recursive(plan, uuid_map)
                # Rebuild after applying UUIDs
                flat_repr = self._build_flat_representation(plan)
                all_steps = flat_repr['steps']
                step_parents = flat_repr['parents']
                step_outputs = flat_repr['outputs']
            
            # --- Enforce actionVerb on all steps (normalization pass) ---
            # Every step MUST have an actionVerb. If missing, assign 'ACCOMPLISH' as default.
            # This prevents undefined actionVerb from propagating to Step.ts, where it will throw.
            for step_id, step in all_steps.items():
                if not step.get('actionVerb') or not isinstance(step.get('actionVerb'), str) or step.get('actionVerb').strip() == '':
                    logger.warning(f"PlanValidator: Step {step_id} has missing or invalid actionVerb. Assigning default 'ACCOMPLISH'.")
                    step['actionVerb'] = 'ACCOMPLISH'
                    # Update the plan as well
                    for plan_step in plan:
                        if plan_step.get('id') == step_id:
                            plan_step['actionVerb'] = 'ACCOMPLISH'
                            break
        else:
            # This is a recursive call. Use the maps from the parent.
            all_steps = full_step_map
            step_parents = full_parent_map
            step_outputs = full_output_map
            
            # Even in recursive calls, enforce actionVerb on new steps in the current plan
            for step in plan:
                if not step.get('actionVerb') or not isinstance(step.get('actionVerb'), str) or step.get('actionVerb').strip() == '':
                    logger.warning(f"PlanValidator: Step {step.get('id')} (in recursive call) has missing or invalid actionVerb. Assigning default 'ACCOMPLISH'.")
                    step['actionVerb'] = 'ACCOMPLISH'

        # Iteratively validate and repair the current plan level
        # This loop will be restarted if a transformation occurs
        while True:
            made_change = False
            errors = []
            wrappable_errors = []
            
            execution_order = self._get_execution_order(plan, all_steps)

            for step_id in execution_order:
                step = all_steps.get(step_id)
                if not step:
                    continue

                current_available_outputs = self._get_available_outputs_for_step(step_id, execution_order, step_outputs, step_parents, all_steps)
                
                step_errors, step_wrappable = self._validate_step(
                    step, current_available_outputs, all_steps, step_parents
                )
                errors.extend(step_errors)
                wrappable_errors.extend(step_wrappable)

            if wrappable_errors:
                logger.info(f"Found {len(wrappable_errors)} candidates for FOREACH wrapping in scope {scope_id}.")
                error_to_wrap = wrappable_errors[0]
                
                # Generate a new scope_id for the sub-plan
                new_scope_id = str(uuid.uuid4())

                plan = self._wrap_step_in_foreach(
                    plan,
                    error_to_wrap['step_id'],
                    error_to_wrap['source_step_id'],
                    error_to_wrap['source_output_name'],
                    error_to_wrap['target_input_name'],
                    all_steps,
                    new_scope_id # Pass the new scope_id
                )
                
                # A transformation was made, so we must rebuild the representation and restart the loop
                # This is the key to ensuring consistency after transformations.
                logger.info("Plan has been transformed by FOREACH wrapper. Rebuilding full plan representation.")
                flat_repr = self._build_flat_representation(plan)
                all_steps = flat_repr['steps']
                step_parents = flat_repr['parents']
                step_outputs = flat_repr['outputs']
                uuid_map = flat_repr['uuid_map']

                if uuid_map:
                    logger.info("Applying new UUID map after transformation.")
                    plan = self._apply_uuid_map_recursive(plan, uuid_map)
                    # Rebuild again after applying UUIDs to ensure maps are fully consistent
                    flat_repr = self._build_flat_representation(plan)
                    all_steps = flat_repr['steps']
                    step_parents = flat_repr['parents']
                    step_outputs = flat_repr['outputs']
                
                made_change = True
                continue # Use continue to restart the while loop from the top
            
            # If we get through the whole plan without making a change, we're done with this level.
            if not made_change:
                break
        
        # --- Recursive Step ---
        # After this level is stable, recurse into any sub-plans
        for step in plan:
            original_sub_plan = self._get_sub_plan(step)
            if original_sub_plan:
                # logger.debug(f"Recursing into sub-plan of step {step['id']} ({step['actionVerb']})")
                
                # The scope_id for the sub-plan is the one defined in the step itself
                sub_plan_scope_id = step.get('scope_id', str(uuid.uuid4()))

                transformed_sub_plan, _ = self._transform_plan_recursive(
                    original_sub_plan,
                    scope_id=sub_plan_scope_id,
                    full_step_map=all_steps,
                    full_parent_map=step_parents,
                    full_output_map=step_outputs
                )
                
                # Update the sub-plan in the parent step
                if 'steps' in step and isinstance(step['steps'], list):
                    step['steps'] = transformed_sub_plan
                elif 'inputs' in step and 'steps' in step['inputs'] and 'value' in step['inputs']['steps']:
                    step['inputs']['steps']['value'] = transformed_sub_plan
                # logger.debug(f"Finished recursion for sub-plan of step {step['id']}. Sub-plan now has {len(transformed_sub_plan)} steps.")

        logger.info(f"_transform_plan_recursive returning: {len(plan)} steps for scope {scope_id}")
        for i, step in enumerate(plan):
            logger.info(f"  Step {i}: {step.get('actionVerb')} - {step.get('description', '')[:60]}")
        
        return plan, all_steps

    def _is_valid_uuid(self, uuid_string: str) -> bool:
        """Check if a string is a valid UUID and not a placeholder."""
        # logger.debug(f"PlanValidator: _is_valid_uuid called for: {uuid_string}")
        if not isinstance(uuid_string, str) or not uuid_string:
            return False
        # Reject known placeholder UUIDs
        if "0000-0000-0000" in uuid_string:
            # logger.debug(f"PlanValidator: _is_valid_uuid - '{uuid_string}' is a placeholder UUID.")
            return False
        try:
            uuid.UUID(uuid_string)
            return True
        except ValueError:
            # logger.debug(f"PlanValidator: _is_valid_uuid - '{uuid_string}' is not a valid UUID.")
            return False

    def _get_downstream_dependencies(self, start_step_id: str, plan: List[Dict[str, Any]], all_steps: Dict[str, Any]) -> Set[str]:
        """Builds a dependency graph and finds all downstream dependencies for a given step."""
        # logger.debug(f"PlanValidator: _get_downstream_dependencies called for start_step_id: {start_step_id}")
        adj_list = {}

        def build_adj_list(current_plan):
            # logger.debug(f"PlanValidator: build_adj_list - traversing plan of length {len(current_plan)}.")
            for step in current_plan:
                step_id = step.get('id')
                if step_id is None:
                    continue
                if step_id not in adj_list:
                    adj_list[step_id] = []

                # Add dependencies from direct inputs
                for input_def in step.get('inputs', {}).values():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        source_step = input_def['sourceStep']
                        if source_step != '0' and source_step in all_steps:
                            if source_step not in adj_list:
                                adj_list[source_step] = []
                            adj_list[source_step].append(step_id)
                
                # Recurse into sub-plans
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    # logger.debug(f"PlanValidator: build_adj_list - recursing into sub-plan for step {step_id}.")
                    build_adj_list(sub_plan)

        build_adj_list(plan)
        # logger.debug(f"PlanValidator: _get_downstream_dependencies - Adjacency list built: {adj_list}")

        downstream_deps = set()
        queue = [start_step_id]
        visited = {start_step_id}

        while queue:
            current_step_id = queue.pop(0)
            if current_step_id in adj_list:
                for dependent_step_id in adj_list[current_step_id]:
                    if dependent_step_id not in visited:
                        downstream_deps.add(dependent_step_id)
                        visited.add(dependent_step_id)
                        queue.append(dependent_step_id)
                        
        # logger.debug(f"PlanValidator: _get_downstream_dependencies - Found downstream dependencies for {start_step_id}: {downstream_deps}")
        return downstream_deps

    def _get_string_consuming_downstream_steps(self, start_step_id: str, all_steps: Dict[str, Any]) -> Set[str]:
        """
        Finds downstream steps that should be included in the FOREACH subplan.
        Starts from `start_step_id` and traverses dependencies, including steps that consume
        unitary types (like string, any). The traversal stops when a dependent step expects
        an array-like input, as that step will need to be handled by a REGROUP.
        """
        logger.info(f"PlanValidator: Finding string-consuming downstream steps starting from {start_step_id}")

        # Build a forward adjacency list: step_id -> [list of (consumer_step_id, consumer_input_name)]
        adj_list: Dict[str, List[Tuple[str, str]]] = {}
        for step in all_steps.values():
            step_id = step.get('id')
            if not step_id: continue

            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict):
                    source_id = input_def.get('sourceStep')
                    if source_id and source_id != '0' and source_id in all_steps:
                        if source_id not in adj_list:
                            adj_list[source_id] = []
                        adj_list[source_id].append((step_id, input_name))

        steps_to_include = set()
        queue = [start_step_id]
        # visited set should contain steps that have been added to the queue, to avoid processing them multiple times.
        # start_step_id itself isn't "included" in the return set, but it is the start of the chain.
        visited = {start_step_id}

        while queue:
            current_id = queue.pop(0)

            if current_id not in adj_list:
                continue  # This step is a leaf in the dependency graph

            for consumer_step_id, consumer_input_name in adj_list[current_id]:
                if consumer_step_id in visited:
                    continue

                consumer_step = all_steps.get(consumer_step_id)
                if not consumer_step:
                    continue

                # Determine the type this consumer input expects
                consumer_action_verb = consumer_step.get('actionVerb', '').upper()
                consumer_plugin_def = self.plugin_map.get(consumer_action_verb)

                expected_input_type = 'string'  # Default to string for novel verbs or if type is missing
                if consumer_plugin_def:
                    for in_def in consumer_plugin_def.get('inputDefinitions', []):
                        if in_def.get('name') == consumer_input_name:
                            expected_input_type = in_def.get('type', 'string')
                            break
                elif consumer_action_verb in self.CONTROL_FLOW_VERBS:
                    # Special handling for control flow verbs where the manifest might not be standard
                    if consumer_action_verb == 'FOREACH' and consumer_input_name == 'array':
                        expected_input_type = 'array'

                # If the consumer expects an array, it should NOT be in the subplan. Stop traversal.
                if expected_input_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]']:
                    logger.info(f"PlanValidator: Stopping sub-plan traversal at step {consumer_step_id}. It expects an array for input '{consumer_input_name}' and will need a REGROUP.")
                    continue

                # This step is a dependency that consumes a unitary type.
                # Add it to our set to be moved, and to the queue for further traversal.
                logger.info(f"PlanValidator: Adding step {consumer_step_id} to FOREACH subplan.")
                steps_to_include.add(consumer_step_id)
                visited.add(consumer_step_id)
                queue.append(consumer_step_id)

        logger.info(f"PlanValidator: Downstream steps to include in FOREACH: {steps_to_include}")
        return steps_to_include

    def _recursively_update_dependencies(self, plan: List[Dict[str, Any]], regroup_map: Dict[Tuple[str, str], str]):
        """Recursively update dependencies based on the provided regroup_map."""
        # logger.debug(f"PlanValidator: _recursively_update_dependencies called with regroup_map.")
        for step in plan:
            if not isinstance(step, dict):
                continue

            # Update dependencies in the current step's inputs
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict):
                    original_source_id = input_def.get('sourceStep')
                    original_output_name = input_def.get('outputName')
                    
                    if (original_source_id, original_output_name) in regroup_map:
                        new_regroup_id = regroup_map[(original_source_id, original_output_name)]
                        logger.info(f"PlanValidator: Updating step {step['id']} input '{input_name}' to reference REGROUP {new_regroup_id} (was {original_source_id}.{original_output_name})")
                        input_def['sourceStep'] = new_regroup_id
                        input_def['outputName'] = 'result' # All REGROUP steps use 'result' output

            # Recurse into sub-plans
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                # logger.debug(f"PlanValidator: _recursively_update_dependencies - recursing into sub-plan for step {step.get('id')}.")
                self._recursively_update_dependencies(sub_plan, regroup_map)
        # logger.debug("PlanValidator: _recursively_update_dependencies completed.")



    def _get_available_outputs_for_step(self, step_id: str, execution_order: List[str], 
                                        all_outputs: Dict[str, Dict[str, str]], parents: Dict[str, str], 
                                        all_steps: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
        """
        Determines all outputs available to a given step, mapping output names to their types.
        This includes outputs from:
        1. All preceding steps in the same sub-plan.
        2. The direct parent step and all its ancestors, including implicit outputs from control flow.
        """
        # logger.debug(f"PlanValidator: _get_available_outputs_for_step called for step ID: {step_id}")
        available: Dict[str, Dict[str, str]] = {}
        try:
            current_index = execution_order.index(step_id)
        except ValueError:
            logger.warning(f"PlanValidator: _get_available_outputs_for_step - Step ID {step_id} not found in execution_order. Returning empty available outputs.")
            return available
        
        # Add outputs from all preceding steps in the execution order
        for i in range(current_index):
            prev_step_id = execution_order[i]
            if prev_step_id in all_outputs:
                available[prev_step_id] = all_outputs[prev_step_id] # all_outputs now contains name -> type maps

        # Add outputs from parent hierarchy (for sub-plans)
        current_ancestor_id = parents.get(step_id)
        while current_ancestor_id:
            ancestor_step = all_steps.get(current_ancestor_id)
            if not ancestor_step: 
                current_ancestor_id = parents.get(current_ancestor_id)
                continue

            if current_ancestor_id not in available:
                # Initialize with explicit outputs from the ancestor, mapping name to type
                available[current_ancestor_id] = all_outputs.get(current_ancestor_id, {}) # all_outputs now contains name -> type maps
            
            # Explicitly inject implicit outputs for control flow verbs
            if ancestor_step.get('actionVerb') == 'FOREACH':
                item_type = 'any'
                foreach_array_input = ancestor_step.get('inputs', {}).get('array')
                if foreach_array_input:
                    if 'valueType' in foreach_array_input:
                        item_type = foreach_array_input['valueType']
                    elif 'outputName' in foreach_array_input and 'sourceStep' in foreach_array_input:
                        source_array_output_name = foreach_array_input['outputName']
                        source_array_step_id = foreach_array_input['sourceStep']
                        source_array_step_obj = all_steps.get(source_array_step_id)
                        if source_array_step_obj:
                            array_type_info = self._get_output_type_from_step_definition(source_array_step_obj, source_array_output_name)
                            if array_type_info and array_type_info.startswith('list['):
                                item_type = array_type_info[5:-1] # Extract element type
                            elif array_type_info == 'array':
                                item_type = 'any'
                
                # logger.debug(f"PlanValidator: _get_available_outputs_for_step - Adding implicit 'item' ({item_type}) and 'index' (number) from FOREACH parent {current_ancestor_id}.")
                available[current_ancestor_id]['item'] = item_type
                available[current_ancestor_id]['index'] = 'number'
            # Add logic for other control flow verbs if they provide implicit outputs via sourceStep: '0'
            # (e.g., DELEGATE might provide `_delegated_result` of type 'plan')
            
            current_ancestor_id = parents.get(current_ancestor_id)
            
        # logger.debug(f"PlanValidator: _get_available_outputs_for_step - Available outputs for {step_id}: {available}")
        return available

    def _validate_step(self, step: Dict[str, Any], available_outputs: Dict[str, Set[str]],
                       all_steps: Dict[str, Any], parents: Dict[str, str]) -> Tuple[List[str], List[Dict[str, Any]]]:
        """
        Validates a single step.
        Returns a tuple of (errors, wrappable_errors).
        """
        # logger.debug(f"PlanValidator: _validate_step called for step ID: {step.get('id')}")
        errors = []
        wrappable_errors = []
        step_id = step['id']
        action_verb = step.get('actionVerb')

        if not action_verb:
            errors.append(f"Step {step_id}: Missing 'actionVerb'.")
            # logger.debug(f"PlanValidator: _validate_step - Error: Missing actionVerb for step {step_id}.")
            return errors, wrappable_errors

        plugin_def = self.plugin_map.get(action_verb.upper())
        is_novel_verb = plugin_def is None # Flag for novel verbs
        # logger.debug(f"PlanValidator: _validate_step - Plugin definition for {action_verb}: {plugin_def is not None}. Is novel verb: {is_novel_verb}")

        # --- Validate Inputs ---
        inputs = step.get('inputs', {})
        if not isinstance(inputs, dict):
            errors.append(f"Step {step_id}: 'inputs' must be a dictionary.")
            # logger.debug(f"PlanValidator: _validate_step - Error: Inputs not a dict for step {step_id}.")
            return errors, wrappable_errors

        # Check for required inputs (only if it's a known plugin)
        if plugin_def:
            # logger.debug(f"PlanValidator: _validate_step - Checking required inputs for {action_verb}.")
            for req_input in plugin_def.get('inputDefinitions', []):
                if req_input.get('required') and req_input.get('name') not in inputs:
                    errors.append(f"Step {step_id}: Missing required input '{req_input['name']}' for '{action_verb}'.")
                    # logger.debug(f"PlanValidator: _validate_step - Error: Missing required input '{req_input['name']}' for step {step_id}.")
        elif is_novel_verb:
            logger.info(f"PlanValidator: _validate_step - Skipping manifest-based required input check for novel verb '{action_verb}'.")
			
        # Check each input
        for input_name, input_def in inputs.items():
            # logger.debug(f"PlanValidator: _validate_step - Validating input '{input_name}' for step {step_id}.")
            if not isinstance(input_def, dict):
                errors.append(f"Step {step_id}: Input '{input_name}' is not a valid dictionary.")
                # logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' not a dict for step {step_id}.")
                continue

            is_input_definition_valid = False
            if 'value' in input_def:
                # logger.debug(f"PlanValidator: _validate_step - Input '{input_name}' has a static value.")
                value = input_def.get('value')
                # NEW: Flag suspicious empty string values that might indicate broken references
                if value == "" and input_name not in ['context', 'notes', 'comments', 'description']:
                    logger.warning(f"PlanValidator: Step {step_id} input '{input_name}' has empty string value. "
                                  f"This might indicate an incomplete plan or broken reference. Action: {action_verb}")
                is_input_definition_valid = True
                # For novel verbs, if valueType is not specified, assume 'string' for basic compatibility
                if is_novel_verb and 'valueType' not in input_def:
                    logger.warning(f"PlanValidator: Novel verb '{action_verb}' input '{input_name}' has static value but no valueType. Assuming 'string'.")
                    input_def['valueType'] = 'string' # Default for basic compatibility

            elif 'sourceStep' in input_def and 'outputName' in input_def:
                source_step_id = input_def['sourceStep']
                output_name = input_def['outputName']
                # logger.debug(f"PlanValidator: _validate_step - Input '{input_name}' references output '{output_name}' from step '{source_step_id}'.")

                if source_step_id == '0': # Special case for parent-provided inputs
                    parent_id = parents.get(step_id)
                    if not parent_id:
                        errors.append(f"Step {step_id}: Input '{input_name}' references parent ('0'), but has no parent.")
                        # logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references parent but no parent found for step {step_id}.")
                    else:
                        parent_available_outputs = available_outputs.get(parent_id, {})
                        if output_name not in parent_available_outputs:
                            errors.append(f"Step {step_id}: Input '{input_name}' references unavailable implicit output '{output_name}' from parent '{parent_id}'.")
                            # logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references unavailable implicit output '{output_name}' from parent '{parent_id}' for step {step_id}.")
                        else:
                            source_output_type_from_available = parent_available_outputs[output_name]
                            pseudo_source_step = {
                                'id': parent_id,
                                'actionVerb': all_steps.get(parent_id, {}).get('actionVerb', 'UNKNOWN_PARENT_VERB'),
                                'outputs': {
                                    output_name: {'type': source_output_type_from_available}
                                }
                            }
                            # logger.debug(f"PlanValidator: _validate_step - Checking type compatibility for implicit input '{input_name}' (output: {output_name}) from parent {parent_id}.")
                            type_error, wrappable = self._check_type_compatibility(
                                step, input_name, input_def, pseudo_source_step, output_name, is_novel_verb # Pass is_novel_verb
                            )
                            if type_error: errors.append(type_error)
                            if wrappable: wrappable_errors.append(wrappable)
                            is_input_definition_valid = True
                elif source_step_id not in available_outputs:
                    errors.append(f"Step {step_id}: Input '{input_name}' references unavailable step '{source_step_id}'.")
                    # logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references unavailable step '{source_step_id}' for step {step_id}.")
                elif output_name not in available_outputs.get(source_step_id, {}): # Check against the dictionary of outputs for the source step
                    errors.append(f"Step {step_id}: Input '{input_name}' references unavailable output '{output_name}' from step '{source_step_id}'.")
                    # logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' references unavailable output '{output_name}' from step '{source_step_id}' for step {step_id}.")
                else: # Source step and output are available, perform type check
                    source_step_obj = all_steps.get(source_step_id)
                    if source_step_obj:
                        # logger.debug(f"PlanValidator: _validate_step - Checking type compatibility for input '{input_name}' from step {step_id}.")
                        type_error, wrappable = self._check_type_compatibility(
                            step, input_name, input_def, source_step_obj, output_name, is_novel_verb # Pass is_novel_verb
                        )
                        if type_error: errors.append(type_error)
                        if wrappable: wrappable_errors.append(wrappable)
                        is_input_definition_valid = True
            
            if not is_input_definition_valid and not errors: # Only append this generic error if no specific error was already added regarding source/output availability
                errors.append(f"Step {step_id}: Input '{input_name}' must have 'value' or both 'sourceStep' and 'outputName'.")
                # logger.debug(f"PlanValidator: _validate_step - Error: Input '{input_name}' missing value/sourceStep/outputName for step {step_id}.")

        # --- Validate Outputs ---
        # logger.debug(f"PlanValidator: _validate_step - Validating deliverable outputs for step {step_id}.")
        errors.extend(self._validate_deliverable_outputs(step))

        # logger.debug(f"PlanValidator: _validate_step completed for step {step_id}. Errors: {len(errors)}, Wrappable: {len(wrappable_errors)}.")
        return errors, wrappable_errors
    
    def _check_type_compatibility(self, dest_step: Dict[str, Any], dest_input_name: str, dest_input_def: Dict[str, Any],
                                  source_step: Dict[str, Any], source_output_name: str, is_dest_novel_verb: bool = False) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """
        Checks type compatibility between a source output and a destination input.
        Returns a tuple: (error_message, wrappable_error_dict).
        One of the two will be None.
        """
        # logger.debug(f"PlanValidator: _check_type_compatibility called for dest_step {dest_step.get('id')} input {dest_input_name}.")
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
            # logger.debug(f"PlanValidator: _check_type_compatibility - Could not determine source_output_type for {source_output_name}.")
            return (f"Step {dest_step['id']}: Could not determine type for output '{source_output_name}' from step {source_step['id']}.", None)

        # Determine destination input type
        dest_input_type = None
        if dest_plugin_def:
            for in_def in dest_plugin_def.get('inputDefinitions', []):
                if in_def.get('name') == dest_input_name:
                    dest_input_type = in_def.get('type')
                    break
        
        # If dest_input_type is not explicitly defined (e.g. for a novel verb), default to 'string'
        # to ensure that array-to-string mismatches are caught and wrapped.
        if not dest_input_type:
            dest_input_type = 'string'
            # logger.debug(f"PlanValidator: _check_type_compatibility - Could not determine dest_input_type for input '{dest_input_name}'. Defaulting to 'string' to trigger FOREACH if needed.")


        # logger.debug(f"PlanValidator: _check_type_compatibility - Input '{dest_input_name}' (expected: {dest_input_type}) vs Output '{source_output_name}' (actual: {source_output_type}).")
        # --- The Actual Check ---
        
        # Case 1: Mismatch suggests FOREACH wrapping
        # This check is independent of novel verbs, as it's a structural transformation
        # BUT: Do NOT wrap if the source step is already a FOREACH/REGROUP or has been wrapped
        is_wrappable = dest_input_type == 'string' and source_output_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]']

        if is_wrappable:
            source_action_verb_str = source_step.get('actionVerb', 'UNKNOWN')
            dest_action_verb_str = dest_step.get('actionVerb', 'UNKNOWN')

            # Skip wrapping if source is already a control flow step (FOREACH, REGROUP, etc.)
            if source_action_verb_str.upper() in self.CONTROL_FLOW_VERBS:
                logger.info(f"PlanValidator: Skipping FOREACH wrapping: source step {source_step['id']} is already a {source_action_verb_str} step.")
                return (None, None)

            # Skip wrapping if destination is a control flow step (FOREACH, REGROUP, etc.)
            # Control flow steps are designed to handle arrays directly
            if dest_action_verb_str.upper() in self.CONTROL_FLOW_VERBS:
                logger.info(f"PlanValidator: Skipping FOREACH wrapping: destination step {dest_step['id']} is a {dest_action_verb_str} step that handles arrays directly.")
                return (None, None)

            # Skip wrapping if source step has already been wrapped
            source_metadata = source_step.get('_metadata', {})
            if source_metadata.get('_wrapped_by'):
                logger.info(f"PlanValidator: Skipping FOREACH wrapping: source step {source_step['id']} is already wrapped by {source_metadata.get('_wrapped_by')}.")
                return (None, None)

            # logger.debug(f"PlanValidator: _check_type_compatibility - Wrappable error detected for step {dest_step['id']}.")
            wrappable_info = {
                "step_id": dest_step['id'],
                "source_step_id": source_step['id'],
                "source_output_name": source_output_name,
                "target_input_name": dest_input_name
            }
            return (None, wrappable_info)

        # Case 2: General type mismatch
        # For novel verbs, be more lenient with type compatibility as we don't have a manifest.
        if is_dest_novel_verb:
            types_compatible = (
                dest_input_type == source_output_type or
                dest_input_type == 'any' or source_output_type == 'any' or
                # Always allow conversion for novel verbs if type can be coerced (e.g., number/boolean/object/array to string)
                (dest_input_type == 'string' and source_output_type in ['number', 'boolean', 'object', 'array'])
            )
        else:
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
            # logger.debug(f"PlanValidator: _check_type_compatibility - Type mismatch error: {error_msg}")
            return (error_msg, None)

        # logger.debug(f"PlanValidator: _check_type_compatibility - Types compatible for step {dest_step['id']} input {dest_input_name}.")
        return (None, None)

    def _find_embedded_references(self, value: str) -> Set[str]:
        """Find all embedded references in a string value (e.g., {output_name} or [output_name])."""
        # logger.debug(f"PlanValidator: _find_embedded_references called for value: {value}")
        references = set(re.findall(r'[{[]([a-zA-Z0-9_]+)[}\]]', value))
        # logger.debug(f"PlanValidator: _find_embedded_references - Found references: {references}")
        return references

    def _validate_deliverable_outputs(self, step: Dict[str, Any]) -> List[str]:
        """Validate deliverable output properties."""
        # logger.debug(f"PlanValidator: _validate_deliverable_outputs called for step ID: {step.get('id')}")
        errors = []
        outputs = step.get('outputs', {})
        step_id = step.get('id', 'unknown')
        # logger.debug(f"PlanValidator: Step {step_id}: Type of outputs in _validate_deliverable_outputs: {type(outputs)}")

        for output_name, output_def in outputs.items():
            # logger.debug(f"PlanValidator: _validate_deliverable_outputs - Checking output '{output_name}' for step {step_id}.")
            if isinstance(output_def, dict):
                is_deliverable = output_def.get('isDeliverable', False)
                filename = output_def.get('filename')
                description = output_def.get('description')

                if not description:
                    errors.append(f"Step {step_id}: Output '{output_name}' requires 'description'")
                    # logger.debug(f"PlanValidator: _validate_deliverable_outputs - Error: Output '{output_name}' missing description for step {step_id}.")

                if is_deliverable and not filename:
                    errors.append(f"Step {step_id}: Output '{output_name}' marked deliverable but missing 'filename'")
                    # logger.debug(f"PlanValidator: _validate_deliverable_outputs - Error: Deliverable output '{output_name}' missing filename for step {step_id}.")

                if filename:
                    if not isinstance(filename, str) or not filename.strip():
                        errors.append(f"Step {step_id}: Output '{output_name}' filename must be non-empty string")
                        # logger.debug(f"PlanValidator: _validate_deliverable_outputs - Error: Filename not a non-empty string for output '{output_name}' for step {step_id}.")
                    elif not is_deliverable:
                        logger.warning(f"PlanValidator: Step {step_id}: Output '{output_name}' has filename but not marked deliverable")

        # logger.debug(f"PlanValidator: _validate_deliverable_outputs completed for step {step_id}. Errors: {len(errors)}.")
        return errors

    def _get_output_type_from_step_definition(self, step_def: Dict[str, Any], output_name: str) -> Optional[str]:
        """Helper to extract output type from a step definition."""
        outputs = step_def.get('outputs', {})
        output_def = outputs.get(output_name)
        if isinstance(output_def, dict) and 'type' in output_def:
            return output_def['type']
        elif isinstance(output_def, str):
            # If output_def is just a string, it's a description. Assume 'string' as the most common type.
            return 'string'
        return None

    def _classify_error_type(self, error: str) -> str:
        """Classify validation errors into categories."""
        # logger.debug(f"PlanValidator: _classify_error_type called for error: '{error}'")
        error_lower = error.lower()
        
        if 'missing required input' in error_lower:
            # logger.debug(f"PlanValidator: _classify_error_type - Classified as 'missing_input'.")
            return 'missing_input'
        elif 'invalid reference' in error_lower or 'sourceStep' in error_lower:
            # logger.debug(f"PlanValidator: _classify_error_type - Classified as 'invalid_reference'.")
            return 'invalid_reference'
        elif 'cannot find the source' in error_lower:
            # logger.debug(f"PlanValidator: _classify_error_type - Classified as 'unsourced_reference'.")
            return 'unsourced_reference'
        elif 'type mismatch' in error_lower or ('expected' in error_lower and 'got' in error_lower):
            # logger.debug(f"PlanValidator: _classify_error_type - Classified as 'type_mismatch'.")
            return 'type_mismatch'
        elif 'missing required field' in error_lower:
            # logger.debug(f"PlanValidator: _classify_error_type - Classified as 'missing_field'.")
            return 'missing_field'
        # logger.debug(f"PlanValidator: _classify_error_type - Classified as 'generic'.")
        return 'generic'

    def _create_focused_repair_prompt(self, step_to_repair: Dict[str, Any], errors: List[str], 
                                     plugin_definition: Dict[str, Any] = None) -> str:
        """Create a focused repair prompt based on error type."""
        # logger.debug(f"PlanValidator: _create_focused_repair_prompt called for step ID: {step_to_repair.get('id')}.")
        primary_error_type = self._classify_error_type(errors[0]) if errors else 'generic'
        step_json = json.dumps(step_to_repair, indent=2)
        errors_text = '\n'.join([f"- {error}" for error in errors])
        # logger.debug(f"PlanValidator: _create_focused_repair_prompt - Primary error type: {primary_error_type}")

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
        # logger.debug(f"PlanValidator: _repair_plan_with_llm called with {len(errors)} errors.")
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
            # logger.debug(f"PlanValidator: _repair_plan_with_llm - Identified step {step_to_repair.get('id')} for repair.")
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

        # logger.debug(f"PlanValidator: _repair_plan_with_llm - Calling brain for repair.")
        response = self.brain_call(prompt, inputs, "json")
        # logger.debug(f"PlanValidator: _repair_plan_with_llm - Brain call for repair returned.")
        
        try:
            repaired_data = json.loads(response)
            # logger.debug("PlanValidator: _repair_plan_with_llm - Successfully parsed LLM repair response.")
        except json.JSONDecodeError as e:
            logger.error(f"PlanValidator: _repair_plan_with_llm - LLM repair failed: Invalid JSON response: {e}")
            raise AccomplishError(f"LLM repair failed: Invalid JSON response: {e}", "repair_error")

        if repaired_data == plan:
            logger.warning("PlanValidator: _repair_plan_with_llm - LLM repair failed: No changes made to the plan.")
            raise AccomplishError("LLM repair failed: No changes made to the plan.", "repair_error")

        if prompt_type == "single_step" and isinstance(repaired_data, dict):
            plan[step_to_repair_index] = repaired_data
            # logger.debug(f"PlanValidator: _repair_plan_with_llm - Single step {step_to_repair.get('id')} repaired.")
            return plan
        elif prompt_type == "full_plan" and isinstance(repaired_data, list):
            # logger.debug("PlanValidator: _repair_plan_with_llm - Full plan repaired.")
            return repaired_data
        else:
            logger.error(f"PlanValidator: _repair_plan_with_llm - LLM repair failed: Unexpected response format for {prompt_type} repair.")
            raise AccomplishError(f"LLM repair failed: Unexpected response format for {prompt_type} repair.", "repair_error")
