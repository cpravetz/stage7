#!/usr/bin/env python3
"""
CONTRACT_ANALYSIS Plugin - Contract parsing and risk detection
Analyzes contracts for clauses, risks, compliance issues, and provides recommendations
"""

import sys
import json
import logging
import os
import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Standard contract clause templates
STANDARD_CLAUSES = {
    'payment_terms': {
        'pattern': r'(payment|invoice|due|net\s+\d+)',
        'risk_level': 'medium',
        'description': 'Payment terms and conditions'
    },
    'liability': {
        'pattern': r'(liability|liable|indemnif)',
        'risk_level': 'high',
        'description': 'Liability and indemnification clauses'
    },
    'termination': {
        'pattern': r'(termination|terminate|cancel)',
        'risk_level': 'medium',
        'description': 'Contract termination conditions'
    },
    'confidentiality': {
        'pattern': r'(confidential|nda|proprietary|trade\s+secret)',
        'risk_level': 'medium',
        'description': 'Confidentiality and NDA provisions'
    },
    'warranty': {
        'pattern': r'(warrant|represent)',
        'risk_level': 'medium',
        'description': 'Warranties and representations'
    },
    'force_majeure': {
        'pattern': r'(force\s+majeure|unforeseeable)',
        'risk_level': 'low',
        'description': 'Force majeure and impossibility clauses'
    },
    'intellectual_property': {
        'pattern': r'(intellectual\s+property|patent|copyright|trademark)',
        'risk_level': 'high',
        'description': 'Intellectual property rights'
    },
    'dispute_resolution': {
        'pattern': r'(arbitration|mediation|jurisdiction|governing\s+law)',
        'risk_level': 'medium',
        'description': 'Dispute resolution mechanisms'
    }
}

# Red flag patterns
RED_FLAG_PATTERNS = [
    {
        'pattern': r'entire\s+agreement.*liability|liability.*entire\s+agreement',
        'flag': 'Entire agreement clause limits liability',
        'severity': 'high'
    },
    {
        'pattern': r'no\s+warranty|as\s+is',
        'flag': 'Product/service provided as-is without warranty',
        'severity': 'high'
    },
    {
        'pattern': r'unilateral\s+termination',
        'flag': 'Unilateral termination right for one party',
        'severity': 'medium'
    },
    {
        'pattern': r'automatic\s+renewal',
        'flag': 'Automatic renewal clause present',
        'severity': 'medium'
    },
    {
        'pattern': r'unlimited\s+liability|unlimited\s+damages',
        'flag': 'Unlimited liability exposure',
        'severity': 'high'
    },
    {
        'pattern': r'sole\s+remedy',
        'flag': 'Sole remedy limitation restricts options',
        'severity': 'medium'
    }
]

# Compliance checklist
COMPLIANCE_CHECKLIST = [
    'Payment terms defined',
    'Liability limits specified',
    'Termination conditions clear',
    'Confidentiality provisions present',
    'Warranties and representations included',
    'Dispute resolution mechanism defined',
    'Governing law specified',
    'Force majeure clause included',
    'Intellectual property rights addressed',
    'Insurance requirements specified'
]

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

