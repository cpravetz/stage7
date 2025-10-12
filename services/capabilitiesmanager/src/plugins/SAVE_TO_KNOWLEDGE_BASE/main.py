#!/usr/bin/env python3
"""
SAVE_TO_KNOWLEDGE_BASE Plugin for Stage7

This plugin saves content to a knowledge base collection via the Librarian service.
"""

import sys
import json
import os
import requests
from typing import Dict, List, Any, Optional
import logging

def get_auth_token(inputs: Dict[str, Any]) -> str:
    """Get authentication token from inputs"""
    # Try CapabilitiesManager token first (for calling Librarian)
    if '__auth_token' in inputs:
        token_data = inputs['__auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    # Fallback to Brain token if available
    if '__brain_auth_token' in inputs:
        token_data = inputs['__brain_auth_token']
        if isinstance(token_data, dict) and 'value' in token_data:
            return token_data['value']
        elif isinstance(token_data, str):
            return token_data
    raise ValueError("No authentication token found in inputs")

# Configure logging
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PluginOutput:
    """Represents a plugin output result."""
    def __init__(self, success: bool, name: str, result_type: str,
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        output = {
            "success": self.success,
            "name": self.name,
            "resultType": self.result_type,
            "result": self.result,
            "resultDescription": self.result_description
        }
        if self.error:
            output["error"] = self.error
        return output

def get_librarian_url() -> str:
    """Get the Librarian service URL from environment or use default."""
    return os.environ.get('LIBRARIAN_URL', 'librarian:5040')

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
        raise

def save_to_knowledge_base(domain: str, keywords: List[str], content: str, metadata: Optional[Dict] = None, inputs: Dict[str, Any] = {}) -> PluginOutput:
    """
    Save content to the knowledge base via the Librarian service.
    
    Args:
        domain: The knowledge domain/collection name
        keywords: List of keywords for categorization
        content: The content to save
        metadata: Optional additional metadata
        inputs: The plugin inputs, containing the auth token.
        
    Returns:
        PluginOutput with the result of the save operation
    """
    try:
        auth_token = get_auth_token(inputs)
        headers = {'Authorization': f'Bearer {auth_token}'}
        librarian_url = 'http://' + get_librarian_url()
        
        # Prepare the request payload for Librarian /storeData
        payload = {
            "id": f"kb-{domain}-{hash(content)}",  # Unique ID
            "data": {
                "content": content,
                "metadata": {
                    "keywords": keywords,
                    **(metadata or {})
                }
            },
            "storageType": "mongo",
            "collection": "knowledge-base"
        }

        # Make the request to the Librarian service
        response = requests.post(
            f"{librarian_url}/storeData",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            result_data = response.json()
            return PluginOutput(
                success=True,
                name="status",
                result_type="string",
                result="Content saved successfully to knowledge base",
                result_description=f"Successfully saved content to domain '{domain}' with keywords: {', '.join(keywords)}"
            )
        else:
            error_msg = f"Failed to save to knowledge base. Status: {response.status_code}"
            try:
                error_detail = response.json().get('error', 'Unknown error')
                error_msg += f". Error: {error_detail}"
            except:
                error_msg += f". Response: {response.text}"
            
            return PluginOutput(
                success=False,
                name="error",
                result_type="string",
                result=None,
                result_description=error_msg,
                error=error_msg
            )
            
    except requests.exceptions.Timeout:
        error_msg = "Request to Librarian service timed out"
        return PluginOutput(
            success=False,
            name="error",
            result_type="string",
            result=None,
            result_description=error_msg,
            error=error_msg
        )
    except requests.exceptions.ConnectionError:
        error_msg = "Could not connect to Librarian service"
        return PluginOutput(
            success=False,
            name="error",
            result_type="string",
            result=None,
            result_description=error_msg,
            error=error_msg
        )
    except Exception as e:
        error_msg = f"Unexpected error saving to knowledge base: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return PluginOutput(
            success=False,
            name="error",
            result_type="string",
            result=None,
            result_description=error_msg,
            error=error_msg
        )

def execute_plugin(inputs: Any) -> List[Dict[str, Any]]:
    """
    Main plugin execution function.

    Args:
        inputs: Dictionary or list containing the plugin inputs

    Returns:
        List of plugin outputs as dictionaries
    """
    try:
        # Handle flexible input types
        if isinstance(inputs, list):
            if len(inputs) == 1 and isinstance(inputs[0], dict):
                inputs = inputs[0]
            else:
                return [PluginOutput(
                    success=False,
                    name="error",
                    result_type="string",
                    result=None,
                    result_description="Invalid inputs: list must contain exactly one dictionary",
                    error="Inputs list must contain exactly one dictionary"
                ).to_dict()]
        elif not isinstance(inputs, dict):
            return [PluginOutput(
                success=False,
                name="error",
                result_type="string",
                result=None,
                result_description="Invalid inputs: must be a dictionary or list with one dictionary",
                error="Inputs must be a dictionary or list with one dictionary"
            ).to_dict()]

        # Extract required inputs
        domain_input = inputs.get('domain')
        if isinstance(domain_input, dict) and 'value' in domain_input:
            domain = domain_input['value']
        else:
            domain = domain_input

        keywords_input = inputs.get('keywords', [])
        if isinstance(keywords_input, dict) and 'value' in keywords_input:
            keywords = keywords_input['value']
        else:
            keywords = keywords_input

        content_input = inputs.get('content')
        if isinstance(content_input, dict) and 'value' in content_input:
            content = content_input['value']
        else:
            content = content_input

        metadata_input = inputs.get('metadata', {})
        if isinstance(metadata_input, dict) and 'value' in metadata_input:
            metadata = metadata_input['value']
        else:
            metadata = metadata_input
        
        # Validate required inputs
        if not domain:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="string",
                result=None,
                result_description="Missing required input: domain",
                error="Domain is required"
            ).to_dict()]
        
        if not content:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="string",
                result=None,
                result_description="Missing required input: content",
                error="Content is required"
            ).to_dict()]
        
        # Ensure keywords is a list
        if not isinstance(keywords, list):
            if isinstance(keywords, str):
                keywords = [keywords]
            else:
                keywords = []
        
        # Save to knowledge base
        result = save_to_knowledge_base(domain, keywords, content, metadata, inputs)
        return [result.to_dict()]
        
    except Exception as e:
        error_msg = f"Plugin execution failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return [PluginOutput(
            success=False,
            name="error",
            result_type="string",
            result=None,
            result_description=error_msg,
            error=error_msg
        ).to_dict()]

if __name__ == "__main__":
    input_str = sys.stdin.read()
    try:
        inputs = parse_inputs(input_str)
    except json.JSONDecodeError:
        # If a raw string is passed, wrap it in a structure that can be parsed
        inputs = {"content": {"value": input_str.strip()}, "domain": {"value": "default"}}

    result = execute_plugin(inputs)
    print(json.dumps(result, indent=2))
