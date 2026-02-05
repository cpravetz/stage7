#!/usr/bin/env python3
"""
HOUSEKEEPING_SCHEDULER Plugin - Housekeeping task scheduling
Manages cleaning schedules, staff assignments, priority handling, completion tracking, and workload balancing.
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

class TaskStatus(Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class TaskPriority(Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    VIP = "vip"

class RoomStatus(Enum):
    CLEAN = "clean"
    DIRTY = "dirty"
    MAINTENANCE = "maintenance"
    OCCUPIED = "occupied"

# In-Memory Data Storage
_cleaning_tasks = {}
_staff_members = {}
_schedules = {}
_completion_records = {}

CLEANING_TYPES = ["room_cleaning", "bathroom_cleaning", "floor_cleaning", "turnover", "deep_clean"]

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

def _initialize_hotel(hotel_id: str) -> None:
    """Initialize hotel data structures."""
    if hotel_id not in _cleaning_tasks:
        _cleaning_tasks[hotel_id] = {}
        _staff_members[hotel_id] = {}
        _schedules[hotel_id] = []
        _completion_records[hotel_id] = []

def schedule_cleaning(payload: dict) -> Dict[str, Any]:
    """Schedule a cleaning task for a room."""
    required = ["room_id", "cleaning_type"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    room_id = payload.get("room_id")
    cleaning_type = payload.get("cleaning_type")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel(hotel_id)
    
    if cleaning_type not in CLEANING_TYPES:
        return {"success": False, "error": f"Unknown cleaning type: {cleaning_type}"}
    
    # Check for VIP status and set priority
    is_vip = payload.get("is_vip", False)
    priority = TaskPriority.VIP.value if is_vip else payload.get("priority", TaskPriority.NORMAL.value)
    
    task_id = f"TASK_{hotel_id}_{room_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    task = {
        "task_id": task_id,
        "hotel_id": hotel_id,
        "room_id": room_id,
        "cleaning_type": cleaning_type,
        "priority": priority,
        "is_vip": is_vip,
        "status": TaskStatus.PENDING.value,
        "assigned_to": None,
        "estimated_duration_minutes": payload.get("estimated_duration_minutes", 30),
        "scheduled_time": payload.get("scheduled_time", datetime.now().isoformat()),
        "start_time": None,
        "completion_time": None,
        "special_instructions": payload.get("special_instructions", ""),
        "created_at": datetime.now().isoformat(),
        "notes": ""
    }
    
    _cleaning_tasks[hotel_id][task_id] = task
    _schedules[hotel_id].append(task_id)
    
    logger.info(f"Scheduled cleaning task {task_id} for room {room_id}")
    
    return {
        "success": True,
        "task": task
    }

def update_task_status(payload: dict) -> Dict[str, Any]:
    """Update the status of a cleaning task."""
    required = ["task_id", "status"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    task_id = payload.get("task_id")
    status = payload.get("status")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel(hotel_id)
    
    if task_id not in _cleaning_tasks[hotel_id]:
        return {"success": False, "error": f"Task {task_id} not found"}
    
    task = _cleaning_tasks[hotel_id][task_id]
    
    if status not in [s.value for s in TaskStatus]:
        return {"success": False, "error": f"Invalid status: {status}"}
    
    old_status = task["status"]
    task["status"] = status
    
    if status == TaskStatus.IN_PROGRESS.value:
        task["start_time"] = datetime.now().isoformat()
    
    if status == TaskStatus.COMPLETED.value:
        task["completion_time"] = datetime.now().isoformat()
        
        # Record completion
        if hotel_id not in _completion_records:
            _completion_records[hotel_id] = []
        
        _completion_records[hotel_id].append({
            "task_id": task_id,
            "room_id": task["room_id"],
            "assigned_to": task["assigned_to"],
            "completed_at": task["completion_time"],
            "cleaning_type": task["cleaning_type"]
        })
    
    logger.info(f"Updated task {task_id} status: {old_status} -> {status}")
    
    return {
        "success": True,
        "task_update": {
            "task_id": task_id,
            "previous_status": old_status,
            "new_status": status,
            "updated_at": datetime.now().isoformat()
        }
    }

def assign_staff(payload: dict) -> Dict[str, Any]:
    """Assign a staff member to cleaning tasks."""
    required = ["task_id", "staff_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    task_id = payload.get("task_id")
    staff_id = payload.get("staff_id")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel(hotel_id)
    
    if task_id not in _cleaning_tasks[hotel_id]:
        return {"success": False, "error": f"Task {task_id} not found"}
    
    task = _cleaning_tasks[hotel_id][task_id]
    
    # Register staff if not exists
    if staff_id not in _staff_members[hotel_id]:
        _staff_members[hotel_id][staff_id] = {
            "staff_id": staff_id,
            "name": payload.get("staff_name", f"Staff {staff_id}"),
            "assigned_tasks": [],
            "completed_tasks": 0,
            "total_workload_hours": 0.0,
            "specialization": payload.get("specialization", "general")
        }
    
    task["assigned_to"] = staff_id
    task["status"] = TaskStatus.ASSIGNED.value
    
    staff = _staff_members[hotel_id][staff_id]
    staff["assigned_tasks"].append(task_id)
    staff["total_workload_hours"] += task["estimated_duration_minutes"] / 60
    
    logger.info(f"Assigned task {task_id} to staff {staff_id}")
    
    return {
        "success": True,
        "assignment": {
            "task_id": task_id,
            "assigned_to": staff_id,
            "staff_name": staff["name"],
            "room_id": task["room_id"],
            "estimated_duration_minutes": task["estimated_duration_minutes"],
            "priority": task["priority"]
        }
    }

def get_schedule(payload: dict) -> Dict[str, Any]:
    """Get the cleaning schedule for a date or staff member."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    staff_id = payload.get("staff_id")
    date = payload.get("date")
    
    _initialize_hotel(hotel_id)
    
    tasks_list = list(_cleaning_tasks[hotel_id].values())
    
    # Filter by staff
    if staff_id:
        tasks_list = [t for t in tasks_list if t["assigned_to"] == staff_id]
    
    # Filter by date
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            tasks_list = [t for t in tasks_list 
                         if datetime.fromisoformat(t["scheduled_time"]).date() == target_date]
        except:
            pass
    
    # Sort by priority and time
    priority_order = {TaskPriority.VIP.value: 0, TaskPriority.HIGH.value: 1, 
                     TaskPriority.NORMAL.value: 2, TaskPriority.LOW.value: 3}
    tasks_list.sort(key=lambda x: (priority_order.get(x["priority"], 4), x["scheduled_time"]))
    
    return {
        "success": True,
        "schedule": {
            "hotel_id": hotel_id,
            "staff_id": staff_id or "All staff",
            "date": date or "All dates",
            "tasks": tasks_list,
            "total_tasks": len(tasks_list),
            "pending_tasks": len([t for t in tasks_list if t["status"] == TaskStatus.PENDING.value]),
            "in_progress_tasks": len([t for t in tasks_list if t["status"] == TaskStatus.IN_PROGRESS.value])
        }
    }

