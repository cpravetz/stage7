#!/usr/bin/env python3
"""
GCP Plugin - Google Cloud Platform Integration
Provides GCP integration for resources, VMs, compute, storage, and cost analysis.
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

# Simulated GCP data structures
GCP_RESOURCES = {
    "resource-001": {
        "resource_id": "resource-001",
        "type": "compute_instance",
        "name": "web-server-01",
        "zone": "us-central1-a",
        "status": "RUNNING",
        "machine_type": "n1-standard-2",
        "cpu_count": 2,
        "memory_gb": 7.5,
        "creation_time": (datetime.now() - timedelta(days=120)).isoformat()
    },
    "resource-002": {
        "resource_id": "resource-002",
        "type": "compute_instance",
        "name": "api-server-01",
        "zone": "us-central1-b",
        "status": "RUNNING",
        "machine_type": "n1-highmem-4",
        "cpu_count": 4,
        "memory_gb": 26,
        "creation_time": (datetime.now() - timedelta(days=60)).isoformat()
    },
    "resource-003": {
        "resource_id": "resource-003",
        "type": "storage_bucket",
        "name": "gcp-data-warehouse",
        "region": "us-central1",
        "status": "ACTIVE",
        "size_gb": 2048,
        "object_count": 125000,
        "creation_time": (datetime.now() - timedelta(days=300)).isoformat()
    }
}

COMPUTE_INSTANCES = {
    "vm-001": {
        "vm_id": "vm-001",
        "name": "api-service-01",
        "zone": "us-central1-a",
        "status": "RUNNING",
        "machine_type": "n1-standard-4",
        "cpu_utilization": 54.2,
        "memory_utilization": 62.8,
        "uptime_hours": 2160,
        "monthly_cost": 92.50,
        "last_metrics_update": datetime.now().isoformat()
    },
    "vm-002": {
        "vm_id": "vm-002",
        "name": "batch-processor-01",
        "zone": "us-central1-b",
        "status": "RUNNING",
        "machine_type": "n1-highmem-8",
        "cpu_utilization": 78.5,
        "memory_utilization": 85.3,
        "uptime_hours": 1440,
        "monthly_cost": 245.75,
        "last_metrics_update": datetime.now().isoformat()
    },
    "vm-003": {
        "vm_id": "vm-003",
        "name": "dev-server-01",
        "zone": "us-central1-c",
        "status": "TERMINATED",
        "machine_type": "n1-standard-1",
        "cpu_utilization": 0,
        "memory_utilization": 0,
        "uptime_hours": 0,
        "monthly_cost": 0,
        "last_metrics_update": datetime.now().isoformat()
    }
}

STORAGE_INSTANCES = {
    "storage-001": {
        "storage_id": "storage-001",
        "name": "app-backups",
        "region": "us-central1",
        "storage_class": "STANDARD",
        "size_gb": 512.4,
        "object_count": 52000,
        "monthly_cost": 24.15,
        "access_logs_enabled": True
    },
    "storage-002": {
        "storage_id": "storage-002",
        "name": "archive-storage",
        "region": "us-central1",
        "storage_class": "NEARLINE",
        "size_gb": 2048.8,
        "object_count": 180000,
        "monthly_cost": 45.30,
        "access_logs_enabled": False
    },
    "storage-003": {
        "storage_id": "storage-003",
        "name": "coldline-archive",
        "region": "us-central1",
        "storage_class": "COLDLINE",
        "size_gb": 5120.2,
        "object_count": 450000,
        "monthly_cost": 35.80,
        "access_logs_enabled": False
    }
}

BILLING_DATA = {
    "current_month": {
        "month": datetime.now().strftime("%Y-%m"),
        "compute": 338.25,
        "storage": 105.25,
        "networking": 45.50,
        "bigquery": 128.90,
        "other": 32.10,
        "total": 650.00,
        "forecast_end_of_month": 1950.00
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
    """List all GCP resources in the project."""
    try:
        resource_type = payload.get("resource_type", "")
        
        resources = list(GCP_RESOURCES.values())
        
        if resource_type:
            resources = [r for r in resources if r["type"] == resource_type]
        
        by_type = {}
        for resource in GCP_RESOURCES.values():
            rtype = resource["type"]
            by_type[rtype] = by_type.get(rtype, 0) + 1
        
        return {
            "success": True,
            "total_resources": len(GCP_RESOURCES),
            "resources_by_type": by_type,
            "resources": resources
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_vm_status(payload: dict) -> Dict[str, Any]:
    """Check status of compute instances."""
    try:
        vm_id = payload.get("vm_id", "")
        
        if vm_id:
            if vm_id not in COMPUTE_INSTANCES:
                return {"success": False, "error": f"VM {vm_id} not found"}
            
            vm = COMPUTE_INSTANCES[vm_id]
            
            # Calculate health status
            if vm["status"] == "TERMINATED":
                health = "terminated"
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
                    "memory_percent": vm["memory_utilization"]
                }
            }
        
        # Return all VMs
        vms = list(COMPUTE_INSTANCES.values())
        running = len([v for v in vms if v["status"] == "RUNNING"])
        stopped = len([v for v in vms if v["status"] == "STOPPED"])
        terminated = len([v for v in vms if v["status"] == "TERMINATED"])
        total_monthly_cost = sum(v["monthly_cost"] for v in vms)
        
        return {
            "success": True,
            "total_vms": len(vms),
            "running": running,
            "stopped": stopped,
            "terminated": terminated,
            "total_monthly_cost": round(total_monthly_cost, 2),
            "vms": vms
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_compute_usage(payload: dict) -> Dict[str, Any]:
    """Analyze compute resource usage patterns."""
    try:
        time_period = payload.get("period", "24h")
        
        vms = list(COMPUTE_INSTANCES.values())
        
        avg_cpu = sum(v["cpu_utilization"] for v in vms if v["status"] == "RUNNING") / max(len([v for v in vms if v["status"] == "RUNNING"]), 1)
        avg_memory = sum(v["memory_utilization"] for v in vms if v["status"] == "RUNNING") / max(len([v for v in vms if v["status"] == "RUNNING"]), 1)
        
        peak_cpu = max((v["cpu_utilization"] for v in vms if v["status"] == "RUNNING"), default=0)
        peak_memory = max((v["memory_utilization"] for v in vms if v["status"] == "RUNNING"), default=0)
        
        return {
            "success": True,
            "period": time_period,
            "average_metrics": {
                "cpu_utilization": round(avg_cpu, 2),
                "memory_utilization": round(avg_memory, 2)
            },
            "peak_metrics": {
                "cpu_utilization": round(peak_cpu, 2),
                "memory_utilization": round(peak_memory, 2)
            },
            "vms_analyzed": len([v for v in vms if v["status"] == "RUNNING"]),
            "recommendations": [
                "Consider downsizing underutilized instances",
                "Implement auto-scaling for variable workloads",
                "Use committed use discounts for consistent workloads",
                "Review and optimize resource allocation"
            ]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_storage(payload: dict) -> Dict[str, Any]:
    """Check Cloud Storage usage and stats."""
    try:
        storage_id = payload.get("storage_id", "")
        
        if storage_id:
            if storage_id not in STORAGE_INSTANCES:
                return {"success": False, "error": f"Storage {storage_id} not found"}
            
            storage = STORAGE_INSTANCES[storage_id]
            
            return {
                "success": True,
                "storage": storage,
                "growth_estimate_gb_per_month": round(random.uniform(50, 200), 2)
            }
        
        # Return all storage instances
        storage = list(STORAGE_INSTANCES.values())
        total_size_gb = sum(s["size_gb"] for s in storage)
        total_objects = sum(s["object_count"] for s in storage)
        total_monthly_cost = sum(s["monthly_cost"] for s in storage)
        
        return {
            "success": True,
            "total_buckets": len(storage),
            "total_size_gb": round(total_size_gb, 2),
            "total_objects": total_objects,
            "total_monthly_cost": round(total_monthly_cost, 2),
            "storage_instances": storage
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_costs(payload: dict) -> Dict[str, Any]:
    """Analyze GCP costs."""
    try:
        period = payload.get("period", "month")
        include_forecast = payload.get("include_forecast", True)
        
        billing = BILLING_DATA["current_month"]
        
        result = {
            "success": True,
            "period": period,
            "costs": {
                "compute": billing["compute"],
                "storage": billing["storage"],
                "networking": billing["networking"],
                "bigquery": billing["bigquery"],
                "other": billing["other"]
            },
            "total": billing["total"]
        }
        
        if include_forecast:
            result["forecast_end_of_month"] = billing["forecast_end_of_month"]
            result["optimization_opportunities"] = [
                "Use Committed Use Discounts (CUD) for compute (30-70% savings)",
                "Optimize storage classes (nearline/coldline for infrequent access)",
                "Review BigQuery slot commitments",
                "Implement network egress optimization"
            ]
        
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_project_health(payload: dict) -> Dict[str, Any]:
    """Get overall project health status."""
    try:
        resources = list(GCP_RESOURCES.values())
        vms = list(COMPUTE_INSTANCES.values())
        storage = list(STORAGE_INSTANCES.values())
        
        running_vms = len([v for v in vms if v["status"] == "RUNNING"])
        healthy_vms = len([v for v in vms if v["status"] == "RUNNING" and v["cpu_utilization"] < 80])
        
        total_storage_gb = sum(s["size_gb"] for s in storage)
        
        # Calculate health score
        vm_health = (healthy_vms / running_vms * 100) if running_vms > 0 else 100
        overall_health = "healthy" if vm_health > 80 else "warning" if vm_health > 60 else "critical"
        
        return {
            "success": True,
            "overall_health": overall_health,
            "health_score": round(vm_health, 1),
            "resource_summary": {
                "total_resources": len(resources),
                "total_compute_instances": len(vms),
                "running_instances": running_vms,
                "healthy_instances": healthy_vms,
                "total_storage_gb": round(total_storage_gb, 2)
            },
            "alerts": [
                "VM batch-processor-01 has elevated memory utilization (85.3%)",
                "Dev server instance in TERMINATED state - consider cleanup"
            ] if vm_health < 80 else []
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

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
                    "analyze_compute_usage",
                    "check_storage",
                    "analyze_costs",
                    "get_project_health"
                ]
            }
        
        if action == "list_resources":
            return _list_resources(payload)
        elif action == "check_vm_status":
            return _check_vm_status(payload)
        elif action == "analyze_compute_usage":
            return _analyze_compute_usage(payload)
        elif action == "check_storage":
            return _check_storage(payload)
        elif action == "analyze_costs":
            return _analyze_costs(payload)
        elif action == "get_project_health":
            return _get_project_health(payload)
        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": [
                    "list_resources",
                    "check_vm_status",
                    "analyze_compute_usage",
                    "check_storage",
                    "analyze_costs",
                    "get_project_health"
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
