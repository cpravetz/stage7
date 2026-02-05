#!/usr/bin/env python3
"""
Scenario Analyzer Plugin - Scenario modeling and simulation
"""
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import random

logger = logging.getLogger(__name__)


@dataclass
class Scenario:
    """Scenario model"""
    scenario_id: str
    name: str
    description: str
    type: str
    assumptions: Dict[str, Any]
    variables: Dict[str, float]
    baseline_metrics: Dict[str, float]
    created_at: str
    updated_at: str
    status: str = "created"


@dataclass
class SimulationResult:
    """Simulation result model"""
    simulation_id: str
    scenario_id: str
    variables: Dict[str, float]
    outcomes: Dict[str, Any]
    timestamp: str


class ScenarioAnalyzerPlugin:
    """Scenario Analyzer Plugin - Creates and analyzes business scenarios"""

    def __init__(self):
        """Initialize the Scenario Analyzer Plugin"""
        self.scenarios: Dict[str, Scenario] = {}
        self.simulations: Dict[str, SimulationResult] = {}
        self.comparisons: Dict[str, Dict] = {}
        self.forecasts: Dict[str, Dict] = {}
        self.logger = logging.getLogger(__name__)
        self.logger.info("Scenario Analyzer Plugin initialized")

    def create_scenario(self, scenario_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new business scenario for analysis

        Args:
            scenario_data: Scenario definition and parameters

        Returns:
            Dictionary with created scenario details
        """
        try:
            self.logger.info(f"Creating scenario: {scenario_data.get('name', 'Unknown')}")

            scenario_id = f"scen_{datetime.now().timestamp()}"
            scenario = Scenario(
                scenario_id=scenario_id,
                name=scenario_data.get("name", f"Scenario {scenario_id}"),
                description=scenario_data.get("description", ""),
                type=scenario_data.get("type", "business"),
                assumptions=scenario_data.get("assumptions", {}),
                variables=scenario_data.get("variables", {}),
                baseline_metrics=scenario_data.get("baseline_metrics", {}),
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
                status="created"
            )

            self.scenarios[scenario_id] = scenario
            self.logger.info(f"Scenario created: {scenario_id}")
            return asdict(scenario)

        except Exception as e:
            self.logger.error(f"Error in create_scenario: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def run_simulation(self, scenario_id: str, simulation_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run simulation for a scenario with variable inputs

        Args:
            scenario_id: The scenario ID to simulate
            simulation_params: Simulation parameters and iterations

        Returns:
            Dictionary with simulation results
        """
        try:
            self.logger.info(f"Running simulation for scenario {scenario_id}")

            if scenario_id not in self.scenarios:
                return {"error": f"Scenario {scenario_id} not found", "status": "failed"}

            scenario = self.scenarios[scenario_id]
            simulation_id = f"sim_{scenario_id}_{datetime.now().timestamp()}"
            iterations = simulation_params.get("iterations", 1000)

            results = {
                "outcomes": [],
                "mean_outcomes": {},
                "confidence_intervals": {}
            }

            for i in range(iterations):
                adjusted_vars = {}
                for var, value in scenario.variables.items():
                    variance = simulation_params.get("variance", 0.1)
                    adjusted_vars[var] = value * (1 + random.uniform(-variance, variance))

                outcome = {
                    "iteration": i,
                    "variables": adjusted_vars,
                    "projected_values": self._calculate_outcomes(adjusted_vars)
                }
                results["outcomes"].append(outcome)

            # Calculate statistics
            results["mean_outcomes"] = self._calculate_mean(results["outcomes"])
            results["confidence_intervals"] = self._calculate_confidence_intervals(results["outcomes"])

            sim_result = SimulationResult(
                simulation_id=simulation_id,
                scenario_id=scenario_id,
                variables=scenario.variables,
                outcomes=results,
                timestamp=datetime.now().isoformat()
            )

            self.simulations[simulation_id] = sim_result
            self.logger.info(f"Simulation completed: {simulation_id}")

            return {
                "simulation_id": simulation_id,
                "iterations": iterations,
                "results": results,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            self.logger.error(f"Error in run_simulation: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def compare_scenarios(self, scenario_ids: List[str], comparison_metrics: List[str]) -> Dict[str, Any]:
        """
        Compare multiple scenarios across key metrics

        Args:
            scenario_ids: List of scenario IDs to compare
            comparison_metrics: Metrics to compare

        Returns:
            Dictionary with comparison analysis
        """
        try:
            self.logger.info(f"Comparing {len(scenario_ids)} scenarios")

            comparison_id = f"comp_{datetime.now().timestamp()}"
            comparison_data = {
                "comparison_id": comparison_id,
                "scenarios": {},
                "metrics": comparison_metrics,
                "best_performer": None,
                "recommendation": ""
            }

            best_score = -1
            for scenario_id in scenario_ids:
                if scenario_id not in self.scenarios:
                    continue

                scenario = self.scenarios[scenario_id]
                score = self._calculate_scenario_score(scenario, comparison_metrics)
                comparison_data["scenarios"][scenario_id] = {
                    "name": scenario.name,
                    "variables": scenario.variables,
                    "score": score
                }

                if score > best_score:
                    best_score = score
                    comparison_data["best_performer"] = scenario_id

            comparison_data["recommendation"] = f"Recommend scenario {comparison_data['best_performer']} based on analysis"
            self.comparisons[comparison_id] = comparison_data
            self.logger.info(f"Comparison completed: {comparison_id}")

            return comparison_data

        except Exception as e:
            self.logger.error(f"Error in compare_scenarios: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def analyze_outcomes(self, simulation_id: str, outcome_criteria: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze simulation outcomes against criteria

        Args:
            simulation_id: The simulation ID to analyze
            outcome_criteria: Success criteria and thresholds

        Returns:
            Dictionary with outcome analysis
        """
        try:
            self.logger.info(f"Analyzing outcomes for simulation {simulation_id}")

            if simulation_id not in self.simulations:
                return {"error": f"Simulation {simulation_id} not found", "status": "failed"}

            simulation = self.simulations[simulation_id]
            analysis = {
                "simulation_id": simulation_id,
                "success_rate": 0.0,
                "risk_factors": [],
                "opportunities": [],
                "recommendations": []
            }

            outcomes = simulation.outcomes.get("outcomes", [])
            successful_outcomes = 0

            for outcome in outcomes:
                if self._meets_criteria(outcome.get("projected_values", {}), outcome_criteria):
                    successful_outcomes += 1

            analysis["success_rate"] = (successful_outcomes / len(outcomes)) * 100 if outcomes else 0
            analysis["risk_factors"] = self._identify_risks(outcomes, outcome_criteria)
            analysis["opportunities"] = self._identify_opportunities(outcomes, outcome_criteria)

            if analysis["success_rate"] < 50:
                analysis["recommendations"].append("Consider revising scenario assumptions")
            if analysis["success_rate"] > 80:
                analysis["recommendations"].append("Scenario shows strong potential")

            self.logger.info(f"Outcome analysis completed: {analysis['success_rate']}% success rate")
            return analysis

        except Exception as e:
            self.logger.error(f"Error in analyze_outcomes: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def forecast_results(self, scenario_id: str, forecast_horizon: int) -> Dict[str, Any]:
        """
        Forecast future results based on scenario trends

        Args:
            scenario_id: The scenario ID to forecast
            forecast_horizon: Number of periods to forecast

        Returns:
            Dictionary with forecast projections
        """
        try:
            self.logger.info(f"Forecasting results for scenario {scenario_id}")

            if scenario_id not in self.scenarios:
                return {"error": f"Scenario {scenario_id} not found", "status": "failed"}

            scenario = self.scenarios[scenario_id]
            forecast_id = f"fore_{scenario_id}_{datetime.now().timestamp()}"

            projections = {
                "periods": [],
                "forecast_values": []
            }

            for period in range(forecast_horizon):
                period_values = {}
                for var, value in scenario.variables.items():
                    # Simple linear forecast with growth factor
                    growth_factor = 1.05
                    period_values[var] = value * (growth_factor ** period)

                projections["periods"].append(period + 1)
                projections["forecast_values"].append(period_values)

            forecast = {
                "forecast_id": forecast_id,
                "scenario_id": scenario_id,
                "horizon": forecast_horizon,
                "projections": projections,
                "confidence_level": 0.75,
                "timestamp": datetime.now().isoformat()
            }

            self.forecasts[forecast_id] = forecast
            self.logger.info(f"Forecast completed: {forecast_id}")

            return forecast

        except Exception as e:
            self.logger.error(f"Error in forecast_results: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def suggest_strategy(self, scenario_id: str, business_goals: Dict[str, Any]) -> Dict[str, Any]:
        """
        Suggest optimal strategies based on scenario analysis

        Args:
            scenario_id: The scenario ID to analyze
            business_goals: Business objectives and constraints

        Returns:
            Dictionary with strategy suggestions
        """
        try:
            self.logger.info(f"Suggesting strategy for scenario {scenario_id}")

            if scenario_id not in self.scenarios:
                return {"error": f"Scenario {scenario_id} not found", "status": "failed"}

            scenario = self.scenarios[scenario_id]
            strategies = {
                "scenario_id": scenario_id,
                "recommended_strategies": [],
                "implementation_roadmap": [],
                "success_factors": [],
                "risk_mitigation": []
            }

            # Generate strategy recommendations
            if business_goals.get("growth_target", 0) > 20:
                strategies["recommended_strategies"].append("Aggressive expansion strategy")
            else:
                strategies["recommended_strategies"].append("Sustainable growth strategy")

            strategies["implementation_roadmap"] = [
                {"phase": 1, "duration": "0-3 months", "actions": ["Prepare resources", "Set KPIs"]},
                {"phase": 2, "duration": "3-6 months", "actions": ["Execute initiatives", "Monitor metrics"]},
                {"phase": 3, "duration": "6-12 months", "actions": ["Optimize", "Scale successful initiatives"]}
            ]

            strategies["success_factors"] = [
                "Strong stakeholder alignment",
                "Adequate resource allocation",
                "Regular performance monitoring",
                "Adaptive management approach"
            ]

            strategies["risk_mitigation"] = [
                "Maintain contingency reserves",
                "Establish backup plans",
                "Regular risk assessments"
            ]

            self.logger.info(f"Strategy suggestions completed for {scenario_id}")
            return strategies

        except Exception as e:
            self.logger.error(f"Error in suggest_strategy: {str(e)}")
            return {"error": str(e), "status": "failed"}

    # Helper methods
    def _calculate_outcomes(self, variables: Dict[str, float]) -> Dict[str, float]:
        """Calculate outcomes from variables"""
        outcomes = {}
        for var, value in variables.items():
            outcomes[f"{var}_outcome"] = value * 1.2
        return outcomes

    def _calculate_mean(self, outcomes: List[Dict]) -> Dict[str, float]:
        """Calculate mean outcomes"""
        means = {}
        if not outcomes:
            return means
        
        keys = set()
        for outcome in outcomes:
            for proj_var, proj_val in outcome.get("projected_values", {}).items():
                keys.add(proj_var)

        for key in keys:
            values = [o["projected_values"][key] for o in outcomes if key in o["projected_values"]]
            means[key] = sum(values) / len(values) if values else 0

        return means

    def _calculate_confidence_intervals(self, outcomes: List[Dict]) -> Dict[str, tuple]:
        """Calculate 95% confidence intervals"""
        intervals = {}
        if not outcomes:
            return intervals

        for outcome in outcomes[:1]:
            for var in outcome.get("projected_values", {}):
                values = [o["projected_values"][var] for o in outcomes]
                mean = sum(values) / len(values)
                std_dev = (sum((x - mean) ** 2 for x in values) / len(values)) ** 0.5
                intervals[var] = (mean - 1.96 * std_dev, mean + 1.96 * std_dev)

        return intervals

    def _calculate_scenario_score(self, scenario: Scenario, metrics: List[str]) -> float:
        """Calculate overall scenario score"""
        score = 0
        for metric in metrics:
            if metric in scenario.baseline_metrics:
                score += scenario.baseline_metrics[metric]
        return score / len(metrics) if metrics else 0

    def _meets_criteria(self, outcomes: Dict[str, float], criteria: Dict[str, Any]) -> bool:
        """Check if outcomes meet criteria"""
        for criterion_name, threshold in criteria.items():
            for outcome_name, outcome_value in outcomes.items():
                if criterion_name in outcome_name and outcome_value < threshold:
                    return False
        return True

    def _identify_risks(self, outcomes: List[Dict], criteria: Dict[str, Any]) -> List[str]:
        """Identify risk factors from outcomes"""
        risks = []
        failed_count = sum(1 for o in outcomes if not self._meets_criteria(o.get("projected_values", {}), criteria))
        if failed_count / len(outcomes) > 0.2:
            risks.append("High failure rate detected in simulations")
        return risks

    def _identify_opportunities(self, outcomes: List[Dict], criteria: Dict[str, Any]) -> List[str]:
        """Identify opportunities from outcomes"""
        opportunities = []
        success_count = sum(1 for o in outcomes if self._meets_criteria(o.get("projected_values", {}), criteria))
        if success_count / len(outcomes) > 0.8:
            opportunities.append("Strong potential for positive outcomes")
        return opportunities


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute plugin actions"""
    plugin = ScenarioAnalyzerPlugin()

    actions = {
        "create_scenario": lambda: plugin.create_scenario(parameters.get("scenario_data", {})),
        "run_simulation": lambda: plugin.run_simulation(
            parameters.get("scenario_id", ""),
            parameters.get("simulation_params", {})
        ),
        "compare_scenarios": lambda: plugin.compare_scenarios(
            parameters.get("scenario_ids", []),
            parameters.get("comparison_metrics", [])
        ),
        "analyze_outcomes": lambda: plugin.analyze_outcomes(
            parameters.get("simulation_id", ""),
            parameters.get("outcome_criteria", {})
        ),
        "forecast_results": lambda: plugin.forecast_results(
            parameters.get("scenario_id", ""),
            parameters.get("forecast_horizon", 12)
        ),
        "suggest_strategy": lambda: plugin.suggest_strategy(
            parameters.get("scenario_id", ""),
            parameters.get("business_goals", {})
        )
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
