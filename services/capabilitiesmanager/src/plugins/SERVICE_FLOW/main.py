#!/usr/bin/env python3
"""
SERVICE_FLOW Plugin - Service coordination and workflow
Manages server assignments, order tracking, course coordination, and guest satisfaction.
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

class OrderStatus(Enum):
    PENDING = "pending"
    RECEIVED = "received"
    KITCHEN = "in_kitchen"
    PLATING = "plating"
    READY = "ready"
    SERVED = "served"
    COMPLETED = "completed"

class CourseType(Enum):
    APPETIZER = "appetizer"
    SOUP = "soup"
    SALAD = "salad"
    ENTREE = "entree"
    DESSERT = "dessert"
    BEVERAGE = "beverage"

class SatisfactionLevel(Enum):
    POOR = "poor"
    FAIR = "fair"
    GOOD = "good"
    EXCELLENT = "excellent"

# In-Memory Data Storage
_service_sessions = {}
_server_assignments = {}
_orders = {}
_course_tracking = {}
_guest_satisfaction = {}
_service_metrics = {}

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
    """Initialize restaurant service structures."""
    if restaurant_id not in _service_sessions:
        _service_sessions[restaurant_id] = {}
        _server_assignments[restaurant_id] = {}
        _orders[restaurant_id] = {}
        _course_tracking[restaurant_id] = {}
        _guest_satisfaction[restaurant_id] = {}
        _service_metrics[restaurant_id] = []

def assign_server(payload: dict) -> Dict[str, Any]:
    """Assign a server to tables."""
    required = ["server_id", "server_name", "table_ids"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    server_id = payload.get("server_id")
    server_name = payload.get("server_name")
    table_ids = payload.get("table_ids")
    
    if not isinstance(table_ids, list) or len(table_ids) == 0:
        return {"success": False, "error": "table_ids must be a non-empty list"}
    
    _initialize_restaurant(restaurant_id)
    
    assignment = {
        "assignment_id": f"SRVR_ASSGN_{restaurant_id}_{server_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "server_id": server_id,
        "server_name": server_name,
        "table_ids": table_ids,
        "assigned_at": datetime.now().isoformat(),
        "status": "active",
        "guest_count": 0,
        "active_orders": 0,
        "completed_orders": 0,
        "avg_satisfaction": 0.0
    }
    
    _server_assignments[restaurant_id][server_id] = assignment
    
    # Initialize service sessions for each table
    for table_id in table_ids:
        session_id = f"SESS_{restaurant_id}_{table_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        _service_sessions[restaurant_id][session_id] = {
            "session_id": session_id,
            "table_id": table_id,
            "server_id": server_id,
            "server_name": server_name,
            "start_time": datetime.now().isoformat(),
            "end_time": None,
            "guest_count": 0,
            "courses_served": 0,
            "status": "active"
        }
    
    return {
        "success": True,
        "assignment_id": assignment["assignment_id"],
        "server_id": server_id,
        "server_name": server_name,
        "assigned_tables": len(table_ids),
        "table_ids": table_ids,
        "assigned_at": assignment["assigned_at"]
    }

def track_order_status(payload: dict) -> Dict[str, Any]:
    """Track order status and progress through service workflow."""
    required = ["order_id", "table_id", "status"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    order_id = payload.get("order_id")
    table_id = payload.get("table_id")
    status = payload.get("status")
    
    _initialize_restaurant(restaurant_id)
    
    # Validate status
    valid_statuses = [s.value for s in OrderStatus]
    if status not in valid_statuses:
        return {"success": False, "error": f"Invalid status: {status}"}
    
    # Create or update order
    if order_id not in _orders[restaurant_id]:
        _orders[restaurant_id][order_id] = {
            "order_id": order_id,
            "table_id": table_id,
            "created_at": datetime.now().isoformat(),
            "status_history": [],
            "items": payload.get("items", []),
            "preparation_time": 0,
            "service_time": 0,
            "total_time": 0
        }
    
    order = _orders[restaurant_id][order_id]
    
    # Record status change
    status_change = {
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "notes": payload.get("notes", "")
    }
    order["status_history"].append(status_change)
    
    # Calculate preparation time (from received to ready)
    if status == OrderStatus.READY.value:
        if order["status_history"]:
            first_status = next((s for s in order["status_history"] if s["status"] in [OrderStatus.RECEIVED.value, OrderStatus.PENDING.value]), None)
            if first_status:
                first_time = datetime.fromisoformat(first_status["timestamp"])
                current_time = datetime.fromisoformat(status_change["timestamp"])
                order["preparation_time"] = int((current_time - first_time).total_seconds() / 60)
    
    # Calculate service time (from ready to served)
    if status == OrderStatus.SERVED.value:
        if order["status_history"]:
            ready_status = next((s for s in order["status_history"] if s["status"] == OrderStatus.READY.value), None)
            if ready_status:
                ready_time = datetime.fromisoformat(ready_status["timestamp"])
                current_time = datetime.fromisoformat(status_change["timestamp"])
                order["service_time"] = int((current_time - ready_time).total_seconds() / 60)
    
    # Calculate total time
    if order["status_history"]:
        first_time = datetime.fromisoformat(order["status_history"][0]["timestamp"])
        current_time = datetime.fromisoformat(status_change["timestamp"])
        order["total_time"] = int((current_time - first_time).total_seconds() / 60)
    
    return {
        "success": True,
        "order_id": order_id,
        "table_id": table_id,
        "current_status": status,
        "preparation_time": order["preparation_time"],
        "service_time": order["service_time"],
        "total_time": order["total_time"],
        "status_history_length": len(order["status_history"])
    }

def manage_courses(payload: dict) -> Dict[str, Any]:
    """Manage course progression and timing."""
    required = ["table_id", "course_type"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    table_id = payload.get("table_id")
    course_type = payload.get("course_type")
    
    _initialize_restaurant(restaurant_id)
    
    # Validate course type
    valid_courses = [c.value for c in CourseType]
    if course_type not in valid_courses:
        return {"success": False, "error": f"Invalid course type: {course_type}"}
    
    if table_id not in _course_tracking[restaurant_id]:
        _course_tracking[restaurant_id][table_id] = []
    
    course_entry = {
        "course_id": f"CRS_{restaurant_id}_{table_id}_{uuid.uuid4().hex[:8].upper()}",
        "table_id": table_id,
        "course_type": course_type,
        "served_at": datetime.now().isoformat(),
        "guests_served": payload.get("guests_served", 1),
        "items": payload.get("items", []),
        "temperature_check": payload.get("temperature_check", "adequate"),
        "presentation": payload.get("presentation", "good"),
        "special_notes": payload.get("special_notes", "")
    }
    
    _course_tracking[restaurant_id][table_id].append(course_entry)
    
    return {
        "success": True,
        "course_id": course_entry["course_id"],
        "table_id": table_id,
        "course_type": course_type,
        "served_at": course_entry["served_at"],
        "guests_served": course_entry["guests_served"],
        "total_courses_served": len(_course_tracking[restaurant_id][table_id])
    }

def coordinate_timing(payload: dict) -> Dict[str, Any]:
    """Coordinate timing between courses and kitchen."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    table_id = payload.get("table_id")
    
    _initialize_restaurant(restaurant_id)
    
    # Get course history for table
    courses = _course_tracking[restaurant_id].get(table_id, [])
    
    if not courses:
        return {
            "success": True,
            "table_id": table_id,
            "message": "No courses served yet",
            "coordination": {}
        }
    
    # Calculate timing between courses
    course_intervals = []
    for i in range(1, len(courses)):
        prev_time = datetime.fromisoformat(courses[i-1]["served_at"])
        curr_time = datetime.fromisoformat(courses[i]["served_at"])
        interval = int((curr_time - prev_time).total_seconds() / 60)
        course_intervals.append({
            "from_course": courses[i-1]["course_type"],
            "to_course": courses[i]["course_type"],
            "interval_minutes": interval
        })
    
    # Recommend next course timing
    recommendations = []
    course_sequence = [CourseType.APPETIZER.value, CourseType.SOUP.value, CourseType.SALAD.value, 
                       CourseType.ENTREE.value, CourseType.DESSERT.value]
    
    last_served = courses[-1]["course_type"] if courses else None
    if last_served in course_sequence:
        next_idx = course_sequence.index(last_served) + 1
        if next_idx < len(course_sequence):
            next_course = course_sequence[next_idx]
            recommendations.append({
                "recommended_course": next_course,
                "suggested_wait_minutes": 5 if next_course == CourseType.DESSERT.value else 10
            })
    
    return {
        "success": True,
        "table_id": table_id,
        "courses_served": len(courses),
        "course_intervals": course_intervals,
        "timing_recommendations": recommendations
    }

