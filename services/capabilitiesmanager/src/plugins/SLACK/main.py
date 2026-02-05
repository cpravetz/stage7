#!/usr/bin/env python3
"""
SLACK Plugin - Slack integration for team communication and messaging
"""

import sys
import json
import logging
import os
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {{'value':...}} wrapper."""
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

def send_message(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Send a message to a Slack channel."""
    import requests

    token = os.getenv('SLACK_BOT_TOKEN')
    if not token:
        raise ValueError("SLACK_BOT_TOKEN environment variable not set")

    channel = payload.get('channel')
    text = payload.get('text') or payload.get('message')
    thread_ts = payload.get('thread_ts')

    if not channel or not text:
        raise ValueError("Missing required parameters: channel and text")

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    data = {
        'channel': channel,
        'text': text
    }

    if thread_ts:
        data['thread_ts'] = thread_ts

    response = requests.post('https://slack.com/api/chat.postMessage',
                            headers=headers, json=data)
    result = response.json()

    if not result.get('ok'):
        raise Exception(f"Slack API error: {result.get('error', 'Unknown error')}")

    return {
        'channel': result.get('channel'),
        'timestamp': result.get('ts'),
        'message': result.get('message', {}).get('text')
    }

def list_channels(payload: Dict[str, Any]) -> Dict[str, Any]:
    """List all channels in the workspace."""
    import requests

    token = os.getenv('SLACK_BOT_TOKEN')
    if not token:
        raise ValueError("SLACK_BOT_TOKEN environment variable not set")

    headers = {
        'Authorization': f'Bearer {token}'
    }

    params = {
        'exclude_archived': payload.get('exclude_archived', True),
        'limit': payload.get('limit', 100)
    }

    response = requests.get('https://slack.com/api/conversations.list',
                           headers=headers, params=params)
    result = response.json()

    if not result.get('ok'):
        raise Exception(f"Slack API error: {result.get('error', 'Unknown error')}")

    channels = [{
        'id': ch.get('id'),
        'name': ch.get('name'),
        'is_private': ch.get('is_private'),
        'num_members': ch.get('num_members')
    } for ch in result.get('channels', [])]

    return {'channels': channels, 'count': len(channels)}

def create_channel(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new Slack channel."""
    import requests

    token = os.getenv('SLACK_BOT_TOKEN')
    if not token:
        raise ValueError("SLACK_BOT_TOKEN environment variable not set")

    name = payload.get('name')
    is_private = payload.get('is_private', False)

    if not name:
        raise ValueError("Missing required parameter: name")

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    data = {
        'name': name,
        'is_private': is_private
    }

    response = requests.post('https://slack.com/api/conversations.create',
                            headers=headers, json=data)
    result = response.json()

    if not result.get('ok'):
        raise Exception(f"Slack API error: {result.get('error', 'Unknown error')}")

    channel = result.get('channel', {})
    return {
        'id': channel.get('id'),
        'name': channel.get('name'),
        'is_private': channel.get('is_private')
    }

def get_channel_history(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get message history from a channel."""
    import requests

    token = os.getenv('SLACK_BOT_TOKEN')
    if not token:
        raise ValueError("SLACK_BOT_TOKEN environment variable not set")

    channel = payload.get('channel')
    limit = payload.get('limit', 100)

    if not channel:
        raise ValueError("Missing required parameter: channel")

    headers = {
        'Authorization': f'Bearer {token}'
    }

    params = {
        'channel': channel,
        'limit': limit
    }

    response = requests.get('https://slack.com/api/conversations.history',
                           headers=headers, params=params)
    result = response.json()

    if not result.get('ok'):
        raise Exception(f"Slack API error: {result.get('error', 'Unknown error')}")

    messages = [{
        'user': msg.get('user'),
        'text': msg.get('text'),
        'timestamp': msg.get('ts'),
        'type': msg.get('type')
    } for msg in result.get('messages', [])]

    return {'messages': messages, 'count': len(messages)}

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
                "error": "Missing required parameter 'action'"
            }]

        logger.info(f"Executing action: {action} with payload: {payload}")

        # Route to appropriate handler
        handlers = {
            'sendMessage': send_message,
            'listChannels': list_channels,
            'createChannel': create_channel,
            'getChannelHistory': get_channel_history
        }

        handler = handlers.get(action)
        if not handler:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}. Available actions: {', '.join(handlers.keys())}"
            }]

        result = handler(payload)

        return [{
            "success": True,
            "name": "result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {{}}

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
        logger.error(f"Failed to parse input JSON: {{e}}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }}]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }}]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
