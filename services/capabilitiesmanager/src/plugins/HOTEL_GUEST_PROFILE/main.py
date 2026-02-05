#!/usr/bin/env python3
"""
HOTEL_GUEST_PROFILE Plugin - Guest profile and preference management
Manages guest profiles, preferences, stay history, VIP status, and loyalty tracking.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime
from enum import Enum

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class VIPStatus(Enum):
    STANDARD = "standard"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"

# In-Memory Data Storage
_guest_profiles = {}
_guest_preferences = {}
_guest_history = {}
_loyalty_points = {}

# Preference Categories
PREFERENCE_CATEGORIES = [
    "room_type", "floor_preference", "bed_type", "amenities",
    "dietary_restrictions", "newspaper_type", "wake_up_call",
    "temperature_preference", "communication_language"
]

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

def _calculate_vip_status(total_stays: int, total_spent: float) -> str:
    """Calculate VIP status based on stay count and spending."""
    if total_spent >= 50000 or total_stays >= 50:
        return VIPStatus.PLATINUM.value
    elif total_spent >= 25000 or total_stays >= 25:
        return VIPStatus.GOLD.value
    elif total_spent >= 10000 or total_stays >= 10:
        return VIPStatus.SILVER.value
    return VIPStatus.STANDARD.value

def create_profile(payload: dict) -> Dict[str, Any]:
    """Create a new guest profile."""
    required = ["guest_id", "first_name", "last_name", "email"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    
    if guest_id in _guest_profiles:
        return {"success": False, "error": f"Guest {guest_id} already exists"}
    
    profile = {
        "guest_id": guest_id,
        "first_name": payload.get("first_name"),
        "last_name": payload.get("last_name"),
        "email": payload.get("email"),
        "phone": payload.get("phone", ""),
        "date_of_birth": payload.get("date_of_birth", ""),
        "country": payload.get("country", ""),
        "address": payload.get("address", ""),
        "loyalty_member": payload.get("loyalty_member", False),
        "loyalty_number": payload.get("loyalty_number", ""),
        "vip_status": VIPStatus.STANDARD.value,
        "total_stays": 0,
        "total_spent": 0.0,
        "average_rating": 0.0,
        "created_at": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat(),
        "last_visit": None,
        "account_notes": payload.get("account_notes", "")
    }
    
    _guest_profiles[guest_id] = profile
    _guest_preferences[guest_id] = {}
    _guest_history[guest_id] = []
    _loyalty_points[guest_id] = {"points": 0, "redeemed": 0, "balance": 0}
    
    logger.info(f"Created profile for guest {guest_id}")
    
    return {
        "success": True,
        "profile": profile
    }

def update_profile(payload: dict) -> Dict[str, Any]:
    """Update existing guest profile."""
    required = ["guest_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    
    if guest_id not in _guest_profiles:
        return {"success": False, "error": f"Guest {guest_id} not found"}
    
    profile = _guest_profiles[guest_id]
    
    # Update allowed fields
    updatable_fields = ["first_name", "last_name", "email", "phone", "date_of_birth", 
                       "country", "address", "loyalty_member", "loyalty_number", "account_notes"]
    
    for field in updatable_fields:
        if field in payload and payload[field] is not None:
            profile[field] = payload[field]
    
    profile["last_updated"] = datetime.now().isoformat()
    
    logger.info(f"Updated profile for guest {guest_id}")
    
    return {
        "success": True,
        "profile": profile
    }

def add_preference(payload: dict) -> Dict[str, Any]:
    """Add or update a guest preference."""
    required = ["guest_id", "preference_category", "preference_value"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    category = payload.get("preference_category")
    value = payload.get("preference_value")
    
    if guest_id not in _guest_profiles:
        return {"success": False, "error": f"Guest {guest_id} not found"}
    
    if category not in PREFERENCE_CATEGORIES:
        return {"success": False, "error": f"Unknown preference category: {category}"}
    
    if guest_id not in _guest_preferences:
        _guest_preferences[guest_id] = {}
    
    _guest_preferences[guest_id][category] = {
        "value": value,
        "added_at": datetime.now().isoformat(),
        "priority": payload.get("priority", "normal")
    }
    
    logger.info(f"Added preference {category} for guest {guest_id}")
    
    return {
        "success": True,
        "preference": {
            "category": category,
            "value": value,
            "added_at": _guest_preferences[guest_id][category]["added_at"]
        }
    }

def get_preferences(payload: dict) -> Dict[str, Any]:
    """Retrieve all preferences for a guest."""
    required = ["guest_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    
    if guest_id not in _guest_profiles:
        return {"success": False, "error": f"Guest {guest_id} not found"}
    
    preferences = _guest_preferences.get(guest_id, {})
    
    return {
        "success": True,
        "guest_id": guest_id,
        "preferences": preferences,
        "preference_count": len(preferences)
    }

def add_stay_history(payload: dict) -> Dict[str, Any]:
    """Record a stay in guest history."""
    required = ["guest_id", "check_in_date", "check_out_date", "room_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    
    if guest_id not in _guest_profiles:
        return {"success": False, "error": f"Guest {guest_id} not found"}
    
    stay = {
        "stay_id": f"STAY_{guest_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "check_in_date": payload.get("check_in_date"),
        "check_out_date": payload.get("check_out_date"),
        "room_id": payload.get("room_id"),
        "room_type": payload.get("room_type", "standard"),
        "rate": payload.get("rate", 0.0),
        "rating": payload.get("rating", 0),
        "comments": payload.get("comments", ""),
        "recorded_at": datetime.now().isoformat()
    }
    
    _guest_history[guest_id].append(stay)
    
    profile = _guest_profiles[guest_id]
    profile["total_stays"] += 1
    profile["total_spent"] += stay["rate"]
    profile["last_visit"] = stay["check_in_date"]
    
    # Update VIP status
    profile["vip_status"] = _calculate_vip_status(profile["total_stays"], profile["total_spent"])
    
    # Update average rating
    ratings = [s["rating"] for s in _guest_history[guest_id] if s["rating"] > 0]
    if ratings:
        profile["average_rating"] = sum(ratings) / len(ratings)
    
    # Add loyalty points
    points_earned = int(stay["rate"] / 10)  # 1 point per $10 spent
    if guest_id in _loyalty_points:
        _loyalty_points[guest_id]["points"] += points_earned
        _loyalty_points[guest_id]["balance"] += points_earned
    
    logger.info(f"Recorded stay for guest {guest_id}")
    
    return {
        "success": True,
        "stay_record": stay,
        "updated_profile": {
            "total_stays": profile["total_stays"],
            "total_spent": profile["total_spent"],
            "vip_status": profile["vip_status"],
            "loyalty_points_earned": points_earned
        }
    }

def get_history(payload: dict) -> Dict[str, Any]:
    """Retrieve stay history for a guest."""
    required = ["guest_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    limit = payload.get("limit", 10)
    
    if guest_id not in _guest_profiles:
        return {"success": False, "error": f"Guest {guest_id} not found"}
    
    history = _guest_history.get(guest_id, [])
    
    # Sort by check_in_date descending
    sorted_history = sorted(history, key=lambda x: x["check_in_date"], reverse=True)
    limited_history = sorted_history[:limit]
    
    return {
        "success": True,
        "guest_id": guest_id,
        "stay_history": limited_history,
        "total_stays": len(history),
        "shown_stays": len(limited_history)
    }

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "create_profile": create_profile,
            "update_profile": update_profile,
            "add_preference": add_preference,
            "get_preferences": get_preferences,
            "add_stay_history": add_stay_history,
            "get_history": get_history
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
        "action": "create_profile",
        "payload": {
            "guest_id": "GUEST_001",
            "first_name": "John",
            "last_name": "Doe",
            "email": "john@example.com",
            "phone": "+1-555-0100",
            "country": "USA"
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
