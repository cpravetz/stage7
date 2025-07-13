#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Python Implementation
Accomplishes a given goal or creates a plan to achieve it
"""

import json
import sys
import os
import requests
from typing import Dict, List, Any, Optional, Union
import logging
import io


schema = f"""
{{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {{
    "type": "object",
    "properties": {{
      "number": {{
        "type": "integer",
        "minimum": 1,
        "description": "Sequential step number"
      }},
      "actionVerb": {{
        "type": "string",
        "description": "The action to be performed in this step. It may be one of the plugin actionVerbs or a new actionVerb for a new type of task."
      }},
      "inputs": {{
        "type": "object",
        "patternProperties": {{
          "^[a-zA-Z][a-zA-Z0-9_]*$": {{
            "type": "object",
            "properties": {{
              "value": {{
                "type": "string",
                "description": "Constant string value for this input"
              }},
              "outputName": {{
                "type": "string",
                "description": "Reference to an output from a previous step"
              }},
              "valueType": {{
                "type": "string",
                "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"],
                "description": "The expected type of the input value"
              }},
              "args": {{
                "type": "object",
                "description": "Additional arguments for the input"
              }}
            }},
            "required": ["valueType"],
            "oneOf": [
              {{"required": ["value"]}},
              {{"required": ["outputName"]}}
            ],
            "additionalProperties": false
          }}
        }},
        "additionalProperties": false,
        "description": "Input parameters for this step"
      }},
      "description": {{
        "type": "string",
        "description": "Thorough description of what this step does and context needed to understand it"
      }},
      "outputs": {{
        "type": "object",
        "patternProperties": {{
          "^[a-zA-Z][a-zA-Z0-9_]*$": {{
            "type": "string",
            "description": "Thorough description of the expected output"
          }}
        }},
        "additionalProperties": false,
        "description": "Expected outputs from this step"
      }},
      "dependencies": {{
        "type": "object",
        "patternProperties": {{
          "^[a-zA-Z][a-zA-Z0-9_]*$": {{
            "type": "integer",
            "minimum": 1,
            "description": "Step number that produces the output for the input with this name"
          }}
        }},
        "additionalProperties": false,
        "description": "Object mapping outputNames to the step numbers that produce them. Format: {{outputName: stepNumber, ...}}"
      }},
      "recommendedRole": {{
        "type": "string",
        "description": "Suggested role type for the agent executing this step"
      }}
    }},
    "required": ["number", "actionVerb", "inputs", "description", "outputs", "dependencies"],
    "additionalProperties": false
  }},
  "description": "Schema for a workflow consisting of sequential steps with dependencies"
}}
"""

class InMemoryLogHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.log_buffer = io.StringIO()

    def emit(self, record):
        msg = self.format(record)
        self.log_buffer.write(msg + '\n')

    def get_logs(self):
        return self.log_buffer.getvalue()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add in-memory log handler to capture logs
memory_handler = InMemoryLogHandler()
memory_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(memory_handler)

class PluginParameterType:
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    PLAN = "plan"
    DIRECT_ANSWER = "DIRECT_ANSWER"
    PLUGIN = "plugin"
    ANY = "any"
    ERROR = "ERROR"

class AccomplishPlugin:
    # Removed VERB_SCHEMAS - no longer needed with error-driven repair approach

    ALLOWED_VALUE_TYPES = ['string', 'number', 'boolean', 'array', 'object', 'plan', 'plugin', 'any']

    def __init__(self):
        self.brain_url = os.getenv('BRAIN_URL', 'brain:5070')
        self.security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
    # Removed get_internal_verb_requirements_for_prompt - no longer needed with error-driven approach

    def get_auth_token(self) -> Optional[str]:
        """Get authentication token from SecurityManager"""
        try:
            response = requests.post(
                f"http://{self.security_manager_url}/generateToken",
                json={
                    "clientId": "ACCOMPLISH_Plugin",
                    "clientSecret": self.client_secret
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            return data.get('token')
        except Exception as e:
            logger.error(f"Failed to get auth token: {e}")
            return None



    def query_brain(self, prompt: str, brain_token: Optional[str] = None) -> Optional[str]:
        """Query the Brain service with authentication and improved error handling"""
        try:
            # Use provided brain token or fall back to getting our own
            token_to_use = brain_token or self.token
            if not token_to_use:
                self.token = self.get_auth_token()
                token_to_use = self.token
                if not token_to_use:
                    logger.error("Failed to obtain authentication token")
                    return None

            headers = {
                'Authorization': f'Bearer {token_to_use}',
                'Content-Type': 'application/json'
            }

            logger.info(f"Querying Brain at {self.brain_url}/chat with prompt length: {len(prompt)} chars")

            # Try with simplified optimization strategies
            attempts = [
                ("accuracy", "text/code"),
                ("speed", "text/text")
            ]

            for opt, conv_type in attempts:
                try:
                    response = requests.post(
                        f"http://{self.brain_url}/chat",
                        json={
                            "exchanges": [{"role": "user", "content": prompt}],
                            "optimization": opt,
                            "ConversationType": conv_type
                        },
                        headers=headers,
                        timeout=60  # Reduced timeout
                    )
                    response.raise_for_status()

                    data = response.json()
                    result = data.get('result') or data.get('response', '')

                    if result and result.strip():
                        logger.info(f"Brain query successful with {opt}/{conv_type}")
                        return result

                except Exception as e:
                    logger.warning(f"Brain query failed with {opt}/{conv_type}: {e}")
                    continue

            logger.error("All Brain query attempts failed")
            return None

        except Exception as e:
            logger.error(f"Failed to query Brain: {e}")
            return None

    def generate_prompt(self, goal: str, available_plugins_str: str, mission_context_str: str, is_simplified: bool = False) -> str:
        """Generate the prompt for the Brain service"""
        # Log the received available_plugins_str for debugging
        logger.info(f"[ACCOMPLISH] Received available_plugins_str: {repr(available_plugins_str)}")
        logger.info(f"[ACCOMPLISH] Received mission_context_str: {repr(mission_context_str)}")

        if is_simplified:
            # Generate a much simpler, focused prompt for retry attempts
            return self._generate_simplified_prompt(goal, available_plugins_str, mission_context_str)

        prompt = f"""
