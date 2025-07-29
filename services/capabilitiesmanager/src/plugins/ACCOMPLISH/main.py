#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Clean Implementation

Follows the exact design requirements:
1. Confirm required inputs are provided
2. Assemble a prompt from the inputs (and internal prompt constants)
3. Send the prompt to the Brain for processing
4. Confirm the response is one of (PLAN, PLUGIN, DIRECT_ANSWER)
5. Confirm the response matches the schema for that response type
6. If it does, return it
7. If it does not but we can fix the error, fix it
8. If it does, but we cannot fix the error, ask the Brain to do it
9. Return to step 5
"""

import json
import sys
import logging
import requests
from typing import Dict, Any, List, Optional

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
                "description": "Reference to an output from a previous step at the same level or higher"
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
        "description": "Expected outputs from this step, for control flow, should match the final outputs of the sub-plan(s)"
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
        "description": "Object mapping outputNames to the step number that produces each. Only one source per outputName. Format: {{outputName: stepNumber, ...}}"
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


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AccomplishPlugin:
    def __init__(self):
        self.max_retries = 3
        self.timeout = 90  # Increased to 90 seconds for Brain calls
        
    def execute(self, inputs_str: str) -> str:
        """Main execution method"""
        try:
            # Step 1: Confirm required inputs are provided
            inputs = self._parse_and_validate_inputs(inputs_str)
            
            # Step 2: Assemble a prompt from the inputs
            prompt = self._assemble_prompt(inputs)
            
            # Step 3-9: Send to Brain and handle response
            result = self._process_with_brain(prompt, inputs)
            
            # For PLAN responses, return just the plan array as the result value
            # This matches what CapabilitiesManager expects for plan extraction
            if isinstance(result, dict) and result.get("type") == "PLAN" and "plan" in result:
                plan_result = result["plan"]  # Extract just the plan array
            else:
                plan_result = result  # For non-plan results, return the full result object

            return json.dumps([{
                "success": True,
                "name": "plan",
                "resultType": "plan",
                "resultDescription": f"A plan to: {inputs['goal']['value']}",
                "result": plan_result,  # This will be the plan array directly
                "mimeType": "application/json"
            }])
            
        except Exception as e:
            logger.error(f"ACCOMPLISH plugin failed: {e}")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Failed to create plan: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])
    
    def _parse_and_validate_inputs(self, inputs_str: str) -> Dict[str, Any]:
        """Step 1: Parse and validate required inputs"""
        try:
            inputs_list = json.loads(inputs_str)
            inputs = {item[0]: item[1] for item in inputs_list}
            
            # Validate required inputs
            if 'goal' not in inputs:
                raise ValueError("Required input 'goal' not provided")

            # Handle both string and dict formats for goal value
            goal_input = inputs['goal']
            if isinstance(goal_input, dict):
                goal_value = goal_input.get('value', '')
            else:
                goal_value = str(goal_input)

            # Ensure goal_value is a string before calling strip()
            if not isinstance(goal_value, str):
                goal_value = str(goal_value)

            goal_value = goal_value.strip()
            if not goal_value:
                raise ValueError("Goal cannot be empty")

            # Note: verbToAvoid parameter is no longer used as circular references are allowed
            logger.info(f"Validated inputs: goal='{goal_value[:50]}...'")
            return inputs
            
        except Exception as e:
            raise ValueError(f"Invalid inputs: {e}")
    
    def _assemble_prompt(self, inputs: Dict[str, Any]) -> str:
        """Step 2: Assemble prompt from inputs and constants"""
        goal = inputs['goal']['value']
        available_plugins = inputs.get('available_plugins', {}).get('value', '')

        # Note: verbToAvoid parameter is no longer used for circular reference detection
        # as nesting of actionVerbs is legitimate and proper
        
        prompt = f"""
Your task is to decide on the best way to achieve the goal: '{goal}' and provide a response in one of the JSON formats below.

