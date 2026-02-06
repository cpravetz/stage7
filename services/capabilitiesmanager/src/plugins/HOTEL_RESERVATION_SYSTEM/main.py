#!/usr/bin/env python3
"""
HOTEL_RESERVATION_SYSTEM Plugin - Reservation and booking management
Manages reservations, availability checking, double-booking prevention, and confirmations.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta
from enum import Enum

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ReservationStatus(Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"

# In-Memory Data Storage
_reservations = {}
_room_availability = {}
_booking_calendar = {}

ROOM_TYPES = ["standard", "deluxe", "suite", "penthouse", "accessible"]
STANDARD_ROOM_RATES = {
    "standard": 100.0,
    "deluxe": 150.0,
    "suite": 250.0,
    "penthouse": 500.0,
    "accessible": 110.0
}

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

def _generate_confirmation_number(guest_id: str) -> str:
    """Generate unique reservation confirmation number."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"RES_{guest_id}_{timestamp[-6:]}"

def _initialize_availability(hotel_id: str, check_in: str, check_out: str, room_type: str) -> None:
    """Initialize room availability for date range."""
    key = f"{hotel_id}_{room_type}"
    if key not in _room_availability:
        _room_availability[key] = {}
        _booking_calendar[key] = {}
    
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        
        current = check_in_date
        while current < check_out_date:
            date_str = current.strftime("%Y-%m-%d")
            if date_str not in _room_availability[key]:
                _room_availability[key][date_str] = 10  # 10 rooms available by default
            current += timedelta(days=1)
    except:
        pass

def _check_date_overlap(start1: str, end1: str, start2: str, end2: str) -> bool:
    """Check if two date ranges overlap."""
    try:
        s1 = datetime.strptime(start1, "%Y-%m-%d")
        e1 = datetime.strptime(end1, "%Y-%m-%d")
        s2 = datetime.strptime(start2, "%Y-%m-%d")
        e2 = datetime.strptime(end2, "%Y-%m-%d")
        return s1 < e2 and s2 < e1
    except:
        return False

def _count_available_rooms(hotel_id: str, check_in: str, check_out: str, room_type: str) -> int:
    """Count available rooms for a date range."""
    key = f"{hotel_id}_{room_type}"
    _initialize_availability(hotel_id, check_in, check_out, room_type)
    
    min_available = float('inf')
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        
        current = check_in_date
        while current < check_out_date:
            date_str = current.strftime("%Y-%m-%d")
            available = _room_availability[key].get(date_str, 10)
            min_available = min(min_available, available)
            current += timedelta(days=1)
    except:
        return 0
    
    return max(0, int(min_available)) if min_available != float('inf') else 0

