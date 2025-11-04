#!/usr/bin/env python3
"""
Test script to verify FOREACH validation works with proper step dependencies
"""

import sys
import json
sys.path.insert(0, 'shared/python/lib')

from plan_validator import PlanValidator

# Test plan with proper step dependencies (should trigger FOREACH)
test_plan = [
    {
        "number": 1,
        "actionVerb": "SEARCH",
        "description": "Search for competitors in the agentic AI space",
        "inputs": {
            "searchTerm": {
                "value": "agentic AI platforms competitors",
                "valueType": "string"
            }
        },
        "outputs": {
            "competitors": {
                "description": "List of competitors in the agentic AI space",
                "type": "array"
            }
        }
    },
    {
        "number": 2,
        "actionVerb": "SCRAPE",
        "description": "Scrape each competitor website for information",
        "inputs": {
            "url": {
                "sourceStep": 1,
                "outputName": "competitors"
            }
        },
        "outputs": {
            "competitor_info": {
                "description": "Information about each competitor",
                "type": "array"
            }
        }
    }
]

def test_foreach_detection():
    """Test that FOREACH is properly detected and inserted"""
    print("🧪 Testing FOREACH detection with proper step dependencies...")
    
    try:
        # Create validator
        validator = PlanValidator()
        
        # Mock inputs for validation
        mock_inputs = {
            'missionId': {'value': 'test-mission'},
            'availablePlugins': {'value': []},  # Empty for this test
            'postOffice_url': {'value': 'localhost:5020'},
            'brain_url': {'value': 'localhost:5070'},
            'librarian_url': {'value': 'localhost:5040'},
            'missioncontrol_url': {'value': 'localhost:5030'}
        }
        
        print(f"📋 Original plan has {len(test_plan)} steps")
        print("   Step 1: SEARCH -> competitors (array)")
        print("   Step 2: SCRAPE -> url input references step 1 competitors output")
        
        # Validate the plan
        result = validator.validate_and_repair(test_plan, "Test goal", mock_inputs)
        
        print(f"✅ Validation completed successfully")
        print(f"📋 Result plan has {len(result)} steps")
        
        # Check if FOREACH was inserted
        foreach_steps = [step for step in result if step.get('actionVerb') == 'FOREACH']
        if foreach_steps:
            print(f"🔄 Found {len(foreach_steps)} FOREACH step(s) - FOREACH insertion working!")
            for i, step in enumerate(foreach_steps):
                print(f"   FOREACH step {step.get('number')}: {step.get('description', 'No description')}")
        else:
            print("❌ No FOREACH steps found - validation may not be working correctly")
            
        # Show the final plan structure
        print("\n📋 Final plan structure:")
        for step in result:
            print(f"   Step {step.get('number')}: {step.get('actionVerb')} - {step.get('description', 'No description')[:50]}...")
            
        return len(foreach_steps) > 0
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_foreach_detection()
    if success:
        print("\n✅ FOREACH validation test PASSED")
    else:
        print("\n❌ FOREACH validation test FAILED")
    sys.exit(0 if success else 1)