Your task is to decide on the best way to achieve the goal: '{goal}' and provide a response in one of the JSON formats below.

CRITICAL: Return ONLY valid JSON. No explanations, markdown, code blocks, or additional text.
Do NOT wrap your response in ```json``` blocks. Return raw JSON only.

**SUB-GOAL PLANNING**: If the goal is to figure out how to perform a single action (e.g., "Determine the best way to complete the step 'UPLOAD_RESUME'"), your primary objective is to create a concrete plan using EXISTING plugins.
- **DO NOT** create a plan that just uses 'THINK'.
- **INSTEAD**, create a plan that uses plugins like 'GET_USER_INPUT' (to ask for a file path), 'FILE_OPERATION' (to read the file), 'SCRAPE' (to get web content), etc.
- Your plan should *perform* the action, not just think about it.
- For example, to handle an unknown actionVerb like 'UPLOAD_RESUME', a good plan would be: 1. Use GET_USER_INPUT to ask the user for the resume file path. 2. Use FILE_OPERATION to read the file content from that path.

CRITICAL ERRORS TO AVOID:
- Do NOT omit "description" fields - every step needs a thorough description
- Do NOT omit "number" fields - steps must be numbered sequentially starting from 1
- Do NOT use "verb" property - use "actionVerb" property instead
- Do NOT create circular dependencies - step N cannot depend on step N+1 or later
- Do NOT create steps that depend on non-existent outputs from previous steps
- Do NOT use tuple format for outputs - use object format only
- Do NOT use "prompt" for GET_USER_INPUT - use "question" instead
- Do NOT forget "answerType" for GET_USER_INPUT - always include it

REQUIRED INPUT FORMATS:
- Each input must be an object with either 'value' OR 'outputName' property
- Use 'value' for constant values: {{"value": "some_text", "valueType": "string"}}
- Use 'outputName' for references to previous step outputs: {{"outputName": "previous_output", "valueType": "string"}}

Output Decision Hierarchy:
1. DIRECT_ANSWER: If you can fully resolve the goal directly
2. PLUGIN: If the goal needs a new, single-purpose function
3. PLAN: If the goal requires multiple steps

For PLAN responses, return a JSON object with this exact structure:
{{"type": "PLAN", "plan": <array_of_steps>}}

Where <array_of_steps> must comply with this JSON schema:

{schema}

CRITICAL FIELD REQUIREMENTS:
- ALWAYS include "number" field with sequential step numbers starting from 1
- ALWAYS include "actionVerb" field (NOT "verb")
- Include "description" for every step with full context and explaining thoroughly what it does
- Use "dependencies" object format: {{"outputName": stepNumber}}
- If a step needs no inputs, use empty inputs object: "inputs": {{}}
- There must be a dependency object property for every input dependent on another steps output.
- Outputs must be object format: {{"outputKey": "description"}}, NOT tuple format

Available plugins: {available_plugins_str[:1000]}{"..." if len(available_plugins_str) > 1000 else ""}

PLANNING PRINCIPLES:
1. **Reuse existing plugins**: If a plugin or actionVerb already exists, use it instead of creating a new one
2. **Dependency-Driven**: Most steps should depend on outputs from previous steps
3. **Iterative Refinement**: Include steps that validate, refine, or improve earlier outputs
4. **Conditional Logic**: Use DECIDE, WHILE, UNTIL for plans that adapt based on outcomes
5. **Information Gathering**: Start with research/data collection before taking action
6. **Validation**: Include verification steps to ensure quality and accuracy
7. **Over Explain**: Make descriptions and explanations very thorough

PLAN STRUCTURE GUIDELINES:
- Use outcome based planning to inform your plan (Before the goal, these other things must be achieved, and before those...)
- Aim for the plan to be one order of magnitude more detailed that the goal statement
- Include analysis and validation steps
- Use intermediate steps to refine and improve outputs
- Add decision points where the plan might branch

STEP INTERDEPENDENCY:
- Each step should build upon previous steps' outputs
- Use outputName references to create chains of dependent tasks
- Avoid isolated steps that don't connect to the overall flow

CRITICAL INPUT/DEPENDENCY FORMAT:
When a step needs output from a previous step, use BOTH:
1. Input with outputName: {{"inputName": {{"outputName": "previousStepOutput", "valueType": "string"}}}}
2. Dependency entry: {{"dependencies": {{"previousStepOutput": stepNumber}}}}

EXECUTION REQUIREMENTS:
- Create plans that can be executed immediately without additional planning
- Each step must have all required inputs either as direct values or dependencies
- Avoid creating steps that just create more plans - create actionable steps
- Final steps should produce concrete deliverables, not just more planning
- If the goal requires file uploads or user input, include GET_USER_INPUT steps

CONTROL FLOW actionVerb USAGE:
- Use DECIDE when the plan should branch based on conditions
- Use WHILE for iterative improvement processes
- Use UNTIL for goal-seeking behaviors
- Use REPEAT for tasks that need multiple attempts
Inputs representing sets of steps for Control Flow actionVerbs must conform to the plan schema and be declared a type "plan"


Agent roles: coordinator, researcher, creative, critic, executor, domain_expert