def track_completion(payload: dict) -> Dict[str, Any]:
    """Track task completion metrics."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    staff_id = payload.get("staff_id")
    
    _initialize_hotel(hotel_id)
    
    records = _completion_records.get(hotel_id, [])
    
    # Filter records
    if staff_id:
        records = [r for r in records if r["assigned_to"] == staff_id]
    
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            records = [r for r in records if datetime.fromisoformat(r["completed_at"]) >= start]
        except:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            records = [r for r in records if datetime.fromisoformat(r["completed_at"]) <= end]
        except:
            pass
    
    # Calculate metrics
    total_completed = len(records)
    by_type = {}
    for record in records:
        ct = record["cleaning_type"]
        by_type[ct] = by_type.get(ct, 0) + 1
    
    return {
        "success": True,
        "completion_tracking": {
            "hotel_id": hotel_id,
            "period": {
                "start_date": start_date or "All-time",
                "end_date": end_date or "All-time"
            },
            "summary": {
                "total_completed_tasks": total_completed,
                "by_cleaning_type": by_type,
                "completion_rate": "High" if total_completed > 10 else "Medium" if total_completed > 5 else "Low"
            },
            "recent_completions": records[-10:] if len(records) > 10 else records
        }
    }

def generate_schedule_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive housekeeping schedule report."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    days = payload.get("days", 7)
    
    _initialize_hotel(hotel_id)
    
    # Analyze tasks by date
    daily_tasks = {}
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        daily_tasks[date] = 0
    
    tasks = list(_cleaning_tasks[hotel_id].values())
    for task in tasks:
        try:
            task_date = datetime.fromisoformat(task["scheduled_time"]).strftime("%Y-%m-%d")
            if task_date in daily_tasks:
                daily_tasks[task_date] += 1
        except:
            pass
    
    # Staff workload analysis
    staff_workload = {}
    for staff_id, staff in _staff_members[hotel_id].items():
        staff_workload[staff_id] = {
            "name": staff["name"],
            "assigned_tasks": len(staff["assigned_tasks"]),
            "completed_tasks": staff["completed_tasks"],
            "workload_hours": round(staff["total_workload_hours"], 2),
            "specialization": staff["specialization"]
        }
    
    # Task status summary
    status_summary = {}
    for status in TaskStatus:
        count = len([t for t in tasks if t["status"] == status.value])
        status_summary[status.value] = count
    
    # Priority summary
    priority_summary = {}
    for priority in TaskPriority:
        count = len([t for t in tasks if t["priority"] == priority.value])
        priority_summary[priority.value] = count
    
    report = {
        "success": True,
        "schedule_report": {
            "hotel_id": hotel_id,
            "report_date": datetime.now().isoformat(),
            "period_days": days,
            "task_summary": {
                "total_tasks": len(tasks),
                "by_status": status_summary,
                "by_priority": priority_summary
            },
            "daily_distribution": daily_tasks,
            "staff_workload": staff_workload,
            "recommendations": _generate_housekeeping_recommendations(priority_summary, status_summary)
        }
    }
    
    return report

def _generate_housekeeping_recommendations(priorities: Dict, statuses: Dict) -> List[str]:
    """Generate housekeeping management recommendations."""
    recommendations = []
    
    vip_tasks = priorities.get(TaskPriority.VIP.value, 0)
    if vip_tasks > 5:
        recommendations.append("High VIP cleaning load - Consider additional premium staff")
    
    pending = statuses.get(TaskStatus.PENDING.value, 0)
    if pending > 10:
        recommendations.append(f"{pending} tasks pending - Increase staff allocation")
    
    in_progress = statuses.get(TaskStatus.IN_PROGRESS.value, 0)
    if in_progress < 3:
        recommendations.append("Low concurrent tasks - Optimize task batching")
    
    return recommendations

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "schedule_cleaning": schedule_cleaning,
            "update_task_status": update_task_status,
            "assign_staff": assign_staff,
            "get_schedule": get_schedule,
            "track_completion": track_completion,
            "generate_schedule_report": generate_schedule_report
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
        "action": "schedule_cleaning",
        "payload": {
            "room_id": "ROOM_301",
            "cleaning_type": "turnover",
            "hotel_id": "HOTEL_001",
            "priority": "normal",
            "estimated_duration_minutes": 45
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
