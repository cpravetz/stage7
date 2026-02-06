#!/usr/bin/env python3
"""
SKILL_GAP_ANALYSIS Plugin - Skill assessment and gap identification
Supports skill evaluation, gap analysis, learning recommendations, and industry benchmarking.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# SFIA Framework - Skills Framework for the Information Age
SFIA_LEVELS = {
    1: {"name": "Follow", "description": "Apply standard procedures and guidance under supervision"},
    2: {"name": "Assist", "description": "Support activities in a defined area under supervision"},
    3: {"name": "Apply", "description": "Apply knowledge and experience to solve defined problems"},
    4: {"name": "Enable", "description": "Advise and supervise others, manage significant activities"},
    5: {"name": "Ensure", "description": "Establish strategic direction and policies"},
    6: {"name": "Initiate", "description": "Drive organizational change and innovation"},
    7: {"name": "Strategize", "description": "Define enterprise strategy and technology direction"}
}

TECHNICAL_SKILLS = {
    "programming": {
        "Python": 4, "Java": 4, "JavaScript": 4, "C++": 4, "C#": 4, "Go": 3, "Rust": 3, "Ruby": 3
    },
    "data": {
        "SQL": 4, "Python": 4, "R": 4, "Tableau": 3, "Power BI": 3, "Spark": 3, "Hadoop": 3
    },
    "cloud": {
        "AWS": 4, "Azure": 4, "GCP": 3, "Kubernetes": 4, "Docker": 4, "CloudFormation": 3
    },
    "devops": {
        "CI/CD": 4, "Jenkins": 3, "GitLab": 3, "Terraform": 3, "Ansible": 3, "Docker": 4
    },
    "security": {
        "Network Security": 3, "Cryptography": 3, "Penetration Testing": 3, "IAM": 3, "SIEM": 3
    }
}

SOFT_SKILLS = {
    "leadership": {"min_level": 3, "description": "Team leadership and people management"},
    "communication": {"min_level": 3, "description": "Written and verbal communication"},
    "problem_solving": {"min_level": 3, "description": "Analytical and critical thinking"},
    "time_management": {"min_level": 2, "description": "Prioritization and organization"},
    "collaboration": {"min_level": 3, "description": "Team work and cooperation"},
    "adaptability": {"min_level": 3, "description": "Flexibility and learning agility"},
    "project_management": {"min_level": 3, "description": "Planning, execution, monitoring"}
}

INDUSTRY_SKILL_REQUIREMENTS = {
    "technology": {
        "critical": ["Programming", "System Design", "Cloud", "DevOps"],
        "important": ["Data Analysis", "Security", "Communication"],
        "emerging": ["AI/ML", "Blockchain", "IoT"]
    },
    "finance": {
        "critical": ["Financial Analysis", "Excel", "SQL", "Risk Management"],
        "important": ["Reporting", "Compliance", "Communication"],
        "emerging": ["Fintech", "Data Science", "Automation"]
    },
    "healthcare": {
        "critical": ["Clinical Knowledge", "Patient Communication", "Documentation", "Compliance"],
        "important": ["Critical Thinking", "Teamwork", "Time Management"],
        "emerging": ["Health IT", "Analytics", "Telemedicine"]
    },
    "consulting": {
        "critical": ["Problem Solving", "Communication", "Project Management", "Analysis"],
        "important": ["Client Management", "Presentation", "Leadership"],
        "emerging": ["Digital Strategy", "Data Analytics", "Change Management"]
    }
}

ROLE_SKILL_PROFILES = {
    "junior_developer": {
        "required": {"Programming": 3, "Problem Solving": 3, "Version Control": 3},
        "desired": {"SQL": 2, "Testing": 2, "Communication": 3},
        "level": "entry"
    },
    "senior_developer": {
        "required": {"Programming": 5, "System Design": 4, "Code Review": 4},
        "desired": {"Leadership": 4, "Mentoring": 4, "Architecture": 4},
        "level": "senior"
    },
    "data_analyst": {
        "required": {"SQL": 4, "Excel": 4, "Data Visualization": 3},
        "desired": {"Python": 3, "Statistical Analysis": 3, "Communication": 4},
        "level": "mid"
    },
    "project_manager": {
        "required": {"Project Management": 4, "Communication": 5, "Leadership": 4},
        "desired": {"Strategic Planning": 3, "Risk Management": 3, "Stakeholder Mgmt": 4},
        "level": "mid"
    },
    "manager": {
        "required": {"Leadership": 5, "Communication": 5, "Decision Making": 4},
        "desired": {"Strategic Planning": 4, "Emotional Intelligence": 4, "Coaching": 4},
        "level": "senior"
    }
}

LEARNING_PATHS = {
    "Programming": [
        {"level": 1, "course": "Programming Fundamentals", "duration_hours": 40},
        {"level": 2, "course": "Intermediate Development", "duration_hours": 60},
        {"level": 3, "course": "Advanced Design Patterns", "duration_hours": 80},
        {"level": 4, "course": "System Architecture", "duration_hours": 100},
        {"level": 5, "course": "Technical Leadership", "duration_hours": 80}
    ],
    "Leadership": [
        {"level": 1, "course": "Introduction to Teamwork", "duration_hours": 20},
        {"level": 2, "course": "Team Lead Essentials", "duration_hours": 40},
        {"level": 3, "course": "Effective Management", "duration_hours": 60},
        {"level": 4, "course": "Strategic Leadership", "duration_hours": 80},
        {"level": 5, "course": "Executive Leadership", "duration_hours": 100}
    ],
    "Communication": [
        {"level": 1, "course": "Basics of Communication", "duration_hours": 15},
        {"level": 2, "course": "Professional Writing", "duration_hours": 30},
        {"level": 3, "course": "Presentation Skills", "duration_hours": 40},
        {"level": 4, "course": "Executive Communication", "duration_hours": 50},
        {"level": 5, "course": "Thought Leadership", "duration_hours": 60}
    ]
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

def assess_skills(payload: dict) -> Dict[str, Any]:
    """Assess current skills and proficiency levels."""
    is_valid, error = _validate_params(payload, ["skills"])
    if not is_valid:
        return {"success": False, "error": error}
    
    skills = payload.get("skills", {})  # {skill_name: proficiency_level}
    role = payload.get("role", "general")
    industry = payload.get("industry", "technology")
    
    if not isinstance(skills, dict):
        return {"success": False, "error": "Skills must be provided as a dictionary {skill: level}"}
    
    assessment = {
        "success": True,
        "assessment": {
            "total_skills_assessed": len(skills),
            "current_profile": _calculate_skill_profile(skills),
            "proficiency_distribution": _analyze_proficiency_distribution(skills),
            "strengths": _identify_strengths(skills),
            "areas_for_improvement": _identify_weaknesses(skills),
            "skill_rankings": _rank_skills(skills),
            "industry_context": {
                "industry": industry,
                "role": role,
                "critical_skills": INDUSTRY_SKILL_REQUIREMENTS.get(industry, {}).get("critical", []),
                "importance_vs_current": _compare_to_industry(skills, industry)
            }
        }
    }
    return assessment

def _calculate_skill_profile(skills: dict) -> Dict[str, Any]:
    """Calculate overall skill profile."""
    if not skills:
        return {"total_skills": 0, "average_level": 0, "expertise_areas": []}
    
    levels = [level for level in skills.values() if isinstance(level, (int, float))]
    avg_level = sum(levels) / len(levels) if levels else 0
    
    # Identify expertise areas (level >= 4)
    expertise = [skill for skill, level in skills.items() if isinstance(level, (int, float)) and level >= 4]
    
    return {
        "total_skills": len(skills),
        "average_proficiency": round(avg_level, 2),
        "expertise_areas": expertise,
        "overall_assessment": _get_level_description(avg_level)
    }

def _analyze_proficiency_distribution(skills: dict) -> Dict[str, int]:
    """Analyze distribution of proficiency levels."""
    distribution = {i: 0 for i in range(1, 8)}
    
    for skill, level in skills.items():
        if isinstance(level, (int, float)):
            level = int(round(min(max(level, 1), 7)))
            distribution[level] += 1
    
    return distribution

def _identify_strengths(skills: dict) -> List[str]:
    """Identify top strengths."""
    sorted_skills = sorted(
        [(skill, level) for skill, level in skills.items() if isinstance(level, (int, float))],
        key=lambda x: x[1],
        reverse=True
    )
    return [skill for skill, level in sorted_skills[:5] if level >= 3]

def _identify_weaknesses(skills: dict) -> List[str]:
    """Identify areas for improvement."""
    sorted_skills = sorted(
        [(skill, level) for skill, level in skills.items() if isinstance(level, (int, float))],
        key=lambda x: x[1]
    )
    return [skill for skill, level in sorted_skills[:5] if level < 3]

def _rank_skills(skills: dict) -> List[Dict[str, Any]]:
    """Rank skills by proficiency level."""
    ranked = []
    for skill, level in sorted(skills.items(), key=lambda x: x[1] if isinstance(x[1], (int, float)) else 0, reverse=True):
        if isinstance(level, (int, float)):
            ranked.append({
                "skill": skill,
                "level": int(level),
                "description": _get_level_description(level),
                "category": _get_skill_category(skill)
            })
    return ranked

def _get_level_description(level: float) -> str:
    """Get description for proficiency level."""
    if isinstance(level, dict):
        return level.get("name", "Unknown")
    
    level = int(round(level))
    descriptions = {
        1: "Beginner - Just starting",
        2: "Elementary - Basic competency",
        3: "Intermediate - Solid working knowledge",
        4: "Advanced - Deep expertise",
        5: "Expert - Can mentor others",
        6: "Master - Industry-leading skills",
        7: "Pioneer - Thought leader"
    }
    return descriptions.get(level, "Unknown")

def _get_skill_category(skill: str) -> str:
    """Determine skill category."""
    skill_lower = skill.lower()
    
    for category, skills_dict in TECHNICAL_SKILLS.items():
        if any(s.lower() == skill_lower for s in skills_dict.keys()):
            return category
    
    if skill in SOFT_SKILLS:
        return "soft_skills"
    
    return "other"

def _compare_to_industry(skills: dict, industry: str) -> Dict[str, Any]:
    """Compare skills to industry requirements."""
    industry_reqs = INDUSTRY_SKILL_REQUIREMENTS.get(industry, {})
    critical_skills = industry_reqs.get("critical", [])
    
    covered_critical = sum(1 for skill in critical_skills 
                          if any(s.lower() == skill.lower() for s in skills.keys()))
    
    return {
        "critical_skills_coverage": f"{covered_critical}/{len(critical_skills)}",
        "coverage_percentage": (covered_critical / len(critical_skills) * 100) if critical_skills else 0,
        "missing_critical": [s for s in critical_skills if not any(sk.lower() == s.lower() for sk in skills.keys())]
    }

def identify_gaps(payload: dict) -> Dict[str, Any]:
    """Identify skill gaps vs target role/level."""
    is_valid, error = _validate_params(payload, ["current_skills"])
    if not is_valid:
        return {"success": False, "error": error}
    
    current_skills = payload.get("current_skills", {})
    target_role = payload.get("target_role", "")
    target_level = payload.get("target_level", 4)
    industry = payload.get("industry", "technology")
    
    # Get target skill profile
    target_profile = ROLE_SKILL_PROFILES.get(target_role.lower(), {})
    required_skills = target_profile.get("required", {})
    desired_skills = target_profile.get("desired", {})
    
    gaps = {
        "success": True,
        "gap_analysis": {
            "target_role": target_role if target_role else "Industry Standard",
            "target_level": target_level,
            "current_proficiency": _calculate_skill_profile(current_skills),
            "critical_gaps": _identify_critical_gaps(current_skills, required_skills),
            "development_gaps": _identify_dev_gaps(current_skills, desired_skills),
            "industry_gaps": _identify_industry_gaps(current_skills, industry),
            "gap_summary": _summarize_gaps(current_skills, required_skills, desired_skills),
            "priority_ranking": _rank_gaps_by_priority(current_skills, required_skills, desired_skills)
        }
    }
    return gaps

def _identify_critical_gaps(current: dict, required: dict) -> List[Dict[str, Any]]:
    """Identify critical skills gaps."""
    gaps = []
    
    for skill, required_level in required.items():
        current_level = current.get(skill, 0)
        if isinstance(current_level, dict) and 'value' in current_level:
            current_level = current_level['value']
        
        current_level = float(current_level) if isinstance(current_level, (int, float)) else 0
        
        if current_level < required_level:
            gap = required_level - current_level
            gaps.append({
                "skill": skill,
                "current_level": current_level,
                "required_level": required_level,
                "gap_size": gap,
                "priority": "critical"
            })
    
    return sorted(gaps, key=lambda x: x["gap_size"], reverse=True)

def _identify_dev_gaps(current: dict, desired: dict) -> List[Dict[str, Any]]:
    """Identify development/desired skill gaps."""
    gaps = []
    
    for skill, desired_level in desired.items():
        current_level = current.get(skill, 0)
        if isinstance(current_level, dict) and 'value' in current_level:
            current_level = current_level['value']
        
        current_level = float(current_level) if isinstance(current_level, (int, float)) else 0
        
        if current_level < desired_level:
            gap = desired_level - current_level
            gaps.append({
                "skill": skill,
                "current_level": current_level,
                "desired_level": desired_level,
                "gap_size": gap,
                "priority": "important"
            })
    
    return sorted(gaps, key=lambda x: x["gap_size"], reverse=True)

def _identify_industry_gaps(current: dict, industry: str) -> List[str]:
    """Identify gaps vs industry standards."""
    industry_critical = INDUSTRY_SKILL_REQUIREMENTS.get(industry, {}).get("critical", [])
    
    gaps = [skill for skill in industry_critical 
            if not any(s.lower() == skill.lower() for s in current.keys())]
    
    return gaps

def _summarize_gaps(current: dict, required: dict, desired: dict) -> Dict[str, str]:
    """Summarize the gap analysis."""
    critical_gaps = _identify_critical_gaps(current, required)
    dev_gaps = _identify_dev_gaps(current, desired)
    
    summary = {
        "critical_skills_missing": len(critical_gaps),
        "development_skills_missing": len(dev_gaps),
        "total_gaps": len(critical_gaps) + len(dev_gaps),
        "gap_severity": "Critical" if len(critical_gaps) > 3 else 
                       "Moderate" if len(critical_gaps) > 0 else "Minimal",
        "estimated_closure_months": _estimate_gap_closure_time(critical_gaps)
    }
    return summary

def _estimate_gap_closure_time(gaps: List[Dict[str, Any]]) -> int:
    """Estimate months needed to close gaps."""
    if not gaps:
        return 0
    
    # Rough estimate: ~2 months per skill level improvement
    total_gap = sum(gap["gap_size"] for gap in gaps)
    return int(total_gap * 2)

def _rank_gaps_by_priority(current: dict, required: dict, desired: dict) -> List[Dict[str, Any]]:
    """Rank gaps by priority for closure."""
    all_gaps = []
    
    # Add critical gaps
    for skill, req_level in required.items():
        current_level = current.get(skill, 0)
        if isinstance(current_level, dict):
            current_level = current_level.get('value', 0)
        current_level = float(current_level) if isinstance(current_level, (int, float)) else 0
        
        if current_level < req_level:
            all_gaps.append({
                "skill": skill,
                "gap": req_level - current_level,
                "priority": 1,
                "type": "critical"
            })
    
    # Add desired gaps
    for skill, des_level in desired.items():
        current_level = current.get(skill, 0)
        if isinstance(current_level, dict):
            current_level = current_level.get('value', 0)
        current_level = float(current_level) if isinstance(current_level, (int, float)) else 0
        
        if current_level < des_level:
            all_gaps.append({
                "skill": skill,
                "gap": des_level - current_level,
                "priority": 2,
                "type": "developmental"
            })
    
    return sorted(all_gaps, key=lambda x: (x["priority"], -x["gap"]))

def recommend_learning(payload: dict) -> Dict[str, Any]:
    """Recommend learning paths and resources."""
    is_valid, error = _validate_params(payload, ["gaps"])
    if not is_valid:
        return {"success": False, "error": error}
    
    gaps = payload.get("gaps", [])
    if not isinstance(gaps, list):
        gaps = [gaps]
    
    current_level = payload.get("current_level", 3)
    timeframe_months = payload.get("timeframe_months", 6)
    
    recommendations = {
        "success": True,
        "learning_recommendations": {
            "targeted_skills": [gap if isinstance(gap, str) else gap.get("skill", "") for gap in gaps if gap],
            "learning_paths": _generate_learning_paths(gaps, current_level),
            "resource_recommendations": _recommend_resources(gaps),
            "learning_schedule": _create_learning_schedule(gaps, timeframe_months),
            "certification_path": _recommend_certifications(gaps),
            "mentoring_suggestions": _suggest_mentoring(gaps),
            "estimated_effort": _estimate_learning_effort(gaps)
        }
    }
    return recommendations

def _generate_learning_paths(gaps: List[Any], current_level: int) -> List[Dict[str, Any]]:
    """Generate learning paths for identified gaps."""
    paths = []
    
    skill_list = [gap if isinstance(gap, str) else gap.get("skill", "") for gap in gaps if gap]
    
    for skill in skill_list[:5]:  # Top 5 gaps
        if skill in LEARNING_PATHS:
            learning_path = LEARNING_PATHS[skill]
            # Filter for current and above levels
            relevant_courses = [course for course in learning_path 
                              if course["level"] >= current_level]
            paths.append({
                "skill": skill,
                "current_level": current_level,
                "courses": relevant_courses[:3],  # Next 3 courses
                "total_hours": sum(c["duration_hours"] for c in relevant_courses[:3]),
                "estimated_months": len(relevant_courses[:3]) * 1
            })
    
    return paths

def _recommend_resources(gaps: List[Any]) -> Dict[str, List[str]]:
    """Recommend learning resources."""
    resources = {
        "online_courses": [
            "Coursera - Professional Certificates",
            "LinkedIn Learning - Skill Development",
            "Udemy - Technical Training",
            "Pluralsight - IT and Tech Skills",
            "DataCamp - Data Science"
        ],
        "books": [
            "Technical: 'The Pragmatic Programmer'",
            "Leadership: 'Radical Candor'",
            "Management: 'Good to Great'",
            "Communication: 'Never Split the Difference'"
        ],
        "communities": [
            "Professional associations in your field",
            "Online communities (Reddit, Discord, Slack)",
            "Meetup groups for networking",
            "Industry conferences and webinars"
        ],
        "hands_on": [
            "Open source projects",
            "Side projects in target skills",
            "Internal cross-training programs",
            "Stretch assignments at current role"
        ]
    }
    return resources

def _create_learning_schedule(gaps: List[Any], months: int) -> Dict[str, Any]:
    """Create a realistic learning schedule."""
    months_per_gap = months // max(len(gaps), 1)
    
    schedule = {
        "total_duration_months": months,
        "phase_1": {
            "duration_weeks": 4,
            "focus": "Fundamentals of critical gaps",
            "effort_hours_per_week": 5,
            "milestones": ["Complete foundational course", "Set up practice environment"]
        },
        "phase_2": {
            "duration_weeks": 8,
            "focus": "Intermediate skill development",
            "effort_hours_per_week": 6,
            "milestones": ["Complete intermediate course", "Apply skills in project", "Build portfolio piece"]
        },
        "phase_3": {
            "duration_weeks": 12,
            "focus": "Advanced skills and application",
            "effort_hours_per_week": 5,
            "milestones": ["Advanced training completion", "Real-world application", "Demonstrate competency"]
        },
        "monthly_checkpoints": [
            "Month 1: Assess learning progress",
            "Month 2: Adjust pace/resources if needed",
            f"Month {months//2}: Mid-way evaluation",
            f"Month {months}: Final assessment and certification"
        ]
    }
    return schedule

def _recommend_certifications(gaps: List[Any]) -> List[Dict[str, str]]:
    """Recommend relevant certifications."""
    certifications = [
        {
            "name": "AWS Certified Solutions Architect",
            "relevance": "Cloud and DevOps skills",
            "duration_months": 3,
            "cost": "$300 exam"
        },
        {
            "name": "Google Cloud Professional Data Engineer",
            "relevance": "Data and Cloud skills",
            "duration_months": 3,
            "cost": "$200 exam"
        },
        {
            "name": "Certified Kubernetes Administrator (CKA)",
            "relevance": "Container and orchestration",
            "duration_months": 2,
            "cost": "$395 exam"
        },
        {
            "name": "Project Management Professional (PMP)",
            "relevance": "Project management and leadership",
            "duration_months": 4,
            "cost": "$555 exam"
        },
        {
            "name": "Certified Information Security Manager (CISM)",
            "relevance": "Security and compliance",
            "duration_months": 4,
            "cost": "$749 exam"
        }
    ]
    return certifications[:3]

def _suggest_mentoring(gaps: List[Any]) -> Dict[str, str]:
    """Suggest mentoring approach."""
    return {
        "mentoring_type": "1-on-1 with experienced professional",
        "frequency": "Monthly 1-hour sessions",
        "focus": "Guidance, feedback, and accountability",
        "ideal_mentor": "Someone 5+ years ahead in target career path",
        "discussion_topics": [
            "Progress on learning goals",
            "Real-world application of new skills",
            "Career strategy and opportunities",
            "Industry trends and insights"
        ]
    }

def _estimate_learning_effort(gaps: List[Any]) -> Dict[str, Any]:
    """Estimate total learning effort required."""
    gap_count = len([g for g in gaps if g])
    
    return {
        "total_skills": gap_count,
        "estimated_total_hours": gap_count * 40,  # ~40 hours per skill
        "estimated_months": max(gap_count * 2, 3),  # ~2 months per skill
        "weekly_commitment": "6-8 hours for optimal progress",
        "daily_commitment": "45-60 minutes daily",
        "difficulty": "Moderate" if gap_count <= 3 else "High" if gap_count <= 5 else "Very High"
    }

def benchmark_industry(payload: dict) -> Dict[str, Any]:
    """Benchmark skills against industry standards."""
    is_valid, error = _validate_params(payload, ["skills", "role", "industry"])
    if not is_valid:
        return {"success": False, "error": error}
    
    skills = payload.get("skills", {})
    role = payload.get("role", "").lower()
    industry = payload.get("industry", "").lower()
    experience_years = payload.get("experience_years", 0)
    
    if industry not in INDUSTRY_SKILL_REQUIREMENTS:
        return {"success": False, "error": f"Invalid industry: {industry}"}
    
    benchmark = {
        "success": True,
        "benchmark_analysis": {
            "your_profile": _calculate_skill_profile(skills),
            "industry_standards": _get_industry_standards(role, industry),
            "benchmark_comparison": _compare_to_benchmark(skills, role, industry),
            "percentile_ranking": _calculate_percentile(skills, role, industry),
            "competitiveness": _assess_competitiveness(skills, role, industry, experience_years),
            "benchmark_insights": _generate_benchmark_insights(skills, role, industry)
        }
    }
    return benchmark

def _get_industry_standards(role: str, industry: str) -> Dict[str, Any]:
    """Get industry standards for role."""
    profile = ROLE_SKILL_PROFILES.get(role, {})
    industry_reqs = INDUSTRY_SKILL_REQUIREMENTS.get(industry, {})
    
    return {
        "role": role if role else "General Professional",
        "industry": industry,
        "expected_level": profile.get("level", "mid"),
        "critical_skills": industry_reqs.get("critical", []),
        "important_skills": industry_reqs.get("important", []),
        "emerging_skills": industry_reqs.get("emerging", [])
    }

def _compare_to_benchmark(skills: dict, role: str, industry: str) -> Dict[str, Any]:
    """Compare current skills to benchmark."""
    role_profile = ROLE_SKILL_PROFILES.get(role, {})
    required_skills = role_profile.get("required", {})
    
    alignment = {
        "strongly_aligned": [],
        "aligned": [],
        "developing": [],
        "missing": []
    }
    
    for skill, required_level in required_skills.items():
        current = skills.get(skill, 0)
        if isinstance(current, dict):
            current = current.get('value', 0)
        current = float(current) if isinstance(current, (int, float)) else 0
        
        if current >= required_level:
            alignment["strongly_aligned"].append(skill)
        elif current >= required_level - 1:
            alignment["aligned"].append(skill)
        elif current > 0:
            alignment["developing"].append(skill)
        else:
            alignment["missing"].append(skill)
    
    return alignment

def _calculate_percentile(skills: dict, role: str, industry: str) -> Dict[str, Any]:
    """Calculate percentile ranking."""
    profile = _calculate_skill_profile(skills)
    avg_level = profile.get("average_proficiency", 0)
    
    if avg_level >= 5:
        percentile = 90
    elif avg_level >= 4:
        percentile = 75
    elif avg_level >= 3:
        percentile = 50
    elif avg_level >= 2:
        percentile = 25
    else:
        percentile = 10
    
    return {
        "percentile": percentile,
        "interpretation": f"Top {100-percentile}% for {role}" if role else "Top tier professional",
        "competency_distribution": profile.get("average_proficiency", 0)
    }

def _assess_competitiveness(skills: dict, role: str, industry: str, years: int) -> str:
    """Assess overall competitiveness."""
    profile = _calculate_skill_profile(skills)
    avg_level = profile.get("average_proficiency", 0)
    
    if avg_level >= 4 and years >= 5:
        return "Highly Competitive - Well-positioned for advancement"
    elif avg_level >= 3.5 and years >= 3:
        return "Competitive - Good market positioning"
    elif avg_level >= 3:
        return "Moderately Competitive - Room for differentiation"
    else:
        return "Developing - Focus on skill building"

def _generate_benchmark_insights(skills: dict, role: str, industry: str) -> List[str]:
    """Generate insights from benchmark analysis."""
    insights = []
    profile = _calculate_skill_profile(skills)
    
    if profile["average_proficiency"] >= 4:
        insights.append("Your skills are above average for your level")
    
    if len(profile["expertise_areas"]) >= 3:
        insights.append("You have well-rounded expertise across multiple areas")
    
    industry_critical = INDUSTRY_SKILL_REQUIREMENTS.get(industry, {}).get("critical", [])
    covered = sum(1 for skill in industry_critical if skill in skills)
    if covered / len(industry_critical) < 0.5:
        insights.append(f"Consider developing more {industry} industry-specific skills")
    
    return insights

def assess_proficiency(payload: dict) -> Dict[str, Any]:
    """Assess proficiency in specific areas."""
    is_valid, error = _validate_params(payload, ["skill_area"])
    if not is_valid:
        return {"success": False, "error": error}
    
    skill_area = payload.get("skill_area", "")
    assessment_type = payload.get("assessment_type", "self")  # "self", "test", "practical"
    current_level = payload.get("current_level", 3)
    
    assessment = {
        "success": True,
        "proficiency_assessment": {
            "skill_area": skill_area,
            "assessment_type": assessment_type,
            "current_level": current_level,
            "level_description": _get_level_description(current_level),
            "capabilities_at_level": _list_capabilities(skill_area, current_level),
            "next_level_requirements": _next_level_requirements(skill_area, current_level),
            "assessment_framework": SFIA_LEVELS,
            "validation_methods": _suggest_validation_methods(skill_area)
        }
    }
    return assessment

def _list_capabilities(skill: str, level: int) -> List[str]:
    """List what someone can do at this level."""
    capabilities = {
        1: ["Understand basics", "Follow guidance", "Complete simple tasks"],
        2: ["Work semi-independently", "Handle standard situations", "Assist others"],
        3: ["Solve defined problems", "Work independently", "Make routine decisions"],
        4: ["Handle complex issues", "Guide and mentor", "Manage significant work"],
        5: ["Set strategy", "Drive initiatives", "Develop others"],
        6: ["Lead transformation", "Shape strategy", "Build capabilities"],
        7: ["Define enterprise direction", "Transform industry", "Thought leadership"]
    }
    return capabilities.get(level, [])

def _next_level_requirements(skill: str, current_level: int) -> List[str]:
    """Requirements to reach next level."""
    next_level = min(current_level + 1, 7)
    
    requirements = {
        2: ["Complete intermediate training", "Handle unsupervised tasks"],
        3: ["Develop problem-solving skills", "Take on independent projects"],
        4: ["Build mentoring capability", "Handle strategic decisions"],
        5: ["Develop organizational skills", "Drive significant initiatives"],
        6: ["Build thought leadership", "Transform practices"],
        7: ["Pioneer innovations", "Shape industry"]
    }
    return requirements.get(next_level, [])

def _suggest_validation_methods(skill: str) -> List[str]:
    """Suggest methods to validate proficiency."""
    return [
        "Certified assessment",
        "Project portfolio review",
        "Peer evaluation",
        "Practical demonstration",
        "Industry certification exam",
        "Manager validation",
        "Real-world project results"
    ]

def create_roadmap(payload: dict) -> Dict[str, Any]:
    """Create comprehensive skill development roadmap."""
    is_valid, error = _validate_params(payload, ["current_skills", "target_role"])
    if not is_valid:
        return {"success": False, "error": error}
    
    current = payload.get("current_skills", {})
    target_role = payload.get("target_role", "")
    timeline_months = payload.get("timeline_months", 12)
    
    roadmap = {
        "success": True,
        "development_roadmap": {
            "target_role": target_role,
            "timeline_months": timeline_months,
            "vision": _create_vision_statement(current, target_role),
            "phased_approach": _create_phased_roadmap(current, target_role, timeline_months),
            "key_milestones": _define_milestones(target_role, timeline_months),
            "resource_allocation": _allocate_resources(timeline_months),
            "success_metrics": _define_success_metrics(target_role),
            "risk_mitigation": _identify_risks_and_mitigations()
        }
    }
    return roadmap

def _create_vision_statement(current: dict, target_role: str) -> str:
    """Create vision statement for development."""
    return f"Develop comprehensive skills to transition to {target_role} role with demonstrated expertise across technical, leadership, and domain-specific competencies."

def _create_phased_roadmap(current: dict, target_role: str, months: int) -> List[Dict[str, Any]]:
    """Create phased development roadmap."""
    phases = []
    
    # Phase 1: Foundation
    phases.append({
        "phase": 1,
        "name": "Foundation Building",
        "duration_months": months // 3,
        "focus": "Close critical skill gaps",
        "key_activities": [
            "Identify specific gap areas",
            "Enroll in foundational training",
            "Find mentor in target field",
            "Start hands-on practice"
        ],
        "success_criteria": [
            "Complete foundational courses",
            "Establish learning routine",
            "Mentor relationship active"
        ]
    })
    
    # Phase 2: Development
    phases.append({
        "phase": 2,
        "name": "Skill Development",
        "duration_months": months // 3,
        "focus": "Build intermediate to advanced competency",
        "key_activities": [
            "Advanced skill training",
            "Apply skills in projects",
            "Build portfolio",
            "Seek stretch assignments"
        ],
        "success_criteria": [
            "Intermediate level achieved",
            "Portfolio projects completed",
            "Applied learning successfully"
        ]
    })
    
    # Phase 3: Mastery
    phases.append({
        "phase": 3,
        "name": "Mastery & Application",
        "duration_months": months // 3,
        "focus": "Achieve target competency level",
        "key_activities": [
            "Advanced projects",
            "Begin mentoring others",
            "Build thought leadership",
            "Pursue certification"
        ],
        "success_criteria": [
            "Target level achieved",
            "Can mentor others",
            "Ready for role transition"
        ]
    })
    
    return phases

def _define_milestones(role: str, months: int) -> List[Dict[str, str]]:
    """Define key milestones."""
    return [
        {"milestone": "Skill assessment complete", "month": 1},
        {"milestone": "Learning plan activated", "month": 1},
        {"milestone": "First certification/completion", "month": months // 3},
        {"milestone": "Mid-program evaluation", "month": months // 2},
        {"milestone": "Portfolio project completed", "month": 2 * months // 3},
        {"milestone": "Role readiness assessment", "month": months}
    ]

def _allocate_resources(months: int) -> Dict[str, Any]:
    """Allocate resources for development."""
    return {
        "time_commitment": "6-8 hours per week",
        "budget_estimate": f"${2000 + (months * 500)} for courses/certifications",
        "tools_and_platforms": ["Coursera", "LinkedIn Learning", "Udemy", "Industry-specific platforms"],
        "mentorship": "1 hour/month with experienced mentor",
        "support_network": ["Peer study groups", "Online communities", "Professional associations"]
    }

def _define_success_metrics(role: str) -> List[Dict[str, str]]:
    """Define how to measure success."""
    return [
        {"metric": "Skill level progression", "target": "Target level achieved"},
        {"metric": "Certifications earned", "target": "Relevant certifications complete"},
        {"metric": "Projects delivered", "target": "2+ portfolio projects completed"},
        {"metric": "Mentor feedback", "target": "Ready for target role"},
        {"metric": "Role transition", "target": "Secure position in target role"}
    ]

def _identify_risks_and_mitigations() -> List[Dict[str, str]]:
    """Identify risks and mitigation strategies."""
    return [
        {"risk": "Time commitment", "mitigation": "Schedule dedicated learning blocks"},
        {"risk": "Knowledge retention", "mitigation": "Apply learning through projects"},
        {"risk": "Motivation loss", "mitigation": "Track progress and celebrate wins"},
        {"risk": "Technology changes", "mitigation": "Focus on fundamentals + trending topics"},
        {"risk": "Skill obsolescence", "mitigation": "Continuous learning and updates"}
    ]

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
            "assess_skills": assess_skills,
            "identify_gaps": identify_gaps,
            "recommend_learning": recommend_learning,
            "benchmark_industry": benchmark_industry,
            "assess_proficiency": assess_proficiency,
            "create_roadmap": create_roadmap
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
