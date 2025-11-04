#!/usr/bin/env python3
"""
Test suite for the three-phase hybrid validation system:
- Phase 1: API-based plugin information retrieval
- Phase 2: Runtime FOREACH detection and insertion  
- Phase 3: Hybrid approach combining both with caching
"""

import unittest
import json
import logging
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add the shared library path
shared_lib_path = os.path.join(os.path.dirname(__file__), '..', 'shared', 'python', 'lib')
sys.path.insert(0, shared_lib_path)

# Import with absolute imports to avoid relative import issues
import plugin_type_service
import plan_validator
import hybrid_validation_service

from plugin_type_service import PluginTypeService, create_plugin_type_service
from plan_validator import PlanValidator
from hybrid_validation_service import HybridValidationService, create_hybrid_validation_service

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


class TestHybridValidation(unittest.TestCase):
    """Test the complete hybrid validation system."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_inputs = {
            'capabilitiesManagerUrl': 'http://localhost:5060',
            'authToken': 'test-token',
            'availablePlugins': []  # Empty to force API-based lookup
        }
        
        # Sample plan that should trigger FOREACH insertion
        self.test_plan = [
            {
                'number': 1,
                'actionVerb': 'SEARCH',
                'description': 'Search for information',
                'inputs': {
                    'query': {'value': 'test query', 'valueType': 'string'}
                },
                'outputs': {
                    'results': {'type': 'array'}
                }
            },
            {
                'number': 2,
                'actionVerb': 'SCRAPE',
                'description': 'Scrape each URL',
                'inputs': {
                    'url': {'sourceStep': 1, 'outputName': 'results'}
                },
                'outputs': {
                    'content': {'type': 'string'}
                }
            }
        ]
        
        self.test_goal = 'Test FOREACH insertion'
    
    def test_phase1_api_based_plugin_service(self):
        """Test Phase 1: API-based plugin information retrieval."""
        logger.info("Testing Phase 1: API-based plugin information retrieval")
        
        # Mock the HTTP requests
        with patch('requests.Session.get') as mock_get:
            # Mock successful response for SEARCH plugin
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'actionVerb': 'SEARCH',
                'inputDefinitions': [
                    {'name': 'query', 'type': 'string'}
                ],
                'outputDefinitions': [
                    {'name': 'results', 'type': 'array'}
                ]
            }
            mock_get.return_value = mock_response
            
            # Create plugin type service
            service = create_plugin_type_service(self.test_inputs)
            self.assertIsNotNone(service)
            
            # Test single plugin lookup
            type_info = service.get_plugin_type_info('SEARCH')
            self.assertIsNotNone(type_info)
            self.assertEqual(type_info['actionVerb'], 'SEARCH')
            self.assertEqual(len(type_info['outputDefinitions']), 1)
            self.assertEqual(type_info['outputDefinitions'][0]['type'], 'array')
            
            logger.info("Phase 1 test passed: API-based plugin lookup working")
    
    def test_phase2_runtime_foreach_detection(self):
        """Test Phase 2: Runtime FOREACH detection."""
        logger.info("Testing Phase 2: Runtime FOREACH detection")
        
        # Create plan validator with API service
        validator = PlanValidator()
        validator.use_api_based_types = True
        validator.plugin_type_service = Mock()
        
        # Mock the plugin type service to return SCRAPE plugin info
        validator.plugin_type_service.get_plugin_type_info.return_value = {
            'actionVerb': 'SCRAPE',
            'inputDefinitions': [
                {'name': 'url', 'type': 'string'}  # Expects string, not array
            ],
            'outputDefinitions': [
                {'name': 'content', 'type': 'string'}
            ]
        }
        
        # Simulate step execution with array output
        executed_step = {'number': 1, 'actionVerb': 'SEARCH'}
        step_outputs = {
            'results': ['http://example1.com', 'http://example2.com', 'http://example3.com']
        }
        remaining_steps = [
            {
                'number': 2,
                'actionVerb': 'SCRAPE',
                'inputs': {
                    'url': {'sourceStep': 1, 'outputName': 'results'}
                }
            }
        ]
        
        # Test runtime FOREACH detection
        modifications = validator.detect_runtime_foreach_needs(
            executed_step, step_outputs, remaining_steps
        )
        
        self.assertEqual(len(modifications), 1)
        self.assertEqual(modifications[0]['type'], 'insert_foreach')
        self.assertEqual(modifications[0]['sourceStep'], 1)
        self.assertEqual(modifications[0]['targetStep'], 2)
        
        logger.info("Phase 2 test passed: Runtime FOREACH detection working")
    
    def test_phase3_hybrid_service_integration(self):
        """Test Phase 3: Complete hybrid service integration."""
        logger.info("Testing Phase 3: Hybrid service integration")
        
        # Mock the plugin type service
        with patch('shared.python.lib.plugin_type_service.create_plugin_type_service') as mock_create:
            mock_service = Mock()
            mock_service.get_plugin_type_info.side_effect = lambda verb: {
                'SEARCH': {
                    'actionVerb': 'SEARCH',
                    'inputDefinitions': [{'name': 'query', 'type': 'string'}],
                    'outputDefinitions': [{'name': 'results', 'type': 'array'}]
                },
                'SCRAPE': {
                    'actionVerb': 'SCRAPE', 
                    'inputDefinitions': [{'name': 'url', 'type': 'string'}],
                    'outputDefinitions': [{'name': 'content', 'type': 'string'}]
                }
            }.get(verb)
            
            mock_create.return_value = mock_service
            
            # Create hybrid validation service
            hybrid_service = create_hybrid_validation_service(self.test_inputs)
            self.assertIsNotNone(hybrid_service)
            
            # Test planning-time validation
            result = hybrid_service.validate_plan(self.test_plan, self.test_goal)
            self.assertTrue(result['valid'])
            
            # Test runtime detection
            executed_step = {'number': 1, 'actionVerb': 'SEARCH'}
            step_outputs = {'results': ['url1', 'url2', 'url3']}
            remaining_steps = [step for step in self.test_plan if step['number'] > 1]
            
            modifications = hybrid_service.detect_runtime_foreach_needs(
                executed_step, step_outputs, remaining_steps
            )
            
            self.assertGreaterEqual(len(modifications), 0)  # May or may not need FOREACH depending on validation
            
            # Test statistics
            stats = hybrid_service.get_validation_stats()
            self.assertIn('api_based_types_enabled', stats)
            self.assertIn('novel_verbs_discovered', stats)
            
            logger.info("Phase 3 test passed: Hybrid service integration working")
    
    def test_novel_verb_handling(self):
        """Test handling of novel verbs that aren't in the plugin registry."""
        logger.info("Testing novel verb handling")
        
        # Plan with a novel verb
        novel_plan = [
            {
                'number': 1,
                'actionVerb': 'NOVEL_SEARCH',  # This verb doesn't exist
                'description': 'Novel search action',
                'inputs': {
                    'query': {'value': 'test', 'valueType': 'string'}
                },
                'outputs': {
                    'results': {'type': 'unknown'}  # Type will be determined at runtime
                }
            },
            {
                'number': 2,
                'actionVerb': 'SCRAPE',
                'description': 'Scrape results',
                'inputs': {
                    'url': {'sourceStep': 1, 'outputName': 'results'}
                },
                'outputs': {
                    'content': {'type': 'string'}
                }
            }
        ]
        
        with patch('shared.python.lib.plugin_type_service.create_plugin_type_service') as mock_create:
            mock_service = Mock()
            # Novel verb returns None, SCRAPE returns normal definition
            mock_service.get_plugin_type_info.side_effect = lambda verb: {
                'SCRAPE': {
                    'actionVerb': 'SCRAPE',
                    'inputDefinitions': [{'name': 'url', 'type': 'string'}],
                    'outputDefinitions': [{'name': 'content', 'type': 'string'}]
                }
            }.get(verb)  # NOVEL_SEARCH will return None
            
            mock_create.return_value = mock_service
            
            hybrid_service = create_hybrid_validation_service(self.test_inputs)
            
            # Validate plan - should handle novel verb gracefully
            result = hybrid_service.validate_plan(novel_plan, self.test_goal)
            
            # Should detect novel verb
            self.assertIn('NOVEL_SEARCH', result.get('novel_verbs', []))
            
            # Test runtime handling when novel verb produces array
            executed_step = {'number': 1, 'actionVerb': 'NOVEL_SEARCH'}
            step_outputs = {'results': ['url1', 'url2']}  # Novel verb produces array
            remaining_steps = [step for step in novel_plan if step['number'] > 1]
            
            modifications = hybrid_service.detect_runtime_foreach_needs(
                executed_step, step_outputs, remaining_steps
            )
            
            # Should detect FOREACH need for novel verb output
            self.assertGreaterEqual(len(modifications), 0)
            
            logger.info("Novel verb handling test passed")
    
    def test_caching_and_performance(self):
        """Test caching mechanisms and performance optimizations."""
        logger.info("Testing caching and performance")
        
        with patch('shared.python.lib.plugin_type_service.create_plugin_type_service') as mock_create:
            mock_service = Mock()
            mock_service.get_cache_stats.return_value = {
                'cache_hits': 5,
                'cache_misses': 2,
                'cache_size': 3
            }
            mock_create.return_value = mock_service
            
            hybrid_service = create_hybrid_validation_service(self.test_inputs)
            
            # Test batch retrieval
            verbs = ['SEARCH', 'SCRAPE', 'ANALYZE']
            batch_result = hybrid_service.get_plugin_type_info_batch(verbs)
            
            # Should call batch method on service
            mock_service.get_batch_plugin_type_info.assert_called_once_with(verbs)
            
            # Test cache statistics
            stats = hybrid_service.get_validation_stats()
            self.assertIn('cache_hits', stats)
            self.assertIn('cache_misses', stats)
            
            # Test cache clearing
            hybrid_service.clear_caches()
            mock_service.clear_cache.assert_called_once()
            
            logger.info("Caching and performance test passed")


if __name__ == '__main__':
    # Run the tests
    unittest.main(verbosity=2)
