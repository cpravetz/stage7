#!/usr/bin/env python3
"""
COMPLIANCE Plugin - Regulatory compliance checking and reporting
Monitors compliance status, identifies gaps, generates remediation recommendations, and creates audit trails
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

# Compliance framework definitions
COMPLIANCE_FRAMEWORKS = {
    'GDPR': {
        'name': 'General Data Protection Regulation',
        'jurisdiction': 'EU',
        'category': 'Data Privacy',
        'requirements': [
            'Legal basis for processing',
            'Data protection impact assessments',
            'Privacy by design and default',
            'Data breach notification within 72 hours',
            'Right to access',
            'Right to be forgotten',
            'Data portability',
            'Consent management',
            'Data processing agreements',
            'Privacy policy published'
        ]
    },
    'CCPA': {
        'name': 'California Consumer Privacy Act',
        'jurisdiction': 'California',
        'category': 'Consumer Privacy',
        'requirements': [
            'Consumer privacy notice',
            'Right to know implementation',
            'Right to delete implementation',
            'Right to opt-out of sale',
            'Non-discrimination policy',
            'Service provider contracts',
            'Opt-in for minors',
            'Annual risk assessment',
            'Consumer request handling process',
            'Privacy policy maintained'
        ]
    },
    'HIPAA': {
        'name': 'Health Insurance Portability and Accountability Act',
        'jurisdiction': 'Federal',
        'category': 'Healthcare Privacy',
        'requirements': [
            'Privacy Rule compliance',
            'Security Rule compliance',
            'Breach notification plan',
            'Business associate agreements',
            'Access controls implemented',
            'Audit controls implemented',
            'Encryption implemented',
            'Workforce privacy training',
            'Security incident procedures',
            'Risk analysis documented'
        ]
    },
    'SOC2': {
        'name': 'Service Organization Control 2',
        'jurisdiction': 'Global',
        'category': 'Service Organization',
        'requirements': [
            'Security controls',
            'Availability controls',
            'Processing integrity controls',
            'Confidentiality controls',
            'Privacy controls',
            'Change management process',
            'Access control policies',
            'Risk assessment process',
            'Monitoring procedures',
            'Incident response plan'
        ]
    },
    'PCI-DSS': {
        'name': 'Payment Card Industry Data Security Standard',
        'jurisdiction': 'Global',
        'category': 'Payment Security',
        'requirements': [
            'Firewall configuration',
            'Default password change',
            'Data protection',
            'Vulnerability scanning',
            'Access control',
            'Vulnerability patches',
            'Secure configuration',
            'Cardholder data protection',
            'Access restriction',
            'Regular testing'
        ]
    }
}

# Audit log storage (in-memory simulation)
AUDIT_LOG = []

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

def _log_audit_event(action: str, framework: str, details: Dict[str, Any], status: str = 'success'):
    """Log compliance audit event."""
    event = {
        'id': str(uuid.uuid4()),
        'timestamp': datetime.now().isoformat(),
        'action': action,
        'framework': framework,
        'status': status,
        'details': details
    }
    AUDIT_LOG.append(event)
    logger.info(f"Audit logged: {action} for {framework}")
    return event

def check_compliance(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Check organization compliance against framework."""
    try:
        framework = _get_input(payload, 'framework', ['standard', 'compliance_framework'])
        assessment_data = _get_input(payload, 'assessment_data', ['compliance_data', 'data'], default={})
        
        if not framework:
            return {'success': False, 'error': 'Missing required parameter: framework'}
        
        framework_upper = framework.upper()
        if framework_upper not in COMPLIANCE_FRAMEWORKS:
            return {'success': False, 'error': f'Unknown framework: {framework}'}
        
        framework_info = COMPLIANCE_FRAMEWORKS[framework_upper]
        requirements = framework_info['requirements']
        
        # Assess compliance
        compliant_items = 0
        assessment_results = {}
        
        for requirement in requirements:
            # Check if requirement is mentioned in assessment data
            is_compliant = isinstance(assessment_data, dict) and (
                requirement.lower() in str(assessment_data).lower() or 
                any(assessment_data.get(req.replace(' ', '_').lower(), False) for req in [requirement])
            )
            assessment_results[requirement] = 'compliant' if is_compliant else 'non_compliant'
            if is_compliant:
                compliant_items += 1
        
        compliance_score = round((compliant_items / len(requirements)) * 100, 1)
        status = 'compliant' if compliance_score >= 90 else 'partial' if compliance_score >= 70 else 'non_compliant'
        
        # Log audit event
        _log_audit_event('check_compliance', framework_upper, {
            'compliance_score': compliance_score,
            'status': status
        })
        
        return {
            'success': True,
            'framework': framework,
            'framework_full_name': framework_info['name'],
            'jurisdiction': framework_info['jurisdiction'],
            'compliance_score': compliance_score,
            'items_compliant': compliant_items,
            'items_total': len(requirements),
            'status': status,
            'assessment_date': datetime.now().isoformat(),
            'requirement_status': assessment_results
        }
    except Exception as e:
        logger.error(f"Error in check_compliance: {str(e)}")
        return {'success': False, 'error': f'Compliance check error: {str(e)}'}

