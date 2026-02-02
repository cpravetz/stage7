#!/usr/bin/env python3

"""
Policy Validator - Integrates policy compliance checking with existing validation logic

This module provides policy validation capabilities that integrate with the existing
plan validation and plugin validation systems, and now includes centralized syntax validation.
"""

import json
import os
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

# Import syntax validator
from syntax_validator import create_syntax_validator, ValidationResult as SyntaxValidationResult


class PolicyValidator:
    """
    Policy validation engine that integrates with existing validation systems.
    """
     
    def __init__(self, policy_dir: str = None):
        """
        Initialize the policy validator.
         
        Args:
            policy_dir: Directory containing policy definitions
        """
        self.policy_dir = policy_dir or os.path.join(os.path.dirname(__file__), '../../../policies')
        self.policies = []
        self.violations = []
        self.syntax_validator = create_syntax_validator()
        self.load_policies()
    
    def load_policies(self) -> bool:
        """
        Load all policies from the policy directory.
        
        Returns:
            True if policies loaded successfully, False otherwise
        """
        try:
            # Read the master index
            index_path = os.path.join(self.policy_dir, 'index.json')
            if not os.path.exists(index_path):
                logger.error(f"Policy index not found at {index_path}")
                return False
                
            with open(index_path, 'r') as f:
                index = json.load(f)
            
            # Load each policy file
            for category in index.get('categories', []):
                for policy in category.get('policies', []):
                    policy_path = os.path.join(self.policy_dir, policy['file'])
                    if os.path.exists(policy_path):
                        with open(policy_path, 'r') as f:
                            policy_content = json.load(f)
                        self.policies.append(policy_content)
                        logger.debug(f"Loaded policy: {policy_content['id']} - {policy_content['title']}")
                    else:
                        logger.warning(f"Policy file not found: {policy_path}")
            
            logger.info(f"Loaded {len(self.policies)} policies successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error loading policies: {e}")
            return False
    
    def validate_plan_against_policies(self, plan: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Validate a plan against relevant policies.
         
        Args:
            plan: The plan to validate
             
        Returns:
            Dictionary containing validation results and violations
        """
        logger.info("Validating plan against policies")
        
        # First perform syntax validation
        syntax_result = self.syntax_validator.validate_component(plan, 'plan', 'policy_validation_plan')
        
        results = {
            'policy_compliance': True,
            'syntax_compliance': syntax_result.is_valid,
            'violations': [],
            'warnings': [],
            'syntax_errors': [self._convert_syntax_error(e) for e in syntax_result.errors],
            'stats': {
                'policies_checked': 0,
                'critical_violations': 0,
                'high_violations': 0,
                'medium_violations': 0,
                'low_violations': 0,
                'syntax_errors': syntax_result.get_error_count(),
                'syntax_warnings': syntax_result.get_warning_count()
            }
        }
        
        # If syntax validation fails, mark as non-compliant
        if not syntax_result.is_valid:
            results['policy_compliance'] = False
        
        # Check CODE-003: Actionable Plans policy
        actionable_policy = self._find_policy('CODE-003')
        if actionable_policy:
            results['stats']['policies_checked'] += 1
            
            # Validate plan structure
            if not self._validate_plan_structure(plan):
                results['violations'].append({
                    'policy_id': actionable_policy['id'],
                    'policy_title': actionable_policy['title'],
                    'severity': actionable_policy['severity'],
                    'violation': 'Invalid plan structure',
                    'details': 'Plan does not conform to expected structure'
                })
                results['policy_compliance'] = False
                results['stats'][f"{actionable_policy['severity']}_violations"] += 1
            
            # Validate step structure
            for i, step in enumerate(plan):
                if not self._validate_step_structure(step):
                    results['violations'].append({
                        'policy_id': actionable_policy['id'],
                        'policy_title': actionable_policy['title'],
                        'severity': actionable_policy['severity'],
                        'violation': f'Invalid step structure in step {i}',
                        'details': f'Step {i} does not conform to expected structure'
                    })
                    results['policy_compliance'] = False
                    results['stats'][f"{actionable_policy['severity']}_violations"] += 1
        
        # Check ARCH-002: Verb-Based Capability Expansion policy
        verb_policy = self._find_policy('ARCH-002')
        if verb_policy:
            results['stats']['policies_checked'] += 1
            
            # Check that all verbs are properly defined
            verbs_used = set()
            for step in plan:
                if 'actionVerb' in step:
                    verbs_used.add(step['actionVerb'])
            
            # In a real implementation, this would check against available verbs
            # For now, we'll just log the verbs used
            logger.info(f"Plan uses verbs: {', '.join(verbs_used)}")
        
        # Check PROCESS-002: Robustness and Stability policy
        robustness_policy = self._find_policy('PROCESS-002')
        if robustness_policy:
            results['stats']['policies_checked'] += 1
            
            # Check for error handling in plan steps
            steps_with_error_handling = 0
            for step in plan:
                if self._step_has_error_handling(step):
                    steps_with_error_handling += 1
            
            if steps_with_error_handling < len(plan) * 0.3:  # At least 30% of steps should have error handling
                results['warnings'].append({
                    'policy_id': robustness_policy['id'],
                    'policy_title': robustness_policy['title'],
                    'severity': robustness_policy['severity'],
                    'warning': 'Low error handling coverage',
                    'details': f'Only {steps_with_error_handling}/{len(plan)} steps have error handling'
                })
        
        return results
    
    def validate_plugin_against_policies(self, plugin: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate a plugin against relevant policies.
         
        Args:
            plugin: The plugin definition to validate
             
        Returns:
            Dictionary containing validation results and violations
        """
        logger.info(f"Validating plugin {plugin.get('verb', 'unknown')} against policies")
        
        # First perform syntax validation
        verb = plugin.get('verb', 'unknown_plugin')
        syntax_result = self.syntax_validator.validate_component(plugin, 'plugin', verb)
        
        results = {
            'policy_compliance': True,
            'syntax_compliance': syntax_result.is_valid,
            'violations': [],
            'warnings': [],
            'syntax_errors': [self._convert_syntax_error(e) for e in syntax_result.errors],
            'stats': {
                'policies_checked': 0,
                'critical_violations': 0,
                'high_violations': 0,
                'medium_violations': 0,
                'low_violations': 0,
                'syntax_errors': syntax_result.get_error_count(),
                'syntax_warnings': syntax_result.get_warning_count()
            }
        }
        
        # If syntax validation fails, mark as non-compliant
        if not syntax_result.is_valid:
            results['policy_compliance'] = False
        
        # Check CODE-001: Production-Ready Code policy
        prod_policy = self._find_policy('CODE-001')
        if prod_policy:
            results['stats']['policies_checked'] += 1
            
            # Check for required plugin fields
            required_fields = ['verb', 'description', 'inputDefinitions', 'outputDefinitions']
            missing_fields = [field for field in required_fields if field not in plugin]
            
            if missing_fields:
                results['violations'].append({
                    'policy_id': prod_policy['id'],
                    'policy_title': prod_policy['title'],
                    'severity': prod_policy['severity'],
                    'violation': 'Missing required plugin fields',
                    'details': f'Missing fields: {', '.join(missing_fields)}'
                })
                results['policy_compliance'] = False
                results['stats'][f"{prod_policy['severity']}_violations"] += 1
            
            # Check input definitions
            if 'inputDefinitions' in plugin:
                for input_def in plugin['inputDefinitions']:
                    if 'name' not in input_def or 'type' not in input_def:
                        results['violations'].append({
                            'policy_id': prod_policy['id'],
                            'policy_title': prod_policy['title'],
                            'severity': prod_policy['severity'],
                            'violation': 'Invalid input definition',
                            'details': f'Input definition missing name or type: {input_def}'
                        })
                        results['policy_compliance'] = False
                        results['stats'][f"{prod_policy['severity']}_violations"] += 1
        
        # Check ARCH-002: Verb-Based Capability Expansion policy
        verb_policy = self._find_policy('ARCH-002')
        if verb_policy:
            results['stats']['policies_checked'] += 1
            
            # Check verb naming conventions
            verb = plugin.get('verb', '')
            if verb and not self._is_valid_verb_name(verb):
                results['warnings'].append({
                    'policy_id': verb_policy['id'],
                    'policy_title': verb_policy['title'],
                    'severity': verb_policy['severity'],
                    'warning': 'Verb naming convention violation',
                    'details': f'Verb "{verb}" does not follow naming conventions'
                })
        
        return results
    
    def _find_policy(self, policy_id: str) -> Optional[Dict[str, Any]]:
        """
        Find a policy by ID.
        
        Args:
            policy_id: The policy ID to find
            
        Returns:
            The policy dictionary if found, None otherwise
        """
        for policy in self.policies:
            if policy['id'] == policy_id:
                return policy
        return None
    
    def _validate_plan_structure(self, plan: List[Dict[str, Any]]) -> bool:
        """
        Validate the basic structure of a plan.
        
        Args:
            plan: The plan to validate
            
        Returns:
            True if structure is valid, False otherwise
        """
        if not isinstance(plan, list):
            return False
            
        if len(plan) == 0:
            return False
            
        return True
    
    def _validate_step_structure(self, step: Dict[str, Any]) -> bool:
        """
        Validate the structure of an individual plan step.
        
        Args:
            step: The step to validate
            
        Returns:
            True if structure is valid, False otherwise
        """
        if not isinstance(step, dict):
            return False
            
        # Check for required fields
        required_fields = ['id', 'actionVerb']
        for field in required_fields:
            if field not in step:
                return False
                
        return True
    
    def _step_has_error_handling(self, step: Dict[str, Any]) -> bool:
        """
        Check if a step has error handling mechanisms.
        
        Args:
            step: The step to check
            
        Returns:
            True if step has error handling, False otherwise
        """
        # This is a simplified check - in a real implementation, this would
        # look for specific error handling patterns in the step definition
        
        # Check for fallback steps or error handling inputs
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict):
                    if input_name.lower() in ['fallback', 'error_handler', 'on_error']:
                        return True
                    if 'value' in input_def and isinstance(input_def['value'], str):
                        if 'error' in input_def['value'].lower() or 'fallback' in input_def['value'].lower():
                            return True
                        
        return False
    
    def _is_valid_verb_name(self, verb: str) -> bool:
        """
        Check if a verb name follows naming conventions.
        
        Args:
            verb: The verb name to check
            
        Returns:
            True if verb name is valid, False otherwise
        """
        if not verb or not isinstance(verb, str):
            return False
            
        # Basic checks for verb naming conventions
        # Verbs should be uppercase, alphanumeric with underscores
        if not verb.isupper():
            return False
            
        # Should not contain spaces or special characters (except underscores)
        if ' ' in verb:
            return False
            
        # Should be reasonable length
        if len(verb) > 50:
            return False
            
        return True
    
    def get_compliance_summary(self) -> Dict[str, Any]:
        """
        Get a summary of policy compliance.
        
        Returns:
            Dictionary containing compliance summary
        """
        return {
            'total_policies': len(self.policies),
            'compliance_by_category': self._get_compliance_by_category(),
            'critical_policies': len([p for p in self.policies if p['severity'] == 'critical']),
            'high_policies': len([p for p in self.policies if p['severity'] == 'high'])
        }
    
    def _get_compliance_by_category(self) -> Dict[str, int]:
        """
        Get policy count by category.
         
        Returns:
            Dictionary with category counts
        """
        categories = {}
        for policy in self.policies:
            category = policy['category']
            categories[category] = categories.get(category, 0) + 1
        return categories
    
    def _convert_syntax_error(self, error: SyntaxValidationResult) -> Dict[str, Any]:
        """
        Convert syntax validation error to policy violation format.
         
        Args:
            error: Syntax validation error
             
        Returns:
            Dictionary in policy violation format
        """
        severity_map = {
            'critical': 'critical',
            'high': 'high',
            'medium': 'medium',
            'low': 'low'
        }
        
        return {
            'policy_id': 'SYNTAX-VALIDATION',
            'policy_title': 'Syntax Validation Policy',
            'severity': severity_map.get(error.severity, 'medium'),
            'violation': error.error_type.value,
            'details': error.message,
            'component_type': error.component_type,
            'component_id': error.component_id,
            'field_path': error.field_path
        }


