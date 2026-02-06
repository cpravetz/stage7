#!/usr/bin/env python3
"""
FLOOR_MANAGEMENT Plugin - Floor layout and operations management
Manages floor configuration, table mapping, server stations, and capacity management.
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

class SectionType(Enum):
    DINING = "dining"
    BAR = "bar"
    PATIO = "patio"
    PRIVATE = "private"
    LOUNGE = "lounge"

class StationRole(Enum):
    SERVER = "server"
    BARTENDER = "bartender"
    EXPO = "expo"
    HOST = "host"

# In-Memory Data Storage
_floor_layouts = {}
_section_configs = {}
_server_stations = {}
_capacity_tracking = {}
_server_zone_assignments = {}
_floor_events = {}

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
    """Initialize restaurant floor management structures."""
    if restaurant_id not in _floor_layouts:
        _floor_layouts[restaurant_id] = _create_default_floor_layout()
        _section_configs[restaurant_id] = _create_section_configurations()
        _server_stations[restaurant_id] = _create_server_stations()
        _capacity_tracking[restaurant_id] = _initialize_capacity_tracking()
        _server_zone_assignments[restaurant_id] = {}
        _floor_events[restaurant_id] = []

def _create_default_floor_layout() -> Dict[str, Any]:
    """Create default floor layout configuration."""
    return {
        "floor_id": f"FLOOR_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "name": "Main Dining Floor",
        "total_capacity": 150,
        "current_occupancy": 0,
        "dimensions": {"width": 100, "height": 80},
        "created_at": datetime.now().isoformat(),
        "last_modified": datetime.now().isoformat(),
        "sections": ["Dining A", "Dining B", "Bar", "Patio", "Private"],
        "table_count": 25,
        "server_stations": 3,
        "is_active": True
    }

def _create_section_configurations() -> Dict[str, Dict[str, Any]]:
    """Create section configurations."""
    return {
        "Dining A": {
            "section_id": "SEC_DINING_A",
            "name": "Dining A",
            "type": SectionType.DINING.value,
            "capacity": 50,
            "current_occupancy": 0,
            "table_count": 10,
            "tables": [f"A{i}" for i in range(1, 11)],
            "location": {"x": 10, "y": 10},
            "description": "Main dining area with 10 tables"
        },
        "Dining B": {
            "section_id": "SEC_DINING_B",
            "name": "Dining B",
            "type": SectionType.DINING.value,
            "capacity": 50,
            "current_occupancy": 0,
            "table_count": 10,
            "tables": [f"B{i}" for i in range(1, 11)],
            "location": {"x": 50, "y": 10},
            "description": "Secondary dining area"
        },
        "Bar": {
            "section_id": "SEC_BAR",
            "name": "Bar Area",
            "type": SectionType.BAR.value,
            "capacity": 20,
            "current_occupancy": 0,
            "table_count": 0,
            "bar_seating": 15,
            "location": {"x": 80, "y": 30},
            "description": "Bar with standing and seating"
        },
        "Patio": {
            "section_id": "SEC_PATIO",
            "name": "Outdoor Patio",
            "type": SectionType.PATIO.value,
            "capacity": 25,
            "current_occupancy": 0,
            "table_count": 5,
            "tables": [f"PTI{i}" for i in range(1, 6)],
            "location": {"x": 10, "y": 60},
            "description": "Outdoor dining patio"
        },
        "Private": {
            "section_id": "SEC_PRIVATE",
            "name": "Private Dining",
            "type": SectionType.PRIVATE.value,
            "capacity": 30,
            "current_occupancy": 0,
            "table_count": 2,
            "tables": ["PRIV1", "PRIV2"],
            "location": {"x": 50, "y": 60},
            "description": "Private event space"
        }
    }

def _create_server_stations() -> List[Dict[str, Any]]:
    """Create server station configurations."""
    return [
        {
            "station_id": "STN_001",
            "name": "Station 1",
            "role": StationRole.SERVER.value,
            "location": {"x": 30, "y": 40},
            "assigned_staff": None,
            "assigned_sections": ["Dining A", "Patio"],
            "capacity": 20,
            "is_active": True
        },
        {
            "station_id": "STN_002",
            "name": "Station 2",
            "role": StationRole.SERVER.value,
            "location": {"x": 70, "y": 40},
            "assigned_staff": None,
            "assigned_sections": ["Dining B"],
            "capacity": 20,
            "is_active": True
        },
        {
            "station_id": "STN_003",
            "name": "Bar Station",
            "role": StationRole.BARTENDER.value,
            "location": {"x": 80, "y": 30},
            "assigned_staff": None,
            "assigned_sections": ["Bar"],
            "capacity": 10,
            "is_active": True
        }
    ]

def _initialize_capacity_tracking() -> Dict[str, Any]:
    """Initialize capacity tracking."""
    return {
        "total_capacity": 150,
        "current_occupancy": 0,
        "occupancy_percentage": 0.0,
        "available_capacity": 150,
        "peak_capacity_time": None,
        "last_updated": datetime.now().isoformat()
    }

def get_floor_layout(payload: dict) -> Dict[str, Any]:
    """Get complete floor layout configuration."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    include_details = payload.get("include_details", True)
    
    _initialize_restaurant(restaurant_id)
    
    layout = _floor_layouts[restaurant_id].copy()
    
    if include_details:
        layout["sections"] = _section_configs[restaurant_id]
        layout["server_stations"] = _server_stations[restaurant_id]
    
    return {
        "success": True,
        "floor_layout": layout,
        "capacity_status": _capacity_tracking[restaurant_id]
    }