CRITICAL JSON REQUIREMENTS:
- Return ONLY valid JSON - no explanations, markdown, code blocks, or additional text
- Do NOT wrap your response in ```json``` blocks or any markdown formatting
- Do NOT include "### ANALYSIS:" or "### RECOMMENDATIONS:" or any other text
- Start your response immediately with {{ and end with }}
- Your entire response must be parseable as JSON

- **DO NOT** create a plan that just uses 'THINK'.
- **INSTEAD**, create a plan that uses plugins like 'ASK_USER_QUESTION' (to ask for a file path), 'FILE_OPERATION' (to read the file), 'SCRAPE' (to get web content), etc.
- Your plan should *perform* the action, not just think about it.
- Take any part of the prompt and use it as a input value in your plan.
- To get a file from the user, use 'ASK_USER_QUESTION' with an 'answerType' of 'file'. The plugin will pause and wait for the user to upload a file, then return a file ID. This file ID can then be used by other plugins like 'FILE_OPERATION'.

CRITICAL PLUGIN REQUIREMENTS:
- FILE_OPERATION ALWAYS requires "operation" input with value "read", "write", or "append"
- For FILE_OPERATION read: use "fileId" input (from file uploads)
- For FILE_OPERATION write/append: use "content" input (text to write) and "path" input (file path)
- ASK_USER_QUESTION ALWAYS requires "question" input, not "prompt" input, and should include "answerType" input

CRITICAL ERRORS TO AVOID:
- Do NOT omit "description" fields - every step needs a thorough description
- Do NOT omit "number" fields - steps must be numbered sequentially starting from 1
- Do NOT create circular dependencies - step N cannot depend on step N+1 or later
- Do NOT create steps that depend on non-existent outputs from previous steps
- Do NOT use tuple format for outputs - use object format only
- Do NOT forget "answerType": {{"value": "string", "valueType": "string"}} for ASK_USER_QUESTION

FORBIDDEN PATTERNS - NEVER USE THESE:
- Do NOT use FILE_OPERATION with 'fileId' input for writing content - use 'content' input instead
- Do NOT reference text content as file IDs - file IDs come from file uploads only
- Do NOT create overly complex conditional workflows - prefer linear plans when possible

IF_THEN USAGE RULES (use sparingly):
- IF_THEN steps should have simple conditions and minimal nested steps
- trueSteps and falseSteps should be arrays of complete step objects with proper numbering
- Steps inside trueSteps/falseSteps cannot be referenced by later steps outside the conditional
- Prefer linear plans over conditional logic when possible

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

CRITICAL: You have the following tools available. You MUST use the exact 'actionVerb' and the exact input 'name' as defined in the JSON schema for each tool. Do NOT invent new input names.

--- AVAILABLE TOOLS SCHEMA ---
{available_plugins}
--- END AVAILABLE TOOLS SCHEMA ---


Available plugins: {available_plugins}

PLANNING PRINCIPLES:
1. **Reuse existing plugins**: If a plugin or actionVerb already exists to perform a step in the plan, use it instead of creating a new one
2. **Dependency-Driven**: Most steps should depend on outputs from previous steps
3. **Over Explain**: Make descriptions and explanations very thorough
4. **DELEGATE Usage**: ONLY use DELEGATE for truly independent work streams that require separate agent management (e.g., parallel research tracks, independent validation processes). Do NOT use DELEGATE for simple task breakdown - use specific plugins or sub-plans instead.

CRITICAL INPUT/DEPENDENCY FORMAT:
When a step needs output from a previous step, use BOTH:
1. Input with outputName: {{"inputName": {{"outputName": "previousStepOutput", "valueType": "string"}}}}
2. Dependency entry: {{"dependencies": {{"previousStepOutput": stepNumber}}}}

EXECUTION REQUIREMENTS:
- Each step must have all required inputs either as direct values or dependencies
- Final steps should produce concrete deliverables satisfying the goal

CONTROL FLOW actionVerb USAGE:
- Use IF_THEN when the plan should branch based on conditions
- Use WHILE for iterative processes
- Use UNTIL for goal-seeking behaviors
- Use REPEAT for tasks that need multiple attempts