def integrate_with_plan_validator(plan_validator_instance):
    """
    Integrate policy validation with the existing plan validator.
    
    Args:
        plan_validator_instance: Instance of the existing PlanValidator
        
    Returns:
        Enhanced plan validator with policy checking
    """
    
    class PolicyEnhancedPlanValidator(plan_validator_instance.__class__):
        """
        Extended plan validator with policy compliance checking.
        """
        
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.policy_validator = PolicyValidator()
        
        def validate_and_repair(self, plan, goal, inputs):
            """
            Enhanced validation that includes policy compliance checking.
            """
            # First run normal validation
            validation_result = super().validate_and_repair(plan, goal, inputs)
            
            # Then run policy validation
            policy_result = self.policy_validator.validate_plan_against_policies(plan)
            
            # Combine results
            if not policy_result['policy_compliance']:
                validation_result.is_valid = False
                for violation in policy_result['violations']:
                    error = StructuredError(
                        ErrorType.GENERIC,
                        f"Policy violation: {violation['violation']} ({violation['policy_id']})",
                        step_id=None
                    )
                    validation_result.errors.append(error)
            
            # Add policy compliance info to validation result
            validation_result.policy_compliance = policy_result
            
            return validation_result
        
        def validate_and_repair_with_policy_focus(self, plan, goal, inputs, focus_policies=None):
            """
            Validation with specific focus on certain policies.
            """
            # This would be a more targeted validation approach
            return self.validate_and_repair(plan, goal, inputs)
    
    # Return enhanced validator
    enhanced_validator = PolicyEnhancedPlanValidator(
        plan_validator_instance.brain_call,
        plan_validator_instance.report_logic_failure_call,
        plan_validator_instance.librarian_info
    )
    
    # Copy over any existing state
    enhanced_validator.plugin_cache = plan_validator_instance.plugin_cache
    enhanced_validator.max_retries = plan_validator_instance.max_retries
    
    return enhanced_validator


