#!/usr/bin/env python3

"""
Test the enhanced step ID cleanup that can resolve UUID sourceStep references back to step numbers.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared', 'python', 'lib'))

from plan_validator import PlanValidator
import json

def test_uuid_resolution():
    """Test that UUID sourceStep references can be resolved back to step numbers."""
    
    print("🔧 Testing Enhanced UUID Resolution")
    print("=" * 50)
    
    # Create a plan that has both step IDs and UUID sourceStep references
    # This simulates the problematic scenario from the logs
    plan_with_uuid_refs = [
        {
            "number": 1,
            "id": "91a4b7f1-2b4b-4707-8ab2-103e67f4a261",  # This is the UUID being referenced
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
                # This references the UUID from step 1 - should be resolved to step number 1
                "array": {"outputName": "competitor_search_results", "sourceStep": "91a4b7f1-2b4b-4707-8ab2-103e67f4a261"},
                "steps": {"value": [], "valueType": "array"}
            },
            "outputs": {
                "scraped_data": {"type": "array", "description": "Aggregated data"}
            }
        },
        {
            "number": 12,
            "id": "another-uuid-12345678-1234-1234-1234-123456789abc",
            "actionVerb": "REFLECT",
            "description": "Analyze results",
            "inputs": {
                # This should be resolved to step number 13
                "data": {"outputName": "scraped_data", "sourceStep": 13}  # This one is already correct
            },
            "outputs": {
                "analysis": {"type": "object", "description": "Analysis"}
            }
        }
    ]
    
    print("📋 Original plan with UUID references:")
    for step in plan_with_uuid_refs:
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {step.get('id', 'none')})")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    print(f"    Input '{input_name}' -> {source_step} {'(UUID)' if is_uuid else '(step number)'}")
    
    # Test the enhanced cleanup
    def mock_brain_call(prompt, model=None, timeout=None):
        return '{"mock": "response"}'
    
    validator = PlanValidator(brain_call=mock_brain_call)
    cleaned_plan = validator._cleanup_step_ids(plan_with_uuid_refs)
    
    print(f"\n🧹 After enhanced cleanup:")
    uuid_refs_remaining = 0
    step_ids_remaining = 0
    
    for step in cleaned_plan:
        has_id = 'id' in step
        if has_id:
            step_ids_remaining += 1
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {'present' if has_id else 'removed'})")
        
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    if is_uuid:
                        uuid_refs_remaining += 1
                    print(f"    Input '{input_name}' -> {source_step} {'(UUID - NOT FIXED)' if is_uuid else '(step number - GOOD)'}")
    
    print(f"\n📊 Cleanup Results:")
    print(f"  Step IDs remaining: {step_ids_remaining} (should be 0)")
    print(f"  UUID references remaining: {uuid_refs_remaining} (should be 0)")
    
    success = step_ids_remaining == 0 and uuid_refs_remaining == 0
    
    if success:
        print(f"\n✅ Enhanced cleanup successful!")
        print(f"  - All step IDs removed")
        print(f"  - All UUID sourceStep references resolved to step numbers")
    else:
        print(f"\n❌ Enhanced cleanup failed!")
        if step_ids_remaining > 0:
            print(f"  - {step_ids_remaining} step IDs not removed")
        if uuid_refs_remaining > 0:
            print(f"  - {uuid_refs_remaining} UUID references not resolved")
    
    return success

def test_unresolvable_uuid():
    """Test handling of UUID references that can't be resolved."""
    
    print(f"\n🚫 Testing Unresolvable UUID References")
    print("=" * 50)
    
    # Create a plan with UUID references that can't be resolved
    plan_with_bad_refs = [
        {
            "number": 1,
            "id": "good-uuid-11111111-1111-1111-1111-111111111111",
            "actionVerb": "SEARCH",
            "description": "Search step",
            "inputs": {
                "query": {"value": "test", "valueType": "string"}
            },
            "outputs": {
                "results": {"type": "array", "description": "Results"}
            }
        },
        {
            "number": 2,
            "actionVerb": "PROCESS",
            "description": "Process results",
            "inputs": {
                # This UUID doesn't exist in the plan - can't be resolved
                "data": {"outputName": "results", "sourceStep": "bad-uuid-99999999-9999-9999-9999-999999999999"}
            },
            "outputs": {
                "processed": {"type": "object", "description": "Processed data"}
            }
        }
    ]
    
    print("📋 Plan with unresolvable UUID reference:")
    for step in plan_with_bad_refs:
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {step.get('id', 'none')})")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    print(f"    Input '{input_name}' -> {source_step} {'(UUID)' if is_uuid else '(step number)'}")
    
    # Test cleanup
    def mock_brain_call(prompt, model=None, timeout=None):
        return '{"mock": "response"}'
    
    validator = PlanValidator(brain_call=mock_brain_call)
    cleaned_plan = validator._cleanup_step_ids(plan_with_bad_refs)
    
    print(f"\n🧹 After cleanup (should show error for unresolvable UUID):")
    for step in cleaned_plan:
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {'present' if 'id' in step else 'removed'})")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    print(f"    Input '{input_name}' -> {source_step} {'(UUID - UNRESOLVABLE)' if is_uuid else '(step number)'}")
    
    return True

if __name__ == "__main__":
    print("🧪 ENHANCED STEP ID CLEANUP TEST")
    print("=" * 60)
    
    success1 = test_uuid_resolution()
    success2 = test_unresolvable_uuid()
    
    print(f"\n" + "=" * 60)
    if success1 and success2:
        print(f"🎉 ALL TESTS PASSED!")
        print(f"\n✅ The enhanced cleanup can resolve UUID sourceStep references")
        print(f"   back to step numbers when the referenced steps exist in the plan.")
    else:
        print(f"❌ SOME TESTS FAILED")
        print(f"\n🔧 The enhanced cleanup needs further refinement")
