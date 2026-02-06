#!/usr/bin/env python3
"""
Lead Management Plugin - Lead scoring, nurturing, and management
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class Lead:
    """Lead model"""
    lead_id: str
    name: str
    email: str
    phone: str
    company: str
    industry: str
    lead_source: str
    status: str
    score: float
    created_at: str
    updated_at: str
    last_contacted: Optional[str] = None
    engaged: bool = False


@dataclass
class LeadScore:
    """Lead score model"""
    score_id: str
    lead_id: str
    total_score: float
    engagement_score: float
    company_score: float
    behavioral_score: float
    created_at: str


@dataclass
class NurtureActivity:
    """Nurture activity model"""
    activity_id: str
    lead_id: str
    activity_type: str
    content_sent: str
    response: bool
    response_date: Optional[str]
    created_at: str


class LeadManagementPlugin:
    """Lead Management Plugin - Manages leads with scoring and nurturing"""

    def __init__(self):
        """Initialize the Lead Management Plugin"""
        self.leads: Dict[str, Lead] = {}
        self.lead_scores: Dict[str, LeadScore] = {}
        self.nurture_campaigns: Dict[str, Dict] = {}
        self.nurture_activities: Dict[str, NurtureActivity] = {}
        self.assignments: Dict[str, Dict] = {}
        self.logger = logging.getLogger(__name__)
        self.logger.info("Lead Management Plugin initialized")

    def create_lead(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new lead in the system

        Args:
            lead_data: Lead information

        Returns:
            Dictionary with created lead details
        """
        try:
            self.logger.info(f"Creating lead: {lead_data.get('name', 'Unknown')}")

            lead_id = f"lead_{datetime.now().timestamp()}"

            lead = Lead(
                lead_id=lead_id,
                name=lead_data.get("name", ""),
                email=lead_data.get("email", ""),
                phone=lead_data.get("phone", ""),
                company=lead_data.get("company", ""),
                industry=lead_data.get("industry", ""),
                lead_source=lead_data.get("lead_source", "Unknown"),
                status=lead_data.get("status", "New"),
                score=float(lead_data.get("score", 0.0)),
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                engaged=False
            )

            self.leads[lead_id] = lead
            self.logger.info(f"Lead created: {lead_id}")
            return asdict(lead)

        except Exception as e:
            self.logger.error(f"Error in create_lead: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def score_lead(self, lead_id: str, scoring_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Score a lead based on various factors

        Args:
            lead_id: The lead ID to score
            scoring_data: Scoring criteria and factors

        Returns:
            Dictionary with lead score results
        """
        try:
            self.logger.info(f"Scoring lead {lead_id}")

            if lead_id not in self.leads:
                return {"error": f"Lead {lead_id} not found", "status": "failed"}

            lead = self.leads[lead_id]

            # Calculate scores
            engagement_score = float(scoring_data.get("engagement_score", 0.0))
            company_score = float(scoring_data.get("company_score", 0.0))
            behavioral_score = float(scoring_data.get("behavioral_score", 0.0))

            total_score = (engagement_score * 0.4 + company_score * 0.3 + behavioral_score * 0.3)
            total_score = min(100, max(0, total_score))

            score = LeadScore(
                score_id=f"score_{lead_id}_{datetime.now().timestamp()}",
                lead_id=lead_id,
                total_score=total_score,
                engagement_score=engagement_score,
                company_score=company_score,
                behavioral_score=behavioral_score,
                created_at=datetime.now().isoformat()
            )

            self.lead_scores[score.score_id] = score
            lead.score = total_score
            lead.updated_at = datetime.now().isoformat()

            # Determine lead grade
            if total_score >= 80:
                grade = "A"
            elif total_score >= 60:
                grade = "B"
            elif total_score >= 40:
                grade = "C"
            else:
                grade = "D"

            result = asdict(score)
            result["grade"] = grade
            result["recommendation"] = f"Lead is grade {grade} - prioritize for sales engagement"

            self.logger.info(f"Lead scored: {lead_id} - Score: {total_score}")
            return result

        except Exception as e:
            self.logger.error(f"Error in score_lead: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def assign_lead(self, lead_id: str, assignment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Assign a lead to a sales representative

        Args:
            lead_id: The lead ID to assign
            assignment_data: Assignment details

        Returns:
            Dictionary with assignment information
        """
        try:
            self.logger.info(f"Assigning lead {lead_id}")

            if lead_id not in self.leads:
                return {"error": f"Lead {lead_id} not found", "status": "failed"}

            lead = self.leads[lead_id]
            assignment_id = f"assign_{lead_id}_{datetime.now().timestamp()}"

            assignment = {
                "assignment_id": assignment_id,
                "lead_id": lead_id,
                "assigned_to": assignment_data.get("assigned_to", ""),
                "assignment_date": datetime.now().isoformat(),
                "expected_followup": assignment_data.get("expected_followup", ""),
                "notes": assignment_data.get("notes", ""),
                "status": "assigned"
            }

            self.assignments[assignment_id] = assignment
            lead.status = "Assigned"
            lead.updated_at = datetime.now().isoformat()

            self.logger.info(f"Lead assigned: {assignment_id}")
            return assignment

        except Exception as e:
            self.logger.error(f"Error in assign_lead: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def nurture_lead(self, lead_id: str, nurture_plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create and execute nurture campaigns for leads

        Args:
            lead_id: The lead ID to nurture
            nurture_plan: Nurture campaign details

        Returns:
            Dictionary with nurture campaign information
        """
        try:
            self.logger.info(f"Creating nurture campaign for lead {lead_id}")

            if lead_id not in self.leads:
                return {"error": f"Lead {lead_id} not found", "status": "failed"}

            lead = self.leads[lead_id]
            campaign_id = f"nurture_{lead_id}_{datetime.now().timestamp()}"

            campaign = {
                "campaign_id": campaign_id,
                "lead_id": lead_id,
                "campaign_name": nurture_plan.get("campaign_name", f"Campaign for {lead.name}"),
                "campaign_type": nurture_plan.get("campaign_type", "email"),
                "content_sequence": nurture_plan.get("content_sequence", []),
                "frequency": nurture_plan.get("frequency", "weekly"),
                "start_date": datetime.now().isoformat(),
                "duration_days": int(nurture_plan.get("duration_days", 30)),
                "status": "active",
                "sent_count": 0,
                "engagement_rate": 0.0
            }

            self.nurture_campaigns[campaign_id] = campaign
            lead.status = "Nurturing"
            lead.engaged = True
            lead.updated_at = datetime.now().isoformat()

            self.logger.info(f"Nurture campaign created: {campaign_id}")
            return campaign

        except Exception as e:
            self.logger.error(f"Error in nurture_lead: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def update_lead(self, lead_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update lead information and status

        Args:
            lead_id: The lead ID to update
            update_data: Updated lead information

        Returns:
            Dictionary with updated lead
        """
        try:
            self.logger.info(f"Updating lead {lead_id}")

            if lead_id not in self.leads:
                return {"error": f"Lead {lead_id} not found", "status": "failed"}

            lead = self.leads[lead_id]

            # Update fields
            if "name" in update_data:
                lead.name = update_data["name"]
            if "email" in update_data:
                lead.email = update_data["email"]
            if "phone" in update_data:
                lead.phone = update_data["phone"]
            if "company" in update_data:
                lead.company = update_data["company"]
            if "status" in update_data:
                lead.status = update_data["status"]
            if "score" in update_data:
                lead.score = float(update_data["score"])

            lead.last_contacted = update_data.get("last_contacted", lead.last_contacted)
            lead.updated_at = datetime.now().isoformat()

            self.logger.info(f"Lead updated: {lead_id}")
            return asdict(lead)

        except Exception as e:
            self.logger.error(f"Error in update_lead: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def close_lead(self, lead_id: str, closure_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Close a lead (convert to customer or archive)

        Args:
            lead_id: The lead ID to close
            closure_data: Closure reason and details

        Returns:
            Dictionary with closure information
        """
        try:
            self.logger.info(f"Closing lead {lead_id}")

            if lead_id not in self.leads:
                return {"error": f"Lead {lead_id} not found", "status": "failed"}

            lead = self.leads[lead_id]
            closure_date = datetime.now().isoformat()

            closure = {
                "lead_id": lead_id,
                "closed_date": closure_date,
                "closure_reason": closure_data.get("closure_reason", ""),
                "closure_type": closure_data.get("closure_type", "no_interest"),
                "conversion": closure_data.get("conversion", False),
                "notes": closure_data.get("notes", "")
            }

            lead.status = "Closed"
            lead.updated_at = closure_date

            self.logger.info(f"Lead closed: {lead_id} - Type: {closure['closure_type']}")
            return closure

        except Exception as e:
            self.logger.error(f"Error in close_lead: {str(e)}")
            return {"error": str(e), "status": "failed"}


    def analyze_lead_source(self, source_filter: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze lead sources and conversion effectiveness

        Args:
            source_filter: Optional filter by source

        Returns:
            Dictionary with source analysis
        """
        try:
            self.logger.info("Analyzing lead sources")

            sources = {}
            for lead in self.leads.values():
                if source_filter and lead.lead_source != source_filter:
                    continue

                if lead.lead_source not in sources:
                    sources[lead.lead_source] = {
                        "count": 0,
                        "total_score": 0,
                        "qualified_count": 0,
                        "conversion_rate": 0
                    }

                sources[lead.lead_source]["count"] += 1
                sources[lead.lead_source]["total_score"] += lead.score
                if lead.score >= 60:
                    sources[lead.lead_source]["qualified_count"] += 1

            # Calculate conversion rates
            for source_data in sources.values():
                if source_data["count"] > 0:
                    source_data["conversion_rate"] = (source_data["qualified_count"] / source_data["count"]) * 100
                    source_data["average_score"] = source_data["total_score"] / source_data["count"]

            analysis = {
                "timestamp": datetime.now().isoformat(),
                "sources": sources,
                "best_source": max(sources.items(), key=lambda x: x[1]["conversion_rate"])[0] if sources else None,
                "total_leads": len(self.leads)
            }

            self.logger.info("Lead source analysis completed")
            return analysis

        except Exception as e:
            self.logger.error(f"Error in analyze_lead_source: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def generate_lead_report(self, report_type: str = "summary") -> Dict[str, Any]:
        """
        Generate comprehensive lead management report

        Args:
            report_type: Type of report (summary, detailed, source_analysis)

        Returns:
            Dictionary with lead report data
        """
        try:
            self.logger.info(f"Generating {report_type} lead report")

            report = {
                "report_id": f"rep_{datetime.now().timestamp()}",
                "report_type": report_type,
                "generated_at": datetime.now().isoformat(),
                "summary": {
                    "total_leads": len(self.leads),
                    "qualified_leads": len([l for l in self.leads.values() if l.score >= 60]),
                    "average_score": sum(l.score for l in self.leads.values()) / len(self.leads) if self.leads else 0,
                    "by_status": {}
                }
            }

            # Count by status
            for lead in self.leads.values():
                if lead.status not in report["summary"]["by_status"]:
                    report["summary"]["by_status"][lead.status] = 0
                report["summary"]["by_status"][lead.status] += 1

            if report_type in ["detailed", "source_analysis"]:
                report["leads"] = [asdict(l) for l in self.leads.values()]
                report["source_analysis"] = self.analyze_lead_source()

            self.logger.info(f"Lead report generated: {report['report_id']}")
            return report

        except Exception as e:
            self.logger.error(f"Error in generate_lead_report: {str(e)}")
            return {"error": str(e), "status": "failed"}


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute plugin actions"""
    plugin = LeadManagementPlugin()

    actions = {
        "create_lead": lambda: plugin.create_lead(parameters.get("lead_data", {})),
        "score_lead": lambda: plugin.score_lead(
            parameters.get("lead_id", ""),
            parameters.get("scoring_data", {})
        ),
        "assign_lead": lambda: plugin.assign_lead(
            parameters.get("lead_id", ""),
            parameters.get("assignment_data", {})
        ),
        "nurture_lead": lambda: plugin.nurture_lead(
            parameters.get("lead_id", ""),
            parameters.get("nurture_plan", {})
        ),
        "update_lead": lambda: plugin.update_lead(
            parameters.get("lead_id", ""),
            parameters.get("update_data", {})
        ),
        "close_lead": lambda: plugin.close_lead(
            parameters.get("lead_id", ""),
            parameters.get("closure_data", {})
        )
    }

    if action not in actions:
        return {"error": f"Action '{action}' not found", "status": "failed"}

    return actions[action]()
