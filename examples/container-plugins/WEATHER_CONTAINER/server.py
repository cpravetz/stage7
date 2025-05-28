#!/usr/bin/env python3
"""
Weather Container Plugin Server
Provides weather information via HTTP API
"""

import json
import logging
import sys
from datetime import datetime
from flask import Flask, request, jsonify
from weather_plugin import get_weather_data

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)

# Metrics tracking
class Metrics:
    def __init__(self):
        self.requests_total = 0
        self.errors_total = 0
        self.start_time = datetime.utcnow()

metrics = Metrics()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'weather-container-plugin',
        'uptime_seconds': (datetime.utcnow() - metrics.start_time).total_seconds()
    })

@app.route('/metrics', methods=['GET'])
def get_metrics():
    """Metrics endpoint for monitoring"""
    return jsonify({
        'requests_total': metrics.requests_total,
        'errors_total': metrics.errors_total,
        'uptime_seconds': (datetime.utcnow() - metrics.start_time).total_seconds()
    })

@app.route('/execute', methods=['POST'])
def execute():
    """Main plugin execution endpoint"""
    try:
        # Increment request counter
        metrics.requests_total += 1
        
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
        
        logger.info(f"Weather plugin execution started - trace_id: {context.get('trace_id', 'unknown')}")
        
        # Execute the weather plugin logic
        result = get_weather_data(inputs, context)
        
        # Validate result format
        if not isinstance(result, dict) or 'success' not in result:
            raise ValueError("Weather plugin must return a dict with 'success' field")
        
        logger.info(f"Weather plugin execution completed: {result.get('success', False)}")
        
        return jsonify(result)
        
    except Exception as e:
        # Increment error counter
        metrics.errors_total += 1
        
        logger.error(f"Weather plugin execution failed: {str(e)}", exc_info=True)
        
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
    logger.info("Starting weather container plugin server...")
    
    # Start the server
    app.run(
        host='0.0.0.0',
        port=8080,
        debug=False,
        threaded=True
    )
