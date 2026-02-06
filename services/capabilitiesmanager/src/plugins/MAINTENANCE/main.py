#!/usr/bin/env python3
"""
MAINTENANCE Plugin - Maintenance request tracking and management
Manages maintenance requests, priority levels, technician assignment, completion tracking, and SLA monitoring.
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

class RequestStatus(Enum):
    NEW = "new"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CLOSED = "closed"
    CANCELLED = "cancelled"

class PriorityLevel(Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    EMERGENCY = "emergency"

class RequestCategory(Enum):
    PLUMBING = "plumbing"
    ELECTRICAL = "electrical"
    HVAC = "hvac"
    APPLIANCE = "appliance"
    STRUCTURAL = "structural"
    SAFETY = "safety"
    CLEANING = "cleaning"
    OTHER = "other"

# SLA response times (in hours)
SLA_TIMES = {
    PriorityLevel.EMERGENCY.value: 1,
    PriorityLevel.HIGH.value: 4,
    PriorityLevel.NORMAL.value: 24,
    PriorityLevel.LOW.value: 72
}

# In-Memory Data Storage
_maintenance_requests = {}
_technicians = {}
_maintenance_log = {}
_sla_tracking = {}

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
    if hotel_id not in _maintenance_requests:
        _maintenance_requests[hotel_id] = {}
        _technicians[hotel_id] = {}
        _maintenance_log[hotel_id] = []
        _sla_tracking[hotel_id] = []

def _generate_request_id(hotel_id: str) -> str:
    """Generate unique request ID."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"MR_{hotel_id}_{timestamp}"

