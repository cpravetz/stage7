# Integrating the Hotel Operations Assistant with InnQuest

This document outlines the process for wiring up the Hotel Operations Assistant to the InnQuest Property Management System (PMS) by Aspire Software. The integration will enable the assistant to access and manipulate real-time hotel data, such as room availability, guest reservations, and housekeeping status.

## Core Integration Concept

The integration is achieved through a dedicated **InnQuest API Plugin**. The Hotel Operations Assistant does not call the InnQuest API directly. Instead, it leverages a specialized plugin registered with the system's `CapabilitiesManager`. This plugin is responsible for:

1.  Securely storing and using InnQuest API credentials.
2.  Exposing a set of tools (e.g., `check_room_availability`, `get_guest_details`).
3.  Translating the assistant's requests into concrete API calls to the InnQuest PMS.
4.  Formatting the API responses and returning them to the assistant.

## Prerequisites

-   Administrator access to your InnQuest instance.
-   InnQuest API credentials (API Key and API URL).
-   Access to the `cktMCS` codebase and environment configuration.
-   The Hotel Operations Assistant service must be running.

## Step-by-Step Configuration

### 1. Obtain InnQuest API Credentials

Before starting, you must retrieve an API key from your InnQuest administrative portal.

1.  Log in to your InnQuest admin dashboard.
2.  Navigate to the **API Settings** or **Integrations** section.
3.  Generate a new API key for the "Hotel Operations Assistant".
4.  Note down the **API Key** and the **API Base URL** provided.

### 2. Configure the Hotel Operations Assistant Environment

You must provide the API credentials to the `hotel-ops-assistant-api` service. This is done via environment variables for security.

1.  Locate the configuration for the `hotel-ops-assistant-api` service. This might be in a `.env` file at the root of the `agents/hotel-ops-assistant-api/` directory or in the main `docker-compose.yaml` file.

2.  Add the following environment variables:

    ```bash
    INNQUEST_API_URL="https://api.innquest.com/v2" # Use the actual API URL from InnQuest
    INNQUEST_API_KEY="your-innquest-api-key-here"
    ```

### 3. Develop the InnQuest Plugin

A new plugin must be created to handle the communication logic.

1.  Create a new directory for the plugin within the capabilities manager:
    `services/capabilitiesmanager/src/plugins/INNQUEST_TOOL/`

2.  Inside this directory, create a main file (e.g., `main.py`) that defines the plugin's logic. The plugin should read the environment variables for its configuration.

    **Example: `services/capabilitiesmanager/src/plugins/INNQUEST_TOOL/main.py`**

    ```python
    import os
    import requests

    class InnQuestTool:
        def __init__(self):
            self.api_url = os.getenv("INNQUEST_API_URL")
            self.api_key = os.getenv("INNQUEST_API_KEY")
            if not self.api_url or not self.api_key:
                raise ValueError("InnQuest API URL or Key is not configured.")
            self.headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }

        def _get(self, endpoint, params=None):
            """Helper function for GET requests."""
            try:
                response = requests.get(f"{self.api_url}/{endpoint}", headers=self.headers, params=params)
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                return {"error": str(e)}

        def check_room_availability(self, room_type: str, date: str) -> dict:
            """
            Checks the availability of a specific room type for a given date.
            
            :param room_type: The type of room (e.g., 'King Suite', 'Standard Double').
            :param date: The date to check in YYYY-MM-DD format.
            :return: A dictionary with availability information.
            """
            params = {"roomType": room_type, "date": date, "status": "available"}
            return self._get("rooms", params=params)

        def get_guest_details(self, reservation_id: str) -> dict:
            """
            Retrieves details for a specific guest reservation.
            
            :param reservation_id: The unique ID for the reservation.
            :return: A dictionary with guest and reservation details.
            """
            return self._get(f"reservations/{reservation_id}")

        def update_room_status(self, room_number: str, status: str) -> dict:
            """

            Updates the housekeeping status of a room.
            
            :param room_number: The room number to update.
            :param status: The new status (e.g., 'Clean', 'Dirty', 'Needs Inspection').
            :return: A dictionary confirming the update.
            """
            # This would likely be a POST or PUT request in a real scenario
            # For simplicity, we'll mock it as a GET
            print(f"MOCK UPDATE: Room {room_number} status set to {status}")
            return {"success": True, "room": room_number, "new_status": status}

        def execute(self, tool_name: str, **kwargs) -> dict:
            """The main execution entrypoint for the plugin."""
            if hasattr(self, tool_name):
                return getattr(self, tool_name)(**kwargs)
            else:
                return {"error": f"Tool '{tool_name}' not found in InnQuestTool."}

    ```

### 4. Register the Plugin with the System

The `CapabilitiesManager` needs to be made aware of the new `INNQUEST_TOOL`. This process may vary but typically involves:
-   Updating a configuration file that lists all available plugins.
-   Ensuring the plugin's manifest (if required) correctly describes its tools (`check_room_availability`, etc.).

### 5. Restart and Verify

1.  Rebuild and restart the relevant services (`hotel-ops-assistant-api`, `capabilitiesmanager`).
    ```bash
    docker-compose up -d --build hotel-ops-assistant-api capabilitiesmanager
    ```
2.  Send a test message to the Hotel Operations Assistant that would require using the new tool.

## Example Usage

**User:** "How many clean King Suites are available for tonight?"

**Hotel Operations Assistant (behind the scenes):**
1.  Understands the intent is to check room availability.
2.  Identifies the `check_room_availability` tool from the `INNQUEST_TOOL` plugin.
3.  Calls the tool with `room_type='King Suite'` and `date='2026-01-15'`.
4.  The `InnQuestTool` plugin makes a GET request to `https://api.innquest.com/v2/rooms?roomType=King+Suite&...`
5.  The plugin receives the API response and returns it to the assistant.
6.  The assistant synthesizes the information into a user-friendly response.

**Hotel Operations Assistant (response to user):** "There are currently 7 clean King Suites available for tonight."

## Security Considerations

-   **Never hardcode API keys.** Always use environment variables or a dedicated secrets management service (like HashiCorp Vault or AWS Secrets Manager).
-   Ensure network policies in your Docker or Kubernetes environment only allow the `capabilitiesmanager` service to make outbound requests to the InnQuest API endpoint.
-   Implement logging and monitoring to track API usage and detect potential abuse.
