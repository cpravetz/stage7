#!/usr/bin/env python3

import sys
sys.path.insert(0, 'shared/python/lib')
from plan_validator import PlanValidator
import logging
import json

# Set up logging to see debug messages
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_reflect_dependencies():
    """Test that REFLECT step dependencies are correctly updated to reference FOREACH outputs."""
    print('Testing REFLECT dependency updates...')
    
    # Create a plan where REFLECT depends on a step that gets moved into FOREACH
    test_plan = [
        {
            'number': 1,
            'actionVerb': 'SEARCH',
            'description': 'Search for data',
            'inputs': {
                'searchTerm': {'value': 'test', 'valueType': 'string'}
            },
            'outputs': {
                'search_results': {'description': 'Search results', 'type': 'array'}
            }
        },
        {
            'number': 2,
            'actionVerb': 'SCRAPE',
            'description': 'Scrape each URL',
            'inputs': {
                'url': {'sourceStep': 1, 'outputName': 'search_results'}  # This will trigger FOREACH
            },
            'outputs': {
                'scraped_data': {'description': 'Scraped content', 'type': 'string'}
            }
        },
        {
            'number': 3,
            'actionVerb': 'REFLECT',
            'description': 'Analyze the results',
            'inputs': {
                'missionId': {'value': 'test-123', 'valueType': 'string'},
                'plan_history': {'value': '[]', 'valueType': 'string'},
                'question': {'value': 'Was this successful?', 'valueType': 'string'},
                'scraped_data_dependency': {  # This should be updated to reference FOREACH
                    'sourceStep': 2,
                    'outputName': 'scraped_data'
                }
            },
            'outputs': {
                'answer': {'description': 'Analysis result', 'type': 'string'}
            }
        }
    ]

    # Set up plugin map
    available_plugins = [
        {
            'actionVerb': 'SEARCH',
            'inputDefinitions': [{'name': 'searchTerm', 'type': 'string', 'required': True}],
            'outputDefinitions': [{'name': 'results', 'type': 'array'}]
        },
        {
            'actionVerb': 'SCRAPE',
            'inputDefinitions': [{'name': 'url', 'type': 'string', 'required': True}],
            'outputDefinitions': [{'name': 'content', 'type': 'string'}]
        },
        {
            'actionVerb': 'REFLECT',
            'inputDefinitions': [
                {'name': 'missionId', 'type': 'string', 'required': True},
                {'name': 'plan_history', 'type': 'string', 'required': True},
                {'name': 'question', 'type': 'string', 'required': True}
            ],
            'outputDefinitions': [{'name': 'answer', 'type': 'string'}]
        }
    ]

    try:
        validator = PlanValidator()
        validator.plugin_map = {}
        for plugin in available_plugins:
            validator.plugin_map[plugin['actionVerb']] = plugin
        
        inputs = {
            'availablePlugins': {
                'inputName': 'availablePlugins',
                'value': available_plugins,
                'valueType': 'array'
            }
        }
        
        print('\nOriginal plan:')
        for step in test_plan:
            print(f"  Step {step['number']}: {step['actionVerb']}")
            if 'inputs' in step:
                for input_name, input_def in step['inputs'].items():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        print(f"    Input {input_name}: references step {input_def['sourceStep']} output '{input_def['outputName']}'")
        
        # Run validation
        goal = "Test REFLECT dependency updates"
        result = validator.validate_and_repair(test_plan, goal, inputs)
        
        # Handle result format
        if isinstance(result, list):
            repaired_plan = result
        elif isinstance(result, dict) and result.get('success') and 'plan' in result:
            repaired_plan = result['plan']
        else:
            print('Validation failed')
            return False
        
        print(f'\nRepaired plan has {len(repaired_plan)} steps:')
        
        foreach_step = None
        reflect_step = None
        
        for step in repaired_plan:
            print(f"\n  Step {step['number']}: {step['actionVerb']}")
            
            if step['actionVerb'] == 'FOREACH':
                foreach_step = step
                print(f"    Array input: step {step['inputs']['array']['sourceStep']} output '{step['inputs']['array']['outputName']}'")
                print(f"    Outputs: {list(step.get('outputs', {}).keys())}")
                
            elif step['actionVerb'] == 'REFLECT':
                reflect_step = step
                print(f"    REFLECT step found!")
                if 'inputs' in step:
                    for input_name, input_def in step['inputs'].items():
                        if isinstance(input_def, dict) and 'sourceStep' in input_def:
                            print(f"      Input {input_name}: references step {input_def['sourceStep']} output '{input_def['outputName']}'")
        
        # Check if REFLECT dependencies were updated correctly
        if not foreach_step:
            print('ERROR: No FOREACH step found')
            return False
            
        if not reflect_step:
            print('ERROR: No REFLECT step found')
            return False
        
        # Check if REFLECT step references the FOREACH step
        reflect_dependencies = []
        for input_name, input_def in reflect_step.get('inputs', {}).items():
            if isinstance(input_def, dict) and 'sourceStep' in input_def:
                reflect_dependencies.append((input_name, input_def['sourceStep'], input_def['outputName']))
        
        foreach_references = [dep for dep in reflect_dependencies if dep[1] == foreach_step['number']]
        
        if foreach_references:
            print(f'\nSUCCESS: REFLECT step correctly references FOREACH step {foreach_step["number"]}')
            for input_name, source_step, output_name in foreach_references:
                print(f"  Input {input_name} -> step {source_step} output {output_name}")
            return True
        else:
            print(f'\nERROR: REFLECT step does not reference FOREACH step {foreach_step["number"]}')
            print(f'REFLECT dependencies: {reflect_dependencies}')
            return False
            
    except Exception as e:
        print(f'Test failed with exception: {e}')
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_reflect_dependencies()
    if success:
        print('\nTEST PASSED: REFLECT dependencies correctly updated!')
    else:
        print('\nTEST FAILED: REFLECT dependencies not updated correctly!')
    sys.exit(0 if success else 1)
