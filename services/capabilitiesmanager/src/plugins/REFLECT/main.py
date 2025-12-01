#!/usr/bin/env python3
"""
REFLECT Plugin - Enhanced with self-correction capabilities
Handles reflection on mission progress, generates plans for next steps, and learns from performance data.
"""

import uuid
import json
import logging
import sys
import time
import requests
import re
import os
from typing import Dict, Any, List, Optional, Set

# Import from the installed shared library package
try:
    from plan_validator import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA
    ReflectError = AccomplishError
except ImportError:
    # Fallback to direct import for development/testing
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'shared', 'python', 'lib')))
    from plan_validator import PlanValidator, AccomplishError as ReflectError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

def _create_detailed_plugin_guidance(inputs: Dict[str, Any]) -> str:
    """Create a detailed list of available plugins with input specs, descriptions, and types."""
    available_plugins_input = inputs.get('availablePlugins', {})
    available_plugins = available_plugins_input.get('value', []) if isinstance(available_plugins_input, dict) else available_plugins_input
    
    if not available_plugins:
        return "No plugins are available for use in the plan."

    guidance_lines = ["Available Plugins & Input Specifications:"]
    for plugin in available_plugins:
        if isinstance(plugin, dict): # Defensive check
            action_verb = plugin.get('verb', 'UNKNOWN') # Use 'verb' from PluginManifest
            description = plugin.get('description', 'No description available.')
            language = plugin.get('language', 'unknown')
            repository_type = plugin.get('repository', {}).get('type', 'unknown')
            input_definitions = plugin.get('inputDefinitions', [])
            input_guidance = plugin.get('inputGuidance', '')

            guidance_lines.append(f"\nPlugin: {action_verb} (Language: {language}, Source: {repository_type})")
            guidance_lines.append(f"  Description: {description}")
            if input_definitions:
                guidance_lines.append("  Inputs:")
                for input_def in input_definitions:
                    input_name = input_def.get('name', 'UNKNOWN')
                    input_desc = input_def.get('description', 'No description.')
                    value_type = input_def.get('type', 'any') # Use 'type' from PluginParameter
                    guidance_lines.append(f"    - {input_name} (type: {value_type}){ ' (REQUIRED)' if input_def.get('required') else ''}: {input_desc}")
            else:
                guidance_lines.append("  Inputs: None required.")
            if input_guidance:
                guidance_lines.append(f"  Guidance: {input_guidance}")
        else:
            # Handle case where plugin is not a dictionary (e.g., a string)
            guidance_lines.append(f"\nPlugin: {plugin} (Details not available - unexpected format)")
    return "\n".join(guidance_lines)


class ProgressTracker:
    def __init__(self):
        self.start_time = time.time()
        self.checkpoints = []

    def checkpoint(self, name: str):
        elapsed = time.time() - self.start_time
        self.checkpoints.append((name, elapsed))
        logger.info(f"CHECKPOINT: {name} at {elapsed:.2f}s")

