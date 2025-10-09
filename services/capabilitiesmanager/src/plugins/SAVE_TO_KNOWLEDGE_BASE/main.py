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
        
        # Prepare the request payload
        payload = {
            "collectionName": domain,
            "content": content,
            "metadata": {
                "keywords": keywords,
                **(metadata or {})
            }
        }
        
        # Make the request to the Librarian service
        response = requests.post(
            f"{librarian_url}/knowledge/save",
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

def execute_plugin(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Main plugin execution function.
    
    Args:
        inputs: Dictionary containing the plugin inputs
        
    Returns:
        List of plugin outputs as dictionaries
    """
    try:
        # Extract required inputs
        domain = inputs.get('domain')
        keywords = inputs.get('keywords', [])
        content = inputs.get('content')
        metadata = inputs.get('metadata', {})
        
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
    # For testing purposes
    test_inputs = {
        "domain": "test_domain",
        "keywords": ["test", "example"],
        "content": "This is test content for the knowledge base."
    }
    
    result = execute_plugin(test_inputs)
    print(json.dumps(result, indent=2))