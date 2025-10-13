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
    """Get authentication token from inputs"""
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise AccomplishError("No authentication token found", "auth_error")

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
                logger.warning(f"Extracted JSON is still invalid: {e}. Full raw response: {raw_brain_response}") # Log full raw response on error
                # Fallback to raw response if extraction leads to invalid JSON
                progress.checkpoint("brain_call_success_with_warning")
                return raw_brain_response
        else:
            logger.warning(f"Could not extract JSON from Brain response. Full raw response: {raw_brain_response}") # Log full raw response
            progress.checkpoint("brain_call_success_with_warning")
            return raw_brain_response

    except Exception as e:
        progress.checkpoint("brain_call_failed")
        logger.error(f"Brain call failed: {e}")
        raise AccomplishError(f"Brain service call failed: {e}", "brain_error")

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

def _create_detailed_plugin_guidance(inputs: Dict[str, Any]) -> str:
    """Create a detailed list of available plugins with input specs and descriptions."""
    available_plugins_input = inputs.get('availablePlugins', {})
    available_plugins = available_plugins_input.get('value', []) if isinstance(available_plugins_input, dict) else available_plugins_input
    if not available_plugins:
        return "No plugins are available for use in the plan."

    guidance_lines = ["Available Plugins & Input Specifications:"]
    for plugin in available_plugins:
        if isinstance(plugin, dict): # Defensive check
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
                    guidance_lines.append(f"    - {input_name} (type: {value_type}){ ' (REQUIRED)' if input_def.get('required') else ''}: {input_desc}")
            else:
                guidance_lines.append("  Inputs: None required.")
            guidance_lines.append(f"{input_guidance}")
        else:
            # Handle case where plugin is not a dictionary (e.g., a string)
            guidance_lines.append(f"\nPlugin: {plugin} (Details not available - unexpected format)")
    return "\n".join(guidance_lines)

