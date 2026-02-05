#!/usr/bin/env python3
"""
DOC_PARSER Plugin - Document parsing and analysis
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

def parse_document(payload: dict) -> dict:
    """Parse a document and extract its content."""
    document_path = _get_input(payload, 'document_path', ['path', 'file_path'])
    document_content = _get_input(payload, 'content', ['document_content', 'text'])
    document_type = _get_input(payload, 'document_type', ['type', 'format'], default='auto')

    if not document_path and not document_content:
        raise ValueError("Either document_path or content must be provided")

    # If path is provided, read the file
    if document_path and not document_content:
        if os.path.exists(document_path):
            with open(document_path, 'r', encoding='utf-8') as f:
                document_content = f.read()
        else:
            raise FileNotFoundError(f"Document not found: {document_path}")

    # Auto-detect document type if not specified
    if document_type == 'auto' and document_path:
        ext = os.path.splitext(document_path)[1].lower()
        type_map = {
            '.md': 'markdown',
            '.txt': 'text',
            '.html': 'html',
            '.json': 'json',
            '.xml': 'xml',
            '.csv': 'csv'
        }
        document_type = type_map.get(ext, 'text')

    return {
        "content": document_content,
        "type": document_type,
        "path": document_path,
        "length": len(document_content) if document_content else 0,
        "lines": len(document_content.splitlines()) if document_content else 0
    }

def extract_metadata(payload: dict) -> dict:
    """Extract metadata from a document."""
    parsed_doc = parse_document(payload)
    content = parsed_doc['content']
    doc_type = parsed_doc['type']

    metadata = {
        "type": doc_type,
        "length": parsed_doc['length'],
        "lines": parsed_doc['lines'],
        "words": len(content.split()) if content else 0,
        "characters": len(content) if content else 0
    }

    # Extract type-specific metadata
    if doc_type == 'markdown':
        # Extract markdown headers
        headers = []
        for line in content.splitlines():
            if line.strip().startswith('#'):
                level = len(line) - len(line.lstrip('#'))
                text = line.lstrip('#').strip()
                headers.append({"level": level, "text": text})
        metadata['headers'] = headers
        metadata['header_count'] = len(headers)

    elif doc_type == 'json':
        try:
            json_data = json.loads(content)
            metadata['json_keys'] = list(json_data.keys()) if isinstance(json_data, dict) else []
            metadata['json_type'] = type(json_data).__name__
        except:
            pass

    return metadata

def analyze_structure(payload: dict) -> dict:
    """Analyze the structure of a document."""
    parsed_doc = parse_document(payload)
    content = parsed_doc['content']
    doc_type = parsed_doc['type']

    structure = {
        "type": doc_type,
        "sections": [],
        "hierarchy": []
    }

    if doc_type == 'markdown':
        # Analyze markdown structure
        current_section = None
        sections = []

        for line in content.splitlines():
            if line.strip().startswith('#'):
                level = len(line) - len(line.lstrip('#'))
                text = line.lstrip('#').strip()

                section = {
                    "level": level,
                    "title": text,
                    "line": len(sections) + 1
                }
                sections.append(section)

                if level == 1:
                    current_section = section

        structure['sections'] = sections
        structure['section_count'] = len(sections)

    elif doc_type == 'json':
        try:
            json_data = json.loads(content)
            structure['hierarchy'] = _analyze_json_structure(json_data)
        except:
            pass

    return structure

def _analyze_json_structure(data, path="root"):
    """Recursively analyze JSON structure."""
    if isinstance(data, dict):
        return {
            "path": path,
            "type": "object",
            "keys": list(data.keys()),
            "children": [_analyze_json_structure(v, f"{path}.{k}") for k, v in data.items()]
        }
    elif isinstance(data, list):
        return {
            "path": path,
            "type": "array",
            "length": len(data),
            "children": [_analyze_json_structure(item, f"{path}[{i}]") for i, item in enumerate(data[:3])]  # First 3 items
        }
    else:
        return {
            "path": path,
            "type": type(data).__name__,
            "value": str(data)[:100]  # First 100 chars
        }

def extract_sections(payload: dict) -> list:
    """Extract sections from a document."""
    parsed_doc = parse_document(payload)
    content = parsed_doc['content']
    doc_type = parsed_doc['type']

    sections = []

    if doc_type == 'markdown':
        current_section = {"level": 0, "title": "Document", "content": ""}

        for line in content.splitlines():
            if line.strip().startswith('#'):
                # Save previous section
                if current_section['content']:
                    sections.append(current_section)

                # Start new section
                level = len(line) - len(line.lstrip('#'))
                title = line.lstrip('#').strip()
                current_section = {"level": level, "title": title, "content": ""}
            else:
                current_section['content'] += line + "\n"

        # Add last section
        if current_section['content']:
            sections.append(current_section)

    else:
        # For other types, treat as single section
        sections.append({
            "level": 1,
            "title": "Content",
            "content": content
        })

    return sections

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

        # Route to appropriate action handler
        if action == 'parse_document':
            result_data = parse_document(payload)
        elif action == 'extract_metadata':
            result_data = extract_metadata(payload)
        elif action == 'analyze_structure':
            result_data = analyze_structure(payload)
        elif action == 'extract_sections':
            result_data = extract_sections(payload)
        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        return [{
            "success": True,
            "name": "result",
            "resultType": "object",
            "result": result_data,
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
            "error": str(e)
        }]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
