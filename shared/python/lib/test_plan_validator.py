#!/usr/bin/env python3

import json
import pytest
from plan_validator import PlanValidator, AccomplishError

# Mock the call_brain function as it's not needed for this test
def mock_call_brain(prompt: str, inputs: dict, response_type: str = "json") -> str:
    return "{}"

# Sample plugins for the validator, mimicking real definitions
sample_plugins = [
    {
        "actionVerb": "SEARCH",
        "outputDefinitions": [
            {"name": "results", "type": "array", "description": "A list of search results."}
        ]
    },
    {
        "actionVerb": "GET_DETAILS",
        "inputDefinitions": [
            {"name": "url", "type": "string", "required": True, "description": "The URL to fetch details from."}
        ],
        "outputDefinitions": [
            {"name": "details", "type": "object", "description": "The details fetched."}
        ]
    },
    {
        "actionVerb": "FOREACH",
        "inputDefinitions": [
            {"name": "list", "type": "array", "required": True},
        ],
        "outputDefinitions": [
            {"name": "item", "type": "any"} # The item from the list
        ]
    }
]

def test_foreach_wrapping_on_array_to_string_mismatch():
    """
    Tests if the validator correctly wraps a step in a FOREACH loop
    when an array output is fed into an input that expects a string.
    """
    validator = PlanValidator(brain_call=mock_call_brain)

    initial_plan = [
        {
            "number": 1,
            "actionVerb": "SEARCH",
            "description": "Search for a list of items.",
            "inputs": {},
            "outputs": {"results": "A list of item URLs"} # The plan incorrectly assumes a custom output name is enough
        },
        {
            "number": 2,
            "actionVerb": "GET_DETAILS",
            "description": "Get details for a single item URL.",
            "inputs": {
                "url": {
                    "outputName": "results",
                    "sourceStep": 1
                }
            },
            "outputs": {"details": "The details of the item."}
        }
    ]
    
    inputs = {
        "availablePlugins": {
            "value": sample_plugins
        }
    }

    repaired_plan = validator.validate_and_repair(initial_plan, "test goal", inputs)

    # Assertions
    assert len(repaired_plan) == 2, "Plan should still have 2 main steps"
    
    search_step = repaired_plan[0]
    assert search_step['actionVerb'] == "SEARCH"

    # Check that the second step is now a FOREACH loop
    foreach_step = repaired_plan[1]
    assert foreach_step['actionVerb'] == "FOREACH"
    assert foreach_step['number'] == 2
    
    # Check that the FOREACH loop is iterating over the correct list
    assert foreach_step['inputs']['list']['outputName'] == 'results'
    assert foreach_step['inputs']['list']['sourceStep'] == 1
    
    # Check the sub-plan within the FOREACH loop
    assert len(foreach_step['steps']) == 1
    wrapped_step = foreach_step['steps'][0]
    
    assert wrapped_step['actionVerb'] == 'GET_DETAILS'
    assert wrapped_step['number'] == 1 # It's the first step in the sub-plan
    
    # Crucially, check that the input of the wrapped step now refers to the loop item
    assert wrapped_step['inputs']['url']['outputName'] == 'item'
    assert wrapped_step['inputs']['url']['sourceStep'] == 2 # Refers to the FOREACH step itself
