#!/usr/bin/env python3
"""
STAFF_SCHEDULER Plugin - Staff scheduling for restaurant
Manages shift creation, staff assignments, labor hours, and coverage optimization.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta, time
from enum import Enum
import uuid

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ShiftType(Enum):
    MORNING = "morning"      # 6:00 - 14:00
    AFTERNOON = "afternoon"  # 14:00 - 22:00
    EVENING = "evening"      # 17:00 - 23:00
    FULL_TIME = "full_time"  # 6:00 - 22:00
    CUSTOM = "custom"

class EmployeeRole(Enum):
    SERVER = "server"
    HOST = "host"
    BARTENDER = "bartender"
    COOK = "cook"
    MANAGER = "manager"
    BUSSER = "busser"

class ShiftStatus(Enum):
    OPEN = "open"
    ASSIGNED = "assigned"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

# In-Memory Data Storage
_employees = {}
_shifts = {}
_schedules = {}
_labor_tracking = {}
_availability = {}
_shift_history = {}

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
    """Initialize restaurant scheduling structures."""
    if restaurant_id not in _employees:
        _employees[restaurant_id] = _create_default_employees()
        _shifts[restaurant_id] = {}
        _schedules[restaurant_id] = {}
        _labor_tracking[restaurant_id] = {}
        _availability[restaurant_id] = {}
        _shift_history[restaurant_id] = []

def _create_default_employees() -> Dict[str, Dict[str, Any]]:
    """Create default employee records."""
    employees = {}
    
    # Create sample employees
    employee_data = [
        ("EMP001", "John Smith", EmployeeRole.SERVER.value, 15.50),
        ("EMP002", "Sarah Johnson", EmployeeRole.SERVER.value, 16.00),
        ("EMP003", "Mike Chen", EmployeeRole.BARTENDER.value, 18.00),
        ("EMP004", "Lisa Rodriguez", EmployeeRole.HOST.value, 14.50),
        ("EMP005", "James Wilson", EmployeeRole.COOK.value, 17.50),
        ("EMP006", "Emily Davis", EmployeeRole.MANAGER.value, 22.00),
        ("EMP007", "Carlos Martinez", EmployeeRole.BUSSER.value, 13.50),
        ("EMP008", "Anna Thompson", EmployeeRole.SERVER.value, 15.75),
    ]
    
    for emp_id, name, role, hourly_rate in employee_data:
        employees[emp_id] = {
            "employee_id": emp_id,
            "name": name,
            "role": role,
            "hourly_rate": hourly_rate,
            "hired_date": (datetime.now() - timedelta(days=365)).isoformat(),
            "status": "active",
            "max_hours_per_week": 40,
            "min_hours_per_week": 20,
            "certifications": [],
            "notes": ""
        }
    
    return employees

def _get_shift_hours(shift_type: str) -> Tuple[int, int]:
    """Get hours for shift type."""
    if shift_type == ShiftType.MORNING.value:
        return (6, 14)
    elif shift_type == ShiftType.AFTERNOON.value:
        return (14, 22)
    elif shift_type == ShiftType.EVENING.value:
        return (17, 23)
    elif shift_type == ShiftType.FULL_TIME.value:
        return (6, 22)
    else:
        return (6, 14)  # Default

def create_schedule(payload: dict) -> Dict[str, Any]:
    """Create a new schedule for a date range."""
    required = ["schedule_name", "start_date", "end_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    schedule_name = payload.get("schedule_name")
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    
    _initialize_restaurant(restaurant_id)
    
    # Validate dates
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
        if end < start:
            return {"success": False, "error": "End date must be after start date"}
    except ValueError:
        return {"success": False, "error": "Invalid date format (use YYYY-MM-DD)"}
    
    schedule_id = f"SCHED_{restaurant_id}_{uuid.uuid4().hex[:8].upper()}"
    
    schedule = {
        "schedule_id": schedule_id,
        "schedule_name": schedule_name,
        "start_date": start_date,
        "end_date": end_date,
        "created_at": datetime.now().isoformat(),
        "status": "draft",
        "shifts_assigned": 0,
        "total_labor_hours": 0,
        "estimated_labor_cost": 0.0,
        "coverage": {}
    }
    
    _schedules[restaurant_id][schedule_id] = schedule
    
    return {
        "success": True,
        "schedule_id": schedule_id,
        "schedule_name": schedule_name,
        "period": f"{start_date} to {end_date}",
        "status": "draft"
    }

def assign_shift(payload: dict) -> Dict[str, Any]:
    """Assign a shift to an employee."""
    required = ["schedule_id", "employee_id", "shift_date", "shift_type"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    schedule_id = payload.get("schedule_id")
    employee_id = payload.get("employee_id")
    shift_date = payload.get("shift_date")
    shift_type = payload.get("shift_type")
    
    _initialize_restaurant(restaurant_id)
    
    # Validate schedule exists
    if schedule_id not in _schedules[restaurant_id]:
        return {"success": False, "error": f"Schedule {schedule_id} not found"}
    
    # Validate employee exists
    if employee_id not in _employees[restaurant_id]:
        return {"success": False, "error": f"Employee {employee_id} not found"}
    
    # Validate shift type
    valid_shift_types = [s.value for s in ShiftType]
    if shift_type not in valid_shift_types:
        return {"success": False, "error": f"Invalid shift type: {shift_type}"}
    
    # Get shift hours
    start_hour, end_hour = _get_shift_hours(shift_type)
    duration_hours = end_hour - start_hour
    
    employee = _employees[restaurant_id][employee_id]
    hourly_rate = employee["hourly_rate"]
    shift_cost = duration_hours * hourly_rate
    
    shift_id = f"SHIFT_{restaurant_id}_{shift_date}_{employee_id}_{uuid.uuid4().hex[:4].upper()}"
    
    shift = {
        "shift_id": shift_id,
        "schedule_id": schedule_id,
        "employee_id": employee_id,
        "employee_name": employee["name"],
        "role": employee["role"],
        "shift_date": shift_date,
        "shift_type": shift_type,
        "start_time": f"{start_hour:02d}:00",
        "end_time": f"{end_hour:02d}:00",
        "duration_hours": duration_hours,
        "hourly_rate": hourly_rate,
        "shift_cost": shift_cost,
        "status": ShiftStatus.ASSIGNED.value,
        "created_at": datetime.now().isoformat(),
        "notes": payload.get("notes", "")
    }
    
    _shifts[restaurant_id][shift_id] = shift
    
    # Update schedule
    schedule = _schedules[restaurant_id][schedule_id]
    schedule["shifts_assigned"] += 1
    schedule["total_labor_hours"] += duration_hours
    schedule["estimated_labor_cost"] += shift_cost
    
    _shift_history[restaurant_id].append({
        "action": "shift_assigned",
        "shift_id": shift_id,
        "employee_id": employee_id,
        "timestamp": datetime.now().isoformat()
    })
    
    return {
        "success": True,
        "shift_id": shift_id,
        "employee": employee["name"],
        "date": shift_date,
        "shift_type": shift_type,
        "hours": duration_hours,
        "cost": shift_cost
    }

def update_shift(payload: dict) -> Dict[str, Any]:
    """Update an existing shift."""
    required = ["shift_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    shift_id = payload.get("shift_id")
    
    _initialize_restaurant(restaurant_id)
    
    if shift_id not in _shifts[restaurant_id]:
        return {"success": False, "error": f"Shift {shift_id} not found"}
    
    shift = _shifts[restaurant_id][shift_id]
    
    # Update fields
    if "status" in payload:
        new_status = payload["status"]
        if new_status in [s.value for s in ShiftStatus]:
            shift["status"] = new_status
        else:
            return {"success": False, "error": f"Invalid status: {new_status}"}
    
    if "notes" in payload:
        shift["notes"] = payload["notes"]
    
    if "shift_type" in payload:
        new_shift_type = payload["shift_type"]
        valid_types = [s.value for s in ShiftType]
        if new_shift_type in valid_types:
            start_hour, end_hour = _get_shift_hours(new_shift_type)
            shift["shift_type"] = new_shift_type
            shift["start_time"] = f"{start_hour:02d}:00"
            shift["end_time"] = f"{end_hour:02d}:00"
            shift["duration_hours"] = end_hour - start_hour
            shift["shift_cost"] = shift["duration_hours"] * shift["hourly_rate"]
    
    _shift_history[restaurant_id].append({
        "action": "shift_updated",
        "shift_id": shift_id,
        "timestamp": datetime.now().isoformat(),
        "changes": list(payload.keys())
    })
    
    return {
        "success": True,
        "shift_id": shift_id,
        "updated_fields": list(payload.keys()),
        "shift_type": shift["shift_type"],
        "hours": shift["duration_hours"],
        "status": shift["status"]
    }

def get_schedule(payload: dict) -> Dict[str, Any]:
    """Retrieve schedule with filtering options."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    schedule_id = payload.get("schedule_id")
    date_filter = payload.get("date_filter")
    employee_filter = payload.get("employee_filter")
    
    _initialize_restaurant(restaurant_id)
    
    if schedule_id:
        # Get specific schedule
        if schedule_id not in _schedules[restaurant_id]:
            return {"success": False, "error": f"Schedule {schedule_id} not found"}
        
        schedule = _schedules[restaurant_id][schedule_id]
        shifts = [s for s in _shifts[restaurant_id].values() if s["schedule_id"] == schedule_id]
    else:
        # Get all schedules
        schedules = list(_schedules[restaurant_id].values())
        return {
            "success": True,
            "total_schedules": len(schedules),
            "schedules": schedules[:10]
        }
    
    # Filter shifts
    if date_filter:
        shifts = [s for s in shifts if s["shift_date"] == date_filter]
    
    if employee_filter:
        shifts = [s for s in shifts if s["employee_id"] == employee_filter]
    
    # Calculate totals
    total_hours = sum(s["duration_hours"] for s in shifts)
    total_cost = sum(s["shift_cost"] for s in shifts)
    
    return {
        "success": True,
        "schedule_id": schedule_id,
        "schedule_name": schedule["schedule_name"],
        "period": f"{schedule['start_date']} to {schedule['end_date']}",
        "total_shifts": len(shifts),
        "total_labor_hours": total_hours,
        "estimated_labor_cost": round(total_cost, 2),
        "shifts": shifts[:50]
    }

