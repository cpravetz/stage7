#!/usr/bin/env python3
"""
Container Plugin Server Template
Provides a standardized HTTP API for containerized plugins
"""

import json
import logging
import sys
from datetime import datetime
from flask import Flask, request, jsonify
from plugin_logic import execute_plugin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'container-plugin'
    })

@app.route('/metrics', methods=['GET'])
def metrics():
    """Metrics endpoint for monitoring"""
    return jsonify({
        'requests_total': getattr(metrics, 'requests_total', 0),
        'errors_total': getattr(metrics, 'errors_total', 0),
        'uptime_seconds': getattr(metrics, 'uptime_seconds', 0)
    })

@app.route('/execute', methods=['POST'])
def execute():
    """Main plugin execution endpoint"""
    try:
        # Increment request counter
        metrics.requests_total = getattr(metrics, 'requests_total', 0) + 1
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided'
            }), 400
        
        # Extract inputs and context
        inputs = data.get('inputs', {})
        context = data.get('context', {})
        
        logger.info(f"Executing plugin with inputs: {list(inputs.keys())}")
        
        # Execute the plugin logic
        result = execute_plugin(inputs, context)
        
        # Validate result format
        if not isinstance(result, dict) or 'success' not in result:
            raise ValueError("Plugin must return a dict with 'success' field")
        
        logger.info(f"Plugin execution completed successfully: {result.get('success', False)}")
        
        return jsonify(result)
        
    except Exception as e:
        # Increment error counter
        metrics.errors_total = getattr(metrics, 'errors_total', 0) + 1
        
        logger.error(f"Plugin execution failed: {str(e)}", exc_info=True)
        
        return jsonify({
            'success': False,
            'error': str(e),
            'type': type(e).__name__
        }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found',
        'available_endpoints': ['/health', '/metrics', '/execute']
    }), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        'success': False,
        'error': 'Method not allowed',
        'allowed_methods': ['GET', 'POST']
    }), 405

if __name__ == '__main__':
    logger.info("Starting container plugin server...")
    
    # Initialize metrics
    metrics.requests_total = 0
    metrics.errors_total = 0
    metrics.uptime_seconds = 0
    
    # Start the server
    app.run(
        host='0.0.0.0',
        port=8080,
        debug=False,
        threaded=True
    )
