# InnQuest PMS Integration Plugin

This plugin provides integration with the InnQuest Property Management System (PMS) for hotel operations management.

## Overview

The INNQUEST_TOOL plugin enables the Hotel Operations Assistant to:
- Check room availability for specific dates and room types
- Retrieve detailed guest reservation information
- Update housekeeping status for rooms
- View current housekeeping status across the property
- List reservations for a given date range

## Prerequisites

The plugin requires the following environment variables to be configured:

- `INNQUEST_API_URL`: The base URL of the InnQuest API (e.g., `https://api.innquest.com/v2`)
- `INNQUEST_API_KEY`: The API key for authentication with InnQuest

## Configuration

Set the required environment variables in your docker-compose.yaml or .env file for the capabilitiesmanager service:

```yaml
environment:
  INNQUEST_API_URL: "https://api.innquest.com/v2"
  INNQUEST_API_KEY: "your-innquest-api-key-here"
```

## Available Tools

### 1. check_room_availability
Checks the availability of a specific room type for a given date.

**Parameters:**
- `tool_name` or `action`: `check_room_availability`
- `room_type`: The type of room (e.g., 'King Suite', 'Standard Double')
- `date`: The date to check in YYYY-MM-DD format

**Example:**
```python
{
  "tool_name": "check_room_availability",
  "room_type": "King Suite",
  "date": "2026-01-25"
}
```

### 2. get_guest_details
Retrieves detailed information about a specific guest reservation.

**Parameters:**
- `tool_name` or `action`: `get_guest_details`
- `reservation_id`: The unique ID for the reservation

**Example:**
```python
{
  "tool_name": "get_guest_details",
  "reservation_id": "RES123456"
}
```

### 3. update_room_status
Updates the housekeeping status of a room.

**Parameters:**
- `tool_name` or `action`: `update_room_status`
- `room_number`: The room number to update
- `status`: The new status (e.g., 'Clean', 'Dirty', 'Needs Inspection')

**Example:**
```python
{
  "tool_name": "update_room_status",
  "room_number": "101",
  "status": "Clean"
}
```

### 4. get_housekeeping_status
Retrieves the current housekeeping status of all rooms.

**Parameters:**
- `tool_name` or `action`: `get_housekeeping_status`

**Example:**
```python
{
  "tool_name": "get_housekeeping_status"
}
```

### 5. get_reservation_list
Retrieves a list of reservations for a given date range.

**Parameters:**
- `tool_name` or `action`: `get_reservation_list`
- `check_in_date` (optional): Start date in YYYY-MM-DD format
- `check_out_date` (optional): End date in YYYY-MM-DD format

**Example:**
```python
{
  "tool_name": "get_reservation_list",
  "check_in_date": "2026-01-25",
  "check_out_date": "2026-01-30"
}
```

## Response Format

All operations return a response in the following format:

```json
{
  "success": true,
  "name": "tool_name",
  "resultType": "success",
  "description": "Description of the operation",
  "result": {
    // API response data or error information
  }
}
```

## Error Handling

The plugin includes comprehensive error handling for:
- Configuration errors (missing API credentials)
- Connection errors to the InnQuest API
- HTTP errors and timeouts
- Invalid parameters
- JSON parsing errors

All errors are logged and returned with appropriate error types for debugging.

## Integration with Hotel Operations Assistant

Once configured with the required environment variables, this plugin will automatically be available to the Hotel Operations Assistant. The assistant can invoke the plugin by using the verb `INNQUEST_TOOL` and specifying the desired operation.

## Security

- API credentials are stored securely using environment variables
- All API communication uses HTTPS and Bearer token authentication
- The plugin implements request deduplication to prevent unintended duplicate API calls
- Network policies should restrict outbound access to only the InnQuest API endpoint