progress = ProgressTracker()

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs"""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise ReflectError("No authentication token found", "auth_error")

def get_mission_goal(mission_id: str, inputs: Dict[str, Any]) -> Optional[str]:
    """Fetches the mission goal from the Librarian service."""
    if not mission_id:
        return None
    
    try:
        auth_token = get_auth_token(inputs)
        librarian_url_input = inputs.get('librarian_url')
        if isinstance(librarian_url_input, dict) and 'value' in librarian_url_input:
            librarian_url = librarian_url_input['value']
        else:
            librarian_url = librarian_url_input if librarian_url_input is not None else 'librarian:5040'

        headers = {'Authorization': f'Bearer {auth_token}'}
        # Assuming the mission is stored in a 'missions' collection
        response = requests.get(f"http://{librarian_url}/loadData/{mission_id}?collection=missions", headers=headers)
        response.raise_for_status()
        mission_data = response.json()
        return mission_data.get('data', {}).get('goal')
    except Exception as e:
        logger.error(f"Error fetching mission {mission_id}: {e}")
        # Don't raise, just return None and let the caller decide what to do
        return None



def _extract_json_from_string(text: str) -> Optional[str]:
    """
    Extracts a JSON object or array string from a given text, handling markdown code blocks.
    """
    if not text:
        return None

    text = text.strip()

    # Attempt to parse the entire text as JSON first
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass # Not a direct JSON string, proceed to extraction logic

    # Use a regex to find the json block (with or without 'json' specifier)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        json_candidate = match.group(1).strip()
        try:
            json.loads(json_candidate)
            return json_candidate
        except json.JSONDecodeError:
            pass # Extracted block is not valid JSON

    # Fallback: try to find the outermost JSON structure
    first_brace = text.find('{')
    first_bracket = text.find('[')
    last_brace = text.rfind('}')
    last_bracket = text.rfind(']')

    start_index = -1
    end_index = -1

    if first_bracket != -1 and last_bracket != -1 and first_bracket < last_bracket:
        start_index = first_bracket
        end_index = last_bracket
    elif first_brace != -1 and last_brace != -1 and first_brace < last_brace:
        start_index = first_brace
        end_index = last_brace
    
    if start_index != -1:
        json_candidate = text[start_index : end_index + 1]
        try:
            json.loads(json_candidate)
            return json_candidate
        except json.JSONDecodeError:
            pass

    return None

def call_brain(prompt: str, inputs: Dict[str, Any], response_type: str = "json") -> str:
    """Call Brain service with proper authentication and conversation type"""
    progress.checkpoint("brain_call_start")

    try:
        auth_token = get_auth_token(inputs)
        brain_url_input = inputs.get('brain_url')
        if isinstance(brain_url_input, dict) and 'value' in brain_url_input:
            brain_url = brain_url_input['value']
        else:
            brain_url = brain_url_input if brain_url_input is not None else 'brain:5070'

        # Set conversation type and system message based on response type
        if response_type == 'json':
            conversation_type = "TextToJSON"
            system_message = (
                "You are a planning assistant for a system of agents. Generate meaningful and actionable plans as JSON arrays. "
                "Plans must accomplish the provided goal, not simulate it. "
                "Each step must match the provided schema precisely.  You should attempt to use the available tools first to find solutions and complete tasks independently. Do not create steps to ask the user for information you can find elsewhere. "
                "Return ONLY valid JSON, no other text." 
            )
        else:
            conversation_type = "TextToText"
            system_message = "You are an autonomous agent. Your primary goal is to accomplish the user's mission by creating and executing plans.  Be resourceful and proactive."

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
            timeout=360  # Increased timeout to 360 seconds (6 minutes) to match Brain's max LLM timeout
        )

        if response.status_code != 200:
            raise ReflectError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'result' not in result:
            raise ReflectError("Brain response missing result", "brain_response_error")

        raw_brain_response = result['result']

        if response_type == 'text':
            progress.checkpoint("brain_call_success_text_response")
            return raw_brain_response

        # Attempt to extract clean JSON from the raw response
        extracted_json_str = _extract_json_from_string(raw_brain_response)

        if extracted_json_str:
            try:
                # Validate that the extracted string is indeed valid JSON
                json.loads(extracted_json_str)
                progress.checkpoint("brain_call_success")
                return extracted_json_str
            except json.JSONDecodeError as e:
                logger.warning(f"Extracted JSON is still invalid: {e}. Raw response: {raw_brain_response[:200]}...")
                # Fallback to raw response if extraction leads to invalid JSON
                progress.checkpoint("brain_call_success_with_warning")
                return raw_brain_response
        else:
            logger.warning(f"Could not extract JSON from Brain response. Raw response: {raw_brain_response[:200]}...")
            progress.checkpoint("brain_call_success_with_warning")
            return raw_brain_response

    except Exception as e:
        progress.checkpoint("brain_call_failed")
        logger.error(f"Brain call failed: {e}")
        raise ReflectError(f"Brain service call failed: {e}", "brain_error")

def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and normalize the plugin stdin JSON payload into a dict of inputName -> InputValue.

    Plugins should accept inputs formatted as a JSON array of [ [key, value], ... ] where value
    may be a primitive (string/number/bool), or an object like {"value": ...}. This helper
    normalizes non-dict raw values into {'value': raw}. It also filters invalid entries.
    """
    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        payload = json.loads(inputs_str)
        inputs: Dict[str, Any] = {}

        # Case A: payload is a list of [key, value] pairs (legacy / preferred)
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, raw_value = item
                    if isinstance(raw_value, dict):
                        inputs[key] = raw_value
                    else:
                        inputs[key] = {'value': raw_value}
                else:
                    logger.debug(f"Skipping invalid input item in list payload: {item}")

        # Case B: payload is a serialized Map object with entries: [[key, value], ...]
        elif isinstance(payload, dict) and payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
            for entry in payload.get('entries', []):
                if isinstance(entry, list) and len(entry) == 2:
                    key, raw_value = entry
                    if isinstance(raw_value, dict):
                        inputs[key] = raw_value
                    else:
                        inputs[key] = {'value': raw_value}
                else:
                    logger.debug(f"Skipping invalid Map entry: {entry}")

        # Case C: payload is already a dict mapping keys -> values (possibly already normalized)
        elif isinstance(payload, dict):
            for key, raw_value in payload.items():
                # Skip internal meta fields if present
                if key == '_type' or key == 'entries':
                    continue
                if isinstance(raw_value, dict):
                    inputs[key] = raw_value
                else:
                    inputs[key] = {'value': raw_value}

        else:
            # Unsupported top-level type, provide clear error
            raise ValueError("Unsupported input format: expected array of pairs, Map with entries, or object mapping")

        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise AccomplishError(f"Input validation failed: {e}", "input_error")

