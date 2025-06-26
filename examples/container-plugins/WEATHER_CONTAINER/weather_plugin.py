#!/usr/bin/env python3
"""
Weather Plugin Logic
Provides weather information using OpenWeatherMap API
"""

import json
import logging
import os
import requests
from typing import Dict, Any

logger = logging.getLogger(__name__)

def get_weather_data(inputs: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get weather data for a specified location
    
    Args:
        inputs: Dictionary containing location parameter
        context: Dictionary of execution context
    
    Returns:
        Dictionary with weather data or error information
    """
    try:
        logger.info(f"Weather plugin execution started - trace_id: {context.get('trace_id', 'unknown')}")
        
        # Extract location from inputs
        location_input = inputs.get('location')
        if not location_input:
            return {
                'success': False,
                'error': 'Missing required input: location'
            }
        
        # Handle different input formats
        if isinstance(location_input, dict):
            location = location_input.get('inputValue', location_input.get('value', ''))
        else:
            location = str(location_input)
        
        if not location:
            return {
                'success': False,
                'error': 'Location value is empty'
            }
        
        logger.info(f"Getting weather for location: {location}")
        
        # Get API key from environment
        api_key = os.getenv('OPENWEATHER_API_KEY')
        if not api_key:
            # For demo purposes, return mock data if no API key
            logger.warning("No OpenWeatherMap API key found, returning mock data")
            return get_mock_weather_data(location)
        
        # Call OpenWeatherMap API
        base_url = "http://api.openweathermap.org/data/2.5/weather"
        params = {
            'q': location,
            'appid': api_key,
            'units': 'metric'
        }
        
        response = requests.get(base_url, params=params, timeout=10)
        
        if response.status_code == 404:
            return {
                'success': False,
                'error': f'Location not found: {location}'
            }
        elif response.status_code != 200:
            return {
                'success': False,
                'error': f'Weather API error: {response.status_code} - {response.text}'
            }
        
        weather_data = response.json()
        
        # Extract relevant information
        result = {
            'success': True,
            'outputs': {
                'location': weather_data.get('name', location),
                'country': weather_data.get('sys', {}).get('country', ''),
                'temperature': weather_data.get('main', {}).get('temp', 0),
                'feels_like': weather_data.get('main', {}).get('feels_like', 0),
                'humidity': weather_data.get('main', {}).get('humidity', 0),
                'pressure': weather_data.get('main', {}).get('pressure', 0),
                'description': weather_data.get('weather', [{}])[0].get('description', ''),
                'wind_speed': weather_data.get('wind', {}).get('speed', 0),
                'wind_direction': weather_data.get('wind', {}).get('deg', 0),
                'visibility': weather_data.get('visibility', 0),
                'timestamp': context.get('trace_id', 'unknown')
            }
        }
        
        logger.info(f"Weather data retrieved successfully for {location}")
        return result
        
    except requests.exceptions.Timeout:
        logger.error("Weather API request timed out")
        return {
            'success': False,
            'error': 'Weather API request timed out'
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"Weather API request failed: {str(e)}")
        return {
            'success': False,
            'error': f'Weather API request failed: {str(e)}'
        }
    except Exception as e:
        logger.error(f"Weather plugin execution failed: {str(e)}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }

def get_mock_weather_data(location: str) -> Dict[str, Any]:
    """
    Return mock weather data for testing purposes
    """
    return {
        'success': True,
        'outputs': {
            'location': location,
            'country': 'XX',
            'temperature': 22.5,
            'feels_like': 24.0,
            'humidity': 65,
            'pressure': 1013,
            'description': 'partly cloudy',
            'wind_speed': 3.2,
            'wind_direction': 180,
            'visibility': 10000,
            'timestamp': 'mock-data',
            'note': 'This is mock data - set OPENWEATHER_API_KEY environment variable for real data'
        }
    }

def validate_inputs(inputs: Dict[str, Any]) -> Dict[str, str]:
    """
    Validate weather plugin inputs
    
    Args:
        inputs: Dictionary of input parameters
    
    Returns:
        Dictionary of validation errors (empty if valid)
    """
    errors = {}
    
    if 'location' not in inputs:
        errors['location'] = 'Required input missing'
    else:
        location_input = inputs['location']
        if isinstance(location_input, dict):
            location = location_input.get('inputValue', location_input.get('value', ''))
        else:
            location = str(location_input)
        
        if not location or not location.strip():
            errors['location'] = 'Location cannot be empty'
    
    return errors

def get_plugin_info() -> Dict[str, Any]:
    """
    Get weather plugin information and capabilities
    """
    return {
        'name': 'Weather Container Plugin',
        'version': '1.0.0',
        'description': 'Get weather information for any location using OpenWeatherMap API',
        'inputs': [
            {
                'name': 'location',
                'type': 'string',
                'required': True,
                'description': 'Location name (city, country) to get weather for'
            }
        ],
        'outputs': [
            {
                'name': 'location',
                'type': 'string',
                'description': 'Resolved location name'
            },
            {
                'name': 'country',
                'type': 'string',
                'description': 'Country code'
            },
            {
                'name': 'temperature',
                'type': 'number',
                'description': 'Temperature in Celsius'
            },
            {
                'name': 'feels_like',
                'type': 'number',
                'description': 'Feels like temperature in Celsius'
            },
            {
                'name': 'humidity',
                'type': 'number',
                'description': 'Humidity percentage'
            },
            {
                'name': 'pressure',
                'type': 'number',
                'description': 'Atmospheric pressure in hPa'
            },
            {
                'name': 'description',
                'type': 'string',
                'description': 'Weather description'
            },
            {
                'name': 'wind_speed',
                'type': 'number',
                'description': 'Wind speed in m/s'
            },
            {
                'name': 'wind_direction',
                'type': 'number',
                'description': 'Wind direction in degrees'
            },
            {
                'name': 'visibility',
                'type': 'number',
                'description': 'Visibility in meters'
            }
        ]
    }
