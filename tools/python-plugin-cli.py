#!/usr/bin/env python3
"""
Stage7 Python Plugin Development CLI

This tool helps developers create, validate, and test Python plugins for the Stage7 system.

Usage:
    python python-plugin-cli.py create <plugin_name> [--verb <action_verb>]
    python python-plugin-cli.py validate <plugin_path>
    python python-plugin-cli.py test <plugin_path> [--input <input_json>]
    python python-plugin-cli.py package <plugin_path>
    python python-plugin-cli.py install <plugin_path>
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, List


def create_plugin(plugin_name: str, action_verb: str = None) -> None:
    """
    Create a new Python plugin from template
    
    Args:
        plugin_name: Name of the plugin
        action_verb: Action verb for the plugin (defaults to plugin_name.upper())
    """
    if not action_verb:
        action_verb = plugin_name.upper()
    
    # Create plugin directory
    plugin_dir = Path(f"plugins/{plugin_name}")
    plugin_dir.mkdir(parents=True, exist_ok=True)
    
    # Get template directory
    template_dir = Path(__file__).parent.parent / "templates" / "python-plugin-template"
    
    if not template_dir.exists():
        print(f"Error: Template directory not found at {template_dir}")
        return
    
    # Copy template files
    for template_file in template_dir.glob("*"):
        if template_file.is_file():
            dest_file = plugin_dir / template_file.name
            shutil.copy2(template_file, dest_file)
            print(f"Created: {dest_file}")
    
    # Update manifest.json with plugin details
    manifest_path = plugin_dir / "manifest.json"
    if manifest_path.exists():
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        # Update plugin-specific fields
        manifest["id"] = f"plugin-{action_verb}"
        manifest["verb"] = action_verb
        manifest["description"] = f"{plugin_name} plugin for Stage7 system"
        manifest["explanation"] = f"This plugin provides {action_verb} functionality. Update this description with your specific implementation details."
        
        # Update metadata
        if "metadata" not in manifest:
            manifest["metadata"] = {}
        manifest["metadata"]["author"] = "Your Name"
        manifest["metadata"]["tags"] = [plugin_name.lower(), "custom"]
        
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        print(f"Updated manifest for plugin: {action_verb}")
    
    # Create tests directory
    tests_dir = plugin_dir / "tests"
    tests_dir.mkdir(exist_ok=True)
    
    # Create basic test file
    test_file = tests_dir / f"test_{plugin_name.lower()}.py"
    test_content = f'''#!/usr/bin/env python3
"""
Tests for {plugin_name} plugin
"""

import unittest
import json
import sys
import os
from pathlib import Path

# Add plugin directory to path
plugin_dir = Path(__file__).parent.parent
sys.path.insert(0, str(plugin_dir))

from main import execute_plugin, InputValue


class Test{plugin_name.title()}Plugin(unittest.TestCase):
    """Test cases for {plugin_name} plugin"""
    
    def test_basic_functionality(self):
        """Test basic plugin functionality"""
        inputs = {{
            'example_input': InputValue('test_value')
        }}
        
        outputs = execute_plugin(inputs)
        
        # Check that we got outputs
        self.assertIsInstance(outputs, list)
        self.assertGreater(len(outputs), 0)
        
        # Check first output
        first_output = outputs[0]
        self.assertTrue(hasattr(first_output, 'success'))
        self.assertTrue(hasattr(first_output, 'result'))
    
    def test_missing_input(self):
        """Test plugin behavior with missing required input"""
        inputs = {{}}
        
        outputs = execute_plugin(inputs)
        
        # Should return error output
        self.assertIsInstance(outputs, list)
        self.assertGreater(len(outputs), 0)
        
        error_output = outputs[0]
        self.assertFalse(error_output.success)
        self.assertEqual(error_output.result_type, "error")


if __name__ == '__main__':
    unittest.main()
'''
    
    with open(test_file, 'w') as f:
        f.write(test_content)
    
    print(f"Created test file: {test_file}")
    print(f"\nPlugin '{plugin_name}' created successfully!")
    print(f"Directory: {plugin_dir}")
    print(f"Action Verb: {action_verb}")
    print(f"\nNext steps:")
    print(f"1. Edit {plugin_dir}/main.py to implement your plugin logic")
    print(f"2. Update {plugin_dir}/manifest.json with your plugin details")
    print(f"3. Add dependencies to {plugin_dir}/requirements.txt if needed")
    print(f"4. Test your plugin: python {__file__} test {plugin_dir}")


def validate_plugin(plugin_path: str) -> bool:
    """
    Validate a Python plugin
    
    Args:
        plugin_path: Path to the plugin directory
        
    Returns:
        True if valid, False otherwise
    """
    plugin_dir = Path(plugin_path)
    
    if not plugin_dir.exists():
        print(f"Error: Plugin directory not found: {plugin_dir}")
        return False
    
    print(f"Validating plugin: {plugin_dir}")
    
    # Check required files
    required_files = ["main.py", "manifest.json"]
    missing_files = []
    
    for file_name in required_files:
        file_path = plugin_dir / file_name
        if not file_path.exists():
            missing_files.append(file_name)
    
    if missing_files:
        print(f"Error: Missing required files: {', '.join(missing_files)}")
        return False
    
    # Validate manifest.json
    manifest_path = plugin_dir / "manifest.json"
    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        required_fields = ["id", "verb", "description", "inputDefinitions", "outputDefinitions", "language"]
        missing_fields = []
        
        for field in required_fields:
            if field not in manifest:
                missing_fields.append(field)
        
        if missing_fields:
            print(f"Error: Missing required manifest fields: {', '.join(missing_fields)}")
            return False
        
        if manifest.get("language") != "python":
            print(f"Error: Plugin language must be 'python', got: {manifest.get('language')}")
            return False
        
        print("✓ Manifest validation passed")
        
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in manifest.json: {e}")
        return False
    
    # Validate main.py syntax
    main_path = plugin_dir / "main.py"
    try:
        with open(main_path, 'r') as f:
            code = f.read()
        
        compile(code, str(main_path), 'exec')
        print("✓ Python syntax validation passed")
        
    except SyntaxError as e:
        print(f"Error: Syntax error in main.py: {e}")
        return False
    
    # Check for required functions
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("plugin_main", main_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        if not hasattr(module, 'execute_plugin'):
            print("Error: main.py must define an 'execute_plugin' function")
            return False
        
        print("✓ Required functions found")
        
    except Exception as e:
        print(f"Error: Failed to import main.py: {e}")
        return False
    
    print("✓ Plugin validation completed successfully")
    return True


def test_plugin(plugin_path: str, input_json: str = None) -> None:
    """
    Test a Python plugin

    Args:
        plugin_path: Path to the plugin directory
        input_json: JSON string with test inputs
    """
    plugin_dir = Path(plugin_path).resolve()  # Get absolute path

    if not validate_plugin(str(plugin_dir)):
        print("Plugin validation failed. Cannot run tests.")
        return

    print(f"\nTesting plugin: {plugin_dir}")

    # Use default test input if none provided
    if not input_json:
        input_json = '{"example_input": {"value": "test_value", "args": {}}}'

    try:
        test_input = json.loads(input_json)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid input JSON: {e}")
        return

    # Run the plugin
    main_path = plugin_dir / "main.py"

    try:
        # Execute plugin using subprocess to simulate real execution
        cmd = [sys.executable, str(main_path), str(plugin_dir)]
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=str(plugin_dir)  # Set working directory to plugin directory
        )
        
        stdout, stderr = process.communicate(input=input_json)
        
        if process.returncode != 0:
            print(f"Error: Plugin execution failed with return code {process.returncode}")
            if stderr:
                print(f"Error output: {stderr}")
            return
        
        if stderr:
            print(f"Warning: Plugin produced stderr output: {stderr}")
        
        # Parse and display output
        try:
            outputs = json.loads(stdout)
            print("✓ Plugin executed successfully")
            print(f"Output: {json.dumps(outputs, indent=2)}")
            
        except json.JSONDecodeError as e:
            print(f"Error: Plugin output is not valid JSON: {e}")
            print(f"Raw output: {stdout}")
            
    except Exception as e:
        print(f"Error: Failed to execute plugin: {e}")


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(description="Stage7 Python Plugin Development CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Create command
    create_parser = subparsers.add_parser("create", help="Create a new Python plugin")
    create_parser.add_argument("plugin_name", help="Name of the plugin")
    create_parser.add_argument("--verb", help="Action verb for the plugin")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate a Python plugin")
    validate_parser.add_argument("plugin_path", help="Path to the plugin directory")
    
    # Test command
    test_parser = subparsers.add_parser("test", help="Test a Python plugin")
    test_parser.add_argument("plugin_path", help="Path to the plugin directory")
    test_parser.add_argument("--input", help="JSON input for testing")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    if args.command == "create":
        create_plugin(args.plugin_name, args.verb)
    elif args.command == "validate":
        validate_plugin(args.plugin_path)
    elif args.command == "test":
        test_plugin(args.plugin_path, args.input)
    else:
        print(f"Unknown command: {args.command}")
        parser.print_help()


if __name__ == "__main__":
    main()
