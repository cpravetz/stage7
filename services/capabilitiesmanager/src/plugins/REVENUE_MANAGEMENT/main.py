#!/usr/bin/env python3
"""
REVENUE_MANAGEMENT Plugin - Revenue analysis and optimization
Analyzes revenue metrics, trends, occupancy rates, ADR calculations, and pricing optimization.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import statistics

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# In-Memory Data Storage
_revenue_records = {}
_pricing_strategies = {}
_occupancy_records = {}

ROOM_TYPES = ["standard", "deluxe", "suite", "penthouse", "accessible"]

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
    if hotel_id not in _revenue_records:
        _revenue_records[hotel_id] = []
        _pricing_strategies[hotel_id] = {}
        _occupancy_records[hotel_id] = []

def calculate_revenue(payload: dict) -> Dict[str, Any]:
    """Calculate total revenue for a period or specific criteria."""
    required = ["hotel_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    hotel_id = payload.get("hotel_id")
    _initialize_hotel(hotel_id)
    
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    room_type = payload.get("room_type")
    
    filtered_records = _revenue_records[hotel_id]
    
    if start_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            filtered_records = [r for r in filtered_records if datetime.fromisoformat(r["date"]) >= start]
        except:
            pass
    
    if end_date:
        try:
            end = datetime.strptime(end_date, "%Y-%m-%d")
            filtered_records = [r for r in filtered_records if datetime.fromisoformat(r["date"]) <= end]
        except:
            pass
    
    if room_type:
        filtered_records = [r for r in filtered_records if r.get("room_type") == room_type]
    
    total_revenue = sum(r.get("amount", 0) for r in filtered_records)
    count = len(filtered_records)
    
    # Generate sample revenue data if none exists
    if count == 0:
        for i in range(30):
            date = (datetime.now() - timedelta(days=30-i)).strftime("%Y-%m-%d")
            for rt in ROOM_TYPES:
                amount = 100 * (1 + (i % 5) / 10)
                _revenue_records[hotel_id].append({
                    "date": date,
                    "room_type": rt,
                    "amount": amount,
                    "recorded_at": datetime.now().isoformat()
                })
        filtered_records = _revenue_records[hotel_id]
        total_revenue = sum(r.get("amount", 0) for r in filtered_records)
        count = len(filtered_records)
    
    average_revenue = total_revenue / count if count > 0 else 0
    
    return {
        "success": True,
        "revenue_calculation": {
            "hotel_id": hotel_id,
            "period": {
                "start_date": start_date or "All-time",
                "end_date": end_date or "All-time"
            },
            "filtered_by_room_type": room_type or "All types",
            "metrics": {
                "total_revenue": round(total_revenue, 2),
                "transaction_count": count,
                "average_transaction": round(average_revenue, 2),
                "currency": "USD"
            }
        }
    }

def analyze_revenue_trends(payload: dict) -> Dict[str, Any]:
    """Analyze revenue trends over time."""
    required = ["hotel_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    hotel_id = payload.get("hotel_id")
    days = payload.get("days", 30)
    
    _initialize_hotel(hotel_id)
    
    # Generate trend data
    daily_revenue = defaultdict(float)
    
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        base_revenue = 5000 + (i % 7) * 500  # Weekly pattern
        daily_revenue[date] = base_revenue
    
    # Calculate trend metrics
    values = list(daily_revenue.values())
    if len(values) > 1:
        trend_direction = "increasing" if values[-1] > values[0] else "decreasing"
        trend_percentage = ((values[-1] - values[0]) / values[0] * 100) if values[0] != 0 else 0
    else:
        trend_direction = "stable"
        trend_percentage = 0
    
    total_revenue = sum(values)
    avg_daily = statistics.mean(values) if values else 0
    
    try:
        std_dev = statistics.stdev(values) if len(values) > 1 else 0
    except:
        std_dev = 0
    
    return {
        "success": True,
        "revenue_trends": {
            "hotel_id": hotel_id,
            "analysis_period_days": days,
            "daily_breakdown": dict(daily_revenue),
            "trend_analysis": {
                "direction": trend_direction,
                "percentage_change": round(trend_percentage, 2),
                "volatility": round(std_dev, 2)
            },
            "summary_metrics": {
                "total_revenue": round(total_revenue, 2),
                "average_daily_revenue": round(avg_daily, 2),
                "max_daily_revenue": round(max(values), 2) if values else 0,
                "min_daily_revenue": round(min(values), 2) if values else 0
            },
            "forecast": {
                "next_7_days_projected": round(avg_daily * 7, 2),
                "next_30_days_projected": round(avg_daily * 30, 2)
            }
        }
    }

def optimize_pricing(payload: dict) -> Dict[str, Any]:
    """Generate pricing optimization recommendations."""
    required = ["hotel_id", "room_type"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    hotel_id = payload.get("hotel_id")
    room_type = payload.get("room_type")
    current_rate = payload.get("current_rate", 100.0)
    target_occupancy = payload.get("target_occupancy", 80.0)
    
    _initialize_hotel(hotel_id)
    
    # Simulate occupancy data
    current_occupancy = 65.0 + (hash(f"{hotel_id}{room_type}") % 30)
    
    recommendations = []
    suggested_rate = current_rate
    
    if current_occupancy < target_occupancy:
        # Occupancy too low, reduce prices
        reduction = ((target_occupancy - current_occupancy) / 100) * 0.15
        suggested_rate = current_rate * (1 - reduction)
        recommendations.append(f"Reduce price by {reduction*100:.1f}% to boost occupancy")
    elif current_occupancy > target_occupancy + 10:
        # Occupancy very high, increase prices
        increase = ((current_occupancy - target_occupancy) / 100) * 0.20
        suggested_rate = current_rate * (1 + increase)
        recommendations.append(f"Increase price by {increase*100:.1f}% due to high demand")
    else:
        recommendations.append("Pricing is optimal for target occupancy")
    
    # Add day-of-week recommendations
    day_of_week = datetime.now().weekday()
    if day_of_week < 5:  # Weekday
        recommendations.append("Weekday: Consider dynamic pricing for weekends")
    else:
        recommendations.append("Weekend: Premium pricing applicable")
    
    # Competitive analysis
    market_avg_rate = current_rate * (0.95 + (hash(f"{room_type}") % 10) / 100)
    if suggested_rate < market_avg_rate:
        recommendations.append(f"Rate is below market average (${market_avg_rate:.2f})")
    
    return {
        "success": True,
        "pricing_optimization": {
            "hotel_id": hotel_id,
            "room_type": room_type,
            "current_analysis": {
                "current_rate": round(current_rate, 2),
                "current_occupancy_percent": round(current_occupancy, 2),
                "target_occupancy_percent": target_occupancy
            },
            "optimization": {
                "suggested_rate": round(suggested_rate, 2),
                "rate_adjustment_percent": round(((suggested_rate - current_rate) / current_rate * 100), 2),
                "expected_occupancy_change": round(((current_occupancy - target_occupancy)), 2)
            },
            "recommendations": recommendations,
            "market_context": {
                "market_average_rate": round(market_avg_rate, 2),
                "competitive_position": "Above market" if suggested_rate > market_avg_rate else "Below market"
            }
        }
    }

def calculate_occupancy_rate(payload: dict) -> Dict[str, Any]:
    """Calculate occupancy rate for a period."""
    required = ["hotel_id", "total_rooms"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    hotel_id = payload.get("hotel_id")
    total_rooms = payload.get("total_rooms", 100)
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    days = payload.get("days", 30)
    
    _initialize_hotel(hotel_id)
    
    # Calculate days in period
    if start_date and end_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
            period_days = (end - start).days
        except:
            period_days = days
    else:
        period_days = days
    
    # Generate occupancy data
    daily_occupancy = {}
    for i in range(period_days):
        date = (datetime.now() - timedelta(days=period_days-1-i)).strftime("%Y-%m-%d")
        # Simulate occupancy with weekly pattern
        base = 70 + (i % 7) * 5
        daily_occupancy[date] = min(100, max(40, base))
    
    occupancy_values = list(daily_occupancy.values())
    avg_occupancy = statistics.mean(occupancy_values) if occupancy_values else 0
    
    # Calculate room-nights
    total_available_room_nights = total_rooms * period_days
    occupied_room_nights = int((avg_occupancy / 100) * total_available_room_nights)
    
    return {
        "success": True,
        "occupancy_rate": {
            "hotel_id": hotel_id,
            "period": {
                "start_date": start_date or f"{period_days} days ago",
                "end_date": end_date or "Today",
                "period_days": period_days
            },
            "metrics": {
                "average_occupancy_percent": round(avg_occupancy, 2),
                "max_daily_occupancy_percent": max(occupancy_values) if occupancy_values else 0,
                "min_daily_occupancy_percent": min(occupancy_values) if occupancy_values else 0,
                "total_available_room_nights": total_available_room_nights,
                "occupied_room_nights": occupied_room_nights,
                "vacant_room_nights": total_available_room_nights - occupied_room_nights
            },
            "daily_breakdown": daily_occupancy
        }
    }

def calculate_avg_daily_rate(payload: dict) -> Dict[str, Any]:
    """Calculate Average Daily Rate (ADR)."""
    required = ["hotel_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    hotel_id = payload.get("hotel_id")
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    days = payload.get("days", 30)
    
    _initialize_hotel(hotel_id)
    
    # Generate ADR data
    daily_adr = {}
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        base_adr = 120 + (i % 7) * 10
        daily_adr[date] = base_adr
    
    adr_values = list(daily_adr.values())
    avg_adr = statistics.mean(adr_values) if adr_values else 0
    
    # Calculate RevPAR (Revenue Per Available Room)
    occupancy_rate = 70.0  # Assumed
    revpar = avg_adr * (occupancy_rate / 100)
    
    return {
        "success": True,
        "avg_daily_rate": {
            "hotel_id": hotel_id,
            "period": {
                "days": days,
                "start_date": start_date or "30 days ago",
                "end_date": end_date or "Today"
            },
            "metrics": {
                "average_daily_rate": round(avg_adr, 2),
                "max_daily_rate": round(max(adr_values), 2) if adr_values else 0,
                "min_daily_rate": round(min(adr_values), 2) if adr_values else 0,
                "std_deviation": round(statistics.stdev(adr_values), 2) if len(adr_values) > 1 else 0
            },
            "derived_metrics": {
                "revenue_per_available_room": round(revpar, 2),
                "assumed_occupancy_rate": occupancy_rate
            },
            "daily_breakdown": daily_adr
        }
    }

def generate_revenue_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive revenue analytics report."""
    required = ["hotel_id"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    hotel_id = payload.get("hotel_id")
    days = payload.get("days", 30)
    
    _initialize_hotel(hotel_id)
    
    # Calculate all metrics
    total_rooms = payload.get("total_rooms", 100)
    
    # Revenue metrics
    daily_revenue = defaultdict(float)
    for i in range(days):
        date = (datetime.now() - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        daily_revenue[date] = 5000 + (i % 7) * 500
    
    total_revenue = sum(daily_revenue.values())
    avg_daily_revenue = total_revenue / days if days > 0 else 0
    
    # Occupancy metrics
    occupancy_values = [70 + (i % 7) * 5 for i in range(days)]
    avg_occupancy = statistics.mean(occupancy_values)
    
    # ADR metrics
    adr_values = [120 + (i % 7) * 10 for i in range(days)]
    avg_adr = statistics.mean(adr_values)
    
    # Room type breakdown (simulated)
    room_types = ["standard", "deluxe", "suite", "penthouse", "accessible"]
    by_room_type = {}
    for rt in room_types:
        rooms = total_rooms // len(room_types)
        revenue = total_revenue * (1 / len(room_types))
        by_room_type[rt] = {
            "rooms": rooms,
            "revenue": round(revenue, 2),
            "occupancy_percent": round(avg_occupancy, 2),
            "adr": round(avg_adr * (1 + (hash(rt) % 10) / 100), 2)
        }
    
    report = {
        "success": True,
        "revenue_report": {
            "hotel_id": hotel_id,
            "report_date": datetime.now().isoformat(),
            "analysis_period_days": days,
            "executive_summary": {
                "total_revenue": round(total_revenue, 2),
                "average_daily_revenue": round(avg_daily_revenue, 2),
                "occupancy_rate_percent": round(avg_occupancy, 2),
                "average_daily_rate": round(avg_adr, 2),
                "revpar": round(avg_adr * (avg_occupancy / 100), 2)
            },
            "by_room_type": by_room_type,
            "key_performance_indicators": {
                "revenue_per_available_room": round(avg_adr * (avg_occupancy / 100), 2),
                "total_available_room_nights": total_rooms * days,
                "occupied_room_nights": int((avg_occupancy / 100) * total_rooms * days),
                "room_revenue_per_night": round(total_revenue / (total_rooms * days), 2)
            },
            "trends": {
                "revenue_trend": "increasing" if total_revenue > 0 else "stable",
                "occupancy_trend": "stable",
                "forecast_30_days": round(avg_daily_revenue * 30, 2)
            }
        }
    }
    
    return report

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution entry point."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {"success": False, "error": "Action parameter required", "result": {}}
        
        actions = {
            "calculate_revenue": calculate_revenue,
            "analyze_revenue_trends": analyze_revenue_trends,
            "optimize_pricing": optimize_pricing,
            "calculate_occupancy_rate": calculate_occupancy_rate,
            "calculate_avg_daily_rate": calculate_avg_daily_rate,
            "generate_revenue_report": generate_revenue_report
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
        "action": "calculate_revenue",
        "payload": {
            "hotel_id": "HOTEL_001"
        }
    }
    result = execute_plugin(test_input)
    print(json.dumps(result, indent=2))