For DIRECT_ANSWER: {{"type": "DIRECT_ANSWER", "answer": "your answer"}}
For PLUGIN: {{"type": "PLUGIN", "plugin": {{"id": "plugin-name", "verb": "VERB", "description": "...", "explanation": "...", "inputDefinitions": []}}}}

Mission Context: {mission_context_str}
"""
        return prompt.strip()

    def _parse_llm_response(self, response: str) -> Optional[Any]:
        """Parse LLM response with multiple fallback strategies"""
        if not response or not response.strip():
            return None

        # Try direct JSON parsing first
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        import re
        json_match = re.search(r'```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find JSON-like content between first { and last }
        first_brace = response.find('{')
        last_brace = response.rfind('}')
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            try:
                json_content = response[first_brace:last_brace + 1]
                return json.loads(json_content)
            except json.JSONDecodeError:
                pass

        # Try to find JSON array content between first [ and last ]
        first_bracket = response.find('[')
        last_bracket = response.rfind(']')
        if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
            try:
                json_content = response[first_bracket:last_bracket + 1]
                return json.loads(json_content)
            except json.JSONDecodeError:
                pass

        # Try to clean up common JSON formatting issues
        cleaned_response = response.strip()
        # The remainder of the _parse_llm_response function was cut off,
        # but the relevant fix is outside of it.

    def _validate_inputs(self, inputs: Dict[str, Any], step_index: int, action_verb: str) -> List[Dict[str, Any]]:
        """Validate the inputs structure for a step."""
        errors = []
        step_number = step_index + 1

        for input_name, input_value in inputs.items():
            if not isinstance(input_value, dict):
                errors.append({
                    "step_index": step_index,
                    "error_type": "input_structure_error",
                    "field": f"inputs.{input_name}",
                    "error_message": f"Step {step_number} input '{input_name}' is not an object",
                    "malformed_element": {input_name: input_value},
                    "expected_format": "Input must be object with 'value' OR 'outputName' property",
                    "correction_needed": f"Change input '{input_name}' to object format: {{'value': 'some_value'}} or {{'outputName': 'output_from_previous_step'}}"
                })
                continue

            has_value = 'value' in input_value
            has_output_name = 'outputName' in input_value

            if not (has_value or has_output_name):
                errors.append({
                    "step_index": step_index,
                    "error_type": "input_missing_property",
                    "field": f"inputs.{input_name}",
                    "error_message": f"Step {step_number} input '{input_name}' has neither 'value' nor 'outputName'",
                    "malformed_element": {input_name: input_value},
                    "expected_format": "Input must have either 'value' or 'outputName' property",
                    "correction_needed": f"Add either 'value' or 'outputName' property to input '{input_name}'"
                })
            elif has_value and has_output_name:
                errors.append({
                    "step_index": step_index,
                    "error_type": "input_conflicting_properties",
                    "field": f"inputs.{input_name}",
                    "error_message": f"Step {step_number} input '{input_name}' has both 'value' and 'outputName'",
                    "malformed_element": {input_name: input_value},
                    "expected_format": "Input must have either 'value' OR 'outputName', not both",
                    "correction_needed": f"Remove either 'value' or 'outputName' from input '{input_name}'"
                })

            # Validate valueType if present
            if 'valueType' in input_value and input_value['valueType'] not in self.ALLOWED_VALUE_TYPES:
                errors.append({
                    "step_index": step_index,
                    "error_type": "invalid_value_type",
                    "field": f"inputs.{input_name}.valueType",
                    "error_message": f"Step {step_number} input '{input_name}' has invalid valueType",
                    "malformed_element": {"valueType": input_value['valueType']},
                    "expected_format": f"valueType must be one of: {', '.join(self.ALLOWED_VALUE_TYPES)}",
                    "correction_needed": f"Change valueType to a valid type for input '{input_name}'"
                })

        return errors

    def _validate_dependencies(self, dependencies: Dict[str, Any], step_index: int, plan_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate the dependencies structure for a step."""
        errors = []
        step_number = step_index + 1

        for output_name, dep_step_number in dependencies.items():
            if not isinstance(output_name, str) or not output_name.strip():
                errors.append({
                    "step_index": step_index,
                    "error_type": "dependency_key_error",
                    "field": f"dependencies.{output_name}",
                    "error_message": f"Step {step_number} has invalid dependency key",
                    "malformed_element": {output_name: dep_step_number},
                    "expected_format": "Dependency key must be non-empty string (output name)",
                    "correction_needed": f"Use a valid output name as dependency key"
                })
                continue

            if not isinstance(dep_step_number, int) or dep_step_number <= 0:
                errors.append({
                    "step_index": step_index,
                    "error_type": "dependency_step_error",
                    "field": f"dependencies.{output_name}",
                    "error_message": f"Step {step_number} has invalid dependency step number",
                    "malformed_element": {output_name: dep_step_number},
                    "expected_format": "Dependency step number must be positive integer",
                    "correction_needed": f"Change dependency step number to positive integer for '{output_name}'"
                })
                continue

            if dep_step_number >= step_number:
                errors.append({
                    "step_index": step_index,
                    "error_type": "circular_dependency",
                    "field": f"dependencies.{output_name}",
                    "error_message": f"Step {step_number} cannot depend on step {dep_step_number} (circular dependency)",
                    "malformed_element": {output_name: dep_step_number},
                    "expected_format": "Dependencies must reference previous steps only",
                    "correction_needed": f"Change dependency to reference a step before step {step_number}"
                })
                continue

            # Check if the referenced step exists and produces the expected output
            if dep_step_number <= len(plan_data):
                referenced_step = plan_data[dep_step_number - 1]
                if 'outputs' in referenced_step and isinstance(referenced_step['outputs'], dict):
                    if output_name not in referenced_step['outputs']:
                        errors.append({
                            "step_index": step_index,
                            "error_type": "missing_output_dependency",
                            "field": f"dependencies.{output_name}",
                            "error_message": f"Step {step_number} depends on output '{output_name}' from step {dep_step_number}, but that step doesn't produce it",
                            "malformed_element": {output_name: dep_step_number},
                            "expected_format": f"Step {dep_step_number} must have '{output_name}' in its outputs",
                            "correction_needed": f"Either add '{output_name}' to step {dep_step_number} outputs or change dependency"
                        })

        return errors

    def _validate_outputs(self, outputs: Dict[str, Any], step_index: int) -> List[Dict[str, Any]]:
        """Validate the outputs structure for a step."""
        errors = []
        step_number = step_index + 1

        if not outputs:
            errors.append({
                "step_index": step_index,
                "error_type": "empty_outputs",
                "field": "outputs",
                "error_message": f"Step {step_number} has empty outputs",
                "malformed_element": outputs,
                "expected_format": "Non-empty object with output names and descriptions",
                "correction_needed": f"Add at least one output to step {step_number}"
            })
            return errors

        for output_name, output_description in outputs.items():
            if not isinstance(output_name, str) or not output_name.strip():
                errors.append({
                    "step_index": step_index,
                    "error_type": "invalid_output_key",
                    "field": f"outputs.{output_name}",
                    "error_message": f"Step {step_number} has invalid output key",
                    "malformed_element": {output_name: output_description},
                    "expected_format": "Output key must be non-empty string",
                    "correction_needed": f"Use valid string as output key"
                })

            if not isinstance(output_description, str) or not output_description.strip():
                errors.append({
                    "step_index": step_index,
                    "error_type": "invalid_output_description",
                    "field": f"outputs.{output_name}",
                    "error_message": f"Step {step_number} output '{output_name}' has invalid description",
                    "malformed_element": {output_name: output_description},
                    "expected_format": "Output description must be non-empty string",
                    "correction_needed": f"Provide descriptive text for output '{output_name}'"
                })

        return errors

    # This method orchestrates the validation of a full plan
    def validate_plan_data(self, plan_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Validate the entire plan data against the defined schema and rules.
        Returns a detailed error report if validation fails, otherwise None.
        """
        all_errors = []

        if not isinstance(plan_data, list):
            return {
                "error_type": "plan_structure_error",
                "error_message": "Plan must be a JSON array of steps.",
                "correction_needed": "Ensure the plan is a JSON array.",
                "malformed_element": plan_data
            }

        if not plan_data:
            return {
                "error_type": "empty_plan",
                "error_message": "Plan array is empty.",
                "correction_needed": "Provide a non-empty plan array with at least one step."
            }

        for i, step in enumerate(plan_data):
            step_number = i + 1 # 1-based indexing for reporting

            # Basic structure validation for each step
            required_fields = ["number", "actionVerb", "inputs", "description", "outputs", "dependencies"]
            for field in required_fields:
                if field not in step:
                    all_errors.append({
                        "step_index": i,
                        "error_type": "missing_required_field",
                        "field": field,
                        "error_message": f"Step {step_number} is missing required field '{field}'.",
                        "correction_needed": f"Add the '{field}' field to step {step_number}.",
                        "malformed_element": step
                    })

            # Validate 'number' field
            if 'number' in step and (not isinstance(step['number'], int) or step['number'] != step_number):
                all_errors.append({
                    "step_index": i,
                    "error_type": "invalid_step_number",
                    "field": "number",
                    "error_message": f"Step {step_number} has incorrect or missing 'number' field. Expected {step_number}.",
                    "malformed_element": {"number": step.get('number')},
                    "expected_format": f"Step number must be {step_number}",
                    "correction_needed": f"Set 'number' field of step {step_number} to {step_number}."
                })
            
            # Validate 'actionVerb'
            if 'actionVerb' in step and (not isinstance(step['actionVerb'], str) or not step['actionVerb'].strip()):
                all_errors.append({
                    "step_index": i,
                    "error_type": "invalid_action_verb",
                    "field": "actionVerb",
                    "error_message": f"Step {step_number} has invalid or empty 'actionVerb'.",
                    "malformed_element": {"actionVerb": step.get('actionVerb')},
                    "expected_format": "actionVerb must be a non-empty string",
                    "correction_needed": f"Provide a valid non-empty string for 'actionVerb' in step {step_number}."
                })

            # Validate 'description'
            if 'description' in step and (not isinstance(step['description'], str) or not step['description'].strip()):
                all_errors.append({
                    "step_index": i,
                    "error_type": "invalid_description",
                    "field": "description",
                    "error_message": f"Step {step_number} has invalid or empty 'description'.",
                    "malformed_element": {"description": step.get('description')},
                    "expected_format": "description must be a non-empty string",
                    "correction_needed": f"Provide a valid non-empty string for 'description' in step {step_number}."
                })

            # Validate 'inputs'
            inputs_dict = step.get('inputs')
            if not isinstance(inputs_dict, dict):
                all_errors.append({
                    "step_index": i,
                    "error_type": "inputs_structure_error",
                    "field": "inputs",
                    "error_message": f"Step {step_number} has invalid 'inputs' field. Must be an object.",
                    "malformed_element": inputs_dict,
                    "expected_format": "Inputs must be an object: {'inputName': {'value': 'x', 'valueType': 'string'}}",
                    "correction_needed": f"Ensure 'inputs' in step {step_number} is a proper JSON object."
                })
            else:
                all_errors.extend(self._validate_inputs(inputs_dict, i, step.get('actionVerb', '')))


            # Validate 'outputs'
            outputs_dict = step.get('outputs')
            if not isinstance(outputs_dict, dict):
                all_errors.append({
                    "step_index": i,
                    "error_type": "outputs_structure_error",
                    "field": "outputs",
                    "error_message": f"Step {step_number} has invalid 'outputs' field. Must be an object.",
                    "malformed_element": outputs_dict,
                    "expected_format": "Outputs must be an object: {'outputName': 'description'}",
                    "correction_needed": f"Ensure 'outputs' in step {step_number} is a proper JSON object."
                })
            else:
                all_errors.extend(self._validate_outputs(outputs_dict, i))
            
            # Validate 'dependencies'
            dependencies_dict = step.get('dependencies')
            if not isinstance(dependencies_dict, dict):
                all_errors.append({
                    "step_index": i,
                    "error_type": "dependencies_structure_error",
                    "field": "dependencies",
                    "error_message": f"Step {step_number} has invalid 'dependencies' field. Must be an object.",
                    "malformed_element": dependencies_dict,
                    "expected_format": "Dependencies must be an object: {'outputName': stepNumber}",
                    "correction_needed": f"Ensure 'dependencies' in step {step_number} is a proper JSON object."
                })
            else:
                all_errors.extend(self._validate_dependencies(dependencies_dict, i, plan_data))

            # Validate 'recommendedRole' if present
            if 'recommendedRole' in step and not isinstance(step['recommendedRole'], str):
                all_errors.append({
                    "step_index": i,
                    "error_type": "invalid_recommended_role",
                    "field": "recommendedRole",
                    "error_message": f"Step {step_number} has invalid 'recommendedRole'. Must be a string.",
                    "malformed_element": {"recommendedRole": step.get('recommendedRole')},
                    "expected_format": "recommendedRole must be a string",
                    "correction_needed": f"Ensure 'recommendedRole' in step {step_number} is a string."
                })

        if all_errors:
            return {
                "error_type": "validation_errors",
                "error_message": f"Found {len(all_errors)} validation errors in the plan.",
                "validation_errors": all_errors,
                "correction_needed": "Review the 'validation_errors' list for detailed correction instructions."
            }
        return None # No errors


    def convert_json_to_tasks(self, json_plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert JSON plan to task format. Assumes detailed validation has passed."""
        try:
            tasks = []
            for step in json_plan:
                # Convert inputs to inputReferences format expected by Step.ts
                input_references = {}
                inputs_dict = step.get('inputs', {})

                for input_name, input_obj in inputs_dict.items():
                    if isinstance(input_obj, dict):
                        # The input_obj should already be in the correct format after validation
                        # Just pass it through directly
                        input_references[input_name] = input_obj
                    else:
                        logger.warning(f"Unexpected input format for '{input_name}': {input_obj}")
                        # Try to handle as a direct value
                        input_references[input_name] = {
                            "value": input_obj,
                            "valueType": "string"
                        }

                task = {
                    "actionVerb": step['actionVerb'],
                    "inputReferences": input_references,
                    "description": step['description'],
                    "outputs": step['outputs'],
                    "dependencies": step.get('dependencies', {}), # Pass dependencies as dict
                    "recommendedRole": step.get('recommendedRole')
                }
                tasks.append(task)
            return tasks
        except Exception as e:
            logger.error(f"Error converting JSON to tasks: {e}")
            return [{
                "success": False,
                "name": "task_conversion_error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Internal error converting plan to tasks: {str(e)}",
                "result": {"logs": memory_handler.get_logs()},
                "error": str(e)
            }]



    def auto_repair_plan(self, goal: str, available_plugins_str: str, mission_context_str: str, invalid_plan: list, validation_error_report: Dict[str, Any], brain_token: Optional[str] = None) -> Optional[list]:
        """
        Ask the Brain to fix specific validation errors in the plan.
        Uses detailed error reports to provide targeted correction instructions.
        """
        logger.info('Auto-repairing plan with error-driven approach...')

        if isinstance(validation_error_report, str):
            # Legacy support - convert string error to basic error report
            validation_error_report = {
                "error_type": "legacy_error",
                "error_message": validation_error_report,
                "correction_needed": "Fix the validation error in the plan"
            }

        repair_prompt = self._generate_error_driven_repair_prompt(goal, invalid_plan, validation_error_report)

        response = self.query_brain(repair_prompt, brain_token)
        if not response:
            logger.error("Auto-repair failed: no response from Brain")
            return None

        try:
            parsed = self._parse_llm_response(response)
            if isinstance(parsed, list):
                logger.info(f"Auto-repair successful: returned {len(parsed)} steps")
                return parsed
            elif isinstance(parsed, dict):
                # Handle wrapped responses
                for key in ["items", "plan", "value", "steps", "result"]:
                    if key in parsed and isinstance(parsed[key], list):
                        return parsed[key]

                # Check if the dict itself looks like a single step
                if "number" in parsed and "actionVerb" in parsed:
                    logger.info("Auto-repair returned single step, wrapping in array")
                    return [parsed]

                # Look for any list value in the dict
                for key, value in parsed.items():
                    if isinstance(value, list) and len(value) > 0:
                        logger.info(f"Auto-repair found list in '{key}' field")
                        return value

            logger.error(f"Auto-repair failed: unexpected response format: {type(parsed)}")
            return None

        except Exception as e:
            logger.error(f"Auto-repair failed to parse response: {e}")
            return None

    def _generate_error_driven_repair_prompt(self, goal: str, invalid_plan: list, error_report: Dict[str, Any]) -> str:
        """Generate a targeted repair prompt based on specific validation errors."""

        if error_report.get("error_type") == "validation_errors":
            # Multiple validation errors - provide detailed correction instructions
            validation_errors = error_report.get("validation_errors", [])

            error_details = []
            for error in validation_errors:
                step_num = error.get("step_index", 0) + 1
                field = error.get("field", "unknown")
                message = error.get("error_message", "")
                correction = error.get("correction_needed", "")
                malformed_element = error.get("malformed_element", {})
                expected_format = error.get("expected_format", "")

                error_detail = f"- Step {step_num}, field '{field}': {message}"
                if malformed_element:
                    error_detail += f"\n  Current: {json.dumps(malformed_element)}"
                if expected_format:
                    error_detail += f"\n  Expected: {expected_format}"
                error_detail += f"\n  Fix: {correction}"

                error_details.append(error_detail)

            prompt = f"""
PLAN REPAIR TASK

Goal: {goal}

The following plan has validation errors that need to be fixed:

{json.dumps(invalid_plan, indent=2)}

SPECIFIC ERRORS TO FIX:
{chr(10).join(error_details)}

INSTRUCTIONS:
1. Fix ONLY the specific errors listed above
2. Do not change other parts of the plan unless necessary
3. Return the complete corrected plan as a JSON array
4. Each step must have: number, actionVerb, description, inputs, dependencies, outputs, recommendedRole

Return ONLY the corrected JSON array, no explanations.
"""
        else:
            # Single error or legacy error format
            error_message = error_report.get("error_message", "Unknown error")
            correction_needed = error_report.get("correction_needed", "Fix the error")

            prompt = f"""
PLAN REPAIR TASK

Goal: {goal}

The following plan has an error:

{json.dumps(invalid_plan, indent=2)}

ERROR: {error_message}

CORRECTION NEEDED: {correction_needed}

Return the corrected plan as a JSON array. Fix only the specific error mentioned.
"""

        return prompt.strip()

    def _report_plan_generation_success(self, brain_token: str, num_steps: int, attempt: int):
        """Report successful plan generation to Brain for performance tracking."""
        try:
            if not brain_token:
                logger.warning("No Brain token available to report plan generation success.")
                return

            headers = {
                'Authorization': f'Bearer {brain_token}',
                'Content-Type': 'application/json'
            }
            payload = {
                "eventType": "plan_generation_success",
                "data": {
                    "numSteps": num_steps,
                    "attempt": attempt
                }
            }
            response = requests.post(
                f"http://{self.brain_url}/event",
                json=payload,
                headers=headers,
                timeout=5
            )
            response.raise_for_status()
            logger.info("Successfully reported plan generation success to Brain.")
        except Exception as e:
            logger.warning(f"Failed to report plan generation success to Brain: {e}")

    def _report_plan_generation_failure(self, brain_token: str, error_details: str, attempt: int):
        """Report plan generation failure to Brain for performance tracking."""
        try:
            if not brain_token:
                logger.warning("No Brain token available to report plan generation failure.")
                return

            headers = {
                'Authorization': f'Bearer {brain_token}',
                'Content-Type': 'application/json'
            }
            payload = {
                "eventType": "plan_generation_failure",
                "data": {
                    "error": error_details,
                    "attempt": attempt
                }
            }
            response = requests.post(
                f"http://{self.brain_url}/event",
                json=payload,
                headers=headers,
                timeout=5
            )
            response.raise_for_status()
            logger.info("Successfully reported plan generation failure to Brain.")
        except Exception as e:
            logger.warning(f"Failed to report plan generation failure to Brain: {e}")

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the ACCOMPLISH plugin"""
        try:
            logger.info(f"Execute method called with goal: {inputs_map['goal']}")

            # Extract goal, brain token, available_plugins, and mission_context from inputs
            goal = None
            brain_token = None
            available_plugins_str = "No specific plugins listed as available." # Default
            mission_context_str = "No overall mission context provided." # Default

            for key, value_obj in inputs_map.items():
                input_value = value_obj.get('value') if isinstance(value_obj, dict) else value_obj

                if key == 'goal':
                    if isinstance(input_value, dict) and 'inputValue' in input_value:
                        goal = str(input_value['inputValue']) if input_value['inputValue'] is not None else None
                        logger.info(f"Extracted goal from nested 'inputValue': {goal}")
                    else:
                        goal = str(input_value) if input_value is not None else None
                elif key == 'available_plugins': # Expecting a string, potentially pre-formatted
                    if isinstance(input_value, list): # If agent sends a list of plugin names
                        available_plugins_str = "\n".join([f"- {p}" for p in input_value]) if input_value else "No plugins listed."
                    elif isinstance(input_value, str) and input_value.strip():
                        available_plugins_str = input_value
                elif key == 'mission_context':
                    if isinstance(input_value, str) and input_value.strip():
                        mission_context_str = input_value
                    logger.info(f"Found mission_context: {mission_context_str}")
                elif key in ['__brain_auth_token', 'token']: # Keep existing token logic
                    brain_token = str(input_value) if input_value is not None else None

            if not goal:
                logger.error("No goal provided to ACCOMPLISH plugin")
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "Goal is required for ACCOMPLISH plugin",
                    "result": {"logs": memory_handler.get_logs()},
                    "error": "No goal provided to ACCOMPLISH plugin"
                }]

            max_retries = 2  # Reduced from 3 to 2
            for attempt in range(max_retries):
                # Generate prompt and query Brain
                is_simplified = attempt > 0  # Use simplified prompt for retries
                current_prompt = self.generate_prompt(goal, available_plugins_str, mission_context_str, is_simplified)

                response = self.query_brain(current_prompt, brain_token)

                if not response:
                    if attempt == max_retries - 1:
                        return [{
                            "success": False, "name": "error", "resultType": PluginParameterType.ERROR,
                            "resultDescription": "Failed to get response from Brain service.",
                            "result": {"logs": memory_handler.get_logs()},
                            "error": "Brain service unavailable."
                        }]
                    continue

                # Parse Brain response with improved error handling
                try:
                    parsed = self._parse_llm_response(response)
                    if parsed is None:
                        logger.error(f"Failed to parse response after cleanup attempts")
                        if attempt == max_retries - 1:
                            return [{
                                "success": False, "name": "error", "resultType": PluginParameterType.ERROR,
                                "resultDescription": "Failed to parse JSON response after cleanup attempts",
                                "result": {"logs": memory_handler.get_logs()},
                                "error": "Invalid JSON response from Brain service after cleanup attempts"
                            }]
                        continue # Try again if retries left
                    logger.info(f"Model response received (attempt {attempt+1}): {str(parsed)[:500]}...")

                    # Handle PLAN, DIRECT_ANSWER, or PLUGIN
                    if isinstance(parsed, dict) and parsed.get("type") == "PLAN" and \
                       (isinstance(parsed.get("steps"), list) or isinstance(parsed.get("plan"), list) or isinstance(parsed.get("items"), list) or isinstance(parsed.get("value"), list)):
                        if isinstance(parsed.get("steps"), list):
                            plan_data = parsed.get("steps")
                        elif isinstance(parsed.get("plan"), list):
                            plan_data = parsed.get("plan")
                        elif isinstance(parsed.get("items"), list):
                            plan_data = parsed.get("items")
                        else:
                            plan_data = parsed.get("value")
                        logger.info(f"Successfully parsed top-level PLAN object. Plan length: {len(plan_data)}")

                        validation_error_report = self.validate_plan_data(plan_data)
                        repair_attempts = 0
                        max_repair_attempts = 2

                        while validation_error_report and repair_attempts < max_repair_attempts:
                            error_message = validation_error_report.get("error_message", "Unknown validation error")
                            logger.warning(f"Plan validation failed: {error_message}. Attempting auto-repair (repair attempt {repair_attempts+1}).")

                            # Use error-driven repair approach
                            repaired_plan = self.auto_repair_plan(goal, available_plugins_str, mission_context_str, plan_data, validation_error_report, brain_token)
                            if not repaired_plan:
                                logger.error("Auto-repair failed to produce a new plan.")
                                break
                            plan_data = repaired_plan
                            validation_error_report = self.validate_plan_data(plan_data)
                            repair_attempts += 1

                        if validation_error_report:
                            error_message = validation_error_report.get("error_message", "Plan validation failed")
                            self._report_plan_generation_failure(brain_token, error_message, attempt + 1)
                            return [{
                                "success": False, "name": "plan_validation_error", "resultType": PluginParameterType.ERROR,
                                "resultDescription": error_message, "result": {"logs": memory_handler.get_logs()},
                                "error": error_message
                            }]

                        tasks = self.convert_json_to_tasks(plan_data)
                        if tasks and isinstance(tasks, list) and tasks[0].get("resultType") == PluginParameterType.ERROR:
                             return tasks # Propagate error from conversion

                        # Report successful plan generation to Brain for model performance tracking
                        self._report_plan_generation_success(brain_token, len(plan_data), attempt + 1)

                        logger.info(f"Successfully processed plan for goal: {goal}")
                        return [{
                            "success": True, "name": "plan", "resultType": PluginParameterType.PLAN,
                            "resultDescription": f"A plan to: {goal}", "result": tasks,
                            "mimeType": "application/json", "logs": memory_handler.get_logs()
                        }]

                    # Handle case where Brain returns a single step instead of a PLAN object
                    elif isinstance(parsed, dict) and "number" in parsed and "actionVerb" in parsed:
                        logger.error(f"Brain response is not a recognized JSON object (PLAN, DIRECT_ANSWER, PLUGIN) nor a valid single step. Response: {json.dumps(parsed, indent=2)}")
                        # This case means a single step was returned, not wrapped in a plan object.
                        # Wrap it in a list for consistent processing as a plan with one step.
                        plan_data = [parsed]
                        logger.info(f"Brain returned a single step directly, wrapping in PLAN object for validation.")

                        validation_error_report = self.validate_plan_data(plan_data)
                        repair_attempts = 0
                        max_repair_attempts = 2

                        while validation_error_report and repair_attempts < max_repair_attempts:
                            error_message = validation_error_report.get("error_message", "Unknown validation error")
                            logger.warning(f"Plan validation failed: {error_message}. Attempting auto-repair (repair attempt {repair_attempts+1}).")

                            repaired_plan = self.auto_repair_plan(goal, available_plugins_str, mission_context_str, plan_data, validation_error_report, brain_token)
                            if not repaired_plan:
                                logger.error("Auto-repair failed to produce a new plan.")
                                break
                            plan_data = repaired_plan
                            validation_error_report = self.validate_plan_data(plan_data)
                            repair_attempts += 1

                        if validation_error_report:
                            error_message = validation_error_report.get("error_message", "Plan validation failed")
                            self._report_plan_generation_failure(brain_token, error_message, attempt + 1)
                            return [{
                                "success": False, "name": "plan_validation_error", "resultType": PluginParameterType.ERROR,
                                "resultDescription": error_message, "result": {"logs": memory_handler.get_logs()},
                                "error": error_message
                            }]

                        tasks = self.convert_json_to_tasks(plan_data)
                        if tasks and isinstance(tasks, list) and tasks[0].get("resultType") == PluginParameterType.ERROR:
                             return tasks

                        self._report_plan_generation_success(brain_token, len(plan_data), attempt + 1)

                        logger.info(f"Successfully processed single step as plan for goal: {goal}")
                        return [{
                            "success": True, "name": "plan", "resultType": PluginParameterType.PLAN,
                            "resultDescription": f"A plan to: {goal}", "result": tasks,
                            "mimeType": "application/json", "logs": memory_handler.get_logs()
                        }]


                    # Handle case where Brain returns an array directly (should be wrapped in PLAN object)
                    elif isinstance(parsed, list) and len(parsed) > 0 and all(isinstance(step, dict) and "actionVerb" in step for step in parsed):
                        logger.info(f"Brain returned array of steps directly, treating as plan. Steps: {len(parsed)}")
                        plan_data = parsed

                        validation_error_report = self.validate_plan_data(plan_data)
                        repair_attempts = 0
                        max_repair_attempts = 2

                        while validation_error_report and repair_attempts < max_repair_attempts:
                            error_message = validation_error_report.get("error_message", "Unknown validation error")
                            logger.warning(f"Plan validation failed: {error_message}. Attempting auto-repair (repair attempt {repair_attempts+1}).")

                            repaired_plan = self.auto_repair_plan(goal, available_plugins_str, mission_context_str, plan_data, validation_error_report, brain_token)
                            if not repaired_plan:
                                logger.error("Auto-repair failed to produce a new plan.")
                                break
                            plan_data = repaired_plan
                            validation_error_report = self.validate_plan_data(plan_data)
                            repair_attempts += 1

                        if validation_error_report:
                            error_message = validation_error_report.get("error_message", "Plan validation failed")
                            self._report_plan_generation_failure(brain_token, error_message, attempt + 1)
                            return [{
                                "success": False, "name": "plan_validation_error", "resultType": PluginParameterType.ERROR,
                                "resultDescription": error_message, "result": {"logs": memory_handler.get_logs()},
                                "error": error_message
                            }]

                        tasks = self.convert_json_to_tasks(plan_data)
                        if tasks and isinstance(tasks, list) and tasks[0].get("resultType") == PluginParameterType.ERROR:
                             return tasks

                        self._report_plan_generation_success(brain_token, len(plan_data), attempt + 1)

                        logger.info(f"Successfully processed direct array plan for goal: {goal}")
                        return [{
                            "success": True, "name": "plan", "resultType": PluginParameterType.PLAN,
                            "resultDescription": f"A plan to: {goal}", "result": tasks,
                            "mimeType": "application/json", "logs": memory_handler.get_logs()
                        }]

                    elif isinstance(parsed, dict) and parsed.get("type") == "DIRECT_ANSWER":
                        logger.info(f"Received DIRECT_ANSWER: {parsed}")
                        return [{"success": True, "name": "direct_answer", "resultType": PluginParameterType.DIRECT_ANSWER,
                                 "resultDescription": f"Direct answer for: {goal}", "result": parsed.get("answer"),
                                 "explanation": parsed.get("explanation", "")}]

                    elif isinstance(parsed, dict) and parsed.get("type") == "PLUGIN":
                        logger.info(f"Received PLUGIN: {parsed}")
                        return [{"success": True, "name": "plugin", "resultType": PluginParameterType.PLUGIN,
                                 "resultDescription": f"Plugin recommendation for: {goal}",
                                 "result": parsed.get("plugin", {})}]

                    else: # Unrecognized format
                        logger.error(f"Brain response is not a recognized JSON object (PLAN, DIRECT_ANSWER, PLUGIN) nor a valid single step. Response: {response[:500]}")
                        self._report_plan_generation_failure(brain_token, f"unrecognized_json_type: {parsed.get('type', 'N/A')}", attempt + 1)
                        return [{
                            "success": False, "name": "brain_response_format_error", "resultType": PluginParameterType.ERROR,
                            "resultDescription": "Brain did not return a recognized JSON object type.",
                            "result": {"logs": memory_handler.get_logs()},
                            "error": f"Unrecognized JSON object type: {parsed.get('type', 'N/A')}"
                        }]

                except Exception as e:
                    logger.error(f"Failed to parse Brain response (attempt {attempt+1}): {e}. Response: {response[:500]}")
                    # Report failure to Brain for model performance tracking
                    self._report_plan_generation_failure(brain_token, f"json_parse_error: {str(e)}", attempt + 1)

                    # If it's the last attempt, return the error, otherwise continue to retry
                    if attempt == max_retries - 1:
                        return [{
                            "success": False,
                            "name": "error",
                            "resultType": PluginParameterType.ERROR,
                            "resultDescription": "Invalid JSON response from Brain service after all retries",
                            "result": {"logs": memory_handler.get_logs()},
                            "error": f"JSON parsing error: {str(e)}"
                        }]
                    continue # Try again if retries left

            # If we get here, all retries failed
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": "Failed to get valid response from Brain service after all retries",
                "result": {"logs": memory_handler.get_logs()},
                "error": "All retry attempts exhausted"
            }]
        except Exception as e:
            logger.error(f"ACCOMPLISH plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error in ACCOMPLISH plugin execution",
                "result": {"logs": memory_handler.get_logs()},
                "error": str(e)
            }]

def main():
    """Main entry point for the plugin"""
    try:
        # Read inputs from stdin
        inputs_str = sys.stdin.read().strip()
        if not inputs_str:
            raise ValueError("No input provided")

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)

        inputs_map = {item[0]: item[1] for item in inputs_list}

        # Debug: Check if goal is in the inputs
        if not ('goal' in inputs_map):
            logger.warning("Goal not found in inputs map")
            logger.info(f"Available keys: {list(inputs_map.keys())}")

        # Execute plugin
        plugin = AccomplishPlugin()
        results = plugin.execute(inputs_map)

        # Output results to stdout
        print(json.dumps(results))

    except Exception as e:
        logger.error(f"Main function error: {e}")
        error_result = [{
            "success": False,
            "name": "error",
            "resultType": PluginParameterType.ERROR,
            "resultDescription": "Plugin execution error",
            "result": {"logs": memory_handler.get_logs()},
            "error": str(e)
        }]
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()