def analyze_contract(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Perform comprehensive contract analysis."""
    try:
        contract_text = _get_input(payload, 'contract_text', ['text', 'content'])
        contract_type = _get_input(payload, 'contract_type', ['type'], default='service')
        
        if not contract_text:
            return {'success': False, 'error': 'Missing required parameter: contract_text'}
        
        if not isinstance(contract_text, str) or len(contract_text) < 50:
            return {'success': False, 'error': 'Contract text must be at least 50 characters'}
        
        contract_lower = contract_text.lower()
        
        # Count words and estimate pages
        word_count = len(contract_text.split())
        estimated_pages = max(1, word_count // 250)
        
        # Extract clauses
        clauses_found = extract_clauses({'contract_text': contract_text})['clauses']
        
        # Detect risks
        risks = detect_risks({'contract_text': contract_text})['risks']
        
        # Identify red flags
        red_flags = identify_redflags({'contract_text': contract_text})['red_flags']
        
        return {
            'success': True,
            'contract_type': contract_type,
            'analysis_date': datetime.now().isoformat(),
            'statistics': {
                'word_count': word_count,
                'estimated_pages': estimated_pages,
                'clauses_found': len(clauses_found),
                'risks_identified': len(risks),
                'red_flags': len(red_flags)
            },
            'risk_score': round(sum([STANDARD_CLAUSES.get(c['type'], {}).get('risk_level') == 'high' for c in clauses_found]) / max(len(clauses_found), 1) * 100, 1),
            'clauses': clauses_found[:10],
            'risks': risks[:10],
            'red_flags': red_flags[:5],
            'overall_risk': 'high' if len(red_flags) > 2 else 'medium' if len(risks) > 2 else 'low'
        }
    except Exception as e:
        logger.error(f"Error in analyze_contract: {str(e)}")
        return {'success': False, 'error': f'Analysis error: {str(e)}'}

def extract_clauses(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract contract clauses."""
    try:
        contract_text = _get_input(payload, 'contract_text', ['text', 'content'])
        
        if not contract_text:
            return {'success': False, 'error': 'Missing required parameter: contract_text'}
        
        contract_lower = contract_text.lower()
        clauses = []
        
        # Extract each clause type
        for clause_type, clause_info in STANDARD_CLAUSES.items():
            pattern = clause_info['pattern']
            matches = re.finditer(pattern, contract_lower)
            
            for match in matches:
                # Extract surrounding context (50 chars before and after)
                start = max(0, match.start() - 50)
                end = min(len(contract_text), match.end() + 50)
                context = contract_text[start:end].strip()
                
                clauses.append({
                    'type': clause_type,
                    'description': clause_info['description'],
                    'risk_level': clause_info['risk_level'],
                    'found': True,
                    'context': context
                })
        
        # Remove duplicates
        unique_clauses = {}
        for clause in clauses:
            if clause['type'] not in unique_clauses:
                unique_clauses[clause['type']] = clause
        
        return {
            'success': True,
            'clauses_found': len(unique_clauses),
            'clauses': list(unique_clauses.values())
        }
    except Exception as e:
        logger.error(f"Error in extract_clauses: {str(e)}")
        return {'success': False, 'error': f'Clause extraction error: {str(e)}'}

def detect_risks(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Detect contract risks and problematic terms."""
    try:
        contract_text = _get_input(payload, 'contract_text', ['text', 'content'])
        
        if not contract_text:
            return {'success': False, 'error': 'Missing required parameter: contract_text'}
        
        contract_lower = contract_text.lower()
        risks = []
        
        # Check for missing standard clauses
        for clause_type, clause_info in STANDARD_CLAUSES.items():
            if not re.search(clause_info['pattern'], contract_lower):
                risks.append({
                    'type': 'missing_clause',
                    'description': f'Missing {clause_info["description"]}',
                    'severity': 'medium',
                    'recommendation': f'Add {clause_info["description"]} to contract'
                })
        
        # Check for unusual terms
        if re.search(r'unlimited.*liability', contract_lower):
            risks.append({
                'type': 'unusual_term',
                'description': 'Unlimited liability exposure',
                'severity': 'high',
                'recommendation': 'Negotiate cap on liability exposure'
            })
        
        if re.search(r'automatic.*renewal|auto.*renew', contract_lower):
            risks.append({
                'type': 'unusual_term',
                'description': 'Automatic renewal clause',
                'severity': 'medium',
                'recommendation': 'Add notice requirement before renewal'
            })
        
        if re.search(r'unilateral.*termination', contract_lower):
            risks.append({
                'type': 'unusual_term',
                'description': 'One-sided termination rights',
                'severity': 'medium',
                'recommendation': 'Negotiate mutual termination rights'
            })
        
        return {
            'success': True,
            'risks_found': len(risks),
            'risks': risks
        }
    except Exception as e:
        logger.error(f"Error in detect_risks: {str(e)}")
        return {'success': False, 'error': f'Risk detection error: {str(e)}'}

def check_compliance(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Check contract against compliance standards."""
    try:
        contract_text = _get_input(payload, 'contract_text', ['text', 'content'])
        standard = _get_input(payload, 'standard', ['compliance_standard'], default='general')
        
        if not contract_text:
            return {'success': False, 'error': 'Missing required parameter: contract_text'}
        
        contract_lower = contract_text.lower()
        compliance_results = {}
        compliant_items = 0
        
        for item in COMPLIANCE_CHECKLIST:
            # Simple check for keywords related to compliance item
            keywords = item.lower().split()
            found = any(keyword in contract_lower for keyword in keywords)
            compliance_results[item] = found
            if found:
                compliant_items += 1
        
        return {
            'success': True,
            'standard': standard,
            'compliance_score': round((compliant_items / len(COMPLIANCE_CHECKLIST)) * 100, 1),
            'items_compliant': compliant_items,
            'items_total': len(COMPLIANCE_CHECKLIST),
            'compliance_details': compliance_results,
            'status': 'compliant' if compliant_items >= (len(COMPLIANCE_CHECKLIST) * 0.8) else 'partial' if compliant_items >= (len(COMPLIANCE_CHECKLIST) * 0.5) else 'non_compliant'
        }
    except Exception as e:
        logger.error(f"Error in check_compliance: {str(e)}")
        return {'success': False, 'error': f'Compliance check error: {str(e)}'}

def identify_redflags(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Identify red flags in contract."""
    try:
        contract_text = _get_input(payload, 'contract_text', ['text', 'content'])
        
        if not contract_text:
            return {'success': False, 'error': 'Missing required parameter: contract_text'}
        
        contract_lower = contract_text.lower()
        red_flags = []
        
        # Check each red flag pattern
        for red_flag_info in RED_FLAG_PATTERNS:
            if re.search(red_flag_info['pattern'], contract_lower):
                red_flags.append({
                    'flag': red_flag_info['flag'],
                    'severity': red_flag_info['severity'],
                    'action': f'Review and negotiate {red_flag_info["flag"].lower()}'
                })
        
        return {
            'success': True,
            'red_flags_found': len(red_flags),
            'red_flags': red_flags,
            'alert_level': 'critical' if len(red_flags) > 3 else 'high' if len(red_flags) > 1 else 'normal'
        }
    except Exception as e:
        logger.error(f"Error in identify_redflags: {str(e)}")
        return {'success': False, 'error': f'Red flag detection error: {str(e)}'}

def summarize(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate contract summary."""
    try:
        contract_text = _get_input(payload, 'contract_text', ['text', 'content'])
        
        if not contract_text:
            return {'success': False, 'error': 'Missing required parameter: contract_text'}
        
        if not isinstance(contract_text, str):
            return {'success': False, 'error': 'Contract text must be a string'}
        
        # Create executive summary
        lines = contract_text.split('\n')
        non_empty_lines = [line.strip() for line in lines if line.strip()][:5]
        
        word_count = len(contract_text.split())
        sentence_count = len(re.split(r'[.!?]+', contract_text))
        
        return {
            'success': True,
            'summary': {
                'title': 'Contract Summary',
                'created': datetime.now().isoformat(),
                'statistics': {
                    'word_count': word_count,
                    'sentence_count': max(1, sentence_count - 1),
                    'estimated_length': f'{max(1, word_count // 250)} pages'
                },
                'overview': 'Professional contract covering terms, conditions, and obligations',
                'key_sections': non_empty_lines[:3],
                'document_quality': 'professional' if word_count > 500 else 'basic'
            }
        }
    except Exception as e:
        logger.error(f"Error in summarize: {str(e)}")
        return {'success': False, 'error': f'Summary generation error: {str(e)}'}

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
        if action == 'analyze_contract':
            result = analyze_contract(payload)
        elif action == 'extract_clauses':
            result = extract_clauses(payload)
        elif action == 'detect_risks':
            result = detect_risks(payload)
        elif action == 'check_compliance':
            result = check_compliance(payload)
        elif action == 'identify_redflags':
            result = identify_redflags(payload)
        elif action == 'summarize':
            result = summarize(payload)
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
