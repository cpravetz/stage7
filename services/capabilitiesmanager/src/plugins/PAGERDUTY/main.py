#!/usr/bin/env python3
"""
PAGERDUTY Plugin - Incident Management and Alerting
Provides PagerDuty integration for incidents, on-call scheduling, and escalation management.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import uuid
import random

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Simulated PagerDuty data structures
INCIDENTS = {
    "incident-001": {
        "id": "incident-001",
        "incident_number": 1001,
        "title": "Database connection pool exhausted",
        "status": "triggered",
        "urgency": "high",
        "service": "API Service",
        "created_at": (datetime.now() - timedelta(hours=2)).isoformat(),
        "assigned_to": "john.doe@company.com",
        "escalation_policy": "Engineering Escalation",
        "ack_at": None,
        "resolved_at": None
    },
    "incident-002": {
        "id": "incident-002",
        "incident_number": 1000,
        "title": "High latency on web servers",
        "status": "acknowledged",
        "urgency": "medium",
        "service": "Web Service",
        "created_at": (datetime.now() - timedelta(hours=4)).isoformat(),
        "assigned_to": "jane.smith@company.com",
        "escalation_policy": "Engineering Escalation",
        "ack_at": (datetime.now() - timedelta(hours=3)).isoformat(),
        "resolved_at": None
    },
    "incident-003": {
        "id": "incident-003",
        "incident_number": 999,
        "title": "SSL certificate expiration warning",
        "status": "resolved",
        "urgency": "low",
        "service": "Infrastructure",
        "created_at": (datetime.now() - timedelta(days=1)).isoformat(),
        "assigned_to": "alice.johnson@company.com",
        "escalation_policy": "Ops Escalation",
        "ack_at": (datetime.now() - timedelta(hours=22)).isoformat(),
        "resolved_at": (datetime.now() - timedelta(hours=20)).isoformat()
    }
}

SERVICES = {
    "service-001": {
        "service_id": "service-001",
        "name": "API Service",
        "description": "REST API backend service",
        "escalation_policy": "Engineering Escalation",
        "status": "active",
        "teams": ["Platform", "Backend"]
    },
    "service-002": {
        "service_id": "service-002",
        "name": "Web Service",
        "description": "Frontend web application",
        "escalation_policy": "Engineering Escalation",
        "status": "active",
        "teams": ["Frontend", "Platform"]
    },
    "service-003": {
        "service_id": "service-003",
        "name": "Database Service",
        "description": "Primary database cluster",
        "escalation_policy": "Database Escalation",
        "status": "active",
        "teams": ["Database", "Infrastructure"]
    }
}

ESCALATION_POLICIES = {
    "escalation-001": {
        "policy_id": "escalation-001",
        "name": "Engineering Escalation",
        "levels": [
            {
                "level": 1,
                "escalate_after_minutes": 30,
                "users": ["john.doe@company.com", "jane.smith@company.com"]
            },
            {
                "level": 2,
                "escalate_after_minutes": 30,
                "users": ["alice.johnson@company.com", "bob.wilson@company.com"]
            },
            {
                "level": 3,
                "escalate_after_minutes": 15,
                "users": ["manager@company.com"]
            }
        ]
    },
    "escalation-002": {
        "policy_id": "escalation-002",
        "name": "Ops Escalation",
        "levels": [
            {
                "level": 1,
                "escalate_after_minutes": 20,
                "users": ["ops.lead@company.com"]
            },
            {
                "level": 2,
                "escalate_after_minutes": 30,
                "users": ["ops.manager@company.com"]
            }
        ]
    }
}

ONCALL_SCHEDULES = {
    "schedule-001": {
        "schedule_id": "schedule-001",
        "name": "Platform Team - Primary",
        "timezone": "America/New_York",
        "current_oncall": {
            "user": "john.doe@company.com",
            "name": "John Doe",
            "start": (datetime.now() - timedelta(hours=2)).isoformat(),
            "end": (datetime.now() + timedelta(hours=22)).isoformat()
        },
        "next_oncall": {
            "user": "jane.smith@company.com",
            "name": "Jane Smith",
            "start": (datetime.now() + timedelta(hours=22)).isoformat(),
            "end": (datetime.now() + timedelta(hours=46)).isoformat()
        }
    },
    "schedule-002": {
        "schedule_id": "schedule-002",
        "name": "Platform Team - Secondary",
        "timezone": "America/Los_Angeles",
        "current_oncall": {
            "user": "alice.johnson@company.com",
            "name": "Alice Johnson",
            "start": (datetime.now() - timedelta(hours=6)).isoformat(),
            "end": (datetime.now() + timedelta(hours=18)).isoformat()
        },
        "next_oncall": {
            "user": "bob.wilson@company.com",
            "name": "Bob Wilson",
            "start": (datetime.now() + timedelta(hours=18)).isoformat(),
            "end": (datetime.now() + timedelta(hours=42)).isoformat()
        }
    }
}

USERS = {
    "user-001": {
        "user_id": "user-001",
        "name": "John Doe",
        "email": "john.doe@company.com",
        "role": "Engineer",
        "teams": ["Platform", "Backend"],
        "escalation_count": 42,
        "total_incidents": 156
    },
    "user-002": {
        "user_id": "user-002",
        "name": "Jane Smith",
        "email": "jane.smith@company.com",
        "role": "Senior Engineer",
        "teams": ["Platform", "Backend"],
        "escalation_count": 28,
        "total_incidents": 198
    },
    "user-003": {
        "user_id": "user-003",
        "name": "Alice Johnson",
        "email": "alice.johnson@company.com",
        "role": "Engineer",
        "teams": ["Frontend", "Platform"],
        "escalation_count": 35,
        "total_incidents": 142
    }
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs."""
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

