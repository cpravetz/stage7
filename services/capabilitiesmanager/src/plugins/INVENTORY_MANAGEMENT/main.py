#!/usr/bin/env python3
"""
INVENTORY_MANAGEMENT Plugin - Food and beverage inventory management
Manages inventory tracking, stock levels, low stock alerts, and valuations.
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

class ItemCategory(Enum):
    PRODUCE = "produce"
    MEAT = "meat"
    SEAFOOD = "seafood"
    DAIRY = "dairy"
    DRY_GOODS = "dry_goods"
    BEVERAGE = "beverage"
    SPICE = "spice"
    OTHER = "other"

class UnitType(Enum):
    PIECE = "piece"
    POUND = "pound"
    KILOGRAM = "kilogram"
    LITER = "liter"
    GALLON = "gallon"
    BOX = "box"
    DOZEN = "dozen"

class AlertLevel(Enum):
    CRITICAL = "critical"
    LOW = "low"
    NORMAL = "normal"
    OVERSTOCK = "overstock"

# In-Memory Data Storage
_inventory_items = {}
_stock_levels = {}
_low_stock_alerts = {}
_inventory_transactions = {}
_supplier_info = {}
_valuation_history = {}

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
    """Initialize restaurant inventory structures."""
    if restaurant_id not in _inventory_items:
        _inventory_items[restaurant_id] = _create_sample_inventory()
        _stock_levels[restaurant_id] = {}
        _low_stock_alerts[restaurant_id] = []
        _inventory_transactions[restaurant_id] = []
        _supplier_info[restaurant_id] = _create_sample_suppliers()
        _valuation_history[restaurant_id] = []
        
        # Initialize stock levels for sample items
        for item_id, item in _inventory_items[restaurant_id].items():
            _stock_levels[restaurant_id][item_id] = {
                "item_id": item_id,
                "quantity": item["initial_quantity"],
                "unit": item["unit"],
                "last_updated": datetime.now().isoformat()
            }

def _create_sample_inventory() -> Dict[str, Dict[str, Any]]:
    """Create sample inventory items."""
    return {
        "ITEM_001": {
            "item_id": "ITEM_001",
            "name": "Tomatoes",
            "category": ItemCategory.PRODUCE.value,
            "unit": UnitType.POUND.value,
            "cost_per_unit": 1.50,
            "selling_price": 2.00,
            "min_stock": 50,
            "max_stock": 200,
            "initial_quantity": 120,
            "reorder_point": 60,
            "supplier_id": "SUP_001",
            "expiration_days": 7
        },
        "ITEM_002": {
            "item_id": "ITEM_002",
            "name": "Salmon Fillet",
            "category": ItemCategory.SEAFOOD.value,
            "unit": UnitType.POUND.value,
            "cost_per_unit": 12.50,
            "selling_price": 28.00,
            "min_stock": 20,
            "max_stock": 80,
            "initial_quantity": 45,
            "reorder_point": 30,
            "supplier_id": "SUP_002",
            "expiration_days": 2
        },
        "ITEM_003": {
            "item_id": "ITEM_003",
            "name": "Olive Oil",
            "category": ItemCategory.DRY_GOODS.value,
            "unit": UnitType.LITER.value,
            "cost_per_unit": 8.00,
            "selling_price": 12.00,
            "min_stock": 10,
            "max_stock": 30,
            "initial_quantity": 18,
            "reorder_point": 12,
            "supplier_id": "SUP_001",
            "expiration_days": 365
        },
        "ITEM_004": {
            "item_id": "ITEM_004",
            "name": "Mozzarella Cheese",
            "category": ItemCategory.DAIRY.value,
            "unit": UnitType.POUND.value,
            "cost_per_unit": 6.50,
            "selling_price": 9.50,
            "min_stock": 25,
            "max_stock": 100,
            "initial_quantity": 60,
            "reorder_point": 35,
            "supplier_id": "SUP_003",
            "expiration_days": 14
        },
        "ITEM_005": {
            "item_id": "ITEM_005",
            "name": "Red Wine",
            "category": ItemCategory.BEVERAGE.value,
            "unit": UnitType.BOTTLE.value,
            "cost_per_unit": 15.00,
            "selling_price": 45.00,
            "min_stock": 30,
            "max_stock": 100,
            "initial_quantity": 70,
            "reorder_point": 40,
            "supplier_id": "SUP_004",
            "expiration_days": 730
        },
        "ITEM_006": {
            "item_id": "ITEM_006",
            "name": "Black Pepper",
            "category": ItemCategory.SPICE.value,
            "unit": UnitType.POUND.value,
            "cost_per_unit": 2.50,
            "selling_price": 4.00,
            "min_stock": 5,
            "max_stock": 20,
            "initial_quantity": 12,
            "reorder_point": 8,
            "supplier_id": "SUP_001",
            "expiration_days": 180
        },
    }

def _create_sample_suppliers() -> Dict[str, Dict[str, Any]]:
    """Create sample supplier information."""
    return {
        "SUP_001": {
            "supplier_id": "SUP_001",
            "name": "Fresh Farms Inc",
            "contact": "john@freshfarms.com",
            "phone": "555-0101",
            "lead_time_days": 1,
            "payment_terms": "Net 30"
        },
        "SUP_002": {
            "supplier_id": "SUP_002",
            "name": "Ocean Harvest",
            "contact": "sales@oceanharvest.com",
            "phone": "555-0102",
            "lead_time_days": 2,
            "payment_terms": "COD"
        },
        "SUP_003": {
            "supplier_id": "SUP_003",
            "name": "Dairy Direct",
            "contact": "info@dairydirect.com",
            "phone": "555-0103",
            "lead_time_days": 1,
            "payment_terms": "Net 15"
        },
        "SUP_004": {
            "supplier_id": "SUP_004",
            "name": "Wine Distributors Ltd",
            "contact": "orders@winedist.com",
            "phone": "555-0104",
            "lead_time_days": 3,
            "payment_terms": "Net 45"
        }
    }

def add_item(payload: dict) -> Dict[str, Any]:
    """Add a new inventory item."""
    required = ["name", "category", "unit", "cost_per_unit"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    name = payload.get("name")
    category = payload.get("category")
    unit = payload.get("unit")
    cost_per_unit = payload.get("cost_per_unit")
    
    _initialize_restaurant(restaurant_id)
    
    # Validate category and unit
    valid_categories = [c.value for c in ItemCategory]
    valid_units = [u.value for u in UnitType]
    
    if category not in valid_categories:
        return {"success": False, "error": f"Invalid category: {category}"}
    
    if unit not in valid_units:
        return {"success": False, "error": f"Invalid unit: {unit}"}
    
    item_id = f"ITEM_{restaurant_id}_{uuid.uuid4().hex[:8].upper()}"
    
    item = {
        "item_id": item_id,
        "name": name,
        "category": category,
        "unit": unit,
        "cost_per_unit": cost_per_unit,
        "selling_price": payload.get("selling_price", cost_per_unit * 1.5),
        "min_stock": payload.get("min_stock", 10),
        "max_stock": payload.get("max_stock", 50),
        "initial_quantity": payload.get("initial_quantity", 0),
        "reorder_point": payload.get("reorder_point", 15),
        "supplier_id": payload.get("supplier_id"),
        "expiration_days": payload.get("expiration_days", 30),
        "created_at": datetime.now().isoformat()
    }
    
    _inventory_items[restaurant_id][item_id] = item
    
    # Initialize stock level
    _stock_levels[restaurant_id][item_id] = {
        "item_id": item_id,
        "quantity": item["initial_quantity"],
        "unit": unit,
        "last_updated": datetime.now().isoformat()
    }
    
    # Log transaction
    _inventory_transactions[restaurant_id].append({
        "transaction_id": f"TXN_{uuid.uuid4().hex[:8].upper()}",
        "type": "item_creation",
        "item_id": item_id,
        "quantity": item["initial_quantity"],
        "timestamp": datetime.now().isoformat()
    })
    
    return {
        "success": True,
        "item_id": item_id,
        "name": name,
        "category": category,
        "initial_quantity": item["initial_quantity"],
        "unit": unit
    }

def update_quantity(payload: dict) -> Dict[str, Any]:
    """Update item quantity."""
    required = ["item_id", "quantity_change"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    item_id = payload.get("item_id")
    quantity_change = payload.get("quantity_change")
    transaction_type = payload.get("transaction_type", "usage")
    
    _initialize_restaurant(restaurant_id)
    
    if item_id not in _inventory_items[restaurant_id]:
        return {"success": False, "error": f"Item {item_id} not found"}
    
    stock = _stock_levels[restaurant_id][item_id]
    old_quantity = stock["quantity"]
    new_quantity = old_quantity + quantity_change
    
    if new_quantity < 0:
        return {"success": False, "error": f"Insufficient stock (current: {old_quantity})"}
    
    stock["quantity"] = new_quantity
    stock["last_updated"] = datetime.now().isoformat()
    
    # Log transaction
    transaction = {
        "transaction_id": f"TXN_{uuid.uuid4().hex[:8].upper()}",
        "type": transaction_type,
        "item_id": item_id,
        "quantity_change": quantity_change,
        "old_quantity": old_quantity,
        "new_quantity": new_quantity,
        "timestamp": datetime.now().isoformat(),
        "notes": payload.get("notes", "")
    }
    _inventory_transactions[restaurant_id].append(transaction)
    
    # Check if low stock alert needed
    item = _inventory_items[restaurant_id][item_id]
    if new_quantity <= item["reorder_point"]:
        _check_and_create_alert(restaurant_id, item_id, item, new_quantity)
    
    return {
        "success": True,
        "item_id": item_id,
        "transaction_id": transaction["transaction_id"],
        "old_quantity": old_quantity,
        "new_quantity": new_quantity,
        "unit": stock["unit"],
        "alert_needed": new_quantity <= item["reorder_point"]
    }

def _check_and_create_alert(restaurant_id: str, item_id: str, item: dict, quantity: int) -> None:
    """Check and create low stock alert if needed."""
    level = AlertLevel.CRITICAL.value if quantity == 0 else AlertLevel.LOW.value
    
    alert = {
        "alert_id": f"ALT_{uuid.uuid4().hex[:8].upper()}",
        "item_id": item_id,
        "item_name": item["name"],
        "current_quantity": quantity,
        "reorder_point": item["reorder_point"],
        "alert_level": level,
        "supplier_id": item.get("supplier_id"),
        "created_at": datetime.now().isoformat(),
        "acknowledged": False
    }
    
    _low_stock_alerts[restaurant_id].append(alert)

def check_stock_level(payload: dict) -> Dict[str, Any]:
    """Check stock level for an item."""
    required = ["item_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    item_id = payload.get("item_id")
    
    _initialize_restaurant(restaurant_id)
    
    if item_id not in _inventory_items[restaurant_id]:
        return {"success": False, "error": f"Item {item_id} not found"}
    
    item = _inventory_items[restaurant_id][item_id]
    stock = _stock_levels[restaurant_id][item_id]
    
    # Determine alert level
    quantity = stock["quantity"]
    if quantity == 0:
        alert_level = AlertLevel.CRITICAL.value
    elif quantity <= item["reorder_point"]:
        alert_level = AlertLevel.LOW.value
    elif quantity >= item["max_stock"]:
        alert_level = AlertLevel.OVERSTOCK.value
    else:
        alert_level = AlertLevel.NORMAL.value
    
    # Calculate percentage of max stock
    stock_percentage = (quantity / item["max_stock"] * 100) if item["max_stock"] > 0 else 0
    
    return {
        "success": True,
        "item_id": item_id,
        "name": item["name"],
        "category": item["category"],
        "current_quantity": quantity,
        "unit": stock["unit"],
        "min_stock": item["min_stock"],
        "max_stock": item["max_stock"],
        "reorder_point": item["reorder_point"],
        "alert_level": alert_level,
        "stock_percentage": round(stock_percentage, 1),
        "status": f"{quantity}/{item['max_stock']}"
    }

def generate_low_stock_alert(payload: dict) -> Dict[str, Any]:
    """Generate and manage low stock alerts."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    action = payload.get("action", "list")  # list, acknowledge, clear
    alert_id = payload.get("alert_id")
    
    _initialize_restaurant(restaurant_id)
    
    if action == "list":
        active_alerts = [a for a in _low_stock_alerts[restaurant_id] if not a["acknowledged"]]
        
        # Add supplier info to alerts
        for alert in active_alerts:
            supplier_id = alert.get("supplier_id")
            if supplier_id and supplier_id in _supplier_info[restaurant_id]:
                alert["supplier"] = _supplier_info[restaurant_id][supplier_id]
        
        return {
            "success": True,
            "active_alerts": len(active_alerts),
            "alerts": active_alerts
        }
    
    elif action == "acknowledge":
        if not alert_id:
            return {"success": False, "error": "alert_id required"}
        
        for alert in _low_stock_alerts[restaurant_id]:
            if alert["alert_id"] == alert_id:
                alert["acknowledged"] = True
                alert["acknowledged_at"] = datetime.now().isoformat()
                return {
                    "success": True,
                    "alert_id": alert_id,
                    "acknowledged": True
                }
        
        return {"success": False, "error": f"Alert {alert_id} not found"}
    
    return {"success": False, "error": f"Unknown action: {action}"}