def track_labor_hours(payload: dict) -> Dict[str, Any]:
    """Track labor hours and costs."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    period = payload.get("period", "current_week")  # week or month
    
    _initialize_restaurant(restaurant_id)
    
    all_shifts = list(_shifts[restaurant_id].values())
    
    # Calculate by employee
    employee_hours = {}
    for shift in all_shifts:
        emp_id = shift["employee_id"]
        if emp_id not in employee_hours:
            employee_hours[emp_id] = {
                "employee_id": emp_id,
                "employee_name": shift["employee_name"],
                "role": shift["role"],
                "hours": 0,
                "cost": 0,
                "shift_count": 0
            }
        
        employee_hours[emp_id]["hours"] += shift["duration_hours"]
        employee_hours[emp_id]["cost"] += shift["shift_cost"]
        employee_hours[emp_id]["shift_count"] += 1
    
    # Calculate by role
    role_summary = {}
    for shift in all_shifts:
        role = shift["role"]
        if role not in role_summary:
            role_summary[role] = {"hours": 0, "cost": 0, "count": 0}
        role_summary[role]["hours"] += shift["duration_hours"]
        role_summary[role]["cost"] += shift["shift_cost"]
        role_summary[role]["count"] += 1
    
    total_hours = sum(e["hours"] for e in employee_hours.values())
    total_cost = sum(e["cost"] for e in employee_hours.values())
    
    return {
        "success": True,
        "period": period,
        "summary": {
            "total_hours": total_hours,
            "total_cost": round(total_cost, 2),
            "shifts_count": len(all_shifts)
        },
        "by_employee": list(employee_hours.values())[:20],
        "by_role": role_summary
    }

def generate_schedule_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive schedule report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    schedule_id = payload.get("schedule_id")
    
    _initialize_restaurant(restaurant_id)
    
    if schedule_id not in _schedules[restaurant_id]:
        return {"success": False, "error": f"Schedule {schedule_id} not found"}
    
    schedule = _schedules[restaurant_id][schedule_id]
    schedule_shifts = [s for s in _shifts[restaurant_id].values() if s["schedule_id"] == schedule_id]
    
    # Coverage analysis
    coverage = {}
    for shift in schedule_shifts:
        date = shift["shift_date"]
        if date not in coverage:
            coverage[date] = {"morning": 0, "afternoon": 0, "evening": 0}
        if shift["shift_type"] == ShiftType.MORNING.value:
            coverage[date]["morning"] += 1
        elif shift["shift_type"] == ShiftType.AFTERNOON.value:
            coverage[date]["afternoon"] += 1
        elif shift["shift_type"] == ShiftType.EVENING.value:
            coverage[date]["evening"] += 1
    
    # Employee participation
    employees_scheduled = set(s["employee_id"] for s in schedule_shifts)
    
    # Hours and cost summary
    total_hours = sum(s["duration_hours"] for s in schedule_shifts)
    total_cost = sum(s["shift_cost"] for s in schedule_shifts)
    avg_hours_per_shift = total_hours / len(schedule_shifts) if schedule_shifts else 0
    
    return {
        "success": True,
        "schedule_id": schedule_id,
        "schedule_name": schedule["schedule_name"],
        "period": f"{schedule['start_date']} to {schedule['end_date']}",
        "summary": {
            "total_shifts": len(schedule_shifts),
            "employees_scheduled": len(employees_scheduled),
            "total_labor_hours": total_hours,
            "total_cost": round(total_cost, 2),
            "avg_hours_per_shift": round(avg_hours_per_shift, 1)
        },
        "daily_coverage": coverage,
        "recent_changes": _shift_history[restaurant_id][-5:]
    }

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "create_schedule":
            return create_schedule(payload)
        elif action_lower == "assign_shift":
            return assign_shift(payload)
        elif action_lower == "update_shift":
            return update_shift(payload)
        elif action_lower == "get_schedule":
            return get_schedule(payload)
        elif action_lower == "track_labor_hours":
            return track_labor_hours(payload)
        elif action_lower == "generate_schedule_report":
            return generate_schedule_report(payload)
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
