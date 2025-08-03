#!/usr/bin/env python3
"""
Test script to verify the novel verb handling fixes with DIRECT_ANSWER and PLUGIN support.
"""

import json
import sys
import os

# Add the ACCOMPLISH plugin to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'services', 'capabilitiesmanager', 'src', 'plugins', 'ACCOMPLISH'))

def test_brain_response_interpretation():
    """Test that the NovelVerbHandler can interpret different Brain response types."""
    print("Testing Brain response interpretation...")
    
    try:
        from main import NovelVerbHandler
        handler = NovelVerbHandler()
        
        # Test 1: Plan response
        plan_response = '{"plan": [{"number": 1, "actionVerb": "SEARCH", "description": "Search for information"}]}'
        result_type, result_payload = handler._interpret_brain_response(plan_response)
        assert result_type == "plan"
        assert isinstance(result_payload, list)
        print("✓ Plan response interpreted correctly")
        
        # Test 2: Direct answer response
        direct_response = '{"direct_answer": {"audit_report": "Technical audit completed", "status": "complete"}}'
        result_type, result_payload = handler._interpret_brain_response(direct_response)
        assert result_type == "direct_answer"
        assert isinstance(result_payload, dict)
        print("✓ Direct answer response interpreted correctly")
        
        # Test 3: Plugin recommendation response
        plugin_response = '{"plugin": {"id": "audit_plugin", "verb": "audit", "description": "Performs technical audits"}}'
        result_type, result_payload = handler._interpret_brain_response(plugin_response)
        assert result_type == "plugin"
        assert isinstance(result_payload, dict)
        print("✓ Plugin response interpreted correctly")
        
        # Test 4: Invalid response
        try:
            invalid_response = '{"unknown_type": "some data"}'
            handler._interpret_brain_response(invalid_response)
            assert False, "Should have raised an exception"
        except Exception as e:
            assert "No recognized result type" in str(e)
            print("✓ Invalid response properly rejected")
        
        print("✓ All Brain response interpretation tests passed!")
        return True
        
    except Exception as e:
        print(f"✗ Brain response interpretation test failed: {e}")
        return False

def test_improved_prompt_construction():
    """Test that the improved prompt includes all three options."""
    print("\nTesting improved prompt construction...")
    
    try:
        from main import NovelVerbHandler
        handler = NovelVerbHandler()
        
        verb_info = {
            'verb': 'ConductTechnicalAudit',
            'description': 'Review codebase for technical issues',
            'context': 'Review codebase for technical issues',
            'available_inputs': '{"codebase": "stage7"}'
        }
        
        # Mock the _call_brain function to capture the prompt
        captured_prompt = None
        
        def mock_call_brain(prompt, response_type):
            nonlocal captured_prompt
            captured_prompt = prompt
            return '{"plan": [{"number": 1, "actionVerb": "SEARCH", "description": "Search for issues"}]}'
        
        # Replace the function temporarily
        import main
        original_call_brain = main._call_brain
        main._call_brain = mock_call_brain
        
        try:
            handler._ask_brain_for_verb_handling(verb_info)
            
            # Verify the prompt contains all three options
            assert 'Create a Plan' in captured_prompt
            assert 'Provide Direct Answer' in captured_prompt
            assert 'Recommend Plugin' in captured_prompt
            assert '"plan":' in captured_prompt
            assert '"direct_answer":' in captured_prompt
            assert '"plugin":' in captured_prompt
            
            print("✓ Prompt includes all three response options")
            print("✓ Improved prompt construction test passed!")
            return True
            
        finally:
            # Restore original function
            main._call_brain = original_call_brain
        
    except Exception as e:
        print(f"✗ Improved prompt construction test failed: {e}")
        return False

def test_full_novel_verb_handling():
    """Test the complete novel verb handling flow."""
    print("\nTesting full novel verb handling flow...")
    
    try:
        from main import NovelVerbHandler, SharedValidator
        
        handler = NovelVerbHandler()
        validator = SharedValidator()
        
        # Test input
        inputs = {
            'novel_actionVerb': {
                'value': {
                    'verb': 'TestAudit',
                    'description': 'Perform a test audit',
                    'context': 'Perform a test audit',
                    'inputValues': {'target': 'test system'},
                    'outputs': {'report': 'string'}
                }
            }
        }
        
        # Mock the Brain call to return a direct answer
        def mock_call_brain(prompt, response_type):
            return '{"direct_answer": {"report": "Audit completed successfully", "status": "complete"}}'
        
        import main
        original_call_brain = main._call_brain
        main._call_brain = mock_call_brain
        
        try:
            result = handler.handle(inputs, validator)
            result_data = json.loads(result)
            
            assert result_data[0]['success'] == True
            assert result_data[0]['resultType'] == 'direct_answer'
            assert 'report' in result_data[0]['result']
            
            print("✓ Full novel verb handling with direct answer works")
            
            # Test with plugin recommendation
            def mock_call_brain_plugin(prompt, response_type):
                return '{"plugin": {"id": "test_audit_plugin", "verb": "TestAudit", "description": "Plugin for test audits"}}'
            
            main._call_brain = mock_call_brain_plugin
            
            result = handler.handle(inputs, validator)
            result_data = json.loads(result)
            
            assert result_data[0]['success'] == True
            assert result_data[0]['resultType'] == 'plugin'
            assert 'pluginDesignDoc' in result_data[0]
            
            print("✓ Full novel verb handling with plugin recommendation works")
            print("✓ Full novel verb handling test passed!")
            return True
            
        finally:
            main._call_brain = original_call_brain
        
    except Exception as e:
        print(f"✗ Full novel verb handling test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("Running Novel Verb Handling Fix Tests v2")
    print("=" * 50)
    
    tests = [
        test_brain_response_interpretation,
        test_improved_prompt_construction,
        test_full_novel_verb_handling
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print("\n" + "=" * 50)
    print(f"Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✓ All tests passed! The novel verb handling fixes with DIRECT_ANSWER and PLUGIN support are working correctly.")
        return 0
    else:
        print("✗ Some tests failed. Please review the fixes.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
