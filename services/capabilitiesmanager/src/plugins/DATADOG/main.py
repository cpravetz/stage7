#!/usr/bin/env python3
"""
DATADOG Plugin - Cloud Monitoring Integration
Provides Datadog monitoring integration with metrics, alerts, logs, and host status tracking.
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

# Simulated Datadog data structures
HOSTS = {
    "host-001": {
        "id": "host-001",
        "hostname": "web-server-01",
        "ip": "10.0.1.100",
        "status": "up",
        "cpu_usage": 45.2,
        "memory_usage": 62.5,
        "disk_usage": 78.3,
        "last_reported": datetime.now().isoformat()
    },
    "host-002": {
        "id": "host-002",
        "hostname": "db-server-01",
        "ip": "10.0.1.101",
        "status": "up",
        "cpu_usage": 72.1,
        "memory_usage": 85.3,
        "disk_usage": 55.8,
        "last_reported": datetime.now().isoformat()
    },
    "host-003": {
        "id": "host-003",
        "hostname": "cache-server-01",
        "ip": "10.0.1.102",
        "status": "up",
        "cpu_usage": 28.5,
        "memory_usage": 41.2,
        "disk_usage": 32.1,
        "last_reported": datetime.now().isoformat()
    }
}

MONITORS = {
    "monitor-001": {
        "id": "monitor-001",
        "name": "High CPU Usage Alert",
        "type": "metric alert",
        "query": "avg:system.cpu{*}",
        "threshold": 80,
        "status": "ok",
        "created_at": datetime.now().isoformat()
    },
    "monitor-002": {
        "id": "monitor-002",
        "name": "Memory Usage Critical",
        "type": "metric alert",
        "query": "avg:system.memory{*}",
        "threshold": 90,
        "status": "alert",
        "created_at": datetime.now().isoformat()
    },
    "monitor-003": {
        "id": "monitor-003",
        "name": "Service Availability",
        "type": "service check",
        "query": "http.can_connect",
        "threshold": 1,
        "status": "ok",
        "created_at": datetime.now().isoformat()
    }
}

ALERTS = {
    "alert-001": {
        "id": "alert-001",
        "monitor_id": "monitor-001",
        "title": "High CPU Usage Detected",
        "severity": "warning",
        "status": "triggered",
        "triggered_at": (datetime.now() - timedelta(hours=2)).isoformat(),
        "value": 85.3
    },
    "alert-002": {
        "id": "alert-002",
        "monitor_id": "monitor-002",
        "title": "Memory Critical",
        "severity": "critical",
        "status": "triggered",
        "triggered_at": (datetime.now() - timedelta(minutes=15)).isoformat(),
        "value": 92.1
    }
}

LOGS = [
    {
        "timestamp": (datetime.now() - timedelta(minutes=5)).isoformat(),
        "host": "web-server-01",
        "level": "INFO",
        "message": "Request processed successfully",
        "duration_ms": 145
    },
    {
        "timestamp": (datetime.now() - timedelta(minutes=3)).isoformat(),
        "host": "db-server-01",
        "level": "WARNING",
        "message": "Query execution time exceeded threshold",
        "duration_ms": 5234
    },
    {
        "timestamp": (datetime.now() - timedelta(minutes=1)).isoformat(),
        "host": "cache-server-01",
        "level": "INFO",
        "message": "Cache hit rate: 94.2%",
        "duration_ms": 2
    }
]

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases."""
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

def _validate_number(value) -> bool:
    """Validate numeric parameter."""
    try:
        float(value)
        return True
    except (ValueError, TypeError):
        return False

