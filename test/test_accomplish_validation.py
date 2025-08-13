
import unittest
import json
import sys
import os

# Add the plugin directory to sys.path to allow direct import of main
plugin_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'services', 'capabilitiesmanager', 'src', 'plugins', 'ACCOMPLISH'))
sys.path.insert(0, plugin_dir)

from main import RobustMissionPlanner

class TestAccomplishPlanValidation(unittest.TestCase):

    def setUp(self):
        self.planner = RobustMissionPlanner()

    def test_valid_plan(self):
        plan = [
            {
                "number": 1,
                "actionVerb": "SEARCH",
                "description": "Search for cats",
                "inputs": {
                    "searchTerm": {
                        "value": "cats",
                        "valueType": "string"
                    }
                },
                "outputs": {
                    "results": "list of cat links"
                },
                "dependencies": {}
            }
        ]
        result = self.planner._validate_plan(plan)
        self.assertTrue(result['valid'])
        self.assertEqual(len(result['errors']), 0)

    def test_input_not_object(self):
        plan = [
            {
                "number": 1,
                "actionVerb": "SEARCH",
                "description": "Search for cats",
                "inputs": {
                    "searchTerm": "cats"
                },
                "outputs": {
                    "results": "list of cat links"
                },
                "dependencies": {}
            }
        ]
        result = self.planner._validate_plan(plan)
        self.assertFalse(result['valid'])
        self.assertIn("Step 1: Input 'searchTerm' must be an object", result['errors'])

    def test_input_with_unknown_property(self):
        plan = [
            {
                "number": 1,
                "actionVerb": "SEARCH",
                "description": "Search for cats",
                "inputs": {
                    "searchTerm": {
                        "value": "cats",
                        "valueType": "string",
                        "unknown": "property"
                    }
                },
                "outputs": {
                    "results": "list of cat links"
                },
                "dependencies": {}
            }
        ]
        result = self.planner._validate_plan(plan)
        self.assertFalse(result['valid'])
        self.assertIn("Step 1: Input 'searchTerm' has unknown property 'unknown'", result['errors'])

    def test_input_missing_value_type(self):
        plan = [
            {
                "number": 1,
                "actionVerb": "SEARCH",
                "description": "Search for cats",
                "inputs": {
                    "searchTerm": {
                        "value": "cats"
                    }
                },
                "outputs": {
                    "results": "list of cat links"
                },
                "dependencies": {}
            }
        ]
        result = self.planner._validate_plan(plan)
        self.assertFalse(result['valid'])
        self.assertIn("Step 1: Input 'searchTerm' missing 'valueType'", result['errors'])

    def test_input_missing_value_and_output_name(self):
        plan = [
            {
                "number": 1,
                "actionVerb": "SEARCH",
                "description": "Search for cats",
                "inputs": {
                    "searchTerm": {
                        "valueType": "string"
                    }
                },
                "outputs": {
                    "results": "list of cat links"
                },
                "dependencies": {}
            }
        ]
        result = self.planner._validate_plan(plan)
        self.assertFalse(result['valid'])
        self.assertIn("Step 1: Input 'searchTerm' missing both 'value' and 'outputName'", result['errors'])

if __name__ == '__main__':
    unittest.main()
