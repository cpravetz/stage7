#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Enhanced Version with Schema Validation and Error Recovery
Handles mission planning and novel action verbs with robust error handling and retry mechanisms
"""

import uuid
import json
import logging
import time
import requests
import re
import sys
import os
import threading
from typing import Dict, Any, List, Optional, Set, Tuple

# Cache for verb discovery to reduce redundant API calls
_discovery_cache = {}
_cache_lock = threading.Lock()

# Import from the installed shared library package
try:
    from plan_validator import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA
except ImportError:
    # Fallback to direct import for development/testing
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'shared', 'python', 'lib')))
    from plan_validator import PlanValidator, AccomplishError, PLAN_STEP_SCHEMA, PLAN_ARRAY_SCHEMA

# Configure enhanced logging with file handler for debugging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('accomplish_debug.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Enhanced error tracking
class ErrorRecoveryTracker:
    """Tracks error recovery attempts and provides analytics"""
    def __init__(self):
        self.error_counts = {}
        self.recovery_attempts = {}
        self.successful_recoveries = {}
        self.failed_recoveries = {}
        
    def record_error(self, error_type: str, error_message: str):
        """Record an error occurrence"""
        if error_type not in self.error_counts:
            self.error_counts[error_type] = 0
        self.error_counts[error_type] += 1
        
    def record_recovery_attempt(self, error_type: str, strategy: str):
        """Record a recovery attempt"""
        key = f"{error_type}:{strategy}"
        if key not in self.recovery_attempts:
            self.recovery_attempts[key] = 0
        self.recovery_attempts[key] += 1
        
    def record_successful_recovery(self, error_type: str, strategy: str):
        """Record a successful recovery"""
        key = f"{error_type}:{strategy}"
        if key not in self.successful_recoveries:
            self.successful_recoveries[key] = 0
        self.successful_recoveries[key] += 1
        
    def record_failed_recovery(self, error_type: str, strategy: str):
        """Record a failed recovery"""
        key = f"{error_type}:{strategy}"
        if key not in self.failed_recoveries:
            self.failed_recoveries[key] = 0
        self.failed_recoveries[key] += 1
        
    def get_recovery_stats(self) -> Dict[str, Any]:
        """Get recovery statistics"""
        return {
            'error_counts': self.error_counts,
            'recovery_attempts': self.recovery_attempts,
            'successful_recoveries': self.successful_recoveries,
            'failed_recoveries': self.failed_recoveries
        }

# Global error recovery tracker
error_tracker = ErrorRecoveryTracker()

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

def _get_cm_auth_token(inputs: Dict[str, Any]) -> str:
    """Get the CapabilitiesManager's authentication token from inputs."""
    if '__auth_token' in inputs:
        token_data = inputs['__auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise AccomplishError("No CapabilitiesManager authentication token found", "auth_error")

def _get_librarian_info(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Extract librarian URL and CM auth token from inputs."""
    librarian_url_input = inputs.get('librarian_url')
    if isinstance(librarian_url_input, dict) and 'value' in librarian_url_input:
        librarian_url = librarian_url_input['value']
    else:
        librarian_url = librarian_url_input if librarian_url_input is not None else 'librarian:5040'
    
    cm_auth_token = _get_cm_auth_token(inputs)

    return {
        'url': librarian_url,
        'auth_token': cm_auth_token
    }


STOP_WORDS = set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'did', 'do',
    'does', 'doing', 'don', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
    'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into',
    'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of',
    'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 's', 'same',
    'she', 'should', 'so', 'some', 'such', 't', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
    'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
    'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'you',
    'your', 'yours', 'yourself', 'yourselves', 'the', 'agent', 'system', 'based', 'using', 'generate', 'create',
    'perform', 'allow', 'following', 'within', 'given', 'need', 'needs', 'new', 'existing', 'user', 'users'
])

def _extract_keywords(text: str) -> str:
    """Extracts relevant keywords from a text by removing stop words and punctuation."""
    if not text:
        return ''
    # Remove punctuation
    text = re.sub(r'[^\w\s]', '', text)
    # Convert to lowercase and split into words
    words = text.lower().split()
    # Remove stop words
    keywords = [word for word in words if word not in STOP_WORDS]
    # Join keywords back into a string
    return ' '.join(keywords)

def _enrich_prompt_with_context(base_prompt: str, mission_context: Dict[str, Any]) -> str:
    """
    Enriches a given prompt with structured information from the mission context.
    This helps the LLM incorporate relevant details like Jira tickets and parsed file contents.
    """
    if not mission_context:
        return base_prompt

    context_additions: List[str] = []

    # Add Jira tickets
    jira_tickets = mission_context.get('jiraTickets', [])
    if jira_tickets:
        context_additions.append(f"Relevant Jira Tickets: {', '.join(jira_tickets)}")

    # Add parsed file contents
    file_contents = mission_context.get('fileContents', [])
    if file_contents:
        file_summaries: List[str] = []
        for file_data in file_contents:
            filename = file_data.get('filename', 'unknown_file')
            parsed = file_data.get('parsed')
            
            summary_parts: List[str] = [f"File: {filename}"]
            if parsed:
                if parsed.get('title'):
                    summary_parts.append(f"Title: {parsed['title']}")
                if parsed.get('description'):
                    summary_parts.append(f"Description: {parsed['description'][:200]}{'...' if len(parsed['description']) > 200 else ''}")
                if parsed.get('schema_arguments'):
                    summary_parts.append(f"Schema Arguments: {len(parsed['schema_arguments'])} found.")
                elif parsed.get('arguments'):
                    summary_parts.append(f"Arguments: {len(parsed['arguments'])} found.")
            else:
                summary_parts.append(f"Content snippet: {file_data.get('content', '')[:200]}{'...' if len(file_data.get('content', '')) > 200 else ''}")
            
            file_summaries.append(" - ".join(summary_parts))
        
        context_additions.append("Relevant File Contents:\n" + "\n".join(file_summaries))

    if context_additions:
        return base_prompt + "\n\n--- ADDITIONAL CONTEXT ---\n" + "\n".join(context_additions) + "\n--------------------------"
    return base_prompt

def discover_verbs_for_planning(goal: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Discover verbs for planning by querying the Librarian service, with caching.
    """
    cache_key = goal.strip().lower()
    
    with _cache_lock:
        if cache_key in _discovery_cache:
            logger.info(f"Cache HIT for verb discovery with goal: {cache_key}")
            return _discovery_cache[cache_key]

    logger.info(f"Cache MISS for verb discovery with goal: {cache_key}. Querying service.")
    try:
        librarian_info = _get_librarian_info(inputs)
        librarian_url = librarian_info['url']
        auth_token = librarian_info['auth_token']

        headers = {'Authorization': f'Bearer {auth_token}'}
        truncated_goal = (goal[:500] + '...') if len(goal) > 500 else goal
        logger.info(f"Discovering verbs from Librarian with truncated goal: {truncated_goal}")
        
        payload = {
            "goal": goal,
            "context": inputs.get('context', {}).get('value', '') if isinstance(inputs.get('context'), dict) else inputs.get('context', ''),
            "missionId": inputs.get('missionId', {}).get('value', '') if isinstance(inputs.get('missionId'), dict) else inputs.get('missionId', '')
        }
        
        response = requests.post(f"http://{librarian_url}/verbs/discover-for-planning", json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        discovery_result = response.json()
        
        logger.info(f"Successfully discovered {len(discovery_result.get('relevantVerbs', []))} verbs from Librarian.")
        
        with _cache_lock:
            _discovery_cache[cache_key] = discovery_result

        return discovery_result
    except Exception as e:
        logger.warning(f"Verb discovery via /verbs/discover-for-planning failed: {e}. Planning will proceed without discovered capabilities.")
        return {"relevantVerbs": [], "relevantTools": [], "discoveryContext": {"error": str(e)}}

def create_token_efficient_prompt(elements: List[str], max_tokens: int) -> List[str]:
    """
    Creates a token-efficient prompt by intelligently truncating elements from the end
    to fit within max_tokens. Prioritizes preserving earlier elements.
    """
    if not elements:
        return []

    # Rough approximation: 4 chars per token
    token_multiplier = 4
    
    current_elements = list(elements)
    
    # First, calculate initial token usage
    current_token_estimate = sum(len(el) // token_multiplier for el in current_elements)
    
    if current_token_estimate <= max_tokens:
        return current_elements
    
    # If over, try to reduce elements from the end
    for i in range(len(current_elements) - 1, -1, -1): # Iterate backwards
        if current_token_estimate <= max_tokens:
            break
        
        original_element_tokens = len(current_elements[i]) // token_multiplier
        if original_element_tokens == 0:
            continue
            
        # Calculate how many tokens we need to cut from this element
        tokens_to_cut = current_token_estimate - max_tokens
        
        # Ensure we don't cut more than the element has
        actual_tokens_to_cut = min(tokens_to_cut, original_element_tokens)
        
        # Truncate the element (chars_to_cut = tokens_to_cut * token_multiplier)
        chars_to_cut = actual_tokens_to_cut * token_multiplier
        
        if chars_to_cut >= len(current_elements[i]):
            # If cutting this element entirely still doesn't fix it, remove it
            current_token_estimate -= original_element_tokens
            current_elements[i] = "" # Or remove it completely from the list
        else:
            current_elements[i] = current_elements[i][:len(current_elements[i]) - chars_to_cut] + "..."
            current_token_estimate -= actual_tokens_to_cut
            
    # If after truncation we still exceed, it means individual elements are too long
    # This simplified version just returns what it managed to do. More advanced would
    # involve proportional reduction or erroring out.
    return [el for el in current_elements if el]


def get_mission_goal(mission_id: str, inputs: Dict[str, Any]) -> Optional[str]:
    """Fetches the mission goal from the Librarian service."""
    if not mission_id:
        return None
    
    try:
        auth_token = _get_cm_auth_token(inputs)
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
            try:
                error_json = response.json()
                error_message = error_json.get('error', response.text)
            except json.JSONDecodeError:
                error_message = response.text
            raise AccomplishError(f"Brain API error: {response.status_code} - {error_message}", "brain_api_error")

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


def report_logic_failure_to_brain(request_id: str, inputs: Dict[str, Any], reason: str, severity: str = "normal") -> None:
    """Report a logic failure back to the Brain service so it can penalize the model

    Args:
        request_id: The Brain request ID from the original call
        inputs: Plugin inputs containing auth token and brain URL
        reason: Description of why this was a logic failure
        severity: "critical" for instruction-following failures, "normal" for other issues
                  Critical failures cause immediate score penalties and potential blacklisting
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
            "reason": reason,
            "severity": severity  # "critical" or "normal"
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
            logger.info(f"Successfully reported {severity} logic failure for request {request_id}: {reason}")
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

def _create_detailed_plugin_guidance(goal: str, inputs: Dict[str, Any]) -> str:
    """
    Creates a detailed, token-efficient guidance string for the LLM by dynamically discovering relevant verbs and tools.
    This function exclusively relies on the dynamic discovery mechanism.
    """
    if not inputs:
        inputs = {}

    discovery_result = None
    if goal:
        try:
            logger.info("Attempting dynamic discovery for planning guidance...")
            discovery_result = discover_verbs_for_planning(goal, inputs)
        except Exception as e:
            logger.warning(f"Dynamic verb discovery failed: {e}. The planner will rely on novel verb generation.")

    relevant_verbs = discovery_result.get('relevantVerbs') if discovery_result else None
    relevant_tools = discovery_result.get('relevantTools') if discovery_result else None

    if relevant_verbs or relevant_tools:
        logger.info(f"Dynamic discovery successful. Found {len(relevant_verbs or [])} verbs and {len(relevant_tools or [])} tools.")
        guidance_lines = ["\n--- DISCOVERED CAPABILITIES ---"]
        
        if relevant_verbs:
            guidance_lines.append("\n**Discovered Verbs:**")
            for verb in relevant_verbs:
                if isinstance(verb, dict):
                    action_verb = verb.get('verb', 'UNKNOWN')
                    description = verb.get('description', 'No description available.')
                    concise_desc = description.split('.')[0] if '.' in description else description
                    guidance_lines.append(f"- **{action_verb}**: {concise_desc}")
                    
                    input_defs = verb.get('inputDefinitions')
                    if input_defs:
                        guidance_lines.append("  Inputs:")
                        for input_def in input_defs:
                            name = input_def.get('name', 'UNKNOWN')
                            required = input_def.get('required', False)
                            type_ = input_def.get('type', 'any')
                            input_desc = input_def.get('description', 'No description.')
                            guidance_lines.append(f"    - {name} (Type: {type_}, Required: {required}): {input_desc}")
                    
                    output_defs = verb.get('outputDefinitions')
                    if output_defs:
                        guidance_lines.append("  Outputs:")
                        for output_def in output_defs:
                            name = output_def.get('name', 'UNKNOWN')
                            type_ = output_def.get('type', 'any')
                            output_desc = output_def.get('description', 'No description.')
                            guidance_lines.append(f"    - {name} (Type: {type_}): {output_desc}")

        if relevant_tools:
            guidance_lines.append("\n**Discovered Tools:**")
            for tool in relevant_tools:
                if isinstance(tool, dict):
                    tool_id = tool.get('toolId', 'unknown_tool')
                    tool_desc = tool.get('description', 'No description available.')
                    tool_verbs = ", ".join(tool.get('actionVerbs', []))
                    guidance_lines.append(f"- **{tool_id}**: {tool_desc} (Verbs: {tool_verbs})")

        guidance_lines.append("\n--------------------")
        return "\n".join(guidance_lines)

    logger.warning("Dynamic discovery yielded no results. The planner must generate a plan using novel verbs with clear descriptions.")
    return "\n--- AVAILABLE PLUGINS ---\nNo plugins were discovered for the current goal. You must generate a plan using novel verbs. Ensure each novel verb has a clear and comprehensive 'description' explaining its purpose and functionality.\n--------------------"

class RobustMissionPlanner:
    """Enhanced LLM-driven mission planner with improved error recovery"""
    
    def __init__(self, inputs: Dict[str, Any]): # Add inputs parameter
        self.max_retries = 5
        self.max_llm_switches = 2
        self.retry_strategies = [
            'original_prompt',
            'simplified_prompt',
            'step_by_step_guidance',
            'alternative_approach'
        ]
        self.current_strategy_index = 0
        
        # Prepare librarian_info
        librarian_info = _get_librarian_info(inputs)

        # Initialize the validator with the discovered plugins and librarian_info
        self.validator = PlanValidator(
            brain_call=call_brain,
            report_logic_failure_call=report_logic_failure_to_brain,
            librarian_info=librarian_info # Pass librarian_info
        )
        self._last_attempt_single_step = False
    
    def _get_next_retry_strategy(self) -> Optional[str]:
        """Get the next retry strategy or None if all strategies exhausted"""
        if self.current_strategy_index < len(self.retry_strategies):
            strategy = self.retry_strategies[self.current_strategy_index]
            self.current_strategy_index += 1
            return strategy
        return None
    
    def _reset_retry_strategies(self):
        """Reset retry strategies for a new planning attempt"""
        self.current_strategy_index = 0

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
        
        # Extract and parse mission_context_payload if available
        mission_context_payload_input = inputs.get('mission_context_payload')
        mission_context = {}
        if mission_context_payload_input and mission_context_payload_input.get('value'):
            try:
                mission_context = json.loads(mission_context_payload_input['value'])
            except json.JSONDecodeError:
                logger.warning("Failed to parse mission_context_payload as JSON. Proceeding without enriched context.")
                mission_context = {}
        
        plan = self.create_plan(goal, mission_goal, mission_id, inputs, mission_context)

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

        # Dynamically check if REFLECT plugin is available via a quick discovery call
        # This avoids depending on a stale list.
        reflect_plugin_def = self.validator._get_plugin_definition("REFLECT")
        if not reflect_plugin_def:
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

    def create_plan(self, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any], mission_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create plan with mission-level awareness"""
        progress.checkpoint("planning_start")
        
        logger.info(f"ACCOMPLISH: Generating role-specific plan using two-phase process.")
        agent_role = inputs.get('agentRole', {}).get('value', 'General')
        structured_plan = self._generate_role_specific_plan(goal, mission_goal, mission_id, agent_role, inputs, mission_context)
        
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

    def _generate_role_specific_plan(self, goal: str, mission_goal: Optional[str], mission_id: str, agent_role: str, inputs: Dict[str, Any], mission_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generates a plan tailored for a specific agent role with enhanced error recovery."""
        
        # Enhanced error recovery loop
        for attempt in range(self.max_retries):
            strategy = self._get_next_retry_strategy()
            if not strategy:
                break
                
            logger.info(f"Attempt {attempt + 1}/{self.max_retries} with strategy: {strategy}")
            error_tracker.record_recovery_attempt('plan_generation', strategy)
            
            try:
                if strategy in ['original_prompt', 'simplified_prompt']:
                    prose_plan = self._get_prose_plan_with_strategy(goal, mission_goal, inputs, strategy, mission_context)
                    structured_plan = self._convert_to_structured_plan_with_recovery(prose_plan, goal, mission_goal, mission_id, inputs, strategy)
                    
                    # Validate the plan before returning
                    validation_result = self.validator.validate_and_repair(structured_plan, goal, inputs)
                    
                    if validation_result.is_valid:
                        logger.info(f"✅ Successfully generated valid plan with strategy: {strategy}")
                        error_tracker.record_successful_recovery('plan_generation', strategy)
                        return validation_result.plan
                    else:
                        error_summary = "; ".join(validation_result.get_error_messages()[:3])
                        logger.warning(f"⚠️  Plan generated with {strategy} has validation errors: {error_summary}")
                        error_tracker.record_error('validation_error', error_summary)
                        continue
                elif strategy == 'step_by_step_guidance':
                    # Try a more structured approach
                    structured_plan = self._generate_step_by_step_plan(goal, mission_goal, mission_id, inputs, mission_context)
                    validation_result = self.validator.validate_and_repair(structured_plan, goal, inputs)
                    
                    if validation_result.is_valid:
                        logger.info(f"✅ Successfully generated valid plan with step-by-step strategy")
                        error_tracker.record_successful_recovery('plan_generation', strategy)
                        return validation_result.plan
                elif strategy == 'alternative_approach':
                    # Try a completely different approach
                    structured_plan = self._generate_alternative_plan(goal, mission_goal, mission_id, inputs, mission_context)
                    validation_result = self.validator.validate_and_repair(structured_plan, goal, inputs)
                    
                    if validation_result.is_valid:
                        logger.info(f"✅ Successfully generated valid plan with alternative approach")
                        error_tracker.record_successful_recovery('plan_generation', strategy)
                        return validation_result.plan
                        
            except Exception as e:
                logger.warning(f"❌ Strategy {strategy} failed: {e}")
                error_tracker.record_failed_recovery('plan_generation', strategy)
                error_tracker.record_error('plan_generation_error', str(e))
                continue
        
        # If all strategies failed, raise an error with comprehensive details
        stats = error_tracker.get_recovery_stats()
        error_message = f"Could not generate a valid plan after {self.max_retries} attempts. " \
                       f"Tried strategies: {', '.join(self.retry_strategies)}. " \
                       f"Error stats: {json.dumps(stats, indent=2)}"
        
        logger.error(error_message)
        raise AccomplishError(error_message, "plan_generation_failure")
    
    def _get_prose_plan_with_strategy(self, goal: str, mission_goal: Optional[str], inputs: Dict[str, Any], strategy: str, mission_context: Dict[str, Any]) -> str:
        """Get prose plan with different strategies based on retry attempt"""
        if strategy == 'simplified_prompt':
            # Use a simpler, more direct prompt
            return self._get_simplified_prose_plan(goal, mission_goal, inputs, mission_context)
        else:
            # Use the original approach
            return self._get_prose_plan(goal, mission_goal, inputs, mission_context)
    
    def _get_simplified_prose_plan(self, goal: str, mission_goal: Optional[str], inputs: Dict[str, Any], mission_context: Dict[str, Any]) -> str:
        """Generate a prose plan with simplified instructions"""
        # Detect if this is a multi-phase goal and focus on current phase
        focused_goal, current_phase, total_phases = self._detect_and_focus_on_current_phase(goal)
        
        context_input = inputs.get('context')
        context = context_input['value'] if isinstance(context_input, dict) and 'value' in context_input else (context_input or '')
        
        full_goal = focused_goal
        if mission_goal and mission_goal != focused_goal:
            full_goal = f"MISSION: {mission_goal}\n\nTASK: {focused_goal}"

        prompt = f"""You are an expert strategic planner and an autonomous agent. Your core purpose is to accomplish the user's mission by breaking it down into logical, functional steps. Your goal is to be resourceful and solve problems independently.

GOAL: {full_goal}

CONTEXT:
{context}

**SIMPLIFIED STRATEGY:** Create a concise, high-level prose plan to achieve the given goal. Focus on 3-5 clear, actionable steps.
The plan should describe *what* needs to be done, not low-level implementation details.

Return ONLY plain text for the plan. NO markdown formatting, NO code blocks, NO special formatting.
"""
        prompt = _enrich_prompt_with_context(prompt, mission_context)
        
        for attempt in range(self.max_retries):
            try:
                response, request_id = call_brain(prompt, inputs, "text")
                if not response or len(response.strip()) < 50:
                    logger.warning(f"Attempt {attempt + 1}: LLM returned an insufficient simplified prose plan.")
                    report_logic_failure_to_brain(request_id, inputs, "LLM returned insufficient simplified prose plan (too short or empty)")
                    continue
                return response.strip()
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} to get simplified prose plan failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
        raise AccomplishError("Could not generate a valid simplified prose plan after multiple attempts.", "prose_plan_error")
    
    def _detect_and_focus_on_current_phase(self, goal: str) -> Tuple[str, Optional[int], Optional[int]]:
        """
        Detects if the goal indicates a multi-phase mission and extracts relevant phase info.
        For now, this is a placeholder. It returns the original goal and no phase info.
        """
        # A more sophisticated implementation would parse the goal for "Phase X of Y" patterns.
        # For current purposes, assume no multi-phasing unless explicitly handled.
        return goal, None, None
    
    def _convert_to_structured_plan_with_recovery(self, prose_plan: str, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any], strategy: str) -> List[Dict[str, Any]]:
        """Convert prose to structured plan with enhanced error recovery"""
        plugin_guidance = _create_detailed_plugin_guidance(goal, inputs)
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)
        
        # Add strategy-specific guidance
        strategy_guidance = self._get_strategy_specific_guidance(strategy)
        
        # Initialize feedback message for current attempt
        feedback_message = ""

        for attempt in range(self.max_retries):
            # If this is a retry attempt, check if there's feedback to provide
            if attempt > 0 and self._last_attempt_single_step:
                feedback_message = "\nCRITICAL FEEDBACK: Your previous response was a single-step plan, but a detailed plan with multiple distinct steps is required to accomplish the goal. Please break down the task into several logical, actionable steps."
                self._last_attempt_single_step = False # Reset for next check
                
            full_goal = f"MISSION: {mission_goal}\n\nTASK: {goal}" if mission_goal and mission_goal != goal else goal

            # Fixed parts of the prompt that don't change
            fixed_header = "You are an expert system for converting prose plans into structured JSON according to a strict schema."
            task_intro = "**4. YOUR TASK:**\nFollow these steps to create the final JSON output:\n\n**STEP A: Internal Analysis & Self-Correction (Your Internal Monologue)**"
            step_a_points = [
                "1. **Analyze:** Read the Goal and Prose Plan to fully understand the user's intent and the required sequence of actions.",
                "2. **Verify Schema:** Carefully study the JSON SCHEMA. Your output must follow it perfectly.",
                "3. **Restate the Plan as Explicit Steps:** Identify a list of steps that will be taken to achieve the Goal. Each Step should be a clear, actionable task with one or more outputs.",
                "4. **Check Dependencies & Data Types:** For each step, ensure its `inputs` correctly reference the `outputName` and `sourceStep`. Crucially, verify that the `valueType` of the source output matches the expected `valueType` of the target input.",
                "5. **CRITICAL - USE UNIQUE STRING IDs:** Every single step in the plan MUST have a unique string identifier in the \"id\" field. This ID does NOT have to be a UUID, but it MUST be unique within the entire plan. For example: \"step_1\", \"step_2\", etc. Do NOT reuse IDs.",
                "6. **Final Check:** Before generating the output, perform a final check to ensure the entire JSON structure is valid and fully compliant with the schema.",
            ]
            step_b = "\n**STEP B: Generate Final JSON (Your Final Output)**\nAfter your internal analysis and self-correction is complete, provide ONLY the final, valid JSON output. The root of the JSON object MUST be a key named \"steps\" containing the JSON array of plan steps."
            example_format = """Example format:
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
```"""
            critical_principles_header = "\n**CRITICAL PLANNING PRINCIPLES (STRICTLY ENFORCED):**\n---"
            critical_principles = [
                "- **Direct, Actionable Plans:** Prioritize using concrete, executable `actionVerbs` from the `AVAILABLE PLUGINS` list. Your goal is to produce the most direct and actionable plan possible. Avoid creating abstract or novel verbs if the task can be accomplished with a sequence of known verbs.",
                "- **Autonomy is Paramount:** Your goal is to *solve* the mission, not to delegate research or information gathering back to the user.",
                "- **Resourcefulness:** Exhaust all available tools (`SEARCH`, `SCRAPE`, `QUERY_KNOWLEDGE_BASE`, `FILE_OPERATION`, `API_CLIENT`, `RUN_CODE`) to find answers and create deliverables *before* ever considering asking the user.",
                "- **Create Deliverables with `FILE_OPERATION`:** If a step's output is marked with `isDeliverable: true`, you **MUST** add a subsequent step using `FILE_OPERATION` with the `write` operation to save the output to the specified `filename`. This is essential for the user to see the work.",
                "- **Share Work Before Asking:** Before generating an `ASK_USER_QUESTION` step that refers to a work product, you **MUST** ensure a preceding `FILE_OPERATION` step saves that product to a file for the user to review.",
                "- **`ASK_USER_QUESTION` is a Last Resort:** This tool is exclusively for obtaining subjective opinions, approvals, or choices from the user. It is *never* for offloading tasks. Generating a plan that asks the user for information you can find yourself is a critical failure.",
                "- **Dependencies are Crucial:** Every step that uses an output from a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. A plan with disconnected steps is invalid.",
                "- **Role Assignment:** Assign `recommendedRole` at the deliverable level, not per individual step. All steps contributing to a single output (e.g., a research report) should share the same role.",
                "- **Type Compatibility & Serialization:**",
                "  - If a step output is an `object` or `array` and is to be used as an input that expects a `string`, you MUST explicitly serialize the object/array to a JSON string within the plan. For example, use a `TRANSFORM` step to `json.dumps()` the object before passing it to the `string` input.",
                "  - If an `array` or `list` output is to be used as a `string` input, consider if the intention is to iterate over each item. If so, a `FOREACH` control flow verb will be automatically injected by the system.",
                "- **Novel Action Verb Description:** If you propose a novel `actionVerb` (one not in the provided `AVAILABLE PLUGINS` list), you MUST provide a comprehensive `description` for that step, clearly explaining *what* the novel action verb does and *why* it's needed.",
                "\n- **CRITICAL: Respect Input Definitions:** For *every* `actionVerb` in your plan, you MUST consult its `inputDefinitions` (provided within `DISCOVERED CAPABILITIES`) and ensure *all* inputs marked as `\"required\": true` are explicitly provided in the step's `inputs` object. Failure to provide required inputs is a critical error.",
                "  - Provide values using either a concrete `\"value\"` (if available from the GOAL/CONTEXT) or by referencing an output from a previous step using `\"sourceStep\"` and `\"outputName\"`.",
                "  - If an input has a complex `type` like `object` or `array`, its `value` should be a JSON string representation if passed to a `string` input, or a direct JSON object/array if the input `valueType` matches.",
            ]
            deliverable_identification_header = "\n**DELIVERABLE IDENTIFICATION:**\nWhen defining outputs, you MUST identify which ones are deliverables for the user:"
            deliverable_identification_points = [
                "- For reports, analyses, or completed files that are meant for the user, you MUST use the enhanced format including `\"isDeliverable\": true` and a `\"filename\"`.",
                "- For intermediate data or outputs only used within the plan, use the simple format (DO NOT include `isDeliverable` or `filename`).",
                "- Guidelines for deliverable filenames:\n  * Use descriptive, professional names\n  * Use appropriate file extensions (.md, .txt, .json, .csv, .pdf, etc.)\n  * Avoid generic names like \"output.txt\" or \"result.json\"",
                "- **CRITICAL - LINKING STEPS:** You MUST explicitly connect steps. Any step that uses the output of a previous step MUST declare this in its `inputs` using `sourceStep` and `outputName`. DO NOT simply refer to previous outputs in a `prompt` string without also adding the formal dependency in the `inputs` object. For verbs like `THINK`, `CHAT`, or `ASK_USER_QUESTION`, if the `prompt` or `question` text refers to a file or work product from a previous step, you MUST add an input that references the output of that step using `sourceStep` and `outputName`.",
                " A plan with no connections between steps is invalid and will be rejected.",
                "- **CRITICAL - `sourceStep: '0'` Usage:**",
                "  - Use `sourceStep: '0'` ONLY for inputs that are explicitly provided in the initial mission context (the \"PARENT STEP INPUTS\" section if applicable, or the overall mission goal). This is primarily for sub-steps within a `FOREACH` or similar control flow structure to reference an item from their direct parent.",
                "  - DO NOT use `sourceStep: '0'` for top-level steps that are not nested within another step. Top-level steps should reference other preceding top-level steps by their actual UUID.",
            ]

            all_prompt_elements = [
                fixed_header,
                f"**1. THE GOAL:**\n---\n{full_goal}\n---",
                f"**2. THE PROSE PLAN:**\n---\n{prose_plan}\n---",
                strategy_guidance,
                plugin_guidance,
                feedback_message,
                f"**3. THE JSON SCHEMA FOR THE ENTIRE PLAN (ARRAY OF STEPS):**\n---\n{schema_json}\n---",
                task_intro,
            ] + step_a_points + [
                step_b,
                example_format,
                critical_principles_header,
            ] + critical_principles + [
                deliverable_identification_header,
            ] + deliverable_identification_points
            
            # Apply token efficiency to the combined elements
            # Groq Llama-3.1-8b-instant has 8192 context window. Let's aim for a safe buffer.
            # Max tokens for the model is 6000 according to logs, so target 5500 for prompt
            truncated_elements = create_token_efficient_prompt(all_prompt_elements, 5500) 

            # Reconstruct the prompt
            prompt = "\n\n".join([el for el in truncated_elements if el.strip()]) # Filter out empty strings
        
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
                    # JSON parsing failure is critical - LLM was explicitly told to return JSON
                    report_logic_failure_to_brain(request_id, inputs, f"LLM returned invalid JSON: {str(e)}", severity="critical")
                    if attempt == self.max_retries - 1:
                        raise AccomplishError(f"Failed to parse structured plan JSON: {e}", "json_parse_error")
                    continue
                
                plan_array = None
                if isinstance(plan, list):
                    plan_array = plan
                elif isinstance(plan, dict):
                    # Check if this dict has a 'steps' key with an array
                    if 'steps' in plan and isinstance(plan['steps'], list):
                        logger.info(f"ACCOMPLISH: Extracting plan from 'steps' key in response ({len(plan['steps'])} steps)")
                        plan_array = plan['steps']
                    # Check if this dict is itself a step (has actionVerb or id)
                    elif 'actionVerb' in plan or 'id' in plan:
                        logger.error(f"ACCOMPLISH: LLM returned a single step object instead of a plan array. This is an error that needs correction. Triggering retry with feedback.")
                        self._last_attempt_single_step = True
                        report_logic_failure_to_brain(request_id, inputs, "LLM returned single step instead of plan array - schema violation. Retrying with explicit feedback.", severity="critical")
                        if attempt == self.max_retries - 1: # If this was the last attempt, then fail
                             raise AccomplishError("LLM returned single step instead of plan array and retries exhausted.", "invalid_plan_format")
                        continue
                    else:
                        # Otherwise, check if any property contains an array of step-like objects
                        for key, value in plan.items():
                            if isinstance(value, list) and len(value) > 0:
                                # Check if it looks like a plan (array of objects with step-like properties)
                                if all(isinstance(item, dict) and ('actionVerb' in item or 'id' in item) for item in value):
                                    logger.info(f"ACCOMPLISH: Extracting plan from '{key}' key in response ({len(value)} steps)")
                                    plan_array = value
                                    break
                 
                if plan_array is not None:
                    return plan_array
                 
                logger.error(f"Attempt {attempt + 1}: Could not find a valid plan array in the response.")
                # Missing plan array is critical - explicit instruction was to return plan array
                report_logic_failure_to_brain(request_id, inputs, "LLM response was valid JSON but did not contain a recognizable plan array - schema violation.", severity="critical")
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
    
    def _get_strategy_specific_guidance(self, strategy: str) -> str:
        """Get additional guidance based on the current retry strategy"""
        if strategy == 'simplified_prompt':
            return "**STRATEGY: SIMPLIFIED APPROACH**\nFocus on creating a minimal, reliable plan with 3-5 clear steps. Prioritize known action verbs and avoid complex dependencies."
        elif strategy == 'step_by_step_guidance':
            return "**STRATEGY: STEP-BY-STEP**\nBreak down the goal into the smallest possible atomic steps. Each step should do one thing and one thing only. Use explicit dependencies between steps."
        elif strategy == 'alternative_approach':
            return "**STRATEGY: ALTERNATIVE APPROACH**\nTry a completely different way to achieve the goal. Think outside the box and consider unconventional but valid action verbs or sequences."
        else:
            return "**STRATEGY: STANDARD APPROACH**\nCreate a comprehensive plan using the best available action verbs and logical sequencing."
    
    def _generate_step_by_step_plan(self, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any], mission_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate a plan using a more structured, step-by-step approach"""
        # This would implement a different planning strategy
        # For now, we'll use the standard approach but could be enhanced
        return self._convert_to_structured_plan_with_recovery(
            f"Step 1: Analyze {goal}\nStep 2: Research {goal}\nStep 3: Implement {goal}\nStep 4: Test {goal}\nStep 5: Deliver {goal}",
            goal, mission_goal, mission_id, inputs, 'step_by_step_guidance'
        )
    
    def _generate_alternative_plan(self, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any], mission_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate a plan using an alternative approach"""
        # This would implement a different planning strategy
        # For now, we'll use the standard approach but could be enhanced
        return self._convert_to_structured_plan_with_recovery(
            f"Alternative approach for {goal}:\n1. Use GENERATE to create initial content\n2. Use SEARCH to find relevant information\n3. Use FILE_OPERATION to save results\n4. Use REFLECT to analyze outcomes",
            goal, mission_goal, mission_id, inputs, 'alternative_approach'
        )

    def _get_prose_plan(self, goal: str, mission_goal: Optional[str], inputs: Dict[str, Any], mission_context: Dict[str, Any]) -> str:
        """Phase 1: Get a well-thought prose plan from LLM with retries."""
       
        context_input = inputs.get('context')
        context = context_input['value'] if isinstance(context_input, dict) and 'value' in context_input else (context_input or '')
        
        # Ensure full_goal is always initialized
        full_goal = goal
        if mission_goal and mission_goal != goal:
            full_goal = f"MISSION: {mission_goal}\n\nTASK: {goal}"
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
        prompt = _enrich_prompt_with_context(prompt, mission_context)
        
        for attempt in range(self.max_retries):
            try:
                response, request_id = call_brain(prompt, inputs, "text")
                if not response or len(response.strip()) < 50:
                    logger.warning(f"Attempt {attempt + 1}: LLM returned an insufficient prose plan.")
                    report_logic_failure_to_brain(request_id, inputs, "LLM returned insufficient prose plan (too short or empty)")
                    continue
                return response.strip()
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} to get prose plan failed: {e}")
                if attempt == self.max_retries - 1:
                    raise
        raise AccomplishError("Could not generate a valid prose plan after multiple attempts.", "prose_plan_error")
    
    def _convert_to_structured_plan(self, prose_plan: str, goal: str, mission_goal: Optional[str], mission_id: Optional[str], inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 2: Convert prose plan to structured JSON with retries."""
        plugin_guidance = _create_detailed_plugin_guidance(goal, inputs)
        schema_json = json.dumps(PLAN_ARRAY_SCHEMA, indent=2)
        
        # Add explicit guidance about internal verbs
        internal_verbs_guidance = """
**INTERNAL VERBS (Always Available):**
- **GENERATE**: Uses LLM to generate content. Takes a required 'prompt' input.
- **THINK**: Internal reasoning. Takes a 'prompt' input.
- **IF_THEN**: Conditional branching. Requires 'condition', 'trueSteps', and optionally 'falseSteps'.
- **CHAT**: Agent conversation. Takes 'prompt' and optionally 'conversationHistory'.
- **FOREACH**: Iteration over arrays. Wraps steps to process multiple items.
- **WHILE**, **UNTIL**, **TIMEOUT**, **REPEAT**: Loop control verbs.
"""
        
        # Create token-efficient prompt
        full_goal = f"MISSION: {mission_goal}\n\nTASK: {goal}" if mission_goal and mission_goal != goal else goal
        token_efficient_context = create_token_efficient_prompt(full_goal, plugin_guidance, max_tokens=3500)
        
        # Initialize feedback message for current attempt
        feedback_message = ""

        for attempt in range(self.max_retries):
            # If this is a retry attempt, check if there's feedback to provide
            if attempt > 0 and self._last_attempt_single_step:
                feedback_message = "\nCRITICAL FEEDBACK: Your previous response was a single-step plan, but a detailed plan with multiple distinct steps is required to accomplish the goal. Please break down the task into several logical, actionable steps."
                self._last_attempt_single_step = False # Reset for next check

            prompt = f"""You are an expert system for converting prose plans into structured JSON according to a strict schema.

**1. THE GOAL:**
---
{full_goal}
---

**2. THE PROSE PLAN:**
---
{prose_plan}
---

{internal_verbs_guidance}

{token_efficient_context}

{feedback_message}

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

**CRITICAL PLANNING PRINCIPLES (STRICTLY ENFORCED):**
---
- **Direct, Actionable Plans:** Prioritize using concrete, executable `actionVerbs` from the `AVAILABLE PLUGINS` list. Your goal is to produce the most direct and actionable plan possible. Avoid creating abstract or novel verbs if the task can be accomplished with a sequence of known verbs.
- **Autonomy is Paramount:** Your goal is to *solve* the mission, not to delegate research or information gathering back to the user.
- **Resourcefulness:** Exhaust all available tools (`SEARCH`, `SCRAPE`, `QUERY_KNOWLEDGE_BASE`, `FILE_OPERATION`, `API_CLIENT`, `RUN_CODE`) to find answers and create deliverables *before* ever considering asking the user.
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
                    # JSON parsing failure is critical - LLM was explicitly told to return JSON
                    report_logic_failure_to_brain(request_id, inputs, f"LLM returned invalid JSON: {str(e)}", severity="critical")
                    if attempt == self.max_retries - 1:
                        raise AccomplishError(f"Failed to parse structured plan JSON: {e}", "json_parse_error")
                    continue

                plan_array = None
                if isinstance(plan, list):
                    plan_array = plan
                elif isinstance(plan, dict):
                    # Check if this dict has a 'steps' key with an array
                    if 'steps' in plan and isinstance(plan['steps'], list):
                        logger.info(f"ACCOMPLISH: Extracting plan from 'steps' key in response ({len(plan['steps'])} steps)")
                        plan_array = plan['steps']
                    # Check if this dict is itself a step (has actionVerb or id)
                    elif 'actionVerb' in plan or 'id' in plan:
                        logger.error(f"ACCOMPLISH: LLM returned a single step object instead of a plan array. This is an error that needs correction. Triggering retry with feedback.")
                        self._last_attempt_single_step = True
                        report_logic_failure_to_brain(request_id, inputs, "LLM returned single step instead of plan array - schema violation. Retrying with explicit feedback.", severity="critical")
                        if attempt == self.max_retries - 1: # If this was the last attempt, then fail
                             raise AccomplishError("LLM returned single step instead of plan array and retries exhausted.", "invalid_plan_format")
                        continue
                    else:
                        # Otherwise, check if any property contains an array of step-like objects
                        for key, value in plan.items():
                            if isinstance(value, list) and len(value) > 0:
                                # Check if it looks like a plan (array of objects with step-like properties)
                                if all(isinstance(item, dict) and ('actionVerb' in item or 'id' in item) for item in value):
                                    logger.info(f"ACCOMPLISH: Extracting plan from '{key}' key in response ({len(value)} steps)")
                                    plan_array = value
                                    break
                
                if plan_array is not None:
                    return plan_array
                
                logger.error(f"Attempt {attempt + 1}: Could not find a valid plan array in the response.")
                # Missing plan array is critical - explicit instruction was to return plan array
                report_logic_failure_to_brain(request_id, inputs, "LLM response was valid JSON but did not contain a recognizable plan array - schema violation.", severity="critical")
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

    def __init__(self, inputs: Dict[str, Any]): # Add inputs parameter
        self.max_retries = 3
        # Prepare librarian_info
        librarian_info = _get_librarian_info(inputs)

        # Initialize the validator with the discovered plugins and librarian_info
        self.validator = PlanValidator(
            brain_call=call_brain, 
            report_logic_failure_call=report_logic_failure_to_brain,
            librarian_info=librarian_info # Pass librarian_info
        )

    def handle(self, inputs: Dict[str, Any]) -> str:
        """
        Handles a novel verb request by first attempting a semantic search for a replacement
        and falling back to LLM-based plan generation if no suitable replacement is found.
        """
        try:
            verb_info = self._extract_verb_info(inputs)
            
            # Phase 1: Reactive Semantic Search
            logger.info(f"NovelVerbHandler: Attempting semantic search for verb '{verb_info.get('verb')}'...")
            substitution_plan = self._semantic_search_for_verb(verb_info, inputs)

            if substitution_plan:
                logger.info("Semantic search found a high-confidence substitute. Returning substitution plan.")
                # The _semantic_search_for_verb method already formats the response
                return substitution_plan

            # Phase 2: Fallback to LLM Decomposition
            logger.info("Semantic search found no substitute. Falling back to LLM-based decomposition.")
            brain_response = self._ask_brain_for_verb_handling(verb_info, inputs)
            return self._format_response(brain_response, verb_info, inputs)

        except Exception as e:
            logger.error(f"Novel verb handling failed: {e}", exc_info=True)
            return json.dumps([{"success": False, "name": "error", "resultType": "error", "resultDescription": f"Novel verb handling failed: {str(e)}", "result": str(e), "mimeType": "text/plain"}])

    def _semantic_search_for_verb(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> Optional[str]:
        """
        Performs a semantic search for a verb and returns a single-step plan if a high-confidence match is found.
        """
        query = verb_info.get('description') or verb_info.get('verb')
        if not query:
            return None

        try:
            # Use the same discovery mechanism as the main planner
            discovery_result = discover_verbs_for_planning(query, inputs)
            relevant_verbs = discovery_result.get('relevantVerbs', [])
            
            # Simple confidence check: is the first result's verb different from the novel one?
            if relevant_verbs:
                top_match = relevant_verbs[0]
                top_verb = top_match.get('verb')
                novel_verb = verb_info.get('verb')

                # Check if the found verb is a legitimate, different verb and seems like a good fit
                # (A more sophisticated confidence score/logic would go here in a real implementation)
                if top_verb and top_verb.lower() != novel_verb.lower():
                    logger.info(f"Found potential substitute for '{novel_verb}': '{top_verb}'")
                    
                    # Create a simple, one-step plan to substitute the novel verb
                    substitution_step = {
                        "id": str(uuid.uuid4()),
                        "actionVerb": top_verb,
                        "description": f"Substituted novel verb '{novel_verb}' with discovered verb '{top_verb}'. Original goal: {verb_info.get('description', '')}",
                        "inputs": verb_info.get('inputValues', {}),
                        "outputs": verb_info.get('outputs', {})
                    }
                    
                    # We must validate this new single-step plan
                    validation_result = self.validator.validate_and_repair([substitution_step], verb_info.get('description',''), inputs)
                    if not validation_result.is_valid:
                         logger.warning(f"Proposed substitution plan for '{top_verb}' failed validation. Cannot substitute.")
                         return None
                    
                    # Return the formatted response directly
                    return json.dumps([{
                        "success": True, 
                        "name": "plan", 
                        "resultType": "plan", 
                        "resultDescription": f"Plan created by substituting novel verb '{novel_verb}' with '{top_verb}'", 
                        "result": validation_result.plan, 
                        "mimeType": "application/json"
                    }])

        except Exception as e:
            logger.warning(f"Semantic search for novel verb failed: {e}")
        
        return None

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
        plugin_guidance = _create_detailed_plugin_guidance(verb_info.get('description', ''), inputs)
        
        # Max tokens for the model is 6000 according to logs, so target 5500 for prompt
        # Leaving a buffer for system messages and other fixed parts.
        
        # Fixed parts of the prompt
        fixed_intro = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported."""
        verb_details = f"""VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}"""
        parent_inputs = f"PARENT STEP INPUTS: {json.dumps(inputs)}"
        task_instruction = f"""Your task is to create a plan to accomplish the goal of the novel verb "{verb}" using available tools."""
        
        critical_output_format = """**CRITICAL OUTPUT FORMAT:**
        - Your response MUST be a JSON array of step objects
        - Even if the plan has only one step, it MUST be wrapped in an array: [{{"actionVerb": "...", ...}}]
        - Do NOT return a single step object without the array wrapper
        - Do NOT return any text outside the JSON array
        - Return ONLY the JSON array, nothing else"""

        critical_uuid_requirements = """**CRITICAL UUID REQUIREMENTS:**
        - Each step MUST have a globally unique random UUID (version 4) in the "id" field
        - Use random UUIDs like "a3f2c8d1-4b7e-4c9a-8f1d-2e5b6c7d8e9f"
        - Do NOT use sequential patterns like "00000000-0000-4000-8000-000000000001"
        - Do NOT reuse UUIDs anywhere in the plan"""

        critical_constraints = f"""**CRITICAL CONSTRAINTS:**
        - You MUST NOT use the novel verb "{verb}" in your plan - use available plugins instead
        - Use existing action verbs from the available plugins listed below
        - Break down the task into granular, atomic steps using available tools
        - You are an autonomous agent - solve problems independently
        - Do not use `ASK_USER_QUESTION` to seek information that can be found using `SEARCH` or `SCRAPE`
        - **If you create a new actionVerb not listed in the AVAILABLE PLUGINS section, you MUST provide a comprehensive `description` for that step.** This description should clearly explain the purpose and functionality of the new action verb.
- **CRITICAL: Respect Input Definitions:** For *every* `actionVerb` in your plan, you MUST consult its `inputDefinitions` (provided within `DISCOVERED CAPABILITIES`) and ensure *all* inputs marked as `\"required\": true` are explicitly provided in the step's `inputs` object. Failure to provide required inputs is a critical error.
  - Provide values using either a concrete `\"value\"` (if available from the VERB's CONTEXT or DESCRIPTION) or by referencing an output from a previous step using `\"sourceStep\"` and `\"outputName\"`."""

        plan_schema_section = f"""**Plan Schema (JSON Array of Steps):**
        {schema_json}"""

        input_rules = """- **CRITICAL for REQUIRED Inputs:** For each step, you MUST examine the `inputDefinitions` for the corresponding `actionVerb` and ensure that all `required` inputs are present in the step's `inputs` object. If an input is marked `required: true`, it MUST be provided.
        - **CRITICAL for JSON compliance:** Ensure all string literals within the generated JSON, including any nested ones, strictly adhere to JSON standards by using double quotes.
        - **CRITICAL for Plan Inputs, sourceStep:**
            - All inputs for each step must be explicitly defined either as a constant `value` or by referencing an `outputName` from a `sourceStep` within the plan or from the `PARENT STEP INPUTS`. Do not assume implicit data structures or properties of inputs.
            - Use `sourceStep: '0'` ONLY for inputs that are explicitly provided in the initial mission context (the "PARENT STEP INPUTS" section if applicable, or the overall mission goal). This is primarily for sub-steps within a `FOREACH` or similar control flow structure to reference an item from their direct parent.
            - For any other input, it MUST be the `outputName` from a *preceding step* in this plan, and `sourceStep` MUST be the `id` of that preceding step.
            - Every input in your plan MUST be resolvable either from a given constant value, a "PARENT STEP INPUT" (using `sourceStep: '0'`) or from an output of a previous step in the plan.
        - **Mapping Outputs to Inputs:** When the output of one step is used as the input to another, the `outputName` in the input of the second step must match the `name` of the output of the first step.
        - **CRITICAL: Embedded References in Input Values:** If you use placeholders like `{{output_name}}` within a longer string value (e.g., a prompt that refers to previous outputs), you MUST also declare each referenced `output_name` as a separate input with proper `sourceStep` and `outputName`. For example, if a `prompt` refers to `competitor_details`, you need an input entry for `competitor_details` with `outputName` and `sourceStep`."""

        action_verb_rule = f"""CRITICAL: The actionVerb for each step MUST be a valid, existing plugin actionVerb (from the provided list) or a descriptive, new actionVerb (e.g., 'ANALYZE_DATA', 'GENERATE_REPORT'). It MUST NOT be 'UNKNOWN' or 'NOVEL_VERB'."""

        deliverable_rules_header = """CRITICAL: DELIVERABLE IDENTIFICATION - VERY IMPORTANT"""
        deliverable_rules_points = """- For reports, analyses, or completed files that are meant for the user, you MUST use the enhanced format including `"isDeliverable": true` and a `"filename"`.
        - For intermediate data or outputs only used within the plan, use the simple format (DO NOT include `isDeliverable` or `filename`).
        - Guidelines for deliverable filenames:
          * Use descriptive, professional names
          * Use appropriate file extensions (.md, .txt, .json, .csv, .pdf, etc.)
          * Avoid generic names like "output.txt" or "result.json"
        """
        all_prompt_elements = [
            fixed_intro,
            verb_details,
            parent_inputs,
            plugin_guidance,
            task_instruction,
            critical_output_format,
            critical_uuid_requirements,
            critical_constraints,
            plan_schema_section,
            input_rules,
            action_verb_rule,
            deliverable_rules_header,
            deliverable_rules_points
        ]
        
        # Apply token efficiency to the combined elements
        truncated_elements = create_token_efficient_prompt(all_prompt_elements, 5500)
        
        # Reconstruct the prompt
        prompt = "\n\n".join([el for el in truncated_elements if el.strip()])

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
                
                if is_novel:
                    handler = NovelVerbHandler(inputs) # Pass inputs here
                    result = handler.handle(inputs)
                else:
                    handler = RobustMissionPlanner(inputs) # Pass inputs here
                    result = handler.plan(inputs)

                # Validate that result is valid JSON before returning
                try:
                    json.loads(result)
                except json.JSONDecodeError as e:
                    logger.error(f"Generated result is not valid JSON: {e}. Result (first 500 chars): {result[:500]}")
                    raise AccomplishError(f"Internal error: generated result is malformed JSON: {e}", "internal_error")
                
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
    Includes a top-level try-except block to ensure a JSON error is always returned on failure.
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
            # Return a valid error structure for empty input
            error_output = [{"success": False, "name": "error", "resultType": "error", "resultDescription": "Plugin received no input data.", "result": "Input data is empty.", "mimeType": "text/plain"}]
            print(json.dumps(error_output, indent=2))
            return

        # Execute with robust error handling
        result = orchestrator.execute(input_data)

        # Output result
        print(result)
        progress.checkpoint("plan_creation_complete")
        
    except Exception as e:
        logger.critical(f"A critical unhandled exception occurred in main: {e}", exc_info=True)
        error_output = [{"success": False, "name": "error", "resultType": "critical_error", "resultDescription": f"A critical unhandled exception occurred: {str(e)}", "result": str(e), "mimeType": "text/plain"}]
        print(json.dumps(error_output, indent=2))
        # Optionally exit with a non-zero status code, though printing the error is the main goal for the caller
        sys.exit(1)

# Main execution
if __name__ == "__main__":
    main()
