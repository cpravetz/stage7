#!/usr/bin/env python3
"""
CASE_MANAGEMENT Plugin - Legal case tracking and document management
Manages case creation, document storage, timeline tracking, milestones, and status reporting
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# In-memory case database
CASES_DATABASE = {}

# Case status definitions
CASE_STATUSES = ['open', 'active', 'on_hold', 'closed', 'settled', 'dismissed']

# Milestone templates
MILESTONE_TEMPLATES = {
    'civil': [
        'Complaint filed',
        'Answer filed',
        'Discovery initiated',
        'Motion practice',
        'Trial date set',
        'Settlement conference',
        'Trial preparation',
        'Trial',
        'Judgment'
    ],
    'criminal': [
        'Arrest',
        'Initial appearance',
        'Arraignment',
        'Discovery',
        'Plea negotiations',
        'Motion hearings',
        'Trial preparation',
        'Trial',
        'Sentencing'
    ],
    'corporate': [
        'Contract review',
        'Negotiation initiated',
        'Draft agreement',
        'Internal review',
        'Signature',
        'Implementation',
        'Ongoing compliance'
    ]
}

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

def create_case(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new legal case."""
    try:
        case_name = _get_input(payload, 'case_name', ['name'])
        case_type = _get_input(payload, 'case_type', ['type'], default='civil')
        matter_description = _get_input(payload, 'matter_description', ['description'], default='')
        client_name = _get_input(payload, 'client_name', ['client'], default='')
        
        if not case_name:
            return {'success': False, 'error': 'Missing required parameter: case_name'}
        
        if not isinstance(case_name, str) or len(case_name) < 3:
            return {'success': False, 'error': 'Case name must be at least 3 characters'}
        
        if case_type not in MILESTONE_TEMPLATES:
            case_type = 'civil'
        
        case_id = str(uuid.uuid4())
        
        # Create case object
        case = {
            'case_id': case_id,
            'case_name': case_name,
            'case_type': case_type,
            'status': 'open',
            'matter_description': matter_description,
            'client_name': client_name,
            'created_date': datetime.now().isoformat(),
            'documents': [],
            'milestones': [],
            'stakeholders': [],
            'timeline_events': [],
            'notes': []
        }
        
        # Initialize milestones based on case type
        for i, milestone in enumerate(MILESTONE_TEMPLATES.get(case_type, [])):
            case['milestones'].append({
                'id': str(uuid.uuid4()),
                'name': milestone,
                'status': 'pending',
                'due_date': None,
                'completed_date': None,
                'order': i + 1
            })
        
        # Store in database
        CASES_DATABASE[case_id] = case
        
        logger.info(f"Case created: {case_id} - {case_name}")
        
        return {
            'success': True,
            'case_id': case_id,
            'case_name': case_name,
            'case_type': case_type,
            'status': 'open',
            'created_date': case['created_date'],
            'milestones_initialized': len(case['milestones'])
        }
    except Exception as e:
        logger.error(f"Error in create_case: {str(e)}")
        return {'success': False, 'error': f'Case creation error: {str(e)}'}

