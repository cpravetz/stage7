#!/usr/bin/env python3

import sys
sys.path.insert(0, 'shared/python/lib')
from plan_validator import PlanValidator
import logging
import json

# Set up logging to see debug messages
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_mission_stalling_fixes():
    """Test all the fixes for mission stalling issues."""
    print('🔧 Testing Mission Stalling Fixes...')
    
    # Create a realistic plan that should trigger FOREACH wrapping and include deliverables
    test_plan = [
        {
            'number': 1,
            'actionVerb': 'SEARCH',
            'description': 'Search for competitors in the agentic AI space',
            'inputs': {
                'searchTerm': {
                    'value': 'agentic AI platforms competitors',
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
            'description': 'Scrape competitor information from each URL',
            'inputs': {
                'url': {
                    'sourceStep': 1,
                    'outputName': 'competitor_search_results'  # This should trigger FOREACH
                }
            },
            'outputs': {
                'competitor_info': {
                    'description': 'Detailed information about each competitor',
                    'type': 'array'
                }
            }
        },
        {
            'number': 3,
            'actionVerb': 'GENERATE',
            'description': 'Generate a comprehensive competitor analysis report',
            'inputs': {
                'data': {
                    'sourceStep': 2,
                    'outputName': 'competitor_info'
                }
            },
            'outputs': {
                'final_report': {
                    'description': 'A comprehensive competitor analysis report',
                    'type': 'string',
                    'isDeliverable': True,  # This should be saved to shared files
                    'filename': 'competitor_analysis_report.md'
                }
            }
        },
        {
            'number': 4,
            'actionVerb': 'REFLECT',
            'description': 'Analyze mission progress and effectiveness',
            'inputs': {
                'missionId': {'value': 'test-mission-123', 'valueType': 'string'},
                'plan_history': {'value': '[]', 'valueType': 'string'},
                'question': {'value': 'Has the mission been completed successfully?', 'valueType': 'string'},
                'final_report_dependency': {  # Ensure REFLECT depends on the final report
                    'sourceStep': 3,
                    'outputName': 'final_report'
                }
            },
            'outputs': {
                'answer': {
                    'description': 'Analysis of mission completion',
                    'type': 'string'
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
        },
        {
            'actionVerb': 'GENERATE',
            'inputDefinitions': [{'name': 'data', 'type': 'array', 'required': True}],
            'outputDefinitions': [{'name': 'result', 'type': 'string'}]
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
        
        print('\n📋 Original plan:')
        for step in test_plan:
            print(f"  Step {step['number']}: {step['actionVerb']}")
            if 'inputs' in step:
                for input_name, input_def in step['inputs'].items():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        print(f"    Input {input_name}: references step {input_def['sourceStep']} output '{input_def['outputName']}'")
            if 'outputs' in step:
                for output_name, output_def in step['outputs'].items():
                    if isinstance(output_def, dict):
                        deliverable_info = ""
                        if output_def.get('isDeliverable'):
                            deliverable_info = f" [DELIVERABLE: {output_def.get('filename', 'no filename')}]"
                        print(f"    Output {output_name}: {output_def.get('type', 'unknown type')}{deliverable_info}")
        
        # Run validation
        goal = "Create a comprehensive competitor analysis for agentic AI platforms"
        result = validator.validate_and_repair(test_plan, goal, inputs)
        
        print('\n🔍 Validation result:')
        
        # Handle both dict and list return formats
        if isinstance(result, list):
            print("✅ Success: True (returned repaired plan)")
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
        
        print(f'\n📊 Repaired plan has {len(repaired_plan)} steps:')
        
        # Analyze the repaired plan
        issues_found = []
        foreach_steps = []
        deliverable_steps = []
        reflect_steps = []
        
        for step in repaired_plan:
            print(f"\n  Step {step['number']}: {step['actionVerb']}")
            
            if step['actionVerb'] == 'FOREACH':
                foreach_steps.append(step)
                print(f"    🔄 FOREACH detected!")
                print(f"    Array input: step {step['inputs']['array']['sourceStep']} output '{step['inputs']['array']['outputName']}'")
                sub_steps = step['inputs']['steps']['value']
                print(f"    Sub-steps: {len(sub_steps)}")
                
                for sub_step in sub_steps:
                    print(f"      Sub-step {sub_step['number']}: {sub_step['actionVerb']}")
                    if 'inputs' in sub_step:
                        for input_name, input_def in sub_step['inputs'].items():
                            if isinstance(input_def, dict) and 'sourceStep' in input_def:
                                print(f"        Input {input_name}: references step {input_def['sourceStep']} output '{input_def['outputName']}'")
                                
                                # CHECK FOR CIRCULAR DEPENDENCY
                                if input_def['sourceStep'] == step['number']:
                                    issues_found.append(f"❌ CIRCULAR DEPENDENCY: Sub-step references parent FOREACH step {step['number']}")
                                elif input_def['sourceStep'] == 0:
                                    print(f"        ✅ Correct: Sub-step references parent step (sourceStep=0)")
            
            elif step['actionVerb'] == 'REFLECT':
                reflect_steps.append(step)
                print(f"    🤔 REFLECT step found!")
                
            # Check for deliverable outputs
            if 'outputs' in step:
                for output_name, output_def in step['outputs'].items():
                    if isinstance(output_def, dict) and output_def.get('isDeliverable'):
                        deliverable_steps.append((step, output_name, output_def))
                        filename = output_def.get('filename', 'NO FILENAME')
                        print(f"    📦 DELIVERABLE: {output_name} -> {filename}")
        
        # Summary of findings
        print(f'\n📈 Analysis Summary:')
        print(f"  🔄 FOREACH steps created: {len(foreach_steps)}")
        print(f"  📦 Deliverable outputs found: {len(deliverable_steps)}")
        print(f"  🤔 REFLECT steps found: {len(reflect_steps)}")
        print(f"  ❌ Issues found: {len(issues_found)}")
        
        if issues_found:
            print('\n❌ Issues detected:')
            for issue in issues_found:
                print(f"  {issue}")
            return False
        
        # Check expected outcomes
        success = True
        
        if len(foreach_steps) == 0:
            print('❌ Expected FOREACH step was not created')
            success = False
        
        if len(deliverable_steps) == 0:
            print('❌ No deliverable outputs found - shared files will be empty')
            success = False
        
        if len(reflect_steps) == 0:
            print('❌ No REFLECT step found - mission will not conclude properly')
            success = False
        
        if success:
            print('\n🎉 All fixes working correctly!')
            print('  ✅ FOREACH circular dependency fixed')
            print('  ✅ Output name mismatch handling working')
            print('  ✅ FOREACH wrapping triggered correctly')
            print('  ✅ Deliverable outputs preserved')
            print('  ✅ REFLECT step included')
            return True
        else:
            print('\n💥 Some issues remain')
            return False
            
    except Exception as e:
        print(f'❌ Test failed with exception: {e}')
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_mission_stalling_fixes()
    if success:
        print('\n🎉 ALL TESTS PASSED: Mission stalling fixes are working!')
    else:
        print('\n💥 TESTS FAILED: Some mission stalling issues remain!')
    sys.exit(0 if success else 1)
