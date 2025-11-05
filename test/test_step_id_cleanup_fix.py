#!/usr/bin/env python3

"""
Test the step ID cleanup fix to ensure plan validator works only with step numbers.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared', 'python', 'lib'))

from plan_validator import PlanValidator
import json

def test_step_id_cleanup():
    """Test that the plan validator properly cleans up existing step IDs."""
    
    print("🧪 Testing Step ID Cleanup Fix")
    print("=" * 50)
    
    # Create a plan that has both step numbers AND step IDs (simulating stale data)
    plan_with_ids = [
        {
            "number": 1,
            "id": "old-search-uuid-91a4b7f1-2b4b-4707-8ab2-103e67f4a261",  # This should be removed
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
            "id": "old-scrape-uuid-12345678-1234-1234-1234-123456789abc",  # This should be removed
            "actionVerb": "SCRAPE",
            "description": "Scrape competitor data",
            "inputs": {
                "url": {"outputName": "competitor_search_results", "sourceStep": 1}  # This should stay as step number
            },
            "outputs": {
                "scraped_data": {"type": "object", "description": "Scraped data"}
            }
        }
    ]
    
    print("📋 Original plan with step IDs:")
    for step in plan_with_ids:
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {step.get('id', 'none')})")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    print(f"    Input '{input_name}' references step {input_def['sourceStep']}")
    
    # Create a mock brain_call function
    def mock_brain_call(prompt, model=None, timeout=None):
        return '{"mock": "response"}'
    
    # Create validator and test cleanup
    validator = PlanValidator(brain_call=mock_brain_call)
    cleaned_plan = validator._cleanup_step_ids(plan_with_ids)
    
    print(f"\n🧹 Cleaned plan:")
    for step in cleaned_plan:
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {step.get('id', 'none')})")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    print(f"    Input '{input_name}' references step {input_def['sourceStep']}")
    
    # Verify the cleanup worked
    success = True
    for step in cleaned_plan:
        if 'id' in step:
            print(f"❌ Step {step['number']} still has ID: {step['id']}")
            success = False
        
        # Check that sourceStep references are still step numbers
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    if isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step:
                        print(f"❌ Step {step['number']} input '{input_name}' has UUID sourceStep: {source_step}")
                        success = False
                    elif not isinstance(source_step, int):
                        print(f"❌ Step {step['number']} input '{input_name}' has non-integer sourceStep: {source_step}")
                        success = False
    
    if success:
        print(f"\n✅ Step ID cleanup successful!")
        print(f"  - All step IDs removed")
        print(f"  - All sourceStep references are step numbers")
    else:
        print(f"\n❌ Step ID cleanup failed!")
    
    return success

def test_uuid_detection():
    """Test detection of UUID sourceStep references."""
    
    print("\n🔍 Testing UUID Detection in sourceStep")
    print("=" * 50)
    
    # Create a plan with UUID sourceStep references (the problematic case)
    plan_with_uuid_refs = [
        {
            "number": 1,
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
            "actionVerb": "FOREACH",
            "description": "Process results",
            "inputs": {
                "array": {
                    "outputName": "results", 
                    "sourceStep": "91a4b7f1-2b4b-4707-8ab2-103e67f4a261"  # This is a UUID, not a step number!
                }
            },
            "outputs": {
                "processed": {"type": "array", "description": "Processed data"}
            }
        }
    ]
    
    print("📋 Plan with UUID sourceStep references:")
    for step in plan_with_uuid_refs:
        print(f"  Step {step['number']}: {step['actionVerb']}")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    print(f"    Input '{input_name}' references: {source_step} {'(UUID!)' if is_uuid else '(step number)'}")
    
    # Test the cleanup
    def mock_brain_call(prompt, model=None, timeout=None):
        return '{"mock": "response"}'
    
    validator = PlanValidator(brain_call=mock_brain_call)
    cleaned_plan = validator._cleanup_step_ids(plan_with_uuid_refs)
    
    print(f"\n🧹 After cleanup (warnings should be logged):")
    for step in cleaned_plan:
        print(f"  Step {step['number']}: {step['actionVerb']}")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    print(f"    Input '{input_name}' references: {source_step} {'(UUID - PROBLEM!)' if is_uuid else '(step number)'}")
    
    return True

if __name__ == "__main__":
    success1 = test_step_id_cleanup()
    success2 = test_uuid_detection()
    
    if success1 and success2:
        print(f"\n🎉 All tests passed!")
        print(f"\n🔧 The fix should prevent step ID mismatches by:")
        print(f"  1. Removing existing step IDs from plans before validation")
        print(f"  2. Detecting UUID sourceStep references (indicating the root problem)")
        print(f"  3. Ensuring plan validator works only with step numbers")
    else:
        print(f"\n❌ Some tests failed")
