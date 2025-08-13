#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Streamlined Version
Handles mission planning and novel action verbs with LLM-driven approach
"""

import json
import logging
import time
import requests
import re
from typing import Dict, Any, List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

class ProgressTracker:
    def __init__(self):
        self.start_time = time.time()
        self.checkpoints = []

    def checkpoint(self, name: str):
        elapsed = time.time() - self.start_time
        self.checkpoints.append((name, elapsed))
        logger.info(f"CHECKPOINT: {name} at {elapsed:.2f}s")

progress = ProgressTracker()

class AccomplishError(Exception):
    """Custom exception for ACCOMPLISH plugin errors"""
    def __init__(self, message: str, error_type: str = "general_error"):
        super().__init__(message)
        self.error_type = error_type

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs"""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise AccomplishError("No authentication token found", "auth_error")

def call_brain(prompt: str, inputs: Dict[str, Any], response_type: str = "json") -> str:
    """Call Brain service with proper authentication and conversation type"""
    progress.checkpoint("brain_call_start")

    try:
        auth_token = get_auth_token(inputs)
        brain_url = inputs.get('brain_url', {}).get('value', 'brain:5070')

        # Set conversation type and system message based on response type
        if response_type == 'json':
            conversation_type = "TextToJSON"
            system_message = (
                "You are a planning assistant. Generate actionable plans as JSON arrays. "
                "Each step must match the provided schema precisely"
                "Return ONLY valid JSON, no other text."
            )
        else:
            conversation_type = "TextToText"
            system_message = "You are a planning assistant."

        payload = {
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "conversationType": conversation_type,
            "temperature": 0.1
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {auth_token}'
        }

        logger.info(f"Calling Brain at: http://{brain_url}/chat (type: {conversation_type})")
        response = requests.post(
            f"http://{brain_url}/chat",
            json=payload,
            headers=headers,
            timeout=60  # Reduced timeout to 60 seconds
        )

        if response.status_code != 200:
            raise AccomplishError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'result' not in result:
            raise AccomplishError("Brain response missing result", "brain_response_error")

        progress.checkpoint("brain_call_success")
        return result['result']

    except Exception as e:
        progress.checkpoint("brain_call_failed")
        logger.error(f"Brain call failed: {e}")
        raise AccomplishError(f"Brain service call failed: {e}", "brain_error")