class ReflectHandler:
    """Handles reflection requests by generating schema-compliant plans"""

    def __init__(self):
        self.validator = PlanValidator(brain_call=call_brain)
        self.max_retries = 3

    def handle(self, inputs: Dict[str, Any]) -> str:
        try:
            logger.info("ReflectHandler starting...")

            # Extract reflection information
            reflection_info = self._extract_reflection_info(inputs)

            # Get mission goal
            mission_goal = get_mission_goal(reflection_info.get("missionId"), inputs)
            if not mission_goal:
                mission_goal = "No mission goal provided"

            reflection_info["mission_goal"] = mission_goal

            # Self-correction: Analyze performance and generate lessons learned
            agent_id = reflection_info.get("agentId")
            if agent_id:
                self._perform_self_correction(agent_id, reflection_info, inputs)

            # Ask Brain for reflection handling approach
            brain_response = self._ask_brain_for_reflection_handling(reflection_info, inputs)

            # Interpret and format response
            return self._format_response(brain_response, reflection_info, inputs)

        except Exception as e:
            logger.error(f"Reflection handling failed: {e}")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Reflection handling failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _extract_reflection_info(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Extract reflection information from inputs"""
        def _normalize_input_value(input_val: Any) -> str:
            if isinstance(input_val, dict) and 'value' in input_val:
                content = input_val['value']
                if isinstance(content, (dict, list)):
                    return json.dumps(content)
                return str(content).strip()
            elif isinstance(input_val, (dict, list)):
                return json.dumps(input_val)
            return str(input_val).strip() if input_val is not None else ''

        mission_id = _normalize_input_value(inputs.get('missionId'))

        plan_history_input = inputs.get('plan_history')
        plan_history = []
        if isinstance(plan_history_input, dict) and 'value' in plan_history_input:
            raw_plan_history = plan_history_input['value']
        else:
            raw_plan_history = plan_history_input

        if isinstance(raw_plan_history, str):
            try:
                plan_history = json.loads(raw_plan_history)
            except json.JSONDecodeError:
                logger.warning("Could not parse plan_history string as JSON.")
                plan_history = []
        elif isinstance(raw_plan_history, (list, dict)):
            plan_history = raw_plan_history
        else:
            plan_history = []

        work_products = _normalize_input_value(inputs.get('work_products'))
        question = _normalize_input_value(inputs.get('question'))
        final_output = _normalize_input_value(inputs.get('final_output'))
        agent_id = _normalize_input_value(inputs.get('agentId'))

        logger.info(f"DEBUG REFLECT: mission_id = '{mission_id}' (type: {type(mission_id)})")
        logger.info(f"DEBUG REFLECT: plan_history = {json.dumps(plan_history, indent=2)} (type: {type(plan_history)})")
        logger.info(f"DEBUG REFLECT: work_products = '{str(work_products)[:50]}...' (type: {type(work_products)})")
        logger.info(f"DEBUG REFLECT: question = '{str(question)[:50]}...' (type: {type(question)})")
        logger.info(f"DEBUG REFLECT: final_output present: {'yes' if final_output else 'no'} (length: {len(str(final_output))})")

        return {
            "missionId": mission_id,
            "plan_history": plan_history,
            "work_products": work_products,
            "question": question,
            "final_output": final_output,
            "agentId": agent_id,
        }
    
    def _ask_brain_for_reflection_handling(self, reflection_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Ask Brain how to handle the reflection request"""
        mission_goal = reflection_info['mission_goal']
        plan_history = reflection_info['plan_history']
        work_products = reflection_info['work_products']
        question = reflection_info['question']
        mission_id = reflection_info['missionId']

        PLAN_ARRAY_SCHEMA = {
            "type": "array",
            "items": PLAN_STEP_SCHEMA,
            "description": "A list of sequential steps to accomplish a goal."
        }
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)

        failed_step_info = ""
        if plan_history:
            last_step = plan_history[-1]
            if not last_step.get('success', True):
                failed_action_verb = last_step.get('actionVerb', 'UNKNOWN')
                failed_error = last_step.get('error', 'No error message')
                failed_inputs = last_step.get('inputs', {})
                
                failed_inputs_str = json.dumps(failed_inputs, indent=2)

                failed_step_info = f"""
FAILED STEP DETAILS:
Action Verb: {failed_action_verb}
Error: {failed_error}
Inputs: {failed_inputs_str}
"""

        prompt = f"""You are a JSON-only reflection and planning assistant. Your task is to analyze the provided mission data and reflection question.

MISSION ID: {mission_id}
MISSION GOAL: {mission_goal}
PLAN HISTORY: {plan_history}
WORK PRODUCTS: {work_products}
REFLECTION QUESTION: {question}

PARENT STEP INPUTS: {json.dumps(inputs)}

{failed_step_info}

Your task is to reflect on the mission progress and determine the best course of action. Consider these options in order of preference:

1.  **Provide a Direct Answer:** If the reflection question can be answered directly with the given context and the mission is complete or no further action is needed, provide a JSON object with a single key "direct_answer".
2.  **Create a Plan:** If the mission is NOT complete and requires multiple steps to achieve the remaining objectives, generate a new, concise plan to achieve the remaining objectives. The plan should be a JSON array of steps following the established schema.

**CRITICAL PLANNING PRINCIPLES (STRICTLY ENFORCED):**
---
- **Autonomy is Paramount:** Your goal is to *solve* the mission, not to delegate research or information gathering back to the user.
- **Resourcefulness:** Exhaust all available tools (`SEARCH`, `SCRAPE`, `GENERATE`, `QUERY_KNOWLEDGE_BASE`) to find answers and create deliverables *before* ever considering asking the user.
- **`ASK_USER_QUESTION` is a Last Resort:** This tool is exclusively for obtaining subjective opinions, approvals, or choices from the user. It is *never* for offloading tasks. Generating a plan that asks the user for information you can find yourself is a critical failure.
- **Dependencies are Crucial:** Every step that uses an output from a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. A plan with disconnected steps is invalid.
        - **Handling Lists (`FOREACH`):** If a step requires a single item (e.g., a URL string) but receives a list from a preceding step (e.g., search results), you MUST use a `FOREACH` loop to iterate over the list.
        - **Aggregating Results (`REGROUP`):** When using a `FOREACH` loop, if you need to collect the results from all iterations into a single array, you MUST follow the `FOREACH` step with a `REGROUP` step. The `REGROUP` step's `stepIdsToRegroup` input MUST be linked to the `FOREACH` step's `instanceEndStepIds` output using `sourceStep` and `outputName`. This ensures that `REGROUP` waits for all `FOREACH` iterations to complete and then collects their results.
        - **Role Assignment:** Assign `recommendedRole` at the deliverable level, not per individual step. All steps contributing to a single output (e.g., a research report) should share the same role.
**RESPONSE FORMATS:**

-   **For a Direct Answer:** {{"direct_answer": "Your answer here"}}
-   **For a Plan:** A JSON array of steps defined with the schema below.

Plan Schema
{schema_json}

- **CRITICAL for REQUIRED Inputs:** For each step, you MUST examine the `inputDefinitions` for the corresponding `actionVerb` and ensure that all `required` inputs are present in the step's `inputs` object. If an input is marked `required: true`, it MUST be provided.
- **CRITICAL for Plan Inputs, sourceStep:**
    - Step inputs are generally sourced from the outputs of other steps and less often fixed with constant values.
    - All inputs for each step must be explicitly defined either as a constant `value` or by referencing an `outputName` from a `sourceStep` within the plan or from the `PARENT STEP INPUTS`. Do not assume implicit data structures or properties of inputs.
    - Use `sourceStep: 0` ONLY for inputs that are explicitly provided in the "PARENT STEP INPUTS" section above.
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `id` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP" (using `sourceStep: 0`) or from an output of a previous step in the plan.
    - CRITICAL: If you use placeholders like {{{{'{{output_name}}'}}}} within a longer string value (e.g., a prompt that references previous outputs), you MUST also declare each referenced output_name as a separate input with proper sourceStep and outputName.
- **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.

**Role Assignment Strategy:**
- Assign `recommendedRole` at the **deliverable level**, not per-step optimization
- All steps contributing to a single coherent output (e.g., "research report", "code module", "analysis document") should share the same `recommendedRole`
- Only change `recommendedRole` when transitioning to a fundamentally different type of deliverable
- Example: Steps 1-5 all produce research for a report → all get `recommendedRole: "researcher"`
- Counter-example: Don't switch roles between gathering data (step 1) and formatting it (step 2) if they're part of the same research deliverable

**CRITICAL - LINKING STEPS:** You MUST explicitly connect steps. Any step that uses the output of a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. DO NOT simply refer to previous outputs in a `prompt` string without also adding the formal dependency in the `inputs` object. For verbs like `THINK`, `CHAT`, or `ASK_USER_QUESTION`, if the `prompt` or `question` text refers to a file or work product from a previous step, you MUST add an input that references the output of that step using `sourceStep` and `outputName`. This ensures the step waits for the file to be created.
A plan with no connections between steps is invalid and will be rejected.

"""

        for attempt in range(self.max_retries):
            try:
                response = call_brain(prompt, inputs, "json")
                # Log raw response for debugging
                logger.info(f"Raw response from Brain (attempt {attempt+1}): {str(response)[:500]}...")
                try:
                    # Attempt to parse the response as JSON
                    parsed_response = json.loads(response)
                except Exception as e:
                    logger.warning(f"Attempt {attempt + 1}: JSON parsing failed: {e}. Response: {response}")
                    if attempt == self.max_retries - 1:
                        raise ReflectError(f"Failed to parse Brain response as JSON: {e}", "json_parse_error")
                    continue

                # Check if the parsed response is a valid structure for reflection (plan or direct answer)
                if isinstance(parsed_response, (list, dict)):
                    return parsed_response # Return the parsed JSON
                
                logger.error(f"Attempt {attempt + 1}: Brain response is not a valid JSON object or array: {str(parsed_response)[:500]}...")
                if attempt == self.max_retries - 1:
                    raise ReflectError("Brain response is not a valid JSON object or array", "invalid_response_format")
                continue
            except ReflectError as e:
                logger.warning(f"Attempt {attempt + 1}: Brain call for reflection failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
                continue
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}: Brain call for reflection failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
                continue

        raise ReflectError("Could not get a valid reflection response from Brain after multiple attempts.", "brain_response_error")

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

    def _format_response(self, brain_response: Any, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            # If brain_response is already a parsed JSON object/array, use it directly
            # Otherwise, attempt to parse it as JSON
            if isinstance(brain_response, (dict, list)):
                data = brain_response
            else:
                # Attempt to clean and parse if it's a string
                cleaned_response = self._clean_brain_response(str(brain_response))
                data = json.loads(cleaned_response)

            # Extract plan array - handle both direct arrays and wrapped arrays
            # If the LLM returns a single step object, this is INVALID and should be rejected
            plan_array = None
            if isinstance(data, list):
                plan_array = data
            elif isinstance(data, dict):
                # Check if this dict is itself a step (has actionVerb or id) - this is INVALID
                if 'actionVerb' in data or 'id' in data:
                    logger.error(f"REFLECT: LLM returned a single step object instead of a plan array. This is invalid and will be rejected.")
                    # Don't set plan_array - let it fall through to the direct_answer handling
                    # The system will treat this as "mission not accomplished" and may retry
                else:
                    # Otherwise, check if any property contains an array of step-like objects
                    for key, value in data.items():
                        if isinstance(value, list) and len(value) > 0:
                            # Check if it looks like a plan (array of objects with step-like properties)
                            if all(isinstance(item, dict) and ('actionVerb' in item or 'id' in item) for item in value):
                                logger.info(f"REFLECT: Extracting plan from '{key}' key in response ({len(value)} steps)")
                                plan_array = value
                                break
                            # If it's an array of dicts but doesn't have step markers, still try it
                            elif all(isinstance(item, dict) for item in value):
                                logger.info(f"REFLECT: Found array of objects in '{key}' key, assuming it's a plan ({len(value)} steps)")
                                plan_array = value
                                break

            if plan_array is not None:
                # Ensure availablePlugins is a direct list of manifests for the validator
                modified_inputs = inputs.copy()
                available_plugins_for_validator = modified_inputs.get('availablePlugins')
                if isinstance(available_plugins_for_validator, dict) and 'value' in available_plugins_for_validator:
                    modified_inputs['availablePlugins'] = available_plugins_for_validator['value']

                # Validate and repair the plan
                validated_plan = self.validator.validate_and_repair(plan_array, verb_info['mission_goal'], modified_inputs)

                # Save the generated plan to Librarian
                # self._save_plan_to_librarian(verb_info['verb'], validated_plan, inputs)

                return json.dumps([{
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "resultDescription": f"Plan created from reflection",
                    "result": validated_plan,
                    "mimeType": "application/json"
                }])
            elif isinstance(data, dict): # Could be direct answer or plugin recommendation
                if "direct_answer" in data:
                    answer_content = data["direct_answer"]
                    # Ensure answer_content is a string before calling .lower()
                    if isinstance(answer_content, dict):
                        answer_content_str = json.dumps(answer_content)
                    else:
                        answer_content_str = str(answer_content)

                    # Check for keywords suggesting a new plan is needed
                    if any(keyword in answer_content_str.lower() for keyword in ["retry", "use", "instead of", "break down", "should", "first"]):
                        # Create a new goal for the ACCOMPLISH plugin
                        new_goal = f"The previous attempt failed. The advice is: '{answer_content}'. Create a new plan to accomplish the original goal: {verb_info['mission_goal']}"
                        
                        # Return a new step to call ACCOMPLISH
                        new_step = {
                            "id": str(uuid.uuid4()),
                            "actionVerb": "ACCOMPLISH",
                            "description": "Create a new plan based on reflection.",
                            "inputs": {
                                "goal": {
                                    "value": new_goal,
                                    "valueType": "string"
                                }
                            },
                            "outputs": {
                                "plan": "A new plan to achieve the goal"
                            }
                        }
                        return json.dumps([{
                            "success": True,
                            "name": "plan",
                            "resultType": "plan",
                            "resultDescription": "Generated a new plan to overcome the previous failure.",
                            "result": [new_step],
                            "mimeType": "application/json"
                        }])

                    # The answer might contain a plan, so we need to parse it.
                    try:
                        # Attempt to extract a JSON plan from the answer string
                        plan_from_answer = _extract_json_from_string(answer_content)
                        if plan_from_answer:
                            plan_data = json.loads(plan_from_answer)

                            # Extract plan array - handle both direct arrays and wrapped arrays
                            extracted_plan = None
                            if isinstance(plan_data, list):
                                extracted_plan = plan_data
                            elif isinstance(plan_data, dict):
                                # Check if any property contains an array of step-like objects
                                for key, value in plan_data.items():
                                    if isinstance(value, list) and len(value) > 0:
                                        if all(isinstance(item, dict) and ('actionVerb' in item or 'id' in item) for item in value):
                                            logger.info(f"REFLECT: Extracting plan from '{key}' in answer string ({len(value)} steps)")
                                            extracted_plan = value
                                            break
                                        elif all(isinstance(item, dict) for item in value):
                                            logger.info(f"REFLECT: Found array in '{key}' in answer, assuming it's a plan ({len(value)} steps)")
                                            extracted_plan = value
                                            break

                            if extracted_plan:
                                validated_plan = self.validator.validate_and_repair(extracted_plan, verb_info['mission_goal'], inputs)
                                return json.dumps([{
                                    "success": True,
                                    "name": "plan",
                                    "resultType": "plan",
                                    "resultDescription": f"Plan created from reflection",
                                    "result": validated_plan,
                                    "mimeType": "application/json"
                                }])
                    except (json.JSONDecodeError, TypeError):
                        # If parsing fails, treat it as a direct text answer
                        pass

                    # If no plan is found in the answer, return it as a direct answer
                    return json.dumps([{ 
                        "success": True,
                        "name": "answer",
                        "resultType": "string",
                        "resultDescription": f"Direct answer from reflection",
                        "result": answer_content,
                        "mimeType": "application/json"
                    }])
                elif "value" in data and "valueType" in data:
                    # Handle the case where the response is an InputValue-like object
                    return json.dumps([{ 
                        "success": True,
                        "name": "answer",
                        "resultType": "string",
                        "resultDescription": f"Direct answer from reflection",
                        "result": data["value"],
                        "mimeType": "application/json"
                    }])
                elif "value" in data and "valueType" in data:
                    # Handle the case where the response is an InputValue-like object
                    return json.dumps([{ 
                        "success": True,
                        "name": "answer",
                        "resultType": "string",
                        "resultDescription": f"Direct answer from reflection",
                        "result": data["value"],
                        "mimeType": "application/json"
                    }])
                elif "plugin" in data:
                    plugin_data = data["plugin"]
                    return json.dumps([{ 
                        "success": True,
                        "name": "plugin",
                        "resultType": "plugin",
                        "resultDescription": f"Plugin recommended: {plugin_data.get('id', 'unknown')}",
                        "result": plugin_data,
                        "mimeType": "application/json"
                    }])
                # If the dictionary is a single step, treat it as a plan with one step
                elif "actionVerb" in data and "id" in data:
                    validated_plan = self.validator.validate_and_repair([data], verb_info['mission_goal'], inputs)
                    # self._save_plan_to_librarian(verb_info['verb'], validated_plan, inputs)
                    return json.dumps([{"success": True,
                        "name": "plan",
                        "resultType": "plan",
                        "resultDescription": f"Plan created from reflection",
                        "result": validated_plan,
                        "mimeType": "application/json"
                    }])
                else:
                    # Unexpected dictionary format
                    return json.dumps([{ 
                        "success": False,
                        "name": "error",
                        "resultType": "error",
                        "resultDescription": "Unexpected Brain response format (dictionary)",
                        "result": data,
                        "mimeType": "application/json"
                    }])
            else:
                # Truly unexpected format (e.g., non-JSON string that wasn't caught by _clean_brain_response)
                return json.dumps([{ 
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Unexpected Brain response format (non-JSON or unhandled type)",
                    "result": str(brain_response),
                    "mimeType": "text/plain"
                }])

        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse or process Brain response in _format_response: {e}")
            logger.error(f"Raw Brain response (type: {type(brain_response)}): {str(brain_response)[:500]}...")
            return json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Failed to process Brain response: {str(e)}",
                "result": str(brain_response),
                "mimeType": "text/plain"
            }])

    def _perform_self_correction(self, agent_id: str, reflection_info: Dict[str, Any], inputs: Dict[str, Any]) -> None:
        """
        Perform self-correction by analyzing performance and updating system prompt if needed.

        Args:
            agent_id: The ID of the agent to perform self-correction for
            reflection_info: Information about the current reflection
            inputs: All plugin inputs
        """
        try:
            logger.info(f"Performing self-correction for agent {agent_id}")

            # Get agent performance data
            performance_data = get_agent_performance_data(agent_id, inputs)
            if not performance_data:
                logger.info(f"No performance data available for agent {agent_id}, skipping self-correction")
                return

            # Parse plan history to extract recent step results
            plan_history = []
            plan_history_str = reflection_info.get("plan_history", "")
            if plan_history_str:
                try:
                    plan_history = json.loads(plan_history_str) if isinstance(plan_history_str, str) else plan_history_str
                    if not isinstance(plan_history, list):
                        plan_history = []
                except json.JSONDecodeError:
                    logger.warning("Could not parse plan history for self-correction")
                    plan_history = []

            # Determine current task from the reflection question or context
            current_task = "REFLECT"  # Default to current task
            question = inputs.get('question', {}) # Ensure question is always a string
            if isinstance(question, dict) and 'value' in question:
                question_text = str(question['value'])
            else:
                question_text = str(question)

            # Try to extract task context from question
            if "code" in question_text.lower() or "programming" in question_text.lower():
                current_task = "CODE_EXECUTOR"
            elif "search" in question_text.lower():
                current_task = "SEARCH"
            elif "scrape" in question_text.lower():
                current_task = "SCRAPE"
            elif "analysis" in question_text.lower():
                current_task = "TEXT_ANALYSIS"

            # Generate lesson learned
            lesson = generate_lesson_learned(agent_id, current_task, performance_data, plan_history)

            if lesson:
                logger.info(f"Generated lesson for agent {agent_id}: {lesson}")

                # Update agent's system prompt with the lesson
                success = update_agent_system_prompt(agent_id, lesson, inputs)
                if success:
                    logger.info(f"Successfully applied self-correction lesson to agent {agent_id}")
                else:
                    logger.warning(f"Failed to apply self-correction lesson to agent {agent_id}")
            else:
                logger.info(f"No self-correction lesson needed for agent {agent_id}")

        except Exception as e:
            logger.error(f"Error during self-correction for agent {agent_id}: {e}")
            # Don't fail the entire reflection if self-correction fails
            pass

