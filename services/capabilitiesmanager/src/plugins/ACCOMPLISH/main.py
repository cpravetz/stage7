#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Simplified Implementation
Focuses on core functionality with better error handling and logging
"""

import json
import sys
import logging
import requests
import os
import hashlib
import time
import tempfile
import shutil
from typing import Dict, Any, List

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# Add a simple progress tracker
class ProgressTracker:
    def __init__(self):
        self.start_time = time.time()
        self.checkpoints = []

    def checkpoint(self, name: str):
        elapsed = time.time() - self.start_time
        self.checkpoints.append((name, elapsed))
        logger.info(f"CHECKPOINT: {name} at {elapsed:.2f}s")

    def get_summary(self):
        return f"Total checkpoints: {len(self.checkpoints)}, Total time: {time.time() - self.start_time:.2f}s"

progress = ProgressTracker()

# Simplified error handling
class AccomplishError(Exception):
    """Custom exception for ACCOMPLISH plugin errors"""
    def __init__(self, message: str, error_type: str = "general_error"):
        super().__init__(message)
        self.error_type = error_type

# Simplified authentication
def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs (provided by CapabilitiesManager)"""
    progress.checkpoint("auth_start")

    try:
        # CapabilitiesManager provides tokens via inputs
        # Check for Brain-specific token first (for ACCOMPLISH plugin)
        brain_token = inputs.get('__brain_auth_token', {}).get('value', '')
        if brain_token:
            progress.checkpoint("auth_success_brain_token")
            logger.info("Using __brain_auth_token from inputs")
            return brain_token

        # Fallback to general auth token
        auth_token = inputs.get('__auth_token', {}).get('value', '')
        if auth_token:
            progress.checkpoint("auth_success_auth_token")
            logger.info("Using __auth_token from inputs")
            return auth_token

        # If no tokens provided, this is an error
        progress.checkpoint("auth_failed_no_token")
        raise AccomplishError("No authentication token provided by CapabilitiesManager", "auth_error")

    except Exception as e:
        progress.checkpoint("auth_failed")
        logger.error(f"Auth failed: {e}")
        raise AccomplishError(f"Authentication failed: {e}", "auth_error")

# Schema for novel verb handling - expects response with plan/direct_answer/plugin
response_schema_str = '''
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "oneOf": [
    {
      "properties": {
        "plan": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "number": {"type": "integer", "minimum": 1},
              "actionVerb": {"type": "string"},
              "description": {"type": "string"},
              "inputs": {"type": "object"},
              "outputs": {"type": "object"},
              "dependencies": {"type": "object"}
            },
            "required": ["number", "actionVerb", "description", "inputs", "outputs", "dependencies"]
          }
        }
      },
      "required": ["plan"],
      "additionalProperties": false
    },
    {
      "properties": {
        "direct_answer": {"type": "object"}
      },
      "required": ["direct_answer"],
      "additionalProperties": false
    },
    {
      "properties": {
        "plugin": {
          "type": "object",
          "properties": {
            "id": {"type": "string"},
            "description": {"type": "string"},
            "actionVerb": {"type": "string"},
            "inputDefinitions": {"type": "array"},
            "outputDefinitions": {"type": "array"}
          },
          "required": ["id", "description", "actionVerb"]
        }
      },
      "required": ["plugin"],
      "additionalProperties": false
    }
  ]
}
'''

# Simple validation functions
def validate_plan_schema(response: Dict[str, Any]) -> Dict[str, Any]:
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
    return {'valid': True}