def identify_gaps(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Identify compliance gaps."""
    try:
        framework = _get_input(payload, 'framework', ['standard', 'compliance_framework'])
        current_status = _get_input(payload, 'current_status', ['status'], default={})
        
        if not framework:
            return {'success': False, 'error': 'Missing required parameter: framework'}
        
        framework_upper = framework.upper()
        if framework_upper not in COMPLIANCE_FRAMEWORKS:
            return {'success': False, 'error': f'Unknown framework: {framework}'}
        
        framework_info = COMPLIANCE_FRAMEWORKS[framework_upper]
        requirements = framework_info['requirements']
        
        # Identify gaps
        gaps = []
        for requirement in requirements:
            is_implemented = isinstance(current_status, dict) and (
                requirement.lower() in str(current_status).lower() or
                current_status.get(requirement.replace(' ', '_').lower(), False)
            )
            
            if not is_implemented:
                gaps.append({
                    'gap': requirement,
                    'category': framework_info['category'],
                    'severity': 'critical' if 'security' in requirement.lower() else 'high' if 'data' in requirement.lower() else 'medium',
                    'impact': f'Non-compliance with {requirement.lower()} requirement'
                })
        
        # Log audit event
        _log_audit_event('identify_gaps', framework_upper, {
            'gaps_found': len(gaps)
        })
        
        return {
            'success': True,
            'framework': framework,
            'gaps_found': len(gaps),
            'gaps': gaps,
            'gap_percentage': round((len(gaps) / len(requirements)) * 100, 1),
            'assessment_date': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in identify_gaps: {str(e)}")
        return {'success': False, 'error': f'Gap identification error: {str(e)}'}

def generate_recommendations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate remediation recommendations."""
    try:
        framework = _get_input(payload, 'framework', ['standard', 'compliance_framework'])
        gaps = _get_input(payload, 'gaps', ['identified_gaps', 'gap_list'], default=[])
        
        if not framework:
            return {'success': False, 'error': 'Missing required parameter: framework'}
        
        framework_upper = framework.upper()
        if framework_upper not in COMPLIANCE_FRAMEWORKS:
            return {'success': False, 'error': f'Unknown framework: {framework}'}
        
        # Generate recommendations based on gaps
        recommendations = []
        
        # Default recommendations
        default_recs = {
            'GDPR': [
                'Implement data protection impact assessments for high-risk processing',
                'Establish data processing agreements with all vendors',
                'Create privacy by design procedures for new systems',
                'Implement automated breach detection and notification system',
                'Establish regular privacy training for all staff'
            ],
            'CCPA': [
                'Update privacy policy with CCPA-specific disclosures',
                'Implement consumer request fulfillment system',
                'Review and update vendor contracts for CCPA compliance',
                'Establish opt-out mechanism for data sales',
                'Create annual compliance attestation process'
            ],
            'HIPAA': [
                'Conduct comprehensive risk analysis',
                'Implement encryption for data in transit and at rest',
                'Establish access control policies and procedures',
                'Create security awareness training program',
                'Implement audit logging for all PHI access'
            ],
            'SOC2': [
                'Document all security policies and procedures',
                'Implement change management process',
                'Establish incident response plan',
                'Conduct quarterly access reviews',
                'Perform annual risk assessment'
            ],
            'PCI-DSS': [
                'Install and maintain firewall configuration',
                'Change default passwords and security parameters',
                'Implement encrypted data protection',
                'Conduct quarterly vulnerability scans',
                'Perform annual penetration testing'
            ]
        }
        
        if framework_upper in default_recs:
            recommendations = [
                {
                    'recommendation': rec,
                    'priority': 'high' if i < 2 else 'medium',
                    'estimated_effort': '2-4 weeks' if i < 2 else '1-2 weeks',
                    'owner': 'Compliance Team'
                }
                for i, rec in enumerate(default_recs[framework_upper])
            ]
        
        # Log audit event
        _log_audit_event('generate_recommendations', framework_upper, {
            'recommendations_count': len(recommendations)
        })
        
        return {
            'success': True,
            'framework': framework,
            'recommendations_count': len(recommendations),
            'recommendations': recommendations,
            'generated_date': datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in generate_recommendations: {str(e)}")
        return {'success': False, 'error': f'Recommendation generation error: {str(e)}'}

def create_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create compliance report."""
    try:
        framework = _get_input(payload, 'framework', ['standard', 'compliance_framework'])
        include_recommendations = _get_input(payload, 'include_recommendations', default=True)
        include_audit_trail = _get_input(payload, 'include_audit_trail', default=True)
        
        if not framework:
            return {'success': False, 'error': 'Missing required parameter: framework'}
        
        framework_upper = framework.upper()
        if framework_upper not in COMPLIANCE_FRAMEWORKS:
            return {'success': False, 'error': f'Unknown framework: {framework}'}
        
        framework_info = COMPLIANCE_FRAMEWORKS[framework_upper]
        
        # Compile report
        report = {
            'id': str(uuid.uuid4()),
            'title': f'Compliance Report - {framework_info["name"]}',
            'framework': framework,
            'framework_full_name': framework_info['name'],
            'jurisdiction': framework_info['jurisdiction'],
            'category': framework_info['category'],
            'generated_date': datetime.now().isoformat(),
            'report_period': 'January 2025 - January 2026',
            'executive_summary': f'This report documents the organization\'s compliance posture against the {framework_info["name"]} standard.',
            'requirements_total': len(framework_info['requirements']),
            'audit_entries': len(AUDIT_LOG) if include_audit_trail else 0
        }
        
        # Log audit event
        _log_audit_event('create_report', framework_upper, {
            'report_id': report['id']
        })
        
        return {
            'success': True,
            'report': report,
            'has_recommendations': include_recommendations,
            'has_audit_trail': include_audit_trail
        }
    except Exception as e:
        logger.error(f"Error in create_report: {str(e)}")
        return {'success': False, 'error': f'Report creation error: {str(e)}'}

def track_remediation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Track remediation progress."""
    try:
        framework = _get_input(payload, 'framework', ['standard', 'compliance_framework'])
        action_id = _get_input(payload, 'action_id', ['remediation_id'], default=str(uuid.uuid4()))
        status = _get_input(payload, 'status', ['progress'], default='in_progress')
        completion_percentage = _get_input(payload, 'completion_percentage', ['percent_complete'], default=0)
        
        if not framework:
            return {'success': False, 'error': 'Missing required parameter: framework'}
        
        framework_upper = framework.upper()
        if framework_upper not in COMPLIANCE_FRAMEWORKS:
            return {'success': False, 'error': f'Unknown framework: {framework}'}
        
        # Validate status
        valid_statuses = ['not_started', 'in_progress', 'completed', 'deferred']
        if status not in valid_statuses:
            return {'success': False, 'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}
        
        # Log audit event
        _log_audit_event('track_remediation', framework_upper, {
            'action_id': action_id,
            'status': status,
            'completion': completion_percentage
        })
        
        return {
            'success': True,
            'framework': framework,
            'action_id': action_id,
            'status': status,
            'completion_percentage': completion_percentage,
            'last_updated': datetime.now().isoformat(),
            'remediation_status': {
                'total_actions': 1,
                'completed': 1 if status == 'completed' else 0,
                'in_progress': 1 if status == 'in_progress' else 0,
                'not_started': 1 if status == 'not_started' else 0
            }
        }
    except Exception as e:
        logger.error(f"Error in track_remediation: {str(e)}")
        return {'success': False, 'error': f'Remediation tracking error: {str(e)}'}

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
        if action == 'check_compliance':
            result = check_compliance(payload)
        elif action == 'identify_gaps':
            result = identify_gaps(payload)
        elif action == 'generate_recommendations':
            result = generate_recommendations(payload)
        elif action == 'create_report':
            result = create_report(payload)
        elif action == 'track_remediation':
            result = track_remediation(payload)
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
