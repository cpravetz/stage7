#!/usr/bin/env python3
"""
BILLING Plugin - Hotel billing and charge management
Manages invoices, itemized charges, taxes, payments, discounts, and statement generation.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime
from enum import Enum
from decimal import Decimal

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class InvoiceStatus(Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIAL_PAID = "partial_paid"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

class ChargeType(Enum):
    ROOM = "room"
    FOOD_BEVERAGE = "food_beverage"
    SERVICE = "service"
    AMENITY = "amenity"
    PARKING = "parking"
    OTHER = "other"

# Tax rates by jurisdiction
TAX_RATES = {
    "standard": 0.10,
    "hospitality": 0.12,
    "food": 0.08,
    "service": 0.05
}

# In-Memory Data Storage
_invoices = {}
_charges = {}
_payments = {}
_discounts = {}

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

def _generate_invoice_number(guest_id: str) -> str:
    """Generate unique invoice number."""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"INV_{guest_id}_{timestamp}"

def create_invoice(payload: dict) -> Dict[str, Any]:
    """Create a new invoice for a guest."""
    required = ["guest_id", "check_in_date", "check_out_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    guest_id = payload.get("guest_id")
    invoice_number = _generate_invoice_number(guest_id)
    
    invoice = {
        "invoice_number": invoice_number,
        "guest_id": guest_id,
        "guest_name": payload.get("guest_name", "Unknown Guest"),
        "check_in_date": payload.get("check_in_date"),
        "check_out_date": payload.get("check_out_date"),
        "room_id": payload.get("room_id", ""),
        "room_rate": payload.get("room_rate", 0.0),
        "num_nights": payload.get("num_nights", 1),
        "status": InvoiceStatus.DRAFT.value,
        "charges": [],
        "subtotal": 0.0,
        "tax_rate": payload.get("tax_rate", TAX_RATES["standard"]),
        "tax_amount": 0.0,
        "discount_amount": 0.0,
        "total_amount": 0.0,
        "amount_paid": 0.0,
        "balance_due": 0.0,
        "created_at": datetime.now().isoformat(),
        "issued_at": None,
        "due_date": payload.get("due_date", ""),
        "notes": payload.get("notes", "")
    }
    
    _invoices[invoice_number] = invoice
    _charges[invoice_number] = []
    _payments[invoice_number] = []
    _discounts[invoice_number] = []
    
    logger.info(f"Created invoice {invoice_number} for guest {guest_id}")
    
    return {
        "success": True,
        "invoice": invoice
    }

def add_charges(payload: dict) -> Dict[str, Any]:
    """Add charges to an invoice."""
    required = ["invoice_number", "charges"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    invoice_number = payload.get("invoice_number")
    charges_list = payload.get("charges", [])
    
    if invoice_number not in _invoices:
        return {"success": False, "error": f"Invoice {invoice_number} not found"}
    
    invoice = _invoices[invoice_number]
    added_charges = []
    
    for charge in charges_list:
        if not charge.get("description") or charge.get("amount") is None:
            continue
        
        charge_record = {
            "charge_id": f"CHG_{invoice_number}_{len(_charges[invoice_number])}",
            "description": charge.get("description"),
            "amount": float(charge.get("amount", 0)),
            "charge_type": charge.get("charge_type", ChargeType.OTHER.value),
            "quantity": charge.get("quantity", 1),
            "unit_price": float(charge.get("unit_price", 0)),
            "added_at": datetime.now().isoformat()
        }
        
        _charges[invoice_number].append(charge_record)
        invoice["charges"].append(charge_record)
        added_charges.append(charge_record)
        
        invoice["subtotal"] += charge_record["amount"]
    
    # Recalculate totals
    _recalculate_invoice(invoice_number)
    
    logger.info(f"Added {len(added_charges)} charges to invoice {invoice_number}")
    
    return {
        "success": True,
        "charges_added": len(added_charges),
        "added_charges": added_charges
    }

def calculate_total(payload: dict) -> Dict[str, Any]:
    """Calculate invoice totals including taxes and discounts."""
    required = ["invoice_number"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    invoice_number = payload.get("invoice_number")
    
    if invoice_number not in _invoices:
        return {"success": False, "error": f"Invoice {invoice_number} not found"}
    
    invoice = _invoices[invoice_number]
    
    # Calculate room charges
    room_charge = invoice["room_rate"] * invoice["num_nights"]
    
    # Calculate subtotal
    subtotal = room_charge + invoice["subtotal"]
    
    # Calculate tax
    tax_amount = subtotal * invoice["tax_rate"]
    
    # Calculate total before discount
    total_before_discount = subtotal + tax_amount
    
    # Apply discounts
    discount_amount = sum(d["amount"] for d in _discounts.get(invoice_number, []))
    
    # Final total
    total_amount = total_before_discount - discount_amount
    
    # Balance due
    balance_due = total_amount - invoice["amount_paid"]
    
    return {
        "success": True,
        "calculation": {
            "room_charge": round(room_charge, 2),
            "other_charges": round(invoice["subtotal"], 2),
            "subtotal": round(subtotal, 2),
            "tax_amount": round(tax_amount, 2),
            "discount_amount": round(discount_amount, 2),
            "total_amount": round(total_amount, 2),
            "amount_paid": round(invoice["amount_paid"], 2),
            "balance_due": round(balance_due, 2)
        }
    }

def apply_discount(payload: dict) -> Dict[str, Any]:
    """Apply a discount to an invoice."""
    required = ["invoice_number", "discount_amount"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    invoice_number = payload.get("invoice_number")
    discount_amount = float(payload.get("discount_amount", 0))
    
    if invoice_number not in _invoices:
        return {"success": False, "error": f"Invoice {invoice_number} not found"}
    
    invoice = _invoices[invoice_number]
    
    discount = {
        "discount_id": f"DISC_{invoice_number}_{len(_discounts[invoice_number])}",
        "reason": payload.get("reason", "Promotional discount"),
        "amount": discount_amount,
        "percentage": payload.get("percentage", 0),
        "applied_by": payload.get("applied_by", "System"),
        "applied_at": datetime.now().isoformat()
    }
    
    _discounts[invoice_number].append(discount)
    invoice["discount_amount"] += discount_amount
    
    _recalculate_invoice(invoice_number)
    
    logger.info(f"Applied discount to invoice {invoice_number}")
    
    return {
        "success": True,
        "discount": discount
    }

def process_payment(payload: dict) -> Dict[str, Any]:
    """Process a payment for an invoice."""
    required = ["invoice_number", "payment_amount"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    invoice_number = payload.get("invoice_number")
    payment_amount = float(payload.get("payment_amount", 0))
    
    if invoice_number not in _invoices:
        return {"success": False, "error": f"Invoice {invoice_number} not found"}
    
    if payment_amount <= 0:
        return {"success": False, "error": "Payment amount must be positive"}
    
    invoice = _invoices[invoice_number]
    
    payment = {
        "payment_id": f"PAY_{invoice_number}_{len(_payments[invoice_number])}",
        "amount": payment_amount,
        "payment_method": payload.get("payment_method", "credit_card"),
        "reference_number": payload.get("reference_number", ""),
        "processed_by": payload.get("processed_by", "System"),
        "processed_at": datetime.now().isoformat()
    }
    
    _payments[invoice_number].append(payment)
    invoice["amount_paid"] += payment_amount
    
    # Update invoice status
    if invoice["amount_paid"] >= invoice["total_amount"]:
        invoice["status"] = InvoiceStatus.PAID.value
    elif invoice["amount_paid"] > 0:
        invoice["status"] = InvoiceStatus.PARTIAL_PAID.value
    
    _recalculate_invoice(invoice_number)
    
    logger.info(f"Processed payment of {payment_amount} for invoice {invoice_number}")
    
    return {
        "success": True,
        "payment": payment,
        "updated_invoice_status": invoice["status"],
        "balance_due": round(invoice["balance_due"], 2)
    }

def generate_statement(payload: dict) -> Dict[str, Any]:
    """Generate a complete billing statement."""
    required = ["invoice_number"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    invoice_number = payload.get("invoice_number")
    
    if invoice_number not in _invoices:
        return {"success": False, "error": f"Invoice {invoice_number} not found"}
    
    invoice = _invoices[invoice_number]
    
    # Finalize invoice if still draft
    if invoice["status"] == InvoiceStatus.DRAFT.value:
        invoice["status"] = InvoiceStatus.ISSUED.value
        invoice["issued_at"] = datetime.now().isoformat()
    
    _recalculate_invoice(invoice_number)
    
    statement = {
        "statement_id": f"STMT_{invoice_number}",
        "invoice_number": invoice_number,
        "guest_id": invoice["guest_id"],
        "guest_name": invoice["guest_name"],
        "generated_at": datetime.now().isoformat(),
        "invoice_details": {
            "status": invoice["status"],
            "issued_at": invoice["issued_at"],
            "due_date": invoice["due_date"],
            "check_in": invoice["check_in_date"],
            "check_out": invoice["check_out_date"]
        },
        "itemization": {
            "room_charges": {
                "rate_per_night": invoice["room_rate"],
                "num_nights": invoice["num_nights"],
                "subtotal": invoice["room_rate"] * invoice["num_nights"]
            },
            "other_charges": invoice["charges"],
            "subtotal": invoice["subtotal"] + (invoice["room_rate"] * invoice["num_nights"])
        },
        "taxes_and_fees": {
            "tax_rate": f"{invoice['tax_rate']*100:.1f}%",
            "tax_amount": round(invoice["tax_amount"], 2)
        },
        "discounts_applied": _discounts.get(invoice_number, []),
        "financial_summary": {
            "subtotal": round(invoice["subtotal"] + (invoice["room_rate"] * invoice["num_nights"]), 2),
            "taxes": round(invoice["tax_amount"], 2),
            "discounts": round(invoice["discount_amount"], 2),
            "total": round(invoice["total_amount"], 2),
            "amount_paid": round(invoice["amount_paid"], 2),
            "balance_due": round(invoice["balance_due"], 2)
        },
        "payment_history": _payments.get(invoice_number, [])
    }
    
    logger.info(f"Generated statement for invoice {invoice_number}")
    
    return {
        "success": True,
        "statement": statement
    }

def _recalculate_invoice(invoice_number: str) -> None:
    """Recalculate all totals for an invoice."""
    invoice = _invoices[invoice_number]
    
    room_charge = invoice["room_rate"] * invoice["num_nights"]
    subtotal = room_charge + invoice["subtotal"]
    
    invoice["tax_amount"] = subtotal * invoice["tax_rate"]
    total_before_discount = subtotal + invoice["tax_amount"]
    invoice["total_amount"] = total_before_discount - invoice["discount_amount"]
    invoice["balance_due"] = max(0, invoice["total_amount"] - invoice["amount_paid"])

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "create_invoice": create_invoice,
            "add_charges": add_charges,
            "calculate_total": calculate_total,
            "apply_discount": apply_discount,
            "process_payment": process_payment,
            "generate_statement": generate_statement
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
        "action": "create_invoice",
        "payload": {
            "guest_id": "GUEST_001",
            "guest_name": "John Doe",
            "check_in_date": "2026-01-30",
            "check_out_date": "2026-02-02",
            "room_id": "ROOM_201",
            "room_rate": 150.0,
            "num_nights": 3
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
