#!/usr/bin/env python3
"""
RESUME_OPTIMIZER Plugin - Resume analysis and optimization
Supports resume parsing, content analysis, formatting, ATS scoring, and job gap analysis.
"""

import sys
import json
import logging
import os
import re
from typing import Dict, Any, List, Tuple
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Resume Quality Standards
RESUME_SECTIONS = ["contact_info", "professional_summary", "experience", "education", "skills", "certifications"]

POWER_WORDS = [
    "Achieved", "Accelerated", "Accomplished", "Architected", "Built", "Collaborated",
    "Coordinated", "Designed", "Developed", "Drove", "Enhanced", "Established",
    "Executed", "Expanded", "Facilitated", "Formulated", "Generated", "Implemented",
    "Improved", "Increased", "Initiated", "Innovated", "Optimized", "Orchestrated",
    "Pioneered", "Recognized", "Reduced", "Restructured", "Spearheaded", "Streamlined"
]

ACTION_VERBS = [
    "Managed", "Led", "Oversaw", "Supervised", "Directed", "Coordinated", "Planned",
    "Analyzed", "Evaluated", "Assessed", "Created", "Produced", "Generated", "Designed",
    "Developed", "Deployed", "Implemented", "Executed", "Delivered", "Completed"
]

COMMON_ATS_KEYWORDS = {
    "technical": ["API", "Azure", "AWS", "Kubernetes", "Docker", "Python", "Java", "SQL", 
                  "JavaScript", "React", "Node.js", "DevOps", "Cloud", "Database"],
    "management": ["Leadership", "Project Management", "Team Building", "Strategic Planning",
                   "Budget Management", "Performance Management", "Change Management"],
    "business": ["ROI", "Revenue", "Cost Reduction", "Process Improvement", "Analytics",
                 "KPI", "Metrics", "Business Acumen", "Market Analysis"],
    "communication": ["Communication", "Presentation", "Negotiation", "Stakeholder Management",
                     "Documentation", "Collaboration", "Interpersonal"]
}

EDUCATION_KEYWORDS = {
    "degree": ["Bachelor", "Master", "PhD", "Associate", "Diploma", "Certificate"],
    "fields": ["Computer Science", "Business Administration", "Engineering", "Finance",
               "Marketing", "Healthcare", "Law", "Project Management"]
}