def create_reservation(payload: dict) -> Dict[str, Any]:
    """Create a new reservation."""
    required = ["guest_id", "guest_name", "check_in_date", "check_out_date", "room_type"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    check_in = payload.get("check_in_date")
    check_out = payload.get("check_out_date")
    room_type = payload.get("room_type")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    num_guests = payload.get("num_guests", 1)
    
    # Validate dates
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        if check_in_date >= check_out_date:
            return {"success": False, "error": "Check-out date must be after check-in date"}
    except:
        return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD"}
    
    # Check availability
    available_count = _count_available_rooms(hotel_id, check_in, check_out, room_type)
    if available_count <= 0:
        return {
            "success": False,
            "error": f"No {room_type} rooms available for these dates"
        }
    
    # Calculate rate
    room_rate = STANDARD_ROOM_RATES.get(room_type, 100.0)
    num_nights = (check_out_date - check_in_date).days
    total_cost = room_rate * num_nights
    
    confirmation_number = _generate_confirmation_number(guest_id)
    
    reservation = {
        "confirmation_number": confirmation_number,
        "guest_id": guest_id,
        "guest_name": payload.get("guest_name"),
        "email": payload.get("email", ""),
        "phone": payload.get("phone", ""),
        "hotel_id": hotel_id,
        "check_in_date": check_in,
        "check_out_date": check_out,
        "num_nights": num_nights,
        "num_guests": num_guests,
        "room_type": room_type,
        "room_id": None,
        "room_rate": room_rate,
        "total_cost": total_cost,
        "status": ReservationStatus.CONFIRMED.value,
        "special_requests": payload.get("special_requests", ""),
        "created_at": datetime.now().isoformat(),
        "confirmation_sent_at": None,
        "notes": ""
    }
    
    _reservations[confirmation_number] = reservation
    
    # Update availability
    key = f"{hotel_id}_{room_type}"
    _initialize_availability(hotel_id, check_in, check_out, room_type)
    
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        current = check_in_date
        while current < check_out_date:
            date_str = current.strftime("%Y-%m-%d")
            _room_availability[key][date_str] = max(0, _room_availability[key].get(date_str, 10) - 1)
            current += timedelta(days=1)
    except:
        pass
    
    logger.info(f"Created reservation {confirmation_number} for guest {guest_id}")
    
    return {
        "success": True,
        "reservation": reservation,
        "confirmation_details": {
            "confirmation_number": confirmation_number,
            "status": ReservationStatus.CONFIRMED.value,
            "total_cost": total_cost
        }
    }

def update_reservation(payload: dict) -> Dict[str, Any]:
    """Update an existing reservation."""
    required = ["confirmation_number"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    confirmation_number = payload.get("confirmation_number")
    
    if confirmation_number not in _reservations:
        return {"success": False, "error": f"Reservation {confirmation_number} not found"}
    
    reservation = _reservations[confirmation_number]
    
    # Update allowed fields
    updatable_fields = ["num_guests", "special_requests", "room_type", "notes", "email", "phone"]
    
    for field in updatable_fields:
        if field in payload and payload[field] is not None:
            reservation[field] = payload[field]
    
    logger.info(f"Updated reservation {confirmation_number}")
    
    return {
        "success": True,
        "reservation": reservation
    }

def cancel_reservation(payload: dict) -> Dict[str, Any]:
    """Cancel a reservation."""
    required = ["confirmation_number"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    confirmation_number = payload.get("confirmation_number")
    
    if confirmation_number not in _reservations:
        return {"success": False, "error": f"Reservation {confirmation_number} not found"}
    
    reservation = _reservations[confirmation_number]
    
    if reservation["status"] == ReservationStatus.CANCELLED.value:
        return {"success": False, "error": "Reservation already cancelled"}
    
    # Release room availability
    hotel_id = reservation["hotel_id"]
    room_type = reservation["room_type"]
    check_in = reservation["check_in_date"]
    check_out = reservation["check_out_date"]
    
    key = f"{hotel_id}_{room_type}"
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        current = check_in_date
        while current < check_out_date:
            date_str = current.strftime("%Y-%m-%d")
            _room_availability[key][date_str] = _room_availability[key].get(date_str, 10) + 1
            current += timedelta(days=1)
    except:
        pass
    
    reservation["status"] = ReservationStatus.CANCELLED.value
    
    logger.info(f"Cancelled reservation {confirmation_number}")
    
    return {
        "success": True,
        "cancelled_reservation": {
            "confirmation_number": confirmation_number,
            "guest_id": reservation["guest_id"],
            "cancelled_at": datetime.now().isoformat(),
            "refund_amount": reservation["total_cost"] * 0.9  # 90% refund
        }
    }

def check_availability(payload: dict) -> Dict[str, Any]:
    """Check room availability for a date range."""
    required = ["check_in_date", "check_out_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    check_in = payload.get("check_in_date")
    check_out = payload.get("check_out_date")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    room_type = payload.get("room_type")
    
    # Validate dates
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        num_nights = (check_out_date - check_in_date).days
        if num_nights <= 0:
            return {"success": False, "error": "Invalid date range"}
    except:
        return {"success": False, "error": "Invalid date format"}
    
    availability = {}
    if room_type:
        available = _count_available_rooms(hotel_id, check_in, check_out, room_type)
        availability[room_type] = {
            "available": available,
            "rate": STANDARD_ROOM_RATES.get(room_type, 100.0),
            "total_cost": STANDARD_ROOM_RATES.get(room_type, 100.0) * num_nights
        }
    else:
        for rt in ROOM_TYPES:
            available = _count_available_rooms(hotel_id, check_in, check_out, rt)
            availability[rt] = {
                "available": available,
                "rate": STANDARD_ROOM_RATES.get(rt, 100.0),
                "total_cost": STANDARD_ROOM_RATES.get(rt, 100.0) * num_nights
            }
    
    return {
        "success": True,
        "availability": {
            "check_in_date": check_in,
            "check_out_date": check_out,
            "num_nights": num_nights,
            "rooms_by_type": availability
        }
    }

def get_reservations(payload: dict) -> Dict[str, Any]:
    """Get reservations by guest or date range."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    guest_id = payload.get("guest_id")
    status = payload.get("status")
    
    reservations_list = []
    
    for conf_num, res in _reservations.items():
        if hotel_id and res["hotel_id"] != hotel_id:
            continue
        if guest_id and res["guest_id"] != guest_id:
            continue
        if status and res["status"] != status:
            continue
        
        reservations_list.append(res)
    
    return {
        "success": True,
        "reservations": reservations_list,
        "total_count": len(reservations_list)
    }

def generate_booking_report(payload: dict) -> Dict[str, Any]:
    """Generate booking analytics report."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    days = payload.get("days", 30)
    
    # Calculate statistics
    total_reservations = len([r for r in _reservations.values() if r["hotel_id"] == hotel_id])
    confirmed = len([r for r in _reservations.values() 
                    if r["hotel_id"] == hotel_id and r["status"] == ReservationStatus.CONFIRMED.value])
    cancelled = len([r for r in _reservations.values() 
                    if r["hotel_id"] == hotel_id and r["status"] == ReservationStatus.CANCELLED.value])
    
    total_revenue = sum(r["total_cost"] for r in _reservations.values() 
                       if r["hotel_id"] == hotel_id and r["status"] == ReservationStatus.CONFIRMED.value)
    
    # Room type breakdown
    by_room_type = {}
    for rt in ROOM_TYPES:
        count = len([r for r in _reservations.values() 
                    if r["hotel_id"] == hotel_id and r["room_type"] == rt])
        revenue = sum(r["total_cost"] for r in _reservations.values() 
                     if r["hotel_id"] == hotel_id and r["room_type"] == rt)
        by_room_type[rt] = {"reservations": count, "revenue": revenue}
    
    report = {
        "success": True,
        "report": {
            "hotel_id": hotel_id,
            "report_date": datetime.now().isoformat(),
            "analysis_period_days": days,
            "summary": {
                "total_reservations": total_reservations,
                "confirmed": confirmed,
                "cancelled": cancelled,
                "cancellation_rate": round(cancelled / total_reservations * 100, 2) if total_reservations > 0 else 0
            },
            "financial": {
                "total_revenue": round(total_revenue, 2),
                "average_booking_value": round(total_revenue / confirmed, 2) if confirmed > 0 else 0
            },
            "by_room_type": by_room_type
        }
    }
    
    return report

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "create_reservation": create_reservation,
            "update_reservation": update_reservation,
            "cancel_reservation": cancel_reservation,
            "check_availability": check_availability,
            "get_reservations": get_reservations,
            "generate_booking_report": generate_booking_report
        }
        
        if action not in actions:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": list(actions.keys()),
                "result": {}
            }
        
        result = actions[action](payload)
        return {"success": result.get("success", False), "result": result}
    
    except Exception as e:
        logger.error(f"Plugin error: {str(e)}")
        return {"success": False, "error": str(e), "result": {}}

if __name__ == "__main__":
    test_input = {
        "action": "create_reservation",
        "payload": {
            "guest_id": "GUEST_001",
            "guest_name": "John Doe",
            "check_in_date": "2026-02-01",
            "check_out_date": "2026-02-05",
            "room_type": "deluxe",
            "num_guests": 2,
            "hotel_id": "HOTEL_001"
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