def add_document(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add document to case."""
    try:
        case_id = _get_input(payload, 'case_id', ['id'])
        document_name = _get_input(payload, 'document_name', ['name'])
        document_type = _get_input(payload, 'document_type', ['type'], default='general')
        content_summary = _get_input(payload, 'content_summary', ['summary'], default='')
        
        if not case_id:
            return {'success': False, 'error': 'Missing required parameter: case_id'}
        if not document_name:
            return {'success': False, 'error': 'Missing required parameter: document_name'}
        
        # Check if case exists
        if case_id not in CASES_DATABASE:
            return {'success': False, 'error': f'Case not found: {case_id}'}
        
        doc_id = str(uuid.uuid4())
        document = {
            'doc_id': doc_id,
            'document_name': document_name,
            'document_type': document_type,
            'content_summary': content_summary,
            'uploaded_date': datetime.now().isoformat(),
            'file_size': 'unknown'
        }
        
        CASES_DATABASE[case_id]['documents'].append(document)
        
        logger.info(f"Document added to case {case_id}: {document_name}")
        
        return {
            'success': True,
            'case_id': case_id,
            'doc_id': doc_id,
            'document_name': document_name,
            'document_type': document_type,
            'uploaded_date': document['uploaded_date'],
            'total_documents': len(CASES_DATABASE[case_id]['documents'])
        }
    except Exception as e:
        logger.error(f"Error in add_document: {str(e)}")
        return {'success': False, 'error': f'Document addition error: {str(e)}'}

def track_milestone(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Track milestone progress."""
    try:
        case_id = _get_input(payload, 'case_id', ['id'])
        milestone_id = _get_input(payload, 'milestone_id', ['milestone'])
        milestone_status = _get_input(payload, 'milestone_status', ['status'], default='pending')
        completion_date = _get_input(payload, 'completion_date', default=None)
        
        if not case_id:
            return {'success': False, 'error': 'Missing required parameter: case_id'}
        if not milestone_id:
            return {'success': False, 'error': 'Missing required parameter: milestone_id'}
        
        # Check if case exists
        if case_id not in CASES_DATABASE:
            return {'success': False, 'error': f'Case not found: {case_id}'}
        
        # Find and update milestone
        case = CASES_DATABASE[case_id]
        milestone_found = False
        
        for milestone in case['milestones']:
            if milestone['id'] == milestone_id:
                milestone['status'] = milestone_status
                if milestone_status == 'completed' and not completion_date:
                    milestone['completed_date'] = datetime.now().isoformat()
                elif completion_date:
                    milestone['completed_date'] = completion_date
                milestone_found = True
                break
        
        if not milestone_found:
            return {'success': False, 'error': f'Milestone not found: {milestone_id}'}
        
        # Update case timeline
        case['timeline_events'].append({
            'event_id': str(uuid.uuid4()),
            'event_type': 'milestone_update',
            'description': f'Milestone status updated to {milestone_status}',
            'timestamp': datetime.now().isoformat()
        })
        
        return {
            'success': True,
            'case_id': case_id,
            'milestone_id': milestone_id,
            'status': milestone_status,
            'completion_date': completion_date or datetime.now().isoformat(),
            'total_milestones': len(case['milestones'])
        }
    except Exception as e:
        logger.error(f"Error in track_milestone: {str(e)}")
        return {'success': False, 'error': f'Milestone tracking error: {str(e)}'}

def update_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Update case status."""
    try:
        case_id = _get_input(payload, 'case_id', ['id'])
        new_status = _get_input(payload, 'new_status', ['status'])
        status_notes = _get_input(payload, 'status_notes', ['notes'], default='')
        
        if not case_id:
            return {'success': False, 'error': 'Missing required parameter: case_id'}
        if not new_status:
            return {'success': False, 'error': 'Missing required parameter: new_status'}
        
        # Check if case exists
        if case_id not in CASES_DATABASE:
            return {'success': False, 'error': f'Case not found: {case_id}'}
        
        # Validate status
        if new_status not in CASE_STATUSES:
            return {'success': False, 'error': f'Invalid status. Must be one of: {", ".join(CASE_STATUSES)}'}
        
        case = CASES_DATABASE[case_id]
        old_status = case['status']
        case['status'] = new_status
        
        # Record status change in timeline
        case['timeline_events'].append({
            'event_id': str(uuid.uuid4()),
            'event_type': 'status_change',
            'description': f'Case status changed from {old_status} to {new_status}',
            'notes': status_notes,
            'timestamp': datetime.now().isoformat()
        })
        
        return {
            'success': True,
            'case_id': case_id,
            'old_status': old_status,
            'new_status': new_status,
            'updated_date': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in update_status: {str(e)}")
        return {'success': False, 'error': f'Status update error: {str(e)}'}

def get_timeline(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get case timeline."""
    try:
        case_id = _get_input(payload, 'case_id', ['id'])
        
        if not case_id:
            return {'success': False, 'error': 'Missing required parameter: case_id'}
        
        # Check if case exists
        if case_id not in CASES_DATABASE:
            return {'success': False, 'error': f'Case not found: {case_id}'}
        
        case = CASES_DATABASE[case_id]
        
        # Compile timeline
        timeline_events = []
        
        # Add creation event
        timeline_events.append({
            'event_type': 'case_created',
            'description': f'Case created: {case["case_name"]}',
            'timestamp': case['created_date']
        })
        
        # Add recorded events
        timeline_events.extend(case['timeline_events'])
        
        # Add milestone events
        for milestone in case['milestones']:
            if milestone['completed_date']:
                timeline_events.append({
                    'event_type': 'milestone_completed',
                    'description': f'Milestone completed: {milestone["name"]}',
                    'timestamp': milestone['completed_date']
                })
        
        # Sort by timestamp
        timeline_events.sort(key=lambda x: x['timestamp'])
        
        return {
            'success': True,
            'case_id': case_id,
            'case_name': case['case_name'],
            'events_count': len(timeline_events),
            'timeline': timeline_events
        }
    except Exception as e:
        logger.error(f"Error in get_timeline: {str(e)}")
        return {'success': False, 'error': f'Timeline retrieval error: {str(e)}'}

def generate_status_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate case status report."""
    try:
        case_id = _get_input(payload, 'case_id', ['id'])
        include_documents = _get_input(payload, 'include_documents', default=True)
        include_milestones = _get_input(payload, 'include_milestones', default=True)
        
        if not case_id:
            return {'success': False, 'error': 'Missing required parameter: case_id'}
        
        # Check if case exists
        if case_id not in CASES_DATABASE:
            return {'success': False, 'error': f'Case not found: {case_id}'}
        
        case = CASES_DATABASE[case_id]
        
        # Calculate milestone progress
        completed_milestones = sum(1 for m in case['milestones'] if m['status'] == 'completed')
        total_milestones = len(case['milestones'])
        progress_percentage = round((completed_milestones / max(total_milestones, 1)) * 100, 1)
        
        # Build report
        report = {
            'report_id': str(uuid.uuid4()),
            'generated_date': datetime.now().isoformat(),
            'case_id': case_id,
            'case_name': case['case_name'],
            'case_type': case['case_type'],
            'current_status': case['status'],
            'client_name': case['client_name'],
            'matter_description': case['matter_description'],
            'statistics': {
                'documents_count': len(case['documents']),
                'milestones_completed': completed_milestones,
                'milestones_total': total_milestones,
                'progress_percentage': progress_percentage,
                'timeline_events': len(case['timeline_events'])
            }
        }
        
        if include_documents:
            report['documents'] = case['documents'][:10]
        
        if include_milestones:
            report['milestones'] = case['milestones']
        
        return {
            'success': True,
            'report': report
        }
    except Exception as e:
        logger.error(f"Error in generate_status_report: {str(e)}")
        return {'success': False, 'error': f'Report generation error: {str(e)}'}

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

        # Action handlers
        if action == 'create_case':
            result = create_case(payload)
        elif action == 'add_document':
            result = add_document(payload)
        elif action == 'track_milestone':
            result = track_milestone(payload)
        elif action == 'update_status':
            result = update_status(payload)
        elif action == 'get_timeline':
            result = get_timeline(payload)
        elif action == 'generate_status_report':
            result = generate_status_report(payload)
        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        logger.info(f"Action {action} executed successfully")
        return [{
            "success": result.get('success', True),
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
