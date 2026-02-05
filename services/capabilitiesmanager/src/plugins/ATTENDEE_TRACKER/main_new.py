#!/usr/bin/env python3
"""
ATTENDEE_TRACKER Plugin - Event attendee management
Provides RSVP tracking, attendance marking, guest lists, and demographic analysis.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# In-memory attendee database
ATTENDEES = {}
EVENTS = {
    "event_001": {
        "id": "event_001",
        "name": "Annual Gala 2026",
        "date": "2026-02-15",
        "capacity": 500,
        "attendee_count": 0
    }
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {'value':...} wrapper."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def _validate_email(email: str) -> bool:
    """Basic email validation."""
    return "@" in email and "." in email

def _add_attendee(payload: dict) -> Dict[str, Any]:
    """Add a new attendee to the system."""
    try:
        event_id = payload.get("event_id", "event_001")
        attendee_data = payload.get("attendee_data", {})
        
        if not event_id in EVENTS:
            return {"success": False, "error": f"Event {event_id} not found"}
        
        if not attendee_data.get("name"):
            return {"success": False, "error": "Attendee name is required"}
        
        if attendee_data.get("email") and not _validate_email(attendee_data["email"]):
            return {"success": False, "error": "Invalid email format"}
        
        attendee_id = f"attendee_{uuid.uuid4().hex[:8]}"
        
        attendee = {
            "id": attendee_id,
            "event_id": event_id,
            "name": attendee_data.get("name"),
            "email": attendee_data.get("email", ""),
            "phone": attendee_data.get("phone", ""),
            "company": attendee_data.get("company", ""),
            "title": attendee_data.get("title", ""),
            "rsvp_status": "pending",
            "attendance_status": "not_marked",
            "check_in_time": None,
            "dietary_restrictions": attendee_data.get("dietary_restrictions", ""),
            "plus_ones": attendee_data.get("plus_ones", 0),
            "added_date": datetime.now().isoformat()
        }
        
        ATTENDEES[attendee_id] = attendee
        EVENTS[event_id]["attendee_count"] += 1
        
        return {
            "success": True,
            "attendee_id": attendee_id,
            "name": attendee["name"],
            "message": "Attendee added successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _update_rsvp(payload: dict) -> Dict[str, Any]:
    """Update attendee RSVP status."""
    try:
        attendee_id = payload.get("attendee_id")
        rsvp_status = payload.get("rsvp_status")  # attending, declined, pending
        
        if not attendee_id:
            return {"success": False, "error": "attendee_id is required"}
        
        if attendee_id not in ATTENDEES:
            return {"success": False, "error": f"Attendee {attendee_id} not found"}
        
        if rsvp_status not in ["attending", "declined", "pending"]:
            return {"success": False, "error": f"Invalid RSVP status: {rsvp_status}"}
        
        attendee = ATTENDEES[attendee_id]
        old_status = attendee["rsvp_status"]
        attendee["rsvp_status"] = rsvp_status
        
        return {
            "success": True,
            "attendee_id": attendee_id,
            "name": attendee["name"],
            "old_status": old_status,
            "new_status": rsvp_status,
            "message": f"RSVP updated to {rsvp_status}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _track_attendance(payload: dict) -> Dict[str, Any]:
    """Mark attendee as checked in."""
    try:
        attendee_id = payload.get("attendee_id")
        check_in_time = payload.get("check_in_time", datetime.now().isoformat())
        
        if not attendee_id:
            return {"success": False, "error": "attendee_id is required"}
        
        if attendee_id not in ATTENDEES:
            return {"success": False, "error": f"Attendee {attendee_id} not found"}
        
        attendee = ATTENDEES[attendee_id]
        attendee["attendance_status"] = "attended"
        attendee["check_in_time"] = check_in_time
        
        return {
            "success": True,
            "attendee_id": attendee_id,
            "name": attendee["name"],
            "check_in_time": check_in_time,
            "message": "Attendance marked successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_attendee_list(payload: dict) -> Dict[str, Any]:
    """Get attendee list with filtering options."""
    try:
        event_id = payload.get("event_id", "event_001")
        filter_by = payload.get("filter_by")  # rsvp_status, attendance_status
        filter_value = payload.get("filter_value")
        
        if event_id not in EVENTS:
            return {"success": False, "error": f"Event {event_id} not found"}
        
        event_attendees = [a for a in ATTENDEES.values() if a["event_id"] == event_id]
        
        # Apply filters
        if filter_by and filter_value:
            if filter_by == "rsvp_status":
                event_attendees = [a for a in event_attendees if a["rsvp_status"] == filter_value]
            elif filter_by == "attendance_status":
                event_attendees = [a for a in event_attendees if a["attendance_status"] == filter_value]
        
        attendee_list = [
            {
                "id": a["id"],
                "name": a["name"],
                "email": a["email"],
                "rsvp_status": a["rsvp_status"],
                "attendance_status": a["attendance_status"],
                "company": a["company"],
                "title": a["title"],
                "plus_ones": a["plus_ones"]
            }
            for a in event_attendees
        ]
        
        return {
            "success": True,
            "event_id": event_id,
            "total_attendees": len(attendee_list),
            "attendees": attendee_list
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_demographics(payload: dict) -> Dict[str, Any]:
    """Analyze attendee demographics."""
    try:
        event_id = payload.get("event_id", "event_001")
        
        if event_id not in EVENTS:
            return {"success": False, "error": f"Event {event_id} not found"}
        
        event_attendees = [a for a in ATTENDEES.values() if a["event_id"] == event_id]
        
        # Demographic analysis
        attending_count = len([a for a in event_attendees if a["rsvp_status"] == "attending"])
        declined_count = len([a for a in event_attendees if a["rsvp_status"] == "declined"])
        pending_count = len([a for a in event_attendees if a["rsvp_status"] == "pending"])
        
        attended_count = len([a for a in event_attendees if a["attendance_status"] == "attended"])
        
        companies = list(set([a["company"] for a in event_attendees if a["company"]]))
        
        total_plus_ones = sum([a["plus_ones"] for a in event_attendees])
        
        dietary_restricted = len([a for a in event_attendees if a["dietary_restrictions"]])
        
        demographics = {
            "total_registrations": len(event_attendees),
            "rsvp_breakdown": {
                "attending": attending_count,
                "declined": declined_count,
                "pending": pending_count
            },
            "attendance_status": {
                "attended": attended_count,
                "not_attended": len(event_attendees) - attended_count
            },
            "companies_represented": len(companies),
            "total_plus_ones": total_plus_ones,
            "dietary_restrictions_count": dietary_restricted,
            "estimated_total_headcount": len(event_attendees) + total_plus_ones
        }
        
        return {
            "success": True,
            "event_id": event_id,
            "demographics": demographics
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _generate_attendee_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive attendee report."""
    try:
        event_id = payload.get("event_id", "event_001")
        
        if event_id not in EVENTS:
            return {"success": False, "error": f"Event {event_id} not found"}
        
        event = EVENTS[event_id]
        event_attendees = [a for a in ATTENDEES.values() if a["event_id"] == event_id]
        
        attending_count = len([a for a in event_attendees if a["rsvp_status"] == "attending"])
        attended_count = len([a for a in event_attendees if a["attendance_status"] == "attended"])
        
        report = {
            "event_id": event_id,
            "event_name": event["name"],
            "event_date": event["date"],
            "report_date": datetime.now().isoformat(),
            "registration_summary": {
                "total_registered": len(event_attendees),
                "capacity": event["capacity"],
                "capacity_utilization": f"{(len(event_attendees) / event['capacity'] * 100):.1f}%"
            },
            "rsvp_summary": {
                "attending": attending_count,
                "declined": len([a for a in event_attendees if a["rsvp_status"] == "declined"]),
                "pending": len([a for a in event_attendees if a["rsvp_status"] == "pending"]),
                "attendance_rate": f"{(attending_count / len(event_attendees) * 100 if event_attendees else 0):.1f}%"
            },
            "attendance_summary": {
                "total_attended": attended_count,
                "attendance_rate": f"{(attended_count / len(event_attendees) * 100 if event_attendees else 0):.1f}%"
            },
            "headcount_estimate": {
                "base_attendees": attending_count,
                "plus_ones": sum([a["plus_ones"] for a in event_attendees if a["rsvp_status"] == "attending"]),
                "total_estimated": attending_count + sum([a["plus_ones"] for a in event_attendees if a["rsvp_status"] == "attending"])
            },
            "dietary_requirements": len([a for a in event_attendees if a["dietary_restrictions"]]),
            "status": "On track" if attending_count >= event["capacity"] * 0.7 else "Below target"
        }
        
        return {
            "success": True,
            "report": report
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Missing required parameter 'action'"
            }]

        logger.info(f"Executing action: {action} with payload: {payload}")

        # Action handlers
        if action == "add_attendee":
            result = _add_attendee(payload)
        elif action == "update_rsvp":
            result = _update_rsvp(payload)
        elif action == "track_attendance":
            result = _track_attendance(payload)
        elif action == "get_attendee_list":
            result = _get_attendee_list(payload)
        elif action == "analyze_demographics":
            result = _analyze_demographics(payload)
        elif action == "generate_attendee_report":
            result = _generate_attendee_report(payload)
        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        return [{
            "success": result.get("success", True),
            "name": "result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {}

        if isinstance(payload, dict):
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {e}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
