#!/usr/bin/env python3

"""
Comprehensive test to verify the complete step ID mismatch fix.
This simulates the entire flow from ACCOMPLISH plugin through plan validation to AgentSet execution.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared', 'python', 'lib'))

from plan_validator import PlanValidator
import json
import uuid

def mock_brain_call(prompt, model=None, timeout=None):
    """Mock brain call for testing."""
    return '{"mock": "response"}'

def simulate_createFromPlan(plan):
    """Simulate the createFromPlan function from Step.ts."""
    stepNumberToUUID = {}
    
    # First pass: assign UUIDs to all tasks
    for idx, task in enumerate(plan):
        task['id'] = str(uuid.uuid4())
        step_num = task.get('number', idx + 1)
        stepNumberToUUID[step_num] = task['id']
    
    # Second pass: resolve dependencies
    dependencies_info = []
    for task in plan:
        inputs = task.get('inputs', {})
        for input_name, input_def in inputs.items():
            if isinstance(input_def, dict) and 'sourceStep' in input_def:
                source_step_num = input_def['sourceStep']
                source_step_id = stepNumberToUUID.get(source_step_num)
                
                if source_step_id:
                    dependencies_info.append(f"✅ Step {task['number']} ({task['actionVerb']}) -> Step {source_step_num} ({source_step_id})")
                else:
                    dependencies_info.append(f"❌ Step {task['number']} ({task['actionVerb']}) -> UNRESOLVED Step {source_step_num}")
    
    return {
        'plan': plan,
        'stepNumberToUUID': stepNumberToUUID,
        'dependencies_info': dependencies_info
    }

def test_complete_flow():
    """Test the complete flow from plan validation to execution."""
    
    print("🔄 Testing Complete Step ID Fix Flow")
    print("=" * 60)
    
    # Step 1: Simulate a structured plan from ACCOMPLISH plugin (before validation)
    # This represents what _convert_to_structured_plan returns
    structured_plan = [
        {
            "number": 1,
            "actionVerb": "SEARCH",
            "description": "Search for agentic AI platforms",
            "inputs": {
                "query": {"value": "agentic AI platforms", "valueType": "string"}
            },
            "outputs": {
                "competitor_search_results": {"type": "array", "description": "Search results"}
            }
        },
        {
            "number": 2,
            "actionVerb": "SCRAPE",
            "description": "Scrape competitor data",
            "inputs": {
                "url": {"outputName": "competitor_search_results", "sourceStep": 1}
            },
            "outputs": {
                "scraped_data": {"type": "object", "description": "Scraped data"}
            }
        },
        {
            "number": 3,
            "actionVerb": "REFLECT",
            "description": "Analyze results",
            "inputs": {
                "data": {"outputName": "scraped_data", "sourceStep": 2}
            },
            "outputs": {
                "analysis": {"type": "object", "description": "Analysis"}
            }
        }
    ]
    
    print("📋 1. Original structured plan (from ACCOMPLISH):")
    for step in structured_plan:
        print(f"  Step {step['number']}: {step['actionVerb']}")
    
    # Step 2: Plan validation (this will create FOREACH steps)
    print(f"\n🔧 2. Plan validation (will create FOREACH for array->scalar mismatch):")
    
    # Mock inputs for validation
    mock_inputs = {
        'availablePlugins': {
            'value': [
                {
                    'actionVerb': 'SEARCH',
                    'inputDefinitions': [
                        {'name': 'query', 'type': 'string', 'required': True}
                    ],
                    'outputDefinitions': [
                        {'name': 'competitor_search_results', 'type': 'array'}
                    ]
                },
                {
                    'actionVerb': 'SCRAPE',
                    'inputDefinitions': [
                        {'name': 'url', 'type': 'string', 'required': True}  # scalar type
                    ],
                    'outputDefinitions': [
                        {'name': 'scraped_data', 'type': 'object'}
                    ]
                },
                {
                    'actionVerb': 'REFLECT',
                    'inputDefinitions': [
                        {'name': 'data', 'type': 'object', 'required': True}
                    ],
                    'outputDefinitions': [
                        {'name': 'analysis', 'type': 'object'}
                    ]
                },
                {
                    'actionVerb': 'FOREACH',
                    'inputDefinitions': [
                        {'name': 'array', 'type': 'array', 'required': True},
                        {'name': 'steps', 'type': 'plan', 'required': True}
                    ],
                    'outputDefinitions': []
                }
            ]
        }
    }
    
    validator = PlanValidator(brain_call=mock_brain_call)
    
    try:
        validated_plan = validator.validate_and_repair(structured_plan, "Test goal", mock_inputs)
        print(f"  ✅ Validation completed")
        
        print(f"\n📋 3. Validated plan (after FOREACH wrapping):")
        for step in validated_plan:
            print(f"  Step {step['number']}: {step['actionVerb']}")
            if 'inputs' in step:
                for input_name, input_def in step['inputs'].items():
                    if isinstance(input_def, dict) and 'sourceStep' in input_def:
                        source_step = input_def['sourceStep']
                        step_type = "UUID" if isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step else "number"
                        print(f"    Input '{input_name}' -> Step {source_step} ({step_type})")
        
        # Step 3: Simulate AgentSet createFromPlan
        print(f"\n🎯 4. AgentSet createFromPlan simulation:")
        result = simulate_createFromPlan(validated_plan)
        
        print(f"\n📊 5. Dependency resolution results:")
        for info in result['dependencies_info']:
            print(f"  {info}")
        
        # Check for issues
        unresolved = [info for info in result['dependencies_info'] if '❌' in info]
        if unresolved:
            print(f"\n❌ ISSUES FOUND:")
            for issue in unresolved:
                print(f"  {issue}")
            return False
        else:
            print(f"\n✅ ALL DEPENDENCIES RESOLVED CORRECTLY!")
            return True
            
    except Exception as e:
        print(f"  ❌ Validation failed: {e}")
        return False

def test_problematic_scenario():
    """Test the specific problematic scenario from the logs."""
    
    print(f"\n🚨 Testing Problematic Scenario (UUID sourceStep)")
    print("=" * 60)
    
    # Simulate a plan that somehow has UUID sourceStep references
    # This represents the problematic case we saw in the logs
    problematic_plan = [
        {
            "number": 1,
            "actionVerb": "SEARCH",
            "description": "Search for agentic AI platforms",
            "inputs": {
                "query": {"value": "agentic AI platforms", "valueType": "string"}
            },
            "outputs": {
                "competitor_search_results": {"type": "array", "description": "Search results"}
            }
        },
        {
            "number": 13,  # Created by validator
            "actionVerb": "FOREACH",
            "description": "Iterate over competitor_search_results",
            "inputs": {
                # This is the problem - UUID instead of step number!
                "array": {"outputName": "competitor_search_results", "sourceStep": "91a4b7f1-2b4b-4707-8ab2-103e67f4a261"},
                "steps": {"value": [], "valueType": "array"}
            },
            "outputs": {
                "scraped_data": {"type": "array", "description": "Aggregated data"}
            }
        }
    ]
    
    print("📋 Problematic plan (UUID sourceStep):")
    for step in problematic_plan:
        print(f"  Step {step['number']}: {step['actionVerb']}")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    step_type = "UUID" if isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step else "number"
                    print(f"    Input '{input_name}' -> {source_step} ({step_type})")
    
    # Test cleanup
    validator = PlanValidator(brain_call=mock_brain_call)
    cleaned_plan = validator._cleanup_step_ids(problematic_plan)
    
    print(f"\n🧹 After cleanup:")
    uuid_refs_found = False
    for step in cleaned_plan:
        print(f"  Step {step['number']}: {step['actionVerb']}")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    if is_uuid:
                        uuid_refs_found = True
                    step_type = "UUID" if is_uuid else "number"
                    print(f"    Input '{input_name}' -> {source_step} ({step_type})")
    
    if uuid_refs_found:
        print(f"\n⚠️  UUID references detected - this indicates the root cause of step ID mismatches")
        print(f"   The plan validator is receiving plans with UUID sourceStep references")
        print(f"   instead of step numbers. This needs to be fixed at the source.")
    else:
        print(f"\n✅ No UUID references found after cleanup")
    
    return not uuid_refs_found

if __name__ == "__main__":
    print("🧪 COMPREHENSIVE STEP ID MISMATCH FIX TEST")
    print("=" * 70)
    
    success1 = test_complete_flow()
    success2 = test_problematic_scenario()
    
    print(f"\n" + "=" * 70)
    if success1 and success2:
        print(f"🎉 ALL TESTS PASSED!")
        print(f"\n✅ The step ID cleanup fix should resolve the mismatch issues")
    else:
        print(f"❌ SOME TESTS FAILED")
        print(f"\n🔧 Additional investigation needed to find the source of UUID sourceStep references")