def call_brain(prompt: str, inputs: Dict[str, Any], response_type: str = "json") -> str:
    """Simplified Brain service call with detailed logging"""
    progress.checkpoint("brain_call_start")

    try:
        # Get authentication from inputs
        token = get_auth_token(inputs)

        # Setup Brain URL from inputs or environment
        brain_url = inputs.get('brain_url', {}).get('value', 'brain:5070')
        if not brain_url.startswith(('http://', 'https://')):
            brain_url = f"http://{brain_url}"
        brain_url = f"{brain_url.rstrip('/')}/chat"

        logger.info(f"Calling Brain at: {brain_url}")

        # Prepare headers
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }

        # Simple system message
        system_message = (
            "You are a planning assistant. Generate actionable plans as JSON arrays. "
            "Each step must have: number, actionVerb, description, inputs, outputs, dependencies."
        )

        # Prepare payload
        payload = {
            "exchanges": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "conversationType": "TextToText",
            "responseType": response_type,
            "temperature": 0.2
        }

        progress.checkpoint("brain_request_prepared")
        logger.info(f"Sending request to Brain (timeout: 300s)")

        # Make the request with detailed logging
        response = requests.post(brain_url, headers=headers, json=payload, timeout=300)
        progress.checkpoint("brain_response_received")

        response.raise_for_status()
        data = response.json()

        # Handle error responses
        if 'error' in data:
            error_msg = data['error']
            progress.checkpoint("brain_error_detected")
            logger.error(f"Brain service error: {error_msg}")
            raise AccomplishError(f"Brain service error: {error_msg}", "brain_error")

        # Extract response
        brain_response = data.get("response", data.get("result", str(data)))
        progress.checkpoint("brain_response_extracted")
        logger.info(f"Brain response received ({len(brain_response)} chars)")

        return brain_response

    except requests.exceptions.Timeout:
        progress.checkpoint("brain_timeout")
        logger.error("Brain call timed out after 300 seconds")
        raise AccomplishError("Brain service timeout", "timeout_error")
    except requests.exceptions.RequestException as e:
        progress.checkpoint("brain_request_error")
        logger.error(f"Brain request failed: {e}")
        raise AccomplishError(f"Brain request failed: {e}", "request_error")
    except Exception as e:
        progress.checkpoint("brain_unexpected_error")
        logger.error(f"Unexpected error calling Brain: {e}")
        raise AccomplishError(f"Unexpected Brain error: {e}", "unexpected_error")




