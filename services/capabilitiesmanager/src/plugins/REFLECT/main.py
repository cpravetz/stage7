#!/usr/bin/env python3
"""
REFLECT Plugin - Rewritten to create schema-compliant plans
Handles reflection on mission progress and generates plans for next steps.
"""

import json
import logging
import sys
import time
import requests
import re
import os
from typing import Dict, Any, List, Optional, Set

# Add the shared library to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'shared', 'python', 'lib')))

from plan_validator import PlanValidator, AccomplishError as ReflectError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA

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
    Extracts a JSON object or array string from a given text.
    Assumes the JSON is the primary content and attempts to find the outermost JSON structure.
    """
    text = text.strip()
    if not text:
        return None

    # Find the first and last occurrences of the JSON delimiters
    first_brace = text.find('{')
    first_bracket = text.find('[')
    last_brace = text.rfind('}')
    last_bracket = text.rfind(']')

    # Determine the start and end of the JSON string
    if first_bracket != -1 and last_bracket != -1 and first_bracket < last_bracket:
        # It's likely a JSON array
        start_index = first_bracket
        end_index = last_bracket
    elif first_brace != -1 and last_brace != -1 and first_brace < last_brace:
        # It's likely a JSON object
        start_index = first_brace
        end_index = last_brace
    else:
        return None # No valid JSON found

    json_candidate = text[start_index : end_index + 1]

    # Basic validation: check if the candidate string is likely JSON
    if not (json_candidate.startswith('{') and json_candidate.endswith('}')) and \
       not (json_candidate.startswith('[') and json_candidate.endswith(']')):
        return None

    return json_candidate

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
            timeout=60  # Reduced timeout to 60 seconds
        )

        if response.status_code != 200:
            raise ReflectError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'result' not in result:
            raise ReflectError("Brain response missing result", "brain_response_error")

        raw_brain_response = result['result']

        if response_type == 'text':
            logger.info("Response type is TEXT. Not attempting JSON extraction.")
            progress.checkpoint("brain_call_success_text_response")
            return raw_brain_response

        # Attempt to extract clean JSON from the raw response
        extracted_json_str = _extract_json_from_string(raw_brain_response)

        if extracted_json_str:
            try:
                # Validate that the extracted string is indeed valid JSON
                json.loads(extracted_json_str)
                logger.info("Successfully extracted and validated JSON from Brain response.")
                logger.info(f"Raw JSON response from Brain: {extracted_json_str}")
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
    """Parse and validate inputs"""
    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        
        input_list = json.loads(inputs_str)
        
        inputs = {}
        for item in input_list:
            if isinstance(item, list) and len(item) == 2:
                key, raw_value = item # Renamed 'value' to 'raw_value' for clarity
                
                # If raw_value is an InputValue object, extract its 'value' property
                if isinstance(raw_value, dict) and 'value' in raw_value:
                    inputs[key] = raw_value['value']
                else:
                    # Otherwise, use raw_value directly (for non-InputValue types)
                    inputs[key] = raw_value
            else:
                logger.warning(f"Skipping invalid input item: {item}")
        
        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
        
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise ReflectError(f"Input validation failed: {e}", "input_error")

class ReflectHandler:
    """Handles reflection requests by generating schema-compliant plans"""

    def __init__(self):
        self.validator = PlanValidator(call_brain)

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
        mission_id_input = inputs.get('missionId')
        if isinstance(mission_id_input, dict) and 'value' in mission_id_input:
            mission_id = str(mission_id_input['value']).strip()
        else:
            mission_id = str(mission_id_input).strip() if mission_id_input is not None else ''

        plan_history_input = inputs.get('plan_history')
        if isinstance(plan_history_input, dict) and 'value' in plan_history_input:
            plan_history = str(plan_history_input['value']).strip()
        else:
            plan_history = str(plan_history_input).strip() if plan_history_input is not None else ''

        work_products_input = inputs.get('work_products')
        if isinstance(work_products_input, dict) and 'value' in work_products_input:
            work_products = str(work_products_input['value']).strip()
        else:
            work_products = str(work_products_input).strip() if work_products_input is not None else ''

        question_input = inputs.get('question')
        if isinstance(question_input, dict) and 'value' in question_input:
            question = str(question_input['value']).strip()
        else:
            question = str(question_input).strip() if question_input is not None else ''

        logger.info(f"DEBUG REFLECT: mission_id = '{mission_id}' (type: {type(mission_id)})") # Add this line
        logger.info(f"DEBUG REFLECT: plan_history = '{plan_history[:50]}...' (type: {type(plan_history)})") # Add this line
        logger.info(f"DEBUG REFLECT: work_products = '{work_products[:50]}...' (type: {type(work_products)})") # Add this line
        logger.info(f"DEBUG REFLECT: question = '{question[:50]}...' (type: {type(question)})") # Add this line

        return {
            "missionId": mission_id,
            "plan_history": plan_history,
            "work_products": work_products,
            "question": question,
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

        prompt = f"""You are an expert system analyst for mission reflection and planning. A mission is in progress and needs reflection to determine next steps.

