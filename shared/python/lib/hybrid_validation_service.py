#!/usr/bin/env python3
"""
Phase 3: Hybrid Validation Service

This service combines API-based plugin information retrieval with runtime FOREACH detection
to provide a comprehensive solution that scales to thousands of plugins while handling
novel verbs and dynamic type resolution.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Set, Tuple
try:
    from .plugin_type_service import PluginTypeService, create_plugin_type_service
    from .plan_validator import PlanValidator
except ImportError:
    from plugin_type_service import PluginTypeService, create_plugin_type_service
    from plan_validator import PlanValidator

logger = logging.getLogger(__name__)


class HybridValidationService:
    """
    Hybrid service that combines planning-time API-based validation with runtime FOREACH detection.
    
    Features:
    - Lightweight API calls for known plugins during planning
    - Runtime detection and insertion of FOREACH for novel verbs
    - Intelligent caching to minimize API calls
    - Fallback strategies for robustness
    """
    
    def __init__(self, inputs: Dict[str, Any], max_retries: int = 3):
        """
        Initialize the hybrid validation service.
        
        Args:
            inputs: Dictionary containing service URLs and configuration
            max_retries: Maximum number of validation retry attempts
        """
        self.inputs = inputs
        self.max_retries = max_retries
        
        # Initialize components
        self.plugin_type_service = create_plugin_type_service(inputs)
        self.plan_validator = PlanValidator(max_retries)
        
        # Configure the plan validator to use API-based types
        if self.plugin_type_service:
            self.plan_validator.plugin_type_service = self.plugin_type_service
            self.plan_validator.use_api_based_types = True
            logger.info("Hybrid validation service initialized with API-based plugin types")
        else:
            logger.warning("Failed to initialize plugin type service, using traditional validation only")
        
        # Runtime state
        self.runtime_modifications: List[Dict[str, Any]] = []
        self.novel_verbs_cache: Dict[str, Dict[str, Any]] = {}
    
    def validate_plan(self, plan: List[Dict[str, Any]], goal: str) -> Dict[str, Any]:
        """
        Phase 1: Planning-time validation using API-based plugin information.
        
        Args:
            plan: The plan to validate
            goal: The mission goal
            
        Returns:
            Validation result with plan and any errors
        """
        try:
            logger.info("Starting hybrid plan validation (Phase 1: Planning-time)")
            
            # Use the enhanced plan validator with API-based types
            validated_plan = self.plan_validator.validate_and_repair(plan, goal, self.inputs)
            
            # Collect any novel verbs encountered during validation
            novel_verbs = self._extract_novel_verbs(validated_plan)
            if novel_verbs:
                logger.info(f"Novel verbs detected during planning: {novel_verbs}")
                self._cache_novel_verbs(novel_verbs)
            
            return {
                'valid': True,
                'plan': validated_plan,
                'novel_verbs': novel_verbs,
                'errors': []
            }
            
        except Exception as e:
            logger.error(f"Hybrid plan validation failed: {e}")
            return {
                'valid': False,
                'plan': plan,
                'novel_verbs': [],
                'errors': [str(e)]
            }
    
    def detect_runtime_foreach_needs(self, executed_step: Dict[str, Any], 
                                   step_outputs: Dict[str, Any],
                                   remaining_plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Phase 2: Runtime detection of FOREACH needs.
        
        Args:
            executed_step: The step that just completed execution
            step_outputs: The actual outputs from step execution
            remaining_plan: The remaining steps in the plan
            
        Returns:
            List of modifications needed (FOREACH insertions)
        """
        logger.info(f"Runtime FOREACH detection for step {executed_step.get('number')}")
        
        # Use the plan validator's runtime detection
        modifications = self.plan_validator.detect_runtime_foreach_needs(
            executed_step, step_outputs, remaining_plan
        )
        
        # Store modifications for later application
        self.runtime_modifications.extend(modifications)
        
        # Handle novel verbs that might produce arrays
        self._handle_novel_verb_outputs(executed_step, step_outputs, remaining_plan)
        
        return modifications
    
    def apply_runtime_modifications(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Phase 2: Apply all accumulated runtime modifications.
        
        Args:
            plan: The current plan
            
        Returns:
            Modified plan with FOREACH steps inserted
        """
        if not self.runtime_modifications:
            return plan
        
        logger.info(f"Applying {len(self.runtime_modifications)} runtime modifications")
        
        modified_plan = self.plan_validator.apply_runtime_modifications(
            plan, self.runtime_modifications
        )
        
        # Clear applied modifications
        self.runtime_modifications.clear()
        
        return modified_plan
    
    def get_plugin_type_info_batch(self, action_verbs: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Efficient batch retrieval of plugin type information.
        
        Args:
            action_verbs: List of action verbs to get type info for
            
        Returns:
            Dictionary mapping action verbs to their type information
        """
        if not self.plugin_type_service:
            return {}
        
        return self.plugin_type_service.get_batch_plugin_type_info(action_verbs)
    
    def _extract_novel_verbs(self, plan: List[Dict[str, Any]]) -> List[str]:
        """Extract novel verbs from a plan."""
        novel_verbs = []
        
        for step in plan:
            action_verb = step.get('actionVerb', '').upper()
            if not action_verb:
                continue
            
            # Check if this is a known plugin
            if self.plugin_type_service:
                type_info = self.plugin_type_service.get_plugin_type_info(action_verb)
                if not type_info and action_verb not in self.novel_verbs_cache:
                    novel_verbs.append(action_verb)
        
        return list(set(novel_verbs))  # Remove duplicates
    
    def _cache_novel_verbs(self, novel_verbs: List[str]):
        """Cache information about novel verbs for runtime handling."""
        for verb in novel_verbs:
            if verb not in self.novel_verbs_cache:
                self.novel_verbs_cache[verb] = {
                    'discovered_at': 'planning',
                    'assumed_output_type': 'unknown',
                    'runtime_behavior': 'pending'
                }
                logger.debug(f"Cached novel verb: {verb}")
    
    def _handle_novel_verb_outputs(self, executed_step: Dict[str, Any], 
                                 step_outputs: Dict[str, Any],
                                 remaining_plan: List[Dict[str, Any]]):
        """Handle outputs from novel verbs that might produce arrays."""
        action_verb = executed_step.get('actionVerb', '').upper()
        
        if action_verb in self.novel_verbs_cache:
            # Update our knowledge about this novel verb
            has_array_outputs = any(isinstance(output, list) for output in step_outputs.values())
            
            self.novel_verbs_cache[action_verb].update({
                'runtime_behavior': 'produces_arrays' if has_array_outputs else 'produces_scalars',
                'last_execution': executed_step.get('number'),
                'output_types': {name: type(value).__name__ for name, value in step_outputs.items()}
            })
            
            if has_array_outputs:
                logger.info(f"Novel verb {action_verb} produces array outputs - enabling runtime FOREACH detection")
    
    def get_validation_stats(self) -> Dict[str, Any]:
        """Get statistics about the validation service performance."""
        stats = {
            'api_based_types_enabled': self.plan_validator.use_api_based_types,
            'runtime_modifications_applied': len(self.runtime_modifications),
            'novel_verbs_discovered': len(self.novel_verbs_cache),
            'novel_verbs': list(self.novel_verbs_cache.keys())
        }
        
        if self.plugin_type_service:
            stats.update(self.plugin_type_service.get_cache_stats())
        
        return stats
    
    def clear_caches(self):
        """Clear all caches for fresh validation."""
        if self.plugin_type_service:
            self.plugin_type_service.clear_cache()
        
        self.novel_verbs_cache.clear()
        self.runtime_modifications.clear()
        logger.info("Hybrid validation service caches cleared")


def create_hybrid_validation_service(inputs: Dict[str, Any], max_retries: int = 3) -> HybridValidationService:
    """
    Factory function to create a HybridValidationService instance.
    
    Args:
        inputs: Dictionary containing service URLs and configuration
        max_retries: Maximum number of validation retry attempts
        
    Returns:
        Configured HybridValidationService instance
    """
    return HybridValidationService(inputs, max_retries)


# Example usage for integration with existing code
def validate_plan_hybrid(plan: List[Dict[str, Any]], goal: str, inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convenience function for hybrid plan validation.
    
    Args:
        plan: The plan to validate
        goal: The mission goal  
        inputs: Dictionary containing service URLs and configuration
        
    Returns:
        Validated and potentially modified plan
    """
    service = create_hybrid_validation_service(inputs)
    result = service.validate_plan(plan, goal)
    
    if result['valid']:
        return result['plan']
    else:
        logger.error(f"Plan validation failed: {result['errors']}")
        return plan  # Return original plan as fallback