Control Flow actionVerbs require an Input with a set of steps (two for IF_THEN) that must conform to the plan schema and be declared a type "plan"

AGENT ROLES - Choose the most appropriate role for each step:

1. **coordinator**: Orchestrates activities, manages task allocation, breaks down complex goals into manageable tasks, delegates to specialized agents, monitors progress, resolves conflicts. Use for: planning steps, delegation steps, progress monitoring, conflict resolution.

2. **researcher**: Gathers, analyzes, and synthesizes information from various sources. Evaluates credibility and relevance of sources, identifies patterns and insights. Use for: information gathering, data analysis, web scraping, research tasks, fact-finding.

3. **creative**: Generates creative ideas, content, and solutions. Creates engaging content in various formats, develops innovative solutions, crafts compelling narratives. Use for: content creation, idea generation, writing, design, storytelling, brainstorming.

4. **critic**: Evaluates ideas, plans, and content. Identifies potential issues and risks, assesses quality and effectiveness, provides constructive feedback. Use for: review steps, quality assessment, validation, testing, feedback provision.

5. **executor**: Implements plans and executes tasks with precision and reliability. Follows established processes, pays attention to details, ensures quality and accuracy. Use for: implementation steps, file operations, API calls, data processing, routine tasks.

6. **domain_expert**: Provides specialized knowledge and expertise in specific fields. Analyzes domain-specific problems, offers expert advice and recommendations. Use for: technical analysis, specialized knowledge application, expert consultation, complex problem solving.

7. **coder**: Develops, tests, and maintains software and code. Writes clean, efficient, and well-documented

2. DIRECT_ANSWER format:
{{"type": "DIRECT_ANSWER", "answer": "your answer"}}

3. PLUGIN format:
{{"type": "PLUGIN", "plugin": {{"id": "plugin-name", "actionVerb": "VERB", "description": "...", "explanation": "...", "inputDefinitions": []}}}}

