#!/usr/bin/env python3

"""
Test to reproduce and fix the step ID mismatch issue between plan validation and AgentSet execution.

The issue: Plan validator creates FOREACH steps that reference step numbers, but AgentSet 
creates new UUIDs for all steps, causing dependency mismatches.
"""

import json
import uuid
from typing import Dict, List, Any

def simulate_createFromPlan(plan: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Simulate the createFromPlan function from Step.ts to show the step ID mismatch issue.
    """
    stepNumberToUUID = {}
    
    # First pass: assign UUIDs to all tasks so we can resolve dependencies
    for idx, task in enumerate(plan):
        task['id'] = str(uuid.uuid4())
        step_num = task.get('number', idx + 1)
        stepNumberToUUID[step_num] = task['id']
    
    print("Step Number to UUID Mapping:")
    for step_num, step_id in stepNumberToUUID.items():
        print(f"  Step {step_num} -> {step_id}")
    
    # Second pass: resolve dependencies
    dependencies_info = []
    for task in plan:
        task_dependencies = []
        inputs = task.get('inputs', {})
        
        for input_name, input_def in inputs.items():
            if isinstance(input_def, dict) and 'sourceStep' in input_def:
                source_step_num = input_def['sourceStep']
                source_step_id = stepNumberToUUID.get(source_step_num)
                
                if source_step_id:
                    dependency = {
                        'inputName': input_name,
                        'sourceStepId': source_step_id,
                        'outputName': input_def.get('outputName', 'unknown')
                    }
                    task_dependencies.append(dependency)
                    dependencies_info.append(f"Step {task['number']} ({task['actionVerb']}) depends on {source_step_id} (step {source_step_num})")
                else:
                    dependencies_info.append(f"❌ Step {task['number']} ({task['actionVerb']}) has UNRESOLVED dependency on step {source_step_num}")
        
        task['resolved_dependencies'] = task_dependencies
    
    return {
        'plan': plan,
        'stepNumberToUUID': stepNumberToUUID,
        'dependencies_info': dependencies_info
    }

def test_step_id_mismatch():
    """Test the step ID mismatch issue with a plan that has FOREACH steps created by the validator."""
    
    print("🧪 Testing Step ID Mismatch Issue")
    print("=" * 50)
    
    # Simulate a plan that comes from the plan validator after FOREACH wrapping
    # This represents what the ACCOMPLISH plugin returns after validation
    plan_after_validation = [
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
            "number": 13,  # This was created by the plan validator (max step was 12, so it created 13)
            "actionVerb": "FOREACH",
            "description": "Iterate over 'competitor_search_results' from step 1",
            "inputs": {
                "array": {"outputName": "competitor_search_results", "sourceStep": 1},
                "steps": {"value": [
                    {
                        "number": 2,
                        "actionVerb": "SCRAPE",
                        "description": "Scrape competitor data",
                        "inputs": {
                            "url": {"outputName": "item", "sourceStep": 0}  # 0 = parent FOREACH step
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
            "number": 12,
            "actionVerb": "REFLECT",
            "description": "Analyze the mission results",
            "inputs": {
                "scraped_data_dependency": {"outputName": "scraped_data", "sourceStep": 13}
            },
            "outputs": {
                "analysis": {"type": "object", "description": "Mission analysis"}
            }
        }
    ]
    
    print("📋 Plan after validation (what ACCOMPLISH returns):")
    for step in plan_after_validation:
        print(f"  Step {step['number']}: {step['actionVerb']}")
        if 'inputs' in step:
            for input_name, input_def in step['inputs'].items():
                if isinstance(input_def, dict) and 'sourceStep' in input_def:
                    print(f"    Input '{input_name}' references step {input_def['sourceStep']}")
    
    print("\n🔄 Simulating createFromPlan() execution:")
    result = simulate_createFromPlan(plan_after_validation)
    
    print(f"\n📊 Dependencies Resolution:")
    for info in result['dependencies_info']:
        print(f"  {info}")
    
    print(f"\n🎯 Issue Analysis:")
    print(f"  - Plan validator created FOREACH step 13")
    print(f"  - FOREACH step 13 references step 1 (SEARCH)")
    print(f"  - REFLECT step 12 references step 13 (FOREACH)")
    print(f"  - All steps get new UUIDs in createFromPlan()")
    print(f"  - Dependencies are resolved correctly because all referenced steps exist")
    
    # Check if there are any unresolved dependencies
    unresolved = [info for info in result['dependencies_info'] if '❌' in info]
    if unresolved:
        print(f"\n❌ UNRESOLVED DEPENDENCIES FOUND:")
        for info in unresolved:
            print(f"  {info}")
        return False
    else:
        print(f"\n✅ All dependencies resolved correctly!")
        return True

def test_real_world_scenario():
    """Test with the actual step IDs from the logs to reproduce the exact issue."""
    
    print("\n🌍 Testing Real-World Scenario from Logs")
    print("=" * 50)
    
    # This simulates the actual scenario from the logs where:
    # - SEARCH step executed with ID e4cd82ef-ede5-43b0-a4ac-a4dddc9caff3
    # - FOREACH step was created with dependency on step ID 91a4b7f1-2b4b-4707-8ab2-103e67f4a261
    
    # Simulate what happens when the plan validator works with an outdated plan
    # that has old step IDs, then creates new steps that reference those old IDs
    
    print("🔍 The issue occurs when:")
    print("  1. Original plan has SEARCH step with some ID")
    print("  2. Plan gets passed to validator with step numbers, not IDs")
    print("  3. Validator creates FOREACH step referencing step number 1")
    print("  4. createFromPlan() generates NEW UUIDs for all steps")
    print("  5. FOREACH dependency gets mapped to the NEW SEARCH UUID")
    print("  6. But execution shows FOREACH depending on OLD SEARCH UUID")
    
    print("\n💡 This suggests the issue is NOT in createFromPlan() itself,")
    print("   but in how the validated plan gets passed to createFromPlan().")
    print("   The FOREACH step somehow retains old step IDs instead of step numbers.")
    
    return True

if __name__ == "__main__":
    success1 = test_step_id_mismatch()
    success2 = test_real_world_scenario()
    
    if success1 and success2:
        print(f"\n🎉 Tests completed successfully!")
        print(f"\n🔧 Next steps:")
        print(f"  1. Investigate how FOREACH steps retain old step IDs")
        print(f"  2. Check if plan validator is working with plans that already have IDs")
        print(f"  3. Ensure FOREACH steps use step numbers, not step IDs")
    else:
        print(f"\n❌ Tests failed - need to investigate further")
