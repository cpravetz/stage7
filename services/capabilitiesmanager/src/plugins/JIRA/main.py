#!/usr/bin/env python3
"""
JIRA Plugin - Interact with Jira for issue and project management.
"""

import sys
import json
import requests
import logging
import os
from typing import Dict, Any, List

# Set up logging
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

def get_jira_config():
    """Get Jira configuration from environment variables."""
    jira_url = os.getenv('JIRA_URL')
    jira_email = os.getenv('JIRA_EMAIL')
    jira_token = os.getenv('JIRA_API_TOKEN')
    
    if not all([jira_url, jira_email, jira_token]):
        raise ValueError("Missing Jira configuration. Ensure JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN are set.")
    
    return {
        'url': jira_url.rstrip('/'),
        'email': jira_email,
        'token': jira_token
    }

def make_jira_request(config: Dict[str, str], method: str, endpoint: str, data: Dict = None) -> Dict[str, Any]:
    """Make a request to the Jira API."""
    url = f"{config['url']}/rest/api/3/{endpoint.lstrip('/')}"
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

def create_issue(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new Jira issue."""
    fields = {
        'project': {'key': payload.get('project')},
        'summary': payload.get('summary'),
        'description': {
            'type': 'doc',
            'version': 1,
            'content': [{
                'type': 'paragraph',
                'content': [{'type': 'text', 'text': payload.get('description', '')}]
            }]
        },
        'issuetype': {'name': payload.get('issueType', 'Task')}
    }
    
    # Add optional fields
    if payload.get('assignee'):
        fields['assignee'] = {'id': payload['assignee']}
    if payload.get('priority'):
        fields['priority'] = {'name': payload['priority']}
    if payload.get('labels'):
        fields['labels'] = payload['labels']
    
    result = make_jira_request(config, 'POST', 'issue', {'fields': fields})
    return result

def update_issue(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing Jira issue."""
    issue_key = payload.get('issueKey')
    fields = payload.get('fields', {})
    
    result = make_jira_request(config, 'PUT', f'issue/{issue_key}', {'fields': fields})
    return {'success': True, 'issueKey': issue_key}

def search_issues(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Search for Jira issues using JQL."""
    jql = payload.get('jql', '')
    max_results = payload.get('maxResults', 50)
    start_at = payload.get('startAt', 0)
    
    data = {
        'jql': jql,
        'maxResults': max_results,
        'startAt': start_at,
        'fields': payload.get('fields', ['summary', 'status', 'assignee', 'created', 'updated'])
    }
    
    result = make_jira_request(config, 'POST', 'search', data)
    return result

def get_issue_details(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get details of a specific Jira issue."""
    issue_key = payload.get('issueKey')
    result = make_jira_request(config, 'GET', f'issue/{issue_key}')
    return result

def add_comment(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add a comment to a Jira issue."""
    issue_key = payload.get('issueKey')
    comment_text = payload.get('comment')
    
    data = {
        'body': {
            'type': 'doc',
            'version': 1,
            'content': [{
                'type': 'paragraph',
                'content': [{'type': 'text', 'text': comment_text}]
            }]
        }
    }
    
    result = make_jira_request(config, 'POST', f'issue/{issue_key}/comment', data)
    return result

def transition_issue(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Transition a Jira issue to a new status."""
    issue_key = payload.get('issueKey')
    transition_id = payload.get('transitionId')

    data = {'transition': {'id': transition_id}}
    result = make_jira_request(config, 'POST', f'issue/{issue_key}/transitions', data)
    return {'success': True, 'issueKey': issue_key, 'transitionId': transition_id}

def get_projects(config: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get list of Jira projects."""
    result = make_jira_request(config, 'GET', 'project')
    return {'projects': result}

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

        config = get_jira_config()

        # Route to appropriate action handler
        action_handlers = {
            'createIssue': create_issue,
            'updateIssue': update_issue,
            'searchIssues': search_issues,
            'getIssueDetails': get_issue_details,
            'addComment': add_comment,
            'transitionIssue': transition_issue,
            'getProjects': get_projects
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
            "name": "jira_result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of Jira {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"Unexpected error during Jira operation",
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

