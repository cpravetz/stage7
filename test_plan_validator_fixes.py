#!/usr/bin/env python3
"""
Test script to verify the plan validator fixes for unique step numbers and FOREACH wrapping.
"""

import sys
import os
import json

# Import from the installed shared library package
try:
    from stage7_shared_lib import PlanValidator
except ImportError:
    # Fallback to direct import for development/testing
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'shared', 'python', 'lib'))
    from plan_validator import PlanValidator

def test_unique_step_numbers():
    """Test that duplicate step numbers are detected."""
    print("Testing unique step number validation...")
    
    # Create a plan with duplicate step numbers
    plan_with_duplicates = [
        {
            "number": 1,
            "actionVerb": "SEARCH",
            "description": "Search for competitors",
            "inputs": {"query": {"value": "competitors"}},
            "outputs": {"results": "array"}
        },
        {
            "number": 2,
            "actionVerb": "FOREACH",
            "description": "Process each competitor",
            "inputs": {
                "array": {"outputName": "results", "sourceStep": 1},
                "steps": {
                    "value": [
                        {
                            "number": 1,  # Duplicate step number!
                            "actionVerb": "SCRAPE",
                            "description": "Scrape competitor data",
                            "inputs": {"url": {"outputName": "item", "sourceStep": 2}},
                            "outputs": {"data": "string"}
                        }
                    ]
                }
            },
            "outputs": {"processed": "array"}
        }
    ]
    
    # Mock available plugins
    available_plugins = [
        {"actionVerb": "SEARCH", "inputDefinitions": [], "outputDefinitions": [{"name": "results", "type": "array"}]},
        {"actionVerb": "FOREACH", "inputDefinitions": [], "outputDefinitions": [{"name": "processed", "type": "array"}]},
        {"actionVerb": "SCRAPE", "inputDefinitions": [], "outputDefinitions": [{"name": "data", "type": "string"}]}
    ]
    
    validator = PlanValidator()
    result = validator._validate_plan(plan_with_duplicates, available_plugins)
    
    print(f"Validation result: {result}")
    
    # Check if duplicate step numbers were detected
    duplicate_errors = [error for error in result['errors'] if 'Duplicate step number' in error]
    if duplicate_errors:
        print("✅ SUCCESS: Duplicate step numbers detected correctly")
        for error in duplicate_errors:
            print(f"   - {error}")
    else:
        print("❌ FAILURE: Duplicate step numbers not detected")
        print(f"   All errors: {result['errors']}")
    
    return len(duplicate_errors) > 0

def test_foreach_wrapping_prevention():
    """Test that FOREACH steps are not wrapped in another FOREACH."""
    print("\nTesting FOREACH wrapping prevention...")
    
    # Create a plan where a FOREACH step has a type mismatch (should not be wrapped)
    plan_with_foreach = [
        {
            "number": 1,
            "actionVerb": "SEARCH",
            "description": "Search for data",
            "inputs": {"query": {"value": "test"}},
            "outputs": {"results": "array"}
        },
        {
            "number": 2,
            "actionVerb": "FOREACH",  # This is already a FOREACH
            "description": "Process each item",
            "inputs": {
                "array": {"outputName": "results", "sourceStep": 1},  # array -> array (type mismatch for demo)
                "steps": {"value": []}
            },
            "outputs": {"processed": "array"}
        }
    ]
    
    # Mock available plugins with type mismatch to trigger wrapping logic
    available_plugins = [
        {"actionVerb": "SEARCH", "inputDefinitions": [], "outputDefinitions": [{"name": "results", "type": "array"}]},
        {
            "actionVerb": "FOREACH", 
            "inputDefinitions": [
                {"name": "array", "required": True, "valueType": "string"}  # Expects string but gets array
            ], 
            "outputDefinitions": [{"name": "processed", "type": "array"}]
        }
    ]
    
    validator = PlanValidator()
    result = validator._validate_plan(plan_with_foreach, available_plugins)
    
    print(f"Validation result: {result}")
    
    # Check if FOREACH was NOT added to wrappable_errors (since it's already a FOREACH)
    wrappable_foreach = [error for error in result.get('wrappable_errors', []) if error.get('step_number') == 2]
    if not wrappable_foreach:
        print("✅ SUCCESS: FOREACH step was not marked for wrapping")
    else:
        print("❌ FAILURE: FOREACH step was incorrectly marked for wrapping")
        print(f"   Wrappable errors: {result.get('wrappable_errors', [])}")
    
    return len(wrappable_foreach) == 0

def main():
    """Run all tests."""
    print("Running Plan Validator Fix Tests")
    print("=" * 50)
    
    test1_passed = test_unique_step_numbers()
    test2_passed = test_foreach_wrapping_prevention()
    
    print("\n" + "=" * 50)
    print("Test Results:")
    print(f"✅ Unique step number validation: {'PASSED' if test1_passed else 'FAILED'}")
    print(f"✅ FOREACH wrapping prevention: {'PASSED' if test2_passed else 'FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n🎉 All tests PASSED!")
        return 0
    else:
        print("\n❌ Some tests FAILED!")
        return 1

if __name__ == "__main__":
    sys.exit(main())