def _get_metrics(payload: dict) -> Dict[str, Any]:
    """Retrieve metrics for specified host or service."""
    try:
        host_id = payload.get("host_id", "")
        metric_type = payload.get("metric_type", "cpu")
        timeframe = payload.get("timeframe", "1h")
        
        if not _validate_string(host_id):
            return {"success": False, "error": "host_id is required"}
        
        if host_id not in HOSTS:
            return {"success": False, "error": f"Host {host_id} not found"}
        
        host = HOSTS[host_id]
        
        # Generate realistic metric data
        metrics_data = []
        now = datetime.now()
        
        if metric_type == "cpu":
            base_value = host["cpu_usage"]
        elif metric_type == "memory":
            base_value = host["memory_usage"]
        elif metric_type == "disk":
            base_value = host["disk_usage"]
        else:
            return {"success": False, "error": f"Unknown metric_type: {metric_type}"}
        
        # Generate time series data
        for i in range(12):
            timestamp = (now - timedelta(minutes=5*i)).isoformat()
            value = base_value + random.uniform(-5, 5)
            value = max(0, min(100, value))
            metrics_data.append({
                "timestamp": timestamp,
                "value": round(value, 2),
                "unit": "percent"
            })
        
        return {
            "success": True,
            "host_id": host_id,
            "hostname": host["hostname"],
            "metric_type": metric_type,
            "timeframe": timeframe,
            "data": metrics_data,
            "aggregated_stats": {
                "avg": round(sum(p["value"] for p in metrics_data) / len(metrics_data), 2),
                "min": round(min(p["value"] for p in metrics_data), 2),
                "max": round(max(p["value"] for p in metrics_data), 2)
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_alerts(payload: dict) -> Dict[str, Any]:
    """Check current alerts and their status."""
    try:
        status_filter = payload.get("status", "")
        severity_filter = payload.get("severity", "")
        
        alerts = list(ALERTS.values())
        
        if status_filter:
            alerts = [a for a in alerts if a["status"] == status_filter]
        
        if severity_filter:
            alerts = [a for a in alerts if a["severity"] == severity_filter]
        
        total_alerts = len(alerts)
        critical_count = len([a for a in ALERTS.values() if a["severity"] == "critical"])
        warning_count = len([a for a in ALERTS.values() if a["severity"] == "warning"])
        
        return {
            "success": True,
            "total_alerts": total_alerts,
            "critical": critical_count,
            "warning": warning_count,
            "alerts": alerts,
            "summary": f"{critical_count} critical, {warning_count} warning"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_logs(payload: dict) -> Dict[str, Any]:
    """Retrieve logs filtered by host and level."""
    try:
        host = payload.get("host", "")
        level = payload.get("level", "")
        limit = payload.get("limit", 10)
        
        if not isinstance(limit, int) or limit < 1:
            limit = 10
        
        logs = LOGS[:]
        
        if host:
            logs = [l for l in logs if l["host"] == host]
        
        if level:
            logs = [l for l in logs if l["level"] == level]
        
        logs = logs[:limit]
        
        return {
            "success": True,
            "host_filter": host if host else "all",
            "level_filter": level if level else "all",
            "count": len(logs),
            "logs": logs
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _create_monitor(payload: dict) -> Dict[str, Any]:
    """Create a new monitoring alert."""
    try:
        name = payload.get("name", "")
        monitor_type = payload.get("type", "metric alert")
        query = payload.get("query", "")
        threshold = payload.get("threshold", 0)
        
        if not _validate_string(name, 3):
            return {"success": False, "error": "Monitor name must be at least 3 characters"}
        
        if not _validate_string(query, 3):
            return {"success": False, "error": "Query is required"}
        
        if not _validate_number(threshold):
            return {"success": False, "error": "Threshold must be numeric"}
        
        monitor_id = f"monitor-{uuid.uuid4().hex[:8]}"
        
        monitor = {
            "id": monitor_id,
            "name": name,
            "type": monitor_type,
            "query": query,
            "threshold": float(threshold),
            "status": "ok",
            "created_at": datetime.now().isoformat()
        }
        
        MONITORS[monitor_id] = monitor
        
        return {
            "success": True,
            "monitor_id": monitor_id,
            "name": name,
            "message": "Monitor created successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _list_monitors(payload: dict) -> Dict[str, Any]:
    """List all configured monitors."""
    try:
        status_filter = payload.get("status", "")
        
        monitors = list(MONITORS.values())
        
        if status_filter:
            monitors = [m for m in monitors if m["status"] == status_filter]
        
        return {
            "success": True,
            "total_monitors": len(monitors),
            "monitors": monitors
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_host_status(payload: dict) -> Dict[str, Any]:
    """Get status of all hosts or specific host."""
    try:
        host_id = payload.get("host_id", "")
        
        if host_id:
            if host_id not in HOSTS:
                return {"success": False, "error": f"Host {host_id} not found"}
            
            host = HOSTS[host_id]
            return {
                "success": True,
                "host": host,
                "health_status": _calculate_health(host)
            }
        
        # Return all hosts
        hosts_list = list(HOSTS.values())
        up_count = len([h for h in hosts_list if h["status"] == "up"])
        
        return {
            "success": True,
            "total_hosts": len(hosts_list),
            "up": up_count,
            "down": len(hosts_list) - up_count,
            "hosts": hosts_list,
            "health_summary": f"{up_count}/{len(hosts_list)} hosts healthy"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _calculate_health(host: dict) -> str:
    """Calculate overall health status based on metrics."""
    cpu = host.get("cpu_usage", 0)
    memory = host.get("memory_usage", 0)
    disk = host.get("disk_usage", 0)
    
    avg_usage = (cpu + memory + disk) / 3
    
    if avg_usage < 60:
        return "healthy"
    elif avg_usage < 80:
        return "warning"
    else:
        return "critical"

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
                    "get_metrics",
                    "check_alerts",
                    "get_logs",
                    "create_monitor",
                    "list_monitors",
                    "get_host_status"
                ]
            }
        
        if action == "get_metrics":
            return _get_metrics(payload)
        elif action == "check_alerts":
            return _check_alerts(payload)
        elif action == "get_logs":
            return _get_logs(payload)
        elif action == "create_monitor":
            return _create_monitor(payload)
        elif action == "list_monitors":
            return _list_monitors(payload)
        elif action == "get_host_status":
            return _get_host_status(payload)
        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": [
                    "get_metrics",
                    "check_alerts",
                    "get_logs",
                    "create_monitor",
                    "list_monitors",
                    "get_host_status"
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
