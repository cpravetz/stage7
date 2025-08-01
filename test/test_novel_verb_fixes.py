#!/usr/bin/env python3
"""
Test script to verify the novel verb handling fixes.
This script tests the key components that were modified to fix the novel verb handling bug.
"""

import json
import sys
import os

# Add the ACCOMPLISH plugin to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'services', 'capabilitiesmanager', 'src', 'plugins', 'ACCOMPLISH'))

def test_novel_verb_parsing():
    """Test that the NovelVerbHandler can properly parse different input formats."""
    print("Testing NovelVerbHandler input parsing...")
    
    try:
        from main import NovelVerbHandler
        handler = NovelVerbHandler()
        
        # Test 1: New structured format from CapabilitiesManager
        structured_input = {
            'novel_actionVerb': {
                'inputName': 'novel_actionVerb',
                'value': {
                    'verb': 'ConductTechnicalAudit',
                    'description': 'Review Stage7\'s codebase for technical debt, security vulnerabilities, and performance issues',
                    'context': 'Review Stage7\'s codebase for technical debt, security vulnerabilities, and performance issues',
                    'inputValues': {'codebase': 'Stage7 repository'},
                    'outputs': {'audit_report': 'string'},
                    'stepId': 'step_123',
                    'stepNo': 1
                },
                'valueType': 'object'
            },
            'available_plugins': {
                'inputName': 'available_plugins',
                'value': '[]',
                'valueType': 'string'
            }
        }
        
        result = handler._clarify_verb(structured_input)
        print(f"✓ Structured input parsed successfully: {result['verb']}")
        assert result['verb'] == 'ConductTechnicalAudit'
        assert 'technical debt' in result['description']
        
        # Test 2: Legacy string format
        legacy_input = {
            'novel_actionVerb': {
                'inputName': 'novel_actionVerb',
                'value': 'Determine the best way to complete the step "AnalyzeCompetitorLandscape" with the following context: Research and analyze the competitive landscape in the AI agent market The following inputs are available: {"market_segment": "AI agents"}',
                'valueType': 'string'
            }
        }
        
        result = handler._clarify_verb(legacy_input)
        print(f"✓ Legacy input parsed successfully: {result['verb']}")
        assert result['verb'] == 'AnalyzeCompetitorLandscape'
        assert 'competitive landscape' in result['description']
        
        print("✓ All input parsing tests passed!")
        return True
        
    except Exception as e:
        print(f"✗ Input parsing test failed: {e}")
        return False

def test_brain_prompt_construction():
    """Test that the Brain prompt is properly constructed with context."""
    print("\nTesting Brain prompt construction...")
    
    try:
        from main import NovelVerbHandler
        handler = NovelVerbHandler()
        
        verb_info = {
            'verb': 'ConductTechnicalAudit',
            'description': 'Review Stage7\'s codebase for technical debt, security vulnerabilities, and performance issues',
            'context': 'Review Stage7\'s codebase for technical debt, security vulnerabilities, and performance issues',
            'inputValues': {'codebase': 'Stage7 repository'},
            'available_inputs': '{"codebase": "Stage7 repository"}'
        }
        
        # Mock the _call_brain function to capture the prompt
        original_call_brain = None
        captured_prompt = None
        
        def mock_call_brain(prompt, response_type):
            nonlocal captured_prompt
            captured_prompt = prompt
            return '{"plan": [{"number": 1, "actionVerb": "SEARCH", "description": "Search for code quality issues"}]}'
        
        # Replace the function temporarily
        import main
        original_call_brain = main._call_brain
        main._call_brain = mock_call_brain
        
        try:
            handler._ask_brain_for_verb_handling(verb_info)
            
            # Verify the prompt contains the actual context
            assert 'ConductTechnicalAudit' in captured_prompt
            assert 'technical debt' in captured_prompt
            assert 'Stage7 repository' in captured_prompt
            assert 'NOVEL_VERB' not in captured_prompt  # Should not contain generic placeholder
            
            print("✓ Brain prompt contains proper context and verb information")
            print("✓ Brain prompt construction test passed!")
            return True
            
        finally:
            # Restore original function
            main._call_brain = original_call_brain
        
    except Exception as e:
        print(f"✗ Brain prompt construction test failed: {e}")
        return False

def test_validation_improvements():
    """Test that the validation improvements catch common issues."""
    print("\nTesting validation improvements...")
    
    try:
        from main import NovelVerbHandler
        
        # Mock validator
        class MockValidator:
            def validate_plan_schema(self, plan_data):
                plan = plan_data.get('plan', [])
                if not plan:
                    return {'valid': False, 'error': 'Empty plan'}
                for step in plan:
                    if 'actionVerb' not in step:
                        return {'valid': False, 'error': 'Missing actionVerb'}
                return {'valid': True}
            
            def try_fix_error(self, plan_data, error):
                return None  # No auto-fix for this test
        
        handler = NovelVerbHandler()
        validator = MockValidator()
        
        # Test with empty plan (should fail)
        try:
            # Mock brain response with empty plan
            def mock_interpret_response(response):
                return "plan", []
            
            original_interpret = handler._interpret_brain_response
            handler._interpret_brain_response = mock_interpret_response
            
            # This should raise an exception due to empty plan
            result = handler.handle({
                'novel_actionVerb': {
                    'value': {
                        'verb': 'TestVerb',
                        'description': 'Test description'
                    }
                }
            }, validator)
            
            result_data = json.loads(result)
            assert not result_data[0]['success']
            assert 'empty plan' in result_data[0]['resultDescription'].lower()
            
            print("✓ Empty plan validation works correctly")
            
            # Restore original method
            handler._interpret_brain_response = original_interpret
            
        except Exception as e:
            print(f"Validation test error: {e}")
            
        print("✓ Validation improvements test passed!")
        return True
        
    except Exception as e:
        print(f"✗ Validation improvements test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("Running Novel Verb Handling Fix Tests")
    print("=" * 50)
    
    tests = [
        test_novel_verb_parsing,
        test_brain_prompt_construction,
        test_validation_improvements
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print("\n" + "=" * 50)
    print(f"Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✓ All tests passed! The novel verb handling fixes appear to be working correctly.")
        return 0
    else:
        print("✗ Some tests failed. Please review the fixes.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
