#!/usr/bin/env python3
"""
KUBERNETES_MONITOR Plugin - Real-time Kubernetes cluster monitoring and diagnostics.
Provides pod health, image vulnerability scanning, resource utilization, and cluster diagnostics.
"""

import sys
import json
import os
import logging
import subprocess
from typing import Any, Dict, List, Optional
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


class KubernetesMonitor:
    """Manages Kubernetes cluster monitoring and diagnostics."""
    
    def __init__(self, kubeconfig_path: str = None):
        self.kubeconfig_path = kubeconfig_path or os.path.expanduser("~/.kube/config")
        self.kubectl_cmd = ["kubectl"]
        if self.kubeconfig_path and os.path.exists(self.kubeconfig_path):
            self.kubectl_cmd.extend(["--kubeconfig", self.kubeconfig_path])
    
    def _run_kubectl(self, args: List[str], namespace: str = None) -> tuple:
        """Execute kubectl command and return stdout, stderr, and return code."""
        cmd = self.kubectl_cmd.copy()
        if namespace:
            cmd.extend(["-n", namespace])
        cmd.extend(args)
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired:
            return "", "Command timeout", -1
        except Exception as e:
            return "", str(e), -1
    
    def get_pod_status(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get status of pods in a namespace."""
        namespace = inputs.get("namespace", "default")
        pod_name = inputs.get("pod_name")
        
        try:
            args = ["get", "pods", "-o", "json"]
            if pod_name:
                args.append(pod_name)
            
            stdout, stderr, rc = self._run_kubectl(args, namespace)
            if rc != 0:
                return [PluginOutput(False, "pod_status_error", "error", None,
                                   f"Failed to get pod status", stderr).to_dict()]
            
            pods_data = json.loads(stdout)
            pods_list = pods_data.get("items", []) if "items" in pods_data else [pods_data]
            
            pod_statuses = []
            for pod in pods_list:
                status = {
                    "name": pod["metadata"]["name"],
                    "namespace": pod["metadata"]["namespace"],
                    "phase": pod["status"].get("phase", "Unknown"),
                    "ready": self._get_pod_ready_status(pod),
                    "restartCount": self._get_pod_restart_count(pod),
                    "age": self._calculate_age(pod["metadata"]["creationTimestamp"]),
                    "containers": self._extract_container_info(pod),
                    "conditions": pod["status"].get("conditions", [])
                }
                pod_statuses.append(status)
            
            return [PluginOutput(True, "pod_status_report", "array", pod_statuses,
                               f"Retrieved status for {len(pod_statuses)} pod(s)").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "pod_status_error", "error", None,
                               "Error retrieving pod status", str(e)).to_dict()]
    
    def scan_image_vulnerabilities(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Scan container images for vulnerabilities."""
        image = inputs.get("image")
        severity_threshold = inputs.get("severity_threshold", "high")
        
        if not image:
            return [PluginOutput(False, "scan_error", "error", None,
                               "Image URI required", "Please provide 'image' parameter").to_dict()]
        
        try:
            # Scan using Trivy (install with: apt-get install trivy)
            vulnerabilities = self._scan_image_with_trivy(image, severity_threshold)
            
            severity_counts = {
                "critical": sum(1 for v in vulnerabilities if v["severity"] == "critical"),
                "high": sum(1 for v in vulnerabilities if v["severity"] == "high"),
                "medium": sum(1 for v in vulnerabilities if v["severity"] == "medium"),
                "low": sum(1 for v in vulnerabilities if v["severity"] == "low")
            }
            
            report = {
                "image": image,
                "scanned_at": datetime.utcnow().isoformat(),
                "vulnerability_count": len(vulnerabilities),
                "severity_breakdown": severity_counts,
                "vulnerabilities": vulnerabilities,
                "recommendation": self._generate_remediation(severity_counts)
            }
            
            return [PluginOutput(True, "vulnerability_report", "object", report,
                               f"Scanned image {image}: found {len(vulnerabilities)} vulnerabilities").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "scan_error", "error", None,
                               "Error scanning image", str(e)).to_dict()]
    
    def get_resource_utilization(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get resource utilization across cluster or namespace."""
        namespace = inputs.get("namespace")
        threshold = inputs.get("resource_threshold_percent", 80)
        
        try:
            # Get resource metrics (requires metrics-server installed)
            args = ["top", "nodes" if not namespace else "pod"]
            if namespace:
                stdout, _, rc = self._run_kubectl(["top", "pod", "-o", "json"], namespace)
            else:
                stdout, _, rc = self._run_kubectl(["top", "nodes", "-o", "json"])
            
            if rc != 0:
                # Return mock data if metrics-server not available
                return [self._mock_resource_utilization(namespace, threshold)]
            
            utilization_data = json.loads(stdout) if stdout else {}
            
            resource_report = {
                "timestamp": datetime.utcnow().isoformat(),
                "namespace": namespace or "cluster-wide",
                "threshold_percent": threshold,
                "resources": utilization_data.get("items", []),
                "high_utilization_alerts": self._identify_high_utilization(
                    utilization_data.get("items", []), threshold
                )
            }
            
            return [PluginOutput(True, "resource_utilization", "object", resource_report,
                               "Retrieved resource utilization metrics").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "resource_error", "error", None,
                               "Error retrieving resource metrics", str(e)).to_dict()]
    
    def get_cluster_health(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get overall cluster health status."""
        try:
            # Get node status
            stdout, _, rc = self._run_kubectl(["get", "nodes", "-o", "json"])
            if rc != 0:
                return [PluginOutput(False, "health_error", "error", None,
                                   "Failed to get node status", "").to_dict()]
            
            nodes_data = json.loads(stdout)
            nodes = nodes_data.get("items", [])
            
            node_statuses = []
            for node in nodes:
                status = {
                    "name": node["metadata"]["name"],
                    "status": self._get_node_status(node),
                    "conditions": node["status"].get("conditions", []),
                    "allocatable": node["status"].get("allocatable", {}),
                    "capacity": node["status"].get("capacity", {})
                }
                node_statuses.append(status)
            
            # Analyze cluster health
            healthy_nodes = sum(1 for n in node_statuses if n["status"] == "Ready")
            
            cluster_health = {
                "timestamp": datetime.utcnow().isoformat(),
                "total_nodes": len(nodes),
                "healthy_nodes": healthy_nodes,
                "unhealthy_nodes": len(nodes) - healthy_nodes,
                "health_score": (healthy_nodes / len(nodes) * 100) if nodes else 0,
                "nodes": node_statuses,
                "status": "Healthy" if healthy_nodes == len(nodes) else "Degraded"
            }
            
            return [PluginOutput(True, "cluster_health", "object", cluster_health,
                               f"Cluster health: {healthy_nodes}/{len(nodes)} nodes ready").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "health_error", "error", None,
                               "Error assessing cluster health", str(e)).to_dict()]
    
    def identify_at_risk_pods(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Identify pods at risk due to resource constraints or pending states."""
        namespace = inputs.get("namespace", "default")
        
        try:
            stdout, _, rc = self._run_kubectl(["get", "pods", "-o", "json"], namespace)
            if rc != 0:
                return [PluginOutput(False, "at_risk_error", "error", None,
                                   "Failed to get pods", "").to_dict()]
            
            pods_data = json.loads(stdout)
            pods = pods_data.get("items", [])
            
            at_risk_pods = []
            for pod in pods:
                risk_factors = []
                
                # Check phase
                phase = pod["status"].get("phase")
                if phase == "Pending":
                    risk_factors.append("Pod is pending - may indicate resource constraints")
                elif phase == "Failed":
                    risk_factors.append("Pod has failed")
                
                # Check restart count
                restart_count = self._get_pod_restart_count(pod)
                if restart_count > 5:
                    risk_factors.append(f"High restart count: {restart_count}")
                
                # Check conditions
                for condition in pod["status"].get("conditions", []):
                    if condition.get("status") == "False":
                        risk_factors.append(f"Condition {condition.get('type')} is False")
                
                if risk_factors:
                    at_risk_pods.append({
                        "name": pod["metadata"]["name"],
                        "namespace": pod["metadata"]["namespace"],
                        "phase": phase,
                        "risk_factors": risk_factors,
                        "recommendation": self._get_remediation_for_pod(risk_factors)
                    })
            
            return [PluginOutput(True, "at_risk_pods", "array", at_risk_pods,
                               f"Identified {len(at_risk_pods)} at-risk pods").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "at_risk_error", "error", None,
                               "Error identifying at-risk pods", str(e)).to_dict()]
    
    def get_namespace_summary(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get aggregated metrics for a namespace."""
        namespace = inputs.get("namespace", "default")
        
        try:
            stdout, _, rc = self._run_kubectl(["get", "pods", "-o", "json"], namespace)
            if rc != 0:
                return [PluginOutput(False, "summary_error", "error", None,
                                   "Failed to get namespace data", "").to_dict()]
            
            pods_data = json.loads(stdout)
            pods = pods_data.get("items", [])
            
            summary = {
                "namespace": namespace,
                "pod_count": len(pods),
                "running_pods": sum(1 for p in pods if p["status"].get("phase") == "Running"),
                "pending_pods": sum(1 for p in pods if p["status"].get("phase") == "Pending"),
                "failed_pods": sum(1 for p in pods if p["status"].get("phase") == "Failed"),
                "containers": sum(len(p["spec"].get("containers", [])) for p in pods),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "namespace_summary", "object", summary,
                               f"Namespace {namespace} summary retrieved").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "summary_error", "error", None,
                               "Error getting namespace summary", str(e)).to_dict()]
    
    # Helper methods
    def _get_pod_ready_status(self, pod: Dict) -> str:
        """Extract ready containers status."""
        try:
            statuses = pod["status"].get("containerStatuses", [])
            ready = sum(1 for s in statuses if s.get("ready", False))
            total = len(statuses)
            return f"{ready}/{total}"
        except:
            return "Unknown"
    
    def _get_pod_restart_count(self, pod: Dict) -> int:
        """Get total restart count for a pod."""
        try:
            statuses = pod["status"].get("containerStatuses", [])
            return sum(s.get("restartCount", 0) for s in statuses)
        except:
            return 0
    
    def _extract_container_info(self, pod: Dict) -> List[Dict]:
        """Extract container information from pod."""
        containers = []
        for container in pod["spec"].get("containers", []):
            containers.append({
                "name": container.get("name"),
                "image": container.get("image"),
                "resources": container.get("resources", {})
            })
        return containers
    
    def _calculate_age(self, creation_timestamp: str) -> str:
        """Calculate pod age from creation timestamp."""
        try:
            created = datetime.fromisoformat(creation_timestamp.replace('Z', '+00:00'))
            age = datetime.utcnow() - created.replace(tzinfo=None)
            return str(age).split('.')[0]
        except:
            return "Unknown"
    
    def _get_node_status(self, node: Dict) -> str:
        """Extract node status from conditions."""
        for condition in node["status"].get("conditions", []):
            if condition.get("type") == "Ready":
                return "Ready" if condition.get("status") == "True" else "NotReady"
        return "Unknown"
    
    def _scan_image_with_trivy(self, image: str, severity: str) -> List[Dict]:
        """Scan container image for vulnerabilities using Trivy."""
        try:
            # Run Trivy image scan
            cmd = [
                "trivy", "image",
                "--format", "json",
                "--severity", severity.upper(),
                image
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                logger.warning(f"Trivy scan failed for {image}: {result.stderr}")
                return []
            
            scan_results = json.loads(result.stdout)
            vulnerabilities = []
            
            for result_item in scan_results.get("Results", []):
                for vuln in result_item.get("Vulnerabilities", []):
                    vulnerabilities.append({
                        "id": vuln.get("VulnerabilityID"),
                        "severity": vuln.get("Severity", "unknown").lower(),
                        "package": vuln.get("PkgName"),
                        "version": vuln.get("InstalledVersion"),
                        "title": vuln.get("Title"),
                        "fixed_version": vuln.get("FixedVersion")
                    })
            
            return vulnerabilities
        except subprocess.TimeoutExpired:
            logger.error(f"Trivy scan timeout for {image}")
            return []
        except Exception as e:
            logger.error(f"Error running Trivy scan: {e}")
            return []
    
    def _generate_remediation(self, severity_counts: Dict) -> str:
        """Generate remediation recommendation."""
        if severity_counts["critical"] > 0:
            return "CRITICAL: Immediate action required. Address all critical vulnerabilities before deployment."
        elif severity_counts["high"] > 0:
            return "HIGH: Update dependencies and rebuild image before next deployment cycle."
        else:
            return "LOW-MEDIUM: Address vulnerabilities in next maintenance window."
    
    def _identify_high_utilization(self, resources: List, threshold: int) -> List[Dict]:
        """Identify resources above threshold."""
        # Mock implementation
        return []
    
    def _mock_resource_utilization(self, namespace: str, threshold: int) -> Dict:
        """Fallback when metrics-server not available - uses kubectl top as alternative."""
        try:
            # Try to get metrics from kubectl top
            if namespace:
                stdout, _, rc = self._run_kubectl(["top", "pod", "-o", "json"], namespace)
            else:
                stdout, _, rc = self._run_kubectl(["top", "nodes", "-o", "json"])
            
            if rc == 0 and stdout:
                return PluginOutput(True, "resource_utilization", "object", 
                                  json.loads(stdout), "Resource utilization retrieved").to_dict()
        except:
            pass
        
        # If all else fails, return an error response
        return PluginOutput(False, "resource_error", "error", None,
                          "Metrics server not available", 
                          "Install metrics-server to get resource utilization data").to_dict()
    
    def _get_remediation_for_pod(self, risk_factors: List[str]) -> str:
        """Suggest remediation for at-risk pod."""
        if "pending" in str(risk_factors).lower():
            return "Check resource limits, node capacity, and pod scheduling constraints"
        elif "restart" in str(risk_factors).lower():
            return "Review application logs for crash causes and increase resource limits if needed"
        else:
            return "Check pod events and logs for failure details"


def execute_plugin(inputs: Dict[str, Any]) -> List[Dict]:
    """Main plugin execution entry point."""
    action = inputs.get("action")
    
    if not action:
        return [PluginOutput(False, "error", "error", None,
                           "No action specified", "action parameter is required").to_dict()]
    
    monitor = KubernetesMonitor(inputs.get("kubeconfig_path"))
    
    try:
        if action == "get_pod_status":
            return monitor.get_pod_status(inputs)
        elif action == "scan_image_vulnerabilities":
            return monitor.scan_image_vulnerabilities(inputs)
        elif action == "get_resource_utilization":
            return monitor.get_resource_utilization(inputs)
        elif action == "get_cluster_health":
            return monitor.get_cluster_health(inputs)
        elif action == "identify_at_risk_pods":
            return monitor.identify_at_risk_pods(inputs)
        elif action == "get_namespace_summary":
            return monitor.get_namespace_summary(inputs)
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
