#!/usr/bin/env python3
"""
TABLE_MANAGEMENT Plugin - Table management and seating operations
Manages table status, assignments, floor layout, and turnover tracking.
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

class TableStatus(Enum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    RESERVED = "reserved"
    MAINTENANCE = "maintenance"
    CLEANING = "cleaning"

class TableType(Enum):
    TOP_2 = "2-top"
    TOP_4 = "4-top"
    TOP_6 = "6-top"
    TOP_8 = "8-top"
    BOOTH = "booth"
    COUNTER = "counter"

# In-Memory Data Storage
_tables = {}
_table_assignments = {}
_floor_layouts = {}
_turnover_history = {}
_server_assignments = {}

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
    """Initialize restaurant table structures."""
    if restaurant_id not in _tables:
        _tables[restaurant_id] = _create_floor_tables()
        _table_assignments[restaurant_id] = {}
        _floor_layouts[restaurant_id] = _create_floor_layout()
        _turnover_history[restaurant_id] = []
        _server_assignments[restaurant_id] = {}

def _create_floor_tables() -> Dict[str, Dict[str, Any]]:
    """Create default table configuration."""
    tables = {}
    
    # Section A: 2-tops
    for i in range(1, 6):
        table_id = f"A{i}"
        tables[table_id] = {
            "table_id": table_id,
            "section": "A",
            "type": TableType.TOP_2.value,
            "capacity": 2,
            "status": TableStatus.AVAILABLE.value,
            "location": {"x": 10 + (i * 5), "y": 10},
            "assigned_guest": None,
            "occupied_since": None,
            "reservation_id": None,
            "maintenance_notes": None
        }
    
    # Section B: 4-tops
    for i in range(1, 8):
        table_id = f"B{i}"
        tables[table_id] = {
            "table_id": table_id,
            "section": "B",
            "type": TableType.TOP_4.value,
            "capacity": 4,
            "status": TableStatus.AVAILABLE.value,
            "location": {"x": 10 + (i * 5), "y": 30},
            "assigned_guest": None,
            "occupied_since": None,
            "reservation_id": None,
            "maintenance_notes": None
        }
    
    # Section C: 6-tops
    for i in range(1, 4):
        table_id = f"C{i}"
        tables[table_id] = {
            "table_id": table_id,
            "section": "C",
            "type": TableType.TOP_6.value,
            "capacity": 6,
            "status": TableStatus.AVAILABLE.value,
            "location": {"x": 10 + (i * 10), "y": 50},
            "assigned_guest": None,
            "occupied_since": None,
            "reservation_id": None,
            "maintenance_notes": None
        }
    
    # Booths
    for i in range(1, 4):
        table_id = f"BOOTH{i}"
        tables[table_id] = {
            "table_id": table_id,
            "section": "VIP",
            "type": TableType.BOOTH.value,
            "capacity": 8,
            "status": TableStatus.AVAILABLE.value,
            "location": {"x": 60 + (i * 5), "y": 30},
            "assigned_guest": None,
            "occupied_since": None,
            "reservation_id": None,
            "maintenance_notes": None
        }
    
    # Counter seating
    for i in range(1, 11):
        table_id = f"CTR{i}"
        tables[table_id] = {
            "table_id": table_id,
            "section": "Counter",
            "type": TableType.COUNTER.value,
            "capacity": 1,
            "status": TableStatus.AVAILABLE.value,
            "location": {"x": 30, "y": 70 + i},
            "assigned_guest": None,
            "occupied_since": None,
            "reservation_id": None,
            "maintenance_notes": None
        }
    
    return tables

def _create_floor_layout() -> Dict[str, Any]:
    """Create floor layout configuration."""
    return {
        "name": "Main Dining Floor",
        "total_capacity": 120,
        "sections": ["A", "B", "C", "VIP", "Counter"],
        "dimensions": {"width": 100, "height": 100},
        "server_stations": [
            {"station_id": "STN1", "location": {"x": 50, "y": 0}, "assigned_server": None},
            {"station_id": "STN2", "location": {"x": 50, "y": 50}, "assigned_server": None}
        ],
        "created_at": datetime.now().isoformat()
    }

def assign_table(payload: dict) -> Dict[str, Any]:
    """Assign a table to a guest or reservation."""
    required = ["table_id", "guest_name"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    table_id = payload.get("table_id")
    guest_name = payload.get("guest_name")
    party_size = payload.get("party_size", 1)
    reservation_id = payload.get("reservation_id")
    
    _initialize_restaurant(restaurant_id)
    
    if table_id not in _tables[restaurant_id]:
        return {"success": False, "error": f"Table {table_id} not found"}
    
    table = _tables[restaurant_id][table_id]
    
    if table["status"] != TableStatus.AVAILABLE.value:
        return {"success": False, "error": f"Table {table_id} is not available ({table['status']})"}
    
    if party_size > table["capacity"]:
        return {"success": False, "error": f"Party size {party_size} exceeds table capacity {table['capacity']}"}
    
    # Assign table
    table["status"] = TableStatus.OCCUPIED.value
    table["assigned_guest"] = guest_name
    table["occupied_since"] = datetime.now().isoformat()
    table["reservation_id"] = reservation_id
    
    assignment_id = f"ASSGN_{restaurant_id}_{table_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    _table_assignments[restaurant_id][assignment_id] = {
        "assignment_id": assignment_id,
        "table_id": table_id,
        "guest_name": guest_name,
        "party_size": party_size,
        "reservation_id": reservation_id,
        "assigned_at": datetime.now().isoformat(),
        "check_in_time": datetime.now().isoformat(),
        "status": "active"
    }
    
    return {
        "success": True,
        "assignment_id": assignment_id,
        "table_id": table_id,
        "guest_name": guest_name,
        "table_details": {
            "section": table["section"],
            "type": table["type"],
            "capacity": table["capacity"],
            "location": table["location"]
        }
    }

def reassign_table(payload: dict) -> Dict[str, Any]:
    """Reassign a guest to a different table."""
    required = ["current_table_id", "new_table_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    current_table_id = payload.get("current_table_id")
    new_table_id = payload.get("new_table_id")
    reason = payload.get("reason", "Guest request")
    
    _initialize_restaurant(restaurant_id)
    
    if current_table_id not in _tables[restaurant_id]:
        return {"success": False, "error": f"Current table {current_table_id} not found"}
    
    if new_table_id not in _tables[restaurant_id]:
        return {"success": False, "error": f"New table {new_table_id} not found"}
    
    current_table = _tables[restaurant_id][current_table_id]
    new_table = _tables[restaurant_id][new_table_id]
    
    if current_table["status"] != TableStatus.OCCUPIED.value:
        return {"success": False, "error": f"Current table is not occupied"}
    
    if new_table["status"] != TableStatus.AVAILABLE.value:
        return {"success": False, "error": f"New table is not available"}
    
    if current_table["assigned_guest"]:
        party_size_estimate = current_table["capacity"]  # Approximate
        if party_size_estimate > new_table["capacity"]:
            return {"success": False, "error": f"New table capacity insufficient"}
    
    # Perform reassignment
    guest_name = current_table["assigned_guest"]
    reservation_id = current_table["reservation_id"]
    
    current_table["status"] = TableStatus.AVAILABLE.value
    current_table["assigned_guest"] = None
    current_table["occupied_since"] = None
    
    new_table["status"] = TableStatus.OCCUPIED.value
    new_table["assigned_guest"] = guest_name
    new_table["occupied_since"] = datetime.now().isoformat()
    new_table["reservation_id"] = reservation_id
    
    _turnover_history[restaurant_id].append({
        "action": "reassignment",
        "from_table": current_table_id,
        "to_table": new_table_id,
        "guest": guest_name,
        "reason": reason,
        "timestamp": datetime.now().isoformat()
    })
    
    return {
        "success": True,
        "previous_table": current_table_id,
        "new_table": new_table_id,
        "guest_name": guest_name,
        "reason": reason,
        "new_location": new_table["location"]
    }

def release_table(payload: dict) -> Dict[str, Any]:
    """Release a table when guest departs."""
    required = ["table_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    table_id = payload.get("table_id")
    
    _initialize_restaurant(restaurant_id)
    
    if table_id not in _tables[restaurant_id]:
        return {"success": False, "error": f"Table {table_id} not found"}
    
    table = _tables[restaurant_id][table_id]
    
    if table["status"] not in [TableStatus.OCCUPIED.value, TableStatus.RESERVED.value]:
        return {"success": False, "error": f"Table {table_id} is not occupied or reserved"}
    
    guest_name = table["assigned_guest"]
    check_in_time = table["occupied_since"]
    
    # Calculate duration
    if check_in_time:
        try:
            check_in = datetime.fromisoformat(check_in_time)
            duration_minutes = int((datetime.now() - check_in).total_seconds() / 60)
        except:
            duration_minutes = 0
    else:
        duration_minutes = 0
    
    # Release table
    table["status"] = TableStatus.CLEANING.value
    table["assigned_guest"] = None
    table["occupied_since"] = None
    
    _turnover_history[restaurant_id].append({
        "action": "table_release",
        "table_id": table_id,
        "guest": guest_name,
        "duration_minutes": duration_minutes,
        "timestamp": datetime.now().isoformat()
    })
    
    return {
        "success": True,
        "table_id": table_id,
        "guest_name": guest_name,
        "duration_minutes": duration_minutes,
        "status": "cleaning",
        "released_at": datetime.now().isoformat()
    }

def check_table_status(payload: dict) -> Dict[str, Any]:
    """Check the current status of a specific table."""
    required = ["table_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    table_id = payload.get("table_id")
    
    _initialize_restaurant(restaurant_id)
    
    if table_id not in _tables[restaurant_id]:
        return {"success": False, "error": f"Table {table_id} not found"}
    
    table = _tables[restaurant_id][table_id]
    
    return {
        "success": True,
        "table_id": table_id,
        "status": table["status"],
        "type": table["type"],
        "capacity": table["capacity"],
        "section": table["section"],
        "assigned_guest": table["assigned_guest"],
        "occupied_since": table["occupied_since"],
        "reservation_id": table["reservation_id"]
    }

def get_available_tables(payload: dict) -> Dict[str, Any]:
    """Get all available tables with optional filtering."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    min_capacity = payload.get("min_capacity", 1)
    section = payload.get("section")
    table_type = payload.get("table_type")
    
    _initialize_restaurant(restaurant_id)
    
    available = []
    for table_id, table in _tables[restaurant_id].items():
        if table["status"] == TableStatus.AVAILABLE.value and table["capacity"] >= min_capacity:
            if section and table["section"] != section:
                continue
            if table_type and table["type"] != table_type:
                continue
            available.append({
                "table_id": table_id,
                "type": table["type"],
                "capacity": table["capacity"],
                "section": table["section"],
                "location": table["location"]
            })
    
    return {
        "success": True,
        "available_tables": len(available),
        "tables": sorted(available, key=lambda x: x["table_id"]),
        "by_section": _group_by_section(available)
    }

