import unittest
import json
from unittest.mock import patch, MagicMock
import importlib.util
import sys
import os

# Add the plugin directory to sys.path to allow direct import of main
# Assuming this test file is in services/capabilitiesmanager/src/plugins/ACCOMPLISH/
plugin_dir = os.path.dirname(os.path.abspath(__file__))

# Import the class from main.py
# This attempts to import main as if it's a module in the current path.
try:
    from main import AccomplishPlugin, PluginParameterType, logger as main_logger
except ImportError:
    # Fallback if the above fails (e.g. when runner changes CWD or path issues)
    # This is more robust for various test execution environments.
    spec = importlib.util.spec_from_file_location("main", os.path.join(plugin_dir, "main.py"))
    if spec and spec.loader:
        main_module = importlib.util.module_from_spec(spec)
        sys.modules["main"] = main_module
        spec.loader.exec_module(main_module)
        AccomplishPlugin = main_module.AccomplishPlugin
        PluginParameterType = main_module.PluginParameterType
        main_logger = main_module.logger # Access logger from the loaded module
    else:
        raise ImportError("Could not load AccomplishPlugin from main.py")


class TestAccomplishPlanValidation(unittest.TestCase):

    def setUp(self):
        self.plugin = AccomplishPlugin()
        # VERB_SCHEMAS is a class attribute, so it's directly accessible via self.plugin.VERB_SCHEMAS

    def test_valid_plan(self):
        plan_data = [
            {"number": 1, "verb": "SEARCH", "description": "Search for cats", "inputs": {"searchTerm": "cats"}, "outputs": {"results": "list of cat links"}},
            {"number": 2, "verb": "SCRAPE", "description": "Scrape a cat site", "inputs": {"url": "http://example.com/cats", "selector": "h1", "attribute": "text", "limit": 1}, "outputs": {"title": "cat site title"}}
        ]
        self.assertIsNone(self.plugin.validate_plan_data(plan_data), "Valid plan should result in no error message.")

    def test_search_missing_searchTerm(self):
        plan_data = [{"number": 1, "verb": "SEARCH", "inputs": {}}] # searchTerm missing
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with missing searchTerm should produce an error.")
        self.assertIn("'SEARCH' (step 1) missing required input 'searchTerm'", error)

    def test_search_empty_searchTerm(self):
        plan_data = [{"number": 1, "verb": "SEARCH", "inputs": {"searchTerm": ""}}] # searchTerm empty
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with empty searchTerm should produce an error.")
        self.assertIn("'SEARCH' (step 1) has empty or null required input 'searchTerm'", error)

    def test_search_none_searchTerm(self):
        plan_data = [{"number": 1, "verb": "SEARCH", "inputs": {"searchTerm": None}}] # searchTerm is None
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with None searchTerm should produce an error.")
        self.assertIn("'SEARCH' (step 1) has empty or null required input 'searchTerm'", error)

    def test_scrape_missing_url(self):
        plan_data = [{"number": 1, "verb": "SCRAPE", "inputs": {"selector": "h1", "attribute": "text", "limit": 1}}] # url missing
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with SCRAPE missing url should produce an error.")
        self.assertIn("'SCRAPE' (step 1) missing required input 'url'", error)

    def test_inputs_not_a_dict(self):
        plan_data = [{"number": 1, "verb": "SEARCH", "inputs": "not_a_dict"}]
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with non-dict inputs should produce an error.")
        self.assertIn("Step 1 ('SEARCH') has invalid 'inputs' field (must be a dictionary)", error)

    def test_inputs_field_entirely_missing(self):
        plan_data = [{"number": 1, "verb": "SEARCH", "description": "Search for dogs"}] # 'inputs' key itself is missing
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with step missing 'inputs' field entirely should produce an error.")
        self.assertIn("Step 1 ('SEARCH') has invalid 'inputs' field (must be a dictionary)", error) # Current validation treats missing 'inputs' as invalid dict

    @patch.object(main_logger, 'warning') # Mocking the logger used in main.py
    def test_unknown_verb_is_not_strictly_validated(self, mock_logger_warning):
        plan_data = [{"number": 1, "verb": "MY_NEW_VERB", "inputs": {"anyParam": "anyValue"}}]
        self.assertIsNone(self.plugin.validate_plan_data(plan_data), "Plan with unknown verb should not fail validation but log a warning.")
        mock_logger_warning.assert_called_once_with("Verb 'MY_NEW_VERB' at step 1 is not in VERB_SCHEMAS. Skipping detailed input validation for this verb.")

    def test_step_not_a_dict(self):
        plan_data = ["this_is_a_string_not_a_step_dict"]
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan where a step is not a dictionary should produce an error.")
        self.assertIn("Step at index 0 is not a dictionary", error)

    def test_verb_missing_in_step(self):
        plan_data = [{"number": 1, "inputs": {"someInput": "someValue"}}] # 'verb' key missing
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with step missing 'verb' field should produce an error.")
        self.assertIn("Invalid or missing verb for step at index 0", error)

    def test_verb_not_a_string(self):
        plan_data = [{"number": 1, "verb": 123, "inputs": {"someInput": "someValue"}}] # 'verb' is not a string
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan with step where 'verb' is not a string should produce an error.")
        self.assertIn("Invalid or missing verb for step at index 0", error)

    def test_plan_data_not_a_list(self):
        plan_data = {"not": "a list"}
        error = self.plugin.validate_plan_data(plan_data)
        self.assertIsNotNone(error, "Plan data that is not a list should produce an error.")
        self.assertEqual(error, "Plan data is not a list.")

    def test_file_operation_content_optional_check(self):
        # FILE_OPERATION schema lists 'content' as optional.
        # If operation is 'read', content is not needed.
        plan_data_read = [{"number": 1, "verb": "FILE_OPERATION", "inputs": {"path": "/foo.txt", "operation": "read"}}]
        self.assertIsNone(self.plugin.validate_plan_data(plan_data_read), "FILE_OPERATION with 'read' and no 'content' should be valid.")

        # If operation is 'write', prompt says content is required.
        # Current schema validation for required fields is basic and won't catch this nuance
        # This test confirms 'content' is not *always* required by validate_plan_data based on current schema.
        # The prompt guides the LLM, but schema validation is the safety net.
        plan_data_write_no_content = [{"number": 1, "verb": "FILE_OPERATION", "inputs": {"path": "/foo.txt", "operation": "write"}}]
        self.assertIsNone(self.plugin.validate_plan_data(plan_data_write_no_content), "FILE_OPERATION with 'write' and no 'content' currently passes schema validation as content is optional in schema.")

        plan_data_write_with_content = [{"number": 1, "verb": "FILE_OPERATION", "inputs": {"path": "/foo.txt", "operation": "write", "content": "hello"}}]
        self.assertIsNone(self.plugin.validate_plan_data(plan_data_write_with_content))


    # Test the execute method's handling of validation error
    @patch.object(AccomplishPlugin, 'query_brain') # Mock query_brain
    def test_execute_returns_error_if_validation_fails(self, mock_query_brain):
        # Setup a plan that will fail validation (e.g., SEARCH missing searchTerm)
        invalid_plan_json_from_llm = json.dumps({
            "type": "PLAN",
            "plan": [{"number": 1, "verb": "SEARCH", "inputs": {}}]
        })
        mock_query_brain.return_value = invalid_plan_json_from_llm

        # Inputs for the execute method
        inputs_map = {"goal": {"inputValue": "test goal"}, "token": {"inputValue": "fake_token"}}

        result = self.plugin.execute(inputs_map)

        self.assertEqual(len(result), 1, "Execute should return a single error PluginOutput.")
        output = result[0]
        self.assertFalse(output['success'], "Output success should be False on validation error.")
        self.assertEqual(output['name'], 'plan_validation_error', "Error name should indicate plan validation.")
        self.assertEqual(output['resultType'], PluginParameterType.ERROR, "Result type should be ERROR.")
        self.assertIn("'SEARCH' (step 1) missing required input 'searchTerm'", output['error'], "Error message should detail the validation failure.")
        self.assertIn("'SEARCH' (step 1) missing required input 'searchTerm'", output['resultDescription'])
        mock_query_brain.assert_called_once() # Ensure brain was queried

    @patch.object(AccomplishPlugin, 'query_brain')
    @patch.object(AccomplishPlugin, 'validate_plan_data') # Mock validate_plan_data directly
    def test_execute_uses_validate_plan_data_mocked(self, mock_validate_plan_data, mock_query_brain):
        mock_query_brain.return_value = json.dumps({
            "type": "PLAN",
            "plan": [{"verb": "SEARCH", "inputs": {"searchTerm": "valid"}}] # Data for validate_plan_data to check
        })
        # Simulate validation failure from the mocked method
        mock_validate_plan_data.return_value = "Mocked Validation Error: Input missing."

        inputs_map = {"goal": {"inputValue": "test goal"}, "token": {"inputValue": "fake_token"}}
        result = self.plugin.execute(inputs_map)

        self.assertEqual(len(result), 1)
        output = result[0]
        self.assertFalse(output['success'])
        self.assertEqual(output['name'], 'plan_validation_error')
        self.assertEqual(output['error'], "Mocked Validation Error: Input missing.")
        mock_validate_plan_data.assert_called_once() # Ensure our validator was called


if __name__ == '__main__':
    # This allows running the tests directly from the file.
    # unittest.main() can be problematic in some environments if not run via a test runner.
    # Using a specific TestLoader and TestRunner can be more robust if issues arise.
    suite = unittest.TestLoader().loadTestsFromTestCase(TestAccomplishPlanValidation)
    unittest.TextTestRunner(verbosity=2).run(suite)