def track_guest_satisfaction(payload: dict) -> Dict[str, Any]:
    """Track and record guest satisfaction."""
    required = ["table_id", "satisfaction_level"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    table_id = payload.get("table_id")
    satisfaction_level = payload.get("satisfaction_level")
    
    _initialize_restaurant(restaurant_id)
    
    # Validate satisfaction level
    valid_levels = [s.value for s in SatisfactionLevel]
    if satisfaction_level not in valid_levels:
        return {"success": False, "error": f"Invalid satisfaction level: {satisfaction_level}"}
    
    # Map satisfaction to numeric score
    score_map = {
        SatisfactionLevel.POOR.value: 1,
        SatisfactionLevel.FAIR.value: 2,
        SatisfactionLevel.GOOD.value: 3,
        SatisfactionLevel.EXCELLENT.value: 4
    }
    
    score = score_map[satisfaction_level]
    
    satisfaction_record = {
        "record_id": f"SAT_{restaurant_id}_{table_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "table_id": table_id,
        "satisfaction_level": satisfaction_level,
        "score": score,
        "recorded_at": datetime.now().isoformat(),
        "feedback": payload.get("feedback", ""),
        "server_response": payload.get("server_response", ""),
        "issues": payload.get("issues", [])
    }
    
    if table_id not in _guest_satisfaction[restaurant_id]:
        _guest_satisfaction[restaurant_id][table_id] = []
    
    _guest_satisfaction[restaurant_id][table_id].append(satisfaction_record)
    
    return {
        "success": True,
        "record_id": satisfaction_record["record_id"],
        "table_id": table_id,
        "satisfaction_level": satisfaction_level,
        "score": score,
        "feedback": satisfaction_record["feedback"],
        "recorded_at": satisfaction_record["recorded_at"]
    }

def generate_service_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive service workflow report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    report_date = payload.get("report_date", datetime.now().date().isoformat())
    
    _initialize_restaurant(restaurant_id)
    
    # Collect service metrics
    total_orders = len(_orders[restaurant_id])
    completed_orders = sum(1 for o in _orders[restaurant_id].values() 
                          if any(s["status"] == OrderStatus.COMPLETED.value for s in o["status_history"]))
    
    # Calculate average prep and service times
    prep_times = [o["preparation_time"] for o in _orders[restaurant_id].values() if o["preparation_time"] > 0]
    service_times = [o["service_time"] for o in _orders[restaurant_id].values() if o["service_time"] > 0]
    
    avg_prep_time = sum(prep_times) / len(prep_times) if prep_times else 0
    avg_service_time = sum(service_times) / len(service_times) if service_times else 0
    
    # Server assignments summary
    server_summary = []
    for server_id, assignment in _server_assignments[restaurant_id].items():
        server_summary.append({
            "server_id": server_id,
            "server_name": assignment["server_name"],
            "assigned_tables": len(assignment["table_ids"]),
            "status": assignment["status"]
        })
    
    # Satisfaction scores
    all_satisfaction = []
    for table_reviews in _guest_satisfaction[restaurant_id].values():
        all_satisfaction.extend([r["score"] for r in table_reviews])
    
    avg_satisfaction = sum(all_satisfaction) / len(all_satisfaction) if all_satisfaction else 0
    
    return {
        "success": True,
        "report_date": report_date,
        "summary": {
            "total_orders": total_orders,
            "completed_orders": completed_orders,
            "pending_orders": total_orders - completed_orders
        },
        "timing_metrics": {
            "avg_preparation_time_minutes": round(avg_prep_time, 1),
            "avg_service_time_minutes": round(avg_service_time, 1)
        },
        "server_performance": server_summary,
        "guest_satisfaction": {
            "avg_score": round(avg_satisfaction, 2),
            "total_ratings": len(all_satisfaction),
            "ratings_distribution": _calculate_satisfaction_distribution(all_satisfaction)
        }
    }

def _calculate_satisfaction_distribution(scores: List[int]) -> Dict[str, int]:
    """Calculate distribution of satisfaction scores."""
    distribution = {
        "poor": sum(1 for s in scores if s == 1),
        "fair": sum(1 for s in scores if s == 2),
        "good": sum(1 for s in scores if s == 3),
        "excellent": sum(1 for s in scores if s == 4)
    }
    return distribution

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "assign_server":
            return assign_server(payload)
        elif action_lower == "track_order_status":
            return track_order_status(payload)
        elif action_lower == "manage_courses":
            return manage_courses(payload)
        elif action_lower == "coordinate_timing":
            return coordinate_timing(payload)
        elif action_lower == "track_guest_satisfaction":
            return track_guest_satisfaction(payload)
        elif action_lower == "generate_service_report":
            return generate_service_report(payload)
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
