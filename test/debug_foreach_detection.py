#!/usr/bin/env python3

import sys
sys.path.insert(0, 'shared/python/lib')
from plan_validator import PlanValidator
import logging

# Set up logging to see debug messages
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test the FOREACH detection with a simple plan
test_plan = [
    {
        'number': 1,
        'actionVerb': 'SEARCH',
        'outputs': {'competitor_search_results': {'type': 'array'}},
        'inputs': {}
    },
    {
        'number': 2,
        'actionVerb': 'SCRAPE',
        'inputs': {
            'url': {
                'sourceStep': 1,
                'outputName': 'competitor_search_results',
                'valueType': 'string'
            }
        },
        'outputs': {'competitor_details': {'type': 'array'}}
    }
]

print('Testing FOREACH detection...')
print('Step 1 outputs array, Step 2 expects string input from Step 1')
print('This should trigger FOREACH detection')

try:
    validator = PlanValidator()
    
    # Set up plugin map manually
    available_plugins = [
        {
            'actionVerb': 'SEARCH',
            'outputDefinitions': [{'name': 'results', 'type': 'array'}]
        },
        {
            'actionVerb': 'SCRAPE',
            'inputDefinitions': [{'name': 'url', 'type': 'string', 'required': True}],
            'outputDefinitions': [{'name': 'content', 'type': 'array'}]
        }
    ]
    
    # Call the validation method directly
    result = validator._validate_plan(test_plan, available_plugins)
    
    print(f"Validation result: {result}")
    print(f"Valid: {result.get('valid', False)}")
    print(f"Errors: {result.get('errors', [])}")
    print(f"Wrappable errors: {result.get('wrappable_errors', [])}")
    
    wrappable_errors = result.get('wrappable_errors', [])
    print(f'FOREACH opportunities detected: {len(wrappable_errors)}')
    for error in wrappable_errors:
        print(f'Step {error["step_number"]}: {error}')
        
    if len(wrappable_errors) == 0:
        print('\nNo FOREACH opportunities detected - this indicates a bug in the detection logic')
        
        # Let's manually check what should happen
        step2 = test_plan[1]
        url_input = step2['inputs']['url']
        print(f'Step 2 url input: {url_input}')
        
        # Check if we can find the source step
        source_step = test_plan[0]  # Step 1
        print(f'Source step outputs: {source_step.get("outputs", {})}')
        
        # Check type compatibility
        source_output_type = source_step['outputs']['competitor_search_results']['type']
        dest_input_type = url_input['valueType']
        print(f'Source type: {source_output_type}, Dest type: {dest_input_type}')
        should_wrap = source_output_type == 'array' and dest_input_type == 'string'
        print(f'Should be wrappable: {should_wrap}')
        
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
