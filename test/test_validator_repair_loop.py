import unittest
import json
import uuid
from unittest.mock import MagicMock, patch
import os
import sys

# Add shared library path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../shared/python/lib')))
from plan_validator import PlanValidator, AccomplishError

class TestPlanValidatorRepairLoop(unittest.TestCase):

    def setUp(self):
        # A minimal valid plugin definition for SEARCH
        self.available_plugins = [
            {
                "verb": "SEARCH",
                "inputDefinitions": [{"name": "query", "type": "string", "required": True}],
                "outputDefinitions": [{"name": "results", "type": "array"}]
            }
        ]

    def test_repair_loop_recovers_from_llm_failure(self):
        """
        Verify that the validator loop can recover if the LLM repair fails once.
        """
        # Mock brain_call to fail on the first call, but succeed on the second
        mock_brain_call = MagicMock()
        
        # --- Plan Data ---
        step_1_id = str(uuid.uuid4())
        # This plan is invalid because SEARCH is missing the required 'query' input
        invalid_plan = [
            {
                "id": step_1_id,
                "actionVerb": "SEARCH",
                "description": "Search for something.",
                "inputs": {}, # Missing required 'query'
                "outputs": {"results": {"description": "The results", "type": "array"}}
            }
        ]
        
        # This is the corrected plan the LLM should return on the second attempt
        corrected_plan_json = json.dumps([
            {
                "id": step_1_id,
                "actionVerb": "SEARCH",
                "description": "Search for something.",
                "inputs": {
                    "query": {"value": "Default query", "valueType": "string"}
                },
                "outputs": {"results": {"description": "The results", "type": "array"}}
            }
        ])

        # Configure the mock to simulate failure then success
        mock_brain_call.side_effect = [
            AccomplishError("LLM simulation failed"), # 1st call fails
            corrected_plan_json                      # 2nd call succeeds
        ]

        validator = PlanValidator(brain_call=mock_brain_call, available_plugins=self.available_plugins) 
        
        # We expect this to succeed because the second repair attempt will work
        try:
            final_plan = validator.validate_and_repair(invalid_plan, "test goal", {})
            self.assertIsNotNone(final_plan)
            self.assertEqual(len(final_plan), 1)
            self.assertIn("query", final_plan[0]["inputs"])
            print("\nTest passed: Repair loop successfully recovered from a temporary LLM failure.")
        except AccomplishError as e:
            self.fail(f"Validation failed unexpectedly after LLM recovery. Error: {e}")

    def test_repair_loop_fails_after_all_retries(self):
        """
        Verify that the validator fails if the LLM repair fails on all attempts.
        """
        # Mock brain_call to always fail
        mock_brain_call = MagicMock(side_effect=AccomplishError("LLM simulation always fails"))
        
        # This plan is invalid because SEARCH is missing the required 'query' input
        invalid_plan = [
            {
                "id": str(uuid.uuid4()),
                "actionVerb": "SEARCH",
                "description": "Search for something.",
                "inputs": {}, # Missing required 'query'
                "outputs": {"results": {"description": "The results", "type": "array"}}
            }
        ]

        validator = PlanValidator(brain_call=mock_brain_call, available_plugins=self.available_plugins)
        validator.max_retries = 2 # Lower retries for faster test

        # We expect this to fail with an AccomplishError after all retries
        with self.assertRaises(AccomplishError) as context:
            validator.validate_and_repair(invalid_plan, "test goal", {})
        
        self.assertIn(f"Plan validation and repair failed after {validator.max_retries} attempts", str(context.exception))
        print("\nTest passed: Repair loop correctly failed after all retries were exhausted.")


if __name__ == '__main__':
    unittest.main()