class RobustMissionPlanner:
    """Streamlined LLM-driven mission planner"""
    
    def __init__(self):
        self.max_retries = 3
        self.max_llm_switches = 2
        self.validator = PlanValidator(brain_call=call_brain)
    
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
            # If we have a mission_id but couldn't fetch the goal due to connection issues,
            # try to provide a reasonable fallback instead of failing completely
            if mission_id and mission_goal is None:
                logger.warning(f"Could not fetch mission goal for {mission_id} due to connection issues. Using fallback approach.")
                goal = f"Continue working on mission {mission_id} using available context and previous work products."
            else:
                logger.error(f"Missing required 'goal' or a valid 'missionId' that resolves in {inputs}")
                logger.error(f"Goal:{goal}")
                logger.error(f"Goal Input:{goal_input}")
                logger.error(f"Mission Id:{mission_id}")
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

        available_plugins_input = inputs.get('availablePlugins', {})
        available_plugins = available_plugins_input.get('value', []) if isinstance(available_plugins_input, dict) else available_plugins_input
        plugin_map = {plugin.get('actionVerb'): plugin for plugin in available_plugins}
        if 'REFLECT' not in plugin_map:
            return plan

        all_outputs = set()
        for step in plan:
            if 'outputs' in step and isinstance(step['outputs'], dict):
                all_outputs.update(step['outputs'].keys())

        completed_steps_summary = f"The following outputs have been produced: {', '.join(all_outputs)}"

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

        # Create REFLECT step with proper dependencies on the last step's outputs
        reflect_inputs = {
            "missionId": {"value": mission_id, "valueType": "string"},
            "plan_history": {
                "value": f"{json.dumps(plan)}",
                "valueType": "string"
            },
            "question": {"value": reflection_question, "valueType": "string"}
        }

        plan_history_from_inputs = inputs.get('plan_history', '[]')
        if isinstance(plan_history_from_inputs, dict) and 'value' in plan_history_from_inputs:
            plan_history_str = plan_history_from_inputs['value']
        else:
            plan_history_str = plan_history_from_inputs

        reflect_inputs["work_products"] = {
            "value": plan_history_str,
            "valueType": "string"
        }

        check_step = {
            "number": len(plan) + 1,
            "actionVerb": "REFLECT",
            "description": "Analyze mission progress and effectiveness, determine if goals were met, and recommend next steps.",
            "inputs": reflect_inputs,
            "outputs": {
                "plan": "A detailed, step-by-step plan to achieve the goal. Each step in the plan should be a concrete action that can be executed by another plugin. The plan should be comprehensive and sufficient to fully accomplish the goal.",
                "answer": "A direct answer or result, to be used only when a new plan is not necessary because the goal has been met."
            }
        }
        
        plan.append(check_step)
        
        for i, step in enumerate(plan):
            step['number'] = i + 1

        return plan

    def create_plan(self, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create a robust plan using a decoupled, multi-phase LLM approach with retries."""
        progress.checkpoint("planning_start")

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

        try:
            validated_plan = self.validator.validate_and_repair(structured_plan, goal, inputs)
        except Exception as e:
            logger.exception(f"❌ Failed to validate and repair the plan after all retries: {e}")
            raise AccomplishError(f"Could not validate or repair the plan: {e}", "validation_error")

        try:
            mission_id_input = inputs.get('missionId')
            mission_id_for_check = None
            if isinstance(mission_id_input, dict) and 'value' in mission_id_input:
                mission_id_for_check = mission_id_input['value']
            else:
                mission_id_for_check = mission_id_input
            plan_with_checks = self._inject_progress_checks(validated_plan, goal, mission_id_for_check, inputs)
            return plan_with_checks
        except Exception as e:
            logger.exception(f"❌ Failed to inject progress checks: {e}")
            return validated_plan


    def _get_prose_plan(self, goal: str, mission_goal: Optional[str], inputs: Dict[str, Any]) -> str:
        """Phase 1: Get a well-thought prose plan from LLM with retries."""

        context_input = inputs.get('context')
        context = context_input if context_input is not None else ''
        full_goal = f"MISSION: {mission_goal}\n\nTASK: {goal}" if mission_goal and mission_goal != goal else goal
        prompt = f"""You are an expert strategic planner and an autonomous agent. Your core purpose is to accomplish the user's mission and complete tasks *for* the user, not to delegate them back. Create a comprehensive, well-thought plan to achieve the given goal:

GOAL: {full_goal}

CONTEXT:
{context}

Write a concise prose plan (5 to 10 logical steps) that explains the strategic approach.

IMPORTANT: Return ONLY plain text for the plan. NO markdown formatting, NO code blocks, NO special formatting.

"""

        for attempt in range(self.max_retries):
            try:
                response = call_brain(prompt, inputs, "text")
                if not response or len(response.strip()) < 50:
                    logger.warning(f"Attempt {attempt + 1}: LLM returned an insufficient prose plan.")
                    continue
                
                # Truncate the prose plan to a maximum of 16000 characters
                # Increased truncation limit to 128000 characters to avoid cutting off the plan
                truncated_response = response.strip()[:128000]
                return truncated_response
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} to get prose plan failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
        
        raise AccomplishError("Could not generate a valid prose plan after multiple attempts.", "prose_plan_error")
    
    def _convert_to_structured_plan(self, prose_plan: str, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 2: Convert prose plan to structured JSON with retries."""

        plugin_guidance = _create_detailed_plugin_guidance(inputs)
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

**3. THE JSON SCHEMA FOR THE ENTIRE PLAN (ARRAY OF STEPS):**
---
{schema_json}
---

**4. YOUR TASK:**
Follow these steps to create the final JSON output:

**STEP A: Internal Analysis & Self-Correction (Your Internal Monologue)**
1.  **Analyze:** Read the Goal and Prose Plan to fully understand the user's intent and the required sequence of actions.
2.  **Verify Schema:** Carefully study the JSON SCHEMA. Your output must follow it perfectly.
3.  **Restate the Plan as Explicit Steps:** Identify a list of steps that will be taken to achieve the Goal. Each Step should be a clear, actionable task with one or more outputs.
4.  **Check Dependencies & Data Types:** For each step, ensure its `inputs` correctly reference the `outputName` and `sourceStep`. Crucially, verify that the `valueType` of the source output matches the expected `valueType` of the target input.
5.  **CRITICAL - Ensure Globally Unique Step Numbers:** Every step must have a globally unique step number across the entire plan including all sub-plans at any nesting level. Do not reuse step numbers anywhere in the plan.
6.  **Final Check:** Before generating the output, perform a final check to ensure the entire JSON structure is valid and fully compliant with the schema.

**STEP B: Generate Final JSON (Your Final Output)**
After your internal analysis and self-correction is complete, provide ONLY the final, valid JSON array of steps.

---
**CRITICAL DEPENDENCY RULES (STRICTLY ENFORCED):**
---

**CRITICAL: GLOBALLY UNIQUE STEP NUMBERS - Every step must have a globally unique step number across the entire plan including all sub-plans at any nesting level. Do not reuse step numbers anywhere in the plan.**

**THE GOLDEN RULE OF DEPENDENCIES: A step can ONLY depend on the outputs of PRECEDING steps. A step can NEVER depend on itself.**

**Handling Lists (Arrays) - CRITICAL FOREACH USAGE:**
    - If a step (e.g., `SCRAPE`) requires a single item (e.g., a URL as a `string`) but a previous step (e.g., `SEARCH`) provides a list of items (an `array`), you MUST use a `FOREACH` loop.
    - The `FOREACH` step's `array` input MUST depend on the array output from the source step (e.g., `sourceStep: 1`, `outputName: "competitorList"`).
    - The step(s) inside the `FOREACH`'s `steps` sub-array that consume the individual items MUST reference the `FOREACH` step itself as their `sourceStep` and `item` as their `outputName`.
    - **VERY IMPORTANT**: The `item` provided by `FOREACH` is a SINGLE item from the list. The `valueType` for an input consuming `item` should be the type of that single item (e.g., `string`), NOT `array`.
    - **CRITICAL for FILE_OPERATION content:** The `content` input for `FILE_OPERATION` MUST always be a `string`. Do NOT use boolean outputs (e.g., `success` from `CHAT` verbs) as content for `FILE_OPERATION`.
- **Multi-step plans are essential:** Break down complex goals into multiple, sequential steps.
- **Dependencies are crucial for flow:** Every step that uses an output from a previous step MUST declare that dependency in its `inputs` object using `outputName` and `sourceStep`.
- **Prioritize autonomous information gathering:** Use tools like SEARCH, SCRAPE, DATA_TOOLKIT, TEXT_ANALYSIS, TRANSFORM, and FILE_OPERATION to gather information and perform tasks.
- **Avoid unnecessary user interaction:** Only use 'ASK_USER_QUESTION' for decisions, permissions, or clarification. Do NOT use it for seeking advice, delegating research or data collection that the agent can perform.
- **CHAT vs ASK_USER_QUESTION:** Use ASK_USER_QUESTION for structured questions requiring user input. Use CHAT sparingly and only when you need to communicate critical information, final results, or important decisions to the user. Avoid routine status updates or progress notifications.
- **Avoid repetitive steps:** Do not create multiple identical or nearly identical steps. Each step should serve a distinct purpose in achieving the goal.
**Role Assignment Strategy:**
- Assign `recommendedRole` at the **deliverable level**, not per-step optimization
- All steps contributing to a single coherent output (e.g., "research report", "code module", "analysis document") should share the same `recommendedRole`
- Only change `recommendedRole` when transitioning to a fundamentally different type of deliverable
- Example: Steps 1-5 all produce research for a report → all get `recommendedRole: "researcher"`
- Counter-example: Don't switch roles between gathering data (step 1) and formatting it (step 2) if they're part of the same research deliverable

**DELIVERABLE IDENTIFICATION:**
When defining outputs, identify which ones are final deliverables that the user will want to see:
- For outputs that represent final results, reports, or completed work products, use the enhanced format:
  ```json
  "outputs": {{
    "final_report": {{
      "description": "A comprehensive analysis report",
      "isDeliverable": true,
      "filename": "market_analysis_2025.md"
    }}
  }}
  ```
- For intermediate outputs used only by subsequent steps, use the simple string format:
  ```json
  "outputs": {{
    "research_data": "Raw research data for analysis"
  }}
  ```
- Guidelines for deliverable filenames:
  * Use descriptive, professional names
  * Include relevant dates or versions when appropriate
  * Use appropriate file extensions (.md, .txt, .json, .csv, .pdf, etc.)
  * Avoid generic names like "output.txt" or "result.json"
  * Examples: "quarterly_sales_report_2025.md", "competitor_analysis.json", "user_survey_results.csv"
- Mark outputs as deliverables when they are:
  * Final reports or analyses
  * Completed documents or files
  * Summary results that users will reference
  * Data exports or processed datasets
- Do NOT mark as deliverables:
  * Intermediate data used only by subsequent steps
  * Temporary processing results
  * Internal state or configuration data

- **CRITICAL for sourceStep:**
    - Use `sourceStep: 0` ONLY for inputs that are explicitly provided in the initial mission context (the "PARENT STEP INPUTS" section if applicable, or the overall mission goal).
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `number` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP INPUT" (using `sourceStep: 0`) or from an output of a previous step in the plan.
- **Example for `sourceStep`:** If Step 2 needs `research_results` from Step 1, and Step 1 outputs `{{ "research_results": "..." }}`, then Step 2's inputs would be `{{ "research": {{"outputName": "research_results", "sourceStep": 1, "valueType": "string"}} }}`.
- **Completeness:** The generated plan must be a complete and executable plan that will fully accomplish the goal. It should not be a partial plan or an outline. It should include all the necessary steps to produce the final deliverables.
- **Iterative Processes/Feedback Loops:** If the prose plan describes a continuous feedback loop, iterative process, or any form of repetition, you MUST translate this into an appropriate looping construct (e.g., using 'WHILE', 'REPEAT', or 'FOREACH' actionVerbs) within the JSON plan. Do not simply list the steps once if they are intended to be repeated.
- **VERY IMPORTANT**: For each step, you MUST examine the `inputDefinitions` for the corresponding `actionVerb` and ensure that all `required` inputs are present in the step's `inputs` object.

CRITICAL: The actionVerb for each step MUST be a valid, existing plugin actionVerb (from the provided list) or a descriptive, new actionVerb (e.g., 'ANALYZE_DATA', 'GENERATE_REPORT'). It MUST NOT be 'UNKNOWN' or 'NOVEL_VERB'.

**CRITICAL - LINKING STEPS:** You MUST explicitly connect steps. Any step that uses the output of a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. DO NOT simply refer to previous outputs in a `prompt` string without also adding the formal dependency in the `inputs` object. 
A plan with no connections between steps is invalid and will be rejected.

{plugin_guidance}

CRITICAL PLANNING_PRINCIPLES:
- **Autonomous Execution:** Your primary role is to complete tasks independently. Prioritize autonomous information gathering using SEARCH, SCRAPE, API_CLIENT, and other research tools.
- **Strategic Use of User Questions:** Use the ASK_USER_QUESTION verb *only* when information is truly unobtainable through your own tools (e.g., subjective opinions, personal preferences, or explicit permissions). Do NOT use it to ask the user for information you can find yourself or to delegate tasks back to them.
- Design plans that can execute independently without requiring user input for factual information.
- Use available tools and APIs to gather data rather than asking users to provide it.
"""

        for attempt in range(self.max_retries):
            try:
                response = call_brain(prompt, inputs, "json")
                plan = json.loads(response)
                
                if isinstance(plan, dict):
                    # Check if it's an object with numeric keys (like "0", "1", ...)
                    is_numeric_keyed_object = True
                    converted_plan_list = []
                    for key in sorted(plan.keys(), key=int): # Sort keys to maintain order
                        if key.isdigit():
                            converted_plan_list.append(plan[key])
                        else:
                            is_numeric_keyed_object = False
                            break
                    
                    if is_numeric_keyed_object:
                        logger.warning(f"Attempt {attempt + 1}: LLM returned a JSON object with numeric keys. Converting to array.")
                        plan = converted_plan_list # Assign the converted list to plan

                if isinstance(plan, list): # Now, if plan is a list (either originally or after conversion)
                    return plan # Return the processed plan
                else:
                    logger.warning(f"Attempt {attempt + 1}: Response is not a JSON array. Response: {response}")
                    continue

            except json.JSONDecodeError as e:
                logger.warning(f"Attempt {attempt + 1}: JSON parsing failed: {e}. Response: {response}")
                if attempt == self.max_retries - 1:
                    raise AccomplishError(f"Failed to parse structured plan JSON: {e}", "json_parse_error")
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1}: Brain call for JSON conversion failed: {e}")
                if attempt == self.max_retries - 1:
                    raise # Re-raise the last exception

        raise AccomplishError("Could not generate a valid structured plan after multiple attempts.", "json_conversion_error")

class NovelVerbHandler:
    """Handles novel action verbs by recommending plugins or providing direct answers"""

    def __init__(self):
        self.validator = PlanValidator(brain_call=call_brain)
        self.goal_planner = RobustMissionPlanner()

    def handle(self, inputs: Dict[str, Any]) -> str:
        try:

            # Extract verb information
            verb_info = self._extract_verb_info(inputs)

            # Ask Brain for handling approach
            brain_response = self._ask_brain_for_verb_handling(verb_info, inputs)

            # Interpret and format response
            return self._format_response(brain_response, verb_info, inputs)

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

            if isinstance(novel_verb_data, dict):
                # Assume it's already the structured format
                return {
                    "id": novel_verb_data.get('id', 'novel_plugin'),
                    "verb": novel_verb_data.get('verb', 'NOVEL_VERB'),
                    "description": novel_verb_data.get('description', ''),
                    "context": novel_verb_data.get('context', ''),
                    "inputValues": novel_verb_data.get('inputValues', {}),
                    "outputs": {},
                }
            elif isinstance(novel_verb_data, str):
                # Simple string format
                return {
                    "id": "novel_plugin",
                    "verb": "NOVEL_VERB",
                    "description": novel_verb_data,
                    "context": novel_verb_data,
                    "inputValues": {},
                    "outputs": {}
                }
            else:
                logger.warning(f"novel_actionVerb is an unexpected type: {type(novel_verb_data)}")

        # Fallback
        return {
            "id": "novel_plugin",
            "verb": "NOVEL_VERB",
            "description": "A novel plugin.",
            "context": "",
            "inputValues": {},
            "outputs": {}
        }
    
    def _ask_brain_for_verb_handling(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Ask Brain how to handle the novel verb"""
        verb = verb_info['verb']
        description = verb_info.get('description', 'No description provided')
        context = verb_info.get('context', description)
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)
        plugin_guidance = _create_detailed_plugin_guidance(inputs)

        prompt = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported.

VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}

PARENT STEP INPUTS: {json.dumps(inputs)}

Your task is to determine the best way to accomplish the goal of the novel verb "{verb}". Consider these options in order of preference:

1.  **Provide a Direct Answer:** If the task is simple enough to be answered directly with the given context and available tools, provide a JSON object with a single key "direct_answer".
2.  **Create a Plan:** If the task is complex and requires multiple steps, breaking it down into a sequence of actions using available tools, then create a plan. The plan should be a JSON array of steps. This is the preferred option for complex tasks that can be broken down.
3.  **Recommend a Plugin:** If the task requires a new, complex, and reusable capability that is not covered by existing tools and would be beneficial for future use, recommend the development of a new plugin by providing a JSON object with a "plugin" key.

**CRITICAL CONSTRAINTS:**
- You MUST NOT use the novel verb "{verb}" in your plan.
- You are an autonomous agent. Your primary goal is to solve problems independently.
- Do not use the `ASK_USER_QUESTION` verb to seek information from the user that can be found using other tools like `SEARCH` or `SCRAPE`. Your goal is to be resourceful and autonomous.

**RESPONSE FORMATS:**

-   **For a Plan:** A JSON array of steps defined with the schema below.
-   **For a Direct Answer:** {{'direct_answer': 'Your answer here'}}
-   **For a Plugin Recommendation:** {{'plugin': {{'id': 'new_plugin_id', 'description': 'Description of the new plugin'}}}} 

