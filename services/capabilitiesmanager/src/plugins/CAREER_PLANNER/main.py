#!/usr/bin/env python3
"""
CAREER_PLANNER Plugin - Career development path planning
Supports career path generation, goal setting, milestone tracking, and learning recommendations.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Career Framework Data
CAREER_LEVELS = {
    "entry": {"min_years": 0, "max_years": 2, "salary_range": (40000, 60000)},
    "mid": {"min_years": 2, "max_years": 7, "salary_range": (60000, 100000)},
    "senior": {"min_years": 7, "max_years": 12, "salary_range": (100000, 150000)},
    "lead": {"min_years": 12, "max_years": 18, "salary_range": (140000, 200000)},
    "executive": {"min_years": 18, "max_years": None, "salary_range": (180000, 300000)}
}

INDUSTRIES = {
    "technology": {"growth": "high", "demand": "critical"},
    "finance": {"growth": "medium", "demand": "high"},
    "healthcare": {"growth": "high", "demand": "critical"},
    "manufacturing": {"growth": "low", "demand": "medium"},
    "consulting": {"growth": "medium", "demand": "high"},
    "education": {"growth": "low", "demand": "medium"},
    "government": {"growth": "low", "demand": "medium"},
    "retail": {"growth": "low", "demand": "low"}
}

ROLE_PROGRESSION = {
    "junior_developer": {"progression": ["mid_developer", "senior_developer", "tech_lead", "engineering_manager"],
                         "skills": ["programming", "problem_solving", "teamwork"]},
    "analyst": {"progression": ["senior_analyst", "principal_analyst", "analytics_manager", "director"],
                "skills": ["data_analysis", "sql", "visualization"]},
    "project_manager": {"progression": ["senior_pm", "program_manager", "portfolio_manager", "director"],
                        "skills": ["leadership", "planning", "communication"]},
    "accountant": {"progression": ["senior_accountant", "controller", "finance_director", "cfo"],
                   "skills": ["accounting", "financial_analysis", "compliance"]},
    "nurse": {"progression": ["senior_nurse", "charge_nurse", "nurse_manager", "director"],
              "skills": ["clinical_care", "patient_relations", "documentation"]},
}

LEARNING_RESOURCES = {
    "programming": ["Python", "JavaScript", "Java", "Cloud (AWS/Azure/GCP)", "DevOps"],
    "leadership": ["Emotional Intelligence", "Team Management", "Strategic Planning", "Executive Presence"],
    "data_analysis": ["SQL", "Python/R", "Tableau/Power BI", "Statistics", "Machine Learning"],
    "finance": ["Financial Accounting", "Management Accounting", "Corporate Finance", "FP&A Tools"],
    "healthcare": ["Clinical Protocols", "EMR Systems", "Patient Safety", "Regulatory Compliance"]
}

INDUSTRY_TRENDS = {
    "technology": ["AI/Machine Learning", "Cloud Migration", "Cybersecurity", "DevOps", "Remote Work"],
    "finance": ["Digital Banking", "RegTech", "FinTech", "ESG Investing", "Automation"],
    "healthcare": ["Telemedicine", "Health Analytics", "Patient Experience", "AI Diagnostics"],
    "consulting": ["Digital Transformation", "Sustainability", "Remote Advisory", "Data Analytics"]
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases and extracting from {{'value':...}} wrapper."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def _validate_params(payload: dict, required_fields: List[str]) -> Tuple[bool, str]:
    """Validate that all required fields are present in payload."""
    for field in required_fields:
        if field not in payload or payload[field] is None:
            return False, f"Missing required parameter: {field}"
    return True, ""

def _calculate_timeline(current_level: str, target_level: str, current_years: int) -> Dict[str, Any]:
    """Calculate career progression timeline."""
    if current_level not in CAREER_LEVELS:
        return {"error": f"Invalid current level: {current_level}"}
    if target_level not in CAREER_LEVELS:
        return {"error": f"Invalid target level: {target_level}"}
    
    current_min = CAREER_LEVELS[current_level]["min_years"]
    target_min = CAREER_LEVELS[target_level]["min_years"]
    
    if current_years < current_min:
        current_years = current_min
    
    timeline_months = max((target_min - current_years) * 12, 12)
    milestones = []
    
    for i in range(1, 4):
        month = timeline_months // 4 * i
        milestones.append({
            "quarter": i,
            "target_month": month,
            "target_date": (datetime.now() + timedelta(days=month * 30)).strftime("%Y-%m-%d")
        })
    
    return {
        "timeline_months": timeline_months,
        "estimated_completion": (datetime.now() + timedelta(days=timeline_months * 30)).strftime("%Y-%m-%d"),
        "milestones": milestones
    }

def create_career_plan(payload: dict) -> Dict[str, Any]:
    """Generate a comprehensive career development plan."""
    is_valid, error = _validate_params(payload, ["current_role", "current_level", "years_experience", "target_role"])
    if not is_valid:
        return {"success": False, "error": error}
    
    current_role = payload.get("current_role", "").lower()
    current_level = payload.get("current_level", "").lower()
    years_exp = payload.get("years_experience", 0)
    target_role = payload.get("target_role", "").lower()
    industry = payload.get("industry", "technology").lower()
    
    if current_level not in CAREER_LEVELS:
        return {"success": False, "error": f"Invalid career level: {current_level}"}
    if industry not in INDUSTRIES:
        return {"success": False, "error": f"Invalid industry: {industry}"}
    
    # Find progression path
    progression_path = []
    if current_role in ROLE_PROGRESSION:
        progression_path = ROLE_PROGRESSION[current_role].get("progression", [])
    
    # Calculate timeline
    next_level = list(CAREER_LEVELS.keys())[list(CAREER_LEVELS.keys()).index(current_level) + 1] if current_level != "executive" else current_level
    timeline = _calculate_timeline(current_level, next_level, years_exp)
    
    # Get learning recommendations
    learning_recs = []
    if current_role in ROLE_PROGRESSION:
        learning_recs = ROLE_PROGRESSION[current_role].get("skills", [])
    
    plan = {
        "success": True,
        "career_plan": {
            "current_profile": {
                "role": current_role,
                "level": current_level,
                "years_experience": years_exp,
                "industry": industry
            },
            "target_role": target_role,
            "progression_path": progression_path if progression_path else [next_level],
            "timeline": timeline,
            "learning_path": {
                "critical_skills": learning_recs[:3] if learning_recs else [],
                "resources": [LEARNING_RESOURCES.get(skill.lower().replace(" ", "_"), ["Online Course"]) for skill in learning_recs[:3]] if learning_recs else []
            },
            "industry_context": {
                "industry": industry,
                "growth_outlook": INDUSTRIES.get(industry, {}).get("growth", "unknown"),
                "demand": INDUSTRIES.get(industry, {}).get("demand", "unknown"),
                "key_trends": INDUSTRY_TRENDS.get(industry, [])
            },
            "salary_projection": {
                "current_range": CAREER_LEVELS.get(current_level, {}).get("salary_range", (0, 0)),
                "next_level_range": CAREER_LEVELS.get(next_level, {}).get("salary_range", (0, 0))
            }
        }
    }
    return plan

def add_goal(payload: dict) -> Dict[str, Any]:
    """Add and structure a career goal."""
    is_valid, error = _validate_params(payload, ["goal_title", "goal_type"])
    if not is_valid:
        return {"success": False, "error": error}
    
    goal_title = payload.get("goal_title")
    goal_type = payload.get("goal_type").lower()  # "skill", "promotion", "certification", "project"
    timeline_months = payload.get("timeline_months", 12)
    success_metrics = payload.get("success_metrics", [])
    
    valid_types = ["skill", "promotion", "certification", "project", "network"]
    if goal_type not in valid_types:
        return {"success": False, "error": f"Invalid goal type. Must be one of: {', '.join(valid_types)}"}
    
    goal = {
        "success": True,
        "goal": {
            "title": goal_title,
            "type": goal_type,
            "created_date": datetime.now().strftime("%Y-%m-%d"),
            "target_date": (datetime.now() + timedelta(days=timeline_months * 30)).strftime("%Y-%m-%d"),
            "timeline_months": timeline_months,
            "success_metrics": success_metrics if success_metrics else [f"Complete {goal_title}"],
            "status": "in_progress",
            "progress_percentage": 0,
            "action_items": _generate_action_items(goal_type, goal_title)
        }
    }
    return goal

def _generate_action_items(goal_type: str, goal_title: str) -> List[str]:
    """Generate action items based on goal type."""
    base_items = {
        "skill": [f"Identify training resources for {goal_title}", "Create practice schedule", "Find mentor",
                  "Set weekly practice goals", "Track progress weekly"],
        "promotion": ["Document achievements", "Seek mentorship", "Request performance review",
                      "Identify skill gaps", "Develop promotion narrative"],
        "certification": [f"Register for {goal_title}", "Create study plan", "Join study group",
                          "Schedule exam date", "Track study hours"],
        "project": ["Define project scope", "Identify stakeholders", "Create project timeline",
                    "Allocate resources", "Establish success criteria"],
        "network": ["Identify key contacts", "Join professional groups", "Attend industry events",
                    "Schedule coffee meetings", "Create networking plan"]
    }
    return base_items.get(goal_type, [])

def track_progress(payload: dict) -> Dict[str, Any]:
    """Track goal progress and provide insights."""
    is_valid, error = _validate_params(payload, ["goal_id", "progress_percentage"])
    if not is_valid:
        return {"success": False, "error": error}
    
    goal_id = payload.get("goal_id")
    progress = payload.get("progress_percentage", 0)
    notes = payload.get("notes", "")
    
    if not (0 <= progress <= 100):
        return {"success": False, "error": "Progress percentage must be between 0 and 100"}
    
    tracking = {
        "success": True,
        "progress_update": {
            "goal_id": goal_id,
            "progress_percentage": progress,
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "notes": notes,
            "status": "on_track" if progress > 0 else "pending",
            "insights": _generate_progress_insights(progress),
            "next_steps": _recommend_next_steps(progress)
        }
    }
    return tracking

def _generate_progress_insights(progress: int) -> List[str]:
    """Generate insights based on progress level."""
    insights = []
    if progress == 0:
        insights.append("Goal initiated - time to begin action items")
    elif progress < 25:
        insights.append("Early stage - maintain momentum and consistency")
    elif progress < 50:
        insights.append("Good progress - halfway to completion")
    elif progress < 75:
        insights.append("Strong progress - nearing goal completion")
    elif progress < 100:
        insights.append("Final stretch - focus on completion")
    else:
        insights.append("Congratulations! Goal achieved")
    return insights

def _recommend_next_steps(progress: int) -> List[str]:
    """Recommend next steps based on progress."""
    if progress < 25:
        return ["Execute first action item", "Schedule weekly check-ins", "Find accountability partner"]
    elif progress < 50:
        return ["Review action items", "Adjust timeline if needed", "Celebrate milestones"]
    elif progress < 75:
        return ["Identify remaining blockers", "Accelerate efforts", "Share progress with mentor"]
    elif progress < 100:
        return ["Final push to completion", "Document learning", "Plan celebration"]
    else:
        return ["Reflect on achievement", "Set next goal", "Share success with network"]

def update_milestone(payload: dict) -> Dict[str, Any]:
    """Update and manage career milestones."""
    is_valid, error = _validate_params(payload, ["milestone_id", "status"])
    if not is_valid:
        return {"success": False, "error": error}
    
    milestone_id = payload.get("milestone_id")
    status = payload.get("status").lower()  # "completed", "in_progress", "delayed", "blocked"
    completion_notes = payload.get("completion_notes", "")
    
    valid_statuses = ["completed", "in_progress", "delayed", "blocked", "not_started"]
    if status not in valid_statuses:
        return {"success": False, "error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"}
    
    update = {
        "success": True,
        "milestone_update": {
            "milestone_id": milestone_id,
            "status": status,
            "completion_notes": completion_notes,
            "updated_date": datetime.now().strftime("%Y-%m-%d"),
            "impact": _assess_milestone_impact(status),
            "recommendations": _get_milestone_recommendations(status)
        }
    }
    return update

def _assess_milestone_impact(status: str) -> str:
    """Assess impact of milestone status."""
    impacts = {
        "completed": "On track - milestone achieved successfully",
        "in_progress": "On track - continue current efforts",
        "delayed": "Risk identified - may impact timeline",
        "blocked": "Critical issue - requires immediate attention",
        "not_started": "Behind schedule - prioritize initiation"
    }
    return impacts.get(status, "Unknown impact")

def _get_milestone_recommendations(status: str) -> List[str]:
    """Get recommendations based on milestone status."""
    recommendations = {
        "completed": ["Document lesson learned", "Share results", "Plan next milestone"],
        "in_progress": ["Track completion", "Maintain momentum", "Weekly review"],
        "delayed": ["Identify root cause", "Adjust timeline", "Reallocate resources"],
        "blocked": ["Escalate issue", "Request support", "Reassess approach"],
        "not_started": ["Define first steps", "Allocate time", "Set deadline"]
    }
    return recommendations.get(status, [])

def get_recommendations(payload: dict) -> Dict[str, Any]:
    """Provide learning and development recommendations."""
    is_valid, error = _validate_params(payload, ["role", "level"])
    if not is_valid:
        return {"success": False, "error": error}
    
    role = payload.get("role", "").lower()
    level = payload.get("level", "").lower()
    industry = payload.get("industry", "technology").lower()
    
    if level not in CAREER_LEVELS:
        return {"success": False, "error": f"Invalid level: {level}"}
    
    next_level = list(CAREER_LEVELS.keys())[min(list(CAREER_LEVELS.keys()).index(level) + 1, len(CAREER_LEVELS) - 1)]
    
    recommendations = {
        "success": True,
        "recommendations": {
            "hard_skills": LEARNING_RESOURCES.get("programming", []) if role == "junior_developer" else
                          LEARNING_RESOURCES.get("data_analysis", []) if "analyst" in role else
                          LEARNING_RESOURCES.get("leadership", []),
            "soft_skills": ["Communication", "Emotional Intelligence", "Time Management",
                          "Problem Solving", "Collaboration"],
            "certifications": _get_certifications(role, level),
            "industry_trends": INDUSTRY_TRENDS.get(industry, []),
            "resources": {
                "online_platforms": ["Coursera", "LinkedIn Learning", "Udemy", "edX"],
                "professional_organizations": _get_professional_orgs(industry),
                "mentorship": "Seek mentor in target role",
                "conferences": _get_conferences(industry)
            }
        }
    }
    return recommendations

def _get_certifications(role: str, level: str) -> List[str]:
    """Get relevant certifications based on role."""
    certs = {
        "developer": ["AWS Solutions Architect", "Kubernetes", "Docker", "Cloud Certifications"],
        "analyst": ["Tableau Desktop Specialist", "Google Analytics", "SQL Certification"],
        "manager": ["Project Management Professional (PMP)", "Six Sigma", "Leadership"],
        "accountant": ["CPA", "CIA", "ACCA"],
        "nurse": ["RN License", "Critical Care Certification", "Specialty Certifications"],
        "default": ["Industry-specific certification", "Management certification"]
    }
    
    for key in certs:
        if key in role:
            return certs[key]
    return certs["default"]

def _get_professional_orgs(industry: str) -> List[str]:
    """Get professional organizations by industry."""
    orgs = {
        "technology": ["IEEE", "ACM", "Cloud Native Computing Foundation"],
        "finance": ["CFA Institute", "ASMP", "FPA"],
        "healthcare": ["ANA", "ASHP", "Medical Associations"],
        "consulting": ["MCA", "ACMC", "Industry-Specific Groups"],
        "default": ["Industry Association", "Chamber of Commerce"]
    }
    return orgs.get(industry, orgs["default"])

def _get_conferences(industry: str) -> List[str]:
    """Get relevant conferences by industry."""
    conferences = {
        "technology": ["AWS re:Invent", "Google Cloud Next", "KubeCon"],
        "finance": ["FinCon", "Money Show", "Banking Summit"],
        "healthcare": ["HIMSS", "Healthcare IT Forum"],
        "consulting": ["Management Consulting Summit", "Industry Conferences"],
        "default": ["Industry Annual Conference"]
    }
    return conferences.get(industry, conferences["default"])

def analyze_trends(payload: dict) -> Dict[str, Any]:
    """Analyze industry and career trends."""
    is_valid, error = _validate_params(payload, ["industry"])
    if not is_valid:
        return {"success": False, "error": error}
    
    industry = payload.get("industry", "").lower()
    
    if industry not in INDUSTRIES:
        return {"success": False, "error": f"Invalid industry: {industry}"}
    
    trends = {
        "success": True,
        "trends_analysis": {
            "industry": industry,
            "industry_health": INDUSTRIES.get(industry, {}),
            "emerging_trends": INDUSTRY_TRENDS.get(industry, []),
            "skill_demand": _analyze_skill_demand(industry),
            "job_outlook": _get_job_outlook(industry),
            "salary_trends": _get_salary_trends(industry),
            "recommendations": _get_trend_recommendations(industry)
        }
    }
    return trends

def _analyze_skill_demand(industry: str) -> Dict[str, str]:
    """Analyze skill demand by industry."""
    demand = {
        "technology": {"critical": ["Python", "Cloud", "DevOps"], "growing": ["AI/ML", "Security"]},
        "finance": {"critical": ["FP&A", "Python", "SQL"], "growing": ["RegTech", "FinTech"]},
        "healthcare": {"critical": ["Clinical", "EHR", "Analytics"], "growing": ["Telemedicine", "AI"]},
        "consulting": {"critical": ["Analytics", "Strategy", "Communication"], "growing": ["Digital", "Sustainability"]},
        "default": {"critical": ["Communication", "Problem Solving"], "growing": ["Digital Skills"]}
    }
    return demand.get(industry, demand["default"])

def _get_job_outlook(industry: str) -> str:
    """Get job outlook for industry."""
    outlook = {
        "technology": "Strong growth (8-15% annually) in tech roles, strong demand",
        "finance": "Moderate growth with shift to digital banking and fintech",
        "healthcare": "Strong growth (10%+) due to aging population",
        "consulting": "Steady demand with focus on digital transformation",
        "default": "Industry-dependent, research specific roles"
    }
    return outlook.get(industry, outlook["default"])

def _get_salary_trends(industry: str) -> Dict[str, Any]:
    """Get salary trends by industry."""
    trends = {
        "technology": {"trend": "increasing", "rate": "3-5% annually", "notes": "Tech talent shortage drives growth"},
        "finance": {"trend": "stable", "rate": "1-3% annually", "notes": "Pressure from automation"},
        "healthcare": {"trend": "increasing", "rate": "2-4% annually", "notes": "Strong demand, staffing shortages"},
        "consulting": {"trend": "stable", "rate": "2-3% annually", "notes": "Project-based variable comp"},
        "default": {"trend": "variable", "rate": "1-3% annually", "notes": "Industry dependent"}
    }
    return trends.get(industry, trends["default"])

def _get_trend_recommendations(industry: str) -> List[str]:
    """Get recommendations based on industry trends."""
    recs = {
        "technology": ["Focus on cloud skills", "Learn AI/ML basics", "Develop security awareness"],
        "finance": ["Develop fintech understanding", "Learn data analysis", "Understand regulatory change"],
        "healthcare": ["Embrace digital tools", "Develop telehealth competency", "Learn health analytics"],
        "consulting": ["Develop digital skills", "Focus on sustainability", "Build thought leadership"],
        "default": ["Stay current with industry trends", "Invest in continuous learning", "Build diverse skill set"]
    }
    return recs.get(industry, recs["default"])

def execute_plugin(inputs):
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, 'action', ['operation', 'command'])
        payload = _get_input(inputs, 'payload', ['data', 'params', 'parameters'], default={})

        if not action:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "Missing required parameter 'action'",
                "error": "Missing required parameter 'action'"
            }]

        logger.info(f"Executing action: {action}")
        
        action_handlers = {
            "create_career_plan": create_career_plan,
            "add_goal": add_goal,
            "track_progress": track_progress,
            "update_milestone": update_milestone,
            "get_recommendations": get_recommendations,
            "analyze_trends": analyze_trends
        }
        
        if action not in action_handlers:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]
        
        result_data = action_handlers[action](payload)
        
        return [{
            "success": result_data.get("success", True),
            "name": "result",
            "resultType": "object",
            "result": result_data,
            "resultDescription": f"Result of {action} operation"
        }]

    except Exception as e:
        logger.error(f"Error in execute_plugin: {e}")
        return [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]

def parse_inputs(inputs_str):
    """Parse and normalize the plugin stdin JSON payload into a dict."""
    try:
        payload = json.loads(inputs_str)
        inputs_dict = {}

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
        logger.error(f"Failed to parse input JSON: {e}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            result = [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": "No input data received",
                "error": "No input data received"
            }]
        else:
            inputs_dict = parse_inputs(input_data)
            result = execute_plugin(inputs_dict)

        print(json.dumps(result))

    except Exception as e:
        logger.error(f"Plugin execution failed: {str(e)}")
        result = [{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "error": str(e)
        }]
        print(json.dumps(result))

if __name__ == "__main__":
    main()
