#!/usr/bin/env python3

"""
Test the fix with the exact scenario from the logs:
- SEARCH step with ID e4cd82ef-ede5-43b0-a4ac-a4dddc9caff3 (actual execution)
- FOREACH step depending on ID 91a4b7f1-2b4b-4707-8ab2-103e67f4a261 (old/stale reference)
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'shared', 'python', 'lib'))

from plan_validator import PlanValidator
import json
import uuid

def simulate_real_scenario():
    """Simulate the exact scenario from the logs."""
    
    print("🌍 Testing Real Scenario Fix")
    print("=" * 50)
    print("Scenario: FOREACH step depends on old SEARCH step ID")
    print("Expected: Enhanced cleanup should resolve the dependency")
    
    # This simulates what happens when:
    # 1. A plan is created with SEARCH step having some ID
    # 2. Plan validator creates FOREACH step referencing that ID
    # 3. Later, the plan gets new step IDs but FOREACH still references old ID
    
    problematic_plan = [
        {
            "number": 1,
            "id": "91a4b7f1-2b4b-4707-8ab2-103e67f4a261",  # Old SEARCH step ID (what FOREACH references)
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
            "actionVerb": "FOREACH",
            "description": "Iterate over competitor_search_results from step 1",
            "inputs": {
                # This is the problematic reference - UUID instead of step number
                "array": {"outputName": "competitor_search_results", "sourceStep": "91a4b7f1-2b4b-4707-8ab2-103e67f4a261"},
                "steps": {"value": [
                    {
                        "number": 3,
                        "actionVerb": "SCRAPE",
                        "description": "Scrape competitor data",
                        "inputs": {
                            "url": {"outputName": "item", "sourceStep": 0}  # 0 = parent FOREACH
                        },
                        "outputs": {
                            "scraped_data": {"type": "object", "description": "Scraped data"}
                        }
                    }
                ], "valueType": "array"}
            },
            "outputs": {
                "scraped_data": {"type": "array", "description": "Aggregated scraped data"}
            }
        },
        {
            "number": 4,
            "actionVerb": "REFLECT",
            "description": "Analyze the mission results",
            "inputs": {
                "scraped_data_dependency": {"outputName": "scraped_data", "sourceStep": 2}
            },
            "outputs": {
                "analysis": {"type": "object", "description": "Mission analysis"}
            }
        }
    ]
    
    print(f"\n📋 Problematic plan (from logs):")
    for step in problematic_plan:
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {step.get('id', 'none')})")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    print(f"    Input '{input_name}' -> {source_step} {'(UUID - PROBLEM!)' if is_uuid else '(step number)'}")
    
    # Apply the enhanced cleanup
    def mock_brain_call(prompt, model=None, timeout=None):
        return '{"mock": "response"}'
    
    validator = PlanValidator(brain_call=mock_brain_call)
    fixed_plan = validator._cleanup_step_ids(problematic_plan)
    
    print(f"\n🔧 After enhanced cleanup:")
    issues_found = 0
    for step in fixed_plan:
        has_id = 'id' in step
        if has_id:
            issues_found += 1
        print(f"  Step {step['number']}: {step['actionVerb']} (ID: {'STILL PRESENT!' if has_id else 'removed'})")
        
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    source_step = input_def['sourceStep']
                    is_uuid = isinstance(source_step, str) and len(source_step) > 10 and '-' in source_step
                    if is_uuid:
                        issues_found += 1
                    print(f"    Input '{input_name}' -> {source_step} {'(UUID - STILL BROKEN!)' if is_uuid else '(step number - FIXED!)'}")
    
    # Now simulate createFromPlan to verify dependencies work
    print(f"\n🎯 Simulating createFromPlan with fixed plan:")
    
    stepNumberToUUID = {}
    # Assign new UUIDs (simulating what createFromPlan does)
    for idx, task in enumerate(fixed_plan):
        new_id = str(uuid.uuid4())
        task['id'] = new_id
        step_num = task.get('number', idx + 1)
        stepNumberToUUID[step_num] = new_id
        print(f"  Step {step_num} -> {new_id}")
    
    # Check dependency resolution
    print(f"\n📊 Dependency resolution:")
    all_resolved = True
    for task in fixed_plan:
        inputs = task.get('inputs', {})
        for input_name, input_def in inputs.items():
            if isinstance(input_def, dict) and 'sourceStep' in input_def:
                source_step_num = input_def['sourceStep']
                if source_step_num == 0:  # Special case for FOREACH parent reference
                    print(f"  ✅ Step {task['number']} input '{input_name}' -> Parent step (FOREACH iteration)")
                else:
                    source_step_id = stepNumberToUUID.get(source_step_num)
                    if source_step_id:
                        print(f"  ✅ Step {task['number']} input '{input_name}' -> Step {source_step_num} ({source_step_id})")
                    else:
                        print(f"  ❌ Step {task['number']} input '{input_name}' -> UNRESOLVED Step {source_step_num}")
                        all_resolved = False
    
    success = issues_found == 0 and all_resolved
    
    print(f"\n{'✅ SUCCESS!' if success else '❌ FAILED!'}")
    if success:
        print(f"  - All step IDs removed from plan")
        print(f"  - All UUID sourceStep references resolved to step numbers")
        print(f"  - All dependencies can be resolved by createFromPlan")
        print(f"  - Mission should execute without step ID mismatches")
    else:
        print(f"  - Issues found: {issues_found}")
        print(f"  - Dependencies resolved: {all_resolved}")
    
    return success

if __name__ == "__main__":
    print("🧪 REAL SCENARIO STEP ID MISMATCH FIX TEST")
    print("=" * 60)
    print("Testing the exact scenario from the mission logs")
    
    success = simulate_real_scenario()
    
    print(f"\n" + "=" * 60)
    if success:
        print(f"🎉 REAL SCENARIO FIX SUCCESSFUL!")
        print(f"\n🚀 The enhanced step ID cleanup should resolve the mission stalling issue.")
        print(f"   FOREACH steps will now properly reference SEARCH step outputs.")
    else:
        print(f"❌ REAL SCENARIO FIX FAILED!")
        print(f"\n🔧 Additional debugging needed.")