def reflect(inputs: Dict[str, Any]) -> str:
    """Main reflection logic."""
    try:
        handler = ReflectHandler()
        return handler.handle(inputs)
    except Exception as e:
        logger.error(f"REFLECT plugin failed: {e}")
        return json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"REFLECT plugin failed: {str(e)}",
            "mimeType": "text/plain"
        }])

def main():
    """Main execution block."""
    try:
        input_str = sys.stdin.read()
        inputs = parse_inputs(input_str)
        result = reflect(inputs)
        print(result)
    except Exception as e:
        logger.error(f"REFLECT plugin execution failed: {e}")
        error_output = json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"REFLECT plugin execution failed: {str(e)}",
            "mimeType": "text/plain"
        }])
        print(error_output)


def get_agent_performance_data(agent_id: str, inputs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Fetch agent performance data from the AgentSet service.

    Args:
        agent_id: The ID of the agent to get performance data for
        inputs: The plugin inputs, containing the auth token.

    Returns:
        Performance data dictionary or None if not available
    """
    try:
        auth_token = get_auth_token(inputs)
        headers = {'Authorization': f'Bearer {auth_token}'}
        agentset_url = os.environ.get('AGENTSET_URL', 'http://agentset:5100')
        response = requests.get(f"{agentset_url}/agent/{agent_id}/performance", headers=headers, timeout=10)

        if response.status_code == 200:
            return response.json().get('performanceData', {})
        else:
            logger.warning(f"Could not fetch performance data for agent {agent_id}: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Error fetching performance data for agent {agent_id}: {e}")
        return None


def update_agent_system_prompt(agent_id: str, lesson_learned: str, inputs: Dict[str, Any]) -> bool:
    """
    Update an agent's system prompt with a lesson learned.

    Args:
        agent_id: The ID of the agent to update
        lesson_learned: The lesson to add to the system prompt
        inputs: The plugin inputs, containing the auth token.

    Returns:
        True if successful, False otherwise
    """
    try:
        auth_token = get_auth_token(inputs)
        headers = {'Authorization': f'Bearer {auth_token}'}
        agentset_url = os.environ.get('AGENTSET_URL', 'http://agentset:5100')
        response = requests.post(
            f"{agentset_url}/agent/{agent_id}/updatePrompt",
            json={"lessonLearned": lesson_learned},
            headers=headers,
            timeout=10
        )

        if response.status_code == 200:
            logger.info(f"Successfully updated system prompt for agent {agent_id}")
            return True
        else:
            logger.warning(f"Failed to update system prompt for agent {agent_id}: {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"Error updating system prompt for agent {agent_id}: {e}")
        return False


def generate_lesson_learned(agent_id: str, current_task: str, performance_data: Dict[str, Any], plan_history: List[Dict]) -> Optional[str]:
    """
    Generate a lesson learned based on agent performance and recent failures.

    Args:
        agent_id: The agent ID
        current_task: The current task being performed
        performance_data: Performance metrics by task
        plan_history: History of executed steps

    Returns:
        Lesson learned string or None if no lesson needed
    """
    try:
        # Extract recent failures from plan history
        recent_failures = []
        for step in plan_history[-5:]:  # Look at last 5 steps
            if isinstance(step, dict) and not step.get('success', True):
                action_verb = step.get('actionVerb', 'UNKNOWN')
                error = step.get('error', 'Unknown error')
                recent_failures.append(f"{action_verb}: {error}")

        # Analyze performance data
        if not performance_data:
            if recent_failures:
                return f"Implement proper error handling and validation for {recent_failures[0].split(':')[0]} tasks to prevent similar failures."
            return None

        # Find tasks with low success rates
        low_performance_tasks = []
        for task, metrics in performance_data.items():
            if isinstance(metrics, dict):
                success_rate = metrics.get('successRate', 100)
                task_count = metrics.get('taskCount', 0)
                if success_rate < 70 and task_count > 2:
                    low_performance_tasks.append((task, success_rate))

        # Generate lesson based on analysis
        if recent_failures:
            # Priority 1: Address recent failures
            failure = recent_failures[0]
            action_verb, error = failure.split(':', 1)

            if 'timeout' in error.lower():
                return f"When executing {action_verb} tasks, implement proper timeout handling and retry logic for network operations."
            elif 'missing' in error.lower() or 'required' in error.lower():
                return f"Before executing {action_verb} tasks, validate that all required inputs are present and properly formatted."
            elif 'format' in error.lower() or 'parse' in error.lower():
                return f"When working with {action_verb} tasks, ensure data is properly formatted and validated before processing."
            else:
                return f"Improve error handling in {action_verb} tasks by implementing comprehensive validation and providing clear error messages."

        elif low_performance_tasks:
            # Priority 2: Address low performance tasks
            task, success_rate = low_performance_tasks[0]
            return f"Improve {task} task execution by implementing more thorough input validation and breaking complex operations into smaller steps. Current success rate: {success_rate:.1f}%"

        # No specific lesson needed
        return None

    except Exception as e:
        logger.error(f"Error generating lesson learned: {e}")
        return None


if __name__ == "__main__":
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            main()
            break
        except ReflectError as e:
            if getattr(e, 'error_type', None) != "critical_error" and attempt < max_attempts:
                logger.warning(f"Recoverable ReflectError: {e}, attempt {attempt} - retrying...")
                continue
            logger.error(f"Critical ReflectError: {e}")
            print(json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": getattr(e, 'error_type', 'error'),
                "resultDescription": f"REFLECT execution failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }]))
            break
        except Exception as e:
            logger.error(f"REFLECT execution failed: {e}")
            if attempt < max_attempts:
                logger.warning(f"Recoverable exception, attempt {attempt} - retrying...")
                continue
            print(json.dumps([{ 
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"REFLECT execution failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }]))
            break