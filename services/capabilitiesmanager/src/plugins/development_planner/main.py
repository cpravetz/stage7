#!/usr/bin/env python3
"""
Development Planner Plugin - Career and skill development planning
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class DevelopmentPlan:
    """Development plan model"""
    plan_id: str
    employee_id: str
    name: str
    current_role: str
    target_role: str
    goals: List[Dict]
    current_skills: List[str]
    target_skills: List[str]
    timeline_months: int
    start_date: str
    target_date: str
    status: str
    progress: float
    created_at: str
    updated_at: str


class DevelopmentPlannerPlugin:
    """Development Planner Plugin - Plans and tracks professional development"""

    def __init__(self):
        """Initialize the Development Planner Plugin"""
        self.plans: Dict[str, DevelopmentPlan] = {}
        self.goals: Dict[str, Dict] = {}
        self.progress_records: Dict[str, List[Dict]] = {}
        self.resources: Dict[str, List[Dict]] = {}
        self.skill_assessments: Dict[str, Dict] = {}
        self.logger = logging.getLogger(__name__)
        self.logger.info("Development Planner Plugin initialized")

    def create_dev_plan(self, employee_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a comprehensive development plan for an employee

        Args:
            employee_data: Employee information and development goals

        Returns:
            Dictionary with created plan
        """
        try:
            self.logger.info(f"Creating development plan for: {employee_data.get('name', 'Unknown')}")

            plan_id = f"devplan_{datetime.now().timestamp()}"
            timeline_months = int(employee_data.get("timeline_months", 12))
            start_date = datetime.now()
            target_date = start_date + timedelta(days=timeline_months * 30)

            plan = DevelopmentPlan(
                plan_id=plan_id,
                employee_id=employee_data.get("employee_id", f"emp_{plan_id}"),
                name=employee_data.get("name", "Unknown"),
                current_role=employee_data.get("current_role", ""),
                target_role=employee_data.get("target_role", ""),
                goals=employee_data.get("goals", []),
                current_skills=employee_data.get("current_skills", []),
                target_skills=employee_data.get("target_skills", []),
                timeline_months=timeline_months,
                start_date=start_date.isoformat(),
                target_date=target_date.isoformat(),
                status="active",
                progress=0.0,
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat()
            )

            self.plans[plan_id] = plan
            self.progress_records[plan_id] = []

            result = asdict(plan)
            self.logger.info(f"Development plan created: {plan_id}")
            return result

        except Exception as e:
            self.logger.error(f"Error in create_dev_plan: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def set_goals(self, plan_id: str, goals_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Set and define SMART goals for development plan

        Args:
            plan_id: The development plan ID
            goals_data: Goal definitions and metrics

        Returns:
            Dictionary with goal setup
        """
        try:
            self.logger.info(f"Setting goals for plan {plan_id}")

            if plan_id not in self.plans:
                return {"error": f"Plan {plan_id} not found", "status": "failed"}

            plan = self.plans[plan_id]
            goals_list = goals_data.get("goals", [])

            processed_goals = {
                "plan_id": plan_id,
                "goals": [],
                "total_goals": len(goals_list),
                "target_completion_date": plan.target_date
            }

            for i, goal in enumerate(goals_list):
                goal_obj = {
                    "goal_id": f"goal_{plan_id}_{i}",
                    "title": goal.get("title", f"Goal {i+1}"),
                    "description": goal.get("description", ""),
                    "specific": goal.get("specific", ""),
                    "measurable": goal.get("measurable", ""),
                    "achievable": goal.get("achievable", ""),
                    "relevant": goal.get("relevant", ""),
                    "time_bound": goal.get("time_bound", ""),
                    "status": "active",
                    "progress": 0.0,
                    "target_date": goal.get("target_date", plan.target_date)
                }
                processed_goals["goals"].append(goal_obj)
                self.goals[goal_obj["goal_id"]] = goal_obj

            plan.goals = processed_goals["goals"]
            plan.updated_at = datetime.now().isoformat()

            self.logger.info(f"Goals set for plan {plan_id}: {len(processed_goals['goals'])} goals")
            return processed_goals

        except Exception as e:
            self.logger.error(f"Error in set_goals: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def track_progress(self, plan_id: str, progress_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Track progress on development plan and goals

        Args:
            plan_id: The development plan ID
            progress_data: Progress updates and metrics

        Returns:
            Dictionary with progress tracking
        """
        try:
            self.logger.info(f"Tracking progress for plan {plan_id}")

            if plan_id not in self.plans:
                return {"error": f"Plan {plan_id} not found", "status": "failed"}

            plan = self.plans[plan_id]
            progress_pct = float(progress_data.get("progress_percentage", 0))
            plan.progress = progress_pct
            plan.status = progress_data.get("status", "in_progress")
            plan.updated_at = datetime.now().isoformat()

            progress_entry = {
                "timestamp": datetime.now().isoformat(),
                "progress_percentage": progress_pct,
                "completed_goals": progress_data.get("completed_goals", []),
                "active_goals": progress_data.get("active_goals", []),
                "skills_acquired": progress_data.get("skills_acquired", []),
                "certifications": progress_data.get("certifications", []),
                "challenges": progress_data.get("challenges", []),
                "next_steps": progress_data.get("next_steps", [])
            }

            if plan_id not in self.progress_records:
                self.progress_records[plan_id] = []
            self.progress_records[plan_id].append(progress_entry)

            result = {
                "plan_id": plan_id,
                "current_progress": progress_pct,
                "status": plan.status,
                "progress_updates": len(self.progress_records.get(plan_id, [])),
                "last_update": datetime.now().isoformat()
            }

            self.logger.info(f"Progress tracked for {plan_id}: {progress_pct}%")
            return result

        except Exception as e:
            self.logger.error(f"Error in track_progress: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def suggest_resources(self, plan_id: str, resource_request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Suggest learning and development resources

        Args:
            plan_id: The development plan ID
            resource_request: Resource requirements and preferences

        Returns:
            Dictionary with suggested resources
        """
        try:
            self.logger.info(f"Suggesting resources for plan {plan_id}")

            if plan_id not in self.plans:
                return {"error": f"Plan {plan_id} not found", "status": "failed"}

            plan = self.plans[plan_id]
            skill_gap = set(plan.target_skills) - set(plan.current_skills)

            resources = {
                "plan_id": plan_id,
                "skill_gaps": list(skill_gap),
                "recommended_resources": [],
                "training_programs": [],
                "online_courses": [],
                "mentoring": [],
                "books_and_articles": []
            }

            for skill in skill_gap:
                resources["recommended_resources"].append({
                    "skill": skill,
                    "type": "Training Program",
                    "provider": f"Internal/External Provider for {skill}",
                    "duration": "8-12 weeks",
                    "cost": 1000,
                    "priority": "HIGH"
                })

            resources["training_programs"] = [
                {"name": f"Advanced {skill} Workshop", "duration": "5 days", "cost": 500}
                for skill in list(skill_gap)[:2]
            ]

            resources["online_courses"] = [
                {"platform": "Coursera", "title": f"{skill} Fundamentals", "duration": "4 weeks"}
                for skill in list(skill_gap)[:3]
            ]

            resources["mentoring"] = [
                {"type": "Internal Mentor", "frequency": "bi-weekly", "focus": "Skill development"}
            ]

            if plan_id not in self.resources:
                self.resources[plan_id] = []
            self.resources[plan_id] = resources["recommended_resources"]

            self.logger.info(f"Resources suggested for {plan_id}")
            return resources

        except Exception as e:
            self.logger.error(f"Error in suggest_resources: {str(e)}")
            return {"error": str(e), "status": "failed"}

    def evaluate_skill_growth(self, plan_id: str, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate and measure skill growth and development

        Args:
            plan_id: The development plan ID
            assessment_data: Skill assessment results

        Returns:
            Dictionary with skill growth evaluation
        """
        try:
            self.logger.info(f"Evaluating skill growth for plan {plan_id}")

            if plan_id not in self.plans:
                return {"error": f"Plan {plan_id} not found", "status": "failed"}

            plan = self.plans[plan_id]
            assessment_id = f"assess_{plan_id}_{datetime.now().timestamp()}"

            evaluation = {
                "assessment_id": assessment_id,
                "plan_id": plan_id,
                "assessment_date": datetime.now().isoformat(),
                "skills_assessed": assessment_data.get("skills_assessed", {}),
                "skill_progress": {},
                "proficiency_levels": {},
                "growth_rate": 0.0,
                "readiness_for_target_role": 0.0
            }

            # Calculate skill progress
            for skill, current_level in assessment_data.get("skills_assessed", {}).items():
                target_level = next(
                    (s for s in plan.target_skills if s == skill),
                    None
                )
                if target_level:
                    progress = (current_level / 10) * 100 if current_level > 0 else 0
                    evaluation["skill_progress"][skill] = {
                        "current_level": current_level,
                        "target_level": 10,
                        "progress_percentage": progress
                    }

            # Calculate growth rate
            total_progress = sum(
                sp.get("progress_percentage", 0)
                for sp in evaluation["skill_progress"].values()
            )
            evaluation["growth_rate"] = (
                total_progress / len(evaluation["skill_progress"])
                if evaluation["skill_progress"]
                else 0
            )

            # Assess readiness for target role
            if evaluation["growth_rate"] >= 80:
                evaluation["readiness_for_target_role"] = 0.9
            elif evaluation["growth_rate"] >= 60:
                evaluation["readiness_for_target_role"] = 0.7
            elif evaluation["growth_rate"] >= 40:
                evaluation["readiness_for_target_role"] = 0.5
            else:
                evaluation["readiness_for_target_role"] = 0.3

            self.skill_assessments[assessment_id] = evaluation
            self.logger.info(f"Skill growth evaluated: {evaluation['growth_rate']}% growth rate")
            return evaluation

        except Exception as e:
            self.logger.error(f"Error in evaluate_skill_growth: {str(e)}")
            return {"error": str(e), "status": "failed"}


def execute_action(action: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Execute plugin actions"""
    plugin = DevelopmentPlannerPlugin()

    actions = {
        "create_dev_plan": lambda: plugin.create_dev_plan(
            parameters.get("employee_data", {})
        ),
        "set_goals": lambda: plugin.set_goals(
            parameters.get("plan_id", ""),
            parameters.get("goals_data", {})
        ),
        "track_progress": lambda: plugin.track_progress(
            parameters.get("plan_id", ""),
            parameters.get("progress_data", {})
        ),
        "suggest_resources": lambda: plugin.suggest_resources(
            parameters.get("plan_id", ""),
            parameters.get("resource_request", {})
        ),
        "evaluate_skill_growth": lambda: plugin.evaluate_skill_growth(
            parameters.get("plan_id", ""),
            parameters.get("assessment_data", {})
        )
    }

    if action not in actions:
        return {"error": f"Action '{action}' not found", "status": "failed"}

    return actions[action]()
