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
import requests

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
    INPUT_NAME_MISMATCH = "input_name_mismatch"
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
    
    def __init__(self, brain_call: callable = None, report_logic_failure_call: callable = None, librarian_info: Optional[Dict[str, Any]] = None):
        self.brain_call = brain_call
        self.report_logic_failure_call = report_logic_failure_call
        self.max_retries = 3
        self.librarian_info = librarian_info or {}
        self.plugin_cache: Dict[str, Dict[str, Any]] = {}

    def _get_plugin_definition(self, action_verb: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a plugin definition for a given action verb, using an in-memory cache
        and falling back to dynamic discovery from the Librarian.
        """
        verb_upper = action_verb.upper()
        
        # 1. Check cache first
        if verb_upper in self.plugin_cache:
            return self.plugin_cache[verb_upper]
        
        # 2. On cache miss, discover from Librarian
        plugin_def = self._discover_single_plugin(action_verb)
        if plugin_def:
            self.plugin_cache[verb_upper] = plugin_def
        return plugin_def

    def _discover_single_plugin(self, action_verb: str) -> Optional[Dict[str, Any]]:
        """
        Dynamically discovers a single plugin definition from the Librarian using a hybrid approach.
        1. Tries a direct, exact-match query for a known verb.
        2. Falls back to a semantic search if the direct query fails.
        """
        if not self.librarian_info or not self.librarian_info.get('url') or not self.librarian_info.get('auth_token'):
            logger.warning(f"Librarian info is incomplete, cannot dynamically discover plugin for '{action_verb}'.")
            return None

        verb_upper = action_verb.upper()
        librarian_url = self.librarian_info['url']
        auth_token = self.librarian_info['auth_token']
        headers = {'Authorization': f'Bearer {auth_token}', 'Content-Type': 'application/json'}

        # 1. Direct, exact-match query
        try:
            logger.debug(f"Attempting direct discovery for verb: '{verb_upper}'")
            direct_payload = {
                'collection': 'tools',
                'query': {'metadata.verb': verb_upper},
                'limit': 1
            }
            response = requests.post(f"http://{librarian_url}/queryData", headers=headers, json=direct_payload, timeout=5)
            response.raise_for_status()
            response_data = response.json()
            
            if response_data and isinstance(response_data, dict) and 'data' in response_data and isinstance(response_data['data'], list) and response_data['data']:
                exact_match = response_data['data'][0]
                logger.info(f"Direct discovery successful for '{verb_upper}'.")
                # The 'metadata' field from the document is the manifest.
                return exact_match.get('metadata')
        except requests.exceptions.RequestException as e:
            logger.warning(f"Direct discovery for '{verb_upper}' failed: {e}. Falling back to semantic search.")

        # 2. Fallback to semantic search
        try:
            logger.debug(f"Falling back to semantic search for verb: '{action_verb}'")
            semantic_payload = {'queryText': action_verb, 'maxResults': 1}
            response = requests.post(f"http://{librarian_url}/tools/search", headers=headers, json=semantic_payload, timeout=5)
            response.raise_for_status()
            response_data = response.json()

            if response_data and isinstance(response_data, dict) and 'data' in response_data and isinstance(response_data['data'], list) and response_data['data']:
                semantic_match = response_data['data'][0]
                logger.info(f"Semantic search successful for '{action_verb}'.")
                # The 'metadata' field from the document is the manifest.
                return semantic_match.get('metadata')
        except requests.exceptions.RequestException as e:
            logger.error(f"Semantic search for '{action_verb}' also failed: {e}")

        logger.warning(f"Failed to discover plugin for '{action_verb}' using all methods.")
        return None

    def _sanitize_plan(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove all internal metadata fields from the plan.
        Ensures the plan is pure JSON-serializable with no schema-violating fields.
        Recursively sanitizes nested steps in FOREACH arrays.
        
        CRITICAL: Does NOT remove or filter steps. Validation should NEVER remove steps.
        Only removes non-schema fields from each step.
        """
        def sanitize_step(step: Dict[str, Any]) -> Dict[str, Any]:
            """Recursively sanitize a step, removing only non-schema fields"""
            if not isinstance(step, dict):
                return step
            
            # Create a clean copy with only schema-allowed fields
            clean_step = {}
            schema_fields = {'id', 'actionVerb', 'description', 'inputs', 'outputs', 'recommendedRole'}
            
            for key, value in step.items():
                if key not in schema_fields:
                    # Skip internal fields like _metadata, scope_id, etc.
                    logger.debug(f"Removing non-schema field '{key}' from step {step.get('id', 'unknown')}")
                    continue
                
                # Recursively sanitize nested structures
                if key == 'inputs' and isinstance(value, dict):
                    clean_step[key] = {}
                    for input_name, input_def in value.items():
                        if isinstance(input_def, dict):
                            clean_input = {}
                            for k, v in input_def.items():
                                # Allow standard input fields
                                if k in {'value', 'valueType', 'outputName', 'sourceStep', 'args'}:
                                    # Special case: if value is a list (nested steps in FOREACH), sanitize recursively
                                    if k == 'value' and isinstance(v, list) and all(isinstance(item, dict) for item in v):
                                        # Recursively sanitize nested steps, but don't filter any out
                                        clean_input[k] = [sanitize_step(item) for item in v]
                                    else:
                                        clean_input[k] = v
                            clean_step[key][input_name] = clean_input
                        else:
                            clean_step[key][input_name] = input_def
                elif key == 'outputs' and isinstance(value, dict):
                    clean_step[key] = {}
                    for output_name, output_def in value.items():
                        if isinstance(output_def, dict):
                            clean_output = {}
                            for k, v in output_def.items():
                                # Allow standard output fields
                                if k in {'description', 'type', 'isDeliverable', 'filename'}:
                                    clean_output[k] = v
                            clean_step[key][output_name] = clean_output
                        else:
                            clean_step[key][output_name] = output_def
                else:
                    clean_step[key] = value
            
            return clean_step
        
        # Sanitize all top-level steps - NEVER filter any out
        sanitized = [sanitize_step(step) for step in plan]
        
        return sanitized

    def validate_and_repair(self, plan: List[Dict[str, Any]], goal: str, 
                           inputs: Dict[str, Any]) -> ValidationResult:
        """
        Validates and attempts to repair a plan, returning a final validation result.
        """
        logger.info(f"--- Plan Validation and Transformation (Enhanced) ---")
        logger.info(f"INPUT PLAN: {len(plan)} steps")

        # A single step wrapped in an array is not a valid plan.
        if not isinstance(plan, list) or len(plan) < 1:
             return ValidationResult(
                plan=plan,
                errors=[StructuredError(ErrorType.GENERIC, "Plan must be a list with at least one step.", step_id=None)],
                is_valid=False
            )
        
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
                # Sanitize plan before returning: remove internal metadata fields
                current_result.plan = self._sanitize_plan(current_result.plan)
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
        # Always sanitize before returning
        if current_result:
            current_result.plan = self._sanitize_plan(current_result.plan)
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
                outputs = step.get('outputs', {})
                
                # Handle case where outputs is a list instead of dict
                if isinstance(outputs, list):
                    # Convert list to dict format for compatibility
                    for i, out_def in enumerate(outputs):
                        if isinstance(out_def, dict):
                            out_name = out_def.get('name', f'output_{i}')
                            if 'type' in out_def:
                                step_outputs[out_name] = out_def['type']
                            else:
                                step_outputs[out_name] = 'string'
                        elif isinstance(out_def, str):
                            step_outputs[f'output_{i}'] = 'string'
                elif isinstance(outputs, dict):
                    for out_name, out_def in outputs.items():
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
                    outputs = step.get('outputs', {})
                    
                    # Handle case where outputs is a list instead of dict
                    if isinstance(outputs, list):
                        # Convert list to dict format for compatibility
                        for i, out_def in enumerate(outputs):
                            if isinstance(out_def, dict):
                                out_name = out_def.get('name', f'output_{i}')
                                if 'type' in out_def:
                                    step_outputs[out_name] = out_def['type']
                                else:
                                    step_outputs[out_name] = 'string'
                            elif isinstance(out_def, str):
                                step_outputs[f'output_{i}'] = 'string'
                    elif isinstance(outputs, dict):
                        for out_name, out_def in outputs.items():
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
        
        # Diagnostic logging for input structure
        logger.debug(f"Validating step {step_id}: {action_verb}")
        logger.debug(f"Step inputs: {json.dumps(step.get('inputs', {}), indent=2)}")

        if not action_verb:
            errors.append(StructuredError(
                ErrorType.MISSING_FIELD,
                "Missing 'actionVerb'",
                step_id=step_id
            ))
            return errors, wrappable_errors

        plugin_def = self._get_plugin_definition(action_verb)
        

        is_novel_verb = not plugin_def
        # For novel verbs, we are less strict. We just check for a description.
        # For known verbs, we check for required inputs.
        if is_novel_verb:
            if not step.get('description'):
                errors.append(StructuredError(
                    ErrorType.MISSING_FIELD,
                    f"Novel verb '{action_verb}' requires a 'description'",
                    step_id=step_id
                ))
        elif plugin_def:
            # Handle potential single-input-to-single-required-input mismatch
            step_inputs = step.get('inputs', {})
            if isinstance(step_inputs, dict):
                required_inputs = [inp for inp in plugin_def.get('inputDefinitions', []) if inp.get('required')]
                
                if len(step_inputs) == 1 and len(required_inputs) == 1:
                    provided_input_name = next(iter(step_inputs.keys()))
                    required_input_name = required_inputs[0]['name']
                    
                    if provided_input_name != required_input_name:
                        errors.append(StructuredError(
                            ErrorType.INPUT_NAME_MISMATCH,
                            f"Step provides one input '{provided_input_name}' but the verb '{action_verb}' requires '{required_input_name}'. This may need to be renamed.",
                            step_id=step_id,
                            input_name=provided_input_name 
                        ))
                        # Return early to avoid creating a redundant "Missing required input" error
                        return errors, wrappable_errors

            # Validate required inputs for known plugins
            for req_input in plugin_def.get('inputDefinitions', []):
                if req_input.get('required'):
                    input_found = False
                    if req_input['name'] in step.get('inputs', {}):
                        input_found = True
                    if not input_found:
                        errors.append(StructuredError(
                            ErrorType.MISSING_INPUT,
                            f"Missing required input '{req_input['name']}' for '{action_verb}'",
                            step_id=step_id,
                            input_name=req_input['name']
                        ))
        
        # Special validation for GENERATE - it MUST have a 'prompt' input
        if action_verb and action_verb.upper() == 'GENERATE':
            inputs_dict = step.get('inputs', {})
            if not inputs_dict or 'prompt' not in inputs_dict:
                errors.append(StructuredError(
                    ErrorType.MISSING_INPUT,
                    f"GENERATE step requires mandatory 'prompt' input",
                    step_id=step_id,
                    input_name='prompt'
                ))
            else:
                # Check if the prompt input is valid (not empty)
                prompt_input = inputs_dict.get('prompt', {})
                if isinstance(prompt_input, dict):
                    value = prompt_input.get('value')
                    if value == "" or value is None:
                        errors.append(StructuredError(
                            ErrorType.MISSING_INPUT,
                            f"GENERATE 'prompt' input is empty or undefined",
                            step_id=step_id,
                            input_name='prompt'
                        ))

        inputs = step.get('inputs', {})
        if not isinstance(inputs, dict):
            errors.append(StructuredError(
                ErrorType.MISSING_FIELD,
                "'inputs' must be a dictionary",
                step_id=step_id
            ))
            return errors, wrappable_errors


        
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
                source_step_val = input_def['sourceStep']
                if isinstance(source_step_val, dict) and 'id' in source_step_val:
                    source_step_id = source_step_val['id']
                    step['inputs'][input_name]['sourceStep'] = source_step_id # Fix in place
                    logger.warning(f"Step {step_id}: Input '{input_name}' had sourceStep as dict. Corrected to string: '{source_step_id}'")
                else:
                    source_step_id = source_step_val
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

                                
                elif source_step_id not in all_steps:
                    errors.append(StructuredError(
                        ErrorType.INVALID_REFERENCE,
                        f"Input '{input_name}' references non-existent step '{source_step_id}'",
                        step_id=step_id,
                        input_name=input_name,
                        source_step_id=source_step_id
                    ))
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

        # Validate outputs against verb manifest
        manifest_output_errors = self._validate_outputs_against_manifest(step)
        errors.extend(manifest_output_errors)

        # Validate deliverable output properties
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
        dest_plugin_def = self._get_plugin_definition(dest_action_verb)
        
        source_action_verb = source_step['actionVerb'].upper()
        source_plugin_def = self._get_plugin_definition(source_action_verb)

        # Determine source output type
        source_output_type = None
        outputs = source_step.get('outputs', {})
        
        # Handle case where outputs is a list instead of dict
        if isinstance(outputs, list):
            # Find the output with the matching name
            for out_def in outputs:
                if isinstance(out_def, dict) and out_def.get('name') == source_output_name:
                    if 'type' in out_def:
                        source_output_type = out_def['type']
                    break
        elif isinstance(outputs, dict):
            source_output_def = outputs.get(source_output_name)
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
                return (None, None)
            
            if dest_action_verb in self.CONTROL_FLOW_VERBS:
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
        
        Key principle: FOREACH is created AFTER the source step (A) that produces the array.
        The subplan includes the step being wrapped (B) and its dependents (C).
        Within the subplan, the wrapped step's array input is retargeted to "0" (the FOREACH item).
        """
        step_to_wrap_obj = all_steps.get(step_to_wrap_id)
        if not step_to_wrap_obj:
            logger.error(f"Step to wrap {step_to_wrap_id} not found")
            return plan

        logger.info(f"Wrapping step {step_to_wrap_id} in FOREACH for input '{target_input_name}'")

        # Find downstream dependencies that consume output from step_to_wrap_id
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
            }
        }

        # PRINCIPLE 2: Do NOT remove steps from main plan - only remove downstream consumers if any
        # Keep all steps and flag for repair - validation never removes, only repairs or flags
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
                "dependencies": [
                    {
                        "inputName": "foreach_results",
                        "sourceStepId": foreach_step_id,
                        "outputName": "steps"
                    }
                ],
                "inputs": {
                    "foreach_results": {"outputName": "steps", "sourceStep": foreach_step_id},
                    "source_step_id_in_subplan": {"value": source_id, "valueType": "string"},
                    "output_to_collect": {"value": output_name, "valueType": "string"},
                    "stepIdsToRegroup": {"value": [source_id], "valueType": "array"}
                },
                "outputs": {
                    "result": {"description": f"Array of all '{output_name}' outputs.", "type": "array"}
                }
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
                        "dependencies": [
                            {
                                "inputName": "foreach_results",
                                "sourceStepId": foreach_step_id,
                                "outputName": "steps"
                            }
                        ],
                        "inputs": {
                            "foreach_results": {"outputName": "steps", "sourceStep": foreach_step_id},
                            "source_step_id_in_subplan": {"value": final_step_id, "valueType": "string"},
                            "output_to_collect": {"value": final_output_name, "valueType": "string"},
                            "stepIdsToRegroup": {"value": [final_step_id], "valueType": "array"}
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
                logger.debug(f"Inserted FOREACH step after source_step_id {source_step_id}")
                break
        
        if not inserted:
            logger.warning(f"source_step_id {source_step_id} not found in new_plan. Inserting FOREACH at position 0")
            new_plan.insert(0, foreach_step)
            new_plan[1:1] = regroup_steps
        
        if not new_plan:
            # This should not happen due to the check at the beginning of _wrap_step_in_foreach
            logger.error("CRITICAL: new_plan is empty after FOREACH/REGROUP insertion! This indicates a logic error in FOREACH wrapping")
            return plan  # Return original to avoid losing everything
        
        logger.info(f"Created FOREACH {foreach_step_id} with {len(sub_plan)} steps and {len(regroup_steps)} REGROUP steps. Final plan size: {len(new_plan)}")

        # Update dependencies
        self._recursively_update_dependencies(new_plan, regroup_map)
        
        # CRITICAL: After updating dependencies, the execution order must be invalidated
        # because steps now reference REGROUP steps that weren't in their inputs before.
        # This ensures the next validation pass recalculates the execution order correctly.
        # Note: The scope_id parameter passed to this method should be used by the caller
        # to invalidate the scope's execution order. For now, we return the plan and let
        # the caller handle the invalidation.

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
                consumer_plugin_def = self._get_plugin_definition(consumer_action_verb)

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

    def _validate_outputs_against_manifest(self, step: Dict[str, Any]) -> List[StructuredError]:
        """Validate that step outputs match the verb's manifest output definitions."""
        errors: List[StructuredError] = []
        step_id = step.get('id', 'unknown')
        action_verb = step.get('actionVerb', '')
        
        if not action_verb:
            return errors
        
        # Valid output types that steps can declare
        VALID_OUTPUT_TYPES = {
            'string', 'number', 'boolean', 'array', 'object', 'plan', 'plugin', 'any',
            'list', 'list[string]', 'list[number]', 'list[boolean]', 'list[object]', 'list[any]'
        }
        
        # Get step outputs
        step_outputs = step.get('outputs', {})
        if not isinstance(step_outputs, dict):
            return errors
        
        # Validate each output in the step has a valid type
        for output_name, output_def in step_outputs.items():
            if not isinstance(output_def, dict):
                continue
            
            output_type = output_def.get('type')
            if not output_type:
                continue
            
            # Check if declared output type is valid
            if output_type not in VALID_OUTPUT_TYPES:
                errors.append(StructuredError(
                    ErrorType.TYPE_MISMATCH,
                    f"Output '{output_name}' declares invalid type '{output_type}'. Valid types are: {', '.join(sorted(VALID_OUTPUT_TYPES))}",
                    step_id=step_id,
                    output_name=output_name
                ))
        
        return errors

    def _validate_deliverable_outputs(self, step: Dict[str, Any]) -> List[StructuredError]:
        """Validate deliverable output properties."""
        errors: List[StructuredError] = []
        outputs = step.get('outputs', {})
        step_id = step.get('id', 'unknown')

        # Handle case where outputs is a list instead of dict
        if isinstance(outputs, list):
            for i, output_def in enumerate(outputs):
                if isinstance(output_def, dict):
                    output_name = output_def.get('name', f'output_{i}')
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
        elif isinstance(outputs, dict):
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
                dest_plugin_def = self._get_plugin_definition(dest_step.get('actionVerb', ''))
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

        # Deserialize availablePlugins if it's a JSON string
        deserialized_available_plugins = []
        raw_available_plugins_input = inputs.get('availablePlugins')
        if raw_available_plugins_input and isinstance(raw_available_plugins_input, dict) and 'value' in raw_available_plugins_input:
            try:
                # The value will be a JSON string from CapabilitiesManager.ts
                deserialized_available_plugins = json.loads(raw_available_plugins_input['value'])
                logger.debug(f"Deserialized {len(deserialized_available_plugins)} available plugins for LLM repair.")
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to deserialize availablePlugins from input: {e}. Using empty list for repair instructions.")
            except Exception as e:
                logger.error(f"Unexpected error deserializing availablePlugins: {e}. Using empty list for repair instructions.")

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

        # Function to get intelligent repair instructions for missing inputs
        def get_missing_input_instructions(signature):
            """Generate repair instructions for missing required inputs based on the verb definition."""
            # Parse the signature: "MISSING_INPUT:VERB.inputName"
            if not signature.startswith("MISSING_INPUT:"):
                return None
            
            parts = signature[len("MISSING_INPUT:"):].split(".")
            if len(parts) != 2:
                return "This error indicates a required input is missing. Please add the missing input field to the specified step, providing a valid value or reference."
            
            verb_name, input_name = parts
            
            # Try to find the verb definition in available plugins
            verb_def = None
            if deserialized_available_plugins:
                for plugin in deserialized_available_plugins:
                    if isinstance(plugin, dict) and plugin.get('verb') == verb_name:
                        verb_def = plugin
                        break
            
            # Build instructions based on verb definition
            if verb_def:
                description = verb_def.get('description', '').strip()
                # Correctly extract required input names from inputDefinitions
                required_inputs_from_manifest = [
                    inp.get('name') for inp in verb_def.get('inputDefinitions', []) if inp.get('required')
                ]
                # Correctly extract output names from outputDefinitions
                output_names_from_manifest = [
                    out.get('name') for out in verb_def.get('outputDefinitions', [])
                ]
                
                # Create context-aware instructions
                instructions = f"The '{verb_name}' verb requires '{input_name}' as input."
                if description:
                    instructions += f" This verb: {description}"
                
                instructions += f"\n\nOptions for providing '{input_name}':"
                instructions += "\n1. A static string value: \"" + input_name + "\": {\"value\": \"some text\", \"valueType\": \"string\"}"
                instructions += "\n2. A reference to a previous step's output: \"" + input_name + "\": {\"sourceStep\": \"step_id\", \"outputName\": \"output_name\", \"valueType\": \"string\"}"
                if output_names_from_manifest:
                    instructions += f"\n3. Use output from previous steps like: {', '.join(output_names_from_manifest)}"
                
                if required_inputs_from_manifest:
                    instructions += f"\n\nOther required inputs for this verb: {', '.join(required_inputs_from_manifest)}"
                
                instructions += f"\n\n**Action:** For each {verb_name} step missing '{input_name}', add the input field with a valid value or step reference."
                return instructions
            
            # Fallback if verb not found in available plugins
            return f"The '{verb_name}' verb requires a '{input_name}' input. Please add this input to the step, providing either a static value or a reference to a previous step's output."
        
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
                elif signature.startswith("INPUT_NAME_MISMATCH"):
                    specific_instructions = """This error indicates a step has exactly one input, and its verb requires exactly one input, but the names do not match.
**Action:** For each error listed, fix the plan by renaming the provided input key to the required input key. For example, if the step has `inputs: { "my_input": ... }` but requires `needed_input`, change it to `inputs: { "needed_input": ... }`."""
                elif signature == "MISSING_INPUT:GENERATE.prompt":
                    specific_instructions = """The GENERATE verb requires a mandatory 'prompt' input that tells the LLM what to generate.

**GENERATE Structure:**
```json
{
  "id": "uuid",
  "actionVerb": "GENERATE",
  "description": "Generate something using LLM",
  "inputs": {
    "prompt": {
      "value": "Your prompt text here",
      "valueType": "string"
    }
  },
  "outputs": {
    "output_name": {
      "description": "The generated content",
      "type": "string"
    }
  }
}
```

The 'prompt' input can be:
1. A static string: {"value": "Generate a report", "valueType": "string"}
2. A reference to previous output: {"sourceStep": "step_id", "outputName": "previous_output", "valueType": "string"}
3. Text with placeholders referencing previous steps: {"value": "Summarize this: {previous_analysis}", "valueType": "string"}

**Action:** For each GENERATE step missing a 'prompt', add the prompt input with meaningful content that describes what should be generated."""
                elif signature.startswith("MISSING_INPUT:"):
                    # Use generic handler for all missing required inputs
                    specific_instructions = get_missing_input_instructions(signature)
                elif signature == "MISSING_FIELD":
                    specific_instructions = """This error indicates that input definitions are not in the expected format. The Brain often generates flattened input structures that need to be converted to the proper nested format.

**Expected Format:**
Each input should have EITHER:
1. 'value' + 'valueType' for constant values, OR
2. 'sourceStep' + 'outputName' for references to other steps

**Common Brain Format (needs conversion):**
"inputs": {
 "input_name": {
   "valueType": "string",
   "sourceStep": "step_id",
   "outputName": "output_name"
 }
}

**Action:** Convert any flattened input definitions to the proper nested format by ensuring each input has the correct structure."""
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

Return ONLY the full, corrected JSON plan as a valid JSON array. Do not include any explanations, comments, or surrounding markdown. The response must be the complete plan, not just the modified parts.
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
                
            response_str = response_tuple[0]
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
            raise AccomplishError(error_message, "repair_error")

        except (json.JSONDecodeError, AccomplishError) as e:
            logger.error(f"Error processing LLM repair response for signature '{signature}': {e}. Reverting to previous plan.")
            return current_plan
        except Exception as e:
            logger.error(f"An unexpected error occurred during LLM repair for signature '{signature}': {e}. Reverting.")
            return current_plan
