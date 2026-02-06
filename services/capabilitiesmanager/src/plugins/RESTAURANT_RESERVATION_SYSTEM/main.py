#!/usr/bin/env python3
"""
RESTAURANT_RESERVATION_SYSTEM Plugin - Restaurant reservation management
Manages restaurant reservations, availability checking, table assignments, and booking confirmations.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta
from enum import Enum
import uuid

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ReservationStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"

class ReservationSource(Enum):
    PHONE = "phone"
    ONLINE = "online"
    WALK_IN = "walk_in"
    THIRD_PARTY = "third_party"

# In-Memory Data Storage
_reservations = {}
_time_slots = {}
_guests = {}
_seating_preferences = {}
_special_requests = {}
_booking_history = {}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely retrieve input values with alias fallback."""
    val = inputs.get(key)
    if val is None:
        for alias in aliases:
            val = inputs.get(alias)
            if val is not None:
                break
    if val is None:
        return default
    if isinstance(val, dict) and 'value' in val:
        return val['value'] if val['value'] is not None else default
    return val if val is not None else default

def _validate_params(payload: dict, required_fields: List[str]) -> Tuple[bool, str]:
    """Validate required parameters in payload."""
    for field in required_fields:
        if field not in payload or payload[field] is None:
            return False, f"Missing required parameter: {field}"
    return True, ""

def _initialize_restaurant(restaurant_id: str) -> None:
    """Initialize restaurant data structures."""
    if restaurant_id not in _reservations:
        _reservations[restaurant_id] = {}
        _time_slots[restaurant_id] = _generate_time_slots()
        _guests[restaurant_id] = {}
        _seating_preferences[restaurant_id] = {}
        _special_requests[restaurant_id] = {}
        _booking_history[restaurant_id] = []

def _generate_time_slots(days_ahead: int = 30) -> Dict[str, List[Dict[str, Any]]]:
    """Generate available time slots for upcoming days."""
    slots = {}
    operating_hours = [(11, 30), (12, 0), (12, 30), (13, 0), (18, 0), (18, 30), (19, 0), (19, 30), (20, 0), (20, 30)]
    
    for day_offset in range(days_ahead):
        date = (datetime.now() + timedelta(days=day_offset)).date()
        date_str = date.isoformat()
        slots[date_str] = []
        
        for hour, minute in operating_hours:
            time_str = f"{hour:02d}:{minute:02d}"
            slots[date_str].append({
                "time": time_str,
                "available_tables": 10,
                "capacity": 40,
                "bookings": 0
            })
    
    return slots