def update_table_status(payload: dict) -> Dict[str, Any]:
    """Update table status in section."""
    required = ["section_name", "table_id", "status"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    section_name = payload.get("section_name")
    table_id = payload.get("table_id")
    status = payload.get("status")
    guest_count = payload.get("guest_count", 0)
    
    _initialize_restaurant(restaurant_id)
    
    if section_name not in _section_configs[restaurant_id]:
        return {"success": False, "error": f"Section {section_name} not found"}
    
    section = _section_configs[restaurant_id][section_name]
    
    if table_id not in section.get("tables", []):
        return {"success": False, "error": f"Table {table_id} not found in section {section_name}"}
    
    # Valid statuses
    valid_statuses = ["available", "occupied", "reserved", "cleaning", "maintenance"]
    if status not in valid_statuses:
        return {"success": False, "error": f"Invalid status: {status}"}
    
    # Record status change
    _floor_events[restaurant_id].append({
        "event_type": "table_status_change",
        "section": section_name,
        "table_id": table_id,
        "old_status": "unknown",
        "new_status": status,
        "guest_count": guest_count,
        "timestamp": datetime.now().isoformat()
    })
    
    # Update capacity if status is occupied
    if status == "occupied":
        section["current_occupancy"] += guest_count
        _capacity_tracking[restaurant_id]["current_occupancy"] += guest_count
    
    total_capacity = _capacity_tracking[restaurant_id]["total_capacity"]
    current_occupancy = _capacity_tracking[restaurant_id]["current_occupancy"]
    occupancy_pct = (current_occupancy / total_capacity * 100) if total_capacity > 0 else 0
    
    _capacity_tracking[restaurant_id]["occupancy_percentage"] = round(occupancy_pct, 1)
    _capacity_tracking[restaurant_id]["available_capacity"] = total_capacity - current_occupancy
    _capacity_tracking[restaurant_id]["last_updated"] = datetime.now().isoformat()
    
    return {
        "success": True,
        "table_id": table_id,
        "section": section_name,
        "status": status,
        "section_occupancy": section["current_occupancy"],
        "floor_occupancy_percentage": _capacity_tracking[restaurant_id]["occupancy_percentage"]
    }

def manage_capacity(payload: dict) -> Dict[str, Any]:
    """Manage overall floor capacity."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    action = payload.get("action", "get")  # get, adjust, peak
    
    _initialize_restaurant(restaurant_id)
    
    if action == "get":
        return {
            "success": True,
            "capacity_status": _capacity_tracking[restaurant_id]
        }
    
    elif action == "adjust":
        adjustment = payload.get("adjustment", 0)
        if isinstance(adjustment, int):
            _capacity_tracking[restaurant_id]["current_occupancy"] += adjustment
            if _capacity_tracking[restaurant_id]["current_occupancy"] < 0:
                _capacity_tracking[restaurant_id]["current_occupancy"] = 0
            
            total = _capacity_tracking[restaurant_id]["total_capacity"]
            current = _capacity_tracking[restaurant_id]["current_occupancy"]
            pct = (current / total * 100) if total > 0 else 0
            
            _capacity_tracking[restaurant_id]["occupancy_percentage"] = round(pct, 1)
            _capacity_tracking[restaurant_id]["available_capacity"] = total - current
            _capacity_tracking[restaurant_id]["last_updated"] = datetime.now().isoformat()
            
            return {
                "success": True,
                "adjustment": adjustment,
                "new_occupancy": current,
                "occupancy_percentage": _capacity_tracking[restaurant_id]["occupancy_percentage"]
            }
    
    elif action == "peak":
        _capacity_tracking[restaurant_id]["peak_capacity_time"] = datetime.now().isoformat()
        return {
            "success": True,
            "peak_marked_at": _capacity_tracking[restaurant_id]["peak_capacity_time"],
            "current_occupancy": _capacity_tracking[restaurant_id]["current_occupancy"]
        }
    
    return {"success": False, "error": f"Unknown action: {action}"}

def track_server_stations(payload: dict) -> Dict[str, Any]:
    """Track and manage server station assignments."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    action = payload.get("action", "get")  # get, assign, update
    
    _initialize_restaurant(restaurant_id)
    
    if action == "get":
        stations = []
        for station in _server_stations[restaurant_id]:
            stations.append({
                "station_id": station["station_id"],
                "name": station["name"],
                "role": station["role"],
                "assigned_staff": station["assigned_staff"],
                "assigned_sections": station["assigned_sections"],
                "capacity": station["capacity"],
                "is_active": station["is_active"]
            })
        return {
            "success": True,
            "total_stations": len(stations),
            "stations": stations
        }
    
    elif action == "assign":
        required = ["station_id", "staff_id", "staff_name"]
        is_valid, error = _validate_params(payload, required)
        if not is_valid:
            return {"success": False, "error": error}
        
        station_id = payload.get("station_id")
        staff_id = payload.get("staff_id")
        staff_name = payload.get("staff_name")
        
        # Find station
        station = None
        for s in _server_stations[restaurant_id]:
            if s["station_id"] == station_id:
                station = s
                break
        
        if not station:
            return {"success": False, "error": f"Station {station_id} not found"}
        
        station["assigned_staff"] = {
            "staff_id": staff_id,
            "staff_name": staff_name,
            "assigned_at": datetime.now().isoformat()
        }
        
        _floor_events[restaurant_id].append({
            "event_type": "station_assignment",
            "station_id": station_id,
            "staff_id": staff_id,
            "staff_name": staff_name,
            "timestamp": datetime.now().isoformat()
        })
        
        return {
            "success": True,
            "station_id": station_id,
            "assigned_staff": staff_name,
            "assigned_sections": station["assigned_sections"]
        }
    
    return {"success": False, "error": f"Unknown action: {action}"}

def generate_floor_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive floor status report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    include_history = payload.get("include_history", False)
    
    _initialize_restaurant(restaurant_id)
    
    # Collect section summary
    section_summary = []
    for section_name, section in _section_configs[restaurant_id].items():
        section_summary.append({
            "section": section_name,
            "type": section.get("type"),
            "capacity": section.get("capacity"),
            "occupancy": section.get("current_occupancy", 0),
            "occupancy_percentage": round(section.get("current_occupancy", 0) / section.get("capacity", 1) * 100, 1)
        })
    
    # Station assignments
    station_summary = []
    for station in _server_stations[restaurant_id]:
        station_summary.append({
            "station_id": station["station_id"],
            "name": station["name"],
            "role": station["role"],
            "assigned_staff": station.get("assigned_staff"),
            "sections": station.get("assigned_sections", [])
        })
    
    # Prepare report
    report = {
        "success": True,
        "report_timestamp": datetime.now().isoformat(),
        "floor_summary": {
            "total_capacity": _floor_layouts[restaurant_id]["total_capacity"],
            "current_occupancy": _capacity_tracking[restaurant_id]["current_occupancy"],
            "available_capacity": _capacity_tracking[restaurant_id]["available_capacity"],
            "occupancy_percentage": _capacity_tracking[restaurant_id]["occupancy_percentage"]
        },
        "sections": section_summary,
        "stations": station_summary
    }
    
    if include_history:
        report["recent_events"] = _floor_events[restaurant_id][-20:]
    
    return report

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "get_floor_layout":
            return get_floor_layout(payload)
        elif action_lower == "update_table_status":
            return update_table_status(payload)
        elif action_lower == "manage_capacity":
            return manage_capacity(payload)
        elif action_lower == "track_server_stations":
            return track_server_stations(payload)
        elif action_lower == "generate_floor_report":
            return generate_floor_report(payload)
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