Plan Schema
"{schema_json}"

- **CRITICAL for REQUIRED Inputs:** For each step, you MUST examine the `inputDefinitions` for the corresponding `actionVerb` and ensure that all `required` inputs are present in the step's `inputs` object. If an input is marked `required: true`, it MUST be provided.
- **CRITICAL for JSON compliance:** Ensure all string literals within the generated JSON, including any nested ones, strictly adhere to JSON standards by using double quotes.
- **CRITICAL for Plan Inputs, sourceStep:**
    - Step inputs are generally sourced from the outputs of other steps and less often fixed with constant values.
    - All inputs for each step must be explicitly defined either as a constant `value` or by referencing an `outputName` from a `sourceStep` within the plan or from the `PARENT STEP INPUTS`. Do not assume implicit data structures or properties of inputs.
    - Use `sourceStep: 0` ONLY for inputs that are explicitly provided in the initial mission context (the "PARENT STEP INPUTS" section if applicable, or the overall mission goal).
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `number` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP INPUT" (using `sourceStep: 0`) or from an output of a previous step in the plan.
- **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.
- **CRITICAL: Embedded References in Input Values:** If you use placeholders like {'{output_name}'} or [output_name] within a longer string value (e.g., a prompt that references previous outputs), you MUST also declare each referenced output_name as a separate input with proper sourceStep and outputName. Example:
        {{\\"inputs\\": {{
            \\"prompt\\": {{
                \\"value\\": \\"Analyze the competitor data: {'{competitor_details}'}\\",
                \\"valueType\\": \\"string\\"
            }},
            \\"competitor_details\\": {{
                \\"outputName\\": \\"competitor_details\\",
                \\"sourceStep\\": 2
            }}
        }}}}
