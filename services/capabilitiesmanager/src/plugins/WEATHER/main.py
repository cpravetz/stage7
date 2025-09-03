#!/usr/bin/env python3
"""
WEATHER Plugin for Stage7

This plugin fetches current weather information for a specified location
using the OpenWeatherMap API.
"""

import sys
import json
import os
import requests
from typing import Dict, List, Any, Optional


class InputValue:
    """Represents a plugin input parameter in the new format"""
    def __init__(self, inputName: str, value: Any, valueType: str, args: Dict[str, Any] = None):
        self.inputName = inputName
        self.value = value
        self.valueType = valueType
        self.args = args or {}






class PluginOutput:
    """Represents a plugin output result"""
    def __init__(self, success: bool, name: str, result_type: str, 
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        output = {
            "success": self.success,
            "name": self.name,
            "resultType": self.result_type,
            "result": self.result,
            "resultDescription": self.result_description
        }
        if self.error:
            output["error"] = self.error
        return output


def create_success_output(name: str, result: Any, result_type: str = "string", 
                         description: str = "Plugin executed successfully") -> PluginOutput:
    """Helper function to create a successful output"""
    return PluginOutput(
        success=True,
        name=name,
        result_type=result_type,
        result=result,
        result_description=description
    )


def create_error_output(name: str, error_message: str, 
                       description: str = "Plugin execution failed") -> PluginOutput:
    """Helper function to create an error output"""
    return PluginOutput(
        success=False,
        name=name,
        result_type="error",
        result=None,
        result_description=description,
        error=error_message
    )


def get_weather_data(location: str, api_key: str) -> Dict[str, Any]:
    """
    Fetch weather data from OpenWeatherMap API
    
    Args:
        location: City name or coordinates
        api_key: OpenWeatherMap API key
        
    Returns:
        Weather data dictionary
    """
    base_url = "http://api.openweathermap.org/data/2.5/weather"
    params = {
        "q": location,
        "appid": api_key,
        "units": "metric"  # Use Celsius
    }
    
    response = requests.get(base_url, params=params, timeout=10)
    response.raise_for_status()
    
    return response.json()


def format_weather_info(weather_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format weather data into a readable structure
    
    Args:
        weather_data: Raw weather data from API
        
    Returns:
        Formatted weather information
    """
    main = weather_data.get("main", {})
    weather = weather_data.get("weather", [{}])[0]
    wind = weather_data.get("wind", {})
    
    return {
        "location": weather_data.get("name", "Unknown"),
        "country": weather_data.get("sys", {}).get("country", ""),
        "temperature": main.get("temp"),
        "feels_like": main.get("feels_like"),
        "humidity": main.get("humidity"),
        "pressure": main.get("pressure"),
        "description": weather.get("description", "").title(),
        "main_condition": weather.get("main", ""),
        "wind_speed": wind.get("speed"),
        "wind_direction": wind.get("deg"),
        "visibility": weather_data.get("visibility"),
        "timestamp": weather_data.get("dt")
    }


def execute_plugin(inputs: Dict[str, InputValue]) -> List[PluginOutput]:
    """
    Main plugin execution function for WEATHER plugin
    
    Args:
        inputs: Dictionary of input parameters
        
    Returns:
        List of PluginOutput objects
    """
    try:
        # Get location input
        location_input = inputs.get('location')
        if not location_input:
            return [create_error_output("error", "Missing required input: location")]
        
        location = location_input.value
        if not location or not isinstance(location, str):
            return [create_error_output("error", "Location must be a non-empty string")]
        
        # Get API key from environment or input
        api_key = os.environ.get('OPENWEATHER_API_KEY')
        api_key_input = inputs.get('api_key')
        if api_key_input:
            api_key = api_key_input.value
        
        if not api_key:
            return [create_error_output("error", 
                "OpenWeatherMap API key required. Set OPENWEATHER_API_KEY environment variable or provide api_key input")]
        
        # Fetch weather data
        weather_data = get_weather_data(location, api_key)
        
        # Format the weather information
        formatted_weather = format_weather_info(weather_data)
        
        # Create summary text
        summary = (f"Weather in {formatted_weather['location']}: "
                  f"{formatted_weather['description']}, "
                  f"{formatted_weather['temperature']}°C "
                  f"(feels like {formatted_weather['feels_like']}°C), "
                  f"Humidity: {formatted_weather['humidity']}%")
        
        # Return results
        return [
            create_success_output("weather_data", formatted_weather, "object", 
                                 f"Weather data for {location}"),
            create_success_output("summary", summary, "string", 
                                 f"Weather summary for {location}")
        ]
        
    except requests.exceptions.RequestException as e:
        return [create_error_output("error", f"Failed to fetch weather data: {str(e)}")]
    except KeyError as e:
        return [create_error_output("error", f"Invalid weather data format: {str(e)}")]
    except Exception as e:
        return [create_error_output("error", f"Unexpected error: {str(e)}")]


def main():
    """Main entry point for the plugin"""
    try:
        # Read inputs from stdin
        inputs_str = sys.stdin.read().strip()
        if not inputs_str:
            raise ValueError("No input provided")

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)
        inputs_map = {} # Correctly parse inputs_map
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, val = item
                inputs_map[key] = val
            else:
                logger.warning(f"Skipping invalid input item: {item}")

        # Convert to InputValue objects for compatibility
        inputs = {}
        for key, raw_value in inputs_map.items(): # Use raw_value here
            # Infer valueType based on raw_value
            inferred_value_type = 'string'
            if isinstance(raw_value, bool):
                inferred_value_type = 'boolean'
            elif isinstance(raw_value, (int, float)):
                inferred_value_type = 'number'
            elif isinstance(raw_value, list):
                inferred_value_type = 'array'
            elif isinstance(raw_value, dict):
                inferred_value_type = 'object'

            inputs[key] = InputValue(
                inputName=key, # Assuming inputName is the same as key
                value=raw_value,
                valueType=inferred_value_type,
                args={} # No args provided in the raw input
            )

        # Execute the plugin
        outputs = execute_plugin(inputs)

        # Convert outputs to dictionaries and print as JSON
        output_dicts = [output.to_dict() for output in outputs]
        print(json.dumps(output_dicts))

    except Exception as e:
        # Handle any errors in the main execution
        error_output = create_error_output("error", str(e), "Plugin execution failed")
        print(json.dumps([error_output.to_dict()]))


if __name__ == "__main__":
    main()
