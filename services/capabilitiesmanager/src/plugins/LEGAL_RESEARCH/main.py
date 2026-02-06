#!/usr/bin/env python3
"""
LEGAL_RESEARCH Plugin - Legal research and case law analysis
Conducts case law research, precedent analysis, statute research, and provides legal citations
"""

import sys
import json
import logging
import os
import re
import datetime
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# In-memory legal case database (simulation)
CASE_DATABASE = {
    'Miranda v. Arizona': {
        'citation': '384 U.S. 436 (1966)',
        'court': 'U.S. Supreme Court',
        'year': 1966,
        'topic': 'Criminal Law - Rights',
        'holding': 'Custodial interrogation requires Miranda warnings',
        'facts': 'Defendant confessed to crimes without being informed of rights',
        'rule': 'Police must inform suspects of their right to remain silent and right to counsel',
        'impact': 'Landmark precedent requiring police to warn suspects'
    },
    'Roe v. Wade': {
        'citation': '410 U.S. 113 (1973)',
        'court': 'U.S. Supreme Court',
        'year': 1973,
        'topic': 'Constitutional Law',
        'holding': 'Constitutional right to abortion within certain limits',
        'facts': 'Woman challenged Texas abortion law',
        'rule': 'Trimester framework for state regulation of abortion',
        'impact': 'Established constitutional protection for abortion rights'
    },
    'Marbury v. Madison': {
        'citation': '5 U.S. 137 (1803)',
        'court': 'U.S. Supreme Court',
        'year': 1803,
        'topic': 'Constitutional Law',
        'holding': 'Judicial review power established',
        'facts': 'Dispute over judicial commission',
        'rule': 'Courts have authority to review constitutionality of laws',
        'impact': 'Established judicial review doctrine'
    },
    'Brown v. Board of Education': {
        'citation': '347 U.S. 483 (1954)',
        'court': 'U.S. Supreme Court',
        'year': 1954,
        'topic': 'Constitutional Law - Equal Protection',
        'holding': 'Separate but equal doctrine is unconstitutional',
        'facts': 'Challenge to school segregation laws',
        'rule': 'Separate facilities inherently unequal',
        'impact': 'Desegregation of public schools required'
    },
    'Gideon v. Wainwright': {
        'citation': '372 U.S. 335 (1963)',
        'court': 'U.S. Supreme Court',
        'year': 1963,
        'topic': 'Criminal Law - Right to Counsel',
        'holding': 'Right to counsel in criminal cases',
        'facts': 'Defendant denied counsel due to lack of funds',
        'rule': 'Sixth Amendment requires counsel in felony cases',
        'impact': 'Established public defender requirement'
    }
}

