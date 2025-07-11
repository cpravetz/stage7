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
    # Define required/optional inputs for specific verbs if known.
    # This helps validate the LLM's output against known plugin requirements.
    VERB_SCHEMAS = {
        'SEARCH': {'required': ['searchTerm'], 'optional': []},
        'SCRAPE': {'required': ['url'], 'optional': ['selector', 'attribute', 'limit' ]},
        'GET_USER_INPUT': {'required': ['question', 'answerType'], 'optional': ['choices']},
        'FILE_OPERATION': {'required': ['path', 'operation'], 'optional': ['content']},
        'DECIDE': {'required': ['condition', 'trueSteps', 'falseSteps'], 'optional': []},
        'WHILE': {'required': ['condition', 'steps'], 'optional': []},
        'UNTIL': {'required': ['condition', 'steps'], 'optional': []},
        'DELEGATE': {'required': ['subAgentGoal'], 'optional': ['subAgentRole', 'subAgentTasks']} # Added for DELEGATE example
    }

    ALLOWED_VALUE_TYPES = ['string', 'number', 'boolean', 'array', 'object', 'plan', 'plugin', 'any']

    def __init__(self):
        self.brain_url = os.getenv('BRAIN_URL', 'brain:5070')
        self.security_manager_url = os.getenv('SECURITY_MANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
    def get_internal_verb_requirements_for_prompt(self) -> str:
        """Generates a string listing required inputs for verbs defined in VERB_SCHEMAS."""
        lines = []
        for verb, schema in self.VERB_SCHEMAS.items():
            if schema.get('required'):
                lines.append(f"- For '{verb}': {', '.join(schema['required'])}")
        return "\n".join(lines) if lines else "No specific internal verb requirements overridden."

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

CRITICAL: Return ONLY valid JSON. No explanations, markdown, or additional text.

Output Decision Hierarchy:
1. DIRECT_ANSWER: If you can fully resolve the goal directly
2. PLUGIN: If the goal needs a new, single-purpose function
3. PLAN: If the goal requires multiple steps

For PLAN responses, return a JSON object with this exact structure:
{{"type": "PLAN", "plan": <array_of_steps>}}

Where <array_of_steps> must comply with this JSON schema:

{schema}

If a step needs no inputs, use empty inputs object: "inputs": {{}}
There must be a dependency object property for every input dependent on another steps output.

Available plugins: {available_plugins_str[:1000]}{"..." if len(available_plugins_str) > 1000 else ""}

PLANNING PRINCIPLES:
1. **Dependency-Driven**: Most steps should depend on outputs from previous steps
2. **Iterative Refinement**: Include steps that validate, refine, or improve earlier outputs
3. **Conditional Logic**: Use DECIDE, WHILE, UNTIL for plans that adapt based on outcomes
4. **Information Gathering**: Start with research/data collection before taking action
5. **Validation**: Include verification steps to ensure quality and accuracy

PLAN STRUCTURE GUIDELINES:
- Begin with information gathering and research
- Include analysis and validation steps
- Use intermediate steps to refine and improve outputs
- Add decision points where the plan might branch
- Include final review and quality assurance steps

STEP INTERDEPENDENCY:
- Each step should build upon previous steps' outputs
- Use outputName references to create chains of dependent tasks
- Avoid isolated steps that don't connect to the overall flow

CRITICAL INPUT/DEPENDENCY FORMAT:
When a step needs output from a previous step, use BOTH:
1. Input with outputName: {{"inputName": {{"outputName": "previousStepOutput", "valueType": "string"}}}}
2. Dependency entry: {{"dependencies": {{"previousStepOutput": stepNumber}}}}

EXAMPLE of correct step interdependency:
{{
  "number": 2,
  "actionVerb": "ANALYZE",
  "inputs": {{
    "data": {{"outputName": "searchResults", "valueType": "string"}}
  }},
  "dependencies": {{"searchResults": 1}},
  "outputs": {{"analysis": "Analysis of search results"}}
}}

CONTROL FLOW actionVerb USAGE:
- Use DECIDE when the plan should branch based on conditions
- Use WHILE for iterative improvement processes
- Use UNTIL for goal-seeking behaviors
- Use REPEAT for tasks that need multiple attempts
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

        # Remove common prefixes/suffixes
        prefixes_to_remove = [
            "Here's the plan:", "Here is the plan:", "Plan:", "Response:", "JSON:",
            "```json", "```", "The plan is:", "Here's a plan:", "Here is a plan:"
        ]

        for prefix in prefixes_to_remove:
            if cleaned_response.lower().startswith(prefix.lower()):
                cleaned_response = cleaned_response[len(prefix):].strip()

        # Remove trailing text after JSON
        suffixes_to_remove = ["```", "That's the plan", "This plan should", "The plan above"]
        for suffix in suffixes_to_remove:
            if suffix.lower() in cleaned_response.lower():
                idx = cleaned_response.lower().find(suffix.lower())
                cleaned_response = cleaned_response[:idx].strip()

        # Try parsing the cleaned response
        try:
            return json.loads(cleaned_response)
        except json.JSONDecodeError:
            pass

        logger.error(f"Failed to parse response with all strategies. Response: {response[:200]}...")
        return None

    def _report_plan_generation_success(self, brain_token: Optional[str], plan_steps: int, attempt_number: int) -> None:
        """Report successful plan generation to Brain service for model performance tracking"""
        try:
            if not brain_token:
                return

            # Calculate quality score based on plan characteristics
            quality_score = min(100, max(50, 70 + (plan_steps * 2) - (attempt_number * 5)))

            headers = {
                'Authorization': f'Bearer {brain_token}',
                'Content-Type': 'application/json'
            }

            feedback_data = {
                "type": "plan_generation_feedback",
                "success": True,
                "quality_score": quality_score,
                "plan_steps": plan_steps,
                "attempt_number": attempt_number,
                "feedback_scores": {
                    "relevance": quality_score / 100,
                    "accuracy": min(1.0, (plan_steps / 5) * 0.8),  # Better score for more detailed plans
                    "helpfulness": max(0.6, 1.0 - (attempt_number - 1) * 0.1),  # Lower score for more attempts
                    "creativity": min(1.0, plan_steps / 8),
                    "overall": quality_score / 100
                }
            }

            response = requests.post(
                f"http://{self.brain_url}/feedback",
                json=feedback_data,
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                logger.info(f"Successfully reported plan generation success to Brain (quality: {quality_score})")
            else:
                logger.warning(f"Failed to report plan generation success: {response.status_code}")

        except Exception as e:
            logger.warning(f"Error reporting plan generation success to Brain: {e}")

    def _report_plan_generation_failure(self, brain_token: Optional[str], error_type: str, attempt_number: int) -> None:
        """Report failed plan generation to Brain service for model performance tracking"""
        try:
            if not brain_token:
                return

            headers = {
                'Authorization': f'Bearer {brain_token}',
                'Content-Type': 'application/json'
            }

            feedback_data = {
                "type": "plan_generation_feedback",
                "success": False,
                "error_type": error_type,
                "attempt_number": attempt_number,
                "feedback_scores": {
                    "relevance": 0.1,
                    "accuracy": 0.1,
                    "helpfulness": 0.1,
                    "creativity": 0.1,
                    "overall": 0.1
                }
            }

            response = requests.post(
                f"http://{self.brain_url}/feedback",
                json=feedback_data,
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                logger.info(f"Successfully reported plan generation failure to Brain (error: {error_type})")
            else:
                logger.warning(f"Failed to report plan generation failure: {response.status_code}")

        except Exception as e:
            logger.warning(f"Error reporting plan generation failure to Brain: {e}")

    def _generate_simplified_prompt(self, goal: str, available_plugins_str: str, mission_context_str: str) -> str:
        """Generate a simplified prompt for retry attempts"""
        # Extract just the essential plugin verbs for a shorter prompt
        essential_plugins = ["SEARCH", "SCRAPE", "GET_USER_INPUT", "FILE_OPERATION", "THINK", "DELEGATE"]
        plugin_lines = []
        for line in available_plugins_str.split('\n'):
            if any(plugin in line for plugin in essential_plugins):
                plugin_lines.append(line[:100] + "..." if len(line) > 100 else line)

        simplified_plugins = '\n'.join(plugin_lines[:10])  # Limit to 10 plugins

        prompt = f"""
Goal: {goal}

Return valid JSON only. Choose one format:

1. PLAN (array of steps):
[{{"number": 1, "actionVerb": "SEARCH", "inputs": {{"searchTerm": {{"value": "job search platforms", "valueType": "string"}}}}, "description": "Search for job platforms", "outputs": {{"searchResults": "List of platforms"}}, "dependencies": [], "recommendedRole": "researcher"}}]

CRITICAL INPUT FORMAT: Each input MUST be an object with EXACTLY ONE of:
- For constants: {{"value": "your_value", "valueType": "string"}}
- For step outputs: {{"outputName": "previous_step_output", "valueType": "string"}}
NEVER use bare strings, empty objects {{}}, placeholder objects, or objects missing "value"/"outputName"!
If a step needs no inputs, use empty inputs object: "inputs": {{}}

2. DIRECT_ANSWER:
{{"type": "DIRECT_ANSWER", "answer": "your complete answer"}}

3. PLUGIN:
{{"type": "PLUGIN", "plugin": {{"id": "plugin-name", "verb": "VERB", "description": "brief description", "explanation": "detailed explanation of plugin functionality, parameters, and outputs", "inputDefinitions": []}}}}

Available actions: {simplified_plugins}

Roles: researcher, coordinator, executor, creative, critic, domain_expert

Context: {mission_context_str[:200]}{"..." if len(mission_context_str) > 200 else ""}
"""
        return prompt.strip()

    def _generate_input_schema_repair_prompt(self, goal: str, invalid_plan: list, validation_error: str) -> str:
        """Generate a focused repair prompt specifically for input schema compliance issues"""
        prompt = f"""
CRITICAL INPUT SCHEMA ERROR: {validation_error}

Fix this plan for goal: {goal}

The plan has input schema compliance issues. Each input MUST be an object with EXACTLY ONE of these formats:
- {{"value": "constant_string", "valueType": "string"}} for constant values
- {{"outputName": "step_output_name", "valueType": "string"}} for references to previous step outputs

NEVER use:
- Empty objects {{}}
- Objects with "placeholder" or similar meaningless keys
- Objects missing both "value" and "outputName"

If a step needs no inputs, use: "inputs": {{}}

Current plan (fix the input format):
{json.dumps(invalid_plan, indent=1)}

Return ONLY the corrected JSON array. Fix ALL input format errors. Remove any placeholder inputs.
"""
        return prompt.strip()

    def validate_plan_data(self, plan_data: List[Dict[str, Any]]) -> Optional[str]:
        """
        Validates the plan data from the LLM against the expected schema.
        Returns an error message string if validation fails, None otherwise.
        """
        if not isinstance(plan_data, list):
            logger.error("Invalid plan data: not a list.")
            return "Plan data is not a list."

        for i, step in enumerate(plan_data):
            if not isinstance(step, dict):
                logger.error(f"Invalid step at index {i}: not a JSON object. Step: {step}")
                return f"Step at index {i} is not a JSON object."

            # Auto-fix common issues
            # If 'actionVerb' is missing but 'verb' is present, copy it
            if 'actionVerb' not in step and 'verb' in step and isinstance(step['verb'], str) and step['verb'].strip():
                step['actionVerb'] = step['verb']
                logger.info(f"Auto-fixed: copied 'verb' to 'actionVerb' for step {i+1}")

            # Auto-fix missing number field
            if 'number' not in step:
                step['number'] = i + 1
                logger.info(f"Auto-fixed: added missing 'number' field for step {i+1}")

            # Auto-fix missing inputs field
            if 'inputs' not in step:
                step['inputs'] = {}
                logger.info(f"Auto-fixed: added missing 'inputs' field for step {i+1}")

            # Auto-fix missing dependencies field
            if 'dependencies' not in step:
                step['dependencies'] = {}
                logger.info(f"Auto-fixed: added missing 'dependencies' field for step {i+1}")

            # Auto-fix missing recommendedRole
            if 'recommendedRole' not in step or not isinstance(step['recommendedRole'], str) or not step['recommendedRole'].strip():
                step['recommendedRole'] = 'executor'  # Default role
                logger.info(f"Auto-fixed: set default 'recommendedRole' for step {i+1}")

            # Validate mandatory fields and their types
            if 'actionVerb' not in step or not isinstance(step['actionVerb'], str) or not step['actionVerb'].strip():
                logger.error(f"Invalid or missing 'actionVerb' for step at index {i}. Step: {step}")
                return f"Step {i+1}: Missing or invalid 'actionVerb'. Please provide a valid action verb."

            if 'number' not in step or not isinstance(step['number'], int) or step['number'] <= 0:
                logger.error(f"Invalid or missing 'number' for step at index {i}. Step: {step}")
                return f"Step {i+1}: Missing or invalid 'number'. Please provide a positive integer."

            if 'description' not in step or not isinstance(step['description'], str) or not step['description'].strip():
                logger.error(f"Invalid or missing 'description' for step at index {i}. Step: {step}")
                return f"Step {i+1}: Missing or invalid 'description'. Please provide a clear description of what this step does."

            # Validate 'inputs'
            inputs_dict = step.get('inputs')
            if not isinstance(inputs_dict, dict):
                return f"Step {i+1} has invalid 'inputs' field. Must be a JSON object."
            
            actionVerb = step['actionVerb'] # Use the validated verb
            for input_name, input_value_obj in inputs_dict.items():
                if not isinstance(input_value_obj, dict):
                    return f"Step {i+1} input '{input_name}' is not an object. Expected {{'value': '...'}} or {{'outputName': '...'}}."

                # Validate presence of 'valueType'
                if 'valueType' not in input_value_obj:
                    input_value_obj['valueType'] = PluginParameterType.ANY
                if input_value_obj['valueType'] not in self.ALLOWED_VALUE_TYPES:
                    input_value_obj['valueType'] = PluginParameterType.ANY
                
                if 'inputName' in input_value_obj:
                    input_value_obj['outputName'] = input_value_obj['inputName']
                    del input_value_obj['inputName']

                has_value = 'value' in input_value_obj
                has_output_key = 'outputName' in input_value_obj

                # Auto-fix common input schema issues
                if not (has_value ^ has_output_key): # Exactly one of 'value' or 'outputName' must be present
                    # Try to auto-fix common cases
                    if not has_value and not has_output_key:
                        # Check for placeholder or empty objects
                        if input_name in ['placeholder', 'empty', 'none']:
                            logger.info(f"Auto-fixing placeholder input '{input_name}' in step {i+1}: removing it")
                            del inputs_dict[input_name]
                            continue
                        else:
                            return f"Step {i+1} input '{input_name}' has neither a 'value' nor 'outputName' property. It must contain one or the other property with a string value."
                    elif has_value and has_output_key:
                        # Both present - remove outputName and keep value
                        logger.info(f"Auto-fixing input '{input_name}' in step {i+1}: removing outputName, keeping value")
                        del input_value_obj['outputName']

                # Auto-fix incorrect step references in value field
                if has_value and isinstance(input_value_obj['value'], str):
                    value_str = input_value_obj['value'].lower()
                    # Detect patterns like "output from step1", "output from step 1", "step1", etc.
                    import re
                    step_ref_pattern = r'(?:output\s+from\s+)?step\s*(\d+)'
                    match = re.search(step_ref_pattern, value_str)
                    if match:
                        source_step_no = int(match.group(1))
                        if source_step_no < i + 1:  # Valid previous step
                            # Find what output this step produces that matches the input name
                            if source_step_no <= len(plan_data):
                                source_step = plan_data[source_step_no - 1]
                                source_outputs = source_step.get('outputs', {})

                                # Try to find matching output name
                                output_name = None
                                if input_name in source_outputs:
                                    output_name = input_name
                                elif len(source_outputs) == 1:
                                    # If source step has only one output, use that
                                    output_name = list(source_outputs.keys())[0]

                                if output_name:
                                    # Convert to proper outputName reference
                                    del input_value_obj['value']
                                    input_value_obj['outputName'] = output_name

                                    # Add to dependencies
                                    if 'dependencies' not in step:
                                        step['dependencies'] = {}
                                    step['dependencies'][output_name] = source_step_no

                                    logger.info(f"Auto-fixed step {i+1} input '{input_name}': converted step reference to outputName='{output_name}', added dependency")
                                    has_value = False
                                    has_output_key = True

            # Validate required inputs based on VERB_SCHEMAS
            if actionVerb in self.VERB_SCHEMAS:
                schema = self.VERB_SCHEMAS[actionVerb]
                for required_input_name in schema.get('required', []):
                    if required_input_name not in inputs_dict:
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) missing required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
                    # Further check if the required input's value/outputName is truly present/non-empty
                    input_val_obj = inputs_dict[required_input_name]
                    if 'value' in input_val_obj and (input_val_obj['value'] is None or (isinstance(input_val_obj['value'], str) and not input_val_obj['value'].strip())):
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) has empty or null 'value' for required input '{required_input_name}'."
                        logger.error(msg)
                        return msg
                    if 'outputName' in input_val_obj and (input_val_obj['outputName'] is None or (isinstance(input_val_obj['outputName'], str) and not input_val_obj['outputName'].strip())):
                        msg = f"Plan generation failed: LLM output for verb '{actionVerb}' (step {i+1}) has empty or null 'outputName' for required input '{required_input_name}'."
                        logger.error(msg)
                        return msg

            # Validate 'dependencies' - should be a dict with {outputName: stepNo, ...}
            dependencies = step.get('dependencies', {}) # Default to empty dict
            if not isinstance(dependencies, dict):
                return f"Step {i+1} has invalid 'dependencies' field. Must be an object with outputName: stepNumber pairs."

            # Validate each dependency
            for dep_output_key, dep_step_number in dependencies.items():
                if not isinstance(dep_output_key, str) or not dep_output_key.strip():
                    return f"Step {i+1} has invalid dependency key '{dep_output_key}'. Must be a non-empty string."
                if not isinstance(dep_step_number, int) or dep_step_number <= 0:
                    return f"Step {i+1} has invalid dependency step number for output '{dep_output_key}'. Must be a positive integer."
                if dep_step_number >= i + 1:  # Can't depend on current or future steps
                    return f"Step {i+1} has invalid dependency: step {dep_step_number} for output '{dep_output_key}'. Dependencies must reference previous steps only."

                # Verify the referenced step actually produces this output
                if dep_step_number <= len(plan_data):
                    referenced_step = plan_data[dep_step_number - 1]  # Convert to 0-based index
                    step_outputs = referenced_step.get('outputs', {})
                    if dep_output_key not in step_outputs:
                        return f"Step {i+1} has dependency on output '{dep_output_key}' from step {dep_step_number}, but step {dep_step_number} does not produce this output."

            # Validate 'outputs'
            outputs = step.get('outputs')
            if not isinstance(outputs, dict) or not outputs: # Must be a non-empty dictionary
                return f"Step {i+1} has invalid or empty 'outputs' field. Must be a non-empty dictionary."
            for output_key, output_desc in outputs.items():
                if not isinstance(output_key, str) or not output_key.strip():
                    return f"Step {i+1} has invalid output key '{output_key}'. Must be a non-empty string."
                if not isinstance(output_desc, str) or not output_desc.strip():
                    return f"Step {i+1} has invalid output description for '{output_key}'. Must be a non-empty string."

        return None # All good

    def convert_json_to_tasks(self, json_plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert JSON plan to task format. Assumes detailed validation has passed."""
        try:
            tasks = []
            for step in json_plan:
                # The new implementation will pass the `inputs` from the language model's plan directly through,
                # as the downstream `createFromPlan` function is responsible for processing this structure.
                task = {
                    "actionVerb": step['actionVerb'],
                    "inputReferences": step.get('inputs', {}),  # Pass inputs directly
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



    def auto_repair_plan(self, goal: str, available_plugins_str: str, mission_context_str: str, invalid_plan: list, validation_error: str, brain_token: Optional[str] = None) -> Optional[list]:
        """
        Ask the Brain to revise the invalid plan to correct the validation error.
        Uses specialized repair prompts based on error type.
        """
        logger.info('Auto-repairing plan with focused prompt...')

        # Check if this is an input schema compliance issue
        is_input_schema_error = any(phrase in validation_error.lower() for phrase in [
            "input", "not an object", "value", "outputname", "expected {'value':", "expected {'outputname':"
        ])

        if is_input_schema_error:
            logger.info("Detected input schema compliance issue, using specialized repair prompt")
            repair_prompt = self._generate_input_schema_repair_prompt(goal, invalid_plan, validation_error)
        else:
            # Create a general focused repair prompt
            repair_prompt = f"""
Fix this plan for goal: {goal}

Error: {validation_error}

Current plan (fix the error):
{json.dumps(invalid_plan, indent=1)}

Return only the corrected JSON array. Each step needs:
- number (integer)
- actionVerb (string)
- inputs (object, can be empty {{}})
- description (string)
- outputs (object with at least one key)
- dependencies (array, can be empty [])
- recommendedRole (string: researcher/coordinator/executor/creative/critic/domain_expert)

Fix the specific error mentioned above and return valid JSON only.
"""

        response = self.query_brain(repair_prompt, brain_token)
        if not response:
            logger.error("Auto-repair failed: no response from Brain")
            return None

        try:
            # Try to parse the response
            parsed = json.loads(response)
            if isinstance(parsed, list):
                logger.info(f"Auto-repair successful: returned {len(parsed)} steps")
                return parsed
            elif isinstance(parsed, dict):
                # Handle wrapped responses
                if "items" in parsed and isinstance(parsed["items"], list):
                    return parsed["items"]
                elif "plan" in parsed and isinstance(parsed["plan"], list):
                    return parsed["plan"]
                elif "value" in parsed and isinstance(parsed["value"], list):
                    return parsed["value"]
                elif "steps" in parsed and isinstance(parsed["steps"], list):
                    return parsed["steps"]
                elif "result" in parsed and isinstance(parsed["result"], list):
                    return parsed["result"]
                # Check if the dict itself looks like a single step and wrap it in a list
                elif "number" in parsed and "actionVerb" in parsed:
                    logger.info("Auto-repair returned single step, wrapping in array")
                    return [parsed]
                # Look for any list value in the dict
                else:
                    for key, value in parsed.items():
                        if isinstance(value, list) and len(value) > 0:
                            logger.info(f"Auto-repair found list in '{key}' property, using it")
                            return value

            logger.error(f"Auto-repair failed: unexpected response format: {type(parsed)}")
            logger.error(f"Response content: {str(parsed)[:500]}...")
            return None

        except json.JSONDecodeError as e:
            logger.error(f"Auto-repair failed: invalid JSON response: {e}")
            logger.error(f"Response was: {response[:500]}...")
            return None
        except Exception as e:
            logger.error(f"Auto-repair failed with unexpected error: {e}")
            return None

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

                        validation_error_message = self.validate_plan_data(plan_data)
                        repair_attempts = 0
                        max_repair_attempts = 2 # Reduced from 3 to 2

                        while validation_error_message and repair_attempts < max_repair_attempts:
                            logger.warning(f"Plan validation failed: {validation_error_message}. Attempting auto-repair (repair attempt {repair_attempts+1}).")

                            # Use simplified repair approach
                            repaired_plan = self.auto_repair_plan(goal, available_plugins_str, mission_context_str, plan_data, validation_error_message, brain_token)
                            if not repaired_plan:
                                logger.error("Auto-repair failed to produce a new plan.")
                                break
                            plan_data = repaired_plan
                            validation_error_message = self.validate_plan_data(plan_data)
                            repair_attempts += 1

                        if validation_error_message:
                            return [{
                                "success": False, "name": "plan_validation_error", "resultType": PluginParameterType.ERROR,
                                "resultDescription": validation_error_message, "result": {"logs": memory_handler.get_logs()},
                                "error": validation_error_message
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
