#!/usr/bin/env python3
"""
InnQuestTool Plugin - Integration with InnQuest Property Management System.
Provides hotel operations capabilities for room availability, guest details, and housekeeping status.
"""

import os
import requests
import logging
import json
import hashlib
from typing import Dict, Any, Optional

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Track seen requests for deduplication
seen_hashes = set()


class InnQuestTool:
    """Handles communication with InnQuest Property Management System API."""
    
    def __init__(self):
        """Initialize the InnQuestTool with API credentials from environment variables."""
        self.api_url = os.getenv("INNQUEST_API_URL")
        self.api_key = os.getenv("INNQUEST_API_KEY")
        
        if not self.api_url or not self.api_key:
            raise ValueError("InnQuest API URL or Key is not configured. Set INNQUEST_API_URL and INNQUEST_API_KEY environment variables.")
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        logger.info(f"InnQuestTool initialized with API URL: {self.api_url}")

    def _get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Helper function for GET requests to the InnQuest API.
        
        :param endpoint: The API endpoint (relative path)
        :param params: Query parameters
        :return: JSON response or error dictionary
        """
        try:
            url = f"{self.api_url}/{endpoint}".rstrip('/')
            logger.debug(f"GET request to {url} with params: {params}")
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            error_msg = f"Request timeout when accessing {endpoint}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "timeout"}
        except requests.exceptions.ConnectionError as e:
            error_msg = f"Connection error when accessing InnQuest API: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "connection"}
        except requests.exceptions.HTTPError as e:
            error_msg = f"HTTP error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "http", "status_code": e.response.status_code}
        except requests.exceptions.RequestException as e:
            error_msg = f"Request error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "request"}
        except json.JSONDecodeError as e:
            error_msg = f"Failed to decode JSON response: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "json_decode"}

    def _post(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Helper function for POST requests to the InnQuest API.
        
        :param endpoint: The API endpoint (relative path)
        :param data: The request body
        :return: JSON response or error dictionary
        """
        try:
            url = f"{self.api_url}/{endpoint}".rstrip('/')
            logger.debug(f"POST request to {url} with data: {data}")
            response = requests.post(url, headers=self.headers, json=data, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            error_msg = f"Request timeout when accessing {endpoint}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "timeout"}
        except requests.exceptions.ConnectionError as e:
            error_msg = f"Connection error when accessing InnQuest API: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "connection"}
        except requests.exceptions.HTTPError as e:
            error_msg = f"HTTP error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "http", "status_code": e.response.status_code}
        except requests.exceptions.RequestException as e:
            error_msg = f"Request error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "request"}
        except json.JSONDecodeError as e:
            error_msg = f"Failed to decode JSON response: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "json_decode"}

    def _put(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Helper function for PUT requests to the InnQuest API.
        
        :param endpoint: The API endpoint (relative path)
        :param data: The request body
        :return: JSON response or error dictionary
        """
        try:
            url = f"{self.api_url}/{endpoint}".rstrip('/')
            logger.debug(f"PUT request to {url} with data: {data}")
            response = requests.put(url, headers=self.headers, json=data, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            error_msg = f"Request timeout when accessing {endpoint}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "timeout"}
        except requests.exceptions.ConnectionError as e:
            error_msg = f"Connection error when accessing InnQuest API: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "connection"}
        except requests.exceptions.HTTPError as e:
            error_msg = f"HTTP error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "http", "status_code": e.response.status_code}
        except requests.exceptions.RequestException as e:
            error_msg = f"Request error: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "request"}
        except json.JSONDecodeError as e:
            error_msg = f"Failed to decode JSON response: {str(e)}"
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "json_decode"}

    def check_room_availability(self, room_type: str, date: str) -> Dict[str, Any]:
        """
        Checks the availability of a specific room type for a given date.
        
        :param room_type: The type of room (e.g., 'King Suite', 'Standard Double').
        :param date: The date to check in YYYY-MM-DD format.
        :return: A dictionary with availability information.
        """
        logger.info(f"Checking room availability for {room_type} on {date}")
        params = {
            "roomType": room_type,
            "date": date,
            "status": "available"
        }
        result = self._get("rooms", params=params)
        logger.info(f"Room availability result: {result}")
        return result

    def get_guest_details(self, reservation_id: str) -> Dict[str, Any]:
        """
        Retrieves details for a specific guest reservation.
        
        :param reservation_id: The unique ID for the reservation.
        :return: A dictionary with guest and reservation details.
        """
        logger.info(f"Fetching guest details for reservation {reservation_id}")
        result = self._get(f"reservations/{reservation_id}")
        logger.info(f"Guest details result: {result}")
        return result

    def update_room_status(self, room_number: str, status: str) -> Dict[str, Any]:
        """
        Updates the housekeeping status of a room.
        
        :param room_number: The room number to update.
        :param status: The new status (e.g., 'Clean', 'Dirty', 'Needs Inspection').
        :return: A dictionary confirming the update.
        """
        logger.info(f"Updating room {room_number} status to {status}")
        data = {
            "roomNumber": room_number,
            "status": status
        }
        result = self._put(f"rooms/{room_number}/status", data)
        logger.info(f"Room status update result: {result}")
        return result

    def get_housekeeping_status(self) -> Dict[str, Any]:
        """
        Retrieves the current housekeeping status of all rooms.
        
        :return: A dictionary with housekeeping status information.
        """
        logger.info("Fetching housekeeping status for all rooms")
        result = self._get("housekeeping/status")
        logger.info(f"Housekeeping status result: {result}")
        return result

    def get_reservation_list(self, check_in_date: Optional[str] = None, check_out_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieves a list of reservations for a given date range.
        
        :param check_in_date: Start date in YYYY-MM-DD format (optional).
        :param check_out_date: End date in YYYY-MM-DD format (optional).
        :return: A dictionary with reservation information.
        """
        logger.info(f"Fetching reservations from {check_in_date} to {check_out_date}")
        params = {}
        if check_in_date:
            params["checkInDate"] = check_in_date
        if check_out_date:
            params["checkOutDate"] = check_out_date
        result = self._get("reservations", params=params)
        logger.info(f"Reservation list result: {result}")
        return result

    def execute(self, tool_name: str, **kwargs) -> Dict[str, Any]:
        """
        The main execution entrypoint for the plugin.
        
        :param tool_name: The name of the tool/method to execute.
        :param kwargs: Arguments to pass to the tool.
        :return: The result of executing the tool.
        """
        if hasattr(self, tool_name):
            method = getattr(self, tool_name)
            if callable(method):
                try:
                    logger.info(f"Executing tool: {tool_name} with kwargs: {kwargs}")
                    result = method(**kwargs)
                    return result
                except TypeError as e:
                    error_msg = f"Invalid arguments for tool '{tool_name}': {str(e)}"
                    logger.error(error_msg)
                    return {"error": error_msg, "error_type": "invalid_arguments"}
                except Exception as e:
                    error_msg = f"Unexpected error executing tool '{tool_name}': {str(e)}"
                    logger.error(error_msg)
                    return {"error": error_msg, "error_type": "execution_error"}
            else:
                error_msg = f"Tool '{tool_name}' is not callable."
                logger.error(error_msg)
                return {"error": error_msg, "error_type": "not_callable"}
        else:
            error_msg = f"Tool '{tool_name}' not found in InnQuestTool."
            logger.error(error_msg)
            return {"error": error_msg, "error_type": "tool_not_found"}


def execute_plugin(inputs: Dict[str, Any]) -> list:
    """
    Main entry point for the plugin execution.
    
    :param inputs: Dictionary containing tool_name and other parameters.
    :return: List of plugin output dictionaries.
    """
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in seen_hashes:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "description": "Duplicate request detected",
                "result": {"error": "This request has already been processed."}
            }]
        seen_hashes.add(input_hash)

        # Get tool name and parameters
        tool_name = inputs.get("tool_name") or inputs.get("action")
        
        if not tool_name:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "description": "Missing required parameter",
                "result": {"error": "tool_name or action parameter is required"}
            }]

        # Extract tool parameters (everything except tool_name and action)
        tool_kwargs = {k: v for k, v in inputs.items() if k not in ["tool_name", "action"]}

        # Initialize the InnQuestTool and execute
        tool = InnQuestTool()
        result = tool.execute(tool_name, **tool_kwargs)

        # Determine success based on presence of error field
        success = "error" not in result and "error_type" not in result

        return [{
            "success": success,
            "name": tool_name,
            "resultType": "success" if success else "error",
            "description": f"Executed {tool_name}",
            "result": result
        }]

    except ValueError as e:
        # Configuration error
        logger.error(f"Configuration error: {str(e)}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "description": "Configuration error",
            "result": {"error": str(e), "error_type": "configuration"}
        }]
    except Exception as e:
        # Unexpected error
        logger.error(f"Unexpected error in execute_plugin: {str(e)}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "description": "Unexpected error",
            "result": {"error": str(e), "error_type": "unexpected"}
        }]