# Statute database
STATUTE_DATABASE = {
    'Title VII of the Civil Rights Act of 1964': {
        'citation': '42 U.S.C. §2000e',
        'jurisdiction': 'Federal',
        'topic': 'Employment Discrimination',
        'summary': 'Prohibits employment discrimination based on race, color, religion, sex, or national origin'
    },
    'Americans with Disabilities Act (ADA)': {
        'citation': '42 U.S.C. §12101',
        'jurisdiction': 'Federal',
        'topic': 'Disability Rights',
        'summary': 'Prohibits discrimination against individuals with disabilities'
    },
    'Fair Housing Act': {
        'citation': '42 U.S.C. §3601',
        'jurisdiction': 'Federal',
        'topic': 'Housing Law',
        'summary': 'Prohibits discrimination in housing based on protected characteristics'
    }
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

def _calculate_relevance_score(query: str, case: Dict[str, Any]) -> float:
    """Calculate relevance score for a case based on query match."""
    query_lower = query.lower()
    score = 0.0
    
    # Topic match - highest weight
    if query_lower in case.get('topic', '').lower():
        score += 0.4
    
    # Holding match
    if query_lower in case.get('holding', '').lower():
        score += 0.3
    
    # Rule match
    if query_lower in case.get('rule', '').lower():
        score += 0.2
    
    # Facts match - lower weight
    if query_lower in case.get('facts', '').lower():
        score += 0.1
    
    return min(score, 1.0)

def search_cases(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Search legal case database."""
    try:
        query = _get_input(payload, 'query', ['search_term', 'keyword'])
        if not query:
            return {'success': False, 'error': 'Missing required parameter: query'}
        
        if not isinstance(query, str) or len(query) < 2:
            return {'success': False, 'error': 'Query must be a non-empty string'}
        
        # Search with relevance scoring
        results = []
        for case_name, case_data in CASE_DATABASE.items():
            score = _calculate_relevance_score(query, case_data)
            if score > 0:
                results.append({
                    'name': case_name,
                    'relevance_score': round(score, 3),
                    'citation': case_data['citation'],
                    'court': case_data['court'],
                    'year': case_data['year'],
                    'topic': case_data['topic']
                })
        
        # Sort by relevance
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        
        return {
            'success': True,
            'query': query,
            'results_found': len(results),
            'cases': results[:10],  # Return top 10
            'timestamp': datetime.datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in search_cases: {str(e)}")
        return {'success': False, 'error': f'Search error: {str(e)}'}

def analyze_precedent(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze legal precedent and applicability."""
    try:
        case_name = _get_input(payload, 'case_name', ['case'])
        issue = _get_input(payload, 'issue', ['legal_issue', 'topic'])
        
        if not case_name:
            return {'success': False, 'error': 'Missing required parameter: case_name'}
        if not issue:
            return {'success': False, 'error': 'Missing required parameter: issue'}
        
        # Find the case
        case_data = CASE_DATABASE.get(case_name)
        if not case_data:
            return {'success': False, 'error': f'Case not found: {case_name}'}
        
        # Analyze precedent applicability
        issue_match = issue.lower() in case_data['holding'].lower() or issue.lower() in case_data['topic'].lower()
        
        return {
            'success': True,
            'case_name': case_name,
            'citation': case_data['citation'],
            'court': case_data['court'],
            'year': case_data['year'],
            'issue_analyzed': issue,
            'precedent_applicable': issue_match,
            'holding': case_data['holding'],
            'rule': case_data['rule'],
            'impact': case_data['impact'],
            'analysis': {
                'binding': case_data['court'] == 'U.S. Supreme Court' or 'Supreme Court' in case_data['court'],
                'persuasive': not (case_data['court'] == 'U.S. Supreme Court'),
                'age_years': datetime.datetime.now().year - case_data['year']
            }
        }
    except Exception as e:
        logger.error(f"Error in analyze_precedent: {str(e)}")
        return {'success': False, 'error': f'Analysis error: {str(e)}'}

def search_statutes(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Search statute database."""
    try:
        query = _get_input(payload, 'query', ['search_term', 'keyword'])
        topic = _get_input(payload, 'topic', ['area', 'category'])
        
        if not query and not topic:
            return {'success': False, 'error': 'Must provide either query or topic'}
        
        results = []
        for statute_name, statute_data in STATUTE_DATABASE.items():
            match = False
            if query and query.lower() in statute_name.lower():
                match = True
            if topic and topic.lower() in statute_data.get('topic', '').lower():
                match = True
            
            if match:
                results.append({
                    'name': statute_name,
                    'citation': statute_data['citation'],
                    'jurisdiction': statute_data['jurisdiction'],
                    'topic': statute_data['topic'],
                    'summary': statute_data['summary']
                })
        
        return {
            'success': True,
            'query': query,
            'topic': topic,
            'results_found': len(results),
            'statutes': results
        }
    except Exception as e:
        logger.error(f"Error in search_statutes: {str(e)}")
        return {'success': False, 'error': f'Statute search error: {str(e)}'}

def lookup_regulations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Lookup regulations and compliance requirements."""
    try:
        regulation_type = _get_input(payload, 'regulation_type', ['type', 'standard'])
        jurisdiction = _get_input(payload, 'jurisdiction', default='Federal')
        
        if not regulation_type:
            return {'success': False, 'error': 'Missing required parameter: regulation_type'}
        
        regulations = {
            'GDPR': {
                'name': 'General Data Protection Regulation',
                'jurisdiction': 'EU',
                'topic': 'Data Privacy',
                'key_requirements': [
                    'Consent for data processing',
                    'Right to be forgotten',
                    'Data breach notification within 72 hours',
                    'Privacy impact assessments'
                ]
            },
            'CCPA': {
                'name': 'California Consumer Privacy Act',
                'jurisdiction': 'California',
                'topic': 'Consumer Privacy',
                'key_requirements': [
                    'Right to know what data is collected',
                    'Right to delete personal information',
                    'Right to opt-out of sale',
                    'Non-discrimination for exercising rights'
                ]
            },
            'HIPAA': {
                'name': 'Health Insurance Portability and Accountability Act',
                'jurisdiction': 'Federal',
                'topic': 'Healthcare Privacy',
                'key_requirements': [
                    'Protected health information safeguards',
                    'Breach notification requirements',
                    'Patient access rights',
                    'Security standards for e-PHI'
                ]
            }
        }
        
        reg_data = regulations.get(regulation_type.upper())
        if not reg_data:
            return {'success': False, 'error': f'Regulation not found: {regulation_type}'}
        
        return {
            'success': True,
            'regulation': regulation_type,
            'name': reg_data['name'],
            'jurisdiction': reg_data['jurisdiction'],
            'topic': reg_data['topic'],
            'key_requirements': reg_data['key_requirements'],
            'compliance_level': 'mandatory' if reg_data['jurisdiction'] in [jurisdiction, 'Federal'] else 'advisory'
        }
    except Exception as e:
        logger.error(f"Error in lookup_regulations: {str(e)}")
        return {'success': False, 'error': f'Regulation lookup error: {str(e)}'}

def analyze_citations(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze legal citations and their relationships."""
    try:
        citations = _get_input(payload, 'citations', default=[])
        
        if not citations or not isinstance(citations, list):
            return {'success': False, 'error': 'Citations must be provided as a list'}
        
        analyzed = []
        for citation in citations:
            if not isinstance(citation, str) or len(citation) < 3:
                continue
            
            # Pattern matching for citations
            analysis = {
                'citation': citation,
                'valid_format': bool(re.match(r'^\d+\s*U\.S\.\s*\d+|^\d+\s*F\.\d*d?\s*\d+', citation)),
                'type': 'case' if 'U.S.' in citation or 'F.' in citation else 'statute',
                'case_found': any(citation in case_data.get('citation', '') for case_data in CASE_DATABASE.values())
            }
            analyzed.append(analysis)
        
        return {
            'success': True,
            'citations_analyzed': len(analyzed),
            'analysis': analyzed
        }
    except Exception as e:
        logger.error(f"Error in analyze_citations: {str(e)}")
        return {'success': False, 'error': f'Citation analysis error: {str(e)}'}

def generate_brief(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate legal research brief."""
    try:
        topic = _get_input(payload, 'topic', ['issue', 'legal_issue'])
        
        if not topic:
            return {'success': False, 'error': 'Missing required parameter: topic'}
        
        if not isinstance(topic, str) or len(topic) < 3:
            return {'success': False, 'error': 'Topic must be a valid string with at least 3 characters'}
        
        # Find related cases and statutes
        related_cases = []
        for case_name, case_data in CASE_DATABASE.items():
            if topic.lower() in case_data.get('topic', '').lower() or topic.lower() in case_data.get('holding', '').lower():
                related_cases.append({
                    'name': case_name,
                    'citation': case_data['citation'],
                    'holding': case_data['holding']
                })
        
        related_statutes = []
        for statute_name, statute_data in STATUTE_DATABASE.items():
            if topic.lower() in statute_data.get('topic', '').lower():
                related_statutes.append({
                    'name': statute_name,
                    'citation': statute_data['citation']
                })
        
        return {
            'success': True,
            'topic': topic,
            'brief': {
                'title': f'Legal Research Brief: {topic}',
                'overview': f'This brief analyzes the legal landscape for {topic}',
                'cases_count': len(related_cases),
                'statutes_count': len(related_statutes),
                'relevant_cases': related_cases[:5],
                'relevant_statutes': related_statutes[:5],
                'generated_date': datetime.datetime.now().isoformat()
            }
        }
    except Exception as e:
        logger.error(f"Error in generate_brief: {str(e)}")
        return {'success': False, 'error': f'Brief generation error: {str(e)}'}

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
        if action == 'search_cases':
            result = search_cases(payload)
        elif action == 'analyze_precedent':
            result = analyze_precedent(payload)
        elif action == 'search_statutes':
            result = search_statutes(payload)
        elif action == 'lookup_regulations':
            result = lookup_regulations(payload)
        elif action == 'analyze_citations':
            result = analyze_citations(payload)
        elif action == 'generate_brief':
            result = generate_brief(payload)
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
