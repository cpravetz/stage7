#!/usr/bin/env python3
"""
VENUE_FINDER Plugin - Venue search and comparison for events
Provides venue discovery, comparison, availability checks, pricing, amenities, and reporting.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import uuid

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# In-memory venue database
VENUE_DATABASE = {
    "venue_001": {
        "id": "venue_001",
        "name": "Grand Ballroom Event Center",
        "location": {"city": "New York", "state": "NY", "zipcode": "10001", "address": "123 Main St"},
        "capacity": 500,
        "amenities": ["WiFi", "Parking", "AV Equipment", "Catering Kitchen", "Breakout Rooms"],
        "pricing": {"base_rate": 2500, "per_person": 35, "setup_fee": 500},
        "rating": 4.8,
        "reviews": 127,
        "availability": {}
    },
    "venue_002": {
        "id": "venue_002",
        "name": "Riverside Conference Hall",
        "location": {"city": "New York", "state": "NY", "zipcode": "10002", "address": "456 River Rd"},
        "capacity": 300,
        "amenities": ["WiFi", "AV Equipment", "Outdoor Space", "Bar"],
        "pricing": {"base_rate": 1800, "per_person": 28, "setup_fee": 300},
        "rating": 4.6,
        "reviews": 89,
        "availability": {}
    },
    "venue_003": {
        "id": "venue_003",
        "name": "Modern Loft Venue",
        "location": {"city": "Brooklyn", "state": "NY", "zipcode": "11201", "address": "789 Tech Ave"},
        "capacity": 150,
        "amenities": ["WiFi", "Exposed Brick", "Natural Lighting", "Sound System"],
        "pricing": {"base_rate": 1200, "per_person": 25, "setup_fee": 250},
        "rating": 4.7,
        "reviews": 64,
        "availability": {}
    }
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {'value':...} wrapper."""
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

def _validate_date(date_str: str) -> bool:
    """Validate date format YYYY-MM-DD."""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False

