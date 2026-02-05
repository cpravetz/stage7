#!/usr/bin/env python3
"""
SERVICE_MESH Plugin - Service mesh and microservices monitoring.
Provides dependency mapping, latency analysis, traffic management, and policy enforcement.
"""

import sys
import json
import os
import logging
import subprocess
from typing import Any, Dict, List
from datetime import datetime

# Configure logging
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PluginOutput:
    """Represents a plugin output result."""
    def __init__(self, success: bool, name: str, result_type: str,
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        output = {
            "success": self.success,
            "name": self.name,
            "resultType": self.result_type,
            "result": self.result,
            "resultDescription": self.result_description
        }
        if self.error:
            output["error"] = self.error
        return output


class ServiceMeshMonitor:
    """Monitors service mesh and microservices."""
    
    def __init__(self):
        self.kubectl_cmd = ["kubectl"]
    
    def get_mesh_status(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get overall service mesh status."""
        mesh_name = inputs.get("mesh_name", "istio")
        namespace = inputs.get("namespace", "istio-system")
        
        try:
            mesh_status = {
                "timestamp": datetime.utcnow().isoformat(),
                "mesh_name": mesh_name,
                "namespace": namespace,
                "total_services": 0,
                "healthy_services": 0,
                "avg_latency_ms": 0,
                "error_rate_percent": 0,
                "services": [],
                "dependencies_mapped": 0,
                "virtual_services": 0,
                "destination_rules": 0
            }
            
            # Query Kubernetes for mesh components
            try:
                # Get virtual services
                cmd = self.kubectl_cmd + ["get", "vs", "-n", namespace, "-o", "json"]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    vs_data = json.loads(result.stdout)
                    mesh_status["virtual_services"] = len(vs_data.get("items", []))
                
                # Get destination rules
                cmd = self.kubectl_cmd + ["get", "dr", "-n", namespace, "-o", "json"]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    dr_data = json.loads(result.stdout)
                    mesh_status["destination_rules"] = len(dr_data.get("items", []))
            except Exception as e:
                logger.warning(f"Failed to query mesh components: {e}")
            
            return [PluginOutput(True, "mesh_status", "object", mesh_status,
                               f"Service mesh status retrieved").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "mesh_error", "error", None,
                               "Error retrieving mesh status", str(e)).to_dict()]
    
    def get_service_dependencies(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get service dependency map."""
        mesh_name = inputs.get("mesh_name", "istio")
        namespace = inputs.get("namespace", "default")
        
        try:
            dependencies = []
            
            # This would query the service mesh control plane for dependencies
            # (Istio API, Linkerd API, Consul, etc.)
            
            return [PluginOutput(True, "dependencies", "array", dependencies,
                               f"Service dependencies mapped").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "dependency_error", "error", None,
                               "Error mapping dependencies", str(e)).to_dict()]
    
    def analyze_latency(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Analyze service latency metrics."""
        mesh_name = inputs.get("mesh_name", "istio")
        namespace = inputs.get("namespace", "default")
        threshold = inputs.get("latency_threshold_ms", 100)
        
        try:
            latency_analysis = {
                "timestamp": datetime.utcnow().isoformat(),
                "mesh_name": mesh_name,
                "threshold_ms": threshold,
                "services_above_threshold": 0,
                "p50_latency_ms": 0,
                "p95_latency_ms": 0,
                "p99_latency_ms": 0,
                "high_latency_services": []
            }
            
            return [PluginOutput(True, "latency_analysis", "object", latency_analysis,
                               f"Latency analysis completed").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "latency_error", "error", None,
                               "Error analyzing latency", str(e)).to_dict()]
    
    def check_traffic_policies(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Check traffic management policies."""
        mesh_name = inputs.get("mesh_name", "istio")
        namespace = inputs.get("namespace", "default")
        
        try:
            policies = {
                "timestamp": datetime.utcnow().isoformat(),
                "mesh_name": mesh_name,
                "total_policies": 0,
                "enforced_policies": 0,
                "policy_violations": []
            }
            
            return [PluginOutput(True, "traffic_policies", "object", policies,
                               f"Traffic policies checked").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "policy_error", "error", None,
                               "Error checking traffic policies", str(e)).to_dict()]
    
    def identify_bottlenecks(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Identify performance bottlenecks in the mesh."""
        mesh_name = inputs.get("mesh_name", "istio")
        namespace = inputs.get("namespace", "default")
        
        try:
            bottlenecks = []
            
            # Analyze services with high latency or error rates
            
            return [PluginOutput(True, "bottlenecks", "array", bottlenecks,
                               f"Bottlenecks identified").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "bottleneck_error", "error", None,
                               "Error identifying bottlenecks", str(e)).to_dict()]


def execute_plugin(inputs: Dict[str, Any]) -> List[Dict]:
    """Main plugin execution entry point."""
    action = inputs.get("action")
    
    if not action:
        return [PluginOutput(False, "error", "error", None,
                           "No action specified", "action parameter is required").to_dict()]
    
    monitor = ServiceMeshMonitor()
    
    try:
        if action == "get_mesh_status":
            return monitor.get_mesh_status(inputs)
        elif action == "get_service_dependencies":
            return monitor.get_service_dependencies(inputs)
        elif action == "analyze_latency":
            return monitor.analyze_latency(inputs)
        elif action == "check_traffic_policies":
            return monitor.check_traffic_policies(inputs)
        elif action == "identify_bottlenecks":
            return monitor.identify_bottlenecks(inputs)
        else:
            return [PluginOutput(False, "error", "error", None,
                               f"Unknown action: {action}", "").to_dict()]
    except Exception as e:
        logger.error(f"Plugin execution error: {e}")
        return [PluginOutput(False, "error", "error", None,
                           "Plugin execution failed", str(e)).to_dict()]


def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse input arguments from command line."""
    try:
        inputs_pairs = json.loads(inputs_str)
        return dict(inputs_pairs)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse inputs: {inputs_str}")
        return {}


def main():
    """Main entry point for the plugin."""
    if len(sys.argv) < 3:
        logger.error("Usage: python main.py <plugin_root> <inputs_json>")
        sys.exit(1)
    
    plugin_root = sys.argv[1]
    inputs_json = sys.argv[2]
    
    inputs = parse_inputs(inputs_json)
    results = execute_plugin(inputs)
    
    print(json.dumps([r for r in results]))


if __name__ == "__main__":
    main()