# Simplified input parsing and validation
def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and validate inputs with detailed logging"""
    progress.checkpoint("input_parsing_start")

    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        inputs_list = json.loads(inputs_str)

        # Convert list of [key, value] pairs to dictionary
        inputs = {}
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, value = item
                inputs[key] = value
            else:
                raise ValueError(f"Invalid input format: {item}")

        # Validate required fields
        if 'goal' not in inputs and 'novel_actionVerb' not in inputs:
            raise ValueError("Required input 'goal' or 'novel_actionVerb' not provided")

        progress.checkpoint("input_parsing_success")
        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs

    except json.JSONDecodeError as e:
        progress.checkpoint("input_parsing_json_error")
        logger.error(f"JSON decode error: {e}")
        raise AccomplishError(f"Invalid JSON input: {e}", "input_error")
    except Exception as e:
        progress.checkpoint("input_parsing_error")
        logger.error(f"Input parsing failed: {e}")
        raise AccomplishError(f"Input validation failed: {e}", "input_error")

# Simple plan validation
def validate_plan(plan: List[Dict[str, Any]]) -> bool:
    """Basic plan validation"""
    if not isinstance(plan, list) or len(plan) == 0:
        return False

    for i, step in enumerate(plan):
        if not isinstance(step, dict):
            logger.error(f"Step {i+1} is not a dictionary")
            return False

        required_fields = ['number', 'actionVerb', 'description', 'inputs', 'outputs', 'dependencies']
        for field in required_fields:
            if field not in step:
                logger.error(f"Step {i+1} missing required field: {field}")
                return False

    return True

# Simplified Mission Goal Planner
class SimpleMissionPlanner:
    def __init__(self):
        pass

    def create_plan(self, goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create a plan for the given goal with detailed logging"""
        progress.checkpoint("planning_start")
        logger.info(f"Creating plan for goal: {goal[:100]}...")

        try:
            # Single-phase approach: directly ask for JSON plan
            prompt = f"""Create a detailed plan to accomplish this goal: {goal}

Return a JSON array of steps. Each step must have:
- number: sequential step number (integer)
- actionVerb: the action to perform (string)
- description: what this step does (string)
- inputs: object with input parameters (object)
- outputs: object describing expected outputs (object)
- dependencies: object mapping output names to step numbers (object)

Example format:
[
  {{
    "number": 1,
    "actionVerb": "SEARCH",
    "description": "Research the topic",
    "inputs": {{"searchTerm": {{"value": "example", "valueType": "string", "args": {{}}}}}},
    "outputs": {{"research_data": "Research findings and information"}},
    "dependencies": {{}}
  }}
]

Return ONLY the JSON array, no other text."""

            progress.checkpoint("brain_call_initiated")
            response = call_brain(prompt, inputs, "json")
            progress.checkpoint("brain_response_received")

            # Parse the response
            plan = self._parse_plan_response(response)
            progress.checkpoint("plan_parsed")

            # Validate the plan
            if not validate_plan(plan):
                raise AccomplishError("Generated plan failed validation", "validation_error")

            progress.checkpoint("plan_validated")
            logger.info(f"Successfully created plan with {len(plan)} steps")
            return plan

        except Exception as e:
            progress.checkpoint("planning_failed")
            logger.error(f"Planning failed: {e}")
            raise AccomplishError(f"Failed to create plan: {e}", "planning_error")

    def _parse_plan_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse Brain response into a plan"""
        progress.checkpoint("response_parsing_start")

        try:
            # Try to parse as JSON directly
            plan = json.loads(response)

            # If it's wrapped in an object, extract the plan array
            if isinstance(plan, dict) and 'plan' in plan:
                plan = plan['plan']

            if not isinstance(plan, list):
                raise ValueError("Response is not a list")

            progress.checkpoint("response_parsing_success")
            return plan

        except json.JSONDecodeError as e:
            progress.checkpoint("response_parsing_json_error")
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response content: {response[:500]}...")
            raise AccomplishError(f"Invalid JSON response: {e}", "json_error")
        except Exception as e:
            progress.checkpoint("response_parsing_error")
            logger.error(f"Failed to parse response: {e}")
            raise AccomplishError(f"Response parsing failed: {e}", "parsing_error")

    def plan(self, inputs: Dict[str, Any]) -> str:
        """Simplified plan method using the new approach"""
        progress.checkpoint("plan_method_start")

        try:
            # Extract goal from inputs
            goal = inputs.get('goal', '')
            if isinstance(goal, dict):
                goal = goal.get('value', str(goal))

            if not goal:
                raise AccomplishError("No goal provided in inputs", "input_error")

            logger.info(f"Planning for goal: {goal}")

            # Create the plan using simplified approach
            plan = self.create_plan(goal, inputs)

            # Return success response
            result = [{
                "success": True,
                "name": "plan_generated",
                "resultType": "plan",
                "resultDescription": f"Successfully generated a {len(plan)}-step plan",
                "result": plan,
                "mimeType": "application/json"
            }]

            progress.checkpoint("plan_method_success")
            logger.info(f"Plan method completed successfully with {len(plan)} steps")
            return json.dumps(result)

        except AccomplishError as e:
            progress.checkpoint("plan_method_accomplish_error")
            logger.error(f"ACCOMPLISH error in plan method: {e}")
            return json.dumps([{
                "success": False,
                "name": e.error_type,
                "resultType": "system_error",
                "resultDescription": str(e),
                "result": str(e),
                "mimeType": "text/plain"
            }])
        except Exception as e:
            progress.checkpoint("plan_method_unexpected_error")
            logger.error(f"Unexpected error in plan method: {e}")
            return json.dumps([{
                "success": False,
                "name": "unexpected_error",
                "resultType": "system_error",
                "resultDescription": f"Unexpected error: {e}",
                "result": str(e),
                "mimeType": "text/plain"
            }])
    


class NovelVerbHandler:
    def __init__(self):
        pass # No need to store URL, _call_brain handles it
    def handle(self, inputs: Dict[str, Any]) -> str:
        try:
            logger.info(f"NovelVerbHandler starting with inputs: {json.dumps(inputs, indent=2)}")

            # Phase 1: Clarify the new actionVerb and its context
            verb_info = self._clarify_verb(inputs)
            logger.info(f"Clarified verb info: {json.dumps(verb_info, indent=2)}")

            # Validate that we have essential information
            if not verb_info.get('verb') or verb_info.get('verb') == 'NOVEL_VERB':
                raise Exception(f"Failed to extract valid action verb from inputs. Got: {verb_info.get('verb')}")

            # Phase 2: Ask Brain how to handle the new actionVerb
            brain_response = self._ask_brain_for_verb_handling(verb_info, inputs)
            logger.info(f"Brain response received: {brain_response[:200]}...")

            # Phase 3: Decide: is this a plan, direct output, or plugin recommendation?
            result_type, result_payload = self._interpret_brain_response(brain_response)
            logger.info(f"Interpreted result type: {result_type}")

            if result_type == "plan":
                # Validate the plan before returning
                if not isinstance(result_payload, list):
                    raise Exception(f"Expected plan to be a list, got {type(result_payload)}: {result_payload}")

                if len(result_payload) == 0:
                    raise Exception("Brain returned an empty plan. This is not acceptable for novel verb handling.")

                # Check that each step has required fields
                for i, step in enumerate(result_payload):
                    if not isinstance(step, dict):
                        raise Exception(f"Step {i+1} is not a dictionary: {step}")
                    if 'actionVerb' not in step:
                        raise Exception(f"Step {i+1} missing required field 'actionVerb': {step}")
                    if not step.get('actionVerb'):
                        raise Exception(f"Step {i+1} has empty actionVerb: {step}")

                # Simple validation
                if not validate_plan(result_payload):
                    raise Exception("Generated plan failed basic validation")

                return json.dumps([{
                    "success": True,
                    "name": "plan",
                    "resultType": "plan",
                    "resultDescription": f"A plan for novel actionVerb: {verb_info.get('verb')}",
                    "result": result_payload,
                    "mimeType": "application/json"
                }])
            elif result_type == "plugin":
                # Phase 4: Plugin requirements/design document creation
                plugin_design_doc = self._create_plugin_design_doc(result_payload, verb_info)
                # Basic plugin validation
                if not isinstance(result_payload, dict) or 'actionVerb' not in result_payload:
                    raise Exception("Plugin response missing required fields")
                return json.dumps([{
                    "success": True,
                    "name": "plugin",
                    "resultType": "plugin",
                    "resultDescription": f"Plugin defined: {result_payload.get('id', 'unknown')}",
                    "result": result_payload,
                    "pluginDesignDoc": plugin_design_doc,
                    "mimeType": "application/json"
                }])
            elif result_type == "direct_answer":
                return json.dumps([{
                    "success": True,
                    "name": "direct_answer",
                    "resultType": "direct_answer",
                    "resultDescription": "Direct output values provided for the step outputs.",
                    "result": result_payload,
                    "mimeType": "application/json"
                }])
            else:
                raise Exception(f"Brain returned unrecognized result type: {result_type}")

        except Exception as e:
            logger.error(f"NovelVerbHandler failed: {e}")
            return json.dumps([{
                "success": False,
                "name": "novel_verb_error",
                "resultType": "error",
                "resultDescription": f"Novel verb handling failed: {str(e)}",
                "result": str(e),
                "mimeType": "text/plain"
            }])

    def _clarify_verb(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("Clarifying novel actionVerb from inputs.")
        logger.info(f"Raw inputs received: {json.dumps(inputs, indent=2)}")

        # Check if this is the new structured format from CapabilitiesManager.handleUnknownVerb
        if 'novel_actionVerb' in inputs and isinstance(inputs['novel_actionVerb'], dict):
            novel_verb_data = inputs['novel_actionVerb']

            # Check if it's the new structured format with 'value' containing the object
            if 'value' in novel_verb_data and isinstance(novel_verb_data['value'], dict):
                # New structured format from CapabilitiesManager
                verb_info = novel_verb_data['value']
                logger.info(f"Processing structured novel verb info: {json.dumps(verb_info, indent=2)}")

                return {
                    "id": f"novel_{verb_info.get('verb', 'NOVEL_VERB').lower().replace(' ', '_')}",
                    "verb": verb_info.get('verb', 'NOVEL_VERB'),
                    "description": verb_info.get('description', 'A novel action verb.'),
                    "context": verb_info.get('context', ''),
                    "inputValues": verb_info.get('inputValues', {}),
                    "outputs": verb_info.get('outputs', {}),
                    "stepId": verb_info.get('stepId', ''),
                    "stepNo": verb_info.get('stepNo', 0),
                    "inputDefinitions": [],  # Can be derived from inputValues if needed
                    "outputDefinitions": []  # Can be derived from outputs if needed
                }
            elif 'value' in novel_verb_data and isinstance(novel_verb_data['value'], str):
                # Legacy string format - extract from the goal string
                goal_text = novel_verb_data['value']
                logger.info(f"Parsing legacy goal text for novel verb: {goal_text}")

                # Extract the action verb from the goal text
                import re
                verb_match = re.search(r'complete the step "([^"]+)"', goal_text)
                verb = verb_match.group(1) if verb_match else 'NOVEL_VERB'

                # Extract context after "with the following context:"
                context_match = re.search(r'with the following context:\s*(.+?)\s*The following inputs are available:', goal_text, re.DOTALL)
                description = context_match.group(1).strip() if context_match else 'A novel action verb.'

                # Extract inputs information
                inputs_match = re.search(r'The following inputs are available:\s*(.+)', goal_text)
                inputs_text = inputs_match.group(1) if inputs_match else ''

                logger.info(f"Extracted verb: {verb}, description: {description}, inputs: {inputs_text}")

                return {
                    "id": f"novel_{verb.lower().replace(' ', '_')}",
                    "verb": verb,
                    "description": description,
                    "context": description,
                    "available_inputs": inputs_text,
                    "inputDefinitions": [],
                    "outputDefinitions": []
                }
            else:
                # Original structured format (direct object)
                return {
                    "id": novel_verb_data.get('id', 'novel_plugin'),
                    "verb": novel_verb_data.get('verb', 'NOVEL_VERB'),
                    "description": novel_verb_data.get('description', 'A novel plugin.'),
                    "inputDefinitions": novel_verb_data.get('inputDefinitions', []),
                    "outputDefinitions": novel_verb_data.get('outputDefinitions', [])
                }
        else:
            # Fallback for unexpected format
            logger.warning(f"Unexpected input format for novel verb: {inputs}")
            return {
                "id": 'novel_plugin',
                "verb": 'NOVEL_VERB',
                "description": 'A novel plugin.',
                "inputDefinitions": [],
                "outputDefinitions": []
            }

    def _ask_brain_for_verb_handling(self, verb_info: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        # Construct a contextual prompt using the extracted information
        verb = verb_info['verb']
        description = verb_info.get('description', 'No description provided')
        context = verb_info.get('context', description)
        available_inputs = verb_info.get('available_inputs', 'No inputs specified')

        # Determine the best approach based on the verb and context
        prompt = f"""You are tasked with handling the novel action verb "{verb}".