def create_reservation(payload: dict) -> Dict[str, Any]:
    """Create a new restaurant reservation."""
    required = ["guest_name", "party_size", "reservation_date", "reservation_time"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    guest_name = payload.get("guest_name")
    party_size = payload.get("party_size")
    reservation_date = payload.get("reservation_date")
    reservation_time = payload.get("reservation_time")
    
    _initialize_restaurant(restaurant_id)
    
    if not isinstance(party_size, int) or party_size <= 0 or party_size > 12:
        return {"success": False, "error": "Party size must be 1-12"}
    
    # Validate date and time
    try:
        res_date = datetime.fromisoformat(reservation_date)
        if res_date.date() <= datetime.now().date():
            return {"success": False, "error": "Reservation date must be in the future"}
    except ValueError:
        return {"success": False, "error": "Invalid reservation_date format (use YYYY-MM-DD)"}
    
    # Check availability
    if reservation_date not in _time_slots[restaurant_id]:
        return {"success": False, "error": f"No availability for date {reservation_date}"}
    
    slot = None
    for s in _time_slots[restaurant_id][reservation_date]:
        if s["time"] == reservation_time:
            slot = s
            break
    
    if not slot:
        return {"success": False, "error": f"No availability at {reservation_time}"}
    
    if slot["available_tables"] < 1:
        return {"success": False, "error": f"No tables available at {reservation_time}"}
    
    # Generate reservation ID
    reservation_id = f"RES_{restaurant_id}_{uuid.uuid4().hex[:8].upper()}"
    
    # Create reservation
    guest_email = payload.get("guest_email", "")
    guest_phone = payload.get("guest_phone", "")
    source = payload.get("source", ReservationSource.ONLINE.value)
    special_requests = payload.get("special_requests", "")
    seating_preference = payload.get("seating_preference", "standard")
    
    reservation = {
        "reservation_id": reservation_id,
        "restaurant_id": restaurant_id,
        "guest_name": guest_name,
        "guest_email": guest_email,
        "guest_phone": guest_phone,
        "party_size": party_size,
        "reservation_date": reservation_date,
        "reservation_time": reservation_time,
        "status": ReservationStatus.PENDING.value,
        "source": source,
        "created_at": datetime.now().isoformat(),
        "special_requests": special_requests,
        "seating_preference": seating_preference,
        "table_assignment": None,
        "check_in_time": None,
        "check_out_time": None,
        "duration_minutes": payload.get("duration_minutes", 90),
        "notes": []
    }
    
    _reservations[restaurant_id][reservation_id] = reservation
    _special_requests[restaurant_id][reservation_id] = special_requests
    _seating_preferences[restaurant_id][reservation_id] = seating_preference
    
    # Update time slot
    slot["bookings"] += 1
    slot["available_tables"] -= 1
    
    # Add to booking history
    _booking_history[restaurant_id].append({
        "action": "created",
        "reservation_id": reservation_id,
        "timestamp": datetime.now().isoformat(),
        "details": f"Reservation for {guest_name}, party of {party_size}"
    })
    
    return {
        "success": True,
        "reservation_id": reservation_id,
        "confirmation": {
            "guest_name": guest_name,
            "party_size": party_size,
            "date": reservation_date,
            "time": reservation_time,
            "status": ReservationStatus.CONFIRMED.value,
            "created_at": reservation["created_at"]
        }
    }

def update_reservation(payload: dict) -> Dict[str, Any]:
    """Update an existing reservation."""
    required = ["reservation_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    reservation_id = payload.get("reservation_id")
    
    _initialize_restaurant(restaurant_id)
    
    if reservation_id not in _reservations[restaurant_id]:
        return {"success": False, "error": f"Reservation {reservation_id} not found"}
    
    reservation = _reservations[restaurant_id][reservation_id]
    
    # Update allowed fields
    if "guest_phone" in payload:
        reservation["guest_phone"] = payload["guest_phone"]
    
    if "party_size" in payload:
        new_party_size = payload["party_size"]
        if not isinstance(new_party_size, int) or new_party_size <= 0 or new_party_size > 12:
            return {"success": False, "error": "Party size must be 1-12"}
        reservation["party_size"] = new_party_size
    
    if "special_requests" in payload:
        reservation["special_requests"] = payload["special_requests"]
        _special_requests[restaurant_id][reservation_id] = payload["special_requests"]
    
    if "seating_preference" in payload:
        reservation["seating_preference"] = payload["seating_preference"]
        _seating_preferences[restaurant_id][reservation_id] = payload["seating_preference"]
    
    if "status" in payload:
        new_status = payload["status"]
        if new_status in [s.value for s in ReservationStatus]:
            reservation["status"] = new_status
        else:
            return {"success": False, "error": f"Invalid status: {new_status}"}
    
    reservation["notes"].append(f"Updated at {datetime.now().isoformat()}")
    
    _booking_history[restaurant_id].append({
        "action": "updated",
        "reservation_id": reservation_id,
        "timestamp": datetime.now().isoformat(),
        "changes": list(payload.keys())
    })
    
    return {
        "success": True,
        "reservation_id": reservation_id,
        "updated_fields": list(payload.keys()),
        "reservation": reservation
    }

def cancel_reservation(payload: dict) -> Dict[str, Any]:
    """Cancel a restaurant reservation."""
    required = ["reservation_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    reservation_id = payload.get("reservation_id")
    
    _initialize_restaurant(restaurant_id)
    
    if reservation_id not in _reservations[restaurant_id]:
        return {"success": False, "error": f"Reservation {reservation_id} not found"}
    
    reservation = _reservations[restaurant_id][reservation_id]
    cancellation_reason = payload.get("cancellation_reason", "No reason provided")
    
    # Update time slot availability
    if reservation["status"] not in [ReservationStatus.CANCELLED.value, ReservationStatus.COMPLETED.value]:
        for slot in _time_slots[restaurant_id][reservation["reservation_date"]]:
            if slot["time"] == reservation["reservation_time"]:
                slot["bookings"] -= 1
                slot["available_tables"] += 1
                break
    
    reservation["status"] = ReservationStatus.CANCELLED.value
    reservation["notes"].append(f"Cancelled: {cancellation_reason}")
    
    _booking_history[restaurant_id].append({
        "action": "cancelled",
        "reservation_id": reservation_id,
        "timestamp": datetime.now().isoformat(),
        "reason": cancellation_reason
    })
    
    return {
        "success": True,
        "reservation_id": reservation_id,
        "status": ReservationStatus.CANCELLED.value,
        "cancellation_reason": cancellation_reason
    }

def check_availability(payload: dict) -> Dict[str, Any]:
    """Check table availability for a given date and time."""
    required = ["reservation_date", "reservation_time", "party_size"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    reservation_date = payload.get("reservation_date")
    reservation_time = payload.get("reservation_time")
    party_size = payload.get("party_size")
    
    _initialize_restaurant(restaurant_id)
    
    if reservation_date not in _time_slots[restaurant_id]:
        return {
            "success": True,
            "available": False,
            "reason": f"No availability for date {reservation_date}"
        }
    
    matching_slots = []
    for slot in _time_slots[restaurant_id][reservation_date]:
        if slot["time"] == reservation_time:
            if slot["available_tables"] >= 1:
                matching_slots.append({
                    "time": slot["time"],
                    "available_tables": slot["available_tables"],
                    "suitable_for_party": party_size <= slot["capacity"]
                })
    
    if matching_slots:
        return {
            "success": True,
            "available": True,
            "available_slots": matching_slots,
            "date": reservation_date
        }
    else:
        return {
            "success": True,
            "available": False,
            "date": reservation_date,
            "time": reservation_time
        }

def get_reservations(payload: dict) -> Dict[str, Any]:
    """Retrieve reservations with filtering options."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    filter_status = payload.get("filter_status")
    filter_date = payload.get("filter_date")
    filter_guest = payload.get("filter_guest")
    
    _initialize_restaurant(restaurant_id)
    
    reservations = list(_reservations[restaurant_id].values())
    
    if filter_status:
        reservations = [r for r in reservations if r["status"] == filter_status]
    
    if filter_date:
        reservations = [r for r in reservations if r["reservation_date"] == filter_date]
    
    if filter_guest:
        reservations = [r for r in reservations if filter_guest.lower() in r["guest_name"].lower()]
    
    return {
        "success": True,
        "total_reservations": len(reservations),
        "reservations": reservations[:50]  # Return max 50
    }

def generate_booking_report(payload: dict) -> Dict[str, Any]:
    """Generate a comprehensive booking report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    report_date = payload.get("report_date", datetime.now().date().isoformat())
    
    _initialize_restaurant(restaurant_id)
    
    reservations = list(_reservations[restaurant_id].values())
    
    # Filter by date if provided
    if report_date:
        reservations = [r for r in reservations if r["reservation_date"] == report_date]
    
    # Calculate statistics
    confirmed = [r for r in reservations if r["status"] == ReservationStatus.CONFIRMED.value]
    completed = [r for r in reservations if r["status"] == ReservationStatus.COMPLETED.value]
    cancelled = [r for r in reservations if r["status"] == ReservationStatus.CANCELLED.value]
    no_show = [r for r in reservations if r["status"] == ReservationStatus.NO_SHOW.value]
    
    total_party_size = sum(r["party_size"] for r in confirmed)
    avg_party_size = total_party_size / len(confirmed) if confirmed else 0
    
    # Group by time
    by_time = {}
    for res in confirmed:
        time = res["reservation_time"]
        if time not in by_time:
            by_time[time] = {"count": 0, "total_guests": 0}
        by_time[time]["count"] += 1
        by_time[time]["total_guests"] += res["party_size"]
    
    return {
        "success": True,
        "report_date": report_date,
        "total_reservations": len(reservations),
        "statistics": {
            "confirmed": len(confirmed),
            "completed": len(completed),
            "cancelled": len(cancelled),
            "no_show": len(no_show),
            "total_guests_confirmed": total_party_size,
            "avg_party_size": round(avg_party_size, 1)
        },
        "bookings_by_time": by_time,
        "recent_history": _booking_history[restaurant_id][-10:]
    }

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "create_reservation":
            return create_reservation(payload)
        elif action_lower == "update_reservation":
            return update_reservation(payload)
        elif action_lower == "cancel_reservation":
            return cancel_reservation(payload)
        elif action_lower == "check_availability":
            return check_availability(payload)
        elif action_lower == "get_reservations":
            return get_reservations(payload)
        elif action_lower == "generate_booking_report":
            return generate_booking_report(payload)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}
    
    except Exception as e:
        logger.error(f"Plugin error: {str(e)}", exc_info=True)
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            input_data = json.loads(sys.argv[1])
            action = input_data.get("action", "")
            payload = input_data.get("payload", {})
            result = execute_plugin(action, payload)
            print(json.dumps(result))
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"JSON parse error: {str(e)}"}))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
    else:
        print(json.dumps({"success": False, "error": "No input provided"}))