def _group_by_section(tables: List[Dict]) -> Dict[str, int]:
    """Group available tables by section."""
    sections = {}
    for table in tables:
        section = table["section"]
        sections[section] = sections.get(section, 0) + 1
    return sections

def generate_floor_status(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive floor status report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    
    _initialize_restaurant(restaurant_id)
    
    tables = _tables[restaurant_id]
    
    # Calculate status counts
    status_counts = {}
    for status in TableStatus:
        count = sum(1 for t in tables.values() if t["status"] == status.value)
        status_counts[status.value] = count
    
    # Group by section
    section_status = {}
    for table in tables.values():
        section = table["section"]
        if section not in section_status:
            section_status[section] = {"available": 0, "occupied": 0, "total": 0}
        section_status[section]["total"] += 1
        if table["status"] == TableStatus.AVAILABLE.value:
            section_status[section]["available"] += 1
        elif table["status"] == TableStatus.OCCUPIED.value:
            section_status[section]["occupied"] += 1
    
    # Calculate occupancy rate
    occupied = status_counts.get(TableStatus.OCCUPIED.value, 0)
    total = len(tables)
    occupancy_rate = (occupied / total * 100) if total > 0 else 0
    
    return {
        "success": True,
        "timestamp": datetime.now().isoformat(),
        "floor_status": {
            "total_tables": total,
            "occupancy_rate": round(occupancy_rate, 1),
            "status_distribution": status_counts
        },
        "section_status": section_status,
        "recent_activity": _turnover_history[restaurant_id][-10:]
    }

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "assign_table":
            return assign_table(payload)
        elif action_lower == "reassign_table":
            return reassign_table(payload)
        elif action_lower == "release_table":
            return release_table(payload)
        elif action_lower == "check_table_status":
            return check_table_status(payload)
        elif action_lower == "get_available_tables":
            return get_available_tables(payload)
        elif action_lower == "generate_floor_status":
            return generate_floor_status(payload)
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