**Context:** {context}
**Available Inputs:** {available_inputs}

**Your task:** Determine the best way to handle this action verb and respond accordingly.

**Response Options:**
1. **Create a Plan** - Break down the action into executable steps
2. **Provide Direct Answer** - If you can directly provide the expected outputs
3. **Recommend Plugin** - If this requires specialized functionality

**Response Format:** Return ONLY valid JSON matching this schema:
{response_schema_str}

**Examples:**

For a plan:
{{"plan": [
  {{"number": 1, "actionVerb": "SEARCH", "description": "...", "inputs": {{}}, "outputs": {{}}, "dependencies": {{}}}},
  {{"number": 2, "actionVerb": "ANALYZE", "description": "...", "inputs": {{}}, "outputs": {{}}, "dependencies": {{}}}}
]}}

For a direct answer:
{{"direct_answer": {{"output_name": "output_value", "another_output": "another_value"}}}}

For a plugin recommendation:
{{"plugin": {{"id": "plugin_name", "description": "...", "actionVerb": "{verb}", "inputDefinitions": [], "outputDefinitions": []}}}}

**Important:** You may use any action verbs in your plan, including novel ones. The system is designed to handle and learn new action verbs."""

        logger.info(f"Sending contextual prompt to Brain for verb '{verb}': {prompt[:200]}...")
        brain_response = call_brain(prompt, inputs, 'json')

        # Check if Brain returned an error response
        if isinstance(brain_response, str) and brain_response.startswith('{"success": false'):
            logger.error(f"Brain call failed for novel verb '{verb}'")
            return brain_response  # Return the error response directly

        return brain_response

    def _create_plugin_design_doc(self, plugin_payload: Dict[str, Any], verb_info: Dict[str, Any]) -> str:
        """Create a design document for a recommended plugin."""
        return f"""
