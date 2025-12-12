#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Streamlined Version
Handles mission planning and novel action verbs with LLM-driven approach
"""

import uuid
import json
import logging
import time
import requests
import re
import sys
import os
from typing import Dict, Any, List, Optional, Set

# Import from the installed shared library package
try:
    from plan_validator import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA
except ImportError:
    # Fallback to direct import for development/testing
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'shared', 'python', 'lib')))
    from plan_validator import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA

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

progress = ProgressTracker()

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get the specific authentication token for the Brain service from inputs."""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise AccomplishError("No Brain authentication token found", "auth_error")

def discover_tools(query: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Discover tools/plugins by querying the Librarian service's /tools/search endpoint."""
    if inputs.get('__disable_tool_discovery', {}).get('value', False):
        logger.info("Tool discovery is explicitly disabled.")
        return []
    try:
        auth_token = get_auth_token(inputs)
        librarian_url_input = inputs.get('librarian_url')
        if isinstance(librarian_url_input, dict) and 'value' in librarian_url_input:
            librarian_url = librarian_url_input['value']
        else:
            librarian_url = librarian_url_input if librarian_url_input is not None else 'librarian:5040'

        headers = {'Authorization': f'Bearer {auth_token}'}
        logger.info(f"Discovering tools from Librarian with query: {query}")
        response = requests.get(f"http://{librarian_url}/tools/search?q={query}", headers=headers, timeout=10)
        response.raise_for_status()
        discovered_plugins = response.json()
        if discovered_plugins and isinstance(discovered_plugins, list):
            logger.info(f"Successfully discovered {len(discovered_plugins)} plugins from Librarian.")
            return discovered_plugins
        logger.info("Tool discovery returned no plugins.")
        return []
    except Exception as e:
        logger.warning(f"Tool discovery via /tools/search failed: {e}. Proceeding without discovered tools.")
        return []


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
        response = requests.get(f"http://{librarian_url}/loadData/{mission_id}?collection=missions", headers=headers, timeout=30)
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

def call_brain(prompt: str, inputs: Dict[str, Any], response_type: str = "json") -> tuple[str, str]:
    """Call Brain service with proper authentication and conversation type

    Returns:
        tuple: (response_string, request_id) - The response and the Brain request ID for tracking
    """
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

        # Explicitly set responseType so Brain.createThreadFromRequest doesn't infer it
        # from message content. Use 'json' for structured outputs and 'text' for prose.
        payload = {
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "conversationType": conversation_type,
            "responseType": "json" if response_type == 'json' else 'text',
            "temperature": 0.1
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {auth_token}'
        }

        logger.debug(f"Brain URL: http://{brain_url}/chat")
        logger.debug(f"Payload size: {len(json.dumps(payload))}")
        response = requests.post(
            f"http://{brain_url}/chat",
            json=payload,
            headers=headers,
            timeout=600  # Increased timeout to 600 seconds to allow more time for Brain response
        )

        if response.status_code != 200:
            raise AccomplishError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'result' not in result:
            raise AccomplishError("Brain response missing result", "brain_response_error")

        raw_brain_response = result['result']
        request_id = result.get('requestId', '')  # Get the Brain request ID for tracking

        if response_type == 'text':
            progress.checkpoint("brain_call_success_text_response")
            return raw_brain_response, request_id

        # Attempt to extract clean JSON from the raw response
        extracted_json_str = _extract_json_from_string(raw_brain_response)

        if extracted_json_str:
            try:
                # Validate that the extracted string is indeed valid JSON
                json.loads(extracted_json_str)
                progress.checkpoint("brain_call_success")
                return extracted_json_str, request_id
            except json.JSONDecodeError as e:
                logger.warning(f"Extracted JSON is still invalid: {e}. Full raw response: {raw_brain_response}") # Log full raw response on error
                # Fallback to raw response if extraction fails
                progress.checkpoint("brain_call_success_with_warning")
                return raw_brain_response, request_id
        else:
            logger.warning(f"Could not extract JSON from Brain response. Full raw response: {raw_brain_response}") # Log full raw response
            progress.checkpoint("brain_call_success_with_warning")
            return raw_brain_response, request_id

    except Exception as e:
        progress.checkpoint("brain_call_failed")
        logger.error(f"Brain call failed: {e}")
        raise AccomplishError(f"Brain service call failed: {e}", "brain_error")


def report_logic_failure_to_brain(request_id: str, inputs: Dict[str, Any], reason: str) -> None:
    """Report a logic failure back to the Brain service so it can penalize the model

    Args:
        request_id: The Brain request ID from the original call
        inputs: Plugin inputs containing auth token and brain URL
        reason: Description of why this was a logic failure
    """
    if not request_id:
        logger.warning("Cannot report logic failure: no request ID available")
        return

    try:
        auth_token = get_auth_token(inputs)
        brain_url_input = inputs.get('brain_url')
        if isinstance(brain_url_input, dict) and 'value' in brain_url_input:
            brain_url = brain_url_input['value']
        else:
            brain_url = brain_url_input if brain_url_input is not None else 'brain:5070'

        payload = {
            "requestId": request_id,
            "logicFailure": True,
            "reason": reason
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {auth_token}'
        }

        response = requests.post(
            f"http://{brain_url}/reportLogicFailure",
            json=payload,
            headers=headers,
            timeout=10
        )

        if response.status_code == 200:
            logger.info(f"Successfully reported logic failure for request {request_id}: {reason}")
        else:
            logger.warning(f"Failed to report logic failure: {response.status_code} - {response.text}")

    except Exception as e:
        logger.warning(f"Error reporting logic failure to Brain: {e}")


def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and normalize the plugin stdin JSON payload into a dict of inputName -> InputValue.

    Plugins should accept inputs formatted as a JSON array of [ [key, value], ... ] where value
    may be a primitive (string/number/bool), or an object like {"value": ...}. This helper
    normalizes non-dict raw values into {'value': raw}. It also filters invalid entries.
    """
    try:
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

        return inputs

    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise AccomplishError(f"Input validation failed: {e}", "input_error")

def _create_detailed_plugin_guidance(available_plugins: List[Dict[str, Any]]) -> str:
    """Creates a detailed guidance string from a list of available plugins."""
    if not available_plugins:
        return "\n--- AVAILABLE PLUGINS ---\nNo plugins discovered or provided. You must generate a plan using novel verbs with clear descriptions.\n--------------------"

    guidance_lines = ["\n--- AVAILABLE PLUGINS ---"]
    for plugin in available_plugins:
        if isinstance(plugin, dict):
            action_verb = plugin.get('verb', 'UNKNOWN')
            description = plugin.get('description', 'No description available.')
            guidance_lines.append(f"- {action_verb}: {description}")
    guidance_lines.append("--------------------")
    
    return "\n".join(guidance_lines)

class RobustMissionPlanner:
    """Streamlined LLM-driven mission planner"""
    
    def __init__(self, discovered_plugins: List[Dict[str, Any]]):
        self.max_retries = 5
        self.max_llm_switches = 2
        
        # Initialize the validator with the discovered plugins
        self.validator = PlanValidator(
            brain_call=call_brain,
            available_plugins=discovered_plugins,
            report_logic_failure_call=report_logic_failure_to_brain
        )
        self.discovered_plugins = discovered_plugins

    def plan(self, inputs: Dict[str, Any]) -> str:
        """Main interface method - create plan and return as JSON string"""
        goal_input = inputs.get('goal')
        if isinstance(goal_input, dict) and 'value' in goal_input:
            goal = str(goal_input['value']).strip()
        else:
            goal = str(goal_input).strip() if goal_input is not None else ''

        mission_id_input = inputs.get('missionId')
        if isinstance(mission_id_input, dict) and 'value' in mission_id_input:
            mission_id = mission_id_input['value']
        else:
            mission_id = mission_id_input if mission_id_input is not None else None

        mission_goal = get_mission_goal(mission_id, inputs)

        if not goal and mission_goal:
            goal = mission_goal
        
        if not goal:
            if mission_id and mission_goal is None:
                logger.warning(f"Could not fetch mission goal for {mission_id} due to connection issues. Using fallback approach.")
                goal = f"Continue working on mission {mission_id} using available context and previous work products."
            else:
                logger.error(f"Missing required 'goal' or a valid 'missionId' that resolves in {inputs}")
                raise AccomplishError("Missing required 'goal' or a valid 'missionId' that resolves to a goal.", "input_error")
        
        plan = self.create_plan(goal, mission_goal, mission_id, inputs)

        plugin_output = {
            "success": True,
            "name": "plan",
            "resultType": "plan",
            "resultDescription": f"A plan to: {goal[:100]}{'...' if len(goal) > 100 else ''}",
            "result": plan,
            "mimeType": "application/json"
        }

        return json.dumps([plugin_output], indent=2)

    def _inject_progress_checks(self, plan: List[Dict[str, Any]], goal: str, mission_id: Optional[str], inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not plan:
            return []

        plugin_map = {plugin.get('verb'): plugin for plugin in self.discovered_plugins}
        if 'REFLECT' not in plugin_map:
            logger.info("REFLECT plugin not discovered, cannot inject progress checks.")
            return plan

        all_outputs = set()
        for step in plan:
            if 'outputs' in step and isinstance(step['outputs'], dict):
                all_outputs.update(step['outputs'].keys())

        last_step = plan[-1]
        last_step_outputs = list(last_step.get('outputs', {}).keys())
        if not last_step_outputs:
            last_step_outputs = ["completion"]

        reflection_question = (
            f"Analyze the effectiveness of the executed plan against the mission goal:\n"
            f"1. Have all objectives been met?\n"
            f"2. What specific outcomes were achieved?\n"
            f"3. What challenges or gaps emerged?\n"
            f"4. What adjustments or additional steps are needed?"
        )

        reflect_inputs = {
            "missionId": {"value": mission_id, "valueType": "string"},
            "plan_history": {
                "value": f"{json.dumps(plan)}",
                "valueType": "string"
            },
            "question": {"value": reflection_question, "valueType": "string"},
        }

        if last_step_outputs:
            reflect_inputs[last_step_outputs[0]] = {
                "outputName": last_step_outputs[0],
                "sourceStep": last_step['id']
            }

        try:
            auth_token = get_auth_token(inputs)
            librarian_url_input = inputs.get('librarian_url')
            if isinstance(librarian_url_input, dict) and 'value' in librarian_url_input:
                librarian_url = librarian_url_input['value']
            else:
                librarian_url = librarian_url_input if librarian_url_input is not None else 'librarian:5040'

            headers = {'Authorization': f'Bearer {auth_token}'}
            response = requests.get(f"http://{librarian_url}/loadAllStepOutputs/{mission_id}", headers=headers, timeout=30)
            response.raise_for_status()
            work_products = response.json()
            reflect_inputs["work_products"] = {
                "value": json.dumps(work_products),
                "valueType": "string"
            }
        except Exception as e:
            logger.error(f"Error fetching work products for mission {mission_id}: {e}")
            reflect_inputs["work_products"] = {
                "value": "[]",
                "valueType": "string"
            }

        check_step = {
            "id": str(uuid.uuid4()),
            "actionVerb": "REFLECT",
            "description": "Analyze mission progress and effectiveness, determine if goals were met, and recommend next steps.",
            "inputs": reflect_inputs,
            "outputs": {
                "plan": "A detailed, step-by-step plan to achieve the goal...",
                "answer": "A direct answer or result, to be used only when a new plan is not necessary..."
            }
        }
        
        plan.append(check_step)

        return plan

    def create_plan(self, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create plan with mission-level awareness"""
        progress.checkpoint("planning_start")
        
        logger.info(f"ACCOMPLISH: Generating role-specific plan using two-phase process.")
        agent_role = inputs.get('agentRole', {}).get('value', 'General')
        structured_plan = self._generate_role_specific_plan(goal, mission_goal, mission_id, agent_role, inputs)
        
        logger.debug("Before calling validator.validate_and_repair.")
        validation_result = self.validator.validate_and_repair(structured_plan, goal, inputs)
        logger.debug("After calling validator.validate_and_repair.")

        if not validation_result.is_valid:
            error_summary = "; ".join(validation_result.get_error_messages()[:3])
            raise AccomplishError(
                f"Plan validation failed with {len(validation_result.errors)} un-fixable errors: {error_summary}",
                "validation_error"
            )
            
        validated_plan = validation_result.plan

        try:
            mission_id_for_check = mission_id
            plan_with_checks = self._inject_progress_checks(validated_plan, goal, mission_id_for_check, inputs)
            return plan_with_checks
        except Exception as e:
            logger.exception(f"❌ Failed to inject progress checks: {e}")
            return validated_plan

    def _generate_role_specific_plan(self, goal: str, mission_goal: Optional[str], mission_id: str, agent_role: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generates a plan tailored for a specific agent role."""
        try:
            prose_plan = self._get_prose_plan(goal, mission_goal, inputs)
        except Exception as e:
            logger.exception(f"❌ Failed to generate prose plan after all retries: {e}")
            raise AccomplishError(f"Could not generate a prose plan: {e}", "prose_plan_error")

        try:
            structured_plan = self._convert_to_structured_plan(prose_plan, goal, mission_goal, mission_id, inputs)
        except Exception as e:
            logger.exception(f"❌ Failed to convert prose plan to structured JSON after all retries: {e}")
            raise AccomplishError(f"Could not convert prose to structured plan: {e}", "json_conversion_error")
        
        return structured_plan

    def _get_prose_plan(self, goal: str, mission_goal: Optional[str], inputs: Dict[str, Any]) -> str:
        """Phase 1: Get a well-thought prose plan from LLM with retries."""
        context_input = inputs.get('context')
        context = context_input['value'] if isinstance(context_input, dict) and 'value' in context_input else (context_input or '')
        full_goal = f"MISSION: {mission_goal}\n\nTASK: {goal}" if mission_goal and mission_goal != goal else goal
        prompt = f"""You are an expert strategic planner and an autonomous agent. Your core purpose is to accomplish the user's mission by breaking it down into logical, functional steps. Your goal is to be resourceful and solve problems independently.

GOAL: {full_goal}

CONTEXT:
{context}

Create a comprehensive, high-level to mid-level functional plan to achieve the given goal. The plan should be a sequence of logical steps that describe *what* needs to be done, not the low-level implementation details. Think in terms of functional outcomes for each step.

Write a concise prose plan (5 to 10 logical steps) that explains the strategic approach.

CRITICAL PLANNING PRINCIPLES:
1. **Focus on Functional Decomposition**: Break the goal down into distinct phases or functional areas of work. For example, instead of "run search command", think "gather intelligence on competitors".
2. **Logical Flow**: Each step should logically follow from the previous one, creating a clear narrative for how the goal will be achieved.
3. **Avoid Implementation Details**: Do not mention specific tool names, commands, or actionVerbs. Focus on the 'what' and 'why' of each step, not the 'how'.
4. **High-Level Abstraction**: The plan should be at a strategic level. It will be converted into a more detailed, executable plan in a later phase.

EXAMPLE OF GOOD HIGH-LEVEL STEPS:
- "Analyze the competitive landscape to identify key differentiators."
- "Develop a content strategy to target identified user personas."
- "Create a proof-of-concept for the new feature."

IMPORTANT: Return ONLY plain text for the plan. NO markdown formatting, NO code blocks, NO special formatting.
"""
        for attempt in range(self.max_retries):
            try:
                response, request_id = call_brain(prompt, inputs, "text")
                if not response or len(response.strip()) < 50:
                    logger.warning(f"Attempt {attempt + 1}: LLM returned an insufficient prose plan.")
                    report_logic_failure_to_brain(request_id, inputs, "LLM returned insufficient prose plan (too short or empty)")
                    continue
                return response.strip()[:128000]
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} to get prose plan failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
        raise AccomplishError("Could not generate a valid prose plan after multiple attempts.", "prose_plan_error")
    
    def _convert_to_structured_plan(self, prose_plan: str, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 2: Convert prose plan to structured JSON with retries."""
        plugin_guidance = _create_detailed_plugin_guidance(self.discovered_plugins)
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)
        
        full_goal = f"MISSION: {mission_goal}\n\nTASK: {goal}" if mission_goal and mission_goal != goal else goal
        prompt = f"""You are an expert system for converting prose plans into structured JSON according to a strict schema.

**1. THE GOAL:**
---
{full_goal}
---

**2. THE PROSE PLAN:**
---
{prose_plan}
---

{plugin_guidance}

**3. THE JSON SCHEMA FOR THE ENTIRE PLAN (ARRAY OF STEPS):**
---
{schema_json}
---

**4. YOUR TASK:**
Follow these steps to create the final JSON output:

**STEP A: Internal Analysis & Self-Correction (Your Internal Monologue)**
1.  **Analyze:** Read the Goal and Prose Plan to fully understand the user's intent and the required sequence of actions.
2.  **Verify Schema:** Carefully study the JSON SCHEMA. Your output must follow it perfectly.
3.  **Restate the Plan as Explicit Steps:** Identify a list of steps that will be taken to achieve the Goal. Each Step should be a clear, actionable task with one or more outputs. Use known actionVerbs when suitable.
4.  **Check Dependencies & Data Types:** For each step, ensure its `inputs` correctly reference the `outputName` and `sourceStep`. Crucially, verify that the `valueType` of the source output matches the expected `valueType` of the target input.
5.  **CRITICAL - USE UNIQUE STRING IDs:** Every single step in the plan MUST have a unique string identifier in the "id" field. This ID does NOT have to be a UUID, but it MUST be unique within the entire plan. For example: "step_1", "step_2", etc. Do NOT reuse IDs.
6.  **Final Check:** Before generating the output, perform a final check to ensure the entire JSON structure is valid and fully compliant with the schema.

**STEP B: Generate Final JSON (Your Final Output)**
After your internal analysis and self-correction is complete, provide ONLY the final, valid JSON output. The root of the JSON object MUST be a key named "steps" containing the JSON array of plan steps.

Example format:
```json
{{
  "steps": [
    {{
      "id": "step_1_unique_identifier",
      "actionVerb": "...",
      ...
    }},
    {{
      "id": "step_2_another_one",
      "actionVerb": "...",
      ...
    }}
  ]
}}
```

---
**CRITICAL PLANNING PRINCIPLES (STRICTLY ENFORCED):**
---
- **Direct, Actionable Plans:** Prioritize using concrete, executable `actionVerbs` from the `AVAILABLE PLUGINS` list. Your goal is to produce the most direct and actionable plan possible. Avoid creating abstract or novel verbs if the task can be accomplished with a sequence of known verbs.
- **Autonomy is Paramount:** Your goal is to *solve* the mission, not to delegate research or information gathering back to the user.
- **Resourcefulness:** Exhaust all available tools (`SEARCH`, `SCRAPE`, `GENERATE`, `QUERY_KNOWLEDGE_BASE`) to find answers and create deliverables *before* ever considering asking the user.
- **Create Deliverables with `FILE_OPERATION`:** If a step's output is marked with `isDeliverable: true`, you **MUST** add a subsequent step using `FILE_OPERATION` with the `write` operation to save the output to the specified `filename`. This is essential for the user to see the work.
- **Share Work Before Asking:** Before generating an `ASK_USER_QUESTION` step that refers to a work product, you **MUST** ensure a preceding `FILE_OPERATION` step saves that product to a file for the user to review.
- **`ASK_USER_QUESTION` is a Last Resort:** This tool is exclusively for obtaining subjective opinions, approvals, or choices from the user. It is *never* for offloading tasks. Generating a plan that asks the user for information you can find yourself is a critical failure.
- **Dependencies are Crucial:** Every step that uses an output from a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. A plan with disconnected steps is invalid.
- **Role Assignment:** Assign `recommendedRole` at the deliverable level, not per individual step. All steps contributing to a single output (e.g., a research report) should share the same role.
- **Type Compatibility & Serialization:**
  - If a step output is an `object` or `array` and is to be used as an input that expects a `string`, you MUST explicitly serialize the object/array to a JSON string within the plan. For example, use a `TRANSFORM` step to `json.dumps()` the object before passing it to the `string` input.
  - If an `array` or `list` output is to be used as a `string` input, consider if the intention is to iterate over each item. If so, a `FOREACH` control flow verb will be automatically injected by the system.
- **Novel Action Verb Description:** If you propose a novel `actionVerb` (one not in the provided `AVAILABLE PLUGINS` list), you MUST provide a comprehensive `description` for that step, clearly explaining *what* the novel action verb does and *why* it's needed.

**DELIVERABLE IDENTIFICATION:**
When defining outputs, you MUST identify which ones are deliverables for the user:
- For final reports, analyses, or completed files, you MUST use the enhanced format:
  `"outputs": {{ "final_report": {{ "description": "A comprehensive analysis", "isDeliverable": true, "filename": "market_analysis_2025.md" }} }}

 - **CRITICAL - LINKING STEPS:** You MUST explicitly connect steps. Any step that uses the output of a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. DO NOT simply refer to previous outputs in a `prompt` string without also adding the formal dependency in the `inputs` object. For verbs like `THINK`, `CHAT`, or `ASK_USER_QUESTION`, if the `prompt` or `question` text refers to a file or work product from a previous step, you MUST add an input that references the output of that step using `sourceStep` and `outputName`. 
 A plan with no connections between steps is invalid and will be rejected.
- **CRITICAL - `sourceStep: '0'` Usage:**
  - Use `sourceStep: '0'` ONLY for inputs that are explicitly provided in the initial mission context (the "PARENT STEP INPUTS" section if applicable, or the overall mission goal). This is primarily for sub-steps within a `FOREACH` or similar control flow structure to reference an item from their direct parent.
  - DO NOT use `sourceStep: '0'` for top-level steps that are not nested within another step. Top-level steps should reference other preceding top-level steps by their actual UUID.
"""
        for attempt in range(self.max_retries):
            try:
                response, request_id = call_brain(prompt, inputs, "json")
                logger.info(f"Raw response from Brain (attempt {attempt+1}): {str(response)[:500]}...")
                try:
                    plan = json.loads(response)
                    if isinstance(plan, dict) and 'error' in plan:
                        raise AccomplishError(f"Brain returned an error: {plan['error'].get('message', 'Unknown')}", plan['error'].get('type', 'brain_error'))
                except Exception as e:
                    logger.warning(f"Attempt {attempt + 1}: JSON parsing failed: {e}. Response: {response}")
                    report_logic_failure_to_brain(request_id, inputs, f"LLM returned invalid JSON: {str(e)}")
                    if attempt == self.max_retries - 1:
                        raise AccomplishError(f"Failed to parse structured plan JSON: {e}", "json_parse_error")
                    continue

                if isinstance(plan, list) and all(isinstance(step, dict) for step in plan):
                    return plan
                if isinstance(plan, dict):
                    if 'steps' in plan and isinstance(plan['steps'], list):
                        return plan['steps']
                    for key, value in plan.items():
                        if isinstance(value, list) and value and isinstance(value[0], dict) and ('actionVerb' in value[0] or 'id' in value[0]):
                            return value
                
                logger.error(f"Attempt {attempt + 1}: Could not find a valid plan array in the response.")
                report_logic_failure_to_brain(request_id, inputs, "LLM response was valid JSON but did not contain a recognizable plan array.")
                if attempt == self.max_retries - 1:
                    raise AccomplishError("LLM failed to return a valid plan structure after multiple attempts.", "invalid_plan_format")
                continue
            except AccomplishError as e:
                logger.warning(f"Attempt {attempt + 1}: Brain call for JSON conversion failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}: Brain call for JSON conversion failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
        raise AccomplishError("Could not generate a valid structured plan after multiple attempts.", "json_conversion_error")

class NovelVerbHandler:
    """Handles novel action verbs by recommending plugins or providing direct answers"""

    def __init__(self, discovered_plugins: List[Dict[str, Any]]):
        self.max_retries = 3
        # Initialize the validator with the discovered plugins
        self.validator = PlanValidator(
            brain_call=call_brain, 
            available_plugins=discovered_plugins,
            report_logic_failure_call=report_logic_failure_to_brain
        )
        self.discovered_plugins = discovered_plugins


    def handle(self, inputs: Dict[str, Any]) -> str:
        try:
            verb_info = self._extract_verb_info(inputs)
            brain_response = self._ask_brain_for_verb_handling(verb_info, inputs)
            return self._format_response(brain_response, verb_info, inputs)
        except Exception as e:
            logger.error(f"Novel verb handling failed: {e}", exc_info=True)
            return json.dumps([{"success": False, "name": "error", "resultType": "error", "resultDescription": f"Novel verb handling failed: {str(e)}", "result": str(e), "mimeType": "text/plain"}])

    def _extract_verb_info(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Extract verb information from inputs"""
        if 'novel_actionVerb' in inputs:
            novel_verb_data = inputs['novel_actionVerb']
            if isinstance(novel_verb_data, dict):
                return {"id": novel_verb_data.get('id', 'novel_plugin'), "verb": novel_verb_data.get('verb', 'NOVEL_VERB'), "description": novel_verb_data.get('description', ''), "context": novel_verb_data.get('context', ''), "inputValues": novel_verb_data.get('inputValues', {}), "outputs": {},}
            elif isinstance(novel_verb_data, str):
                return {"id": "novel_plugin", "verb": "NOVEL_VERB", "description": novel_verb_data, "context": novel_verb_data, "inputValues": {}, "outputs": {}}
        return {"id": "novel_plugin", "verb": "NOVEL_VERB", "description": "A novel plugin.", "context": "", "inputValues": {}, "outputs": {}}
    
    def _ask_brain_for_verb_handling(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Ask Brain how to handle the novel verb"""
        verb = verb_info['verb']
        description = verb_info.get('description', 'No description provided')
        context = verb_info.get('context', description)
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)
        plugin_guidance = _create_detailed_plugin_guidance(self.discovered_plugins)

        prompt = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported.

VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}

PARENT STEP INPUTS: {json.dumps(inputs)}

{plugin_guidance}

Your task is to create a plan to accomplish the goal of the novel verb "{verb}" using available tools.

**CRITICAL OUTPUT FORMAT:**
- Your response MUST be a JSON array of step objects
- Even if the plan has only one step, it MUST be wrapped in an array: [{{"actionVerb": "...", ...}}]
- Do NOT return a single step object without the array wrapper
- Do NOT return any text outside the JSON array
- Return ONLY the JSON array, nothing else

**CRITICAL UUID REQUIREMENTS:**
- Each step MUST have a globally unique random UUID (version 4) in the "id" field
- Use random UUIDs like "a3f2c8d1-4b7e-4c9a-8f1d-2e5b6c7d8e9f"
- Do NOT use sequential patterns like "00000000-0000-4000-8000-000000000001"
- Do NOT reuse UUIDs anywhere in the plan

**CRITICAL CONSTRAINTS:**
- You MUST NOT use the novel verb "{verb}" in your plan - use available plugins instead
- Use existing action verbs from the available plugins listed below
- Break down the task into granular, atomic steps using available tools
- You are an autonomous agent - solve problems independently
- Do not use `ASK_USER_QUESTION` to seek information that can be found using `SEARCH` or `SCRAPE`
- **If you create a new actionVerb not listed in the AVAILABLE PLUGINS section, you MUST provide a comprehensive `description` for that step.** This description should clearly explain the purpose and functionality of the new action verb.

**Plan Schema (JSON Array of Steps):**
{schema_json}

- **CRITICAL for REQUIRED Inputs:** For each step, you MUST examine the `inputDefinitions` for the corresponding `actionVerb` and ensure that all `required` inputs are present in the step's `inputs` object. If an input is marked `required: true`, it MUST be provided.
- **CRITICAL for JSON compliance:** Ensure all string literals within the generated JSON, including any nested ones, strictly adhere to JSON standards by using double quotes.
- **CRITICAL for Plan Inputs, sourceStep:**
    - All inputs for each step must be explicitly defined either as a constant `value` or by referencing an `outputName` from a `sourceStep` within the plan or from the `PARENT STEP INPUTS`. Do not assume implicit data structures or properties of inputs.
    - Use `sourceStep: '0'` ONLY for inputs that are explicitly provided in the initial mission context (the "PARENT STEP INPUTS" section if applicable, or the overall mission goal). This is primarily for sub-steps within a `FOREACH` or similar control flow structure to reference an item from their direct parent.
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `id` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP INPUT" (using `sourceStep: '0'`) or from an output of a previous step in the plan.
- **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.
- **CRITICAL: Embedded References in Input Values:** If you use placeholders like `{{output_name}}` within a longer string value (e.g., a prompt that references previous outputs), you MUST also declare each referenced `output_name` as a separate input with proper `sourceStep` and `outputName`. For example, if a `prompt` refers to `competitor_details`, you need an input entry for `competitor_details` with `outputName` and `sourceStep`.

CRITICAL: The actionVerb for each step MUST be a valid, existing plugin actionVerb (from the provided list) or a descriptive, new actionVerb (e.g., 'ANALYZE_DATA', 'GENERATE_REPORT'). It MUST NOT be 'UNKNOWN' or 'NOVEL_VERB'.

CRITICAL: DELIVERABLE IDENTIFICATION - VERY IMPORTANT
When defining outputs, you MUST identify which ones are deliverables for the user. These are the key results that the user expects to receive.

- For reports, analyses, or completed files that are meant for the user, you MUST use the enhanced format including `"isDeliverable": true` and a `"filename"`.
- For intermediate data or outputs only used within the plan, use the simple format (DO NOT include `isDeliverable` or `filename`).
- Guidelines for deliverable filenames:
  * Use descriptive, professional names
  * Use appropriate file extensions (.md, .txt, .json, .csv, .pdf, etc.)
  * Avoid generic names like "output.txt" or "result.json"
"""

        for attempt in range(self.max_retries):
            try:
                response, request_id = call_brain(prompt, inputs, "json")
                return response
            except Exception as e:
                logger.error(f"Brain call failed for novel verb '{verb}': {e}")
                if attempt == self.max_retries - 1:
                    return json.dumps({"error": f"Brain call failed after multiple retries: {str(e)}"})
        return json.dumps({"error": "Brain call failed after multiple retries."})


    def _format_response(self, brain_response: Any, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            if isinstance(brain_response, (dict, list)):
                data = brain_response
            else:
                cleaned_response = _extract_json_from_string(str(brain_response))
                if not cleaned_response:
                    raise AccomplishError("Failed to extract JSON from Brain response for novel verb.", "json_parse_error")
                data = json.loads(cleaned_response)

            if isinstance(data, list): # This is a plan
                validation_result = self.validator.validate_and_repair(data, verb_info.get('description', ''), inputs)
                if not validation_result.is_valid:
                    raise AccomplishError(f"Generated plan for novel verb failed validation: {'; '.join(validation_result.get_error_messages())}", "validation_error")
                
                return json.dumps([{"success": True, "name": "plan", "resultType": "plan", "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'", "result": validation_result.plan, "mimeType": "application/json"}])
            
            elif isinstance(data, dict):
                # Search for a plan within the dictionary
                for key, value in data.items():
                    if isinstance(value, list) and value and isinstance(value[0], dict) and ('actionVerb' in value[0] or 'id' in value[0]):
                        validation_result = self.validator.validate_and_repair(value, verb_info.get('description', ''), inputs)
                        if not validation_result.is_valid:
                            raise AccomplishError(f"Generated plan for novel verb failed validation: {'; '.join(validation_result.get_error_messages())}", "validation_error")
                        return json.dumps([{"success": True, "name": "plan", "resultType": "plan", "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'", "result": validation_result.plan, "mimeType": "application/json"}])

                if "direct_answer" in data:
                    return json.dumps([{"success": True, "name": "direct_answer", "resultType": "direct_answer", "resultDescription": f"Direct answer for {verb_info['verb']}", "result": data["direct_answer"], "mimeType": "application/json"}])
                
                raise AccomplishError("Unexpected dictionary format from Brain for novel verb.", "invalid_response_format")
            else:
                raise AccomplishError("Unexpected response format from Brain for novel verb.", "invalid_response_format")

        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to parse or process Brain response in _format_response: {e}", exc_info=True)
            logger.error(f"Raw Brain response (type: {type(brain_response)}): {str(brain_response)[:500]}...")
            raise AccomplishError(f"Failed to process Brain response for novel verb: {e}", "json_parse_error")


class AccomplishOrchestrator:
    """Main orchestrator for ACCOMPLISH plugin"""

    def execute(self, inputs_str: str) -> str:
        """Main execution method with robust error handling and remediation."""
        progress.checkpoint("orchestrator_execute_start")

        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                inputs = parse_inputs(inputs_str)
                progress.checkpoint("input_processed")

                is_novel = self._is_novel_verb_request(inputs)
                query = ""
                if is_novel:
                    # Temporarily instantiate to extract info
                    verb_info = NovelVerbHandler([])._extract_verb_info(inputs)
                    query = verb_info.get('description', '')
                else:
                    query = inputs.get('goal', {}).get('value', '')
                
                if not query:
                    logger.warning("Discovery query is empty. Proceeding without discovered tools.")
                    discovered_plugins = []
                else:
                    discovered_plugins = discover_tools(query, inputs)

                if is_novel:
                    handler = NovelVerbHandler(discovered_plugins)
                    result = handler.handle(inputs)
                else:
                    handler = RobustMissionPlanner(discovered_plugins)
                    result = handler.plan(inputs)

                return result
            except AccomplishError as e:
                logger.error(f"Attempt {attempt}: AccomplishError - {e}", exc_info=True)
                if e.error_type != "critical_error" and attempt < max_attempts:
                    logger.warning("Retrying...")
                    continue
                return json.dumps([{"success": False, "name": "error", "resultType": e.error_type, "resultDescription": f"ACCOMPLISH execution failed: {str(e)}", "result": str(e), "mimeType": "text/plain"}])
            except Exception as e:
                logger.error(f"Attempt {attempt}: Unhandled exception - {e}", exc_info=True)
                if attempt < max_attempts:
                    logger.warning("Retrying...")
                    continue
                return json.dumps([{"success": False, "name": "error", "resultType": "error", "resultDescription": f"ACCOMPLISH execution failed: {str(e)}", "result": str(e), "mimeType": "text/plain"}])

    def _is_novel_verb_request(self, inputs: Dict[str, Any]) -> bool:
        """Check if this is a novel verb request"""
        return 'novel_actionVerb' in inputs

def main():
    """
    Main function to run the ACCOMPLISH plugin.
    Reads input from stdin, executes the orchestrator, and prints the result.
    """
    progress.checkpoint("main_start")

    orchestrator = AccomplishOrchestrator()
    progress.checkpoint("orchestrator_created")

    # Read input from stdin
    import sys
    input_data = sys.stdin.read()
    progress.checkpoint("input_read")
    
    if not input_data:
        logger.warning("Input data is empty. Exiting.")
        return

    # Execute with robust error handling
    result = orchestrator.execute(input_data)

    # Output result
    print(result)
    progress.checkpoint("plan_creation_complete")

# Main execution
if __name__ == "__main__":
    main()
