#!/usr/bin/env python3
"""
DEMAND_FORECAST Plugin - Restaurant demand forecasting
Analyzes historical data, predicts demand, detects trends, and provides staffing recommendations.
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

class DayOfWeek(Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"

class TrendDirection(Enum):
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"

class Season(Enum):
    SPRING = "spring"
    SUMMER = "summer"
    FALL = "fall"
    WINTER = "winter"

# In-Memory Data Storage
_historical_data = {}
_demand_forecasts = {}
_trend_analysis = {}
_peak_hour_analysis = {}
_seasonality_patterns = {}
_staffing_recommendations = {}
_forecast_accuracy = {}

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
    """Initialize restaurant forecasting structures."""
    if restaurant_id not in _historical_data:
        _historical_data[restaurant_id] = _generate_historical_data()
        _demand_forecasts[restaurant_id] = {}
        _trend_analysis[restaurant_id] = {}
        _peak_hour_analysis[restaurant_id] = {}
        _seasonality_patterns[restaurant_id] = _initialize_seasonality()
        _staffing_recommendations[restaurant_id] = []
        _forecast_accuracy[restaurant_id] = []

def _generate_historical_data() -> Dict[str, Any]:
    """Generate sample historical transaction data."""
    data = {}
    
    # Generate 30 days of historical data
    for day_offset in range(30, 0, -1):
        date = (datetime.now() - timedelta(days=day_offset)).date()
        date_str = date.isoformat()
        
        day_of_week = date.weekday()
        is_weekend = day_of_week in [4, 5, 6]  # Fri, Sat, Sun
        
        # Base demand varies by day of week
        base_demand = 120 if is_weekend else 80
        variation = (hash(date_str) % 30) - 15  # ±15%
        daily_covers = max(50, base_demand + variation)
        
        data[date_str] = {
            "date": date_str,
            "day_of_week": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day_of_week],
            "covers": int(daily_covers),
            "revenue": daily_covers * 35,  # Average spend per cover
            "peak_hour": 19 if is_weekend else 18,
            "peak_hour_covers": int(daily_covers * 0.35),
            "lunch_covers": int(daily_covers * 0.30),
            "dinner_covers": int(daily_covers * 0.70),
            "server_count": 6 if is_weekend else 5,
            "avg_check": 35.00,
            "notes": "Weekend" if is_weekend else "Weekday"
        }
    
    return data

def _initialize_seasonality() -> Dict[str, Any]:
    """Initialize seasonality patterns."""
    return {
        "spring": {"multiplier": 1.0, "trend": "stable"},
        "summer": {"multiplier": 1.3, "trend": "increasing"},
        "fall": {"multiplier": 1.1, "trend": "stable"},
        "winter": {"multiplier": 0.9, "trend": "decreasing"}
    }

def forecast_demand(payload: dict) -> Dict[str, Any]:
    """Forecast demand for future dates."""
    required = ["forecast_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    forecast_date = payload.get("forecast_date")
    forecast_days = payload.get("forecast_days", 7)
    
    _initialize_restaurant(restaurant_id)
    
    # Parse forecast date
    try:
        start_date = datetime.fromisoformat(forecast_date).date()
    except ValueError:
        return {"success": False, "error": "Invalid date format (use YYYY-MM-DD)"}
    
    historical = _historical_data[restaurant_id]
    forecasts = []
    
    for day_offset in range(forecast_days):
        current_date = start_date + timedelta(days=day_offset)
        date_str = current_date.isoformat()
        day_of_week = current_date.weekday()
        day_name = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day_of_week]
        
        # Calculate average for this day of week from historical data
        same_day_records = [
            h for h in historical.values()
            if datetime.fromisoformat(h["date"]).weekday() == day_of_week
        ]
        
        if same_day_records:
            avg_covers = sum(h["covers"] for h in same_day_records) / len(same_day_records)
            avg_revenue = sum(h["revenue"] for h in same_day_records) / len(same_day_records)
            avg_peak_hour = sum(h["peak_hour_covers"] for h in same_day_records) / len(same_day_records)
        else:
            avg_covers = 85
            avg_revenue = 2975
            avg_peak_hour = 30
        
        forecast_entry = {
            "forecast_id": f"FCST_{restaurant_id}_{date_str}_{uuid.uuid4().hex[:6].upper()}",
            "date": date_str,
            "day_of_week": day_name,
            "forecasted_covers": int(avg_covers),
            "confidence": 0.85,
            "forecasted_revenue": round(avg_revenue, 2),
            "peak_hour_covers": int(avg_peak_hour),
            "expected_peak_hour": 19 if day_of_week in [4, 5, 6] else 18,
            "created_at": datetime.now().isoformat()
        }
        
        forecasts.append(forecast_entry)
        
        # Store forecast
        if date_str not in _demand_forecasts[restaurant_id]:
            _demand_forecasts[restaurant_id][date_str] = []
        _demand_forecasts[restaurant_id][date_str].append(forecast_entry)
    
    return {
        "success": True,
        "forecast_period": f"{forecast_date} to {(start_date + timedelta(days=forecast_days-1)).isoformat()}",
        "forecast_days": forecast_days,
        "forecasts": forecasts,
        "summary": {
            "total_forecasted_covers": sum(f["forecasted_covers"] for f in forecasts),
            "avg_daily_covers": round(sum(f["forecasted_covers"] for f in forecasts) / forecast_days, 1),
            "total_forecasted_revenue": round(sum(f["forecasted_revenue"] for f in forecasts), 2)
        }
    }

def analyze_trends(payload: dict) -> Dict[str, Any]:
    """Analyze trends in historical data."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    days_lookback = payload.get("days_lookback", 30)
    
    _initialize_restaurant(restaurant_id)
    
    historical = _historical_data[restaurant_id]
    
    # Sort by date
    sorted_data = sorted(historical.values(), key=lambda x: x["date"])
    
    if len(sorted_data) < 2:
        return {"success": False, "error": "Insufficient historical data"}
    
    # Extract covers over time
    covers_trend = [h["covers"] for h in sorted_data[-days_lookback:]]
    revenue_trend = [h["revenue"] for h in sorted_data[-days_lookback:]]
    
    # Calculate trend direction
    if len(covers_trend) >= 2:
        recent_avg = sum(covers_trend[-7:]) / 7 if len(covers_trend) >= 7 else sum(covers_trend) / len(covers_trend)
        previous_avg = sum(covers_trend[:7]) / 7 if len(covers_trend) >= 14 else sum(covers_trend[:7]) / 7
        
        if recent_avg > previous_avg * 1.05:
            trend_direction = TrendDirection.INCREASING.value
            trend_strength = round((recent_avg - previous_avg) / previous_avg * 100, 1)
        elif recent_avg < previous_avg * 0.95:
            trend_direction = TrendDirection.DECREASING.value
            trend_strength = round((previous_avg - recent_avg) / previous_avg * 100, 1)
        else:
            trend_direction = TrendDirection.STABLE.value
            trend_strength = 0.0
    
    # Calculate statistics
    avg_covers = sum(covers_trend) / len(covers_trend)
    max_covers = max(covers_trend)
    min_covers = min(covers_trend)
    avg_revenue = sum(revenue_trend) / len(revenue_trend)
    
    analysis = {
        "period_days": days_lookback,
        "covers_trend": {
            "direction": trend_direction,
            "strength_percent": trend_strength,
            "average": round(avg_covers, 1),
            "maximum": max_covers,
            "minimum": min_covers,
            "variance": round(max(covers_trend) - min(covers_trend), 1)
        },
        "revenue_trend": {
            "average": round(avg_revenue, 2),
            "total": round(sum(revenue_trend), 2),
            "trend_direction": trend_direction
        }
    }
    
    _trend_analysis[restaurant_id] = analysis
    
    return {
        "success": True,
        "analysis": analysis
    }

