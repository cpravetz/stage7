#!/usr/bin/env python3

import uuid
import json
import logging
import re
import copy
import os
import sys
from typing import Dict, Any, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum

# Configure logging if not already configured
if not logging.root.handlers:
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
    )

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

class ErrorType(Enum):
    """Structured error types for better error handling"""
    MISSING_INPUT = "missing_input"
    INVALID_REFERENCE = "invalid_reference"
    TYPE_MISMATCH = "type_mismatch"
    MISSING_FIELD = "missing_field"
    CIRCULAR_DEPENDENCY = "circular_dependency"
    INVALID_UUID = "invalid_uuid"
    GENERIC = "generic"


@dataclass
class StructuredError:
    """Structured error object for better error handling"""
    error_type: ErrorType
    message: str
    step_id: Optional[str] = None
    input_name: Optional[str] = None
    output_name: Optional[str] = None
    source_step_id: Optional[str] = None
    
    def to_string(self) -> str:
        return f"Step {self.step_id}: {self.message}" if self.step_id else self.message


@dataclass
class ValidationResult:
    """Result of validation operation with metadata"""
    plan: List[Dict[str, Any]]
    errors: List[StructuredError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    transformations_applied: List[str] = field(default_factory=list)
    is_valid: bool = True
    
    def is_improved_over(self, other: 'ValidationResult') -> bool:
        """Check if this result is better than another."""
        if self.is_valid and not other.is_valid:
            return True
        if not self.is_valid and other.is_valid:
            return False
        return len(self.errors) < len(other.errors)
    
    def get_error_messages(self) -> List[str]:
        """Get list of error messages as strings"""
        return [err.to_string() for err in self.errors]


class TransformationTracker:
    """Prevents infinite loops by tracking applied transformations."""
    def __init__(self):
        self.applied: Set[str] = set()
    
    def can_apply(self, transformation_key: str) -> bool:
        return transformation_key not in self.applied
    
    def mark_applied(self, transformation_key: str):
        self.applied.add(transformation_key)
    
    def get_key_for_foreach_wrap(self, step_id: str, source_step: str, 
                                   source_output: str) -> str:
        return f"FOREACH:{step_id}:{source_step}:{source_output}"


@dataclass
class PlanIndex:
    """Incremental index for plan structure to avoid repeated traversals"""
    steps: Dict[str, Any] = field(default_factory=dict)
    parents: Dict[str, str] = field(default_factory=dict)
    outputs: Dict[str, Dict[str, str]] = field(default_factory=dict)
    execution_orders: Dict[str, List[str]] = field(default_factory=dict)
    
    def invalidate_scope(self, scope_id: str):
        """Invalidate cached data for a specific scope"""
        if scope_id in self.execution_orders:
            del self.execution_orders[scope_id]


class PlanValidator:
    """Handles validation and repair of plans with improved efficiency and robustness."""
    
    # Class constants
    CONTROL_FLOW_VERBS = {'WHILE', 'SEQUENCE', 'IF_THEN', 'UNTIL', 'FOREACH', 'REPEAT', 'REGROUP'}
    ALLOWED_ROLES = {'coordinator', 'researcher', 'coder', 'creative', 'critic', 'executor', 'domain expert'}
    
    def __init__(self, brain_call: callable = None, available_plugins: List[Dict[str, Any]] = None, report_logic_failure_call: callable = None):
        self.brain_call = brain_call
        self.report_logic_failure_call = report_logic_failure_call
        self.max_retries = 3
        # Initialize plugin_map from the provided list
        self._initialize_plugin_map_from_list(available_plugins or [])

    def _initialize_plugin_map_from_list(self, available_plugins: List[Dict[str, Any]]):
        """Initializes the plugin map from a list of plugin manifests."""
        self.plugin_map = {}
        if not available_plugins:
            logger.info("PlanValidator: No available plugins provided.")
            return

        for plugin in available_plugins:
            action_verb = plugin.get('verb')
            if action_verb:
                self.plugin_map[action_verb.upper()] = plugin
        logger.info(f"PlanValidator: Initialized plugin_map with {len(self.plugin_map)} entries.")

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, 
                           inputs: Dict[str, Any]) -> ValidationResult:
        """
        Validates and attempts to repair a plan, returning a final validation result.
        This function no longer raises an exception on failure.
        """
        logger.info(f"--- Plan Validation and Transformation (Enhanced) ---")
        logger.info(f"INPUT PLAN: {len(plan)} steps")
        
        plan, uuid_map = self._assign_consistent_uuids(plan)
        if uuid_map:
            logger.info(f"Applied UUID mapping with {len(uuid_map)} replacements")
            plan = self._apply_uuid_map_recursive(plan, uuid_map)
        
        index = self._build_plan_index(plan)
        tracker = TransformationTracker()
        current_result = None
        
        for attempt in range(self.max_retries):
            logger.info(f"Validation attempt {attempt + 1}/{self.max_retries}")
            
            current_result = self._validate_and_transform(plan, index, tracker, inputs)
            
            if current_result.is_valid:
                logger.info(f"Plan successfully validated after {attempt + 1} attempts")
                return current_result
            
            logger.warning(f"Validation attempt {attempt + 1} found {len(current_result.errors)} errors.")

            # If programmatic transforms were applied, they might have fixed something.
            # The loop will continue and re-validate.
            if current_result.transformations_applied:
                plan = current_result.plan
                index = self._build_plan_index(plan)
                continue

            # No improvement from programmatic transforms, try LLM repair
            logger.warning("No improvement from programmatic transformations. Attempting LLM repair.")
            try:
                plan = self._repair_plan_with_llm(plan, current_result.errors, goal, inputs, tracker)
                index = self._build_plan_index(plan) # Re-index after potential repair
            except Exception as e:
                logger.error(f"LLM repair failed: {e}. Aborting repair attempts.")
                break # Exit the loop and return the last known result
        
        # After all attempts, return the last result, which will contain the remaining errors
        return current_result

    def _validate_and_transform(self, plan: List[Dict[str, Any]], 
                               index: PlanIndex,
                               tracker: TransformationTracker,
                               accomplish_inputs: Dict[str, Any]) -> ValidationResult:
        """
        Single validation and transformation pass using the index.
        """
        result = ValidationResult(plan=plan)
        
        # Recursive validation with transformation tracking
        transformed_plan, errors, warnings, transformations = self._transform_plan_recursive(
            plan, 
            scope_id="root",
            index=index,
            tracker=tracker,
            accomplish_inputs=accomplish_inputs
        )
        
        result.plan = transformed_plan
        result.errors = errors
        result.warnings = warnings
        result.transformations_applied = transformations
        result.is_valid = len(errors) == 0
        
        return result

    def _flatten_plan(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Flatten plan hierarchy into a list of all steps"""
        result = []
        for step in plan:
            result.append(step)
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                result.extend(self._flatten_plan(sub_plan))
        return result

    def _build_plan_index(self, plan: List[Dict[str, Any]]) -> PlanIndex:
        """
        Build an incremental index of the plan structure.
        """
        logger.debug("Building plan index")
        index = PlanIndex()
        
        def traverse(current_plan: List[Dict[str, Any]], parent_id: Optional[str] = None):
            for step in current_plan:
                if not isinstance(step, dict):
                    continue

                step_id = step.get('id')
                if not step_id or not self._is_valid_uuid(step_id):
                    continue

                index.steps[step_id] = step
                if parent_id:
                    index.parents[step_id] = parent_id

                # Extract output types
                step_outputs = {}
                for out_name, out_def in step.get('outputs', {}).items():
                    if isinstance(out_def, dict) and 'type' in out_def:
                        step_outputs[out_name] = out_def['type']
                    elif isinstance(out_def, str):
                        step_outputs[out_name] = 'string'
                index.outputs[step_id] = step_outputs

                # Recurse into sub-plans
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    traverse(sub_plan, step_id)

        traverse(plan)
        logger.debug(f"Plan index built: {len(index.steps)} steps")
        return index

    def _assign_consistent_uuids(self, plan: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
        """
        Assigns consistent UUIDs to all steps in the plan as a one-time operation.
        """
        logger.info("Starting one-time UUID assignment")
        uuid_map = {}
        modified_plan = copy.deepcopy(plan)

        def assign_uuids_recursive(current_plan: List[Dict[str, Any]]):
            for step in current_plan:
                if not isinstance(step, dict):
                    continue

                original_id = step.get('id')
                
                if original_id and self._is_valid_uuid(original_id):
                    # Keep valid UUIDs
                    if original_id not in uuid_map:
                        uuid_map[original_id] = original_id
                elif original_id:
                    # Replace invalid UUIDs
                    new_id = str(uuid.uuid4())
                    uuid_map[original_id] = new_id
                    step['id'] = new_id
                    logger.debug(f"Replaced invalid UUID {original_id} with {new_id}")
                else:
                    # Generate new UUID for missing IDs
                    new_id = str(uuid.uuid4())
                    step['id'] = new_id
                    uuid_map[new_id] = new_id
                    logger.debug(f"Generated new UUID {new_id}")

                # Recurse into sub-plans
                sub_plan = self._get_sub_plan(step)
                if sub_plan:
                    assign_uuids_recursive(sub_plan)

        assign_uuids_recursive(modified_plan)
        logger.info(f"UUID assignment complete: {len(uuid_map)} mappings")
        return modified_plan, uuid_map

    def _apply_uuid_map_recursive(self, plan: List[Dict[str, Any]], 
                                  uuid_map: Dict[str, str]) -> List[Dict[str, Any]]:
        """
        Recursively update sourceStep references based on uuid_map.
        """
        for step in plan:
            if not isinstance(step, dict):
                continue

            # Ensure inputs is a dictionary before trying to iterate
            step_inputs = step.get('inputs', {})
            if isinstance(step_inputs, dict):
                for input_name, input_def in step_inputs.items():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        original_source_id = input_def['sourceStep']
                        if original_source_id in uuid_map:
                            new_source_id = uuid_map[original_source_id]
                            if new_source_id != original_source_id:
                                logger.debug(f"Remapped sourceStep {original_source_id} -> {new_source_id}")
                                input_def['sourceStep'] = new_source_id

            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                self._apply_uuid_map_recursive(sub_plan, uuid_map)
        
        return plan

    def _transform_plan_recursive(self, plan: List[Dict[str, Any]], 
                                  scope_id: str,
                                  index: PlanIndex,
                                  tracker: TransformationTracker,
                                  accomplish_inputs: Dict[str, Any]
                                  ) -> Tuple[List[Dict[str, Any]], List[StructuredError], List[str], List[str]]:
        """
        Recursive validation and transformation with convergence guarantees.
        """
        logger.debug(f"Entering _transform_plan_recursive for scope: {scope_id}")
        
        errors: List[StructuredError] = []
        warnings: List[str] = []
        transformations: List[str] = []
        
        # Get or compute execution order for this scope
        if scope_id not in index.execution_orders:
            execution_order = self._get_execution_order(plan, index.steps)
            index.execution_orders[scope_id] = execution_order
        else:
            execution_order = index.execution_orders[scope_id]
        
        # Validate each step in execution order
        wrappable_errors = []
        for step_id in execution_order:
            step = index.steps.get(step_id)
            if not step:
                continue

            available_outputs = self._get_available_outputs_for_step(
                step_id, execution_order, index.outputs, index.parents, index.steps
            )
            
            step_errors, step_wrappable = self._validate_step(
                step, available_outputs, index.steps, index.parents, accomplish_inputs
            )
            errors.extend(step_errors)
            wrappable_errors.extend(step_wrappable)

        # Apply at most ONE transformation per pass to ensure convergence
        if wrappable_errors:
            for wrappable in wrappable_errors:
                transformation_key = tracker.get_key_for_foreach_wrap(
                    wrappable['step_id'],
                    wrappable['source_step_id'],
                    wrappable['source_output_name']
                )
                
                if tracker.can_apply(transformation_key):
                    logger.info(f"Applying FOREACH transformation: {transformation_key}")
                    
                    new_scope_id = str(uuid.uuid4())
                    plan = self._wrap_step_in_foreach(
                        plan,
                        wrappable['step_id'],
                        wrappable['source_step_id'],
                        wrappable['source_output_name'],
                        wrappable['target_input_name'],
                        index.steps,
                        new_scope_id
                    )
                    
                    tracker.mark_applied(transformation_key)
                    transformations.append(transformation_key)
                    
                    # Rebuild index for this scope after transformation
                    index.invalidate_scope(scope_id)
                    self._update_index_after_transformation(plan, index)
                    
                    # Only apply ONE transformation per pass
                    break
        
        # Recurse into sub-plans (only after parent level is stable)
        for step in plan:
            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                sub_scope_id = step.get('scope_id', str(uuid.uuid4()))
                
                sub_plan_transformed, sub_errors, sub_warnings, sub_transforms = \
                    self._transform_plan_recursive(
                        sub_plan,
                        scope_id=sub_scope_id,
                        index=index,
                        tracker=tracker,
                        accomplish_inputs=accomplish_inputs
                    )
                
                errors.extend(sub_errors)
                warnings.extend(sub_warnings)
                transformations.extend(sub_transforms)
                
                # Update sub-plan in parent step
                self._update_sub_plan(step, sub_plan_transformed)
        
        return plan, errors, warnings, transformations

    def _update_index_after_transformation(self, plan: List[Dict[str, Any]], 
                                          index: PlanIndex):
        """
        Incrementally update index after a transformation instead of full rebuild.
        """
        # For now, we do a targeted update of the affected scope
        # In a more sophisticated version, we'd track exactly which steps changed
        def update_steps(current_plan: List[Dict[str, Any]], parent_id: Optional[str] = None):
            for step in current_plan:
                if not isinstance(step, dict):
                    continue
                
                step_id = step.get('id')
                if step_id and self._is_valid_uuid(step_id):
                    index.steps[step_id] = step
                    if parent_id:
                        index.parents[step_id] = parent_id
                    
                    # Update outputs
                    step_outputs = {}
                    for out_name, out_def in step.get('outputs', {}).items():
                        if isinstance(out_def, dict) and 'type' in out_def:
                            step_outputs[out_name] = out_def['type']
                        elif isinstance(out_def, str):
                            step_outputs[out_name] = 'string'
                    index.outputs[step_id] = step_outputs
                    
                    sub_plan = self._get_sub_plan(step)
                    if sub_plan:
                        update_steps(sub_plan, step_id)
        
        update_steps(plan)

    def _validate_step(self, step: Dict[str, Any], 
                      available_outputs: Dict[str, Dict[str, str]],
                      all_steps: Dict[str, Any], 
                      parents: Dict[str, str],
                      accomplish_inputs: Dict[str, Any]) -> Tuple[List[StructuredError], List[Dict[str, Any]]]:
        """
        Validates a single step with structured error reporting.
        """
        errors: List[StructuredError] = []
        wrappable_errors: List[Dict[str, Any]] = []
        step_id = step['id']
        action_verb = step.get('actionVerb')

        if not action_verb:
            errors.append(StructuredError(
                ErrorType.MISSING_FIELD,
                "Missing 'actionVerb'",
                step_id=step_id
            ))
            return errors, wrappable_errors

        plugin_def = self.plugin_map.get(action_verb.upper())
        is_novel_verb = plugin_def is None

        # For novel verbs, require description
        if is_novel_verb:
            if not step.get('description') or not isinstance(step.get('description'), str) or step.get('description').strip() == '':
                # Auto-generate a description instead of throwing an error
                generated_description = f"Execute the action '{action_verb}' with the provided inputs to achieve the step's goal."
                step['description'] = generated_description
                logger.info(f"Auto-generated missing description for novel verb '{action_verb}' in step {step_id}")

        inputs = step.get('inputs', {})
        if not isinstance(inputs, dict):
            errors.append(StructuredError(
                ErrorType.MISSING_FIELD,
                "'inputs' must be a dictionary",
                step_id=step_id
            ))
            return errors, wrappable_errors

        # Validate required inputs (only for known plugins)
        if plugin_def:
            for req_input in plugin_def.get('inputDefinitions', []):
                if req_input.get('required'):
                    # Check if the required input is present by its canonical name or any of its aliases
                    input_found = False
                    if req_input['name'] in inputs:
                        input_found = True
                    elif req_input.get('aliases'):
                        for alias in req_input['aliases']:
                            if alias in inputs:
                                input_found = True
                                break
                    
                    if not input_found:
                        errors.append(StructuredError(
                            ErrorType.MISSING_INPUT,
                            f"Missing required input '{req_input['name']}' (or its aliases: {', '.join(req_input['aliases']) if req_input.get('aliases') else 'None'}) for '{action_verb}'",
                            step_id=step_id,
                            input_name=req_input['name']
                        ))

        # Validate each input
        for input_name, input_def in inputs.items():
            if not isinstance(input_def, dict):
                errors.append(StructuredError(
                    ErrorType.MISSING_FIELD,
                    f"Input '{input_name}' is not a valid dictionary",
                    step_id=step_id,
                    input_name=input_name
                ))
                continue

            if 'value' in input_def:
                # Static value - check for suspicious empty strings
                value = input_def.get('value')
                if value == "" and input_name not in ['context', 'notes', 'comments', 'description']:
                    logger.warning(f"Step {step_id} input '{input_name}' has empty string value")
                
                # For novel verbs, ensure valueType is set
                if is_novel_verb and 'valueType' not in input_def:
                    input_def['valueType'] = 'string'
                    
            elif 'sourceStep' in input_def and 'outputName' in input_def:
                source_step_id = input_def['sourceStep']
                output_name = input_def['outputName']

                if source_step_id == '0':
                    parent_id = parents.get(step_id)
                    if parent_id:
                        # This is a sub-plan (e.g., FOREACH), handle as before
                        parent_outputs = available_outputs.get(parent_id, {})
                        if output_name not in parent_outputs:
                            errors.append(StructuredError(
                                ErrorType.INVALID_REFERENCE,
                                f"Input '{input_name}' references unavailable implicit output '{output_name}' from parent '{parent_id}'",
                                step_id=step_id,
                                input_name=input_name,
                                output_name=output_name,
                                source_step_id=parent_id
                            ))
                        else:
                            # Type check for parent reference
                            type_error, wrappable = self._check_type_compatibility(
                                step, input_name, input_def, 
                                all_steps[parent_id], output_name, is_novel_verb
                            )
                            if type_error:
                                errors.append(type_error)
                            if wrappable:
                                wrappable_errors.append(wrappable)
                    else:
                        # This is a top-level step referencing the main inputs
                        if output_name not in accomplish_inputs:
                            errors.append(StructuredError(
                                ErrorType.INVALID_REFERENCE,
                                f"Input '{input_name}' references parent output '{output_name}', which is not a valid parent input.",
                                step_id=step_id,
                                input_name=input_name,
                                output_name=output_name
                            ))
                        # If the input exists, we assume it's valid. A type check could be added here if needed.

                                
                elif source_step_id not in available_outputs:
                    errors.append(StructuredError(
                        ErrorType.INVALID_REFERENCE,
                        f"Input '{input_name}' references unavailable step '{source_step_id}'",
                        step_id=step_id,
                        input_name=input_name,
                        source_step_id=source_step_id
                    ))
                elif output_name not in available_outputs.get(source_step_id, {}):
                    errors.append(StructuredError(
                        ErrorType.INVALID_REFERENCE,
                        f"Input '{input_name}' references unavailable output '{output_name}' from step '{source_step_id}'",
                        step_id=step_id,
                        input_name=input_name,
                        output_name=output_name,
                        source_step_id=source_step_id
                    ))
                else:
                    source_step_obj = all_steps.get(source_step_id)
                    if source_step_obj:
                        type_error, wrappable = self._check_type_compatibility(
                            step, input_name, input_def, source_step_obj, output_name, is_novel_verb
                        )
                        if type_error:
                            errors.append(type_error)
                        if wrappable:
                            wrappable_errors.append(wrappable)
            else:
                errors.append(StructuredError(
                    ErrorType.MISSING_FIELD,
                    f"Input '{input_name}' must have 'value' or both 'sourceStep' and 'outputName'",
                    step_id=step_id,
                    input_name=input_name
                ))

        # Validate outputs
        output_errors = self._validate_deliverable_outputs(step)
        errors.extend(output_errors)

        return errors, wrappable_errors

    def _check_type_compatibility(self, dest_step: Dict[str, Any], 
                                  dest_input_name: str, 
                                  dest_input_def: Dict[str, Any],
                                  source_step: Dict[str, Any], 
                                  source_output_name: str, 
                                  is_dest_novel_verb: bool = False) -> Tuple[Optional[StructuredError], Optional[Dict[str, Any]]]:
        """
        Checks type compatibility with improved handling of unknown types.
        """
        dest_action_verb = dest_step['actionVerb'].upper()
        dest_plugin_def = self.plugin_map.get(dest_action_verb)
        
        source_action_verb = source_step['actionVerb'].upper()
        source_plugin_def = self.plugin_map.get(source_action_verb)

        # Determine source output type
        source_output_type = None
        source_output_def = source_step.get('outputs', {}).get(source_output_name)
        if isinstance(source_output_def, dict) and 'type' in source_output_def:
            source_output_type = source_output_def['type']
        elif source_plugin_def:
            for out_def in source_plugin_def.get('outputDefinitions', []):
                if out_def.get('name') == source_output_name:
                    source_output_type = out_def.get('type')
                    break
        
        if not source_output_type:
            # Can't determine source type - skip wrapping but add warning
            logger.warning(f"Could not determine output type for {source_output_name} from {source_step['id']}")
            return (None, None)

        # Determine destination input type
        dest_input_type = None
        if dest_plugin_def:
            for in_def in dest_plugin_def.get('inputDefinitions', []):
                if in_def.get('name') == dest_input_name:
                    dest_input_type = in_def.get('type')
                    break
        
        # Only default to 'string' if we have high confidence this is a real mismatch
        # For novel verbs or unknown types, don't assume
        if not dest_input_type:
            if is_dest_novel_verb:
                # For novel verbs, don't assume - type is truly unknown
                logger.debug(f"Unknown input type for novel verb {dest_action_verb}, skipping type check")
                return (None, None)
            else:
                # For known plugins, if no type definition exists, default to string
                dest_input_type = 'string'

        # Check for FOREACH wrapping opportunity
        is_wrappable = (
            dest_input_type == 'string' and 
            source_output_type in ['array', 'list', 'list[string]', 'list[number]', 
                                   'list[boolean]', 'list[object]', 'list[any]']
        )

        if is_wrappable:
            # Skip wrapping for control flow steps
            if source_action_verb in self.CONTROL_FLOW_VERBS:
                logger.debug(f"Skipping FOREACH wrap: source is {source_action_verb}")
                return (None, None)
            
            if dest_action_verb in self.CONTROL_FLOW_VERBS:
                logger.debug(f"Skipping FOREACH wrap: dest is {dest_action_verb}")
                return (None, None)

            # Skip if already wrapped
            if source_step.get('_metadata', {}).get('_wrapped_by'):
                logger.debug(f"Skipping FOREACH wrap: already wrapped")
                return (None, None)

            wrappable_info = {
                "step_id": dest_step['id'],
# Continuation of PlanValidator class from Part 1
    
                "source_step_id": source_step['id'],
                "source_output_name": source_output_name,
                "target_input_name": dest_input_name
            }
            return (None, wrappable_info)

        # General type compatibility check
        if is_dest_novel_verb:
            types_compatible = (
                dest_input_type == source_output_type or
                dest_input_type == 'any' or source_output_type == 'any' or
                (dest_input_type == 'string' and source_output_type in ['number', 'boolean', 'object', 'array'])
            )
        else:
            types_compatible = (
                dest_input_type == source_output_type or
                dest_input_type == 'any' or source_output_type == 'any' or
                (dest_input_type == 'string' and source_output_type in ['number', 'boolean', 'object']) or
                (dest_input_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]'] 
                 and source_output_type in ['array', 'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]'])
            )

        if not types_compatible:
            return (StructuredError(
                ErrorType.TYPE_MISMATCH,
                f"Type mismatch for input '{dest_input_name}'. Expected '{dest_input_type}' but got '{source_output_type}' from step {source_step['id']}",
                step_id=dest_step['id'],
                input_name=dest_input_name,
                source_step_id=source_step['id']
            ), None)

        return (None, None)

    def _wrap_step_in_foreach(self, plan: List[Dict[str, Any]], 
                             step_to_wrap_id: str,
                             source_step_id: str, 
                             source_output_name: str, 
                             target_input_name: str,
                             all_steps: Dict[str, Any], 
                             scope_id: str) -> List[Dict[str, Any]]:
        """
        Wraps a step and its downstream dependencies in a FOREACH loop.
        """
        step_to_wrap_obj = all_steps.get(step_to_wrap_id)
        if not step_to_wrap_obj:
            logger.error(f"Step to wrap {step_to_wrap_id} not found")
            return plan

        logger.info(f"Wrapping step {step_to_wrap_id} in FOREACH for input '{target_input_name}'")

        # Find downstream dependencies
        string_consuming_deps = self._get_string_consuming_downstream_steps(step_to_wrap_id, all_steps)
        moved_step_ids = {step_to_wrap_id} | string_consuming_deps

        # Create sub-plan in execution order
        try:
            ordering = self._get_execution_order(plan, all_steps)
        except Exception:
            ordering = list(all_steps.keys())
        
        sub_plan = [copy.deepcopy(all_steps[sid]) for sid in ordering if sid in moved_step_ids]

        # Update the wrapped step's input to use FOREACH item
        for step in sub_plan:
            if step['id'] == step_to_wrap_id:
                step['inputs'][target_input_name] = {"outputName": "item", "sourceStep": "0"}
                break

        # Create FOREACH step
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
                "steps": {"description": "The end steps executed for each iteration.", "type": "array"},
            },
            "recommendedRole": "Coordinator"
        }

        # Mark wrapped steps
        for step_id in moved_step_ids:
            wrapped_step = all_steps.get(step_id)
            if wrapped_step:
                if '_metadata' not in wrapped_step:
                    wrapped_step['_metadata'] = {}
                wrapped_step['_metadata']['_wrapped_by'] = 'FOREACH'
                wrapped_step['_metadata']['_wrapper_step_id'] = foreach_step_id

        # Remove wrapped steps from main plan
        new_plan = [step for step in plan if step.get('id') not in moved_step_ids]
        
        # Create REGROUP steps for external dependencies
        external_dependencies = {}
        for step in new_plan:
            for input_def in step.get('inputs', {}).values():
                if isinstance(input_def, dict):
                    src = input_def.get('sourceStep')
                    out_name = input_def.get('outputName')
                    if src in moved_step_ids:
                        dep_key = (src, out_name)
                        if dep_key not in external_dependencies:
                            external_dependencies[dep_key] = []
                        external_dependencies[dep_key].append(step['id'])

        regroup_steps = []
        regroup_map = {}
        
        for (source_id, output_name), consumers in external_dependencies.items():
            regroup_step_id = str(uuid.uuid4())
            regroup_map[(source_id, output_name)] = regroup_step_id
            
            regroup_step = {
                "id": regroup_step_id,
                "actionVerb": "REGROUP",
                "description": f"Collects '{output_name}' from all iterations of FOREACH {foreach_step_id}",
                "scope_id": scope_id,
                "inputs": {
                    "foreach_results": {"outputName": "steps", "sourceStep": foreach_step_id},
                    "source_step_id_in_subplan": {"value": source_id, "valueType": "string"},
                    "output_to_collect": {"value": output_name, "valueType": "string"},
                    "stepIdsToRegroup": [source_id]
                },
                "outputs": {
                    "result": {"description": f"Array of all '{output_name}' outputs.", "type": "array"}
                },
                "recommendedRole": "Coordinator"
            }
            regroup_steps.append(regroup_step)

        # Add default REGROUP for final output
        if sub_plan:
            final_step_id = sub_plan[-1]['id']
            for final_output_name in sub_plan[-1].get('outputs', {}).keys():
                if (final_step_id, final_output_name) not in regroup_map:
                    regroup_step_id = str(uuid.uuid4())
                    regroup_step = {
                        "id": regroup_step_id,
                        "actionVerb": "REGROUP",
                        "description": f"Collects final '{final_output_name}' from FOREACH {foreach_step_id}",
                        "scope_id": scope_id,
                        "inputs": {
                            "foreach_results": {"outputName": "steps", "sourceStep": foreach_step_id},
                            "source_step_id_in_subplan": {"value": final_step_id, "valueType": "string"},
                            "output_to_collect": {"value": final_output_name, "valueType": "string"},
                            "stepIdsToRegroup": [final_step_id]
                        },
                        "outputs": {
                            "result": {"description": f"Array of all '{final_output_name}' outputs.", "type": "array"}
                        },
                        "recommendedRole": "Coordinator"
                    }
                    regroup_steps.append(regroup_step)

        # Insert FOREACH and REGROUP steps
        inserted = False
        for i, step in enumerate(new_plan):
            if step.get('id') == source_step_id:
                new_plan.insert(i + 1, foreach_step)
                new_plan[i+2:i+2] = regroup_steps
                inserted = True
                break
        
        if not inserted:
            new_plan.insert(0, foreach_step)
            new_plan[1:1] = regroup_steps

        # Update dependencies
        self._recursively_update_dependencies(new_plan, regroup_map)

        logger.info(f"Created FOREACH {foreach_step_id} with {len(sub_plan)} steps and {len(regroup_steps)} REGROUP steps")
        return new_plan

    def _get_string_consuming_downstream_steps(self, start_step_id: str, 
                                               all_steps: Dict[str, Any]) -> Set[str]:
        """
        Finds downstream steps that should be included in FOREACH with dependency checking.
        """
        # Build forward adjacency list
        adj_list: Dict[str, List[Tuple[str, str]]] = {}
        for step in all_steps.values():
            step_id = step.get('id')
            if not step_id:
                continue
            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict):
                    source_id = input_def.get('sourceStep')
                    if source_id and source_id != '0' and source_id in all_steps:
                        if source_id not in adj_list:
                            adj_list[source_id] = []
                        adj_list[source_id].append((step_id, input_name))

        steps_to_include = set()
        queue = [start_step_id]
        visited = {start_step_id}

        while queue:
            current_id = queue.pop(0)

            if current_id not in adj_list:
                continue

            for consumer_step_id, consumer_input_name in adj_list[current_id]:
                if consumer_step_id in visited:
                    continue

                consumer_step = all_steps.get(consumer_step_id)
                if not consumer_step:
                    continue
                
                # Check if all dependencies can be satisfied within the loop
                can_be_included = True
                for cons_input_name, cons_input_def in consumer_step.get('inputs', {}).items():
                    if isinstance(cons_input_def, dict):
                        source_id = cons_input_def.get('sourceStep')
                        if source_id and source_id != '0' and source_id not in visited:
                            can_be_included = False
                            logger.debug(f"Cannot move {consumer_step_id}: external dependency on {source_id}")
                            break
                
                if not can_be_included:
                    continue

                # Check expected input type
                consumer_action_verb = consumer_step.get('actionVerb', '').upper()
                consumer_plugin_def = self.plugin_map.get(consumer_action_verb)

                expected_input_type = 'string'
                if consumer_plugin_def:
                    for in_def in consumer_plugin_def.get('inputDefinitions', []):
                        if in_def.get('name') == consumer_input_name:
                            expected_input_type = in_def.get('type', 'string')
                            break

                # Stop if consumer expects array
                if expected_input_type in ['array', 'list', 'list[string]', 'list[number]', 
                                          'list[boolean]', 'list[object]', 'list[any]']:
                    logger.debug(f"Stopping at {consumer_step_id}: expects array")
                    continue

                steps_to_include.add(consumer_step_id)
                visited.add(consumer_step_id)
                queue.append(consumer_step_id)

        return steps_to_include

    def _recursively_update_dependencies(self, plan: List[Dict[str, Any]], 
                                        regroup_map: Dict[Tuple[str, str], str]):
        """Recursively update dependencies based on regroup_map."""
        for step in plan:
            if not isinstance(step, dict):
                continue

            for input_name, input_def in step.get('inputs', {}).items():
                if isinstance(input_def, dict):
                    original_source_id = input_def.get('sourceStep')
                    original_output_name = input_def.get('outputName')
                    
                    if (original_source_id, original_output_name) in regroup_map:
                        new_regroup_id = regroup_map[(original_source_id, original_output_name)]
                        logger.debug(f"Updated {step['id']} to reference REGROUP {new_regroup_id}")
                        input_def['sourceStep'] = new_regroup_id
                        input_def['outputName'] = 'result'

            sub_plan = self._get_sub_plan(step)
            if sub_plan:
                self._recursively_update_dependencies(sub_plan, regroup_map)

    def _get_execution_order(self, plan: List[Dict[str, Any]], 
                            all_steps: Dict[str, Any]) -> List[str]:
        """
        Topological sort with cycle detection and breaking.
        """
        adj: Dict[str, List[str]] = {}
        in_degree: Dict[str, int] = {}
        
        for step in plan:
            if not isinstance(step, dict):
                continue
            step_id = step.get('id')
            if step_id:
                adj[step_id] = []
                in_degree[step_id] = 0

        for step in plan:
            if not isinstance(step, dict):
                continue
            step_id = step.get('id')
            if not step_id:
                continue

            for input_def in step.get('inputs', {}).values():
                if isinstance(input_def, dict):
                    source_id = input_def.get('sourceStep')
                    if source_id and source_id in adj:
                        adj[source_id].append(step_id)
                        in_degree[step_id] = in_degree.get(step_id, 0) + 1
        
        # Kahn's algorithm
        queue = [sid for sid, degree in in_degree.items() if degree == 0]
        execution_order = []
        
        while queue:
            current_id = queue.pop(0)
            execution_order.append(current_id)
            
            if current_id in adj:
                for neighbor_id in adj[current_id]:
                    in_degree[neighbor_id] -= 1
                    if in_degree[neighbor_id] == 0:
                        queue.append(neighbor_id)

        # Handle cycles by breaking weakest links
        if len(execution_order) != len(adj):
            logger.warning("Cycle detected in plan dependencies")
            cyclic_steps = [sid for sid, degree in in_degree.items() if degree > 0]
            logger.warning(f"Cyclic steps: {cyclic_steps}")
            
            # Add cyclic steps in arbitrary order (they'll fail validation)
            execution_order.extend(cyclic_steps)

        return execution_order

    def _get_available_outputs_for_step(self, step_id: str, 
                                       execution_order: List[str], 
                                       all_outputs: Dict[str, Dict[str, str]], 
                                       parents: Dict[str, str], 
                                       all_steps: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
        """
        Determines all outputs available to a given step.
        """
        available: Dict[str, Dict[str, str]] = {}
        
        try:
            current_index = execution_order.index(step_id)
        except ValueError:
            logger.warning(f"Step {step_id} not in execution order")
            return available
        
        # Add preceding steps
        for i in range(current_index):
            prev_step_id = execution_order[i]
            if prev_step_id in all_outputs:
                available[prev_step_id] = all_outputs[prev_step_id]

        # Add parent hierarchy
        current_ancestor_id = parents.get(step_id)
        while current_ancestor_id:
            ancestor_step = all_steps.get(current_ancestor_id)
            if ancestor_step:
                if current_ancestor_id not in available:
                    available[current_ancestor_id] = all_outputs.get(current_ancestor_id, {})
                
                # Add implicit outputs for FOREACH
                if ancestor_step.get('actionVerb') == 'FOREACH':
                    item_type = 'any'
                    foreach_array_input = ancestor_step.get('inputs', {}).get('array')
                    if foreach_array_input:
                        if 'valueType' in foreach_array_input:
                            item_type = foreach_array_input['valueType']
                    
                    available[current_ancestor_id]['item'] = item_type
                    available[current_ancestor_id]['index'] = 'number'
            
            current_ancestor_id = parents.get(current_ancestor_id)
            
        return available

    def _validate_deliverable_outputs(self, step: Dict[str, Any]) -> List[StructuredError]:
        """Validate deliverable output properties."""
        errors: List[StructuredError] = []
        outputs = step.get('outputs', {})
        step_id = step.get('id', 'unknown')

        for output_name, output_def in outputs.items():
            if isinstance(output_def, dict):
                is_deliverable = output_def.get('isDeliverable', False)
                filename = output_def.get('filename')
                description = output_def.get('description')

                if is_deliverable and (not filename or not isinstance(filename, str)):
                    output_type = output_def.get('type', 'txt')
                    extension = 'json' if output_type in ['object', 'array'] else 'txt'
                    generated_filename = f"{step_id}_{output_name}.{extension}"
                    output_def['filename'] = generated_filename
                    logger.info(f"Auto-generated missing filename '{generated_filename}' for deliverable output '{output_name}' in step {step_id}")

                if not description:
                    errors.append(StructuredError(
                        ErrorType.MISSING_FIELD,
                        f"Output '{output_name}' requires 'description'",
                        step_id=step_id,
                        output_name=output_name
                    ))

                if filename and not isinstance(filename, str):
                    errors.append(StructuredError(
                        ErrorType.MISSING_FIELD,
                        f"Output '{output_name}' filename must be non-empty string",
                        step_id=step_id,
                        output_name=output_name
                    ))

        return errors

    def _get_sub_plan(self, step: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Extracts sub-plan from a step."""
        if not isinstance(step, dict):
            return None

        if 'steps' in step and isinstance(step['steps'], list):
            return step['steps']
        
        inputs = step.get('inputs', {})
        if not isinstance(inputs, dict):
            return None

        steps_input = inputs.get('steps')
        if not steps_input:
            return None

        if isinstance(steps_input, list):
            return steps_input

        if isinstance(steps_input, dict):
            if 'value' in steps_input and isinstance(steps_input['value'], list):
                return steps_input['value']
            if 'args' in steps_input and isinstance(steps_input['args'], dict):
                if 'step_sequence' in steps_input['args']:
                    return steps_input['args']['step_sequence']
        
        return None

    def _update_sub_plan(self, step: Dict[str, Any], sub_plan: List[Dict[str, Any]]):
        """Update sub-plan in parent step."""
        if 'steps' in step and isinstance(step['steps'], list):
            step['steps'] = sub_plan
        elif 'inputs' in step and 'steps' in step['inputs']:
            if 'value' in step['inputs']['steps']:
                step['inputs']['steps']['value'] = sub_plan

    def _is_valid_uuid(self, uuid_string: str) -> bool:
        """Check if string is a valid UUID and not a placeholder."""
        if not isinstance(uuid_string, str) or not uuid_string:
            return False
        if "0-0000" in uuid_string:
            return False
        try:
            uuid.UUID(uuid_string)
            return True
        except ValueError:
            return False

    def _get_error_signature(self, error: StructuredError, all_steps: Dict[str, Any]) -> str:
        """Generates a specific signature for an error to group similar errors."""
        base_signature = error.error_type.name

        if error.error_type == ErrorType.TYPE_MISMATCH and error.step_id and error.source_step_id:
            try:
                dest_step = all_steps.get(error.step_id)
                source_step = all_steps.get(error.source_step_id)
                dest_input_name = error.input_name
                source_output_name = error.output_name

                if not dest_step or not source_step or not dest_input_name or not source_output_name:
                    return base_signature

                # Get source type
                source_output_def = source_step.get('outputs', {}).get(source_output_name, {})
                source_type = source_output_def.get('type', 'any')

                # Get destination type
                dest_plugin_def = self.plugin_map.get(dest_step.get('actionVerb', '').upper())
                dest_type = 'any'
                if dest_plugin_def:
                    for in_def in dest_plugin_def.get('inputDefinitions', []):
                        if in_def.get('name') == dest_input_name:
                            dest_type = in_def.get('type', 'any')
                            break
                
                return f"{base_signature}:{source_type}->{dest_type}"
            except Exception:
                return base_signature # Fallback

        elif error.error_type == ErrorType.MISSING_INPUT and error.step_id and error.input_name:
            step = all_steps.get(error.step_id)
            if step:
                action_verb = step.get('actionVerb', 'UNKNOWN_VERB')
                return f"{base_signature}:{action_verb.upper()}.{error.input_name}"

        return base_signature

    def _repair_plan_with_llm(self, plan: List[Dict[str, Any]], 
                             errors: List[StructuredError], 
                             goal: str,
                             inputs: Dict[str, Any],
                             tracker: TransformationTracker) -> List[Dict[str, Any]]:
        """
        Ask LLM to repair the plan by sending a batch of focused requests for each error type.
        This version includes a sanity check and uses specific error signatures for more targeted repairs.
        """
        logger.info(f"Attempting LLM repair with {len(errors)} structured errors using a signature-based, batched approach.")
        
        # Build index once for signature generation
        index = self._build_plan_index(plan)
        all_steps = index.steps

        # Group errors by specific signature
        grouped_errors: Dict[str, List[str]] = {}
        for error in errors:
            signature = self._get_error_signature(error, all_steps)
            if signature not in grouped_errors:
                grouped_errors[signature] = []
            grouped_errors[signature].append(error.to_string())

        error_priority = [
            "CIRCULAR_DEPENDENCY", "INVALID_REFERENCE",
            "MISSING_INPUT:REFLECT.question",
            "TYPE_MISMATCH:array->string", "TYPE_MISMATCH:list->string",
            "TYPE_MISMATCH" # Generic fallback
        ]

        current_plan = copy.deepcopy(plan)
        initial_error_count = len(errors)

        processed_signatures = set()

        # Function to process a signature
        def process_signature(signature):
            nonlocal current_plan
            if signature in grouped_errors and signature not in processed_signatures:
                error_messages = grouped_errors[signature]
                logger.info(f"--- LLM Repair Cycle: Targeting signature '{signature}' ({len(error_messages)} issues) ---")

                # --- Custom Prompt Logic ---
                if signature in ["TYPE_MISMATCH:array->string", "TYPE_MISMATCH:list->string"]:
                    specific_instructions = """This error commonly occurs when an output that is a list or array is passed to an input that expects a single item (like a string).
The standard solution is to wrap the receiving step in a `FOREACH` loop.
**Action:** For each error listed, please modify the plan to wrap the consumer step in a `FOREACH` block to correctly process the array input. Do not modify the producing step."""
                elif signature.startswith("MISSING_INPUT:"):
                    specific_instructions = "This error indicates a required input is missing. Please add the missing input field to the specified step, providing a valid value or reference."
                else:
                    specific_instructions = "Please fix the errors as described. Pay close attention to step IDs and input/output names."

                prompt = f"""A JSON plan designed to accomplish a goal has validation issues. Your task is to act as a precise repair tool. You must correct ONLY the specific errors listed under the signature '{signature}'.

**Goal:** {goal}

**CRITICAL INSTRUCTIONS:**
1.  **DO NOT** add or remove any steps from the plan unless the fix specifically requires it (e.g., adding a FOREACH wrapper).
2.  **DO NOT** invent new `actionVerb`s. Only use existing ones from the plan.
3.  **ONLY** modify the fields necessary to fix the specified errors. Keep all other parts of the plan identical.
4.  If fixing an error requires changing a `sourceStep` or `outputName`, ensure the new reference is valid within the plan's context.

**Specific Guidance for this Error Type:**
{specific_instructions}

**Errors to Fix for signature `{signature}`:**
- {chr(10).join("- " + msg for msg in error_messages)}

**Current Plan (contains the errors listed above):**
```json
{json.dumps(current_plan, indent=2)}
```

Return ONLY the corrected JSON plan as a valid JSON array. Do not include any explanations, comments, or surrounding markdown.
"""
                
                current_plan = self._call_llm_for_repair(prompt, inputs, current_plan, signature)
                processed_signatures.add(signature)

        # Process prioritized errors first
        for signature in error_priority:
            # Handle partial matches (like TYPE_MISMATCH)
            for s_key in list(grouped_errors.keys()):
                if s_key.startswith(signature):
                    process_signature(s_key)

        # Process any remaining errors
        for signature in list(grouped_errors.keys()):
            if signature not in processed_signatures:
                process_signature(signature)
        
        final_error_count = len(self._validate_and_transform(current_plan, self._build_plan_index(current_plan), tracker, inputs).errors)
        logger.info(f"LLM repair process finished. Initial errors: {initial_error_count}, Final errors: {final_error_count}.")
        return current_plan

    def _call_llm_for_repair(self, prompt: str, inputs: Dict[str, Any], current_plan: List[Dict[str, Any]], signature: str) -> List[Dict[str, Any]]:
        """Helper function to call the LLM and return the repaired plan data."""
        if not self.brain_call:
            raise AccomplishError("Brain call not available", "brain_error")

        request_id = None
        try:
            response_tuple = self.brain_call(prompt, inputs, "json")
            if not isinstance(response_tuple, tuple) or len(response_tuple) != 2:
                logger.error(f"LLM call for signature '{signature}' returned an unexpected format. Skipping repair.")
                return current_plan
                
            response_str, request_id = response_tuple
            repaired_data = json.loads(response_str)

            if isinstance(repaired_data, list):
                return repaired_data
            elif isinstance(repaired_data, dict):
                if 'plan' in repaired_data and isinstance(repaired_data['plan'], list):
                    return repaired_data['plan']
                if 'steps' in repaired_data and isinstance(repaired_data['steps'], list):
                    return repaired_data['steps']
            
            # If we reach here, the format is wrong
            error_message = f"LLM repair for {signature} returned a dictionary without a 'plan' or 'steps' list."
            if self.report_logic_failure_call:
                self.report_logic_failure_call(request_id, inputs, error_message)
            raise AccomplishError(error_message, "repair_error")

        except (json.JSONDecodeError, AccomplishError) as e:
            logger.error(f"Error processing LLM repair response for signature '{signature}': {e}. Reverting to previous plan.")
            if self.report_logic_failure_call and request_id:
                self.report_logic_failure_call(request_id, inputs, f"LLM repair failed with error: {e}")
            return current_plan
        except Exception as e:
            logger.error(f"An unexpected error occurred during LLM repair for signature '{signature}': {e}. Reverting.")
            return current_plan
