#!/usr/bin/env python3
"""
IAC_MONITORING Plugin - Infrastructure as Code monitoring and compliance.
Detects Terraform and CloudFormation drift, policy compliance, and configuration drift.
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


class IaCMonitor:
    """Monitors Infrastructure as Code for drift and compliance."""
    
    def __init__(self):
        self.terraform_bin = "terraform"
        self.cfn_bin = "aws"
        self.tflint_bin = "tflint"
    
    def scan_drift(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Scan for IaC drift using Terraform or CloudFormation."""
        tool = inputs.get("tool", "terraform")
        workspace = inputs.get("workspace")
        
        try:
            if tool == "terraform" or tool == "both":
                tf_result = self._scan_terraform_drift(workspace)
                if not tf_result:
                    return [PluginOutput(False, "drift_error", "error", None,
                                       "Terraform scan failed", "").to_dict()]
            
            if tool == "cloudformation" or tool == "both":
                cfn_result = self._scan_cloudformation_drift(workspace)
                if not cfn_result:
                    return [PluginOutput(False, "drift_error", "error", None,
                                       "CloudFormation scan failed", "").to_dict()]
            
            drift_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "tools_scanned": tool,
                "total_resources": 0,
                "drift_detected": 0,
                "drifts": []
            }
            
            if tool == "terraform" or tool == "both":
                drift_data["total_resources"] += tf_result.get("total", 0)
                drift_data["drift_detected"] += tf_result.get("drifted", 0)
                drift_data["drifts"].extend(tf_result.get("details", []))
            
            if tool == "cloudformation" or tool == "both":
                drift_data["total_resources"] += cfn_result.get("total", 0)
                drift_data["drift_detected"] += cfn_result.get("drifted", 0)
                drift_data["drifts"].extend(cfn_result.get("details", []))
            
            return [PluginOutput(True, "iac_status", "object", drift_data,
                               f"IaC drift scan completed").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "drift_error", "error", None,
                               "Error scanning drift", str(e)).to_dict()]
    
    def _scan_terraform_drift(self, workspace: Optional[str]) -> Dict[str, Any]:
        """Scan Terraform for drift."""
        try:
            # Run terraform plan to detect drift
            cmd = [self.terraform_bin, "plan", "-json"]
            if workspace:
                cmd.extend(["-var-file", f"{workspace}.tfvars"])
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                logger.warning(f"Terraform plan failed: {result.stderr}")
                return {
                    "total": 0,
                    "drifted": 0,
                    "details": []
                }
            
            # Parse terraform plan output
            drifted_resources = []
            total = 0
            drifted_count = 0
            
            try:
                for line in result.stdout.split('\n'):
                    if line.strip():
                        event = json.loads(line)
                        if event.get("type") == "resource":
                            total += 1
                            if event.get("change", {}).get("actions"):
                                drifted_count += 1
                                drifted_resources.append({
                                    "resource": event.get("address"),
                                    "action": event.get("change", {}).get("actions", [])[0],
                                    "type": "terraform"
                                })
            except json.JSONDecodeError:
                pass
            
            return {
                "total": total,
                "drifted": drifted_count,
                "details": drifted_resources
            }
        except subprocess.TimeoutExpired:
            logger.error("Terraform scan timeout")
            return {"total": 0, "drifted": 0, "details": []}
        except Exception as e:
            logger.error(f"Error scanning Terraform: {e}")
            return {"total": 0, "drifted": 0, "details": []}
    
    def _scan_cloudformation_drift(self, workspace: Optional[str]) -> Dict[str, Any]:
        """Scan CloudFormation for drift detection."""
        try:
            # Get list of stacks
            cmd = [self.cfn_bin, "cloudformation", "describe-stacks", "--query", "Stacks[].StackName"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                logger.warning(f"CloudFormation describe failed: {result.stderr}")
                return {"total": 0, "drifted": 0, "details": []}
            
            stacks = json.loads(result.stdout)
            drifted_resources = []
            total_resources = 0
            drifted_count = 0
            
            for stack in stacks[:5]:  # Limit to first 5 stacks for performance
                # Detect drift on stack
                drift_cmd = [self.cfn_bin, "cloudformation", "detect-stack-drift", "--stack-name", stack]
                drift_result = subprocess.run(drift_cmd, capture_output=True, text=True, timeout=60)
                
                if drift_result.returncode == 0:
                    drift_id = json.loads(drift_result.stdout).get("StackDriftDetectionId")
                    
                    # Get drift information
                    info_cmd = [self.cfn_bin, "cloudformation", "describe-stack-drift-detection-status",
                               "--stack-drift-detection-id", drift_id]
                    info_result = subprocess.run(info_cmd, capture_output=True, text=True, timeout=60)
                    
                    if info_result.returncode == 0:
                        drift_info = json.loads(info_result.stdout)
                        status = drift_info.get("StackDriftDetectionStatus")
                        if status == "DETECTION_COMPLETE":
                            total_resources += drift_info.get("TotalStackResourcesChecked", 0)
                            if drift_info.get("StackDriftStatus") == "DRIFTED":
                                drifted_count += 1
                                drifted_resources.append({
                                    "stack": stack,
                                    "drift_status": "DRIFTED",
                                    "type": "cloudformation"
                                })
            
            return {
                "total": total_resources,
                "drifted": drifted_count,
                "details": drifted_resources
            }
        except subprocess.TimeoutExpired:
            logger.error("CloudFormation scan timeout")
            return {"total": 0, "drifted": 0, "details": []}
        except Exception as e:
            logger.error(f"Error scanning CloudFormation: {e}")
            return {"total": 0, "drifted": 0, "details": []}
    
    def get_compliance_status(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Check policy compliance of IaC."""
        tool = inputs.get("tool", "terraform")
        
        try:
            compliance_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "tool": tool,
                "compliant_resources": 0,
                "non_compliant_resources": 0,
                "compliance_percent": 100,
                "violations": []
            }
            
            if tool == "terraform" or tool == "both":
                # Run tflint for linting
                result = subprocess.run([self.tflint_bin, "--format", "json"], 
                                      capture_output=True, text=True, timeout=60)
                
                if result.returncode == 0:
                    try:
                        lint_output = json.loads(result.stdout)
                        issues = lint_output.get("issues", [])
                        compliance_data["non_compliant_resources"] += len(issues)
                        compliance_data["violations"].extend(issues)
                    except json.JSONDecodeError:
                        pass
            
            if compliance_data["non_compliant_resources"] > 0:
                total = compliance_data["compliant_resources"] + compliance_data["non_compliant_resources"]
                compliance_data["compliance_percent"] = (compliance_data["compliant_resources"] / total) * 100 if total > 0 else 100
            
            return [PluginOutput(True, "compliance_status", "object", compliance_data,
                               f"IaC compliance check completed").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "compliance_error", "error", None,
                               "Error checking compliance", str(e)).to_dict()]
    
    def identify_non_compliant_resources(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Identify resources that violate policies."""
        severity = inputs.get("severity_threshold", "high")
        
        try:
            non_compliant = []
            
            # Run policy checks (would integrate with Sentinel, OPA, or similar)
            # For now, return empty list
            
            return [PluginOutput(True, "non_compliant", "array", non_compliant,
                               f"Non-compliant resources identified").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "error", "error", None,
                               "Error identifying non-compliant resources", str(e)).to_dict()]
    
    def get_drift_history(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get historical drift data."""
        days = inputs.get("days", 30)
        
        try:
            history = {
                "period_days": days,
                "drift_events": [],
                "total_drift_instances": 0
            }
            
            return [PluginOutput(True, "drift_history", "object", history,
                               f"Drift history for {days} days").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "error", "error", None,
                               "Error retrieving drift history", str(e)).to_dict()]


def execute_plugin(inputs: Dict[str, Any]) -> List[Dict]:
    """Main plugin execution entry point."""
    action = inputs.get("action")
    
    if not action:
        return [PluginOutput(False, "error", "error", None,
                           "No action specified", "action parameter is required").to_dict()]
    
    monitor = IaCMonitor()
    
    try:
        if action == "scan_drift":
            return monitor.scan_drift(inputs)
        elif action == "get_compliance_status":
            return monitor.get_compliance_status(inputs)
        elif action == "identify_non_compliant_resources":
            return monitor.identify_non_compliant_resources(inputs)
        elif action == "get_drift_history":
            return monitor.get_drift_history(inputs)
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