def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and validate inputs"""
    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        
        # Parse the input string as a list of [key, value] pairs
        input_list = json.loads(inputs_str)
        
        # Convert to dictionary
        inputs = {}
        for item in input_list:
            if isinstance(item, list) and len(item) == 2:
                key, value = item
                inputs[key] = value
            else:
                logger.warning(f"Skipping invalid input item: {item}")
        
        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
        
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise AccomplishError(f"Input validation failed: {e}", "input_error")

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
                    "outputName": {
                        "type": "string",
                        "description": "Reference to an output from a previous step at the same level or higher"
                    },
                    "valueType": {
                        "type": "string",
                        "enum": ["string", "number", "boolean", "array", "object", "plan", "plugin", "any"],
                        "description": "The expected type of the input value"
                    },
                    "args": {
                        "type": "object",
                        "description": "Additional arguments for the input"
                    }
                },
                "required": ["valueType"],
                "oneOf": [
                    {"required": ["value"]},
                    {"required": ["outputName"]
                }],
                "additionalProperties": False,
                "description": "Thorough description of what this step does and context needed to understand it"
            },
            "additionalProperties": False
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
        "dependencies": {
            "type": "object",
            "patternProperties": {
                "^[a-zA-Z][a-zA-Z0-9_]*$": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Step number that produces the output for the input with this name"
                }
            },
            "additionalProperties": False,
            "description": "Object mapping outputNames to the step number that produces each. Only one source per outputName. Format: {{outputName: stepNumber, ...}}"
        },
        "recommendedRole": {
            "type": "string",
            "description": "Suggested role type for the agent executing this step. Allowed values are Coordinator, Researcher, Coder, Creative, Critic, Executor, and Domain Expert "
        }
    },
    "required": ["number", "actionVerb", "inputs", "description", "outputs", "dependencies"],
    "additionalProperties": False
    }
}

class RobustMissionPlanner:
    """Streamlined LLM-driven mission planner"""
    
    def __init__(self):
        self.max_retries = 3
        self.max_llm_switches = 2
    
    def plan(self, inputs: Dict[str, Any]) -> str:
        """Main interface method - create plan and return as JSON string"""
        goal = inputs.get('goal', {}).get('value', '')
        if not goal:
            raise AccomplishError("Missing required 'goal' input", "input_error")
        
        plan = self.create_plan(goal, inputs)

        # Wrap the plan in the expected PluginOutput format
        plugin_output = {
            "success": True,
            "name": "plan",
            "resultType": "plan",
            "resultDescription": f"A plan to: {goal[:100]}{'...' if len(goal) > 100 else ''}",
            "result": plan,
            "mimeType": "application/json"
        }

        return json.dumps([plugin_output], indent=2)

    def _create_detailed_plugin_guidance(self, inputs: Dict[str, Any]) -> str:
        """Create a detailed list of available plugins with input specs and descriptions."""
        available_plugins = inputs.get('availablePlugins', [])
        if not available_plugins:
            return "No plugins are available for use in the plan."

        guidance_lines = ["Available Plugins & Input Specifications:"]
        for plugin in available_plugins:
            action_verb = plugin.get('actionVerb', 'UNKNOWN')
            description = plugin.get('description', 'No description available.')
            input_definitions = plugin.get('inputDefinitions', [])
            input_guidance = plugin.get('inputGuidance', '')

            guidance_lines.append(f"\nPlugin: {action_verb}")
            guidance_lines.append(f"  Description: {description}")
            if input_definitions:
                guidance_lines.append("  Inputs:")
                for input_def in input_definitions:
                    input_name = input_def.get('name', 'UNKNOWN')
                    input_desc = input_def.get('description', 'No description.')
                    value_type = input_def.get('valueType', 'any')
                    guidance_lines.append(f"    - {input_name} (type: {value_type}): {input_desc}")
            else:
                guidance_lines.append("  Inputs: None required.")
            guidance_lines.append(f"{input_guidance}")
        return "\n".join(guidance_lines)

    def _add_input_resolution_guidance(self, goal: str, inputs: Dict[str, Any]) -> str:
        """Add guidance for resolving missing inputs using Brain or previous steps"""
        guidance = f"""
CRITICAL INPUT RESOLUTION RULES:

1. ONLY use action verbs that exist in the available plugins: {', '.join([p.get('actionVerb', '') for p in inputs.get('availablePlugins', [])])}

2. For SCRAPE steps:
   - ALWAYS provide "url" input with actual web addresses
   - Use specific URLs like "https://github.com/trending" or "https://news.ycombinator.com"
   - If you need to find URLs, create a SEARCH step first

3. For SEARCH steps:
   - ALWAYS use "searchTerm" (not "keywords" or "query")
   - Provide specific search terms like "open source agentic platforms 2024"

4. For missing inputs:
   - Reference outputs from previous steps using "outputName"
   - Use the Brain to help determine inputs from context
   - Provide concrete values, not placeholders

5. Input dependencies:
   - Use dependencies format: {{"outputName": stepNumber}}
   - Ensure step numbers are correct and sequential

