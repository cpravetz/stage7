#!/usr/bin/env python3
"""
AZURE Plugin - Microsoft Azure Cloud Integration
Provides Azure integration for resources, VMs, consumption, storage, and cost tracking.
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

# Simulated Azure data structures
AZURE_VMS = {
    "vm-001": {
        "vm_id": "vm-001",
        "name": "web-app-vm-01",
        "resource_group": "rg-prod",
        "location": "eastus",
        "vm_size": "Standard_B2s",
        "status": "PowerState/running",
        "cpu_count": 2,
        "memory_gb": 4,
        "disk_size_gb": 128,
        "cpu_utilization": 45.3,
        "memory_utilization": 58.7,
        "disk_utilization": 62.1,
        "creation_time": (datetime.now() - timedelta(days=180)).isoformat(),
        "monthly_cost": 45.50
    },
    "vm-002": {
        "vm_id": "vm-002",
        "name": "api-service-vm-01",
        "resource_group": "rg-prod",
        "location": "eastus",
        "vm_size": "Standard_D2s_v3",
        "status": "PowerState/running",
        "cpu_count": 2,
        "memory_gb": 8,
        "disk_size_gb": 256,
        "cpu_utilization": 72.4,
        "memory_utilization": 78.2,
        "disk_utilization": 45.3,
        "creation_time": (datetime.now() - timedelta(days=90)).isoformat(),
        "monthly_cost": 75.25
    },
    "vm-003": {
        "vm_id": "vm-003",
        "name": "db-server-vm-01",
        "resource_group": "rg-prod",
        "location": "westus",
        "vm_size": "Standard_E4s_v3",
        "status": "PowerState/running",
        "cpu_count": 4,
        "memory_gb": 32,
        "disk_size_gb": 512,
        "cpu_utilization": 38.2,
        "memory_utilization": 55.6,
        "disk_utilization": 72.8,
        "creation_time": (datetime.now() - timedelta(days=365)).isoformat(),
        "monthly_cost": 185.75
    }
}

STORAGE_ACCOUNTS = {
    "storage-001": {
        "storage_id": "storage-001",
        "name": "appdatastg01",
        "resource_group": "rg-prod",
        "location": "eastus",
        "type": "StorageV2",
        "tier": "Hot",
        "size_gb": 256.4,
        "used_gb": 198.2,
        "containers": 12,
        "monthly_cost": 12.34,
        "replication": "GRS"
    },
    "storage-002": {
        "storage_id": "storage-002",
        "name": "archivestorage02",
        "resource_group": "rg-prod",
        "location": "eastus",
        "type": "StorageV2",
        "tier": "Cool",
        "size_gb": 1024.8,
        "used_gb": 892.5,
        "containers": 45,
        "monthly_cost": 18.75,
        "replication": "LRS"
    },
    "storage-003": {
        "storage_id": "storage-003",
        "name": "backupstorage03",
        "resource_group": "rg-prod",
        "location": "westus",
        "type": "StorageV2",
        "tier": "Cool",
        "size_gb": 2048.0,
        "used_gb": 1756.3,
        "containers": 87,
        "monthly_cost": 42.15,
        "replication": "GRS"
    }
}

APP_SERVICES = {
    "appservice-001": {
        "app_service_id": "appservice-001",
        "name": "webapp-prod-01",
        "resource_group": "rg-prod",
        "plan": "Standard",
        "status": "Running",
        "instances": 2,
        "cpu_utilization": 62.3,
        "memory_utilization": 71.2,
        "requests_per_second": 425,
        "error_rate_percent": 0.8,
        "monthly_cost": 65.40
    },
    "appservice-002": {
        "app_service_id": "appservice-002",
        "name": "api-prod-01",
        "resource_group": "rg-prod",
        "plan": "Premium",
        "status": "Running",
        "instances": 3,
        "cpu_utilization": 45.7,
        "memory_utilization": 52.1,
        "requests_per_second": 312,
        "error_rate_percent": 0.3,
        "monthly_cost": 125.80
    }
}

DATABASES = {
    "db-001": {
        "database_id": "db-001",
        "name": "production-sql",
        "server": "dbserver-prod-01",
        "type": "SQL Database",
        "tier": "Standard",
        "storage_gb": 512,
        "compute_units": 50,
        "connection_count": 145,
        "cpu_percent": 34.2,
        "monthly_cost": 89.50
    },
    "db-002": {
        "database_id": "db-002",
        "name": "analytics-db",
        "server": "dbserver-analytics-01",
        "type": "PostgreSQL",
        "tier": "General Purpose",
        "storage_gb": 256,
        "compute_units": 8,
        "connection_count": 52,
        "cpu_percent": 28.5,
        "monthly_cost": 45.30
    }
}

CONSUMPTION_DATA = {
    "current_month": {
        "month": datetime.now().strftime("%Y-%m"),
        "compute": 306.50,
        "storage": 73.24,
        "databases": 134.80,
        "networking": 56.75,
        "other": 28.71,
        "total": 600.00,
        "forecast_end_of_month": 1800.00
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

def _list_resources(payload: dict) -> Dict[str, Any]:
    """List all Azure resources."""
    try:
        resource_type = payload.get("resource_type", "")
        resource_group = payload.get("resource_group", "")
        
        resources = {}
        
        if not resource_type or resource_type == "vm":
            resources["virtual_machines"] = list(AZURE_VMS.values())
        
        if not resource_type or resource_type == "storage":
            resources["storage_accounts"] = list(STORAGE_ACCOUNTS.values())
        
        if not resource_type or resource_type == "app_service":
            resources["app_services"] = list(APP_SERVICES.values())
        
        if not resource_type or resource_type == "database":
            resources["databases"] = list(DATABASES.values())
        
        total_resources = sum(len(v) if isinstance(v, list) else 0 for v in resources.values())
        
        return {
            "success": True,
            "total_resources": total_resources,
            "resources": resources
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_vm_status(payload: dict) -> Dict[str, Any]:
    """Check Azure VM status."""
    try:
        vm_id = payload.get("vm_id", "")
        
        if vm_id:
            if vm_id not in AZURE_VMS:
                return {"success": False, "error": f"VM {vm_id} not found"}
            
            vm = AZURE_VMS[vm_id]
            
            # Calculate health
            if vm["status"] != "PowerState/running":
                health = "stopped"
            elif vm["cpu_utilization"] > 85 or vm["memory_utilization"] > 85:
                health = "critical"
            elif vm["cpu_utilization"] > 70 or vm["memory_utilization"] > 70:
                health = "warning"
            else:
                health = "healthy"
            
            return {
                "success": True,
                "vm": vm,
                "health_status": health,
                "utilization": {
                    "cpu_percent": vm["cpu_utilization"],
                    "memory_percent": vm["memory_utilization"],
                    "disk_percent": vm["disk_utilization"]
                }
            }
        
        # Return all VMs
        vms = list(AZURE_VMS.values())
        running = len([v for v in vms if v["status"] == "PowerState/running"])
        stopped = len([v for v in vms if v["status"] == "PowerState/stopped"])
        total_monthly_cost = sum(v["monthly_cost"] for v in vms)
        
        return {
            "success": True,
            "total_vms": len(vms),
            "running": running,
            "stopped": stopped,
            "total_monthly_cost": round(total_monthly_cost, 2),
            "vms": vms
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_consumption(payload: dict) -> Dict[str, Any]:
    """Analyze Azure resource consumption."""
    try:
        resource_type = payload.get("resource_type", "")
        
        analysis = {
            "success": True,
            "period": "24h",
            "total_resources_analyzed": len(AZURE_VMS) + len(STORAGE_ACCOUNTS) + len(APP_SERVICES),
            "consumption_summary": {
                "compute": {
                    "total_vcpus": sum(v["cpu_count"] for v in AZURE_VMS.values()),
                    "total_memory_gb": sum(v["memory_gb"] for v in AZURE_VMS.values()),
                    "average_cpu_utilization": round(sum(v["cpu_utilization"] for v in AZURE_VMS.values()) / len(AZURE_VMS), 2)
                },
                "storage": {
                    "total_capacity_gb": sum(s["size_gb"] for s in STORAGE_ACCOUNTS.values()),
                    "total_used_gb": sum(s["used_gb"] for s in STORAGE_ACCOUNTS.values()),
                    "utilization_percent": round(sum(s["used_gb"] for s in STORAGE_ACCOUNTS.values()) / sum(s["size_gb"] for s in STORAGE_ACCOUNTS.values()) * 100, 2)
                }
            },
            "peak_usage": {
                "highest_cpu_vm": max(AZURE_VMS.values(), key=lambda x: x["cpu_utilization"]),
                "highest_memory_vm": max(AZURE_VMS.values(), key=lambda x: x["memory_utilization"])
            }
        }
        
        return analysis
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_storage(payload: dict) -> Dict[str, Any]:
    """Check Azure Storage accounts."""
    try:
        storage_id = payload.get("storage_id", "")
        
        if storage_id:
            if storage_id not in STORAGE_ACCOUNTS:
                return {"success": False, "error": f"Storage {storage_id} not found"}
            
            storage = STORAGE_ACCOUNTS[storage_id]
            utilization = (storage["used_gb"] / storage["size_gb"]) * 100
            
            return {
                "success": True,
                "storage": storage,
                "utilization_percent": round(utilization, 2),
                "available_gb": round(storage["size_gb"] - storage["used_gb"], 2)
            }
        
        # Return all storage accounts
        storage = list(STORAGE_ACCOUNTS.values())
        total_capacity = sum(s["size_gb"] for s in storage)
        total_used = sum(s["used_gb"] for s in storage)
        total_monthly_cost = sum(s["monthly_cost"] for s in storage)
        
        return {
            "success": True,
            "total_accounts": len(storage),
            "total_capacity_gb": round(total_capacity, 2),
            "total_used_gb": round(total_used, 2),
            "total_available_gb": round(total_capacity - total_used, 2),
            "total_monthly_cost": round(total_monthly_cost, 2),
            "utilization_percent": round((total_used / total_capacity) * 100, 2),
            "storage_accounts": storage
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_costs(payload: dict) -> Dict[str, Any]:
    """Analyze Azure costs."""
    try:
        period = payload.get("period", "month")
        include_details = payload.get("include_details", True)
        
        consumption = CONSUMPTION_DATA["current_month"]
        
        result = {
            "success": True,
            "period": period,
            "total": consumption["total"],
            "forecast_end_of_month": consumption["forecast_end_of_month"]
        }
        
        if include_details:
            result["cost_breakdown"] = {
                "compute": consumption["compute"],
                "storage": consumption["storage"],
                "databases": consumption["databases"],
                "networking": consumption["networking"],
                "other": consumption["other"]
            }
            result["optimization_recommendations"] = [
                "Use Azure Reserved Instances for 1-year (35% savings) or 3-year (60% savings)",
                "Enable auto-shutdown for non-production resources",
                "Use Spot VMs for batch workloads (up to 90% discount)",
                "Optimize database tier selection",
                "Review networking bandwidth costs"
            ]
        
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_health_status(payload: dict) -> Dict[str, Any]:
    """Get overall Azure subscription health status."""
    try:
        vms = list(AZURE_VMS.values())
        storage = list(STORAGE_ACCOUNTS.values())
        app_services = list(APP_SERVICES.values())
        
        running_vms = len([v for v in vms if v["status"] == "PowerState/running"])
        healthy_vms = len([v for v in vms if v["status"] == "PowerState/running" and v["cpu_utilization"] < 80])
        
        healthy_storage = len([s for s in storage if (s["used_gb"] / s["size_gb"]) < 0.90])
        running_app_services = len([a for a in app_services if a["status"] == "Running"])
        
        overall_health_score = (
            (healthy_vms / running_vms * 40) if running_vms > 0 else 0 +
            (healthy_storage / len(storage) * 30) +
            (running_app_services / len(app_services) * 30)
        )
        
        overall_status = "healthy" if overall_health_score > 80 else "warning" if overall_health_score > 60 else "critical"
        
        return {
            "success": True,
            "overall_health": overall_status,
            "health_score": round(overall_health_score, 1),
            "resource_health": {
                "vms": {
                    "total": len(vms),
                    "running": running_vms,
                    "healthy": healthy_vms
                },
                "storage": {
                    "total": len(storage),
                    "healthy": healthy_storage
                },
                "app_services": {
                    "total": len(app_services),
                    "running": running_app_services
                }
            },
            "alerts": _generate_health_alerts(vms, storage)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _generate_health_alerts(vms: List[Dict], storage: List[Dict]) -> List[str]:
    """Generate health alerts based on current state."""
    alerts = []
    
    for vm in vms:
        if vm["cpu_utilization"] > 80:
            alerts.append(f"High CPU on {vm['name']}: {vm['cpu_utilization']}%")
        if vm["memory_utilization"] > 80:
            alerts.append(f"High memory on {vm['name']}: {vm['memory_utilization']}%")
    
    for s in storage:
        utilization = (s["used_gb"] / s["size_gb"]) * 100
        if utilization > 90:
            alerts.append(f"Storage near capacity: {s['name']} at {utilization:.1f}%")
    
    return alerts

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
                    "list_resources",
                    "check_vm_status",
                    "analyze_consumption",
                    "check_storage",
                    "analyze_costs",
                    "get_health_status"
                ]
            }
        
        if action == "list_resources":
            return _list_resources(payload)
        elif action == "check_vm_status":
            return _check_vm_status(payload)
        elif action == "analyze_consumption":
            return _analyze_consumption(payload)
        elif action == "check_storage":
            return _check_storage(payload)
        elif action == "analyze_costs":
            return _analyze_costs(payload)
        elif action == "get_health_status":
            return _get_health_status(payload)
        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": [
                    "list_resources",
                    "check_vm_status",
                    "analyze_consumption",
                    "check_storage",
                    "analyze_costs",
                    "get_health_status"
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
