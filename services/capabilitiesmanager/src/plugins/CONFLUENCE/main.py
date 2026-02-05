#!/usr/bin/env python3
"""
CONFLUENCE Plugin - Interact with Confluence for documentation and knowledge management.
"""

import sys
import json
import requests
import logging
import os
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {'value':...} wrapper."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def get_confluence_config():
    """Get Confluence configuration from environment variables."""
    confluence_url = os.getenv('CONFLUENCE_URL')
    confluence_email = os.getenv('CONFLUENCE_EMAIL')
    confluence_token = os.getenv('CONFLUENCE_API_TOKEN')
    
    if not all([confluence_url, confluence_email, confluence_token]):
        raise ValueError("Missing Confluence configuration. Ensure CONFLUENCE_URL, CONFLUENCE_EMAIL, and CONFLUENCE_API_TOKEN are set.")
    
    return {
        'url': confluence_url.rstrip('/'),
        'email': confluence_email,
        'token': confluence_token
    }

def make_confluence_request(config: Dict[str, str], method: str, endpoint: str, data: Dict = None) -> Dict[str, Any]:
    """Make a request to the Confluence API."""
    url = f"{config['url']}/rest/api/{endpoint.lstrip('/')}"
    auth = (config['email'], config['token'])
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    response = requests.request(
        method=method.upper(),
        url=url,
        auth=auth,
        headers=headers,
        json=data,
        timeout=30
    )
    response.raise_for_status()
    
    if response.text:
        return response.json()
    return {}

def create_page(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new Confluence page."""
    data = {
        'type': 'page',
        'title': payload.get('title'),
        'space': {'key': payload.get('space')},
        'body': {
            'storage': {
                'value': payload.get('content', ''),
                'representation': 'storage'
            }
        }
    }
    
    if payload.get('parentId'):
        data['ancestors'] = [{'id': payload['parentId']}]
    
    result = make_confluence_request(config, 'POST', 'content', data)
    return result

def update_page(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing Confluence page."""
    page_id = payload.get('pageId')
    version = payload.get('version')
    
    data = {
        'version': {'number': version},
        'title': payload.get('title'),
        'type': 'page',
        'body': {
            'storage': {
                'value': payload.get('content', ''),
                'representation': 'storage'
            }
        }
    }
    
    result = make_confluence_request(config, 'PUT', f'content/{page_id}', data)
    return result

def search_content(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Search for Confluence content."""
    query = payload.get('query', '')
    limit = payload.get('limit', 25)
    
    params = f"?cql={requests.utils.quote(query)}&limit={limit}"
    result = make_confluence_request(config, 'GET', f'content/search{params}')
    return result

def get_page_details(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get details of a specific Confluence page."""
    page_id = payload.get('pageId')
    expand = payload.get('expand', 'body.storage,version,space')
    
    result = make_confluence_request(config, 'GET', f'content/{page_id}?expand={expand}')
    return result

def delete_page(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Delete a Confluence page."""
    page_id = payload.get('pageId')
    make_confluence_request(config, 'DELETE', f'content/{page_id}')
    return {'success': True, 'pageId': page_id, 'deleted': True}

def get_spaces(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get list of Confluence spaces."""
    limit = payload.get('limit', 25)
    result = make_confluence_request(config, 'GET', f'space?limit={limit}')
    return result

def add_attachment(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add an attachment to a Confluence page."""
    page_id = payload.get('pageId')
    # Note: File upload requires multipart/form-data, simplified here
    return {'success': False, 'error': 'Attachment upload not yet implemented'}

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "resultDescription": "The 'action' parameter is required",
                "mimeType": "text/plain",
                "error": "Missing required parameter 'action'"
            }]

        config = get_confluence_config()

        action_handlers = {
            'createPage': create_page,
            'updatePage': update_page,
            'searchContent': search_content,
            'getPageDetails': get_page_details,
            'deletePage': delete_page,
            'getSpaces': get_spaces,
            'addAttachment': add_attachment
        }

        handler = action_handlers.get(action)
        if not handler:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "resultDescription": f"Valid actions are: {', '.join(action_handlers.keys())}",
                "mimeType": "text/plain",
                "error": f"Unknown action: {action}"
            }]

        result = handler(config, payload)

        return [{
            "success": True,
            "name": "confluence_result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of Confluence {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"Unexpected error during Confluence operation",
            "mimeType": "text/plain",
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {}

        if isinstance(payload, dict):
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {e}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "resultDescription": "Plugin received no input data on stdin",
                "mimeType": "text/plain",
                "error": "No input data received"
            }]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": "Plugin execution failed",
            "mimeType": "text/plain",
            "error": str(e)
        }]
        print(json.dumps(result))

if __name__ == "__main__":
    main()