if __name__ == "__main__":
    # Example usage
    validator = PolicyValidator()
    
    # Print compliance summary
    summary = validator.get_compliance_summary()
    print("Policy Compliance Summary:")
    print(f"  Total Policies: {summary['total_policies']}")
    print(f"  Critical Policies: {summary['critical_policies']}")
    print(f"  High Policies: {summary['high_policies']}")
    print("  By Category:")
    for category, count in summary['compliance_by_category'].items():
        print(f"    {category}: {count}")
    
    # Example plan validation
    example_plan = [
        {
            "id": "step-1",
            "actionVerb": "RESEARCH",
            "description": "Research the topic",
            "inputs": {
                "topic": {"value": "AI Policy Compliance", "valueType": "string"}
            },
            "outputs": {
                "results": {"description": "Research results", "type": "string"}
            }
        }
    ]
    
    print("\nValidating example plan...")
    plan_results = validator.validate_plan_against_policies(example_plan)
    
    if plan_results['policy_compliance']:
        print("✅ Plan is policy compliant")
    else:
        print("❌ Plan has policy violations:")
        for violation in plan_results['violations']:
            print(f"  - {violation['violation']} ({violation['policy_id']})")
    
    # Example plugin validation
    example_plugin = {
        "verb": "RESEARCH",
        "description": "Research a topic",
        "inputDefinitions": [
            {"name": "topic", "type": "string", "required": True}
        ],
        "outputDefinitions": [
            {"name": "results", "type": "string"}
        ]
    }
    
    print("\nValidating example plugin...")
    plugin_results = validator.validate_plugin_against_policies(example_plugin)
    
    if plugin_results['policy_compliance']:
        print("✅ Plugin is policy compliant")
    else:
        print("❌ Plugin has policy violations:")
        for violation in plugin_results['violations']:
            print(f"  - {violation['violation']} ({violation['policy_id']})")