def calculate_value(payload: dict) -> Dict[str, Any]:
    """Calculate inventory value."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    category_filter = payload.get("category_filter")
    
    _initialize_restaurant(restaurant_id)
    
    items = _inventory_items[restaurant_id]
    stocks = _stock_levels[restaurant_id]
    
    valuation = {}
    total_value = 0.0
    
    for item_id, item in items.items():
        if category_filter and item["category"] != category_filter:
            continue
        
        stock = stocks[item_id]
        item_value = stock["quantity"] * item["cost_per_unit"]
        
        valuation[item_id] = {
            "item_id": item_id,
            "name": item["name"],
            "category": item["category"],
            "quantity": stock["quantity"],
            "unit_cost": item["cost_per_unit"],
            "item_value": round(item_value, 2)
        }
        
        total_value += item_value
    
    # Group by category
    by_category = {}
    for val in valuation.values():
        cat = val["category"]
        if cat not in by_category:
            by_category[cat] = 0
        by_category[cat] += val["item_value"]
    
    valuation_record = {
        "timestamp": datetime.now().isoformat(),
        "total_value": round(total_value, 2),
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "item_count": len(valuation)
    }
    
    _valuation_history[restaurant_id].append(valuation_record)
    
    return {
        "success": True,
        "total_value": round(total_value, 2),
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "item_valuations": list(valuation.values())[:50],
        "timestamp": valuation_record["timestamp"]
    }

def generate_inventory_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive inventory report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    
    _initialize_restaurant(restaurant_id)
    
    items = _inventory_items[restaurant_id]
    stocks = _stock_levels[restaurant_id]
    
    # Category summary
    by_category = {}
    for item in items.values():
        cat = item["category"]
        if cat not in by_category:
            by_category[cat] = {"count": 0, "total_qty": 0}
        by_category[cat]["count"] += 1
        by_category[cat]["total_qty"] += stocks[item["item_id"]]["quantity"]
    
    # Stock status
    low_stock = sum(1 for item in items.values() if stocks[item["item_id"]]["quantity"] <= item["reorder_point"])
    overstock = sum(1 for item in items.values() if stocks[item["item_id"]]["quantity"] >= item["max_stock"])
    
    # Calculate total value
    total_value = 0
    for item in items.values():
        total_value += stocks[item["item_id"]]["quantity"] * item["cost_per_unit"]
    
    return {
        "success": True,
        "report_timestamp": datetime.now().isoformat(),
        "summary": {
            "total_items": len(items),
            "low_stock_items": low_stock,
            "overstock_items": overstock,
            "total_inventory_value": round(total_value, 2)
        },
        "by_category": by_category,
        "active_alerts": len([a for a in _low_stock_alerts[restaurant_id] if not a["acknowledged"]]),
        "recent_transactions": _inventory_transactions[restaurant_id][-10:]
    }

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "add_item":
            return add_item(payload)
        elif action_lower == "update_quantity":
            return update_quantity(payload)
        elif action_lower == "check_stock_level":
            return check_stock_level(payload)
        elif action_lower == "generate_low_stock_alert":
            return generate_low_stock_alert(payload)
        elif action_lower == "calculate_value":
            return calculate_value(payload)
        elif action_lower == "generate_inventory_report":
            return generate_inventory_report(payload)
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