FINAL REMINDER: Your response must start with {{ and end with }}. No other text allowed."""

        return prompt
    
    def _process_with_brain(self, prompt: str, inputs: Dict[str, Any]) -> Any:
        """Steps 3-9: Process with Brain and handle response"""
        brain_token = inputs.get('__brain_auth_token', {}).get('value', '')
        brain_url = inputs.get('brain_url', {}).get('value', 'brain:5070')
        
        for attempt in range(self.max_retries):
            try:
                try:
                    # Step 3: Send prompt to Brain
                    response = self._call_brain(prompt, brain_token, brain_url)
                    
                    # Step 4: Confirm response type
                    response_type = self._identify_response_type(response)
                    
                    # Step 5: Validate schema
                    validation_result = self._validate_response_schema(response, response_type)

                    if validation_result['valid']:
                        # Step 6: Return valid response
                        return response
                    
                    # Step 7: Try to fix error
                    fixed_response = self._try_fix_error(response, validation_result['error'])
                    if fixed_response:
                        return fixed_response
                    
                    # Step 8: Ask Brain to fix it
                    prompt = self._create_repair_prompt(response, validation_result['error'])
                    logger.warning(f"Attempt {attempt + 1}: Asking Brain to fix error: {validation_result['error']}")
                except requests.exceptions.RequestException as http_error:
                    raise Exception(f"HTTP Error calling Brain: {http_error}")
                
            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
        
        raise Exception("Failed to get valid response after all retries")
    
    def _call_brain(self, prompt: str, token: str, brain_url: str) -> Dict[str, Any]:
        """Call Brain service"""
        url = f"http://{brain_url}/chat"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        }
        data = {
            'exchanges': [{'role': 'user', 'content': prompt}],
            'optimization': 'accuracy',
            'conversationType': 'TextToCode'
        }

        logger.info(f"Calling Brain at {url}")
        response = requests.post(url, json=data, headers=headers, timeout=self.timeout)
        response.raise_for_status()

        brain_response = response.json()
        result_text = brain_response.get('result', '')

        logger.info(f"Brain response result (first 200 chars): {result_text[:200]}...")

        if not result_text:
            raise ValueError("Brain returned empty result")

        try:
            parsed_result = json.loads(result_text)
            logger.info(f"Successfully parsed Brain result. Type: {type(parsed_result)}")
            return parsed_result
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Brain result as JSON: {e}")
            logger.error(f"Raw result: {result_text}")
            raise ValueError(f"Brain returned invalid JSON: {e}")
    
    def _identify_response_type(self, response: Dict[str, Any]) -> str:
        """Step 4: Identify response type"""
        if not isinstance(response, dict):
            raise ValueError(f"Response is not a JSON object, got: {type(response)}")

        response_type = response.get('type', '')

        # Handle case where Brain returns a step object instead of plan wrapper
        if not response_type:
            # Check if this looks like a step object (has actionVerb, number, etc.)
            if ('actionVerb' in response and 'number' in response and
                'description' in response and 'outputs' in response):
                logger.info("Brain returned step object instead of plan wrapper, auto-wrapping as PLAN")
                # Auto-wrap the step in a plan structure
                wrapped_response = {
                    "type": "PLAN",
                    "plan": [response]
                }
                # Replace the original response with the wrapped version
                response.clear()
                response.update(wrapped_response)
                return "PLAN"
            else:
                raise ValueError(f"Response missing 'type' field. Response keys: {list(response.keys())}")

        response_type = response_type.upper()
        if response_type not in ['PLAN', 'DIRECT_ANSWER', 'PLUGIN']:
            raise ValueError(f"Invalid response type: '{response_type}'. Must be one of: PLAN, DIRECT_ANSWER, PLUGIN")

        return response_type
    
    def _validate_response_schema(self, response: Dict[str, Any], response_type: str) -> Dict[str, Any]:
        """Step 5: Validate response schema"""
        try:
            if response_type == 'PLAN':
                return self._validate_plan_schema(response)
            elif response_type == 'DIRECT_ANSWER':
                return self._validate_direct_answer_schema(response)
            elif response_type == 'PLUGIN':
                return self._validate_plugin_schema(response)
            else:
                return {'valid': False, 'error': f'Unknown response type: {response_type}'}
        except Exception as e:
            return {'valid': False, 'error': str(e)}
    
    def _validate_plan_schema(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Validate PLAN response schema"""
        if 'plan' not in response:
            return {'valid': False, 'error': 'PLAN response missing "plan" field'}
        
        plan = response['plan']
        if not isinstance(plan, list) or len(plan) == 0:
            return {'valid': False, 'error': 'Plan must be a non-empty array'}
        
        for i, step in enumerate(plan):
            step_num = i + 1
            required_fields = ['actionVerb', 'description']
            
            for field in required_fields:
                if field not in step:
                    return {'valid': False, 'error': f'Step {step_num} missing required field: {field}'}
            
            # Auto-fix inputs format - convert simple strings to proper objects
            if 'inputs' in step and step['inputs']:
                for input_name, input_value in step['inputs'].items():
                    if not isinstance(input_value, dict):
                        # Simple string/value - convert to proper format with 'value' property
                        logger.info(f"Auto-fixing input '{input_name}': '{input_value}' -> {{'value': '{input_value}', 'valueType': 'string'}}")
                        step['inputs'][input_name] = {'value': str(input_value), 'valueType': 'string'}
                    elif 'value' not in input_value and 'outputName' not in input_value:
                        # Dict but missing both required properties - convert to value format
                        logger.info(f"Auto-fixing malformed input '{input_name}': {input_value}")
                        step['inputs'][input_name] = {'value': str(input_value), 'valueType': 'string'}
                    elif isinstance(input_value, dict) and ('value' in input_value or 'outputName' in input_value):
                        # Valid format - ensure valueType exists
                        if 'valueType' not in input_value:
                            input_value['valueType'] = 'string'
                            logger.info(f"Auto-fixing missing valueType for '{input_name}'")
                    # Note: If it has outputName, it's referencing a previous step output - keep as is
        
        return {'valid': True}
    
    def _validate_direct_answer_schema(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Validate DIRECT_ANSWER response schema"""
        if 'answer' not in response:
            return {'valid': False, 'error': 'DIRECT_ANSWER response missing "answer" field'}
        return {'valid': True}
    
    def _validate_plugin_schema(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Validate PLUGIN response schema"""
        if 'plugin' not in response:
            return {'valid': False, 'error': 'PLUGIN response missing "plugin" field'}
        
        plugin = response['plugin']
        required_fields = ['id', 'verb', 'description']
        for field in required_fields:
            if field not in plugin:
                return {'valid': False, 'error': f'Plugin missing required field: {field}'}
        
        return {'valid': True}

    # Circular reference validation methods removed as nesting of actionVerbs is legitimate

    def _try_fix_error(self, response: Dict[str, Any], error: str) -> Optional[Dict[str, Any]]:
        """Step 7: Try to fix simple errors automatically"""
        try:
            if response.get('type') == 'PLAN' and 'plan' in response:
                plan = response['plan']
                fixed = False

                for step in plan:
                    if 'inputs' in step and step['inputs']:
                        for input_name, input_value in step['inputs'].items():
                            # Fix simple string inputs (convert to value format)
                            if not isinstance(input_value, dict):
                                logger.info(f"Auto-fixing simple input '{input_name}': '{input_value}'")
                                step['inputs'][input_name] = {'value': str(input_value), 'valueType': 'string'}
                                fixed = True
                            elif isinstance(input_value, dict):
                                # Check if it has either value OR outputName
                                if 'value' not in input_value and 'outputName' not in input_value:
                                    # Missing both - convert to value format
                                    logger.info(f"Auto-fixing malformed input '{input_name}': {input_value}")
                                    step['inputs'][input_name] = {'value': str(input_value), 'valueType': 'string'}
                                    fixed = True
                                elif 'valueType' not in input_value:
                                    # Has value or outputName but missing valueType
                                    input_value['valueType'] = 'string'
                                    logger.info(f"Auto-fixing missing valueType for '{input_name}'")
                                    fixed = True

                if fixed:
                    logger.info("Successfully auto-fixed input format issues")
                    return response

            return None
        except Exception as e:
            logger.error(f"Error in auto-fix: {e}")
            return None
    
    def _create_repair_prompt(self, response: Dict[str, Any], error: str) -> str:
        """Step 8: Create prompt asking Brain to fix the error"""

        # Create specific repair instructions based on error type
        specific_instructions = ""

        if "input" in error.lower() and "format" in error.lower():
            specific_instructions = """
CRITICAL INPUT FORMAT FIX NEEDED:
All inputs must be objects with EITHER 'value' OR 'outputName' property, plus 'valueType'.

For constant values:
WRONG: "answerType": "number"
RIGHT: "answerType": {"value": "number", "valueType": "string"}

WRONG: "question": "What is your name?"
RIGHT: "question": {"value": "What is your name?", "valueType": "string"}

For ASK_USER_QUESTION with file upload, do not nest inputs:
CORRECT: "answerType": {"value": "file", "valueType": "string"}
CORRECT: "question": {"value": "Please upload your resume", "valueType": "string"}

For references to previous step outputs:
RIGHT: "inputName": {"outputName": "previousStepOutput", "valueType": "string"}

Fix ALL inputs in ALL steps to use one of these formats."""

        elif "missing" in error.lower() and "field" in error.lower():
            specific_instructions = """
MISSING FIELD FIX NEEDED:
Ensure all steps have required fields: actionVerb, description, inputs, outputs."""

        else:
            specific_instructions = f"""
ERROR TO FIX: {error}
Please correct this specific issue."""

        return f"""The previous response had a validation error that must be fixed.

ERROR: {error}

{specific_instructions}

Previous response:
{json.dumps(response, indent=2)}

Return the CORRECTED JSON response with the error fixed. Maintain the same structure but fix the specific issue identified above."""

# Main execution
if __name__ == "__main__":
    plugin = AccomplishPlugin()
    inputs_str = sys.stdin.read().strip()
    result = plugin.execute(inputs_str)
    print(result)
