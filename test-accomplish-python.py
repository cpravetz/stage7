#!/usr/bin/env python3
"""
Test script to directly test the ACCOMPLISH Python plugin
"""

import json
import sys
import os

# Add the plugin directory to the path
sys.path.insert(0, '/app/src/plugins/ACCOMPLISH')

# Import the plugin
from main import AccomplishPlugin

def test_accomplish_plugin():
    """Test the ACCOMPLISH plugin directly"""
    
    # Create test inputs in the format expected by the plugin
    test_inputs = {
        'goal': {
            'inputName': 'goal',
            'inputValue': 'Create a simple test plan',
            'args': {}
        },
        'verbToAvoid': {
            'inputName': 'verbToAvoid', 
            'inputValue': 'TEST',
            'args': {}
        }
    }
    
    print("Testing ACCOMPLISH plugin with inputs:")
    print(json.dumps(test_inputs, indent=2))
    
    # Create plugin instance
    plugin = AccomplishPlugin()
    
    # Execute the plugin
    try:
        results = plugin.execute(test_inputs)
        print("\nPlugin execution results:")
        print(json.dumps(results, indent=2))
        
        if results and len(results) > 0:
            if results[0].get('success'):
                print("\n✅ Plugin executed successfully!")
            else:
                print(f"\n❌ Plugin failed: {results[0].get('error', 'Unknown error')}")
        else:
            print("\n❌ No results returned from plugin")
            
    except Exception as e:
        print(f"\n❌ Exception during plugin execution: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_accomplish_plugin()