RESUME_FORMATS = {
    "chronological": "Lists work history from most recent to oldest",
    "functional": "Emphasizes skills and abilities",
    "combination": "Balances skills and work history",
    "targeted": "Customized for specific job"
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

def analyze_resume(payload: dict) -> Dict[str, Any]:
    """Analyze resume content and provide detailed feedback."""
    is_valid, error = _validate_params(payload, ["resume_content"])
    if not is_valid:
        return {"success": False, "error": error}
    
    content = payload.get("resume_content", "")
    candidate_name = payload.get("candidate_name", "Candidate")
    
    if not content or len(content) < 50:
        return {"success": False, "error": "Resume content too short or empty"}
    
    analysis = {
        "success": True,
        "analysis": {
            "candidate_name": candidate_name,
            "analysis_date": datetime.now().strftime("%Y-%m-%d"),
            "content_analysis": _analyze_content(content),
            "structure_analysis": _analyze_structure(content),
            "word_count": len(content.split()),
            "completeness_score": _calculate_completeness(content),
            "overall_assessment": _generate_overall_assessment(content)
        }
    }
    return analysis

def _analyze_content(content: str) -> Dict[str, Any]:
    """Analyze resume content quality."""
    content_lower = content.lower()
    
    power_word_count = sum(1 for word in POWER_WORDS if word.lower() in content_lower)
    action_verb_count = sum(1 for verb in ACTION_VERBS if verb.lower() in content_lower)
    
    # Quantifiable metrics detection
    metric_patterns = [
        r'\$[\d,]+',  # Dollar amounts
        r'[\d]+%',    # Percentages
        r'[\d]+\s*(projects?|clients?|teams?)',  # Numbers with context
        r'(increased|decreased|reduced|grew)\s+\w+\s+by\s+[\d]+'  # Metric statements
    ]
    
    metric_count = sum(1 for pattern in metric_patterns for _ in re.finditer(pattern, content, re.IGNORECASE))
    
    return {
        "power_words_found": power_word_count,
        "action_verbs_found": action_verb_count,
        "quantifiable_achievements": metric_count,
        "power_word_recommendation": "Excellent" if power_word_count > 10 else 
                                     "Good" if power_word_count > 5 else "Needs improvement",
        "metrics_recommendation": "Strong" if metric_count > 5 else 
                                 "Adequate" if metric_count > 2 else "Add quantifiable results",
        "tone_assessment": "Professional" if action_verb_count > 5 else "Could be more impactful"
    }

def _analyze_structure(content: str) -> Dict[str, Any]:
    """Analyze resume structure and organization."""
    lines = content.split('\n')
    section_count = 0
    
    structure_issues = []
    quality_indicators = []
    
    # Check for standard sections
    sections_found = []
    for section in RESUME_SECTIONS:
        if section.lower().replace('_', ' ') in content.lower():
            sections_found.append(section)
            section_count += 1
    
    if section_count < 4:
        structure_issues.append("Missing some standard sections")
    else:
        quality_indicators.append("All major sections present")
    
    # Check for contact info format
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    phone_pattern = r'[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}'
    
    has_email = bool(re.search(email_pattern, content))
    has_phone = bool(re.search(phone_pattern, content))
    
    if has_email and has_phone:
        quality_indicators.append("Contact information properly formatted")
    else:
        structure_issues.append("Missing or incomplete contact information")
    
    # Check length appropriateness
    word_count = len(content.split())
    if 300 <= word_count <= 800:
        quality_indicators.append("Appropriate length")
    elif word_count < 300:
        structure_issues.append("Resume too short - add more detail")
    else:
        structure_issues.append("Resume too long - condense content")
    
    return {
        "sections_found": sections_found,
        "section_count": section_count,
        "has_contact_info": has_email and has_phone,
        "structure_quality": "Strong" if len(quality_indicators) >= 3 else 
                            "Adequate" if len(quality_indicators) >= 2 else "Needs improvement",
        "quality_indicators": quality_indicators,
        "issues": structure_issues
    }

def _calculate_completeness(content: str) -> int:
    """Calculate resume completeness score (0-100)."""
    score = 0
    
    # Section presence (40 points)
    sections_present = sum(1 for section in RESUME_SECTIONS 
                          if section.lower().replace('_', ' ') in content.lower())
    score += min((sections_present / len(RESUME_SECTIONS)) * 40, 40)
    
    # Content quality (30 points)
    power_words = sum(1 for word in POWER_WORDS if word.lower() in content.lower())
    metrics = len(re.findall(r'[\d]+%|[\d]+\$|[\d]+\s+\w+', content))
    score += min((power_words / 10) * 15, 15)
    score += min((metrics / 10) * 15, 15)
    
    # Length appropriateness (20 points)
    word_count = len(content.split())
    if 300 <= word_count <= 800:
        score += 20
    elif 200 <= word_count <= 900:
        score += 15
    
    # Contact info (10 points)
    if re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', content):
        score += 5
    if re.search(r'[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}', content):
        score += 5
    
    return min(int(score), 100)

def _generate_overall_assessment(content: str) -> str:
    """Generate overall assessment of resume quality."""
    completeness = _calculate_completeness(content)
    
    if completeness >= 85:
        return "Excellent - Resume is comprehensive and well-formatted"
    elif completeness >= 70:
        return "Good - Resume has solid structure, some enhancements possible"
    elif completeness >= 55:
        return "Fair - Resume needs reorganization and additional detail"
    else:
        return "Poor - Resume needs significant improvements in structure and content"

def generate_suggestions(payload: dict) -> Dict[str, Any]:
    """Generate content improvement suggestions."""
    is_valid, error = _validate_params(payload, ["resume_content"])
    if not is_valid:
        return {"success": False, "error": error}
    
    content = payload.get("resume_content", "")
    target_role = payload.get("target_role", "")
    
    suggestions = {
        "success": True,
        "suggestions": {
            "content_improvements": _suggest_content_improvements(content),
            "power_words_to_add": _suggest_power_words(content),
            "metrics_to_highlight": _suggest_metrics(content),
            "section_enhancements": _suggest_section_enhancements(content),
            "target_role_specific": _get_role_specific_suggestions(target_role) if target_role else None
        }
    }
    return suggestions

def _suggest_content_improvements(content: str) -> List[str]:
    """Suggest content improvements."""
    suggestions = []
    
    if len(content.split()) < 400:
        suggestions.append("Expand content - add more detail about accomplishments")
    
    action_verb_count = sum(1 for verb in ACTION_VERBS if verb.lower() in content.lower())
    if action_verb_count < 10:
        suggestions.append("Start bullet points with stronger action verbs")
    
    if not re.search(r'[\d]+%|[\d]+\s*\$|[\d]+\s+(projects?|clients?)', content, re.IGNORECASE):
        suggestions.append("Add quantifiable metrics to your achievements")
    
    if len(re.findall(r'[.!?]', content)) < 10:
        suggestions.append("Break down long paragraphs into bullet points")
    
    return suggestions

def _suggest_power_words(content: str) -> List[str]:
    """Suggest power words to add."""
    content_lower = content.lower()
    suggested_words = []
    
    for word in POWER_WORDS:
        if word.lower() not in content_lower:
            suggested_words.append(word)
    
    return suggested_words[:10]  # Return top 10 suggestions

def _suggest_metrics(content: str) -> List[str]:
    """Suggest metrics to highlight."""
    suggestions = []
    
    if "increased" in content.lower() and not re.search(r'increased.*[\d]+', content, re.IGNORECASE):
        suggestions.append("Specify percentage increase (e.g., 'Increased revenue by 25%')")
    
    if "team" in content.lower() and not re.search(r'team.*[\d]+', content, re.IGNORECASE):
        suggestions.append("Mention team size managed (e.g., 'Led team of 8 developers')")
    
    if "project" in content.lower() and not re.search(r'[\d]+\s*project', content, re.IGNORECASE):
        suggestions.append("Quantify projects delivered (e.g., 'Delivered 15+ projects')")
    
    if "cost" in content.lower() and not re.search(r'[\d]+\$|[\d]+k', content, re.IGNORECASE):
        suggestions.append("Add cost savings amounts (e.g., 'Reduced costs by $500K')")
    
    return suggestions

def _suggest_section_enhancements(content: str) -> Dict[str, List[str]]:
    """Suggest enhancements by section."""
    enhancements = {}
    
    if "summary" in content.lower():
        enhancements["professional_summary"] = [
            "Include 2-3 key achievements",
            "Mention years of experience",
            "Highlight relevant expertise"
        ]
    
    if "experience" in content.lower():
        enhancements["experience"] = [
            "Add metrics to each role",
            "Use consistent date format",
            "Include company size/industry context"
        ]
    
    if "education" in content.lower():
        enhancements["education"] = [
            "Include graduation date",
            "Add relevant coursework if recent graduate",
            "Mention honors/GPA if strong"
        ]
    
    if "skill" in content.lower():
        enhancements["skills"] = [
            "Organize by category",
            "List in order of proficiency",
            "Include proficiency levels"
        ]
    
    return enhancements

def _get_role_specific_suggestions(target_role: str) -> List[str]:
    """Get role-specific enhancement suggestions."""
    role_lower = target_role.lower()
    
    role_guidance = {
        "manager": ["Highlight team leadership experience", "Emphasize strategic initiatives",
                   "Show P&L responsibility"],
        "developer": ["Showcase technical projects", "Mention programming languages used",
                     "Include GitHub/portfolio link"],
        "analyst": ["Highlight data analysis achievements", "Show reporting experience",
                   "Mention tools used (SQL, Tableau, etc.)"],
        "consultant": ["Emphasize client impact", "Show problem-solving approach",
                      "Include business metrics"],
        "accountant": ["Highlight compliance expertise", "Show financial management",
                      "Mention relevant certifications"],
        "default": ["Tailor to job description", "Highlight relevant achievements",
                   "Include industry-specific skills"]
    }
    
    for key in role_guidance:
        if key in role_lower:
            return role_guidance[key]
    return role_guidance["default"]

def optimize_keywords(payload: dict) -> Dict[str, Any]:
    """Optimize keywords for ATS and search visibility."""
    is_valid, error = _validate_params(payload, ["resume_content"])
    if not is_valid:
        return {"success": False, "error": error}
    
    content = payload.get("resume_content", "")
    target_job_desc = payload.get("target_job_description", "")
    industry = payload.get("industry", "general")
    
    optimization = {
        "success": True,
        "keyword_optimization": {
            "found_keywords": _identify_keywords(content),
            "missing_keywords": _identify_missing_keywords(content, industry),
            "job_match_keywords": _extract_job_keywords(target_job_desc) if target_job_desc else None,
            "keyword_recommendations": _get_keyword_recommendations(content, industry),
            "keyword_placement_suggestions": _suggest_keyword_placement()
        }
    }
    return optimization

def _identify_keywords(content: str) -> Dict[str, List[str]]:
    """Identify existing keywords in resume."""
    keywords = {}
    
    for category, words in COMMON_ATS_KEYWORDS.items():
        found = [word for word in words if word.lower() in content.lower()]
        if found:
            keywords[category] = found
    
    return keywords

def _identify_missing_keywords(content: str, industry: str) -> List[str]:
    """Identify missing industry keywords."""
    content_lower = content.lower()
    missing = []
    
    category_keywords = COMMON_ATS_KEYWORDS.get(industry, COMMON_ATS_KEYWORDS["technical"])
    for keyword in category_keywords:
        if keyword.lower() not in content_lower:
            missing.append(keyword)
    
    return missing[:10]

def _extract_job_keywords(job_desc: str) -> List[str]:
    """Extract keywords from job description."""
    if not job_desc:
        return []
    
    # Simple keyword extraction - look for common technical terms
    keywords = []
    job_lower = job_desc.lower()
    
    for category, words in COMMON_ATS_KEYWORDS.items():
        for word in words:
            if word.lower() in job_lower:
                keywords.append(word)
    
    return list(set(keywords))  # Remove duplicates

def _get_keyword_recommendations(content: str, industry: str) -> List[str]:
    """Get keyword recommendations based on industry."""
    recommendations = []
    keywords = _identify_missing_keywords(content, industry)
    
    if keywords:
        recommendations.append(f"Add {industry} keywords: {', '.join(keywords[:5])}")
    
    # Check for technical depth
    tech_keywords = _identify_keywords(content).get("technical", [])
    if len(tech_keywords) < 5:
        recommendations.append("Expand technical skills section with specific tools/languages")
    
    # Check for business impact
    if "achieved" not in content.lower() and "increased" not in content.lower():
        recommendations.append("Use business impact keywords like 'Achieved', 'Increased', 'Improved'")
    
    return recommendations

def _suggest_keyword_placement() -> Dict[str, str]:
    """Suggest where to place keywords in resume."""
    return {
        "technical_skills": "List under 'Technical Skills' section",
        "industry_specific": "Integrate into achievement statements",
        "business_impact": "Use in professional summary and accomplishments",
        "soft_skills": "Mention in professional summary and throughout bullets",
        "certifications": "List in 'Certifications' section with keywords"
    }

def score_for_ats(payload: dict) -> Dict[str, Any]:
    """Score resume for ATS compatibility."""
    is_valid, error = _validate_params(payload, ["resume_content"])
    if not is_valid:
        return {"success": False, "error": error}
    
    content = payload.get("resume_content", "")
    
    scores = {
        "success": True,
        "ats_score": {
            "overall_score": _calculate_ats_score(content),
            "formatting_score": _score_formatting(content),
            "content_score": _score_ats_content(content),
            "keyword_score": _score_keywords(content),
            "structure_score": _score_structure_ats(content),
            "detailed_feedback": _generate_ats_feedback(content),
            "improvement_priorities": _prioritize_improvements(content)
        }
    }
    return scores

def _calculate_ats_score(content: str) -> int:
    """Calculate overall ATS score (0-100)."""
    score = 0
    
    # Formatting (25 points)
    score += _score_formatting(content) // 4
    
    # Content (25 points)
    score += _score_ats_content(content) // 4
    
    # Keywords (25 points)
    score += _score_keywords(content) // 4
    
    # Structure (25 points)
    score += _score_structure_ats(content) // 4
    
    return min(score, 100)

def _score_formatting(content: str) -> int:
    """Score formatting compliance (0-100)."""
    score = 50  # Base score
    
    # Check for simple formatting
    if "\n" in content:
        score += 10  # Has line breaks
    
    if not re.search(r'[^a-zA-Z0-9\s\-\.,]', content):
        score += 15  # Clean characters (no special symbols)
    
    if len(content.split()) > 200:
        score += 10  # Adequate content
    
    if not re.search(r'[^\x00-\x7F]', content):
        score += 15  # ASCII-friendly
    
    return min(score, 100)

def _score_ats_content(content: str) -> int:
    """Score content quality for ATS (0-100)."""
    score = 0
    
    # Word count
    word_count = len(content.split())
    if word_count > 250:
        score += 20
    if word_count > 400:
        score += 15
    
    # Action verbs
    action_count = sum(1 for verb in ACTION_VERBS if verb.lower() in content.lower())
    score += min(action_count * 2, 20)
    
    # Metrics
    metric_count = len(re.findall(r'[\d]+%|[\d]+\$|[\d]+\s+\w+', content))
    score += min(metric_count * 3, 25)
    
    # Contact info
    if re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', content):
        score += 10
    
    # Education
    if any(keyword in content for keyword in EDUCATION_KEYWORDS["degree"]):
        score += 10
    
    return min(score, 100)

def _score_keywords(content: str) -> int:
    """Score keyword usage (0-100)."""
    score = 0
    content_lower = content.lower()
    
    # Count ATS keywords found
    keyword_count = 0
    for category, words in COMMON_ATS_KEYWORDS.items():
        keyword_count += sum(1 for word in words if word.lower() in content_lower)
    
    score = min((keyword_count / 20) * 100, 100)
    return int(score)

def _score_structure_ats(content: str) -> int:
    """Score structure for ATS parsing (0-100)."""
    score = 50
    
    # Check for sections
    sections_found = sum(1 for section in RESUME_SECTIONS 
                        if section.lower().replace('_', ' ') in content.lower())
    score += min(sections_found * 5, 25)
    
    # Check for bullet points or clear breaks
    if "•" in content or "-" in content or content.count("\n") > 10:
        score += 15
    
    # Check for consistent formatting
    if content.count("\n\n") > 2:
        score += 10
    
    return min(score, 100)

def _generate_ats_feedback(content: str) -> List[str]:
    """Generate ATS feedback."""
    feedback = []
    score = _calculate_ats_score(content)
    
    if score >= 80:
        feedback.append("Excellent - Resume is ATS-friendly")
    elif score >= 60:
        feedback.append("Good - Resume should parse well, minor improvements possible")
    else:
        feedback.append("Needs improvement - Resume may not parse correctly")
    
    if not re.search(r'[^a-zA-Z0-9\s\-\.,]', content):
        feedback.append("✓ Clean formatting without problematic symbols")
    else:
        feedback.append("⚠ Contains special characters that may confuse ATS")
    
    if "\n" in content and len(content.split()) > 300:
        feedback.append("✓ Good structure with clear line breaks")
    else:
        feedback.append("⚠ Consider adding more line breaks for clarity")
    
    return feedback

def _prioritize_improvements(content: str) -> List[str]:
    """Prioritize improvements for ATS optimization."""
    improvements = []
    score = _calculate_ats_score(content)
    
    if score < 70:
        improvements.append("Priority 1: Reorganize content into clear sections")
        improvements.append("Priority 2: Add more industry keywords")
        improvements.append("Priority 3: Enhance formatting for ATS readability")
    elif score < 85:
        improvements.append("Priority: Increase keyword relevance")
        improvements.append("Secondary: Improve formatting consistency")
    else:
        improvements.append("Resume is well-optimized for ATS")
        improvements.append("Consider adding more metrics for stronger impact")
    
    return improvements

def compare_to_job(payload: dict) -> Dict[str, Any]:
    """Compare resume to job description and identify gaps."""
    is_valid, error = _validate_params(payload, ["resume_content", "job_description"])
    if not is_valid:
        return {"success": False, "error": error}
    
    resume = payload.get("resume_content", "")
    job_desc = payload.get("job_description", "")
    
    comparison = {
        "success": True,
        "gap_analysis": {
            "match_score": _calculate_match_score(resume, job_desc),
            "matching_skills": _find_matching_skills(resume, job_desc),
            "missing_skills": _identify_skill_gaps(resume, job_desc),
            "required_keywords": _extract_job_requirements(job_desc),
            "found_keywords": _find_keywords_in_resume(resume, job_desc),
            "recommendations_for_match": _get_match_recommendations(resume, job_desc)
        }
    }
    return comparison

def _calculate_match_score(resume: str, job_desc: str) -> int:
    """Calculate resume-to-job match score (0-100)."""
    if not job_desc:
        return 0
    
    # Extract keywords from job description
    job_keywords = _extract_job_requirements(job_desc)
    if not job_keywords:
        return 50  # Default if no keywords found
    
    # Find how many are in resume
    resume_lower = resume.lower()
    matches = sum(1 for keyword in job_keywords 
                 if keyword.lower() in resume_lower)
    
    match_percentage = (matches / len(job_keywords)) * 100
    return min(int(match_percentage), 100)

def _find_matching_skills(resume: str, job_desc: str) -> List[str]:
    """Find skills that appear in both resume and job description."""
    resume_lower = resume.lower()
    job_lower = job_desc.lower()
    
    matching = []
    for category, words in COMMON_ATS_KEYWORDS.items():
        for word in words:
            word_lower = word.lower()
            if word_lower in resume_lower and word_lower in job_lower:
                matching.append(word)
    
    return list(set(matching))

def _identify_skill_gaps(resume: str, job_desc: str) -> List[str]:
    """Identify skills in job description but missing from resume."""
    resume_lower = resume.lower()
    job_lower = job_desc.lower()
    
    gaps = []
    for category, words in COMMON_ATS_KEYWORDS.items():
        for word in words:
            word_lower = word.lower()
            if word_lower in job_lower and word_lower not in resume_lower:
                gaps.append(word)
    
    return list(set(gaps))

def _extract_job_requirements(job_desc: str) -> List[str]:
    """Extract key requirements from job description."""
    requirements = []
    
    for category, words in COMMON_ATS_KEYWORDS.items():
        for word in words:
            if word.lower() in job_desc.lower():
                requirements.append(word)
    
    return list(set(requirements))

def _find_keywords_in_resume(resume: str, job_desc: str) -> List[str]:
    """Find job description keywords in resume."""
    job_requirements = _extract_job_requirements(job_desc)
    resume_lower = resume.lower()
    
    found = [keyword for keyword in job_requirements 
            if keyword.lower() in resume_lower]
    
    return list(set(found))

def _get_match_recommendations(resume: str, job_desc: str) -> List[str]:
    """Get recommendations to improve job match."""
    match_score = _calculate_match_score(resume, job_desc)
    gaps = _identify_skill_gaps(resume, job_desc)
    
    recommendations = []
    
    if match_score < 50:
        recommendations.append("Consider if this is the right role - significant skill gaps exist")
    elif match_score < 75:
        recommendations.append("Add highlighted skills from job description to strengthen match")
    else:
        recommendations.append("Good match - tailor professional summary to emphasize relevant experience")
    
    if gaps:
        recommendations.append(f"Address key gaps: {', '.join(gaps[:5])}")
    
    return recommendations

def suggest_improvements(payload: dict) -> Dict[str, Any]:
    """Generate comprehensive improvement suggestions."""
    is_valid, error = _validate_params(payload, ["resume_content"])
    if not is_valid:
        return {"success": False, "error": error}
    
    content = payload.get("resume_content", "")
    target_role = payload.get("target_role", "")
    
    improvements = {
        "success": True,
        "improvement_plan": {
            "immediate_actions": _get_immediate_improvements(content),
            "medium_term_improvements": _get_medium_improvements(content),
            "long_term_enhancements": _get_long_term_improvements(target_role),
            "priority_checklist": _create_improvement_checklist(content),
            "estimated_impact": _estimate_improvement_impact(content)
        }
    }
    return improvements

def _get_immediate_improvements(content: str) -> List[str]:
    """Get immediate improvements (can be done today)."""
    improvements = []
    
    # Check formatting
    if content.count("\n") < 15:
        improvements.append("Add line breaks to organize content")
    
    # Check for contact info
    if not re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', content):
        improvements.append("Add email address")
    
    # Check for metrics
    if not re.search(r'[\d]+%|[\d]+\$', content):
        improvements.append("Add 2-3 quantifiable metrics")
    
    # Check for power words
    if len([w for w in POWER_WORDS if w.lower() in content.lower()]) < 5:
        improvements.append("Replace weak verbs with power words")
    
    return improvements

def _get_medium_improvements(content: str) -> List[str]:
    """Get medium-term improvements (1-2 weeks)."""
    return [
        "Restructure experience section with achievement focus",
        "Update skills section with relevant categories",
        "Add professional summary or objective statement",
        "Include 2-3 concrete examples of impact"
    ]

def _get_long_term_improvements(target_role: str) -> List[str]:
    """Get long-term improvements for career goal."""
    if not target_role:
        return ["Build portfolio of relevant projects", "Pursue relevant certifications"]
    
    role_lower = target_role.lower()
    improvements = [
        f"Gain experience in {target_role} domain",
        "Build portfolio demonstrating target role skills"
    ]
    
    if "manager" in role_lower:
        improvements.append("Document leadership achievements")
    elif "senior" in role_lower or "lead" in role_lower:
        improvements.append("Build thought leadership through speaking/writing")
    
    return improvements

def _create_improvement_checklist(content: str) -> List[Dict[str, Any]]:
    """Create checklist for resume improvements."""
    return [
        {"task": "Add email and phone number", "priority": "Critical"},
        {"task": "Add professional summary", "priority": "High"},
        {"task": "Quantify achievements with metrics", "priority": "High"},
        {"task": "Use power verbs consistently", "priority": "Medium"},
        {"task": "Organize skills by category", "priority": "Medium"},
        {"task": "Ensure consistent date formatting", "priority": "Low"},
        {"task": "Add relevant certifications", "priority": "Medium"},
        {"task": "Include key industry terms", "priority": "High"}
    ]

def _estimate_improvement_impact(content: str) -> Dict[str, str]:
    """Estimate impact of improvements."""
    return {
        "formatting": "Could increase ATS pass-through by 20-30%",
        "metrics": "Increases interview callbacks by 15-25%",
        "power_words": "Improves initial screening impression by 20%",
        "keywords": "Improves search ranking and ATS matching by 30-40%",
        "structure": "Enhances readability and reduces screening time"
    }

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
            "analyze_resume": analyze_resume,
            "generate_suggestions": generate_suggestions,
            "optimize_keywords": optimize_keywords,
            "score_for_ats": score_for_ats,
            "compare_to_job": compare_to_job,
            "suggest_improvements": suggest_improvements
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
