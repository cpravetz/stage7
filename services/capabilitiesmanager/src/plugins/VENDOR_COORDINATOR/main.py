#!/usr/bin/env python3
"""
VENDOR_COORDINATOR Plugin - Vendor management for events
Provides vendor profiles, service coordination, contract management, and payment tracking.
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

# In-memory vendor database
VENDOR_DATABASE = {
    "vendor_001": {
        "id": "vendor_001",
        "name": "Gourmet Catering Co",
        "service_type": "Catering",
        "contact": {"email": "info@gourmet.com", "phone": "555-0101"},
        "pricing": {"base_rate": 3000, "per_person": 45, "setup_fee": 500},
        "rating": 4.9,
        "reviews": 234,
        "availability": {},
        "contract": None,
        "payment_status": "pending"
    },
    "vendor_002": {
        "id": "vendor_002",
        "name": "Stellar Sound & Lights",
        "service_type": "AV/Sound",
        "contact": {"email": "bookings@stellar.com", "phone": "555-0202"},
        "pricing": {"base_rate": 2000, "per_person": 15, "setup_fee": 300},
        "rating": 4.7,
        "reviews": 156,
        "availability": {},
        "contract": None,
        "payment_status": "pending"
    },
    "vendor_003": {
        "id": "vendor_003",
        "name": "Blossom Floral Designs",
        "service_type": "Floral Design",
        "contact": {"email": "events@blossom.com", "phone": "555-0303"},
        "pricing": {"base_rate": 1500, "per_person": 8, "setup_fee": 200},
        "rating": 4.8,
        "reviews": 192,
        "availability": {},
        "contract": None,
        "payment_status": "pending"
    }
}

CONTRACTS = {}
PAYMENTS = {}

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

def _add_vendor(payload: dict) -> Dict[str, Any]:
    """Add a new vendor to the database."""
    try:
        vendor_data = payload.get("vendor_data", {})
        if not vendor_data.get("name"):
            return {"success": False, "error": "Vendor name is required"}
        
        vendor_id = f"vendor_{len(VENDOR_DATABASE) + 1:03d}"
        VENDOR_DATABASE[vendor_id] = {
            "id": vendor_id,
            "name": vendor_data.get("name"),
            "service_type": vendor_data.get("service_type", "General"),
            "contact": vendor_data.get("contact", {}),
            "pricing": vendor_data.get("pricing", {}),
            "rating": vendor_data.get("rating", 0.0),
            "reviews": vendor_data.get("reviews", 0),
            "availability": {},
            "contract": None,
            "payment_status": "pending"
        }
        
        return {
            "success": True,
            "vendor_id": vendor_id,
            "message": f"Vendor {vendor_data.get('name')} added successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _update_vendor(payload: dict) -> Dict[str, Any]:
    """Update vendor information."""
    try:
        vendor_id = payload.get("vendor_id")
        updates = payload.get("updates", {})
        
        if not vendor_id:
            return {"success": False, "error": "vendor_id is required"}
        
        if vendor_id not in VENDOR_DATABASE:
            return {"success": False, "error": f"Vendor {vendor_id} not found"}
        
        vendor = VENDOR_DATABASE[vendor_id]
        
        # Update allowed fields
        allowed_fields = ["contact", "pricing", "rating", "reviews", "payment_status"]
        for field in allowed_fields:
            if field in updates:
                vendor[field] = updates[field]
        
        return {
            "success": True,
            "vendor_id": vendor_id,
            "vendor_name": vendor["name"],
            "message": "Vendor updated successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_vendor_availability(payload: dict) -> Dict[str, Any]:
    """Check vendor availability for specific dates."""
    try:
        vendor_id = payload.get("vendor_id")
        event_date = payload.get("event_date")
        
        if not vendor_id or not event_date:
            return {"success": False, "error": "vendor_id and event_date are required"}
        
        if not _validate_date(event_date):
            return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD"}
        
        if vendor_id not in VENDOR_DATABASE:
            return {"success": False, "error": f"Vendor {vendor_id} not found"}
        
        vendor = VENDOR_DATABASE[vendor_id]
        is_available = event_date not in vendor["availability"]
        
        return {
            "success": True,
            "vendor_id": vendor_id,
            "vendor_name": vendor["name"],
            "service_type": vendor["service_type"],
            "event_date": event_date,
            "available": is_available,
            "status": "Available" if is_available else "Booked",
            "contact": vendor["contact"]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _track_contract(payload: dict) -> Dict[str, Any]:
    """Create and track vendor contract."""
    try:
        vendor_id = payload.get("vendor_id")
        event_date = payload.get("event_date")
        terms = payload.get("terms", {})
        
        if not vendor_id or not event_date:
            return {"success": False, "error": "vendor_id and event_date are required"}
        
        if vendor_id not in VENDOR_DATABASE:
            return {"success": False, "error": f"Vendor {vendor_id} not found"}
        
        vendor = VENDOR_DATABASE[vendor_id]
        contract_id = f"contract_{uuid.uuid4().hex[:8]}"
        
        contract = {
            "id": contract_id,
            "vendor_id": vendor_id,
            "vendor_name": vendor["name"],
            "event_date": event_date,
            "created_date": datetime.now().isoformat(),
            "status": "active",
            "terms": terms,
            "total_cost": terms.get("total_cost", 0),
            "payment_schedule": terms.get("payment_schedule", {})
        }
        
        CONTRACTS[contract_id] = contract
        vendor["contract"] = contract_id
        
        return {
            "success": True,
            "contract_id": contract_id,
            "vendor_name": vendor["name"],
            "event_date": event_date,
            "total_cost": contract["total_cost"],
            "status": "Contract created and active"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _manage_payments(payload: dict) -> Dict[str, Any]:
    """Track and manage vendor payments."""
    try:
        vendor_id = payload.get("vendor_id")
        payment_data = payload.get("payment_data", {})
        
        if not vendor_id:
            return {"success": False, "error": "vendor_id is required"}
        
        if vendor_id not in VENDOR_DATABASE:
            return {"success": False, "error": f"Vendor {vendor_id} not found"}
        
        vendor = VENDOR_DATABASE[vendor_id]
        payment_id = f"payment_{uuid.uuid4().hex[:8]}"
        
        payment = {
            "id": payment_id,
            "vendor_id": vendor_id,
            "vendor_name": vendor["name"],
            "amount": payment_data.get("amount", 0),
            "date": payment_data.get("date", datetime.now().isoformat()),
            "method": payment_data.get("method", "bank_transfer"),
            "status": "processed",
            "reference": payment_data.get("reference", "")
        }
        
        PAYMENTS[payment_id] = payment
        vendor["payment_status"] = "processed"
        
        return {
            "success": True,
            "payment_id": payment_id,
            "vendor_name": vendor["name"],
            "amount": payment["amount"],
            "status": "Payment processed successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _generate_vendor_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive vendor report."""
    try:
        vendor_id = payload.get("vendor_id")
        
        if not vendor_id:
            return {"success": False, "error": "vendor_id is required"}
        
        if vendor_id not in VENDOR_DATABASE:
            return {"success": False, "error": f"Vendor {vendor_id} not found"}
        
        vendor = VENDOR_DATABASE[vendor_id]
        vendor_payments = [p for p in PAYMENTS.values() if p["vendor_id"] == vendor_id]
        
        total_paid = sum(p["amount"] for p in vendor_payments)
        
        report = {
            "vendor_id": vendor_id,
            "report_date": datetime.now().isoformat(),
            "vendor_overview": {
                "name": vendor["name"],
                "service_type": vendor["service_type"],
                "rating": vendor["rating"],
                "total_reviews": vendor["reviews"],
                "contact": vendor["contact"]
            },
            "pricing_info": vendor["pricing"],
            "contract_info": {
                "has_contract": vendor["contract"] is not None,
                "contract_id": vendor["contract"]
            },
            "payment_history": {
                "total_payments": len(vendor_payments),
                "total_paid": total_paid,
                "payment_status": vendor["payment_status"]
            },
            "availability_status": "Check specific dates",
            "recommendation": "Highly recommended" if vendor["rating"] >= 4.7 else "Recommended"
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
        if action == "add_vendor":
            result = _add_vendor(payload)
        elif action == "update_vendor":
            result = _update_vendor(payload)
        elif action == "check_availability":
            result = _check_vendor_availability(payload)
        elif action == "track_contract":
            result = _track_contract(payload)
        elif action == "manage_payments":
            result = _manage_payments(payload)
        elif action == "generate_vendor_report":
            result = _generate_vendor_report(payload)
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