def predict_peak_hours(payload: dict) -> Dict[str, Any]:
    """Predict peak hours for a given date."""
    required = ["prediction_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    prediction_date = payload.get("prediction_date")
    
    _initialize_restaurant(restaurant_id)
    
    # Parse date
    try:
        pred_date = datetime.fromisoformat(prediction_date).date()
        day_of_week = pred_date.weekday()
    except ValueError:
        return {"success": False, "error": "Invalid date format"}
    
    historical = _historical_data[restaurant_id]
    
    # Find similar days
    similar_days = [
        h for h in historical.values()
        if datetime.fromisoformat(h["date"]).weekday() == day_of_week
    ]
    
    if not similar_days:
        similar_days = list(historical.values())[-7:]
    
    # Calculate peak hour statistics
    peak_hours_data = {}
    for record in similar_days:
        peak_hour = record.get("peak_hour", 19)
        if peak_hour not in peak_hours_data:
            peak_hours_data[peak_hour] = []
        peak_hours_data[peak_hour].append(record.get("peak_hour_covers", 0))
    
    # Find most likely peak hour
    peak_hour_counts = {h: sum(c for c in covers) / len(covers) for h, covers in peak_hours_data.items()}
    most_likely_peak = max(peak_hour_counts, key=peak_hour_counts.get) if peak_hour_counts else 19
    
    # Build hourly predictions
    hourly_forecast = []
    for hour in range(11, 23):  # 11 AM to 10 PM
        if hour == most_likely_peak:
            expected_covers = int(sum(s.get("peak_hour_covers", 0) for s in similar_days) / len(similar_days))
        elif abs(hour - most_likely_peak) <= 1:
            expected_covers = int(expected_covers * 0.8) if 'expected_covers' in locals() else 20
        else:
            expected_covers = max(5, int(expected_covers * 0.4)) if 'expected_covers' in locals() else 10
        
        hourly_forecast.append({
            "hour": hour,
            "time": f"{hour:02d}:00",
            "expected_covers": expected_covers,
            "peak": hour == most_likely_peak
        })
    
    # Store peak hour analysis
    _peak_hour_analysis[restaurant_id][prediction_date] = {
        "date": prediction_date,
        "peak_hour": most_likely_peak,
        "predicted_peak_covers": peak_hour_counts.get(most_likely_peak, 0),
        "hourly_forecast": hourly_forecast
    }
    
    return {
        "success": True,
        "prediction_date": prediction_date,
        "peak_hour": most_likely_peak,
        "peak_hour_time": f"{most_likely_peak:02d}:00",
        "predicted_peak_covers": int(peak_hour_counts.get(most_likely_peak, 0)),
        "hourly_forecast": hourly_forecast,
        "confidence": 0.80
    }

def recommend_staffing(payload: dict) -> Dict[str, Any]:
    """Recommend staffing levels based on demand forecast."""
    required = ["forecast_date"]
    is_valid, error = _validate_params(payload, required)
    if not is_valid:
        return {"success": False, "error": error}
    
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    forecast_date = payload.get("forecast_date")
    
    _initialize_restaurant(restaurant_id)
    
    # Get forecast for this date
    date_str = forecast_date
    if date_str in _demand_forecasts[restaurant_id] and len(_demand_forecasts[restaurant_id][date_str]) > 0:
        forecast = _demand_forecasts[restaurant_id][date_str][0]
        forecasted_covers = forecast["forecasted_covers"]
    else:
        forecasted_covers = 85  # Default
    
    # Calculate staffing needs (ratio: 1 server per 15 covers)
    server_count = max(3, int(forecasted_covers / 15))
    host_count = max(1, int(server_count / 3))
    cook_count = max(2, int(forecasted_covers / 40))
    busser_count = max(1, int(server_count / 2))
    
    # Parse date for day of week
    try:
        d = datetime.fromisoformat(forecast_date).date()
        is_weekend = d.weekday() in [4, 5, 6]
    except:
        is_weekend = False
    
    if is_weekend:
        server_count = int(server_count * 1.2)
    
    recommendation = {
        "recommendation_id": f"REC_{restaurant_id}_{forecast_date}_{uuid.uuid4().hex[:6].upper()}",
        "forecast_date": forecast_date,
        "forecasted_covers": forecasted_covers,
        "staffing_requirements": {
            "servers": server_count,
            "hosts": host_count,
            "cooks": cook_count,
            "bussers": busser_count,
            "total_staff": server_count + host_count + cook_count + busser_count
        },
        "labor_cost_estimate": (server_count * 16 * 8) + (host_count * 14 * 8) + (cook_count * 18 * 8) + (busser_count * 13 * 8),
        "notes": "Weekend increase recommended" if is_weekend else "Regular staffing",
        "created_at": datetime.now().isoformat()
    }
    
    _staffing_recommendations[restaurant_id].append(recommendation)
    
    return {
        "success": True,
        "recommendation_id": recommendation["recommendation_id"],
        "forecast_date": forecast_date,
        "forecasted_covers": forecasted_covers,
        "recommended_staff": recommendation["staffing_requirements"],
        "estimated_labor_cost": recommendation["labor_cost_estimate"],
        "notes": recommendation["notes"]
    }

def analyze_seasonality(payload: dict) -> Dict[str, Any]:
    """Analyze seasonality patterns."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    current_month = payload.get("current_month", datetime.now().month)
    
    _initialize_restaurant(restaurant_id)
    
    # Map month to season
    def get_season(month):
        if month in [3, 4, 5]:
            return Season.SPRING.value
        elif month in [6, 7, 8]:
            return Season.SUMMER.value
        elif month in [9, 10, 11]:
            return Season.FALL.value
        else:
            return Season.WINTER.value
    
    current_season = get_season(current_month)
    seasonality = _seasonality_patterns[restaurant_id]
    
    season_info = seasonality.get(current_season, {})
    
    # Seasonal forecast adjustments
    historical = _historical_data[restaurant_id]
    avg_covers = sum(h["covers"] for h in historical.values()) / len(historical)
    
    adjusted_covers = avg_covers * season_info.get("multiplier", 1.0)
    
    return {
        "success": True,
        "current_month": current_month,
        "current_season": current_season,
        "seasonality_multiplier": season_info.get("multiplier", 1.0),
        "trend": season_info.get("trend", "stable"),
        "baseline_daily_covers": round(avg_covers, 1),
        "seasonal_adjusted_covers": round(adjusted_covers, 1),
        "seasonal_insights": {
            "spring": "Moderate increase, post-winter recovery",
            "summer": "Peak season, 30% increase expected",
            "fall": "Stable with slight increase",
            "winter": "Slower period, 10% decrease expected"
        }
    }

def generate_forecast_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive forecast report."""
    restaurant_id = payload.get("restaurant_id", "REST_DEFAULT")
    report_period = payload.get("report_period", "30_days")
    
    _initialize_restaurant(restaurant_id)
    
    # Compile all analyses
    trends = _trend_analysis.get(restaurant_id, {})
    recommendations = _staffing_recommendations[restaurant_id][-10:]
    
    return {
        "success": True,
        "report_timestamp": datetime.now().isoformat(),
        "report_period": report_period,
        "trend_analysis": trends,
        "recent_recommendations": len(recommendations),
        "recommendations_sample": recommendations,
        "forecast_summary": {
            "total_forecasts": sum(len(v) for v in _demand_forecasts[restaurant_id].values()),
            "peak_hour_analyses": len(_peak_hour_analysis[restaurant_id]),
            "staffing_recommendations": len(_staffing_recommendations[restaurant_id])
        },
        "key_insights": [
            f"Trend direction: {trends.get('covers_trend', {}).get('direction', 'unknown')}",
            f"Average daily covers: {trends.get('covers_trend', {}).get('average', 'N/A')}",
            "Peak season (summer) expects 30% higher demand",
            "Weekends average 40% higher covers than weekdays"
        ]
    }

def execute_plugin(action: str, payload: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action_lower = action.lower()
        
        if action_lower == "forecast_demand":
            return forecast_demand(payload)
        elif action_lower == "analyze_trends":
            return analyze_trends(payload)
        elif action_lower == "predict_peak_hours":
            return predict_peak_hours(payload)
        elif action_lower == "recommend_staffing":
            return recommend_staffing(payload)
        elif action_lower == "analyze_seasonality":
            return analyze_seasonality(payload)
        elif action_lower == "generate_forecast_report":
            return generate_forecast_report(payload)
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
