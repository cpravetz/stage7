#!/usr/bin/env python3
"""
Test script to verify the input format expected by the ACCOMPLISH plugin
"""

import json

# This is the format that should be passed to the Python plugin
# It's an array of [key, value] pairs where value is a PluginInput object

test_inputs_array = [
    ["goal", {
        "inputName": "goal",
        "inputValue": "Create a simple test plan",
        "args": {}
    }],
    ["verbToAvoid", {
        "inputName": "verbToAvoid", 
        "inputValue": "TEST",
        "args": {}
    }]
]

print("Test inputs array (what should be passed to Python plugin):")
print(json.dumps(test_inputs_array, indent=2))

# Convert to the format the plugin expects
inputs_map = {item[0]: item[1] for item in test_inputs_array}

print("\nConverted inputs map:")
print(json.dumps(inputs_map, indent=2))

# Test goal extraction
goal = None
for key, value in inputs_map.items():
    print(f"\nProcessing key: {key}, value: {value}, type: {type(value)}")
    if key == 'goal':
        if isinstance(value, dict) and 'inputValue' in value:
            goal = value['inputValue']
            print(f"Found goal in inputValue: {goal}")
        else:
            goal = value
            print(f"Found goal as direct value: {goal}")
        break

print(f"\nFinal goal value: {goal}")

if goal:
    print("✅ Goal extraction successful!")
else:
    print("❌ Goal extraction failed!")
