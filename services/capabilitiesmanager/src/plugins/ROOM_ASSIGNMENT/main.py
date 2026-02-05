#!/usr/bin/env python3
"""
ROOM_ASSIGNMENT Plugin - Hotel room allocation and occupancy management
Manages room assignments, status tracking, availability, and occupancy analytics.
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

# Room Status Enumeration
class RoomStatus(Enum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    MAINTENANCE = "maintenance"
    RESERVED = "reserved"
    DIRTY = "dirty"

# Room Type Categories
ROOM_TYPES = ["standard", "deluxe", "suite", "penthouse", "accessible"]

# In-Memory Data Storage
_rooms_database = {}
_assignments_database = {}
_occupancy_history = {}

def _initialize_hotel_rooms(hotel_id: str, num_rooms: int = 100) -> None:
    """Initialize hotel room inventory."""
    if hotel_id not in _rooms_database:
        _rooms_database[hotel_id] = {}
        _occupancy_history[hotel_id] = []
        
        # Create rooms with varied types
        room_types = ROOM_TYPES * (num_rooms // len(ROOM_TYPES) + 1)
        for i in range(1, num_rooms + 1):
            room_id = f"ROOM_{i:03d}"
            _rooms_database[hotel_id][room_id] = {
                "room_id": room_id,
                "room_number": i,
                "room_type": room_types[i - 1],
                "status": RoomStatus.AVAILABLE.value,
                "occupancy_status": "empty",
                "guest_id": None,
                "check_in_date": None,
                "check_out_date": None,
                "assigned_at": None,
                "last_cleaned": datetime.now().isoformat(),
                "occupancy_rate": 0.0,
                "maintenance_notes": ""
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

def assign_room(payload: dict) -> Dict[str, Any]:
    """Assign a room to a guest."""
    required = ["guest_id", "check_in_date", "check_out_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    check_in = payload.get("check_in_date")
    check_out = payload.get("check_out_date")
    room_type = payload.get("room_type", "standard")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel_rooms(hotel_id)
    
    # Find available room of requested type
    available_rooms = [
        rid for rid, room in _rooms_database[hotel_id].items()
        if room["status"] == RoomStatus.AVAILABLE.value and room["room_type"] == room_type
    ]
    
    if not available_rooms:
        return {
            "success": False,
            "error": f"No {room_type} rooms available",
            "available_types": list(set(r["room_type"] for r in _rooms_database[hotel_id].values() 
                                       if r["status"] == RoomStatus.AVAILABLE.value))
        }
    
    room_id = available_rooms[0]
    room = _rooms_database[hotel_id][room_id]
    
    # Assign room
    room["status"] = RoomStatus.OCCUPIED.value
    room["occupancy_status"] = "occupied"
    room["guest_id"] = guest_id
    room["check_in_date"] = check_in
    room["check_out_date"] = check_out
    room["assigned_at"] = datetime.now().isoformat()
    
    assignment_id = f"ASSIGN_{hotel_id}_{guest_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    _assignments_database[assignment_id] = {
        "assignment_id": assignment_id,
        "hotel_id": hotel_id,
        "guest_id": guest_id,
        "room_id": room_id,
        "check_in_date": check_in,
        "check_out_date": check_out,
        "status": "active",
        "created_at": datetime.now().isoformat()
    }
    
    logger.info(f"Assigned {room_id} to guest {guest_id}")
    
    return {
        "success": True,
        "assignment": {
            "assignment_id": assignment_id,
            "room_id": room_id,
            "room_number": room["room_number"],
            "room_type": room["room_type"],
            "guest_id": guest_id,
            "check_in_date": check_in,
            "check_out_date": check_out,
            "assigned_at": room["assigned_at"]
        }
    }

def reassign_room(payload: dict) -> Dict[str, Any]:
    """Reassign guest to a different room."""
    required = ["guest_id", "new_room_type"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    new_room_type = payload.get("new_room_type")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel_rooms(hotel_id)
    
    # Find current room assignment
    current_room = None
    for rid, room in _rooms_database[hotel_id].items():
        if room["guest_id"] == guest_id and room["status"] == RoomStatus.OCCUPIED.value:
            current_room = rid
            break
    
    if not current_room:
        return {"success": False, "error": f"No active assignment found for guest {guest_id}"}
    
    # Find available room of new type
    available_rooms = [
        rid for rid, room in _rooms_database[hotel_id].items()
        if room["status"] == RoomStatus.AVAILABLE.value and room["room_type"] == new_room_type
    ]
    
    if not available_rooms:
        return {"success": False, "error": f"No {new_room_type} rooms available"}
    
    # Release old room
    old_room = _rooms_database[hotel_id][current_room]
    old_room_data = old_room.copy()
    old_room["status"] = RoomStatus.DIRTY.value
    old_room["occupancy_status"] = "empty"
    old_room["guest_id"] = None
    
    # Assign new room
    new_room_id = available_rooms[0]
    new_room = _rooms_database[hotel_id][new_room_id]
    new_room["status"] = RoomStatus.OCCUPIED.value
    new_room["guest_id"] = guest_id
    new_room["check_in_date"] = old_room_data["check_in_date"]
    new_room["check_out_date"] = old_room_data["check_out_date"]
    new_room["assigned_at"] = datetime.now().isoformat()
    
    logger.info(f"Reassigned guest {guest_id} from {current_room} to {new_room_id}")
    
    return {
        "success": True,
        "previous_room": current_room,
        "new_assignment": {
            "room_id": new_room_id,
            "room_number": new_room["room_number"],
            "room_type": new_room["room_type"],
            "guest_id": guest_id
        }
    }

def release_room(payload: dict) -> Dict[str, Any]:
    """Release a room (checkout)."""
    required = ["room_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    room_id = payload.get("room_id")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel_rooms(hotel_id)
    
    if room_id not in _rooms_database[hotel_id]:
        return {"success": False, "error": f"Room {room_id} not found"}
    
    room = _rooms_database[hotel_id][room_id]
    guest_id = room["guest_id"]
    check_in = room["check_in_date"]
    check_out = room["check_out_date"] or datetime.now().strftime("%Y-%m-%d")
    
    # Calculate occupancy duration
    try:
        check_in_date = datetime.strptime(check_in, "%Y-%m-%d")
        check_out_date = datetime.strptime(check_out, "%Y-%m-%d")
        duration = (check_out_date - check_in_date).days
    except:
        duration = 0
    
    # Record occupancy history
    _occupancy_history[hotel_id].append({
        "room_id": room_id,
        "guest_id": guest_id,
        "check_in_date": check_in,
        "check_out_date": check_out,
        "duration_nights": duration,
        "released_at": datetime.now().isoformat()
    })
    
    # Mark room for cleaning
    room["status"] = RoomStatus.DIRTY.value
    room["occupancy_status"] = "empty"
    room["guest_id"] = None
    room["check_in_date"] = None
    room["check_out_date"] = None
    
    logger.info(f"Released {room_id} from guest {guest_id}")
    
    return {
        "success": True,
        "released_room": {
            "room_id": room_id,
            "previous_guest": guest_id,
            "occupancy_duration_nights": duration,
            "released_at": datetime.now().isoformat()
        }
    }

def check_occupancy(payload: dict) -> Dict[str, Any]:
    """Check occupancy status of a room or all rooms."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    room_id = payload.get("room_id")
    
    _initialize_hotel_rooms(hotel_id)
    
    if room_id:
        if room_id not in _rooms_database[hotel_id]:
            return {"success": False, "error": f"Room {room_id} not found"}
        
        room = _rooms_database[hotel_id][room_id]
        return {
            "success": True,
            "occupancy": {
                "room_id": room_id,
                "status": room["status"],
                "occupancy_status": room["occupancy_status"],
                "guest_id": room["guest_id"],
                "check_in_date": room["check_in_date"],
                "check_out_date": room["check_out_date"]
            }
        }
    else:
        occupancy_summary = {
            RoomStatus.AVAILABLE.value: 0,
            RoomStatus.OCCUPIED.value: 0,
            RoomStatus.MAINTENANCE.value: 0,
            RoomStatus.DIRTY.value: 0,
            RoomStatus.RESERVED.value: 0
        }
        
        for room in _rooms_database[hotel_id].values():
            occupancy_summary[room["status"]] += 1
        
        total_rooms = len(_rooms_database[hotel_id])
        occupancy_rate = (occupancy_summary[RoomStatus.OCCUPIED.value] / total_rooms * 100) if total_rooms > 0 else 0
        
        return {
            "success": True,
            "occupancy_summary": {
                "total_rooms": total_rooms,
                "occupied": occupancy_summary[RoomStatus.OCCUPIED.value],
                "available": occupancy_summary[RoomStatus.AVAILABLE.value],
                "maintenance": occupancy_summary[RoomStatus.MAINTENANCE.value],
                "dirty": occupancy_summary[RoomStatus.DIRTY.value],
                "reserved": occupancy_summary[RoomStatus.RESERVED.value],
                "occupancy_rate_percent": round(occupancy_rate, 2)
            }
        }