"""
        return guidance

    def create_plan(self, goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create a robust plan using LLM-driven approach with retries"""
        progress.checkpoint("planning_start")
        logger.info(f"🎯 Creating plan for goal: {goal[:100]}...")

        for llm_attempt in range(self.max_llm_switches + 1):
            logger.info(f"🤖 LLM attempt {llm_attempt + 1}/{self.max_llm_switches + 1}")

            try:
                # Phase 1: Get well-thought prose plan
                prose_plan = self._get_prose_plan(goal, inputs)

                # Phase 2: Convert to structured JSON
                structured_plan = self._convert_to_structured_plan(prose_plan, goal, inputs)
                
                # Phase 3: Validate and repair if needed
                validated_plan = self._validate_and_repair_plan(structured_plan, goal, inputs)
                
                logger.info(f"✅ Successfully created plan with {len(validated_plan)} steps")
                return validated_plan
                
            except Exception as e:
                logger.error(f"❌ LLM attempt {llm_attempt + 1} failed: {e}")
                if llm_attempt < self.max_llm_switches:
                    logger.info(f"🔄 Retrying with different LLM...")
                    continue
                else:
                    raise AccomplishError(f"All LLM attempts failed. Last error: {e}", "planning_error")
    
    def _get_prose_plan(self, goal: str, inputs: Dict[str, Any]) -> str:
        """Phase 1: Get a well-thought prose plan from LLM"""

        plugin_guidance = self._create_detailed_plugin_guidance(inputs)
        
        prompt = f"""You are an expert strategic planner. Create a comprehensive, well-thought plan to accomplish this goal:

GOAL: {goal}

{plugin_guidance}

Write a detailed prose plan (3-5 paragraphs) that thoroughly explains:
- The strategic approach you would take
- The key phases or areas of work
- The specific actions and research needed
- How LLMs can be used in this effort
- How the pieces fit together
- Why this approach will achieve the goal

Be specific, actionable, and comprehensive. Think deeply about THIS specific goal.

IMPORTANT: Return ONLY plain text. NO markdown formatting, NO code blocks, NO special formatting.

Return your prose plan:"""

        logger.info("🧠 Phase 1: Requesting prose plan from LLM...")
        response = call_brain(prompt, inputs, "text")
        
        if not response or len(response.strip()) < 100:
            raise AccomplishError("LLM returned insufficient prose plan", "prose_plan_error")
            
        logger.info(f"✅ Received prose plan ({len(response)} chars)")
        return response.strip()
    
    def _convert_to_structured_plan(self, prose_plan: str, goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 2: Convert prose plan to structured JSON"""
        plugin_guidance = self._create_detailed_plugin_guidance(inputs)
        schema_json = json.dumps(PLAN_STEP_SCHEMA, indent=2)
        
        prompt = f"""You are an expert system for converting prose plans into structured JSON according to a strict schema.

**1. THE GOAL:**
---
{goal}
---

**2. THE PROSE PLAN:**
---
{prose_plan}
---

**3. THE JSON SCHEMA:**
---
{schema_json}
---

**4. YOUR TASK:**
Follow these steps to create the final JSON output:

**STEP A: Internal Analysis & Self-Correction (Your Internal Monologue)**
1.  **Analyze:** Read the Goal and Prose Plan to fully understand the user's intent and the required sequence of actions.
2.  **Verify Schema:** Carefully study the JSON SCHEMA. Your output must follow it perfectly.
3.  **Restate the Plan as Explicit Steps:**  Identify a list of steps that will be taken to achieve the Goal. Each Step should be a clear, actionable task with one or more outputs.
4.  **Check Dependencies:** For each step, ensure its `dependencies` correctly reference `outputs` from previous steps. The data flow must be logical.
5.  **Validate Inputs:** Ensure every input for each step has either a static `value` or a dynamic `outputName` reference from a prior step.
6.  **Final Check:** Before generating the output, perform a final check to ensure the entire JSON structure is valid and fully compliant with the schema.

**STEP B: Generate Final JSON (Your Final Output)**
After your internal analysis and self-correction is complete, provide ONLY the final, valid JSON array.

**CRITICAL REQUIREMENTS:**
- **JSON ONLY:** Your entire response MUST be a single, valid JSON array.
- **NO EXTRA TEXT:** Do NOT include explanations, comments, or markdown like ` ```json `.
- **STRICT COMPLIANCE:** Adhere strictly to the provided schema and the logical plan.

**CRITICAL DEPENDENCY RULES:**
- **Multi-step plans are essential:** Break down complex goals into multiple, sequential steps.
- **Dependencies are crucial for flow:** Every step that uses an output from a previous step MUST declare that dependency in its `dependencies` object.
- **Format:** {{ "dependencies": {{"inputName": "sourceStepNumber"}}}} where `inputName` is the name of the input in the current step that receives the output, and `sourceStepNumber` is the `number` of the step that produces that output.
- **Example:** If Step 2 needs `research_results` from Step 1, and Step 1 outputs {{ "research_results": "..." }}, then Step 2's inputs might have {{ "query": {{"outputName": "research_results", "valueType": "string"}}}} and its dependencies would be {{ "dependencies": {{"query": 1}} }}.

{plugin_guidance}
"""

        logger.info("🔧 Phase 2: Converting to structured JSON...")

        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                response = call_brain(prompt, inputs, "json")
                plan = json.loads(response)
                if not isinstance(plan, list):
                    raise ValueError("Response is not a JSON array")
                return plan
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"JSON parsing failed on attempt {attempt + 1}: {e}")
                if attempt < max_attempts - 1:
                    continue
                else:
                    raise AccomplishError(f"Failed to parse structured plan JSON after {max_attempts} attempts: {e}", "json_parse_error")
            except Exception as e:
                if attempt == max_attempts - 1:
                    raise AccomplishError(f"Brain call failed after {max_attempts} attempts: {e}", "brain_call_error")
                logger.warning(f"Brain call failed on attempt {attempt + 1}: {e}, retrying...")
                continue
    
    def _validate_and_repair_plan(self, plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 3: Validate and repair plan if needed"""
        
        for attempt in range(self.max_retries):
            logger.info(f"🔍 Validation attempt {attempt + 1}/{self.max_retries}")
            
            validation_result = self._validate_plan(plan)
            
            if validation_result['valid']:
                logger.info("✅ Plan validation successful")
                return plan
            
            # Plan failed validation - ask LLM to fix it
            logger.warning(f"⚠️ Plan validation failed: {validation_result['errors']}")
            
            if attempt < self.max_retries - 1:
                plan = self._repair_plan_with_llm(plan, validation_result['errors'], goal, inputs)
            else:
                raise AccomplishError(f"Plan validation failed after {self.max_retries} attempts", "validation_error")
        
        raise AccomplishError("Unexpected validation loop exit", "validation_error")
    
    def _validate_plan(self, plan: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate plan structure and completeness"""
        errors = []
        
        if not isinstance(plan, list) or len(plan) == 0:
            return {'valid': False, 'errors': ['Plan must be a non-empty array']}
        
        # Collect all step numbers and their outputs for cross-referencing
        step_numbers = set()
        step_outputs: Dict[int, Set[str]] = {}
        for i, step in enumerate(plan):
            step_num = step.get('number', i + 1)
            step_numbers.add(step_num)
            if 'outputs' in step and isinstance(step['outputs'], dict):
                step_outputs[step_num] = set(step['outputs'].keys())
            else:
                step_outputs[step_num] = set()

        for i, step in enumerate(plan):
            step_num = step.get('number', i + 1)
            
            # Check required fields
            required_fields = ['number', 'actionVerb', 'inputs', 'description', 'outputs', 'dependencies']
            for field in required_fields:
                if field not in step:
                    errors.append(f"Step {step_num}: Missing required field '{field}'")
            
            # Validate inputs structure
            if 'inputs' in step and isinstance(step['inputs'], dict):
                for input_name, input_def in step['inputs'].items():
                    if not isinstance(input_def, dict):
                        errors.append(f"Step {step_num}: Input '{input_name}' must be an object")
                        continue

                    # Check for unknown properties
                    allowed_properties = ['value', 'outputName', 'valueType', 'args']
                    for prop in input_def:
                        if prop not in allowed_properties:
                            errors.append(f"Step {step_num}: Input '{input_name}' has unknown property '{prop}'")
                    
                    if 'valueType' not in input_def:
                        errors.append(f"Step {step_num}: Input '{input_name}' missing 'valueType'")
                    
                    has_value = 'value' in input_def
                    has_output_name = 'outputName' in input_def
                    
                    if not has_value and not has_output_name:
                        errors.append(f"Step {step_num}: Input '{input_name}' missing both 'value' and 'outputName'")

            # Validate dependencies structure and correctness
            if 'dependencies' in step and isinstance(step['dependencies'], dict):
                for dep_input_name, source_step_num in step['dependencies'].items():
                    if not isinstance(source_step_num, int) or source_step_num < 1:
                        errors.append(f"Step {step_num}: Dependency for '{dep_input_name}' has invalid source step number: {source_step_num}")
                        continue
                    
                    if source_step_num >= step_num:
                        errors.append(f"Step {step_num}: Dependency for '{dep_input_name}' refers to future or same step: {source_step_num}")

                    if source_step_num not in step_numbers:
                        errors.append(f"Step {step_num}: Dependency for '{dep_input_name}' refers to non-existent step: {source_step_num}")
                        continue
                    
                    # Check if the outputName exists in the source step's outputs
                    # The dependency input name is assumed to be the output name from the source step
                    if dep_input_name not in step_outputs.get(source_step_num, set()):
                        errors.append(f"Step {step_num}: Dependency '{dep_input_name}' not found in outputs of source step {source_step_num}")
            else:
                if 'dependencies' in step and not isinstance(step['dependencies'], dict):
                    errors.append(f"Step {step_num}: 'dependencies' field must be an object.")
                elif 'dependencies' not in step: # This case is already covered by required_fields check
                    pass
        
        return {'valid': len(errors) == 0, 'errors': errors}
    
    def _repair_plan_with_llm(self, plan: List[Dict[str, Any]], errors: List[str], goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Ask LLM to repair the plan based on validation errors"""
        
        plan_json = json.dumps(plan, indent=2)
        errors_text = '\n'.join([f"- {error}" for error in errors])
        
        prompt = f"""Fix the validation errors in this JSON plan:

GOAL: {goal}

PLAN WITH ERRORS:
{plan_json}

ERRORS TO FIX:
{errors_text}

Fix ONLY the specific errors while preserving the plan's intent.
Return the corrected JSON plan:"""

        logger.info(f"🔧 Asking LLM to repair {len(errors)} validation errors...")

        max_attempts = 2
        for attempt in range(max_attempts):
            try:
                response = call_brain(prompt, inputs, "json")
                repaired_plan = json.loads(response)
                if not isinstance(repaired_plan, list):
                    raise ValueError("Repaired response is not a JSON array")
                return repaired_plan
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

class NovelVerbHandler:
    """Handles novel action verbs by recommending plugins or providing direct answers"""

    def handle(self, inputs: Dict[str, Any]) -> str:
        try:
            logger.info("NovelVerbHandler starting...")

            # Extract verb information
            verb_info = self._extract_verb_info(inputs)

            # Ask Brain for handling approach
            brain_response = self._ask_brain_for_verb_handling(verb_info, inputs)

            # Interpret and format response
            return self._format_response(brain_response, verb_info)

        except Exception as e:
            logger.error(f"Novel verb handling failed: {e}")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Novel verb handling failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _extract_verb_info(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Extract verb information from inputs"""
        if 'novel_actionVerb' in inputs:
            novel_verb_data = inputs['novel_actionVerb']

            # Ensure novel_verb_data is a dictionary if it's a list of lists
            if isinstance(novel_verb_data, list):
                temp_dict = {}
                for item in novel_verb_data:
                    if isinstance(item, list) and len(item) == 2:
                        temp_dict[item[0]] = item[1]
                    else:
                        logger.warning(f"Skipping invalid item in novel_actionVerb list: {item}")
                novel_verb_data = temp_dict
            
            # Now novel_verb_data should be a dictionary or already was
            if isinstance(novel_verb_data, dict):
                if 'value' in novel_verb_data and isinstance(novel_verb_data['value'], dict):
                    # Structured format from CapabilitiesManager
                    verb_info = novel_verb_data['value']
                    return {
                        "id": verb_info.get('id', 'novel_plugin'),
                        "verb": verb_info.get('verb', 'NOVEL_VERB'),
                        "description": verb_info.get('description', ''),
                        "context": verb_info.get('context', ''),
                        "inputValues": verb_info.get('inputValues', {}),
                        "outputs": {},
                    }
                else:
                    # Legacy string format or direct string value
                    goal_text = novel_verb_data.get('value', '') if isinstance(novel_verb_data, dict) else novel_verb_data
                    return {
                        "id": "novel_plugin",
                        "verb": "NOVEL_VERB",
                        "description": str(goal_text), # Ensure it's a string
                        "context": str(goal_text),    # Ensure it's a string
                        "inputValues": {},
                        "outputs": {}
                    }
            else:
                logger.warning(f"novel_actionVerb is neither a dict nor a list: {type(novel_verb_data)}")

        # Fallback
        return {
            "id": "novel_plugin",
            "verb": "NOVEL_VERB",
            "description": "A novel plugin.",
            "context": "",
            "inputValues": {},
            "outputs": {}
        }

    def _create_detailed_plugin_guidance(self, inputs: Dict[str, Any]) -> str:
        """Create a detailed list of available plugins with input specs and descriptions."""
        available_plugins = inputs.get('availablePlugins', [])
        if not available_plugins:
            return "No plugins are available for use in the plan."

        guidance_lines = ["Available Plugins & Input Specifications:"]
        for plugin in available_plugins:
            action_verb = plugin.get('actionVerb', 'UNKNOWN')
            description = plugin.get('description', 'No description available.')
            input_definitions = plugin.get('inputDefinitions', [])

            guidance_lines.append(f"\nPlugin: {action_verb}")
            guidance_lines.append(f"  Description: {description}")
            if input_definitions:
                guidance_lines.append("  Inputs:")
                for input_def in input_definitions:
                    input_name = input_def.get('name', 'UNKNOWN')
                    input_desc = input_def.get('description', 'No description.')
                    value_type = input_def.get('valueType', 'any')
                    guidance_lines.append(f"    - {input_name} (type: {value_type}): {input_desc}")
            else:
                guidance_lines.append("  Inputs: None required.")

        return "\n".join(guidance_lines)
    
    def _ask_brain_for_verb_handling(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Ask Brain how to handle the novel verb"""
        verb = verb_info['verb']
        description = verb_info.get('description', 'No description provided')
        context = verb_info.get('context', description)

        # Get available plugins summary
        plugin_summary = self._create_detailed_plugin_guidance(inputs)

        prompt = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported.

VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}

AVAILABLE PLUGINS:
{plugin_summary}

Determine the best approach:

1. **Create Plan**: Break down into steps (can use existing plugins OR novel verbs)
2. **Direct Answer**: Provide answer directly if no execution needed
3. **Plugin Definition**: Create new plugin only if truly novel functionality required

CRITICAL: Respond with ONLY valid JSON. NO markdown, NO code blocks, NO extra text.

For a plan (most common - can include novel verbs):
{{"plan": [{{"actionVerb": "research", "description": "...", "inputs": {{}}, "outputs": {{}}}}, {{"actionVerb": "SEARCH", "description": "...", "inputs": {{}}, "outputs": {{}}}}]}}

For a direct answer:
{{"direct_answer": {{"result_name": "result_value"}}}}

For a plugin definition:
{{"plugin": {{"id": "plugin_name", "description": "...", "actionVerb": "{verb}", "inputDefinitions": [], "outputDefinitions": []}}}}

JSON only:"""

        try:
            return call_brain(prompt, inputs, "json")
        except Exception as e:
            logger.error(f"Brain call failed for novel verb '{verb}': {e}")
            return f'{{"error": "Brain call failed: {str(e)}"}}'

    def _clean_brain_response(self, response: str) -> str:
        """Clean Brain response by removing markdown code blocks and extra formatting"""
        if not response or not response.strip():
            return "{}"

        # Remove markdown code blocks
        response = response.strip()

        # Remove ```json and ``` markers
        if response.startswith('```json'):
            response = response[7:]  # Remove ```json
        elif response.startswith('```'):
            response = response[3:]   # Remove ```

        if response.endswith('```'):
            response = response[:-3]  # Remove trailing ```

        # Clean up whitespace
        response = response.strip()

        # If still empty, return empty object
        if not response:
            return "{}"

        return response

    def _format_response(self, brain_response: str, verb_info: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            # Clean the brain response - remove markdown code blocks if present
            cleaned_response = self._clean_brain_response(brain_response)
            data = json.loads(cleaned_response)

            if "plan" in data:
                # Plan provided - most common case
                return json.dumps([{
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'",
                    "result": data["plan"],
                    "mimeType": "application/json"
                }])

            elif "direct_answer" in data:
                # Direct answer provided
                return json.dumps([{
                    "success": True,
                    "name": "direct_answer",
                    "resultType": "direct_answer",
                    "resultDescription": f"Direct answer for {verb_info['verb']}",
                    "result": data["direct_answer"],
                    "mimeType": "application/json"
                }])

            elif "plugin" in data:
                # Plugin recommendation
                plugin_data = data["plugin"]
                return json.dumps([{
                    "success": True,
                    "name": "plugin",
                    "resultType": "plugin",
                    "resultDescription": f"Plugin recommended: {plugin_data.get('id', 'unknown')}",
                    "result": plugin_data,
                    "mimeType": "application/json"
                }])

            else:
                # Unexpected format
                return json.dumps([{
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Unexpected Brain response format",
                    "result": brain_response,
                    "mimeType": "text/plain"
                }])

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Brain response: {e}")
            logger.error(f"Raw Brain response: {brain_response[:500]}...")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Failed to parse Brain response: {str(e)}",
                "result": brain_response,
                "mimeType": "text/plain"
            }])

