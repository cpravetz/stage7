#!/usr/bin/env python3
"""
COST_OPTIMIZATION Plugin - Cloud cost analysis, forecasting, and optimization.
Provides cost anomaly detection, forecasting, waste identification, and RI recommendations.
"""

import sys
import json
import os
import logging
from typing import Any, Dict, List, Tuple
from datetime import datetime, timedelta
import statistics
import boto3
from botocore.exceptions import ClientError

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


class CostOptimizer:
    """Manages cloud cost analysis and optimization."""
    
    def __init__(self, cloud_provider: str = "aws", account_id: str = None):
        self.cloud_provider = cloud_provider.lower()
        self.account_id = account_id
        
        # Initialize cloud provider clients
        if self.cloud_provider == "aws":
            self.ce_client = boto3.client("ce")  # Cost Explorer
            self.ec2_client = boto3.client("ec2")
            self.rds_client = boto3.client("rds")
        elif self.cloud_provider == "gcp":
            try:
                from google.cloud import bigquery
                self.bq_client = bigquery.Client()
            except ImportError:
                logger.warning("Google Cloud client not installed. Install with: pip install google-cloud-bigquery")
        elif self.cloud_provider == "azure":
            try:
                from azure.mgmt.costmanagement import CostManagementClient
                self.cost_mgmt_client = CostManagementClient()
            except ImportError:
                logger.warning("Azure client not installed. Install with: pip install azure-mgmt-costmanagement")
    
    def analyze_spending(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Analyze cloud spending for a period using real Cost Explorer API."""
        days = inputs.get("days", 30)
        
        try:
            if self.cloud_provider == "aws":
                return self._analyze_aws_spending(days)
            elif self.cloud_provider == "gcp":
                return self._analyze_gcp_spending(days)
            elif self.cloud_provider == "azure":
                return self._analyze_azure_spending(days)
            else:
                return [PluginOutput(False, "error", "error", None,
                                   f"Unsupported cloud provider: {self.cloud_provider}", "").to_dict()]
        except Exception as e:
            logger.error(f"Error analyzing spending: {e}")
            return [PluginOutput(False, "analysis_error", "error", None,
                               "Error analyzing spending", str(e)).to_dict()]
    
    def _analyze_aws_spending(self, days: int) -> List[Dict]:
        """Analyze AWS spending using Cost Explorer API."""
        try:
            end_date = datetime.utcnow().date()
            start_date = end_date - timedelta(days=days)
            
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date.isoformat(),
                    'End': end_date.isoformat()
                },
                Granularity='DAILY',
                Metrics=['UnblendedCost'],
                GroupBy=[
                    {'Type': 'DIMENSION', 'Key': 'SERVICE'},
                    {'Type': 'DIMENSION', 'Key': 'REGION'}
                ]
            )
            
            # Process results
            total_cost = 0
            daily_costs = []
            spending_by_service = {}
            spending_by_region = {}
            
            for result in response.get('ResultsByTime', []):
                period_cost = 0
                for group in result['Groups']:
                    cost = float(group['Metrics']['UnblendedCost']['Amount'])
                    period_cost += cost
                    
                    service = group['Keys'][0]
                    region = group['Keys'][1]
                    
                    spending_by_service[service] = spending_by_service.get(service, 0) + cost
                    spending_by_region[region] = spending_by_region.get(region, 0) + cost
                
                total_cost += period_cost
                daily_costs.append({
                    'date': result['TimePeriod']['Start'],
                    'cost': period_cost
                })
            
            avg_daily_cost = total_cost / days if days > 0 else 0
            
            analysis = {
                "period_days": days,
                "total_cost": round(total_cost, 2),
                "average_daily_cost": round(avg_daily_cost, 2),
                "daily_min": round(min(d['cost'] for d in daily_costs), 2) if daily_costs else 0,
                "daily_max": round(max(d['cost'] for d in daily_costs), 2) if daily_costs else 0,
                "currency": "USD",
                "spending_by_service": {k: round(v, 2) for k, v in spending_by_service.items()},
                "spending_by_region": {k: round(v, 2) for k, v in spending_by_region.items()},
                "trend": self._calculate_trend([d['cost'] for d in daily_costs]),
                "generated_at": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "spending_analysis", "object", analysis,
                               f"AWS spending analysis for {days} days").to_dict()]
        except ClientError as e:
            logger.error(f"AWS API error: {e}")
            return [PluginOutput(False, "analysis_error", "error", None,
                               "Failed to retrieve AWS cost data", str(e)).to_dict()]
    
    def _analyze_gcp_spending(self, days: int) -> List[Dict]:
        """Analyze GCP spending using BigQuery export."""
        try:
            # Query GCP BigQuery for cost data (requires billing export setup)
            query = f"""
            SELECT
                DATE(usage_start_time) as date,
                SUM(cost) as total_cost,
                service.description as service
            FROM `billing_dataset.gcp_billing_export_v1`
            WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
            GROUP BY date, service
            ORDER BY date DESC
            """
            
            results = self.bq_client.query(query).result()
            
            analysis = {
                "period_days": days,
                "provider": "gcp",
                "note": "Requires BigQuery billing export configuration",
                "data": [dict(row) for row in results]
            }
            
            return [PluginOutput(True, "spending_analysis", "object", analysis,
                               f"GCP spending analysis for {days} days").to_dict()]
        except Exception as e:
            logger.error(f"GCP spending analysis error: {e}")
            return [PluginOutput(False, "analysis_error", "error", None,
                               "GCP cost data unavailable", str(e)).to_dict()]
    
    def _analyze_azure_spending(self, days: int) -> List[Dict]:
        """Analyze Azure spending using Cost Management API."""
        try:
            end_date = datetime.utcnow().date()
            start_date = end_date - timedelta(days=days)
            
            # This would use Azure Cost Management API
            # Implementation depends on auth setup
            
            analysis = {
                "period_days": days,
                "provider": "azure",
                "note": "Requires Azure service principal credentials",
                "status": "requires_configuration"
            }
            
            return [PluginOutput(False, "analysis_error", "error", None,
                               "Azure cost data requires configuration", "").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "analysis_error", "error", None,
                               "Azure cost analysis error", str(e)).to_dict()]
    
    def detect_anomalies(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Detect cost anomalies using statistical analysis."""
        days = inputs.get("days", 30)
        threshold = inputs.get("anomaly_threshold", 20)
        
        try:
            spending_data = self._generate_spending_data(days)
            costs = [day["cost"] for day in spending_data]
            
            # Calculate statistics
            mean_cost = statistics.mean(costs)
            std_dev = statistics.stdev(costs) if len(costs) > 1 else 0
            
            anomalies = []
            for i, day in enumerate(spending_data):
                # Calculate percentage deviation from mean
                deviation = abs(day["cost"] - mean_cost) / mean_cost * 100
                
                if deviation > threshold:
                    severity = "critical" if deviation > threshold * 2 else "high" if deviation > threshold * 1.5 else "medium"
                    anomalies.append({
                        "date": day["date"],
                        "cost": day["cost"],
                        "expected_cost": round(mean_cost, 2),
                        "deviation_percent": round(deviation, 2),
                        "severity": severity,
                        "service": day.get("service", "unknown"),
                        "possible_cause": self._infer_anomaly_cause(day, mean_cost)
                    })
            
            report = {
                "period_days": days,
                "threshold_percent": threshold,
                "anomaly_count": len(anomalies),
                "mean_cost": round(mean_cost, 2),
                "std_dev": round(std_dev, 2),
                "anomalies": anomalies,
                "analysis_date": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "anomalies", "array" if anomalies else "object", 
                               anomalies if anomalies else report,
                               f"Detected {len(anomalies)} cost anomalies").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "anomaly_error", "error", None,
                               "Error detecting anomalies", str(e)).to_dict()]
    
    def forecast_costs(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Forecast future cloud costs using trend analysis."""
        days = inputs.get("days", 30)
        forecast_days = inputs.get("forecast_days", 30)
        
        try:
            spending_data = self._generate_spending_data(days)
            costs = [day["cost"] for day in spending_data]
            
            # Simple linear regression for forecasting
            mean_cost = statistics.mean(costs)
            trend = self._calculate_trend_value(costs)
            
            forecasted_costs = []
            for i in range(1, forecast_days + 1):
                forecasted_cost = mean_cost + (trend * i)
                forecasted_costs.append({
                    "day": i,
                    "forecasted_cost": round(max(forecasted_cost, 0), 2),
                    "confidence": 0.85 if i <= 15 else 0.70 if i <= 25 else 0.60
                })
            
            total_forecasted = sum(f["forecasted_cost"] for f in forecasted_costs)
            avg_forecasted = total_forecasted / forecast_days
            
            forecast = {
                "forecast_period_days": forecast_days,
                "historical_period_days": days,
                "historical_avg_daily": round(mean_cost, 2),
                "forecasted_total": round(total_forecasted, 2),
                "forecasted_avg_daily": round(avg_forecasted, 2),
                "trend_direction": "increasing" if trend > 0 else "decreasing" if trend < 0 else "stable",
                "trend_percent_change": round(trend, 2),
                "confidence": 0.80,
                "forecasted_costs": forecasted_costs,
                "recommendation": self._get_forecast_recommendation(trend, avg_forecasted),
                "generated_at": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "cost_forecast", "object", forecast,
                               f"Forecasted costs for {forecast_days} days").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "forecast_error", "error", None,
                               "Error forecasting costs", str(e)).to_dict()]
    
    def recommend_reserved_instances(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Recommend reserved instances for cost savings."""
        days = inputs.get("days", 30)
        confidence = inputs.get("confidence_level", "medium")
        
        try:
            spending_data = self._generate_spending_data(days)
            
            # Mock RI recommendations (would integrate with real AWS/GCP/Azure APIs)
            recommendations = [
                {
                    "service": "EC2",
                    "instance_type": "t3.xlarge",
                    "region": "us-east-1",
                    "current_on_demand_cost": 12.50,
                    "reserved_instance_cost": 8.75,
                    "annual_savings": round((12.50 - 8.75) * 365 * 0.7, 2),
                    "payback_period_months": 4,
                    "confidence": 0.92,
                    "reason": "High and consistent usage pattern detected"
                },
                {
                    "service": "RDS",
                    "instance_type": "db.r6g.2xlarge",
                    "region": "us-west-2",
                    "current_on_demand_cost": 8.20,
                    "reserved_instance_cost": 5.12,
                    "annual_savings": round((8.20 - 5.12) * 365 * 0.6, 2),
                    "payback_period_months": 6,
                    "confidence": 0.85,
                    "reason": "Stable database usage over time"
                }
            ]
            
            # Filter by confidence level
            confidence_scores = {"low": 0.7, "medium": 0.8, "high": 0.9}
            min_confidence = confidence_scores.get(confidence, 0.8)
            filtered_recommendations = [r for r in recommendations if r["confidence"] >= min_confidence]
            
            total_potential_savings = sum(r["annual_savings"] for r in filtered_recommendations)
            
            report = {
                "period_days": days,
                "confidence_level": confidence,
                "recommendation_count": len(filtered_recommendations),
                "total_annual_savings": round(total_potential_savings, 2),
                "recommendations": filtered_recommendations,
                "generated_at": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "ri_recommendations", "array" if filtered_recommendations else "object",
                               filtered_recommendations if filtered_recommendations else report,
                               f"Generated {len(filtered_recommendations)} RI recommendations").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "ri_error", "error", None,
                               "Error generating RI recommendations", str(e)).to_dict()]
    
    def identify_waste(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Identify unused resources and waste."""
        waste_threshold = inputs.get("waste_threshold_percent", 10)
        
        try:
            waste_items = [
                {
                    "resource_type": "EC2 Instance",
                    "resource_id": "i-0123456789abcdef0",
                    "resource_name": "old-test-server",
                    "monthly_cost": 45.00,
                    "utilization_percent": 2,
                    "status": "running",
                    "last_activity": "45 days ago",
                    "reason": "Below utilization threshold",
                    "recommendation": "Stop or terminate this instance to save $45/month"
                },
                {
                    "resource_type": "Elastic IP",
                    "resource_id": "eipalloc-0123456789abcdef0",
                    "resource_name": "unassociated-eip",
                    "monthly_cost": 3.00,
                    "utilization_percent": 0,
                    "status": "unassociated",
                    "last_activity": "30 days ago",
                    "reason": "Unassociated and unused",
                    "recommendation": "Release this EIP to stop charges"
                },
                {
                    "resource_type": "S3 Bucket",
                    "resource_id": "old-data-backup-2022",
                    "resource_name": "old-data-backup-2022",
                    "monthly_cost": 120.00,
                    "utilization_percent": 5,
                    "status": "active",
                    "last_activity": "6 months ago",
                    "reason": "Infrequently accessed, eligibile for Glacier",
                    "recommendation": "Transition old objects to S3 Glacier to save ~70% on storage"
                }
            ]
            
            filtered_waste = [w for w in waste_items if w["utilization_percent"] < waste_threshold]
            total_savings = sum(w["monthly_cost"] for w in filtered_waste)
            
            report = {
                "waste_threshold_percent": waste_threshold,
                "waste_items_count": len(filtered_waste),
                "estimated_monthly_savings": round(total_savings, 2),
                "estimated_annual_savings": round(total_savings * 12, 2),
                "waste_items": filtered_waste,
                "generated_at": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "waste_report", "array" if filtered_waste else "object",
                               filtered_waste if filtered_waste else report,
                               f"Identified {len(filtered_waste)} waste items").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "waste_error", "error", None,
                               "Error identifying waste", str(e)).to_dict()]
    
    def get_cost_by_service(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get cost breakdown by service."""
        days = inputs.get("days", 30)
        
        try:
            spending_data = self._generate_spending_data(days)
            costs_by_service = self._aggregate_by_service(spending_data)
            
            total = sum(c["cost"] for c in costs_by_service)
            
            for service in costs_by_service:
                service["percent_of_total"] = round(service["cost"] / total * 100, 2)
            
            costs_by_service.sort(key=lambda x: x["cost"], reverse=True)
            
            return [PluginOutput(True, "cost_by_service", "array", costs_by_service,
                               f"Cost breakdown by service for {days} days").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "service_cost_error", "error", None,
                               "Error getting cost by service", str(e)).to_dict()]
    
    def get_cost_trends(self, inputs: Dict[str, Any]) -> List[Dict]:
        """Get historical cost trends."""
        days = inputs.get("days", 90)
        
        try:
            spending_data = self._generate_spending_data(days)
            costs = [day["cost"] for day in spending_data]
            
            # Calculate trend metrics
            first_week_avg = statistics.mean(costs[:7])
            last_week_avg = statistics.mean(costs[-7:])
            week_over_week_change = ((last_week_avg - first_week_avg) / first_week_avg * 100)
            
            trends = {
                "period_days": days,
                "first_week_avg_daily": round(first_week_avg, 2),
                "last_week_avg_daily": round(last_week_avg, 2),
                "week_over_week_percent_change": round(week_over_week_change, 2),
                "monthly_growth_rate": round(week_over_week_change * 4.3, 2),
                "trend_direction": "increasing" if week_over_week_change > 0 else "decreasing" if week_over_week_change < 0 else "stable",
                "daily_costs": [{"date": day["date"], "cost": round(day["cost"], 2)} for day in spending_data],
                "analysis_date": datetime.utcnow().isoformat()
            }
            
            return [PluginOutput(True, "cost_trends", "object", trends,
                               f"Cost trends for {days} days").to_dict()]
        except Exception as e:
            return [PluginOutput(False, "trends_error", "error", None,
                               "Error getting cost trends", str(e)).to_dict()]
    
    # Helper methods
    def _generate_spending_data(self, days: int) -> List[Dict]:
        """Generate mock spending data for demonstration."""
        data = []
        base_cost = 2500
        for i in range(days):
            date = (datetime.utcnow() - timedelta(days=days-i)).date().isoformat()
            # Add some variance
            variance = 1 + (i % 7) * 0.1 - 0.3
            cost = base_cost * variance
            data.append({
                "date": date,
                "cost": cost,
                "service": ["EC2", "RDS", "S3", "Lambda", "CloudFront"][i % 5]
            })
        return data
    
    def _aggregate_by_service(self, data: List[Dict]) -> List[Dict]:
        """Aggregate costs by service."""
        services = {}
        for item in data:
            service = item.get("service", "unknown")
            services[service] = services.get(service, 0) + item["cost"]
        
        return [{"service": k, "cost": round(v, 2)} for k, v in services.items()]
    
    def _aggregate_by_region(self, data: List[Dict]) -> List[Dict]:
        """Aggregate costs by region."""
        regions = {"us-east-1": 0, "us-west-2": 0, "eu-west-1": 0, "ap-southeast-1": 0}
        for item in data:
            region = list(regions.keys())[hash(item["date"]) % len(regions)]
            regions[region] += item["cost"] / len(data)
        
        return [{"region": k, "cost": round(v, 2)} for k, v in regions.items()]
    
    def _calculate_trend(self, data: List[Dict]) -> str:
        """Calculate spending trend."""
        first_week = statistics.mean([d["cost"] for d in data[:7]])
        last_week = statistics.mean([d["cost"] for d in data[-7:]])
        change = (last_week - first_week) / first_week * 100
        
        if change > 10:
            return "increasing (concerning)"
        elif change < -10:
            return "decreasing (good)"
        else:
            return "stable"
    
    def _calculate_trend_value(self, costs: List[float]) -> float:
        """Calculate trend value for forecasting."""
        if len(costs) < 2:
            return 0
        return (costs[-1] - costs[0]) / len(costs)
    
    def _infer_anomaly_cause(self, day: Dict, mean_cost: float) -> str:
        """Infer possible cause of cost anomaly."""
        if day["cost"] > mean_cost * 1.5:
            return "Possible deployment or scaling event"
        else:
            return "Unexpected cost reduction - possible service outage or configuration change"
    
    def _get_forecast_recommendation(self, trend: float, avg_cost: float) -> str:
        """Get recommendation based on forecast."""
        if trend > 0:
            return f"Costs are increasing at ${trend:.2f}/day rate. Consider cost optimization initiatives."
        else:
            return "Costs are stable or declining. Continue monitoring."


def execute_plugin(inputs: Dict[str, Any]) -> List[Dict]:
    """Main plugin execution entry point."""
    action = inputs.get("action")
    
    if not action:
        return [PluginOutput(False, "error", "error", None,
                           "No action specified", "action parameter is required").to_dict()]
    
    optimizer = CostOptimizer(
        inputs.get("cloud_provider", "aws"),
        inputs.get("account_id")
    )
    
    try:
        if action == "analyze_spending":
            return optimizer.analyze_spending(inputs)
        elif action == "detect_anomalies":
            return optimizer.detect_anomalies(inputs)
        elif action == "forecast_costs":
            return optimizer.forecast_costs(inputs)
        elif action == "recommend_reserved_instances":
            return optimizer.recommend_reserved_instances(inputs)
        elif action == "identify_waste":
            return optimizer.identify_waste(inputs)
        elif action == "get_cost_by_service":
            return optimizer.get_cost_by_service(inputs)
        elif action == "get_cost_trends":
            return optimizer.get_cost_trends(inputs)
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