CRITICAL: The actionVerb for each step MUST be a valid, existing plugin actionVerb (from the provided list) or a descriptive, new actionVerb (e.g., 'ANALYZE_DATA', 'GENERATE_REPORT'). It MUST NOT be 'UNKNOWN' or 'NOVEL_VERB'.

**DELIVERABLE IDENTIFICATION:**
When defining outputs, identify which ones are final deliverables that the user will want to see:
- For outputs that represent final results, reports, or completed work products, use the enhanced format:
  ```json
  "outputs": {{
    "final_report": {{
      "description": "A comprehensive analysis report",
      "isDeliverable": true,
      "filename": "market_analysis_2025.md"
    }}
  }}
  ```
- For intermediate outputs used only by subsequent steps, use the simple string format:
  ```json
  "outputs": {{
    "research_data": "Raw research data for analysis"
  }}
  ```
- Guidelines for deliverable filenames:
  * Use descriptive, professional names
  * Include relevant dates or versions when appropriate
  * Use appropriate file extensions (.md, .txt, .json, .csv, .pdf, etc.)
  * Avoid generic names like "output.txt" or "result.json"

{plugin_guidance}
"""

        try:
            return call_brain(prompt, inputs, "json")
        except Exception as e:
            logger.error(f"Brain call failed for novel verb '{verb}': {e}")
            return json.dumps({"error": f"Brain call failed: {str(e)}"})

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

            if isinstance(data, list): # This is a plan
                # Validate and repair the plan
                mission_goal = verb_info.get('mission_goal', verb_info.get('description', ''))
                validated_plan = self.validator.validate_and_repair(data, mission_goal, inputs)
                
                # Save the generated plan to Librarian
                # self._save_plan_to_librarian(verb_info['verb'], validated_plan, inputs)

                return json.dumps([{ 
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'",
                    "result": validated_plan,
                    "mimeType": "application/json"
                }])
            elif isinstance(data, dict): # Could be direct answer or plugin recommendation
                if "direct_answer" in data:
                    return json.dumps([{ 
                        "success": True,
                        "name": "direct_answer",
                        "resultType": "direct_answer",
                        "resultDescription": f"Direct answer for {verb_info['verb']}",
                        "result": data["direct_answer"],
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
                elif "actionVerb" in data and "number" in data:
                    mission_goal = verb_info.get('mission_goal', verb_info.get('description', ''))
                    validated_plan = self.validator.validate_and_repair([data], mission_goal, inputs)
                    # self._save_plan_to_librarian(verb_info['verb'], validated_plan, inputs)
                    return json.dumps([{"success": True,
                        "name": "plan",
                        "resultType": "plan",
                        "resultDescription": f"Plan created for novel verb '{verb_info['verb']}'",
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

    def _save_plan_to_librarian(self, verb: str, plan_data: List[Dict[str, Any]], inputs: Dict[str, Any]):
        """Saves the generated plan to the Librarian service."""
        try:
            auth_token = get_auth_token(inputs)
            librarian_url = inputs.get('librarian_url', 'librarian:5040')
            
            payload = {
                "key": verb,
                "data": plan_data,
                "collection": 'actionPlans', 
                "storageType": 'mongo' 
            }
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {auth_token}'
            }
            
            response = requests.post(
                f"http://{librarian_url}/storeData",
                json=payload,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully saved plan for verb '{verb}' to Librarian.")
            else:
                logger.error(f"Failed to save plan for verb '{verb}' to Librarian: {response.status_code} - {response.text}")
        except Exception as e:
            logger.error(f"Error saving plan for verb '{verb}' to Librarian: {e}")

class AccomplishOrchestrator:
    """Main orchestrator for ACCOMPLISH plugin"""

    def __init__(self):
        self.goal_planner = RobustMissionPlanner()
        self.novel_verb_handler = NovelVerbHandler()

    def execute(self, inputs_str: str) -> str:
        """Main execution method"""
        progress.checkpoint("orchestrator_execute_start")

        try:
            # Parse inputs
            inputs = parse_inputs(inputs_str)
            progress.checkpoint("input_processed")

            # Route to appropriate handler
            if self._is_novel_verb_request(inputs):
                return self.novel_verb_handler.handle(inputs)
            else:
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

def main():
    """
    Main function to run the ACCOMPLISH plugin.
    Reads input from stdin, executes the orchestrator, and prints the result.
    """
    progress.checkpoint("main_start")

    try:
        orchestrator = AccomplishOrchestrator()
        progress.checkpoint("orchestrator_created")

        # Read input from stdin
        import sys
        input_data = sys.stdin.read()
        progress.checkpoint("input_read")
        
        if not input_data:
            logger.warning("Input data is empty. Exiting.")
            return

        # Execute
        result = orchestrator.execute(input_data)

        # Output result
        print(result)
        progress.checkpoint("plan_creation_complete")

    except json.JSONDecodeError as e:
        logger.error(f"ACCOMPLISH plugin failed due to JSON decoding error: {e}")
        error_result = json.dumps([{ 
            "success": False,
            "name": "error",
            "resultType": "error",
            "resultDescription": f"Invalid JSON input: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)
    except AccomplishError as e:
        logger.error(f"ACCOMPLISH plugin failed with a known error: {e}")
        error_result = json.dumps([{ 
            "success": False,
            "name": "error",
            "resultType": e.error_type,
            "resultDescription": f"ACCOMPLISH plugin failed: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)
    except Exception as e:
        logger.error(f"An unexpected error occurred in ACCOMPLISH plugin: {e}", exc_info=True)
        error_result = json.dumps([{ 
            "success": False,
            "name": "error",
            "resultType": "unexpected_error",
            "resultDescription": f"An unexpected error occurred: {str(e)}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)

# Main execution
if __name__ == "__main__":
    main()