def get_available_rooms(payload: dict) -> Dict[str, Any]:
    """Get list of available rooms, optionally filtered by type."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    room_type = payload.get("room_type")
    
    _initialize_hotel_rooms(hotel_id)
    
    available = []
    for room_id, room in _rooms_database[hotel_id].items():
        if room["status"] == RoomStatus.AVAILABLE.value:
            if room_type is None or room["room_type"] == room_type:
                available.append({
                    "room_id": room_id,
                    "room_number": room["room_number"],
                    "room_type": room["room_type"],
                    "status": room["status"]
                })
    
    return {
        "success": True,
        "available_rooms": available,
        "count": len(available),
        "by_type": {rt: len([r for r in available if r["room_type"] == rt]) for rt in ROOM_TYPES}
    }

def generate_occupancy_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive occupancy analytics report."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    days = payload.get("days", 30)
    
    _initialize_hotel_rooms(hotel_id)
    
    total_rooms = len(_rooms_database[hotel_id])
    occupancy_summary = {rt: 0 for rt in ROOM_TYPES}
    status_summary = {status.value: 0 for status in RoomStatus}
    
    for room in _rooms_database[hotel_id].values():
        occupancy_summary[room["room_type"]] += 1 if room["status"] == RoomStatus.OCCUPIED.value else 0
        status_summary[room["status"]] += 1
    
    # Calculate metrics
    occupied = status_summary[RoomStatus.OCCUPIED.value]
    occupancy_rate = (occupied / total_rooms * 100) if total_rooms > 0 else 0
    
    # Historical analysis
    historical_occupied = len([h for h in _occupancy_history.get(hotel_id, [])])
    avg_stay_length = (
        sum(h["duration_nights"] for h in _occupancy_history.get(hotel_id, []))
        / len(_occupancy_history[hotel_id]) if _occupancy_history[hotel_id] else 0
    )
    
    report = {
        "success": True,
        "report": {
            "hotel_id": hotel_id,
            "report_date": datetime.now().isoformat(),
            "analysis_period_days": days,
            "occupancy_metrics": {
                "total_rooms": total_rooms,
                "occupied_rooms": occupied,
                "available_rooms": status_summary[RoomStatus.AVAILABLE.value],
                "maintenance_rooms": status_summary[RoomStatus.MAINTENANCE.value],
                "dirty_rooms": status_summary[RoomStatus.DIRTY.value],
                "occupancy_rate_percent": round(occupancy_rate, 2)
            },
            "by_room_type": occupancy_summary,
            "historical_data": {
                "total_check_outs": historical_occupied,
                "average_stay_length_nights": round(avg_stay_length, 2)
            },
            "recommendations": _generate_room_recommendations(occupancy_rate)
        }
    }
    
    return report

def _generate_room_recommendations(occupancy_rate: float) -> List[str]:
    """Generate occupancy recommendations based on rate."""
    recommendations = []
    if occupancy_rate < 60:
        recommendations.append("Low occupancy - Consider promotional pricing")
    elif occupancy_rate > 90:
        recommendations.append("High occupancy - Optimize pricing")
    if occupancy_rate < 40:
        recommendations.append("Very low occupancy - Review marketing strategy")
    return recommendations

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "assign_room": assign_room,
            "reassign_room": reassign_room,
            "release_room": release_room,
            "check_occupancy": check_occupancy,
            "get_available_rooms": get_available_rooms,
            "generate_occupancy_report": generate_occupancy_report
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
        "action": "assign_room",
        "payload": {
            "guest_id": "GUEST_001",
            "check_in_date": "2026-01-30",
            "check_out_date": "2026-02-02",
            "room_type": "deluxe",
            "hotel_id": "HOTEL_001"
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
