#!/usr/bin/env python3
"""
QUERY_KNOWLEDGE_BASE Plugin for Stage7

This plugin queries knowledge base collections via the Librarian service using semantic search.
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

def query_knowledge_base(query_text: str, domains: List[str], max_results: int = 5, inputs: Dict[str, Any] = {}) -> tuple[List[Dict], Dict]:
    """
    Query knowledge base collections via the Librarian service.
    
    Args:
        query_text: The search query
        domains: List of domain/collection names to search
        max_results: Maximum number of results per domain
        inputs: The plugin inputs, containing the auth token.
        
    Returns:
        Tuple of (results_list, summary_dict)
    """
    try:
        auth_token = get_auth_token(inputs)
        headers = {'Authorization': f'Bearer {auth_token}'}
        librarian_url = 'http://' + get_librarian_url()
        all_results = []
        search_summary = {
            "query": query_text,
            "domains_searched": [],
            "total_results": 0,
            "domains_with_results": [],
            "domains_with_errors": []
        }
        
        for domain in domains:
            try:
                # Prepare the request payload
                payload = {
                    "collectionName": domain,
                    "queryText": query_text,
                    "maxResults": max_results
                }
                
                # Make the request to the Librarian service
                response = requests.post(
                    f"{librarian_url}/knowledge/query",
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                
                search_summary["domains_searched"].append(domain)
                
                if response.status_code == 200:
                    result_data = response.json()
                    domain_results = result_data.get('data', [])
                    
                    # Add domain information to each result
                    for result in domain_results:
                        result['domain'] = domain
                        all_results.append(result)
                    
                    if domain_results:
                        search_summary["domains_with_results"].append(domain)
                        search_summary["total_results"] += len(domain_results)
                        
                    logger.info(f"Found {len(domain_results)} results in domain '{domain}'")
                    
                else:
                    error_msg = f"Error querying domain '{domain}': Status {response.status_code}"
                    search_summary["domains_with_errors"].append({
                        "domain": domain,
                        "error": error_msg
                    })
                    logger.warning(error_msg)
                    
            except requests.exceptions.Timeout:
                error_msg = f"Timeout querying domain '{domain}'"
                search_summary["domains_with_errors"].append({
                    "domain": domain,
                    "error": error_msg
                })
                logger.warning(error_msg)
                
            except requests.exceptions.ConnectionError:
                error_msg = f"Connection error querying domain '{domain}'"
                search_summary["domains_with_errors"].append({
                    "domain": domain,
                    "error": error_msg
                })
                logger.warning(error_msg)
                
            except Exception as e:
                error_msg = f"Unexpected error querying domain '{domain}': {str(e)}"
                search_summary["domains_with_errors"].append({
                    "domain": domain,
                    "error": error_msg
                })
                logger.error(error_msg, exc_info=True)
        
        # Sort results by relevance (distance - lower is better)
        all_results.sort(key=lambda x: x.get('distance', float('inf')))
        
        return all_results, search_summary

    except Exception as e:
        raise e

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
            try:
                # Attempt to convert list of lists to dict
                inputs = {item[0]: item[1] for item in inputs}
            except (TypeError, IndexError):
                return [PluginOutput(
                    success=False,
                    name="error",
                    result_type="string",
                    result=None,
                    result_description="Invalid inputs: list must be a list of key-value pairs",
                    error="Invalid list format for inputs"
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
        query_text_input = inputs.get('queryText')
        if isinstance(query_text_input, dict) and 'value' in query_text_input:
            query_text = query_text_input['value']
        else:
            query_text = query_text_input

        domains_input = inputs.get('domains', [])
        if isinstance(domains_input, dict) and 'value' in domains_input:
            domains = domains_input['value']
        else:
            domains = domains_input

        max_results_input = inputs.get('maxResults', 5)
        if isinstance(max_results_input, dict) and 'value' in max_results_input:
            max_results = max_results_input['value']
        else:
            max_results = max_results_input
        
        # Validate required inputs
        if not query_text:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="string",
                result=None,
                result_description="Missing required input: queryText",
                error="Query text is required"
            ).to_dict()]
        
        if not domains:
            domains = ["knowledge-base"]
        
        # Ensure domains is a list
        if not isinstance(domains, list):
            if isinstance(domains, str):
                domains = [domains]
            else:
                return [PluginOutput(
                    success=False,
                    name="error",
                    result_type="string",
                    result=None,
                    result_description="Invalid domains input: must be a list or string",
                    error="Domains must be a list or string"
                ).to_dict()]
        
        # Query knowledge base
        results, summary = query_knowledge_base(query_text, domains, max_results, inputs)
        
        # Return results
        outputs = []
        
        # Results output
        outputs.append(PluginOutput(
            success=True,
            name="results",
            result_type="array",
            result=results,
            result_description=f"Found {len(results)} results across {len(summary['domains_with_results'])} domains"
        ).to_dict())
        
        # Summary output
        outputs.append(PluginOutput(
            success=True,
            name="summary",
            result_type="object",
            result=summary,
            result_description=f"Search summary for query '{query_text}'"
        ).to_dict())
        
        return outputs
        
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
        inputs = json.loads(input_str)
    except json.JSONDecodeError:
        # If a raw string is passed, wrap it in a structure that can be parsed
        inputs = {"queryText": input_str.strip()}
    
    result = execute_plugin(inputs)
    print(json.dumps(result, indent=2))