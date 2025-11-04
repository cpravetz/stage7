#!/usr/bin/env python3

import sys
sys.path.insert(0, 'shared/python/lib')
from plan_validator import PlanValidator
import logging

# Set up logging to see debug messages
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_foreach_circular_dependency_fix():
    """Test that FOREACH wrapping doesn't create circular dependencies."""
    print('Testing FOREACH circular dependency fix...')
    
    # Create a plan that should trigger FOREACH wrapping
    test_plan = [
        {
            'number': 1,
            'actionVerb': 'SEARCH',
            'description': 'Search for competitors',
            'inputs': {
                'searchTerm': {
                    'value': 'agentic AI platforms',
                    'valueType': 'string'
                }
            },
            'outputs': {
                'competitor_search_results': {
                    'description': 'List of competitor search results',
                    'type': 'array'
                }
            }
        },
        {
            'number': 2,
            'actionVerb': 'SCRAPE',
            'description': 'Scrape competitor information',
            'inputs': {
                'url': {
                    'sourceStep': 1,
                    'outputName': 'competitor_urls'  # Wrong name - should be competitor_search_results
                }
            },
            'outputs': {
                'competitor_info': {
                    'description': 'Information about competitors',
                    'type': 'array'
                }
            }
        }
    ]

    # Set up plugin map manually
    available_plugins = [
        {
            'actionVerb': 'SEARCH',
            'inputDefinitions': [{'name': 'searchTerm', 'type': 'string', 'required': True}],
            'outputDefinitions': [{'name': 'results', 'type': 'array'}]
        },
        {
            'actionVerb': 'SCRAPE',
            'inputDefinitions': [{'name': 'url', 'type': 'string', 'required': True}],
            'outputDefinitions': [{'name': 'content', 'type': 'array'}]
        }
    ]

    try:
        validator = PlanValidator()
        
        # Set up plugin map manually
        validator.plugin_map = {}
        for plugin in available_plugins:
            validator.plugin_map[plugin['actionVerb']] = plugin
        
        # Test the validation and repair
        inputs = {
            'availablePlugins': {
                'inputName': 'availablePlugins',
                'value': available_plugins,
                'valueType': 'array'
            }
        }
        
        print('Original plan:')
        for step in test_plan:
            print(f"  Step {step['number']}: {step['actionVerb']}")
            if 'inputs' in step:
                for input_name, input_def in step['inputs'].items():
                    if 'sourceStep' in input_def:
                        print(f"    Input {input_name}: references step {input_def['sourceStep']} output '{input_def['outputName']}'")
        
        # Run validation
        goal = "Test FOREACH circular dependency fix"
        result = validator.validate_and_repair(test_plan, goal, inputs)
        
        print('\nValidation result:')

        # Handle both dict and list return formats
        if isinstance(result, list):
            print("Success: True (returned repaired plan)")
            repaired_plan = result
        elif isinstance(result, dict):
            print(f"Success: {result.get('success', False)}")
            print(f"Errors: {result.get('errors', [])}")
            if result.get('success') and 'plan' in result:
                repaired_plan = result['plan']
            else:
                print('❌ Validation failed')
                return False
        else:
            print('❌ Unexpected result format')
            return False

        print(f'\nRepaired plan has {len(repaired_plan)} steps:')

        for step in repaired_plan:
                print(f"  Step {step['number']}: {step['actionVerb']}")
                if step['actionVerb'] == 'FOREACH':
                    print(f"    Array input: step {step['inputs']['array']['sourceStep']} output '{step['inputs']['array']['outputName']}'")
                    sub_steps = step['inputs']['steps']['value']
                    print(f"    Sub-steps: {len(sub_steps)}")
                    for sub_step in sub_steps:
                        print(f"      Sub-step {sub_step['number']}: {sub_step['actionVerb']}")
                        if 'inputs' in sub_step:
                            for input_name, input_def in sub_step['inputs'].items():
                                if 'sourceStep' in input_def:
                                    print(f"        Input {input_name}: references step {input_def['sourceStep']} output '{input_def['outputName']}'")
                                    
                                    # CHECK FOR CIRCULAR DEPENDENCY
                                    if input_def['sourceStep'] == step['number']:
                                        print(f"        ❌ CIRCULAR DEPENDENCY DETECTED: Sub-step references parent FOREACH step {step['number']}")
                                        return False
                                    elif input_def['sourceStep'] == 0:
                                        print(f"        ✅ Correct: Sub-step references parent step (sourceStep=0)")

        print('\n✅ No circular dependencies detected!')
        return True
            
    except Exception as e:
        print(f'❌ Test failed with exception: {e}')
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_foreach_circular_dependency_fix()
    if success:
        print('\n🎉 Test PASSED: FOREACH circular dependency fix works!')
    else:
        print('\n💥 Test FAILED: FOREACH circular dependency still exists!')
    sys.exit(0 if success else 1)