# Plugin Design Document

## Plugin: {plugin_payload.get('id', 'Unknown')}

### Purpose
Handle the action verb: {verb_info.get('verb', 'Unknown')}

### Description
{verb_info.get('description', 'No description provided')}

### Recommended Implementation
{json.dumps(plugin_payload, indent=2)}

### Context
{verb_info.get('context', 'No additional context')}
"""

    def _interpret_brain_response(self, brain_response: str):
        try:
            logger.info(f"Interpreting Brain response: {brain_response[:500]}...")
            data = json.loads(brain_response)
            logger.info(f"Parsed Brain response structure: {list(data.keys())}")

            # Check for the expected response formats
            if "plan" in data:
                logger.info("Brain response contains a plan")
                return "plan", data["plan"]
            elif "plugin" in data:
                logger.info("Brain response contains a plugin recommendation")
                return "plugin", data["plugin"]
            elif "direct_answer" in data:
                logger.info("Brain response contains a direct answer")
                return "direct_answer", data["direct_answer"]
            elif isinstance(data, list):
                # Sometimes the Brain returns just the plan array directly
                logger.info("Brain response is a plan array directly")
                return "plan", data
            else:
                # Log the actual response structure for debugging
                logger.error(f"Brain response structure: {list(data.keys())}")
                logger.error(f"Full response: {json.dumps(data, indent=2)[:1000]}...")
                raise Exception(f"No recognized result type in Brain response. Available keys: {list(data.keys())}")

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Brain response as JSON: {e}")
            logger.error(f"Raw response: {brain_response[:500]}...")
            raise Exception(f"Brain response is not valid JSON: {e}")
        except Exception as e:
            logger.error(f"Failed to interpret Brain response: {e}")
            raise Exception(f"Failed to interpret Brain response: {e}")



class AccomplishOrchestrator:
    def __init__(self):
        self.goal_planner = SimpleMissionPlanner()
        self.novel_verb_handler = NovelVerbHandler()
        self.seen_hashes = set()
        self.temp_dir = None

    def execute(self, inputs_str: str) -> str:
        """Main execution method with simplified logic and detailed logging"""
        progress.checkpoint("orchestrator_execute_start")
        logger.info(f"ACCOMPLISH orchestrator received raw input: {inputs_str}")

        try:
            # Input validation
            if not inputs_str or not isinstance(inputs_str, str):
                progress.checkpoint("no_input_provided")
                logger.error("No input provided to ACCOMPLISH plugin.")
                raise AccomplishError("No input provided to ACCOMPLISH plugin", "input_error")

            # Parse inputs
            inputs = parse_inputs(inputs_str)
            logger.info(f"Parsed and validated inputs: {json.dumps(inputs, indent=2)}")

            # Check for duplicate inputs
            input_hash = hashlib.md5(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
            if input_hash in self.seen_hashes:
                progress.checkpoint("duplicate_input_detected")
                logger.warning(f"Duplicate input detected (hash: {input_hash}). Skipping execution.")
                return json.dumps([{
                    "success": False,
                    "name": "duplicate_input",
                    "resultType": "system_error",
                    "resultDescription": "Duplicate input detected. This request has already been processed.",
                    "result": "Duplicate input detected",
                    "mimeType": "text/plain"
                }])

            self.seen_hashes.add(input_hash)
            progress.checkpoint("input_processed")

            # Setup temp directory
            self.temp_dir = tempfile.mkdtemp(prefix="accomplish_")
            os.environ["ACCOMPLISH_TEMP_DIR"] = self.temp_dir

            # Determine action type and execute
            if 'novel_actionVerb' in inputs:
                progress.checkpoint("novel_verb_selected")
                logger.info("Novel actionVerb detected. Routing to NovelVerbHandler.")
                result = self.novel_verb_handler.handle(inputs, None)  # No validator needed
            else:
                progress.checkpoint("goal_planning_selected")
                logger.info("Mission goal planning detected. Routing to MissionGoalPlanner.")
                result = self.goal_planner.plan(inputs)

            progress.checkpoint("execution_completed")
            logger.info(f"ACCOMPLISH plugin result: {result[:200]}...")
            return result

        except AccomplishError as e:
            progress.checkpoint("orchestrator_accomplish_error")
            logger.error(f"ACCOMPLISH error in orchestrator: {e}")
            return json.dumps([{
                "success": False,
                "name": e.error_type,
                "resultType": "system_error",
                "resultDescription": str(e),
                "result": str(e),
                "mimeType": "text/plain"
            }])
        except Exception as e:
            progress.checkpoint("orchestrator_unexpected_error")
            logger.error(f"Unexpected error in orchestrator: {e}")
            return json.dumps([{
                "success": False,
                "name": "execution_error",
                "resultType": "system_error",
                "resultDescription": f"Execution failed: {e}",
                "result": str(e),
                "mimeType": "text/plain"
            }])
        finally:
            # Cleanup temp directory
            if hasattr(self, 'temp_dir') and self.temp_dir and os.path.exists(self.temp_dir):
                try:
                    shutil.rmtree(self.temp_dir)
                    progress.checkpoint("temp_dir_cleaned")
                except Exception as cleanup_err:
                    logger.warning(f"Failed to clean up temp dir {self.temp_dir}: {cleanup_err}")

            # Log final progress summary
            logger.info(f"ACCOMPLISH execution completed. {progress.get_summary()}")

    def _is_novel_verb_request(self, inputs: Dict[str, Any]) -> bool:
        return 'novel_actionVerb' in inputs

# Main execution with enhanced logging
if __name__ == "__main__":
    try:
        logger.info("ACCOMPLISH plugin starting...")
        progress.checkpoint("main_start")

        orchestrator = AccomplishOrchestrator()
        progress.checkpoint("orchestrator_created")

        inputs_str = sys.stdin.read().strip()
        progress.checkpoint("input_read")
        logger.info(f"Input received: {len(inputs_str)} characters")

        result = orchestrator.execute(inputs_str)
        progress.checkpoint("execution_finished")

        logger.info(f"Final result: {result[:200]}...")
        print(result)
        progress.checkpoint("output_printed")

        logger.info(f"ACCOMPLISH plugin completed successfully. {progress.get_summary()}")

    except Exception as e:
        progress.checkpoint("main_error")
        logger.error(f"Fatal error in main: {e}")
        error_result = json.dumps([{
            "success": False,
            "name": "fatal_error",
            "resultType": "system_error",
            "resultDescription": f"Fatal error: {e}",
            "result": str(e),
            "mimeType": "text/plain"
        }])
        print(error_result)
        sys.exit(1)
