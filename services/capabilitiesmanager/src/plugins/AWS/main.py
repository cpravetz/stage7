#!/usr/bin/env python3
"""
AWS Plugin - Amazon Web Services Cloud Integration
Provides AWS integration for EC2, S3, Lambda, and cost analysis.
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

# Simulated AWS data structures
EC2_INSTANCES = {
    "i-001": {
        "instance_id": "i-001",
        "instance_type": "t3.large",
        "state": "running",
        "availability_zone": "us-east-1a",
        "public_ip": "54.123.45.67",
        "private_ip": "10.0.1.50",
        "cpu_utilization": 42.3,
        "memory_utilization": 58.5,
        "network_in_mbps": 125.4,
        "network_out_mbps": 234.8,
        "launched_at": (datetime.now() - timedelta(days=180)).isoformat(),
        "monthly_cost": 89.5
    },
    "i-002": {
        "instance_id": "i-002",
        "instance_type": "m5.xlarge",
        "state": "running",
        "availability_zone": "us-east-1b",
        "public_ip": "54.123.45.68",
        "private_ip": "10.0.2.50",
        "cpu_utilization": 73.2,
        "memory_utilization": 81.4,
        "network_in_mbps": 456.2,
        "network_out_mbps": 512.5,
        "launched_at": (datetime.now() - timedelta(days=90)).isoformat(),
        "monthly_cost": 145.75
    },
    "i-003": {
        "instance_id": "i-003",
        "instance_type": "t3.small",
        "state": "stopped",
        "availability_zone": "us-east-1c",
        "public_ip": None,
        "private_ip": "10.0.3.50",
        "cpu_utilization": 0,
        "memory_utilization": 0,
        "network_in_mbps": 0,
        "network_out_mbps": 0,
        "launched_at": (datetime.now() - timedelta(days=365)).isoformat(),
        "monthly_cost": 0
    }
}

S3_BUCKETS = {
    "bucket-001": {
        "bucket_id": "bucket-001",
        "name": "app-backups-prod",
        "region": "us-east-1",
        "size_gb": 256.3,
        "object_count": 15342,
        "creation_date": (datetime.now() - timedelta(days=730)).isoformat(),
        "storage_class": "STANDARD",
        "monthly_cost": 12.5,
        "versioning_enabled": True
    },
    "bucket-002": {
        "bucket_id": "bucket-002",
        "name": "logs-archive",
        "region": "us-east-1",
        "size_gb": 512.7,
        "object_count": 45678,
        "creation_date": (datetime.now() - timedelta(days=550)).isoformat(),
        "storage_class": "GLACIER",
        "monthly_cost": 5.2,
        "versioning_enabled": False
    },
    "bucket-003": {
        "bucket_id": "bucket-003",
        "name": "data-analytics",
        "region": "us-west-2",
        "size_gb": 1024.5,
        "object_count": 89234,
        "creation_date": (datetime.now() - timedelta(days=400)).isoformat(),
        "storage_class": "STANDARD",
        "monthly_cost": 48.3,
        "versioning_enabled": True
    }
}

LAMBDA_FUNCTIONS = {
    "lambda-001": {
        "function_id": "lambda-001",
        "name": "process-api-requests",
        "runtime": "python3.9",
        "memory": 512,
        "timeout": 30,
        "invocations_24h": 45234,
        "errors_24h": 12,
        "avg_duration_ms": 245,
        "concurrent_executions": 8,
        "monthly_cost": 8.75,
        "last_modified": (datetime.now() - timedelta(hours=24)).isoformat()
    },
    "lambda-002": {
        "function_id": "lambda-002",
        "name": "generate-reports",
        "runtime": "python3.9",
        "memory": 1024,
        "timeout": 300,
        "invocations_24h": 128,
        "errors_24h": 2,
        "avg_duration_ms": 12500,
        "concurrent_executions": 2,
        "monthly_cost": 15.42,
        "last_modified": (datetime.now() - timedelta(hours=72)).isoformat()
    },
    "lambda-003": {
        "function_id": "lambda-003",
        "name": "cleanup-old-data",
        "runtime": "python3.9",
        "memory": 256,
        "timeout": 60,
        "invocations_24h": 24,
        "errors_24h": 0,
        "avg_duration_ms": 3200,
        "concurrent_executions": 1,
        "monthly_cost": 0.45,
        "last_modified": (datetime.now() - timedelta(hours=120)).isoformat()
    }
}

COST_DATA = {
    "current_month": {
        "month": datetime.now().strftime("%Y-%m"),
        "ec2": 235.25,
        "s3": 65.99,
        "lambda": 24.62,
        "rds": 89.50,
        "other": 34.64,
        "total": 450.00,
        "forecast_end_of_month": 1350.00
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

def _list_instances(payload: dict) -> Dict[str, Any]:
    """List all EC2 instances."""
    try:
        state_filter = payload.get("state", "")
        instance_type_filter = payload.get("instance_type", "")
        
        instances = list(EC2_INSTANCES.values())
        
        if state_filter:
            instances = [i for i in instances if i["state"] == state_filter]
        
        if instance_type_filter:
            instances = [i for i in instances if i["instance_type"] == instance_type_filter]
        
        running_count = len([i for i in instances if i["state"] == "running"])
        stopped_count = len([i for i in instances if i["state"] == "stopped"])
        total_monthly_cost = sum(i["monthly_cost"] for i in instances)
        
        return {
            "success": True,
            "total_instances": len(instances),
            "running": running_count,
            "stopped": stopped_count,
            "total_monthly_cost": round(total_monthly_cost, 2),
            "instances": instances
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_ec2_status(payload: dict) -> Dict[str, Any]:
    """Get detailed status of EC2 instances."""
    try:
        instance_id = payload.get("instance_id", "")
        
        if instance_id:
            if instance_id not in EC2_INSTANCES:
                return {"success": False, "error": f"Instance {instance_id} not found"}
            
            instance = EC2_INSTANCES[instance_id]
            
            # Calculate health status
            if instance["state"] == "stopped":
                health = "stopped"
            elif instance["cpu_utilization"] > 85 or instance["memory_utilization"] > 85:
                health = "critical"
            elif instance["cpu_utilization"] > 70 or instance["memory_utilization"] > 70:
                health = "warning"
            else:
                health = "healthy"
            
            return {
                "success": True,
                "instance": instance,
                "health_status": health,
                "performance_metrics": {
                    "cpu": instance["cpu_utilization"],
                    "memory": instance["memory_utilization"],
                    "network_in": instance["network_in_mbps"],
                    "network_out": instance["network_out_mbps"]
                }
            }
        
        # Return all instances with status summary
        all_instances = list(EC2_INSTANCES.values())
        healthy = len([i for i in all_instances if i["state"] == "running" and i["cpu_utilization"] < 70])
        warning = len([i for i in all_instances if i["state"] == "running" and i["cpu_utilization"] >= 70])
        
        return {
            "success": True,
            "total_instances": len(all_instances),
            "healthy": healthy,
            "warning": warning,
            "stopped": len([i for i in all_instances if i["state"] == "stopped"]),
            "instances": all_instances
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_s3_usage(payload: dict) -> Dict[str, Any]:
    """Check S3 bucket usage and stats."""
    try:
        bucket_name = payload.get("bucket_name", "")
        
        if bucket_name:
            bucket = next((b for b in S3_BUCKETS.values() if b["name"] == bucket_name), None)
            if not bucket:
                return {"success": False, "error": f"Bucket {bucket_name} not found"}
            
            return {
                "success": True,
                "bucket": bucket,
                "growth_estimate_gb_per_month": round(random.uniform(10, 50), 2)
            }
        
        # Return all buckets
        buckets = list(S3_BUCKETS.values())
        total_size_gb = sum(b["size_gb"] for b in buckets)
        total_objects = sum(b["object_count"] for b in buckets)
        total_monthly_cost = sum(b["monthly_cost"] for b in buckets)
        
        return {
            "success": True,
            "total_buckets": len(buckets),
            "total_size_gb": round(total_size_gb, 2),
            "total_objects": total_objects,
            "total_monthly_cost": round(total_monthly_cost, 2),
            "buckets": buckets
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_costs(payload: dict) -> Dict[str, Any]:
    """Analyze AWS costs."""
    try:
        period = payload.get("period", "month")
        breakdown = payload.get("breakdown", True)
        
        cost_data = COST_DATA["current_month"]
        
        if breakdown:
            return {
                "success": True,
                "period": period,
                "costs": {
                    "ec2": cost_data["ec2"],
                    "s3": cost_data["s3"],
                    "lambda": cost_data["lambda"],
                    "rds": cost_data["rds"],
                    "other": cost_data["other"]
                },
                "total": cost_data["total"],
                "forecast_end_of_month": cost_data["forecast_end_of_month"],
                "optimization_opportunities": [
                    "Consider reserved instances for EC2 (potential 40% savings)",
                    "Archive old S3 logs to Glacier (potential 80% savings)",
                    "Consolidate small Lambda functions",
                    "Review and optimize RDS instance types"
                ]
            }
        
        return {
            "success": True,
            "period": period,
            "total": cost_data["total"],
            "forecast_end_of_month": cost_data["forecast_end_of_month"]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_lambda_stats(payload: dict) -> Dict[str, Any]:
    """Get Lambda function statistics."""
    try:
        function_name = payload.get("function_name", "")
        
        if function_name:
            func = next((f for f in LAMBDA_FUNCTIONS.values() if f["name"] == function_name), None)
            if not func:
                return {"success": False, "error": f"Function {function_name} not found"}
            
            error_rate = (func["errors_24h"] / func["invocations_24h"] * 100) if func["invocations_24h"] > 0 else 0
            
            return {
                "success": True,
                "function": func,
                "error_rate_percent": round(error_rate, 2),
                "performance": {
                    "avg_duration_ms": func["avg_duration_ms"],
                    "invocations_24h": func["invocations_24h"],
                    "errors_24h": func["errors_24h"],
                    "concurrent_executions": func["concurrent_executions"]
                }
            }
        
        # Return all Lambda functions
        functions = list(LAMBDA_FUNCTIONS.values())
        total_invocations = sum(f["invocations_24h"] for f in functions)
        total_errors = sum(f["errors_24h"] for f in functions)
        total_monthly_cost = sum(f["monthly_cost"] for f in functions)
        
        return {
            "success": True,
            "total_functions": len(functions),
            "total_invocations_24h": total_invocations,
            "total_errors_24h": total_errors,
            "total_monthly_cost": round(total_monthly_cost, 2),
            "error_rate_percent": round((total_errors / total_invocations * 100) if total_invocations > 0 else 0, 2),
            "functions": functions
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _generate_report(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive AWS infrastructure report."""
    try:
        include_costs = payload.get("include_costs", True)
        include_recommendations = payload.get("include_recommendations", True)
        
        instances = list(EC2_INSTANCES.values())
        buckets = list(S3_BUCKETS.values())
        functions = list(LAMBDA_FUNCTIONS.values())
        cost_data = COST_DATA["current_month"]
        
        running_instances = len([i for i in instances if i["state"] == "running"])
        total_storage_gb = sum(b["size_gb"] for b in buckets)
        
        report = {
            "success": True,
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_instances": len(instances),
                "running_instances": running_instances,
                "stopped_instances": len(instances) - running_instances,
                "total_buckets": len(buckets),
                "total_storage_gb": round(total_storage_gb, 2),
                "lambda_functions": len(functions),
                "total_lambda_invocations_24h": sum(f["invocations_24h"] for f in functions)
            }
        }
        
        if include_costs:
            report["costs"] = {
                "current_month_total": cost_data["total"],
                "forecast_end_of_month": cost_data["forecast_end_of_month"],
                "ec2_cost": cost_data["ec2"],
                "s3_cost": cost_data["s3"],
                "lambda_cost": cost_data["lambda"]
            }
        
        if include_recommendations:
            report["recommendations"] = [
                "Review unused EC2 instances for termination",
                "Implement auto-scaling policies",
                "Optimize S3 storage classes",
                "Set up CloudWatch alerts for cost anomalies",
                "Review security group configurations"
            ]
        
        return report
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
                    "list_instances",
                    "get_ec2_status",
                    "check_s3_usage",
                    "analyze_costs",
                    "get_lambda_stats",
                    "generate_report"
                ]
            }
        
        if action == "list_instances":
            return _list_instances(payload)
        elif action == "get_ec2_status":
            return _get_ec2_status(payload)
        elif action == "check_s3_usage":
            return _check_s3_usage(payload)
        elif action == "analyze_costs":
            return _analyze_costs(payload)
        elif action == "get_lambda_stats":
            return _get_lambda_stats(payload)
        elif action == "generate_report":
            return _generate_report(payload)
        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": [
                    "list_instances",
                    "get_ec2_status",
                    "check_s3_usage",
                    "analyze_costs",
                    "get_lambda_stats",
                    "generate_report"
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
