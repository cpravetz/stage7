#!/usr/bin/env python3
"""
REFLECT Plugin
Evaluates mission progress and determines next steps.
"""

import json
import logging
import os
import sys
import requests
from typing import Dict, Any, List, Optional
import re
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

class ReflectError(Exception):
    """Custom exception for REFLECT plugin errors"""
    pass

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

def clean_brain_response(response: str) -> str:
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

def call_brain(prompt: str, inputs: Dict[str, Any]) -> str:
    """Calls the Brain service to get an LLM response with retries."""
    brain_url = inputs.get('brain_url', {}).get('value', 'http://brain:5070')
    auth_token = inputs.get('__brain_auth_token', {}).get('value')

    if not auth_token:
        raise ReflectError("Authentication token is missing")

    payload = {
        "messages": [
            {"role": "system", "content": "You are a strategic planning and reflection expert. Your goal is to analyze mission progress and determine the best course of action. Respond in valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "conversationType": "TextToJSON",
        "temperature": 0.2
    }
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}'
    }

    max_retries = 5
    for attempt in range(max_retries):
        try:
            response = requests.post(f"http://{brain_url}/chat", json=payload, headers=headers, timeout=60)
            response.raise_for_status()
            raw_brain_response = response.json()['result']

            # Use ACCOMPLISH's robust JSON extraction and cleaning
            cleaned_response = clean_brain_response(raw_brain_response)
            extracted_json_str = _extract_json_from_string(cleaned_response)

            if extracted_json_str:
                try:
                    # Validate that the extracted string is indeed valid JSON
                    json.loads(extracted_json_str)
                    logger.info("Successfully extracted and validated JSON from Brain response.")
                    return extracted_json_str
                except json.JSONDecodeError as e:
                    logger.warning(f"Extracted JSON is still invalid: {e}. Raw response: {raw_brain_response[:200]}...")
                    # Fallback to raw response if extraction leads to invalid JSON
                    return raw_brain_response
            else:
                logger.warning(f"Could not extract JSON from Brain response. Raw response: {raw_brain_response[:200]}...")
                return raw_brain_response

        except requests.RequestException as e:
            logger.error(f"Brain call failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                raise ReflectError(f"Failed to communicate with Brain service after {max_retries} attempts: {e}")


def reflect(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Main reflection logic."""
    try:
        mission_goal = inputs['mission_goal']['value']
        plan_history = inputs['plan_history']['value']
        work_products = inputs['work_products']['value']
        question = inputs['question']['value']
    except (KeyError, TypeError) as e:
        raise ReflectError(f"Missing required input: {str(e)}")

    prompt = f"""I am an agent partway through a mission. I need you to reflect on my progress and determine the next course of action.

**Original Mission Goal:**
{mission_goal}

**Plan History (Executed Steps):**
{plan_history}

**Manifest of Work Products Created:**
{work_products}

**Reflection Question:**
{question}

**Your Task:**
Based on the information above, please provide one of the following responses in valid JSON format:

1.  **If the mission is fully accomplished**, provide a direct answer confirming completion.
    Example: {{"answer": "The mission is complete. The requested analysis has been generated and saved."}}

2.  **If the mission is NOT complete**, generate a new, concise plan to achieve the remaining objectives. The plan should be a JSON array of steps following the established schema.
    Example: {{"plan": [{{"number": 1, "actionVerb": "FILE_OPERATION", ...}}]}}

Do not recommend plugins. Only provide an 'answer' or a 'plan'.
"""

    raw_response = call_brain(prompt, inputs)
    
    try:
        response_data = json.loads(raw_response)
    except json.JSONDecodeError:
        # If response is not a valid JSON, wrap it as a simple answer
        logger.warning("LLM response was not valid JSON. Wrapping as a direct answer.")
        response_data = {"answer": raw_response}

    if "plan" in response_data:
        return [{
            "success": True,
            "name": "plan",
            "resultType": "plan",
            "result": response_data["plan"],
            "resultDescription": "Generated new plan based on mission progress",
            "mimeType": "application/json"
        }]
    elif "answer" in response_data:
        return [{
            "success": True,
            "name": "answer",
            "resultType": "string",
            "result": response_data["answer"],
            "resultDescription": "Reflection analysis complete",
            "mimeType": "text/plain"
        }]
    else:
        # Fallback for unexpected but valid JSON
        return [{
            "success": True,
            "name": "answer",
            "resultType": "string",
            "result": json.dumps(response_data),
            "resultDescription": "Unexpected but valid response format",
            "mimeType": "application/json"
        }]

def main():
    """Main execution block."""
    try:
        input_str = sys.stdin.read()
        inputs_list = json.loads(input_str)
        
        # Convert list of [key, value] pairs to dictionary
        inputs = {}
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, value_obj = item
                inputs[key] = value_obj
            else:
                logger.warning(f"Skipping malformed input item: {item}")
        
        result = reflect(inputs)
        print(json.dumps(result, indent=2))
    except Exception as e:
        logger.error(f"REFLECT plugin failed: {e}")
        error_output = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"REFLECT plugin failed: {str(e)}",
            "mimeType": "text/plain",
            "error": str(e)
        }]
        print(json.dumps(error_output, indent=2))

if __name__ == "__main__":
    main()