def create_request(payload: dict) -> Dict[str, Any]:
    """Create a new maintenance request."""
    required = ["room_id", "category", "description"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    room_id = payload.get("room_id")
    category = payload.get("category")
    description = payload.get("description")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel(hotel_id)
    
    if category not in [c.value for c in RequestCategory]:
        return {"success": False, "error": f"Invalid category: {category}"}
    
    priority = payload.get("priority", PriorityLevel.NORMAL.value)
    if priority not in [p.value for p in PriorityLevel]:
        priority = PriorityLevel.NORMAL.value
    
    request_id = _generate_request_id(hotel_id)
    sla_hours = SLA_TIMES.get(priority, 24)
    due_time = datetime.now() + timedelta(hours=sla_hours)
    
    request = {
        "request_id": request_id,
        "hotel_id": hotel_id,
        "room_id": room_id,
        "category": category,
        "description": description,
        "priority": priority,
        "status": RequestStatus.NEW.value,
        "reported_by": payload.get("reported_by", "Guest"),
        "created_at": datetime.now().isoformat(),
        "assigned_to": None,
        "assigned_at": None,
        "start_time": None,
        "completion_time": None,
        "due_time": due_time.isoformat(),
        "sla_hours": sla_hours,
        "notes": "",
        "resolution_notes": ""
    }
    
    _maintenance_requests[hotel_id][request_id] = request
    
    # Create SLA tracking entry
    _sla_tracking[hotel_id].append({
        "request_id": request_id,
        "priority": priority,
        "created_at": request["created_at"],
        "due_time": request["due_time"],
        "sla_status": "pending"
    })
    
    logger.info(f"Created maintenance request {request_id} for room {room_id}")
    
    return {
        "success": True,
        "request": request
    }

def update_status(payload: dict) -> Dict[str, Any]:
    """Update status of a maintenance request."""
    required = ["request_id", "status"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    request_id = payload.get("request_id")
    status = payload.get("status")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel(hotel_id)
    
    if request_id not in _maintenance_requests[hotel_id]:
        return {"success": False, "error": f"Request {request_id} not found"}
    
    if status not in [s.value for s in RequestStatus]:
        return {"success": False, "error": f"Invalid status: {status}"}
    
    request = _maintenance_requests[hotel_id][request_id]
    old_status = request["status"]
    request["status"] = status
    
    # Track time changes
    if status == RequestStatus.IN_PROGRESS.value:
        request["start_time"] = datetime.now().isoformat()
    
    if status == RequestStatus.COMPLETED.value or status == RequestStatus.CLOSED.value:
        request["completion_time"] = datetime.now().isoformat()
        
        # Log in maintenance log
        _maintenance_log[hotel_id].append({
            "request_id": request_id,
            "room_id": request["room_id"],
            "category": request["category"],
            "priority": request["priority"],
            "assigned_to": request["assigned_to"],
            "completed_at": request["completion_time"],
            "resolution_notes": request.get("resolution_notes", "")
        })
        
        # Update SLA status
        completion_time = datetime.fromisoformat(request["completion_time"])
        due_time = datetime.fromisoformat(request["due_time"])
        
        for sla in _sla_tracking[hotel_id]:
            if sla["request_id"] == request_id:
                sla["sla_status"] = "met" if completion_time <= due_time else "missed"
    
    request["notes"] = payload.get("notes", request.get("notes", ""))
    
    logger.info(f"Updated request {request_id} status: {old_status} -> {status}")
    
    return {
        "success": True,
        "status_update": {
            "request_id": request_id,
            "previous_status": old_status,
            "new_status": status,
            "updated_at": datetime.now().isoformat()
        }
    }

def assign_technician(payload: dict) -> Dict[str, Any]:
    """Assign a technician to a maintenance request."""
    required = ["request_id", "technician_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    request_id = payload.get("request_id")
    technician_id = payload.get("technician_id")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    
    _initialize_hotel(hotel_id)
    
    if request_id not in _maintenance_requests[hotel_id]:
        return {"success": False, "error": f"Request {request_id} not found"}
    
    request = _maintenance_requests[hotel_id][request_id]
    
    # Register technician if not exists
    if technician_id not in _technicians[hotel_id]:
        _technicians[hotel_id][technician_id] = {
            "technician_id": technician_id,
            "name": payload.get("technician_name", f"Tech {technician_id}"),
            "specializations": payload.get("specializations", ["general"]),
            "assigned_requests": [],
            "completed_requests": 0,
            "availability_status": "available"
        }
    
    # Assign request
    request["assigned_to"] = technician_id
    request["assigned_at"] = datetime.now().isoformat()
    request["status"] = RequestStatus.ASSIGNED.value
    
    technician = _technicians[hotel_id][technician_id]
    technician["assigned_requests"].append(request_id)
    
    logger.info(f"Assigned request {request_id} to technician {technician_id}")
    
    return {
        "success": True,
        "assignment": {
            "request_id": request_id,
            "assigned_to": technician_id,
            "technician_name": technician["name"],
            "specializations": technician["specializations"],
            "assigned_at": request["assigned_at"],
            "due_time": request["due_time"]
        }
    }

def track_completion(payload: dict) -> Dict[str, Any]:
    """Track completion of maintenance requests."""
    required = ["request_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    request_id = payload.get("request_id")
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    resolution_notes = payload.get("resolution_notes", "")
    
    _initialize_hotel(hotel_id)
    
    if request_id not in _maintenance_requests[hotel_id]:
        return {"success": False, "error": f"Request {request_id} not found"}
    
    request = _maintenance_requests[hotel_id][request_id]
    
    if request["status"] != RequestStatus.IN_PROGRESS.value:
        return {"success": False, "error": "Request must be in progress to complete"}
    
    request["status"] = RequestStatus.COMPLETED.value
    request["completion_time"] = datetime.now().isoformat()
    request["resolution_notes"] = resolution_notes
    
    # Calculate completion time
    start = datetime.fromisoformat(request["start_time"])
    end = datetime.fromisoformat(request["completion_time"])
    duration_minutes = int((end - start).total_seconds() / 60)
    
    # Check SLA compliance
    due_time = datetime.fromisoformat(request["due_time"])
    sla_met = end <= due_time
    hours_over_sla = 0 if sla_met else (end - due_time).total_seconds() / 3600
    
    completion_record = {
        "request_id": request_id,
        "room_id": request["room_id"],
        "technician": request["assigned_to"],
        "category": request["category"],
        "priority": request["priority"],
        "duration_minutes": duration_minutes,
        "completed_at": request["completion_time"],
        "sla_met": sla_met,
        "hours_over_sla": hours_over_sla if not sla_met else 0,
        "resolution_notes": resolution_notes
    }
    
    _maintenance_log[hotel_id].append(completion_record)
    
    logger.info(f"Completed request {request_id}")
    
    return {
        "success": True,
        "completion": completion_record
    }

def get_maintenance_log(payload: dict) -> Dict[str, Any]:
    """Retrieve maintenance log."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    category = payload.get("category")
    limit = payload.get("limit", 50)
    
    _initialize_hotel(hotel_id)
    
    log = _maintenance_log.get(hotel_id, [])
    
    # Filter by category
    if category:
        log = [l for l in log if l.get("category") == category]
    
    # Filter by date
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            log = [l for l in log if datetime.fromisoformat(l["completed_at"]) >= start]
        except:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            log = [l for l in log if datetime.fromisoformat(l["completed_at"]) <= end]
        except:
            pass
    
    # Sort by date descending
    log.sort(key=lambda x: x.get("completed_at", ""), reverse=True)
    limited_log = log[:limit]
    
    return {
        "success": True,
        "maintenance_log": {
            "hotel_id": hotel_id,
            "period": {
                "start_date": start_date or "All-time",
                "end_date": end_date or "All-time"
            },
            "records": limited_log,
            "total_records": len(log),
            "shown_records": len(limited_log)
        }
    }

def generate_maintenance_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive maintenance analytics report."""
    hotel_id = payload.get("hotel_id", "HOTEL_DEFAULT")
    days = payload.get("days", 30)
    
    _initialize_hotel(hotel_id)
    
    requests = _maintenance_requests[hotel_id]
    log = _maintenance_log[hotel_id]
    
    # Calculate statistics
    total_requests = len(requests)
    completed = len([r for r in requests.values() if r["status"] in [RequestStatus.COMPLETED.value, RequestStatus.CLOSED.value]])
    pending = len([r for r in requests.values() if r["status"] in [RequestStatus.NEW.value, RequestStatus.ASSIGNED.value, RequestStatus.IN_PROGRESS.value]])
    
    # Category breakdown
    by_category = {}
    for category in RequestCategory:
        count = len([r for r in requests.values() if r["category"] == category.value])
        by_category[category.value] = count
    
    # Priority breakdown
    by_priority = {}
    for priority in PriorityLevel:
        count = len([r for r in requests.values() if r["priority"] == priority.value])
        by_priority[priority.value] = count
    
    # SLA compliance
    sla_tracking = _sla_tracking.get(hotel_id, [])
    sla_met = len([s for s in sla_tracking if s["sla_status"] == "met"])
    sla_total = len(sla_tracking)
    sla_compliance_rate = (sla_met / sla_total * 100) if sla_total > 0 else 0
    
    # Technician performance
    tech_performance = {}
    for tech_id, tech in _technicians[hotel_id].items():
        completed_by_tech = len([l for l in log if l.get("technician") == tech_id])
        sla_met_by_tech = len([l for l in log if l.get("technician") == tech_id and l.get("sla_met")])
        
        tech_performance[tech_id] = {
            "name": tech["name"],
            "completed_requests": completed_by_tech,
            "sla_compliance_rate": (sla_met_by_tech / completed_by_tech * 100) if completed_by_tech > 0 else 0,
            "specializations": tech["specializations"]
        }
    
    report = {
        "success": True,
        "maintenance_report": {
            "hotel_id": hotel_id,
            "report_date": datetime.now().isoformat(),
            "analysis_period_days": days,
            "request_summary": {
                "total_requests": total_requests,
                "completed": completed,
                "pending": pending,
                "completion_rate_percent": round((completed / total_requests * 100), 2) if total_requests > 0 else 0
            },
            "by_category": by_category,
            "by_priority": by_priority,
            "sla_compliance": {
                "met": sla_met,
                "total": sla_total,
                "compliance_rate_percent": round(sla_compliance_rate, 2)
            },
            "technician_performance": tech_performance,
            "recommendations": _generate_maintenance_recommendations(sla_compliance_rate, pending)
        }
    }
    
    return report

def _generate_maintenance_recommendations(sla_rate: float, pending: int) -> List[str]:
    """Generate maintenance management recommendations."""
    recommendations = []
    
    if sla_rate < 80:
        recommendations.append("SLA compliance below 80% - Review resource allocation")
    
    if pending > 20:
        recommendations.append(f"{pending} pending requests - Increase technician staff")
    
    if sla_rate > 95:
        recommendations.append("Excellent SLA compliance maintained")
    
    return recommendations

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "create_request": create_request,
            "update_status": update_status,
            "assign_technician": assign_technician,
            "track_completion": track_completion,
            "get_maintenance_log": get_maintenance_log,
            "generate_maintenance_report": generate_maintenance_report
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
        "action": "create_request",
        "payload": {
            "room_id": "ROOM_205",
            "category": "plumbing",
            "description": "Leaking faucet in bathroom",
            "priority": "normal",
            "hotel_id": "HOTEL_001",
            "reported_by": "Front Desk"
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
