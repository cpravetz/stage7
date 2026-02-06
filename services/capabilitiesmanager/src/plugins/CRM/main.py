#!/usr/bin/env python3
"""
CRM Plugin - Customer relationship management with sales pipeline
"""
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class Customer:
    """Customer model"""
    customer_id: str
    name: str
    email: str
    phone: str
    company: str
    industry: str
    status: str
    created_at: str
    updated_at: str
    lifetime_value: float = 0.0


@dataclass
class Lead:
    """Lead model"""
    lead_id: str
    name: str
    company: str
    email: str
    phone: str
    source: str
    status: str
    score: float
    created_at: str


@dataclass
class Opportunity:
    """Sales opportunity model"""
    opportunity_id: str
    lead_id: str
    deal_name: str
    amount: float
    stage: str
    probability: float
    expected_close_date: str
    owner: str
    created_at: str


@dataclass
class Deal:
    """Closed deal model"""
    deal_id: str
    opportunity_id: str
    customer_id: str
    amount: float
    close_date: str
    status: str
    created_at: str


class CRMPlugin:
    """CRM Plugin - Manages customer relationships and sales pipeline"""

    def __init__(self):
        """Initialize the CRM Plugin"""
        self.customers: Dict[str, Customer] = {}
        self.leads: Dict[str, Lead] = {}
        self.opportunities: Dict[str, Opportunity] = {}
        self.deals: Dict[str, Deal] = {}
        self.interactions: Dict[str, List[Dict]] = {}
        self.pipeline_stages: List[str] = [
            "Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"
        ]
        self.logger = logging.getLogger(__name__)
        self.logger.info("CRM Plugin initialized")

    def manage_leads(self, lead_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Manage and organize leads in the system

        Args:
            lead_list: List of lead information

        Returns:
            Dictionary with lead management results
        """
        try:
            self.logger.info(f"Managing {len(lead_list)} leads")

            results = {
                "leads_added": 0,
                "leads_updated": 0,
                "total_leads": 0,
                "leads": []
            }

            for lead_data in lead_list:
                lead_id = lead_data.get("lead_id", f"lead_{datetime.now().timestamp()}")

                lead = Lead(
                    lead_id=lead_id,
                    name=lead_data.get("name", ""),
                    company=lead_data.get("company", ""),
                    email=lead_data.get("email", ""),
                    phone=lead_data.get("phone", ""),
                    source=lead_data.get("source", "Unknown"),
                    status=lead_data.get("status", "New"),
                    score=float(lead_data.get("score", 0.0)),
                    created_at=datetime.now().isoformat()
                )

                if lead_id not in self.leads:
                    results["leads_added"] += 1
                else:
                    results["leads_updated"] += 1

                self.leads[lead_id] = lead
                results["leads"].append(asdict(lead))

            results["total_leads"] = len(self.leads)
            self.logger.info(f"Lead management completed: {results['leads_added']} added, {results['leads_updated']} updated")
            return results

        except Exception as e:
            self.logger.error(f"Error in manage_leads: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def track_customer(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Track and manage customer information

        Args:
            customer_data: Customer details and attributes

        Returns:
            Dictionary with customer information
        """
        try:
            self.logger.info(f"Tracking customer: {customer_data.get('name', 'Unknown')}")

            customer_id = customer_data.get("customer_id", f"cust_{datetime.now().timestamp()}")

            customer = Customer(
                customer_id=customer_id,
                name=customer_data.get("name", ""),
                email=customer_data.get("email", ""),
                phone=customer_data.get("phone", ""),
                company=customer_data.get("company", ""),
                industry=customer_data.get("industry", ""),
                status=customer_data.get("status", "Active"),
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                lifetime_value=float(customer_data.get("lifetime_value", 0.0))
            )

            self.customers[customer_id] = customer

            # Track interaction
            if customer_id not in self.interactions:
                self.interactions[customer_id] = []

            self.interactions[customer_id].append({
                "timestamp": datetime.now().isoformat(),
                "type": customer_data.get("interaction_type", "creation"),
                "notes": customer_data.get("notes", "")
            })

            self.logger.info(f"Customer tracked: {customer_id}")
            return asdict(customer)

        except Exception as e:
            self.logger.error(f"Error in track_customer: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def update_opportunity(self, opportunity_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update sales opportunity details and status

        Args:
            opportunity_id: The opportunity ID
            update_data: Updated opportunity information

        Returns:
            Dictionary with updated opportunity
        """
        try:
            self.logger.info(f"Updating opportunity {opportunity_id}")

            if opportunity_id not in self.opportunities:
                return {"error": f"Opportunity {opportunity_id} not found", "status": "failed"}

            opp = self.opportunities[opportunity_id]
            opp.stage = update_data.get("stage", opp.stage)
            opp.amount = float(update_data.get("amount", opp.amount))
            opp.probability = float(update_data.get("probability", opp.probability))
            opp.expected_close_date = update_data.get("expected_close_date", opp.expected_close_date)

            result = asdict(opp)
            self.logger.info(f"Opportunity updated: {opportunity_id}")
            return result

        except Exception as e:
            self.logger.error(f"Error in update_opportunity: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def create_deal(self, deal_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new closed deal record

        Args:
            deal_data: Deal details and amounts

        Returns:
            Dictionary with created deal
        """
        try:
            self.logger.info(f"Creating deal: {deal_data.get('deal_name', 'Unknown')}")

            deal_id = f"deal_{datetime.now().timestamp()}"
            opportunity_id = deal_data.get("opportunity_id", "")

            deal = Deal(
                deal_id=deal_id,
                opportunity_id=opportunity_id,
                customer_id=deal_data.get("customer_id", ""),
                amount=float(deal_data.get("amount", 0.0)),
                close_date=deal_data.get("close_date", datetime.now().isoformat()),
                status="Closed Won",
                created_at=datetime.now().isoformat()
            )

            self.deals[deal_id] = deal

            # Update customer lifetime value if customer exists
            if deal.customer_id in self.customers:
                self.customers[deal.customer_id].lifetime_value += deal.amount

            self.logger.info(f"Deal created: {deal_id}")
            return asdict(deal)

        except Exception as e:
            self.logger.error(f"Error in create_deal: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def get_pipeline(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Get current sales pipeline overview

        Args:
            filters: Optional filters for pipeline

        Returns:
            Dictionary with pipeline analysis
        """
        try:
            self.logger.info("Retrieving sales pipeline")

            pipeline = {
                "timestamp": datetime.now().isoformat(),
                "total_opportunities": len(self.opportunities),
                "pipeline_by_stage": {},
                "total_pipeline_value": 0.0,
                "opportunities": []
            }

            for stage in self.pipeline_stages:
                stage_opps = [o for o in self.opportunities.values() if o.stage == stage]
                pipeline["pipeline_by_stage"][stage] = {
                    "count": len(stage_opps),
                    "value": sum(o.amount for o in stage_opps),
                    "opportunities": [asdict(o) for o in stage_opps]
                }
                pipeline["total_pipeline_value"] += pipeline["pipeline_by_stage"][stage]["value"]

            pipeline["opportunities"] = [asdict(o) for o in self.opportunities.values()]
            self.logger.info(f"Pipeline retrieved: ${pipeline['total_pipeline_value']} in {pipeline['total_opportunities']} opportunities")
            return pipeline

        except Exception as e:
            self.logger.error(f"Error in get_pipeline: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def forecast_revenue(self, forecast_period: str = "monthly") -> Dict[str, Any]:
        """
        Forecast revenue based on pipeline and probabilities

        Args:
            forecast_period: Period for forecast (weekly, monthly, quarterly)

        Returns:
            Dictionary with revenue forecast
        """
        try:
            self.logger.info(f"Forecasting revenue for {forecast_period}")

            forecast = {
                "period": forecast_period,
                "forecast_date": datetime.now().isoformat(),
                "total_pipeline_value": 0.0,
                "weighted_forecast": 0.0,
                "conservative_forecast": 0.0,
                "optimistic_forecast": 0.0,
                "by_stage": {}
            }

            for stage in self.pipeline_stages:
                stage_opps = [o for o in self.opportunities.values() if o.stage == stage]
                stage_value = sum(o.amount for o in stage_opps)
                stage_weighted = sum(o.amount * o.probability for o in stage_opps)

                forecast["by_stage"][stage] = {
                    "opportunities": len(stage_opps),
                    "total_value": stage_value,
                    "weighted_value": stage_weighted
                }

                forecast["total_pipeline_value"] += stage_value
                forecast["weighted_forecast"] += stage_weighted

            # Calculate scenario forecasts
            forecast["conservative_forecast"] = forecast["weighted_forecast"] * 0.7
            forecast["optimistic_forecast"] = forecast["weighted_forecast"] * 1.3

            # Add closed deals
            closed_deals_value = sum(d.amount for d in self.deals.values())
            forecast["closed_deals_value"] = closed_deals_value

            self.logger.info(f"Revenue forecast completed: ${forecast['weighted_forecast']} weighted")
            return forecast

        except Exception as e:
            self.logger.error(f"Error in forecast_revenue: {str(e)}")
            return {"error": str(e), "status": "failed"}


    def analyze_customer_segment(self, segment_criteria: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze customer segments and characteristics

        Args:
            segment_criteria: Criteria for customer segmentation

        Returns:
            Dictionary with segment analysis
        """
        try:
            self.logger.info("Analyzing customer segments")

            segments = {
                "enterprise": [],
                "mid_market": [],
                "small_business": [],
                "high_value": [],
                "at_risk": []
            }

            for customer in self.customers.values():
                if customer.lifetime_value > 100000:
                    segments["high_value"].append(customer.customer_id)
                if customer.lifetime_value > 50000:
                    segments["enterprise"].append(customer.customer_id)
                if customer.status == "At Risk":
                    segments["at_risk"].append(customer.customer_id)

            analysis = {
                "timestamp": datetime.now().isoformat(),
                "total_customers": len(self.customers),
                "segments": segments,
                "segment_sizes": {k: len(v) for k, v in segments.items()},
                "total_revenue": sum(c.lifetime_value for c in self.customers.values())
            }

            self.logger.info(f"Customer segmentation completed")
            return analysis

        except Exception as e:
            self.logger.error(f"Error in analyze_customer_segment: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def calculate_customer_health(self, customer_id: str, health_metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate customer health score and churn risk

        Args:
            customer_id: The customer ID
            health_metrics: Health assessment metrics

        Returns:
            Dictionary with health analysis
        """
        try:
            self.logger.info(f"Calculating health for customer {customer_id}")

            if customer_id not in self.customers:
                return {"error": f"Customer {customer_id} not found", "status": "failed"}

            customer = self.customers[customer_id]

            # Calculate health score
            engagement_score = float(health_metrics.get("engagement_score", 50))
            satisfaction_score = float(health_metrics.get("satisfaction_score", 50))
            payment_score = float(health_metrics.get("payment_score", 50))

            health_score = (engagement_score * 0.4 + satisfaction_score * 0.4 + payment_score * 0.2)
            health_score = min(100, max(0, health_score))

            # Determine churn risk
            if health_score < 40:
                churn_risk = "HIGH"
                recommended_action = "Immediate intervention required"
            elif health_score < 60:
                churn_risk = "MEDIUM"
                recommended_action = "Monitor closely and increase engagement"
            else:
                churn_risk = "LOW"
                recommended_action = "Maintain relationship"

            health = {
                "customer_id": customer_id,
                "health_score": health_score,
                "engagement": engagement_score,
                "satisfaction": satisfaction_score,
                "payment_health": payment_score,
                "churn_risk": churn_risk,
                "recommended_action": recommended_action,
                "assessed_at": datetime.now().isoformat()
            }

            self.logger.info(f"Health calculated: {health_score}/100")
            return health

        except Exception as e:
            self.logger.error(f"Error in calculate_customer_health: {str(e)}")
            return {"error": str(e), "status": "failed"}


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute plugin actions"""
    plugin = CRMPlugin()

    # Initialize sample data
    plugin.opportunities["opp_001"] = Opportunity(
        opportunity_id="opp_001",
        lead_id="lead_001",
        deal_name="Enterprise Deal",
        amount=50000,
        stage="Proposal",
        probability=0.6,
        expected_close_date="2026-03-31",
        owner="Sales Team",
        created_at=datetime.now().isoformat()
    )

    actions = {
        "manage_leads": lambda: plugin.manage_leads(parameters.get("lead_list", [])),
        "track_customer": lambda: plugin.track_customer(parameters.get("customer_data", {})),
        "update_opportunity": lambda: plugin.update_opportunity(
            parameters.get("opportunity_id", ""),
            parameters.get("update_data", {})
        ),
        "create_deal": lambda: plugin.create_deal(parameters.get("deal_data", {})),
        "get_pipeline": lambda: plugin.get_pipeline(parameters.get("filters")),
        "forecast_revenue": lambda: plugin.forecast_revenue(parameters.get("forecast_period", "monthly"))
    }

    if action not in actions:
        return {"error": f"Action '{action}' not found", "status": "failed"}

    return actions[action]()