def _validate_string(value: str, min_length: int = 1) -> bool:
    """Validate string parameter."""
    return isinstance(value, str) and len(value) >= min_length

def _list_incidents(payload: dict) -> Dict[str, Any]:
    """List incidents with optional filtering."""
    try:
        status_filter = payload.get("status", "")
        urgency_filter = payload.get("urgency", "")
        service_filter = payload.get("service", "")
        limit = payload.get("limit", 10)
        
        if not isinstance(limit, int) or limit < 1:
            limit = 10
        
        incidents = list(INCIDENTS.values())
        
        if status_filter:
            incidents = [i for i in incidents if i["status"] == status_filter]
        
        if urgency_filter:
            incidents = [i for i in incidents if i["urgency"] == urgency_filter]
        
        if service_filter:
            incidents = [i for i in incidents if i["service"] == service_filter]
        
        # Sort by creation time (newest first)
        incidents = sorted(incidents, key=lambda x: x["created_at"], reverse=True)[:limit]
        
        triggered = len([i for i in INCIDENTS.values() if i["status"] == "triggered"])
        acknowledged = len([i for i in INCIDENTS.values() if i["status"] == "acknowledged"])
        resolved = len([i for i in INCIDENTS.values() if i["status"] == "resolved"])
        
        return {
            "success": True,
            "total_incidents": len(incidents),
            "summary": {
                "triggered": triggered,
                "acknowledged": acknowledged,
                "resolved": resolved
            },
            "incidents": incidents
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _create_incident(payload: dict) -> Dict[str, Any]:
    """Create a new incident."""
    try:
        title = payload.get("title", "")
        service = payload.get("service", "")
        urgency = payload.get("urgency", "medium")
        description = payload.get("description", "")
        
        if not _validate_string(title, 5):
            return {"success": False, "error": "Title must be at least 5 characters"}
        
        if not _validate_string(service):
            return {"success": False, "error": "Service is required"}
        
        if urgency not in ["low", "medium", "high"]:
            urgency = "medium"
        
        incident_id = f"incident-{uuid.uuid4().hex[:8]}"
        next_number = max([i["incident_number"] for i in INCIDENTS.values()], default=999) + 1
        
        incident = {
            "id": incident_id,
            "incident_number": next_number,
            "title": title,
            "description": description,
            "status": "triggered",
            "urgency": urgency,
            "service": service,
            "created_at": datetime.now().isoformat(),
            "assigned_to": random.choice(list(USERS.values()))["email"],
            "escalation_policy": "Engineering Escalation",
            "ack_at": None,
            "resolved_at": None
        }
        
        INCIDENTS[incident_id] = incident
        
        return {
            "success": True,
            "incident_id": incident_id,
            "incident_number": next_number,
            "title": title,
            "message": "Incident created and assigned to on-call engineer"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _acknowledge_incident(payload: dict) -> Dict[str, Any]:
    """Acknowledge an incident."""
    try:
        incident_id = payload.get("incident_id", "")
        
        if not _validate_string(incident_id):
            return {"success": False, "error": "incident_id is required"}
        
        if incident_id not in INCIDENTS:
            return {"success": False, "error": f"Incident {incident_id} not found"}
        
        incident = INCIDENTS[incident_id]
        
        if incident["status"] != "triggered":
            return {"success": False, "error": f"Incident is already {incident['status']}"}
        
        incident["status"] = "acknowledged"
        incident["ack_at"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "incident_id": incident_id,
            "incident_number": incident["incident_number"],
            "status": "acknowledged",
            "message": f"Incident {incident['incident_number']} acknowledged"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _resolve_incident(payload: dict) -> Dict[str, Any]:
    """Resolve an incident."""
    try:
        incident_id = payload.get("incident_id", "")
        resolution_notes = payload.get("resolution_notes", "")
        
        if not _validate_string(incident_id):
            return {"success": False, "error": "incident_id is required"}
        
        if incident_id not in INCIDENTS:
            return {"success": False, "error": f"Incident {incident_id} not found"}
        
        incident = INCIDENTS[incident_id]
        
        if incident["status"] == "resolved":
            return {"success": False, "error": "Incident is already resolved"}
        
        incident["status"] = "resolved"
        incident["resolved_at"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "incident_id": incident_id,
            "incident_number": incident["incident_number"],
            "status": "resolved",
            "resolution_notes": resolution_notes,
            "message": f"Incident {incident['incident_number']} resolved"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _list_oncall(payload: dict) -> Dict[str, Any]:
    """List current on-call schedule."""
    try:
        schedule_id = payload.get("schedule_id", "")
        
        if schedule_id:
            if schedule_id not in ONCALL_SCHEDULES:
                return {"success": False, "error": f"Schedule {schedule_id} not found"}
            
            schedule = ONCALL_SCHEDULES[schedule_id]
            
            return {
                "success": True,
                "schedule": schedule
            }
        
        # Return all schedules
        schedules = list(ONCALL_SCHEDULES.values())
        
        oncall_info = []
        for schedule in schedules:
            oncall_info.append({
                "schedule_name": schedule["name"],
                "current_oncall": schedule["current_oncall"]["name"],
                "next_oncall": schedule["next_oncall"]["name"]
            })
        
        return {
            "success": True,
            "total_schedules": len(schedules),
            "oncall_summary": oncall_info,
            "schedules": schedules
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_escalation_policy(payload: dict) -> Dict[str, Any]:
    """Get escalation policy details."""
    try:
        policy_id = payload.get("policy_id", "")
        policy_name = payload.get("policy_name", "")
        
        policy = None
        
        if policy_id:
            policy = ESCALATION_POLICIES.get(policy_id)
        elif policy_name:
            policy = next((p for p in ESCALATION_POLICIES.values() if p["name"] == policy_name), None)
        
        if policy:
            return {
                "success": True,
                "policy": policy
            }
        
        if policy_id or policy_name:
            return {"success": False, "error": "Escalation policy not found"}
        
        # Return all policies
        policies = list(ESCALATION_POLICIES.values())
        
        return {
            "success": True,
            "total_policies": len(policies),
            "policies": policies
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {
                "success": False,
                "error": "action is required",
                "available_actions": [
                    "list_incidents",
                    "create_incident",
                    "acknowledge_incident",
                    "resolve_incident",
                    "list_oncall",
                    "get_escalation_policy"
                ]
            }
        
        if action == "list_incidents":
            return _list_incidents(payload)
        elif action == "create_incident":
            return _create_incident(payload)
        elif action == "acknowledge_incident":
            return _acknowledge_incident(payload)
        elif action == "resolve_incident":
            return _resolve_incident(payload)
        elif action == "list_oncall":
            return _list_oncall(payload)
        elif action == "get_escalation_policy":
            return _get_escalation_policy(payload)
        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": [
                    "list_incidents",
                    "create_incident",
                    "acknowledge_incident",
                    "resolve_incident",
                    "list_oncall",
                    "get_escalation_policy"
                ]
            }
    
    except Exception as e:
        logger.error(f"Plugin error: {str(e)}")
        return {"success": False, "error": f"Plugin execution error: {str(e)}"}

if __name__ == "__main__":
    try:
        inputs = json.loads(sys.stdin.read())
        result = execute_plugin(inputs)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
