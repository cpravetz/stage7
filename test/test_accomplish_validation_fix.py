import unittest
import json
import sys
import os
from unittest.mock import patch

# Add the plugin directory to sys.path to allow direct import of main
plugin_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'capabilitiesmanager', 'src', 'plugins', 'ACCOMPLISH'))
sys.path.insert(0, plugin_dir)

from main import AccomplishOrchestrator

class TestAccomplishPlanValidationFix(unittest.TestCase):

    def setUp(self):
        self.orchestrator = AccomplishOrchestrator()

    @patch('main.call_brain')
    def test_plan_with_string_outputs(self, mock_call_brain):
        # This plan has outputs as strings, which was causing the error.
        plan = [
            {
                "number": 1,
                "actionVerb": "RESEARCH",
                "description": "Research the competitive landscape to identify 5 key competitors of stage7.",
                "inputs": {
                    "topic": {
                        "value": "competitive landscape of agentic AI platforms",
                        "valueType": "string"
                    }
                },
                "outputs": {
                    "competitors": "List of 5 key competitors"
                },
                "recommendedRole": "Researcher"
            }
        ]

        # Mock the brain call to return the plan
        mock_call_brain.return_value = json.dumps(plan)

        # Create the input for the orchestrator
        inputs = {
            "goal": {
                "value": "Create a plan to research competitors"
            },
            "__brain_auth_token": {
                "value": "fake_token"
            },
            "availablePlugins": []
        }
        
        # Convert inputs to the expected format for the orchestrator
        inputs_str = json.dumps([list(item) for item in inputs.items()])

        # Execute the orchestrator
        result_str = self.orchestrator.execute(inputs_str)
        result = json.loads(result_str)

        # Check that the execution was successful
        self.assertTrue(result[0]['success'])
        self.assertEqual(result[0]['name'], 'plan')
        self.assertEqual(result[0]['resultType'], 'plan')
        
        # Check that the output in the returned plan has been fixed
        validated_plan = result[0]['result']
        self.assertIn('outputs', validated_plan[0])
        self.assertIn('competitors', validated_plan[0]['outputs'])
        self.assertIn('description', validated_plan[0]['outputs']['competitors'])
        self.assertEqual(validated_plan[0]['outputs']['competitors']['description'], "List of 5 key competitors")

if __name__ == '__main__':
    unittest.main(argv=['first-arg-is-ignored'], exit=False)