MISSION ID: {mission_id}
MISSION GOAL: {mission_goal}
PLAN HISTORY: {plan_history}
WORK PRODUCTS: {work_products}
REFLECTION QUESTION: {question}

PARENT STEP INPUTS: {json.dumps(inputs)}

Your task is to reflect on the mission progress and determine the best course of action. Consider these options in order of preference:

1.  **Provide a Direct Answer:** If the reflection question can be answered directly with the given context and the mission is complete or no further action is needed, provide a JSON object with a single key "direct_answer".
2.  **Create a Plan:** If the mission is NOT complete and requires multiple steps to achieve the remaining objectives, generate a new, concise plan to achieve the remaining objectives. The plan should be a JSON array of steps following the established schema.

**CRITICAL CONSTRAINTS:**
- You are an autonomous agent. Your primary goal is to solve problems independently.
- Do not use the `ASK_USER_QUESTION` verb to seek information from the user that can be found using other tools like `SEARCH` or `SCRAPE`. Your goal is to be resourceful and autonomous.
- If creating a plan, ensure it builds upon the existing plan history and work products.

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
    - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `number` of that preceding step.
    - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP" (using `sourceStep: 0`) or from an output of a previous step in the plan.
- **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.

CRITICAL: The actionVerb for each step MUST be a valid, existing plugin actionVerb (from the provided list) or a descriptive, new actionVerb (e.g., 'ANALYZE_DATA', 'GENERATE_REPORT'). It MUST NOT be 'UNKNOWN' or 'NOVEL_VERB'.
"""

        try:
            return call_brain(prompt, inputs, "json")
        except Exception as e:
            logger.error(f"Brain call failed for reflection: {e}")
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

    def _format_response(self, brain_response: Any, reflection_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            # If brain_response is already a parsed JSON object
            if isinstance(brain_response, dict):
                response_data = brain_response
            else:
                # Clean and parse the response
                cleaned_response = self._clean_brain_response(brain_response)
                response_data = json.loads(cleaned_response)

            # Handle direct answer
            if "direct_answer" in response_data:
                return json.dumps([{
                    "success": True,
                    "name": "answer",
                    "resultType": "string",
                    "result": response_data["direct_answer"],
                    "resultDescription": "Reflection analysis complete",
                    "mimeType": "text/plain"
                }])

            # Handle plan
            elif isinstance(response_data, list) and len(response_data) > 0:
                # Validate and repair the plan
                goal = reflection_info['mission_goal']
                validated_plan = self.validator.validate_and_repair(response_data, goal, inputs)
                
                return json.dumps([{
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "result": validated_plan,
                    "resultDescription": "Generated new plan based on mission progress",
                    "mimeType": "application/json"
                }])

            else:
                # Fallback for unexpected response
                return json.dumps([{
                    "success": True,
                    "name": "answer",
                    "resultType": "string",
                    "result": json.dumps(response_data),
                    "resultDescription": "Unexpected but valid response format",
                    "mimeType": "application/json"
                }])

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Brain response as JSON: {e}")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Invalid JSON response: {str(e)}",
                "resultDescription": "Brain response parsing failed",
                "mimeType": "text/plain"
            }])
        except Exception as e:
            logger.error(f"Response formatting failed: {e}")
            return json.dumps([{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": str(e),
                "resultDescription": "Response formatting failed",
                "mimeType": "text/plain"
            }])

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


if __name__ == "__main__":
    main()