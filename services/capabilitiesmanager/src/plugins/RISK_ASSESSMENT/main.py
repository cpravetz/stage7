#!/usr/bin/env python3
"""
Risk Assessment Plugin - Comprehensive risk identification and analysis capabilities
"""
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class RiskLevel(Enum):
    """Risk severity levels"""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


class RiskStatus(Enum):
    """Risk lifecycle status"""
    IDENTIFIED = "identified"
    ASSESSED = "assessed"
    MITIGATED = "mitigated"
    RESOLVED = "resolved"
    MONITORING = "monitoring"


@dataclass
class Risk:
    """Risk data model"""
    id: str
    name: str
    description: str
    category: str
    level: str
    probability: float
    impact: float
    status: str
    owner: str
    created_at: str
    updated_at: str
    mitigation_plan: Optional[str] = None
    threats: Optional[List[str]] = None
    controls: Optional[List[str]] = None


class RiskAssessmentPlugin:
    """Risk Assessment Plugin - Manages risk identification, assessment, and reporting"""

    def __init__(self):
        """Initialize the Risk Assessment Plugin"""
        self.risks_storage: Dict[str, Risk] = {}
        self.threat_registry: Dict[str, List[str]] = {}
        self.mitigation_plans: Dict[str, Dict] = {}
        self.assessment_history: List[Dict] = []
        self.logger = logging.getLogger(__name__)
        self.logger.info("Risk Assessment Plugin initialized")

    def assess_risks(self, risk_ids: List[str], assessment_data: Dict) -> Dict[str, Any]:
        """
        Assess identified risks with detailed evaluation

        Args:
            risk_ids: List of risk IDs to assess
            assessment_data: Assessment criteria and parameters

        Returns:
            Dictionary with assessment results and recommendations
        """
        try:
            self.logger.info(f"Starting risk assessment for {len(risk_ids)} risks")
            assessment_results = {
                "assessment_id": f"assess_{datetime.now().timestamp()}",
                "timestamp": datetime.now().isoformat(),
                "assessed_risks": [],
                "total_risk_score": 0,
                "recommendations": []
            }

            for risk_id in risk_ids:
                if risk_id not in self.risks_storage:
                    self.logger.warning(f"Risk {risk_id} not found")
                    continue

                risk = self.risks_storage[risk_id]
                score = (float(risk.probability) * float(risk.impact)) * 10
                assessment_results["assessed_risks"].append({
                    "risk_id": risk_id,
                    "score": score,
                    "level": risk.level,
                    "status": risk.status
                })
                assessment_results["total_risk_score"] += score

            # Generate recommendations
            assessment_results["recommendations"] = self._generate_recommendations(assessment_results)
            self.assessment_history.append(assessment_results)
            self.logger.info(f"Risk assessment completed: {assessment_results['assessment_id']}")
            return assessment_results

        except Exception as e:
            self.logger.error(f"Error in assess_risks: {str(e)}")
            return {
                "error": "Assessment failed",
                "details": str(e),
                "status": "failed"
            }

    def identify_threats(self, risk_id: str, threat_list: List[str]) -> Dict[str, Any]:
        """
        Identify and categorize threats associated with a risk

        Args:
            risk_id: The risk ID to associate threats with
            threat_list: List of identified threats

        Returns:
            Dictionary with threat analysis and categorization
        """
        try:
            self.logger.info(f"Identifying threats for risk {risk_id}")

            if risk_id not in self.risks_storage:
                self.logger.error(f"Risk {risk_id} not found")
                return {"error": f"Risk {risk_id} not found", "status": "failed"}

            categorized_threats = self._categorize_threats(threat_list)
            self.threat_registry[risk_id] = threat_list

            result = {
                "risk_id": risk_id,
                "threat_count": len(threat_list),
                "threats": threat_list,
                "categorized": categorized_threats,
                "timestamp": datetime.now().isoformat()
            }

            if risk_id in self.risks_storage:
                self.risks_storage[risk_id].threats = threat_list
                self.risks_storage[risk_id].updated_at = datetime.now().isoformat()

            self.logger.info(f"Identified {len(threat_list)} threats for risk {risk_id}")
            return result

        except Exception as e:
            self.logger.error(f"Error in identify_threats: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def calculate_impact(self, risk_id: str, impact_factors: Dict[str, float]) -> Dict[str, Any]:
        """
        Calculate risk impact based on various factors

        Args:
            risk_id: Risk ID to calculate impact for
            impact_factors: Dictionary of factors affecting impact

        Returns:
            Dictionary with calculated impact score and analysis
        """
        try:
            self.logger.info(f"Calculating impact for risk {risk_id}")

            if risk_id not in self.risks_storage:
                return {"error": f"Risk {risk_id} not found", "status": "failed"}

            risk = self.risks_storage[risk_id]
            weighted_factors = {}
            total_impact = 0

            for factor, weight in impact_factors.items():
                weighted_factors[factor] = weight
                total_impact += weight

            normalized_impact = total_impact / len(impact_factors) if impact_factors else 0
            risk.impact = normalized_impact
            risk.updated_at = datetime.now().isoformat()

            result = {
                "risk_id": risk_id,
                "factors": weighted_factors,
                "total_impact": total_impact,
                "normalized_impact": normalized_impact,
                "impact_level": self._determine_level(normalized_impact),
                "timestamp": datetime.now().isoformat()
            }

            self.logger.info(f"Impact calculated for risk {risk_id}: {normalized_impact}")
            return result

        except Exception as e:
            self.logger.error(f"Error in calculate_impact: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def create_mitigation(self, risk_id: str, mitigation_strategy: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create mitigation plan for a risk

        Args:
            risk_id: Risk ID to create mitigation for
            mitigation_strategy: Dictionary containing mitigation details

        Returns:
            Dictionary with mitigation plan ID and details
        """
        try:
            self.logger.info(f"Creating mitigation plan for risk {risk_id}")

            if risk_id not in self.risks_storage:
                return {"error": f"Risk {risk_id} not found", "status": "failed"}

            mitigation_plan = {
                "plan_id": f"mit_{risk_id}_{datetime.now().timestamp()}",
                "risk_id": risk_id,
                "strategy": mitigation_strategy,
                "status": "created",
                "created_at": datetime.now().isoformat(),
                "tasks": [],
                "owner": mitigation_strategy.get("owner", "Unassigned"),
                "timeline": mitigation_strategy.get("timeline", "90 days")
            }

            self.mitigation_plans[mitigation_plan["plan_id"]] = mitigation_plan
            if risk_id in self.risks_storage:
                self.risks_storage[risk_id].mitigation_plan = mitigation_plan["plan_id"]

            self.logger.info(f"Mitigation plan created: {mitigation_plan['plan_id']}")
            return mitigation_plan

        except Exception as e:
            self.logger.error(f"Error in create_mitigation: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def track_risks(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Track and monitor all active risks

        Args:
            filters: Optional filters for risk tracking (status, level, owner)

        Returns:
            Dictionary with tracked risks and analytics
        """
        try:
            self.logger.info("Tracking risks with filters: {}".format(filters))

            tracked_risks = list(self.risks_storage.values())

            if filters:
                if "status" in filters:
                    tracked_risks = [r for r in tracked_risks if r.status == filters["status"]]
                if "level" in filters:
                    tracked_risks = [r for r in tracked_risks if r.level == filters["level"]]
                if "owner" in filters:
                    tracked_risks = [r for r in tracked_risks if r.owner == filters["owner"]]

            stats = {
                "total_risks": len(tracked_risks),
                "by_level": self._count_by_level(tracked_risks),
                "by_status": self._count_by_status(tracked_risks),
                "risks": [asdict(r) for r in tracked_risks],
                "timestamp": datetime.now().isoformat()
            }

            self.logger.info(f"Tracked {len(tracked_risks)} risks")
            return stats

        except Exception as e:
            self.logger.error(f"Error in track_risks: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def generate_report(self, report_type: str = "summary") -> Dict[str, Any]:
        """
        Generate comprehensive risk assessment report

        Args:
            report_type: Type of report (summary, detailed, executive)

        Returns:
            Dictionary containing the generated report
        """
        try:
            self.logger.info(f"Generating {report_type} risk report")

            report = {
                "report_id": f"report_{datetime.now().timestamp()}",
                "type": report_type,
                "generated_at": datetime.now().isoformat(),
                "summary": {
                    "total_risks": len(self.risks_storage),
                    "total_threats": sum(len(t) for t in self.threat_registry.values()),
                    "active_mitigations": len(self.mitigation_plans)
                }
            }

            if report_type in ["detailed", "executive"]:
                report["risks"] = [asdict(r) for r in self.risks_storage.values()]
                report["threats"] = self.threat_registry
                report["mitigations"] = self.mitigation_plans
                report["assessment_history"] = self.assessment_history[-5:]

            self.logger.info(f"Report generated: {report['report_id']}")
            return report

        except Exception as e:
            self.logger.error(f"Error in generate_report: {str(e)}")
            return {"error": str(e), "status": "failed"}

    # Helper methods
    def _categorize_threats(self, threats: List[str]) -> Dict[str, List[str]]:
        """Categorize threats by type"""
        categorized = {
            "external": [],
            "internal": [],
            "operational": [],
            "strategic": []
        }
        # Simplified categorization logic
        for threat in threats:
            if any(word in threat.lower() for word in ["external", "market", "competitor"]):
                categorized["external"].append(threat)
            elif any(word in threat.lower() for word in ["internal", "staff", "process"]):
                categorized["internal"].append(threat)
            elif any(word in threat.lower() for word in ["operational", "system", "technical"]):
                categorized["operational"].append(threat)
            else:
                categorized["strategic"].append(threat)
        return categorized

    def _generate_recommendations(self, assessment: Dict) -> List[str]:
        """Generate recommendations based on assessment"""
        recommendations = []
        if assessment["total_risk_score"] > 100:
            recommendations.append("Implement immediate mitigation strategies")
        if assessment["total_risk_score"] > 50:
            recommendations.append("Increase monitoring frequency")
        recommendations.append("Regular risk review meetings recommended")
        return recommendations

    def _determine_level(self, score: float) -> str:
        """Determine risk level from score"""
        if score >= 7.5:
            return "CRITICAL"
        elif score >= 5:
            return "HIGH"
        elif score >= 2.5:
            return "MEDIUM"
        else:
            return "LOW"

    def _count_by_level(self, risks: List[Risk]) -> Dict[str, int]:
        """Count risks by level"""
        counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
        for risk in risks:
            counts[risk.level] = counts.get(risk.level, 0) + 1
        return counts

    def _count_by_status(self, risks: List[Risk]) -> Dict[str, int]:
        """Count risks by status"""
        counts = {}
        for risk in risks:
            counts[risk.status] = counts.get(risk.status, 0) + 1
        return counts


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute plugin actions

    Args:
        action: Action name to execute
        parameters: Action parameters

    Returns:
        Dictionary with action results
    """
    plugin = RiskAssessmentPlugin()

    # Load sample data for testing
    plugin.risks_storage = {
        "risk_001": Risk(
            id="risk_001",
            name="Market Volatility",
            description="Exposure to market fluctuations",
            category="Financial",
            level="HIGH",
            probability=0.7,
            impact=0.8,
            status="monitoring",
            owner="Finance Team",
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat()
        )
    }

    actions = {
        "assess_risks": lambda: plugin.assess_risks(
            parameters.get("risk_ids", []),
            parameters.get("assessment_data", {})
        ),
        "identify_threats": lambda: plugin.identify_threats(
            parameters.get("risk_id", ""),
            parameters.get("threat_list", [])
        ),
        "calculate_impact": lambda: plugin.calculate_impact(
            parameters.get("risk_id", ""),
            parameters.get("impact_factors", {})
        ),
        "create_mitigation": lambda: plugin.create_mitigation(
            parameters.get("risk_id", ""),
            parameters.get("mitigation_strategy", {})
        ),
        "track_risks": lambda: plugin.track_risks(parameters.get("filters")),
        "generate_report": lambda: plugin.generate_report(parameters.get("report_type", "summary"))
    }

    if action not in actions:
        return {"error": f"Action '{action}' not found", "status": "failed"}

    return actions[action]()
            "result": {{"message": "Plugin executed successfully"}},
            "resultDescription": f"Result of {action} operation"
        }}]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }}]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {{}}

        if isinstance(payload, dict):
            if payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
                for entry in payload.get('entries', []):
                    if isinstance(entry, list) and len(entry) == 2:
                        key, value = entry
                        inputs_dict[key] = value
            else:
                for key, value in payload.items():
                    if key not in ('_type', 'entries'):
                        inputs_dict[key] = value

        elif isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, value = item
                    inputs_dict[key] = value

        return inputs_dict

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {{e}}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }}]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }}]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