class AccomplishOrchestrator:
    """Main orchestrator for ACCOMPLISH plugin"""

    def __init__(self):
        self.goal_planner = RobustMissionPlanner()
        self.novel_verb_handler = NovelVerbHandler()

    def execute(self, inputs_str: str) -> str:
        """Main execution method"""
        progress.checkpoint("orchestrator_execute_start")
        logger.info("ACCOMPLISH orchestrator starting...")

        try:
            # Parse inputs
            inputs = parse_inputs(inputs_str)
            progress.checkpoint("input_processed")

            # Route to appropriate handler
            if self._is_novel_verb_request(inputs):
                logger.info("Novel verb handling detected. Routing to NovelVerbHandler.")
                return self.novel_verb_handler.handle(inputs)
            else:
                logger.info("Mission goal planning detected. Routing to RobustMissionPlanner.")
                return self.goal_planner.plan(inputs)

        except Exception as e:
            logger.error(f"ACCOMPLISH execution failed: {e}")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"ACCOMPLISH execution failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _is_novel_verb_request(self, inputs: Dict[str, Any]) -> bool:
        """Check if this is a novel verb request"""
        return 'novel_actionVerb' in inputs

# Main execution
if __name__ == "__main__":
    try:
        progress.checkpoint("main_start")
        logger.info("ACCOMPLISH plugin starting...")

        orchestrator = AccomplishOrchestrator()
        progress.checkpoint("orchestrator_created")

        # Read input from stdin
        import sys
        input_data = sys.stdin.read()
        progress.checkpoint("input_read")
        logger.info(f"Input received: {len(input_data)} characters")

        # Execute
        result = orchestrator.execute(input_data)

        # Output result
        print(result)
        progress.checkpoint("execution_complete")

    except Exception as e:
        logger.error(f"ACCOMPLISH plugin failed: {e}")
        error_result = json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": f"ACCOMPLISH plugin failed: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)
