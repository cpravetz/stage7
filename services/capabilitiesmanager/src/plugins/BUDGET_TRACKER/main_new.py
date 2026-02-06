#!/usr/bin/env python3
"""
BUDGET_TRACKER Plugin - Event budget management
Provides budget categories, expense tracking, remaining budget calculation, and spending analysis.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# In-memory budget database
BUDGETS = {
    "budget_001": {
        "id": "budget_001",
        "event_id": "event_001",
        "event_name": "Annual Gala 2026",
        "total_budget": 50000,
        "created_date": datetime.now().isoformat(),
        "status": "active"
    }
}

EXPENSES = {}

CATEGORIES = [
    "Venue",
    "Catering",
    "Entertainment",
    "Decor",
    "Transportation",
    "Marketing",
    "Staffing",
    "Miscellaneous"
]

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

def _validate_amount(amount: float) -> bool:
    """Validate that amount is a positive number."""
    try:
        return float(amount) >= 0
    except (ValueError, TypeError):
        return False

def _set_budget(payload: dict) -> Dict[str, Any]:
    """Set or create an event budget."""
    try:
        event_id = payload.get("event_id")
        total_budget = payload.get("total_budget", 0)
        event_name = payload.get("event_name", "")
        
        if not event_id:
            return {"success": False, "error": "event_id is required"}
        
        if not _validate_amount(total_budget):
            return {"success": False, "error": "total_budget must be a positive number"}
        
        budget_id = f"budget_{uuid.uuid4().hex[:8]}"
        
        budget = {
            "id": budget_id,
            "event_id": event_id,
            "event_name": event_name,
            "total_budget": total_budget,
            "created_date": datetime.now().isoformat(),
            "status": "active"
        }
        
        BUDGETS[budget_id] = budget
        
        return {
            "success": True,
            "budget_id": budget_id,
            "event_id": event_id,
            "total_budget": total_budget,
            "message": "Budget created successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _add_expense(payload: dict) -> Dict[str, Any]:
    """Add an expense to the budget."""
    try:
        budget_id = payload.get("budget_id")
        amount = payload.get("amount", 0)
        description = payload.get("description", "")
        category = payload.get("category", "Miscellaneous")
        vendor = payload.get("vendor", "")
        expense_date = payload.get("expense_date", datetime.now().isoformat())
        
        if not budget_id:
            return {"success": False, "error": "budget_id is required"}
        
        if budget_id not in BUDGETS:
            return {"success": False, "error": f"Budget {budget_id} not found"}
        
        if not _validate_amount(amount):
            return {"success": False, "error": "amount must be a positive number"}
        
        if not description:
            return {"success": False, "error": "description is required"}
        
        expense_id = f"expense_{uuid.uuid4().hex[:8]}"
        
        expense = {
            "id": expense_id,
            "budget_id": budget_id,
            "amount": float(amount),
            "description": description,
            "category": category,
            "vendor": vendor,
            "expense_date": expense_date,
            "created_date": datetime.now().isoformat()
        }
        
        EXPENSES[expense_id] = expense
        
        return {
            "success": True,
            "expense_id": expense_id,
            "budget_id": budget_id,
            "amount": amount,
            "category": category,
            "message": "Expense added successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _categorize_expense(payload: dict) -> Dict[str, Any]:
    """Categorize or recategorize an expense."""
    try:
        expense_id = payload.get("expense_id")
        new_category = payload.get("category")
        
        if not expense_id:
            return {"success": False, "error": "expense_id is required"}
        
        if expense_id not in EXPENSES:
            return {"success": False, "error": f"Expense {expense_id} not found"}
        
        if new_category not in CATEGORIES:
            return {"success": False, "error": f"Invalid category. Valid categories: {', '.join(CATEGORIES)}"}
        
        expense = EXPENSES[expense_id]
        old_category = expense["category"]
        expense["category"] = new_category
        
        return {
            "success": True,
            "expense_id": expense_id,
            "old_category": old_category,
            "new_category": new_category,
            "message": f"Expense recategorized to {new_category}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _calculate_remaining(payload: dict) -> Dict[str, Any]:
    """Calculate remaining budget."""
    try:
        budget_id = payload.get("budget_id")
        
        if not budget_id:
            return {"success": False, "error": "budget_id is required"}
        
        if budget_id not in BUDGETS:
            return {"success": False, "error": f"Budget {budget_id} not found"}
        
        budget = BUDGETS[budget_id]
        budget_expenses = [e for e in EXPENSES.values() if e["budget_id"] == budget_id]
        
        total_spent = sum([e["amount"] for e in budget_expenses])
        remaining = budget["total_budget"] - total_spent
        spent_percentage = (total_spent / budget["total_budget"] * 100) if budget["total_budget"] > 0 else 0
        
        return {
            "success": True,
            "budget_id": budget_id,
            "event_id": budget["event_id"],
            "total_budget": budget["total_budget"],
            "total_spent": total_spent,
            "remaining": remaining,
            "spent_percentage": f"{spent_percentage:.1f}%",
            "status": "Within budget" if remaining >= 0 else "Over budget"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _track_spending(payload: dict) -> Dict[str, Any]:
    """Track spending by category."""
    try:
        budget_id = payload.get("budget_id")
        
        if not budget_id:
            return {"success": False, "error": "budget_id is required"}
        
        if budget_id not in BUDGETS:
            return {"success": False, "error": f"Budget {budget_id} not found"}
        
        budget = BUDGETS[budget_id]
        budget_expenses = [e for e in EXPENSES.values() if e["budget_id"] == budget_id]
        
        # Group by category
        spending_by_category = {}
        for category in CATEGORIES:
            category_expenses = [e for e in budget_expenses if e["category"] == category]
            total = sum([e["amount"] for e in category_expenses])
            spending_by_category[category] = {
                "total": total,
                "count": len(category_expenses),
                "percentage": (total / budget["total_budget"] * 100) if budget["total_budget"] > 0 else 0
            }
        
        total_spent = sum([e["amount"] for e in budget_expenses])
        
        return {
            "success": True,
            "budget_id": budget_id,
            "total_budget": budget["total_budget"],
            "total_spent": total_spent,
            "spending_by_category": spending_by_category,
            "expense_count": len(budget_expenses)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _generate_budget_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive budget report."""
    try:
        budget_id = payload.get("budget_id")
        
        if not budget_id:
            return {"success": False, "error": "budget_id is required"}
        
        if budget_id not in BUDGETS:
            return {"success": False, "error": f"Budget {budget_id} not found"}
        
        budget = BUDGETS[budget_id]
        budget_expenses = [e for e in EXPENSES.values() if e["budget_id"] == budget_id]
        
        total_spent = sum([e["amount"] for e in budget_expenses])
        remaining = budget["total_budget"] - total_spent
        
        # Spending by category
        spending_by_category = {}
        for category in CATEGORIES:
            category_expenses = [e for e in budget_expenses if e["category"] == category]
            total = sum([e["amount"] for e in category_expenses])
            if total > 0:
                spending_by_category[category] = {
                    "total": total,
                    "percentage": (total / budget["total_budget"] * 100)
                }
        
        # Top expenses
        top_expenses = sorted(budget_expenses, key=lambda x: x["amount"], reverse=True)[:5]
        
        report = {
            "budget_id": budget_id,
            "event_id": budget["event_id"],
            "event_name": budget["event_name"],
            "report_date": datetime.now().isoformat(),
            "budget_summary": {
                "total_budget": budget["total_budget"],
                "total_spent": total_spent,
                "remaining": remaining,
                "utilization": f"{(total_spent / budget['total_budget'] * 100):.1f}%"
            },
            "spending_by_category": spending_by_category,
            "top_expenses": [
                {
                    "description": e["description"],
                    "category": e["category"],
                    "amount": e["amount"],
                    "vendor": e["vendor"]
                }
                for e in top_expenses
            ],
            "expense_count": len(budget_expenses),
            "budget_status": "Within budget" if remaining >= 0 else "Over budget",
            "recommendation": "On track" if total_spent <= (budget["total_budget"] * 0.8) else "Monitor spending"
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
        if action == "set_budget":
            result = _set_budget(payload)
        elif action == "add_expense":
            result = _add_expense(payload)
        elif action == "categorize_expense":
            result = _categorize_expense(payload)
        elif action == "calculate_remaining":
            result = _calculate_remaining(payload)
        elif action == "track_spending":
            result = _track_spending(payload)
        elif action == "generate_budget_report":
            result = _generate_budget_report(payload)
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
