#!/usr/bin/env python3
"""
ACCOMPLISH Plugin - Streamlined Version
Handles mission planning and novel action verbs with LLM-driven approach
"""

import json
import logging
import time
import requests
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
    """Call Brain service with proper authentication"""
    progress.checkpoint("brain_call_start")
    
    try:
        auth_token = get_auth_token(inputs)
        brain_url = inputs.get('brain_url', {}).get('value', 'brain:5070')
        
        if response_type == 'json':
            system_message = (
                "You are a planning assistant. Generate actionable plans as JSON arrays. "
                "Each step must have: number, actionVerb, description, inputs, outputs, dependencies."
            )
        else:
            system_message = "You are a planning assistant."

        payload = {
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {auth_token}'
        }

        logger.info(f"Calling Brain at: http://{brain_url}/chat")
        response = requests.post(
            f"http://{brain_url}/chat",
            json=payload,
            headers=headers,
            timeout=300
        )

        if response.status_code != 200:
            raise AccomplishError(f"Brain API error: {response.status_code} - {response.text}", "brain_api_error")

        result = response.json()
        if 'content' not in result:
            raise AccomplishError("Brain response missing content", "brain_response_error")

        progress.checkpoint("brain_call_success")
        return result['content']

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
        "number": {"type": "integer"},
        "actionVerb": {"type": "string"},
        "description": {"type": "string"},
        "inputs": {
            "type": "object",
            "patternProperties": {
                ".*": {
                    "type": "object",
                    "properties": {
                        "value": {},
                        "outputName": {"type": "string"},
                        "valueType": {"type": "string"}
                    },
                    "required": ["valueType"],
                    "oneOf": [
                        {"required": ["value"]},
                        {"required": ["outputName"]}
                    ]
                }
            }
        },
        "outputs": {"type": "object"},
        "dependencies": {"type": "object"}
    },
    "required": ["number", "actionVerb", "description", "inputs", "outputs", "dependencies"]
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
        return json.dumps(plan, indent=2)
    
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
        prompt = f"""You are an expert strategic planner. Create a comprehensive, well-thought plan to accomplish this goal:

GOAL: {goal}

Write a detailed prose plan (3-5 paragraphs) that thoroughly explains:
- The strategic approach you would take
- The key phases or areas of work  
- The specific actions and research needed
- How the pieces fit together
- Why this approach will achieve the goal

Be specific, actionable, and comprehensive. Think deeply about THIS specific goal.

Return your prose plan:"""

        logger.info("🧠 Phase 1: Requesting prose plan from LLM...")
        response = call_brain(prompt, inputs, "text")
        
        if not response or len(response.strip()) < 100:
            raise AccomplishError("LLM returned insufficient prose plan", "prose_plan_error")
            
        logger.info(f"✅ Received prose plan ({len(response)} chars)")
        return response.strip()
    
    def _convert_to_structured_plan(self, prose_plan: str, goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Phase 2: Convert prose plan to structured JSON"""
        
        schema_json = json.dumps(PLAN_STEP_SCHEMA, indent=2)
        
        prompt = f"""Convert this prose plan into a JSON array that conforms to the schema:

ORIGINAL GOAL: {goal}

PROSE PLAN:
{prose_plan}

SCHEMA:
{schema_json}

REQUIREMENTS:
1. Each input must have either 'value' OR 'outputName' plus 'valueType'
2. Use goal-specific values (not "example" or "template")
3. Dependencies format: {{"outputName": stepNumber}}

Return ONLY the JSON array:"""

        logger.info("🔧 Phase 2: Converting to structured JSON...")
        response = call_brain(prompt, inputs, "json")
        
        try:
            plan = json.loads(response)
            if not isinstance(plan, list):
                raise ValueError("Response is not a JSON array")
            
            logger.info(f"✅ Converted to structured plan with {len(plan)} steps")
            return plan
            
        except json.JSONDecodeError as e:
            raise AccomplishError(f"Failed to parse structured plan JSON: {e}", "json_parse_error")
    
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
        
        for i, step in enumerate(plan):
            step_num = step.get('number', i + 1)
            
            # Check required fields
            required_fields = ['number', 'actionVerb', 'description', 'inputs', 'outputs', 'dependencies']
            for field in required_fields:
                if field not in step:
                    errors.append(f"Step {step_num}: Missing required field '{field}'")
            
            # Validate inputs structure
            if 'inputs' in step and isinstance(step['inputs'], dict):
                for input_name, input_def in step['inputs'].items():
                    if not isinstance(input_def, dict):
                        errors.append(f"Step {step_num}: Input '{input_name}' must be an object")
                        continue
                    
                    if 'valueType' not in input_def:
                        errors.append(f"Step {step_num}: Input '{input_name}' missing 'valueType'")
                    
                    has_value = 'value' in input_def
                    has_output_name = 'outputName' in input_def
                    
                    if not has_value and not has_output_name:
                        errors.append(f"Step {step_num}: Input '{input_name}' missing both 'value' and 'outputName'")
        
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
        response = call_brain(prompt, inputs, "json")
        
        try:
            repaired_plan = json.loads(response)
            if not isinstance(repaired_plan, list):
                raise ValueError("Repaired response is not a JSON array")
            
            logger.info(f"✅ LLM returned repaired plan with {len(repaired_plan)} steps")
            return repaired_plan
            
        except json.JSONDecodeError as e:
            raise AccomplishError(f"LLM repair produced invalid JSON: {e}", "repair_error")

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
        if 'novel_actionVerb' in inputs and isinstance(inputs['novel_actionVerb'], dict):
            novel_verb_data = inputs['novel_actionVerb']

            if 'value' in novel_verb_data and isinstance(novel_verb_data['value'], dict):
                # Structured format from CapabilitiesManager
                verb_info = novel_verb_data['value']
                return {
                    "id": verb_info.get('id', 'novel_plugin'),
                    "verb": verb_info.get('verb', 'NOVEL_VERB'),
                    "description": verb_info.get('description', ''),
                    "context": verb_info.get('context', ''),
                    "inputValues": verb_info.get('inputValues', {}),
                    "outputs": verb_info.get('outputs', {}),
                }
            else:
                # Legacy string format
                goal_text = novel_verb_data.get('value', '')
                return {
                    "id": "novel_plugin",
                    "verb": "NOVEL_VERB",
                    "description": goal_text,
                    "context": goal_text,
                    "inputValues": {},
                    "outputs": {}
                }

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

        prompt = f"""You are an expert system analyst. A user wants to use a novel action verb "{verb}" that is not currently supported.

VERB: {verb}
DESCRIPTION: {description}
CONTEXT: {context}

Determine the best approach:

1. **Direct Answer**: If this can be answered directly without a new plugin, provide the answer
2. **Plugin Recommendation**: If a new plugin should be developed, provide plugin specification

For a direct answer:
{{"direct_answer": {{"output_name": "output_value"}}}}

For a plugin recommendation:
{{"plugin": {{"id": "plugin_name", "description": "...", "actionVerb": "{verb}", "inputDefinitions": [], "outputDefinitions": []}}}}

Choose the most appropriate approach and respond:"""

        try:
            return call_brain(prompt, inputs, "json")
        except Exception as e:
            logger.error(f"Brain call failed for novel verb '{verb}': {e}")
            return f'{{"error": "Brain call failed: {str(e)}"}}'

    def _format_response(self, brain_response: str, verb_info: Dict[str, Any]) -> str:
        """Format the Brain response into the expected output format"""
        try:
            data = json.loads(brain_response)

            if "direct_answer" in data:
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
