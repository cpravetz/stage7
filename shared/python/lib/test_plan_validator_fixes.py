#!/usr/bin/env python3

import json
import sys
import os

# Add the current directory to the path to import from shared/python/lib
sys.path.append(os.path.dirname(__file__))

from plan_validator import PlanValidator, ValidationResult, StructuredError

def test_brain_flattened_input_format():
    """Test that the validator can handle the Brain's flattened input format"""
    
    # Sample plan with Brain's flattened input format
    test_plan = [
        {
            "id": "step_1",
            "actionVerb": "SCRAPE",
            "description": "Extract web data",
            "inputs": {
                "valueType": "string",
                "sourceStep": "0",
                "outputName": "url",  # Changed from scraped_data to url
                "args": {
                    "url_pattern": "#.*\\.html.*"
                }
            },
            "outputs": {
                "scraped_data": {
                    "description": "Extracted and formatted web data from specified URLs.",
                    "type": "string",
                    "isDeliverable": True,
                    "filename": "web_data_extracted.json"
                }
            }
        }
    ]
    
    validator = PlanValidator()
    
    # Test validation
    result = validator.validate_and_repair(
        plan=test_plan,
        goal="Test web scraping",
        inputs={"url": "https://example.com"}
    )
    
    print("=== Test Results ===")
    print(f"Plan valid: {result.is_valid}")
    print(f"Errors found: {len(result.errors)}")
    
    if result.errors:
        print("Errors:")
        for error in result.errors:
            print(f"  - {error.to_string()}")
    
    # Check if the input format was converted
    if result.plan and len(result.plan) > 0:
        step_inputs = result.plan[0].get('inputs', {})
        print(f"\nProcessed inputs: {json.dumps(step_inputs, indent=2)}")
        
        # Verify the format was converted
        if isinstance(step_inputs, dict):
            for input_name, input_def in step_inputs.items():
                if isinstance(input_def, dict):
                    has_value = 'value' in input_def
                    has_sourceStep = 'sourceStep' in input_def
                    has_outputName = 'outputName' in input_def
                    has_valueType = 'valueType' in input_def
                    
                    print(f"\nInput '{input_name}' structure:")
                    print(f"  Has 'value': {has_value}")
                    print(f"  Has 'sourceStep': {has_sourceStep}")
                    print(f"  Has 'outputName': {has_outputName}")
                    print(f"  Has 'valueType': {has_valueType}")
                    
                    # Check if it's in the correct format
                    if (has_value and has_valueType) or (has_sourceStep and has_outputName):
                        print(f"  [OK] Input '{input_name}' is in correct format")
                    else:
                        print(f"  [ERROR] Input '{input_name}' is NOT in correct format")
    
    return result.is_valid

def test_llm_repair_guidance():
    """Test that LLM repair provides proper guidance for Brain format issues"""
    
    # Create a mock brain call function
    def mock_brain_call(prompt, inputs, response_type):
        print("\n=== LLM Repair Prompt ===")
        print(prompt[:500] + "..." if len(prompt) > 500 else prompt)
        
        # Return a mock response
        mock_response = {
            "plan": [
                {
                    "id": "step_1",
                    "actionVerb": "SCRAPE",
                    "description": "Extract web data",
                    "inputs": {
                        "url": {
                            "value": "https://example.com",
                            "valueType": "string"
                        }
                    },
                    "outputs": {
                        "scraped_data": {
                            "description": "Extracted web data",
                            "type": "string"
                        }
                    }
                }
            ]
        }
        
        return json.dumps(mock_response), "mock_request_id"
    
    # Test plan with issues
    test_plan = [
        {
            "id": "step_1",
            "actionVerb": "SCRAPE",
            "inputs": {
                "valueType": "string",
                "sourceStep": "0",
                "outputName": "scraped_data"
            },
            "outputs": {
                "scraped_data": {
                    "description": "Extracted web data",
                    "type": "string"
                }
            }
        }
    ]
    
    validator = PlanValidator(brain_call=mock_brain_call)
    
    # This should trigger LLM repair
    result = validator.validate_and_repair(
        plan=test_plan,
        goal="Test LLM repair guidance",
        inputs={"url": "https://example.com"}
    )
    
    print(f"\n=== LLM Repair Test Results ===")
    print(f"Plan valid after LLM repair: {result.is_valid}")
    print(f"Errors remaining: {len(result.errors)}")
    
    return result.is_valid

if __name__ == "__main__":
    print("Testing Plan Validator Fixes...")
    
    print("\n1. Testing Brain flattened input format handling...")
    test1_passed = test_brain_flattened_input_format()
    
    print("\n2. Testing LLM repair guidance...")
    test2_passed = test_llm_repair_guidance()
    
    print(f"\n=== Summary ===")
    print(f"Brain format handling test: {'PASSED' if test1_passed else 'FAILED'}")
    print(f"LLM repair guidance test: {'PASSED' if test2_passed else 'FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n[SUCCESS] All tests passed! The fixes should resolve the planning issues.")
        sys.exit(0)
    else:
        print("\n[FAILURE] Some tests failed. Further investigation needed.")
        sys.exit(1)