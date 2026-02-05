#!/usr/bin/env python3
"""
Decision Support Plugin - Decision analysis and recommendation engine
"""
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class DecisionOption:
    """Decision option model"""
    option_id: str
    name: str
    description: str
    pros: List[str]
    cons: List[str]
    estimated_cost: float
    estimated_benefit: float
    risk_level: str
    timeline: str
    created_at: str


@dataclass
class DecisionRecord:
    """Decision record model"""
    decision_id: str
    option_selected: str
    date_decided: str
    decision_maker: str
    rationale: str
    expected_outcome: str
    actual_outcome: Optional[str] = None
    effectiveness_score: float = 0.0


class DecisionSupportPlugin:
    """Decision Support Plugin - Provides decision analysis and recommendations"""

    def __init__(self):
        """Initialize the Decision Support Plugin"""
        self.options: Dict[str, DecisionOption] = {}
        self.evaluations: Dict[str, Dict] = {}
        self.scoring_models: Dict[str, Dict] = {}
        self.recommendations: Dict[str, Dict] = {}
        self.decision_history: List[DecisionRecord] = []
        self.outcome_tracking: Dict[str, Dict] = {}
        self.logger = logging.getLogger(__name__)
        self.logger.info("Decision Support Plugin initialized")

    def list_options(self, decision_context: str, criteria: List[str]) -> Dict[str, Any]:
        """
        List and organize available decision options

        Args:
            decision_context: The decision context or scenario
            criteria: List of evaluation criteria

        Returns:
            Dictionary with available options
        """
        try:
            self.logger.info(f"Listing options for context: {decision_context}")

            result = {
                "context": decision_context,
                "criteria": criteria,
                "options": [],
                "total_options": len(self.options)
            }

            for option_id, option in self.options.items():
                result["options"].append({
                    "option_id": option_id,
                    "name": option.name,
                    "description": option.description,
                    "pros_count": len(option.pros),
                    "cons_count": len(option.cons)
                })

            self.logger.info(f"Listed {len(result['options'])} options")
            return result

        except Exception as e:
            self.logger.error(f"Error in list_options: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def evaluate_option(self, option_id: str, evaluation_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate a specific decision option

        Args:
            option_id: The option ID to evaluate
            evaluation_data: Evaluation parameters and weights

        Returns:
            Dictionary with evaluation results
        """
        try:
            self.logger.info(f"Evaluating option {option_id}")

            if option_id not in self.options:
                # Create sample option if not found
                self.options[option_id] = DecisionOption(
                    option_id=option_id,
                    name=evaluation_data.get("name", f"Option {option_id}"),
                    description=evaluation_data.get("description", ""),
                    pros=evaluation_data.get("pros", []),
                    cons=evaluation_data.get("cons", []),
                    estimated_cost=float(evaluation_data.get("estimated_cost", 0)),
                    estimated_benefit=float(evaluation_data.get("estimated_benefit", 0)),
                    risk_level=evaluation_data.get("risk_level", "MEDIUM"),
                    timeline=evaluation_data.get("timeline", ""),
                    created_at=datetime.now().isoformat()
                )

            option = self.options[option_id]
            evaluation = {
                "option_id": option_id,
                "name": option.name,
                "evaluation_date": datetime.now().isoformat(),
                "pros": option.pros,
                "cons": option.cons,
                "cost_benefit_ratio": option.estimated_benefit / option.estimated_cost if option.estimated_cost > 0 else 0,
                "risk_assessment": option.risk_level,
                "implementation_timeline": option.timeline,
                "constraints": evaluation_data.get("constraints", []),
                "dependencies": evaluation_data.get("dependencies", [])
            }

            self.evaluations[option_id] = evaluation
            self.logger.info(f"Option evaluation completed: {option_id}")
            return evaluation

        except Exception as e:
            self.logger.error(f"Error in evaluate_option: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def calculate_scores(self, option_ids: List[str], scoring_criteria: Dict[str, float]) -> Dict[str, Any]:
        """
        Calculate decision scores for multiple options

        Args:
            option_ids: List of option IDs to score
            scoring_criteria: Criteria and their weights

        Returns:
            Dictionary with scored options
        """
        try:
            self.logger.info(f"Calculating scores for {len(option_ids)} options")

            scoring_model_id = f"score_{datetime.now().timestamp()}"
            results = {
                "scoring_model_id": scoring_model_id,
                "criteria": scoring_criteria,
                "option_scores": [],
                "ranked_options": []
            }

            for option_id in option_ids:
                if option_id not in self.options:
                    continue

                option = self.options[option_id]
                score = self._calculate_weighted_score(option, scoring_criteria)

                results["option_scores"].append({
                    "option_id": option_id,
                    "name": option.name,
                    "score": score,
                    "max_possible_score": 100
                })

            # Sort by score
            results["option_scores"].sort(key=lambda x: x["score"], reverse=True)
            results["ranked_options"] = [opt["option_id"] for opt in results["option_scores"]]

            self.scoring_models[scoring_model_id] = results
            self.logger.info(f"Scoring completed: {scoring_model_id}")
            return results

        except Exception as e:
            self.logger.error(f"Error in calculate_scores: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def recommend_decision(self, decision_context: str, constraints: Dict[str, Any], preferences: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate recommendation for the best decision

        Args:
            decision_context: The decision context or scenario
            constraints: Constraints and limitations
            preferences: Stakeholder preferences

        Returns:
            Dictionary with recommendation
        """
        try:
            self.logger.info(f"Generating recommendation for: {decision_context}")

            recommendation_id = f"rec_{datetime.now().timestamp()}"

            if not self.options:
                return {
                    "recommendation_id": recommendation_id,
                    "status": "no_options_available",
                    "message": "No options available for evaluation"
                }

            # Calculate weighted recommendation
            best_option = None
            best_score = -1

            for option_id, option in self.options.items():
                score = self._calculate_recommendation_score(option, constraints, preferences)
                if score > best_score:
                    best_score = score
                    best_option = option_id

            recommendation = {
                "recommendation_id": recommendation_id,
                "decision_context": decision_context,
                "recommended_option": best_option,
                "confidence_score": min(best_score / 100, 1.0),
                "rationale": self._generate_rationale(best_option, constraints, preferences),
                "next_steps": [
                    "Review recommendation with stakeholders",
                    "Develop implementation plan",
                    "Allocate resources",
                    "Set success metrics"
                ],
                "generated_at": datetime.now().isoformat()
            }

            self.recommendations[recommendation_id] = recommendation
            self.logger.info(f"Recommendation generated: {recommendation_id}")
            return recommendation

        except Exception as e:
            self.logger.error(f"Error in recommend_decision: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def track_outcome(self, decision_id: str, decision_option: str, outcome_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Track the outcome of a made decision

        Args:
            decision_id: The decision ID to track
            decision_option: The selected option
            outcome_data: Outcome results and metrics

        Returns:
            Dictionary with outcome tracking record
        """
        try:
            self.logger.info(f"Tracking outcome for decision {decision_id}")

            record = DecisionRecord(
                decision_id=decision_id,
                option_selected=decision_option,
                date_decided=datetime.now().isoformat(),
                decision_maker=outcome_data.get("decision_maker", "Unknown"),
                rationale=outcome_data.get("rationale", ""),
                expected_outcome=outcome_data.get("expected_outcome", ""),
                actual_outcome=outcome_data.get("actual_outcome"),
                effectiveness_score=float(outcome_data.get("effectiveness_score", 0.0))
            )

            self.decision_history.append(record)

            tracking_record = {
                "decision_id": decision_id,
                "option_selected": decision_option,
                "expected_vs_actual": {
                    "expected": record.expected_outcome,
                    "actual": record.actual_outcome,
                    "variance": outcome_data.get("variance", "Not calculated")
                },
                "effectiveness_score": record.effectiveness_score,
                "lessons_learned": outcome_data.get("lessons_learned", []),
                "tracked_at": datetime.now().isoformat()
            }

            self.outcome_tracking[decision_id] = tracking_record
            self.logger.info(f"Outcome tracking completed for {decision_id}")
            return tracking_record

        except Exception as e:
            self.logger.error(f"Error in track_outcome: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def learn_from_decision(self, decision_period: str = "last_30_days") -> Dict[str, Any]:
        """
        Extract learning and patterns from past decisions

        Args:
            decision_period: Time period for analysis

        Returns:
            Dictionary with insights and learning
        """
        try:
            self.logger.info(f"Extracting learning from decisions: {decision_period}")

            insights = {
                "period": decision_period,
                "total_decisions": len(self.decision_history),
                "average_effectiveness": 0.0,
                "success_rate": 0.0,
                "key_patterns": [],
                "recommendations_for_improvement": [],
                "high_performers": [],
                "low_performers": []
            }

            if not self.decision_history:
                return insights

            # Calculate statistics
            total_effectiveness = sum(d.effectiveness_score for d in self.decision_history)
            insights["average_effectiveness"] = total_effectiveness / len(self.decision_history) if self.decision_history else 0
            
            successful = sum(1 for d in self.decision_history if d.effectiveness_score >= 0.7)
            insights["success_rate"] = (successful / len(self.decision_history)) * 100 if self.decision_history else 0

            # Identify patterns
            if insights["average_effectiveness"] > 0.7:
                insights["key_patterns"].append("Consistently strong decision outcomes")
            if insights["success_rate"] < 50:
                insights["recommendations_for_improvement"].append("Review decision criteria and evaluation process")

            insights["high_performers"] = [
                d.option_selected for d in self.decision_history if d.effectiveness_score >= 0.8
            ][:3]

            self.logger.info(f"Learning extracted: {insights['success_rate']}% success rate")
            return insights

        except Exception as e:
            self.logger.error(f"Error in learn_from_decision: {str(e)}")
            return {"error": str(e), "status": "failed"}

    # Helper methods
    def _calculate_weighted_score(self, option: DecisionOption, criteria: Dict[str, float]) -> float:
        """Calculate weighted score for an option"""
        score = 0
        total_weight = sum(criteria.values()) if criteria else 1

        if "cost_benefit" in criteria:
            cost_benefit = option.estimated_benefit / option.estimated_cost if option.estimated_cost > 0 else 0
            score += (cost_benefit / 10) * criteria.get("cost_benefit", 1) * 100

        if "risk" in criteria:
            risk_score = {"LOW": 100, "MEDIUM": 70, "HIGH": 40, "CRITICAL": 10}.get(option.risk_level, 50)
            score += risk_score * criteria.get("risk", 1)

        return score / total_weight if total_weight > 0 else 0

    def _calculate_recommendation_score(self, option: DecisionOption, constraints: Dict[str, Any], preferences: Dict[str, Any]) -> float:
        """Calculate recommendation score"""
        score = 50
        if option.estimated_benefit > constraints.get("budget", 0):
            score += 20
        if option.risk_level == preferences.get("preferred_risk_level", "MEDIUM"):
            score += 15
        return min(score, 100)

    def _generate_rationale(self, option_id: Optional[str], constraints: Dict[str, Any], preferences: Dict[str, Any]) -> str:
        """Generate rationale for recommendation"""
        if not option_id:
            return "Unable to generate rationale due to insufficient options"
        return f"Selected {option_id} based on alignment with constraints and preferences"


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute plugin actions"""
    plugin = DecisionSupportPlugin()

    actions = {
        "list_options": lambda: plugin.list_options(
            parameters.get("decision_context", ""),
            parameters.get("criteria", [])
        ),
        "evaluate_option": lambda: plugin.evaluate_option(
            parameters.get("option_id", ""),
            parameters.get("evaluation_data", {})
        ),
        "calculate_scores": lambda: plugin.calculate_scores(
            parameters.get("option_ids", []),
            parameters.get("scoring_criteria", {})
        ),
        "recommend_decision": lambda: plugin.recommend_decision(
            parameters.get("decision_context", ""),
            parameters.get("constraints", {}),
            parameters.get("preferences", {})
        ),
        "track_outcome": lambda: plugin.track_outcome(
            parameters.get("decision_id", ""),
            parameters.get("decision_option", ""),
            parameters.get("outcome_data", {})
        ),
        "learn_from_decision": lambda: plugin.learn_from_decision(
            parameters.get("decision_period", "last_30_days")
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
