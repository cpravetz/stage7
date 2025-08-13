#!/usr/bin/env python3
"""
Plugin Logic Template
Implement your plugin functionality in this file
"""

import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

def execute_plugin(inputs: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main plugin execution function
    
    Args:
        inputs: Dictionary of input parameters from the plugin request
        context: Dictionary of execution context (trace_id, plugin_id, etc.)
    
    Returns:
        Dictionary with execution results in the format:
        {
            'success': bool,
            'outputs': dict,  # Optional: plugin outputs
            'error': str      # Optional: error message if success=False
        }
    """
    try:
        logger.info(f"Plugin execution started with context: {context.get('trace_id', 'unknown')}")
        
        # TODO: Replace this template implementation with your actual plugin logic
        
        # Example: Get input parameters
        example_input = inputs.get('example_input')
        if not example_input:
            return {
                'success': False,
                'error': 'Missing required input: example_input'
            }
        
        # Example: Process the input
        input_value = example_input.get('inputValue') if isinstance(example_input, dict) else example_input
        
        # TODO: Implement your plugin logic here
        # This is just a template example
        result = f"Processed input: {input_value}"
        
        # Return successful result
        return {
            'success': True,
            'outputs': {
                'result': result,
                'processed_at': context.get('trace_id', 'unknown'),
                'input_length': len(str(input_value))
            }
        }
        
    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }

def validate_inputs(inputs: Dict[str, Any]) -> Dict[str, str]:
    """
    Validate plugin inputs
    
    Args:
        inputs: Dictionary of input parameters
    
    Returns:
        Dictionary of validation errors (empty if valid)
    """
    errors = {}
    
    # TODO: Add your input validation logic here
    # Example validation:
    if 'example_input' not in inputs:
        errors['example_input'] = 'Required input missing'
    
    return errors

def get_plugin_info() -> Dict[str, Any]:
    """
    Get plugin information and capabilities
    
    Returns:
        Dictionary with plugin metadata
    """
    return {
        'name': 'Container Plugin Template',
        'version': '1.0.0',
        'description': 'Template for containerized plugins',
        'inputs': [
            {
                'name': 'example_input',
                'type': 'string',
                'required': True,
                'description': 'Example input parameter'
            }
        ],
        'outputs': [
            {
                'name': 'result',
                'type': 'string',
                'description': 'Processed result'
            },
            {
                'name': 'processed_at',
                'type': 'string',
                'description': 'Processing trace ID'
            },
            {
                'name': 'input_length',
                'type': 'number',
                'description': 'Length of input value'
            }
        ]
    }