def _search_venues(payload: dict) -> Dict[str, Any]:
    """Search venues by location, capacity, and other criteria."""
    try:
        city = payload.get("city", "").lower()
        min_capacity = payload.get("min_capacity", 0)
        max_capacity = payload.get("max_capacity", 10000)
        amenities = payload.get("amenities", [])
        max_price = payload.get("max_price", float('inf'))
        
        results = []
        for venue in VENUE_DATABASE.values():
            # Filter by location
            if city and city not in venue["location"]["city"].lower():
                continue
            
            # Filter by capacity
            if not (min_capacity <= venue["capacity"] <= max_capacity):
                continue
            
            # Filter by price
            if venue["pricing"]["base_rate"] > max_price:
                continue
            
            # Filter by amenities
            if amenities and not any(a in venue["amenities"] for a in amenities):
                continue
            
            results.append({
                "id": venue["id"],
                "name": venue["name"],
                "location": venue["location"],
                "capacity": venue["capacity"],
                "amenities": venue["amenities"],
                "base_rate": venue["pricing"]["base_rate"],
                "rating": venue["rating"],
                "reviews": venue["reviews"]
            })
        
        return {
            "success": True,
            "count": len(results),
            "venues": results
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _compare_venues(payload: dict) -> Dict[str, Any]:
    """Compare multiple venues side by side."""
    try:
        venue_ids = payload.get("venue_ids", [])
        if not venue_ids:
            return {"success": False, "error": "venue_ids is required"}
        
        comparison = {
            "venues": [],
            "price_range": {"min": float('inf'), "max": 0},
            "capacity_range": {"min": float('inf'), "max": 0}
        }
        
        for venue_id in venue_ids:
            if venue_id not in VENUE_DATABASE:
                continue
            
            venue = VENUE_DATABASE[venue_id]
            venue_data = {
                "id": venue["id"],
                "name": venue["name"],
                "capacity": venue["capacity"],
                "base_rate": venue["pricing"]["base_rate"],
                "per_person": venue["pricing"]["per_person"],
                "rating": venue["rating"],
                "amenity_count": len(venue["amenities"]),
                "amenities": venue["amenities"]
            }
            comparison["venues"].append(venue_data)
            
            # Update ranges
            base_rate = venue["pricing"]["base_rate"]
            comparison["price_range"]["min"] = min(comparison["price_range"]["min"], base_rate)
            comparison["price_range"]["max"] = max(comparison["price_range"]["max"], base_rate)
            comparison["capacity_range"]["min"] = min(comparison["capacity_range"]["min"], venue["capacity"])
            comparison["capacity_range"]["max"] = max(comparison["capacity_range"]["max"], venue["capacity"])
        
        return {
            "success": True,
            "comparison_count": len(comparison["venues"]),
            "comparison": comparison
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_availability(payload: dict) -> Dict[str, Any]:
    """Check venue availability for specific dates."""
    try:
        venue_id = payload.get("venue_id")
        event_date = payload.get("event_date")
        
        if not venue_id or not event_date:
            return {"success": False, "error": "venue_id and event_date are required"}
        
        if not _validate_date(event_date):
            return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD"}
        
        if venue_id not in VENUE_DATABASE:
            return {"success": False, "error": f"Venue {venue_id} not found"}
        
        venue = VENUE_DATABASE[venue_id]
        is_available = event_date not in venue["availability"]
        
        return {
            "success": True,
            "venue_id": venue_id,
            "venue_name": venue["name"],
            "event_date": event_date,
            "available": is_available,
            "status": "Available" if is_available else "Booked"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_pricing(payload: dict) -> Dict[str, Any]:
    """Calculate pricing for venue with expected attendees."""
    try:
        venue_id = payload.get("venue_id")
        attendee_count = payload.get("attendee_count", 0)
        
        if not venue_id:
            return {"success": False, "error": "venue_id is required"}
        
        if venue_id not in VENUE_DATABASE:
            return {"success": False, "error": f"Venue {venue_id} not found"}
        
        if attendee_count < 0:
            return {"success": False, "error": "attendee_count must be non-negative"}
        
        venue = VENUE_DATABASE[venue_id]
        pricing = venue["pricing"]
        
        base_cost = pricing["base_rate"]
        per_person_cost = pricing["per_person"] * attendee_count
        setup_fee = pricing["setup_fee"]
        total_cost = base_cost + per_person_cost + setup_fee
        
        return {
            "success": True,
            "venue_id": venue_id,
            "venue_name": venue["name"],
            "attendee_count": attendee_count,
            "pricing_breakdown": {
                "base_rate": base_cost,
                "per_person_cost": per_person_cost,
                "setup_fee": setup_fee,
                "total_cost": total_cost,
                "per_attendee_avg": total_cost / attendee_count if attendee_count > 0 else 0
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_amenities(payload: dict) -> Dict[str, Any]:
    """Get detailed amenities for a venue."""
    try:
        venue_id = payload.get("venue_id")
        
        if not venue_id:
            return {"success": False, "error": "venue_id is required"}
        
        if venue_id not in VENUE_DATABASE:
            return {"success": False, "error": f"Venue {venue_id} not found"}
        
        venue = VENUE_DATABASE[venue_id]
        
        # Amenity details
        amenity_details = {
            "WiFi": "High-speed internet (1Gbps)",
            "Parking": "Complimentary valet and self-park",
            "AV Equipment": "Projectors, screens, sound system",
            "Catering Kitchen": "Full kitchen with prep facilities",
            "Breakout Rooms": "5 private meeting spaces",
            "Outdoor Space": "Terrace with garden views",
            "Bar": "Full bar service",
            "Exposed Brick": "Historic architecture feature",
            "Natural Lighting": "Floor-to-ceiling windows",
            "Sound System": "Professional audio equipment"
        }
        
        amenities_list = [
            {"name": a, "description": amenity_details.get(a, "")}
            for a in venue["amenities"]
        ]
        
        return {
            "success": True,
            "venue_id": venue_id,
            "venue_name": venue["name"],
            "total_amenities": len(amenities_list),
            "amenities": amenities_list
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _generate_venue_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive venue report."""
    try:
        venue_id = payload.get("venue_id")
        attendee_count = payload.get("attendee_count", 100)
        
        if not venue_id:
            return {"success": False, "error": "venue_id is required"}
        
        if venue_id not in VENUE_DATABASE:
            return {"success": False, "error": f"Venue {venue_id} not found"}
        
        venue = VENUE_DATABASE[venue_id]
        pricing = venue["pricing"]
        total_cost = pricing["base_rate"] + (pricing["per_person"] * attendee_count) + pricing["setup_fee"]
        
        report = {
            "venue_id": venue_id,
            "report_date": datetime.now().isoformat(),
            "venue_overview": {
                "name": venue["name"],
                "location": venue["location"],
                "capacity": venue["capacity"],
                "rating": venue["rating"],
                "total_reviews": venue["reviews"]
            },
            "capacity_analysis": {
                "max_capacity": venue["capacity"],
                "planned_attendees": attendee_count,
                "capacity_utilization": f"{(attendee_count / venue['capacity'] * 100):.1f}%",
                "suitable": attendee_count <= venue["capacity"]
            },
            "pricing_summary": {
                "base_rate": pricing["base_rate"],
                "per_person_rate": pricing["per_person"],
                "setup_fee": pricing["setup_fee"],
                "estimated_total": total_cost,
                "cost_per_attendee": total_cost / attendee_count if attendee_count > 0 else 0
            },
            "amenities": venue["amenities"],
            "recommendation": "Excellent choice" if venue["rating"] >= 4.5 else "Good option",
            "booking_status": "Available for booking"
        }
        
        return {
            "success": True,
            "report": report
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Missing required parameter 'action'"
            }]

        logger.info(f"Executing action: {action} with payload: {payload}")

        # Action handlers
        if action == "search_venues":
            result = _search_venues(payload)
        elif action == "compare_venues":
            result = _compare_venues(payload)
        elif action == "check_availability":
            result = _check_availability(payload)
        elif action == "get_pricing":
            result = _get_pricing(payload)
        elif action == "get_amenities":
            result = _get_amenities(payload)
        elif action == "generate_venue_report":
            result = _generate_venue_report(payload)
        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        return [{
            "success": result.get("success", True),
            "name": "result",
            "resultType": "object",
            "result": result,
            "resultDescription": f"Result of {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {}

        if isinstance(payload, dict):
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {e}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
