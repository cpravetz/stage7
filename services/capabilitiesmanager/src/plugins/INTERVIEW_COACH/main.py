#!/usr/bin/env python3
"""
INTERVIEW_COACH Plugin - Interview preparation and coaching
Supports question generation, answer evaluation, feedback, practice tracking, and performance scoring.
"""

import sys
import json
import logging
import os
import random
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Interview Question Bank
BEHAVIORAL_QUESTIONS = [
    "Tell me about a time when you had to handle a conflict with a team member.",
    "Describe a situation where you had to meet a tight deadline.",
    "Give an example of when you had to take on a leadership role.",
    "Tell me about a time you made a mistake and how you handled it.",
    "Describe a situation where you had to adapt to change quickly.",
    "Tell me about your biggest professional achievement.",
    "How have you motivated a team in a challenging situation?",
    "Describe a time when you disagreed with your manager.",
    "Tell me about a time you improved a process or system.",
    "Describe a situation where you had to work with a difficult person."
]

TECHNICAL_QUESTIONS = {
    "software_development": [
        "Design a URL shortening service (like bit.ly).",
        "Explain the differences between SQL and NoSQL databases.",
        "How would you optimize a slow database query?",
        "Describe your approach to writing testable code.",
        "Explain the principles of SOLID design.",
        "How would you implement caching in your application?",
        "Describe different ways to handle errors in your code.",
        "Explain microservices architecture and its benefits.",
        "How would you approach debugging a production issue?",
        "Design a real-time notification system."
    ],
    "data_science": [
        "How would you handle missing data in a dataset?",
        "Explain the difference between correlation and causation.",
        "How do you detect and handle outliers?",
        "Describe your approach to feature engineering.",
        "Explain overfitting and how to prevent it.",
        "How would you evaluate a classification model?",
        "Describe your approach to A/B testing.",
        "How do you handle imbalanced datasets?",
        "Explain bias-variance tradeoff.",
        "How would you deploy a machine learning model?"
    ],
    "product_management": [
        "How would you define success for a new product?",
        "Walk me through your product development process.",
        "How do you prioritize features for development?",
        "Describe your approach to competitive analysis.",
        "How would you measure user engagement?",
        "Tell me about a product decision you made and why.",
        "How do you gather and incorporate customer feedback?",
        "Explain your approach to product strategy.",
        "How would you launch a new product?",
        "How do you handle conflicting stakeholder needs?"
    ]
}

SITUATIONAL_QUESTIONS = [
    "You discover a critical bug in production. What do you do?",
    "Your project timeline is slipping. How do you respond?",
    "You realize a colleague is struggling. What do you do?",
    "You don't understand something your manager explained. How do you handle it?",
    "You're assigned a task you've never done before. What's your approach?",
    "You notice a teammate isn't pulling their weight. How do you address it?",
    "Your suggestion is rejected by management. How do you respond?",
    "You're overwhelmed with tasks. How do you prioritize?",
    "You need to deliver bad news to a stakeholder. How do you approach it?",
    "A process you own isn't working. What do you do?"
]

COMPANY_SPECIFIC_QUESTIONS = {
    "tech": [
        "Why do you want to work at a tech company?",
        "Tell me about your experience with agile development.",
        "How do you stay current with technology trends?",
        "Describe your experience with code reviews.",
        "How do you approach technical debt?"
    ],
    "finance": [
        "Why are you interested in finance?",
        "Tell me about your experience with financial modeling.",
        "How do you approach risk assessment?",
        "Describe your experience with regulatory compliance.",
        "How do you stay informed about market trends?"
    ],
    "healthcare": [
        "Why are you drawn to healthcare?",
        "Tell me about your patient care experience.",
        "How do you handle stressful situations?",
        "Describe your approach to continuing education.",
        "How do you ensure patient privacy and compliance?"
    ],
    "consulting": [
        "Why consulting interests you.",
        "Tell me about your problem-solving approach.",
        "Describe a project where you added value.",
        "How do you build client relationships?",
        "Tell me about your experience managing stakeholders."
    ]
}

# Answer Evaluation Criteria
ANSWER_CRITERIA = {
    "structure": {"max_points": 25, "description": "STAR method (Situation, Task, Action, Result)"},
    "content": {"max_points": 25, "description": "Relevance and depth of example"},
    "impact": {"max_points": 20, "description": "Quantifiable results and business impact"},
    "delivery": {"max_points": 15, "description": "Clarity, confidence, and articulation"},
    "reflection": {"max_points": 15, "description": "Learning and growth from experience"}
}

# Performance Metrics
PERFORMANCE_BENCHMARKS = {
    "excellent": {"score_range": (85, 100), "description": "Ready for offer"},
    "strong": {"score_range": (75, 84), "description": "Competitive candidate"},
    "good": {"score_range": (65, 74), "description": "Has potential, some gaps"},
    "fair": {"score_range": (50, 64), "description": "Significant prep needed"},
    "poor": {"score_range": (0, 49), "description": "Major areas for improvement"}
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

def generate_questions(payload: dict) -> Dict[str, Any]:
    """Generate interview questions based on role and type."""
    is_valid, error = _validate_params(payload, ["question_type"])
    if not is_valid:
        return {"success": False, "error": error}
    
    q_type = payload.get("question_type", "behavioral").lower()
    role = payload.get("role", "general").lower()
    company = payload.get("company", "")
    difficulty = payload.get("difficulty", "medium").lower()
    count = payload.get("question_count", 5)
    
    valid_types = ["behavioral", "technical", "situational", "company_specific", "mixed"]
    if q_type not in valid_types:
        return {"success": False, "error": f"Invalid question type. Must be one of: {', '.join(valid_types)}"}
    
    questions = {
        "success": True,
        "interview_questions": {
            "generated_questions": _select_questions(q_type, role, company, count),
            "question_type": q_type,
            "role": role,
            "difficulty_level": difficulty,
            "preparation_tips": _get_preparation_tips(q_type),
            "common_mistakes": _get_common_mistakes(q_type),
            "star_method": _explain_star_method() if q_type == "behavioral" else None
        }
    }
    return questions

def _select_questions(q_type: str, role: str, company: str, count: int) -> List[Dict[str, str]]:
    """Select appropriate questions based on type."""
    selected = []
    
    if q_type == "behavioral":
        selected = random.sample(BEHAVIORAL_QUESTIONS, min(count, len(BEHAVIORAL_QUESTIONS)))
    elif q_type == "technical":
        tech_questions = TECHNICAL_QUESTIONS.get(role, TECHNICAL_QUESTIONS.get("software_development", []))
        selected = random.sample(tech_questions, min(count, len(tech_questions)))
    elif q_type == "situational":
        selected = random.sample(SITUATIONAL_QUESTIONS, min(count, len(SITUATIONAL_QUESTIONS)))
    elif q_type == "company_specific" and company:
        company_qs = COMPANY_SPECIFIC_QUESTIONS.get(company.lower(), [])
        selected = random.sample(company_qs, min(count, len(company_qs)))
    elif q_type == "mixed":
        selected = []
        selected += random.sample(BEHAVIORAL_QUESTIONS, count // 3)
        selected += random.sample(SITUATIONAL_QUESTIONS, count // 3)
        if role in TECHNICAL_QUESTIONS:
            tech_qs = TECHNICAL_QUESTIONS[role]
        else:
            tech_qs = TECHNICAL_QUESTIONS.get("software_development", [])
        selected += random.sample(tech_qs, count - (count // 3) * 2)
    
    return [{"id": i+1, "question": q} for i, q in enumerate(selected)]

def _get_preparation_tips(q_type: str) -> List[str]:
    """Get preparation tips for question type."""
    tips = {
        "behavioral": [
            "Use the STAR method (Situation, Task, Action, Result)",
            "Focus on your personal role and contribution",
            "Include specific metrics and outcomes",
            "Practice delivering answers in 2-3 minutes",
            "Prepare 5-7 diverse stories from different roles"
        ],
        "technical": [
            "Think out loud to show your problem-solving process",
            "Ask clarifying questions about requirements",
            "Start with high-level approach before diving into details",
            "Be ready to implement or write pseudocode",
            "Discuss tradeoffs and alternative approaches"
        ],
        "situational": [
            "Focus on your decision-making process",
            "Show awareness of different perspectives",
            "Explain your reasoning clearly",
            "Discuss what you learned from the situation",
            "Be honest about what you would do differently"
        ],
        "company_specific": [
            "Research company culture, products, and strategy",
            "Reference specific company initiatives or values",
            "Show how your experience aligns with company needs",
            "Ask informed questions about the company",
            "Demonstrate genuine interest"
        ]
    }
    return tips.get(q_type, [])

def _get_common_mistakes(q_type: str) -> List[str]:
    """Get common mistakes for question type."""
    mistakes = {
        "behavioral": [
            "Not using specific examples - staying too vague",
            "Focusing on team effort instead of personal contribution",
            "Not providing measurable results or outcomes",
            "Rambling too long - exceeding 3 minutes",
            "Telling stories that don't demonstrate required skills"
        ],
        "technical": [
            "Jumping to code without understanding the problem",
            "Not asking clarifying questions",
            "Writing inefficient solutions",
            "Not discussing complexity and tradeoffs",
            "Giving up too quickly"
        ],
        "situational": [
            "Providing unrealistic responses",
            "Not explaining your reasoning",
            "Deflecting responsibility",
            "Being defensive about past situations",
            "Not showing what you learned"
        ],
        "company_specific": [
            "Generic answers that could apply anywhere",
            "Not knowing basic company facts",
            "Criticizing company products or decisions",
            "Failing to connect experience to company needs",
            "Appearing disinterested"
        ]
    }
    return mistakes.get(q_type, [])

def _explain_star_method() -> Dict[str, str]:
    """Explain STAR method for behavioral questions."""
    return {
        "S": "Situation - Set the scene, provide context (20-30 seconds)",
        "T": "Task - What was your responsibility? (10-15 seconds)",
        "A": "Action - What did YOU specifically do? (1-1.5 minutes)",
        "R": "Result - What was the outcome? Include metrics (20-30 seconds)",
        "tip": "The Action section should be longest - focus on your contribution"
    }

def evaluate_answer(payload: dict) -> Dict[str, Any]:
    """Evaluate an interview answer."""
    is_valid, error = _validate_params(payload, ["question", "answer"])
    if not is_valid:
        return {"success": False, "error": error}
    
    question = payload.get("question", "")
    answer = payload.get("answer", "")
    question_type = payload.get("question_type", "behavioral")
    
    if not answer or len(answer) < 20:
        return {"success": False, "error": "Answer too short to evaluate"}
    
    evaluation = {
        "success": True,
        "answer_evaluation": {
            "question": question,
            "question_type": question_type,
            "scores": _score_answer(answer, question_type),
            "overall_score": 0,  # Will be calculated below
            "strengths": _identify_answer_strengths(answer, question_type),
            "weaknesses": _identify_answer_weaknesses(answer, question_type),
            "improvement_suggestions": _suggest_improvements(answer, question_type),
            "follow_up_questions": _generate_followups(question, answer),
            "rating": ""  # Will be set below
        }
    }
    
    # Calculate overall score
    scores = evaluation["answer_evaluation"]["scores"]
    overall = sum(scores.values())
    evaluation["answer_evaluation"]["overall_score"] = overall
    
    # Determine rating
    for rating, benchmark in PERFORMANCE_BENCHMARKS.items():
        if benchmark["score_range"][0] <= overall <= benchmark["score_range"][1]:
            evaluation["answer_evaluation"]["rating"] = f"{rating}: {benchmark['description']}"
            break
    
    return evaluation

def _score_answer(answer: str, question_type: str) -> Dict[str, int]:
    """Score answer across multiple criteria."""
    scores = {}
    
    for criterion, details in ANSWER_CRITERIA.items():
        max_points = details["max_points"]
        
        if criterion == "structure":
            if question_type == "behavioral":
                scores[criterion] = _score_structure(answer, max_points)
            else:
                scores[criterion] = max(15, max_points - 10)
        elif criterion == "content":
            scores[criterion] = _score_content(answer, max_points)
        elif criterion == "impact":
            scores[criterion] = _score_impact(answer, max_points)
        elif criterion == "delivery":
            scores[criterion] = _score_delivery(answer, max_points)
        elif criterion == "reflection":
            if "learned" in answer.lower() or "improve" in answer.lower():
                scores[criterion] = max(10, max_points - 5)
            else:
                scores[criterion] = 5
    
    return scores

def _score_structure(answer: str, max_points: int) -> int:
    """Score STAR structure (for behavioral questions)."""
    score = 0
    answer_lower = answer.lower()
    
    # Check for situation indicators
    if any(word in answer_lower for word in ["situation", "context", "background", "was working", "faced"]):
        score += max_points // 5
    
    # Check for task indicators
    if any(word in answer_lower for word in ["responsibility", "tasked", "assigned", "objective", "goal"]):
        score += max_points // 5
    
    # Check for action indicators
    if any(word in answer_lower for word in ["did", "implemented", "executed", "developed", "created", "built"]):
        score += max_points // 5
    
    # Check for result indicators
    if any(word in answer_lower for word in ["result", "outcome", "achieved", "completed", "success", "improved"]):
        score += max_points // 5
    
    # Check for metrics
    if any(char.isdigit() for char in answer):
        score += max_points // 5
    
    return min(score, max_points)

def _score_content(answer: str, max_points: int) -> int:
    """Score content relevance and depth."""
    score = 10  # Base score
    
    # Length indicates depth
    words = len(answer.split())
    if words > 150:
        score += 10
    elif words > 100:
        score += 5
    
    # Specific details
    if len(answer.split(", ")) > 3:  # Multiple points
        score += 5
    
    # Technical or industry specific terms
    if any(word in answer.lower() for word in ["data", "process", "system", "platform", "metric", "strategy"]):
        score += 5
    
    return min(score, max_points)

def _score_impact(answer: str, max_points: int) -> int:
    """Score quantifiable impact and results."""
    score = 5  # Base score
    
    # Check for numbers/metrics
    if any(char.isdigit() for char in answer):
        score += 8
    
    # Check for percentage improvements
    if "%" in answer or "percent" in answer.lower():
        score += 4
    
    # Check for business impact words
    if any(word in answer.lower() for word in ["revenue", "cost", "efficiency", "productivity", "growth", "increased", "reduced"]):
        score += 3
    
    return min(score, max_points)

def _score_delivery(answer: str, max_points: int) -> int:
    """Score clarity and articulation."""
    score = 5  # Base score
    
    # Check sentence structure (not all fragments)
    sentences = answer.split('.')
    if len(sentences) > 3:
        score += 5
    
    # Check for clear transitions
    if any(word in answer.lower() for word in ["then", "next", "after that", "as a result", "ultimately"]):
        score += 3
    
    # Logical flow
    if not answer.startswith("Um") and not answer.startswith("Like"):
        score += 2
    
    return min(score, max_points)

def _identify_answer_strengths(answer: str, question_type: str) -> List[str]:
    """Identify strengths in the answer."""
    strengths = []
    answer_lower = answer.lower()
    
    if len(answer.split()) > 100:
        strengths.append("Good level of detail")
    
    if any(char.isdigit() for char in answer):
        strengths.append("Includes quantifiable metrics")
    
    if "i" in answer_lower or "me" in answer_lower:
        strengths.append("Takes personal ownership")
    
    if any(word in answer_lower for word in ["learned", "improve", "growth", "develop"]):
        strengths.append("Shows learning mindset")
    
    if "%" in answer or "$" in answer:
        strengths.append("Demonstrates business awareness")
    
    return strengths if strengths else ["Answer covers the question"]

def _identify_answer_weaknesses(answer: str, question_type: str) -> List[str]:
    """Identify weaknesses in the answer."""
    weaknesses = []
    answer_lower = answer.lower()
    
    if len(answer.split()) < 80:
        weaknesses.append("Answer lacks sufficient detail")
    
    if not any(char.isdigit() for char in answer):
        weaknesses.append("No quantifiable metrics or numbers")
    
    if all(word not in answer_lower for word in ["i", "me", "my"]):
        weaknesses.append("Focuses on team rather than personal contribution")
    
    if all(word not in answer_lower for word in ["then", "next", "after", "result", "outcome"]):
        weaknesses.append("Unclear progression or impact")
    
    if "we" in answer_lower and "i" not in answer_lower:
        weaknesses.append("Over-emphasizes team effort instead of individual role")
    
    return weaknesses if weaknesses else []

def _suggest_improvements(answer: str, question_type: str) -> List[str]:
    """Suggest how to improve the answer."""
    suggestions = []
    
    if len(answer.split()) < 100:
        suggestions.append("Expand answer to 2-3 minutes length")
    
    if not any(char.isdigit() for char in answer):
        suggestions.append("Add specific numbers, percentages, or metrics")
    
    if "i did" not in answer.lower() and "i implemented" not in answer.lower():
        suggestions.append("Clearly state your personal actions using strong verbs")
    
    if question_type == "behavioral" and not any(word in answer.lower() for word in ["situation", "task", "action", "result"]):
        suggestions.append("Structure answer using STAR method (Situation, Task, Action, Result)")
    
    if "learned" not in answer.lower():
        suggestions.append("Explain what you learned and how you've applied it since")
    
    if not any(word in answer.lower() for word in ["then", "next", "subsequently", "as a result"]):
        suggestions.append("Use transition words to show logical progression")
    
    return suggestions

def _generate_followups(question: str, answer: str) -> List[str]:
    """Generate likely follow-up questions."""
    followups = []
    
    followups.append("Can you tell me more about the technical challenges you faced?")
    followups.append("How did you handle pushback or disagreement during this project?")
    followups.append("What would you do differently if you faced this situation again?")
    followups.append("How did you measure success for this project?")
    followups.append("Who did you collaborate with and how did you manage that relationship?")
    
    # Add specific follow-ups based on answer
    if "$" not in answer and "%" not in answer:
        followups.append("Can you quantify the business impact of your actions?")
    
    if "learned" not in answer.lower():
        followups.append("What was the most important thing you learned from this experience?")
    
    return followups[:3]

def provide_feedback(payload: dict) -> Dict[str, Any]:
    """Provide detailed feedback on interview performance."""
    is_valid, error = _validate_params(payload, ["session_scores"])
    if not is_valid:
        return {"success": False, "error": error}
    
    scores = payload.get("session_scores", {})
    interview_type = payload.get("interview_type", "behavioral")
    target_role = payload.get("target_role", "")
    
    feedback = {
        "success": True,
        "performance_feedback": {
            "session_analysis": _analyze_session(scores),
            "strong_areas": _identify_strong_areas(scores),
            "improvement_areas": _identify_improvement_areas(scores),
            "personalized_action_plan": _create_action_plan(scores, interview_type),
            "next_steps": _get_next_steps(scores),
            "resources": _recommend_resources(interview_type)
        }
    }
    return feedback

def _analyze_session(scores: dict) -> Dict[str, Any]:
    """Analyze overall session performance."""
    if not scores or not isinstance(scores, dict):
        return {"average_score": 0, "consistency": "Unable to analyze"}
    
    score_values = [v for v in scores.values() if isinstance(v, (int, float))]
    if not score_values:
        return {"average_score": 0, "consistency": "No scores available"}
    
    avg = sum(score_values) / len(score_values)
    max_score = max(score_values)
    min_score = min(score_values)
    variance = max_score - min_score
    
    consistency = "Highly consistent" if variance < 10 else "Somewhat variable" if variance < 20 else "Inconsistent"
    
    return {
        "average_score": round(avg, 1),
        "best_answer_score": max_score,
        "lowest_answer_score": min_score,
        "consistency": consistency,
        "question_count": len(score_values)
    }

def _identify_strong_areas(scores: dict) -> List[str]:
    """Identify strong performance areas."""
    strong = []
    
    if isinstance(scores, dict) and scores:
        avg = sum([v for v in scores.values() if isinstance(v, (int, float))]) / max(1, len([v for v in scores.values() if isinstance(v, (int, float))]))
        
        if avg >= 80:
            strong.append("Excellent overall performance")
        elif avg >= 70:
            strong.append("Strong fundamental skills")
        
        if any(v >= 85 for v in scores.values() if isinstance(v, (int, float))):
            strong.append("Demonstrated excellence in some answers")
    
    strong.extend([
        "Clear communication demonstrated",
        "Good structure in most answers",
        "Shows relevant experience"
    ])
    
    return strong

def _identify_improvement_areas(scores: dict) -> List[str]:
    """Identify areas for improvement."""
    improvements = []
    
    if isinstance(scores, dict) and scores:
        score_values = [v for v in scores.values() if isinstance(v, (int, float))]
        if score_values:
            low_scores = [v for v in score_values if v < 65]
            if low_scores:
                improvements.append(f"Consistency - {len(low_scores)} answer(s) scored below 65")
        
        # Check for low individual metrics
        low_count = sum(1 for v in score_values if v < 70)
        if low_count > 2:
            improvements.append("Multiple areas need strengthening")
    
    improvements.extend([
        "Quantify results with specific metrics",
        "Improve answer structure and flow",
        "Show greater personal ownership"
    ])
    
    return improvements

def _create_action_plan(scores: dict, interview_type: str) -> List[Dict[str, str]]:
    """Create personalized action plan."""
    return [
        {
            "priority": "High",
            "action": "Record and review your practice answers",
            "timeline": "This week",
            "expected_improvement": "Better self-awareness of delivery"
        },
        {
            "priority": "High",
            "action": "Add specific metrics to your stories",
            "timeline": "Before next interview",
            "expected_improvement": "+10-15 points on impact scores"
        },
        {
            "priority": "Medium",
            "action": "Practice with mock interviews weekly",
            "timeline": "2-3 weeks",
            "expected_improvement": "Increased confidence and consistency"
        },
        {
            "priority": "Medium",
            "action": "Research company and role thoroughly",
            "timeline": "Before interview",
            "expected_improvement": "Better contextual answers"
        },
        {
            "priority": "Low",
            "action": "Join interview preparation group",
            "timeline": "Optional",
            "expected_improvement": "Peer feedback and support"
        }
    ]

def _get_next_steps(scores: dict) -> List[str]:
    """Get next steps in interview preparation."""
    return [
        "Schedule mock interviews with mentors or peers",
        "Record yourself and review for improvements",
        "Study company/role-specific content",
        "Build a library of 10-15 strong stories",
        "Practice answering follow-up questions",
        "Research interviewer and company",
        "Plan your commute and logistics",
        "Get good sleep before interview",
        "Review key talking points morning-of",
        "Follow up with thank you note within 24 hours"
    ]

def _recommend_resources(interview_type: str) -> Dict[str, List[str]]:
    """Recommend preparation resources."""
    return {
        "books": [
            "'Cracking the Coding Interview' (technical roles)",
            "'Behavioral Interviews' (all roles)",
            "'The First 90 Days' (for context)"
        ],
        "online_resources": [
            "LeetCode (technical prep)",
            "Glassdoor (company-specific questions)",
            "LinkedIn (company research)",
            "CareerCup (interview practice)"
        ],
        "practice_platforms": [
            "Pramp (peer mock interviews)",
            "Interviewing.io (anonymized interviews)",
            "Big Interview (structured coaching)",
            "YouTube channels (mock interviews)"
        ]
    }

def track_practice(payload: dict) -> Dict[str, Any]:
    """Track practice session progress."""
    is_valid, error = _validate_params(payload, ["session_id"])
    if not is_valid:
        return {"success": False, "error": error}
    
    session_id = payload.get("session_id", "")
    questions_count = payload.get("questions_count", 0)
    answers_scores = payload.get("scores", {})
    duration_minutes = payload.get("duration_minutes", 0)
    
    tracking = {
        "success": True,
        "practice_tracking": {
            "session_details": {
                "session_id": session_id,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "time": datetime.now().strftime("%H:%M:%S"),
                "duration_minutes": duration_minutes,
                "questions_practiced": questions_count
            },
            "performance_metrics": _calculate_performance_metrics(answers_scores),
            "progress_analysis": _analyze_progress(answers_scores),
            "readiness_assessment": _assess_readiness(answers_scores),
            "recommendations": _get_recommendations(answers_scores)
        }
    }
    return tracking

def _calculate_performance_metrics(scores: dict) -> Dict[str, Any]:
    """Calculate performance metrics."""
    if not scores or not isinstance(scores, dict):
        return {"average_score": 0, "improvement_trend": "N/A"}
    
    score_values = [v for v in scores.values() if isinstance(v, (int, float))]
    if not score_values:
        return {"average_score": 0, "improvement_trend": "No data"}
    
    avg = sum(score_values) / len(score_values)
    
    return {
        "average_score": round(avg, 1),
        "highest_score": max(score_values),
        "lowest_score": min(score_values),
        "total_attempts": len(score_values),
        "passing_threshold": 70,
        "questions_above_threshold": sum(1 for s in score_values if s >= 70)
    }

def _analyze_progress(scores: dict) -> Dict[str, str]:
    """Analyze practice progress."""
    metrics = _calculate_performance_metrics(scores)
    avg = metrics.get("average_score", 0)
    
    if avg >= 80:
        trend = "Excellent - Consistently strong"
    elif avg >= 70:
        trend = "Good - Ready for interview"
    elif avg >= 60:
        trend = "Developing - Continue practice"
    else:
        trend = "Needs improvement - Increase practice frequency"
    
    return {
        "overall_trend": trend,
        "consistency": "Improving" if metrics.get("questions_above_threshold", 0) >= metrics.get("total_attempts", 1) * 0.7 else "Variable",
        "readiness": "High" if avg >= 75 else "Medium" if avg >= 65 else "Low"
    }

def _assess_readiness(scores: dict) -> Dict[str, Any]:
    """Assess interview readiness."""
    metrics = _calculate_performance_metrics(scores)
    avg = metrics.get("average_score", 0)
    
    readiness_levels = {
        "very_high": (85, 100),
        "high": (75, 84),
        "moderate": (65, 74),
        "low": (50, 64),
        "very_low": (0, 49)
    }
    
    for level, (min_score, max_score) in readiness_levels.items():
        if min_score <= avg <= max_score:
            readiness_level = level
            break
    else:
        readiness_level = "very_low"
    
    return {
        "readiness_level": readiness_level,
        "current_score": round(avg, 1),
        "target_score": 75,
        "estimated_weeks_to_ready": max(0, (75 - avg) / 2) if avg < 75 else 0,
        "recommendation": "Ready to interview" if avg >= 75 else "Continue practice for 1-2 more weeks"
    }

def _get_recommendations(scores: dict) -> List[str]:
    """Get personalized recommendations."""
    metrics = _calculate_performance_metrics(scores)
    avg = metrics.get("average_score", 0)
    
    recommendations = []
    
    if avg < 65:
        recommendations.append("Focus on STAR structure for behavioral questions")
    
    if avg < 75:
        recommendations.append("Practice 3-4 times per week for 1-2 weeks")
    
    if avg >= 75:
        recommendations.append("Ready for interviews - schedule real interviews soon")
    
    recommendations.append("Record and listen to your answers")
    recommendations.append("Get feedback from peers or mentors")
    
    return recommendations

def score_performance(payload: dict) -> Dict[str, Any]:
    """Calculate overall performance score."""
    is_valid, error = _validate_params(payload, ["scores"])
    if not is_valid:
        return {"success": False, "error": error}
    
    scores = payload.get("scores", {})
    
    performance = {
        "success": True,
        "performance_score": {
            "individual_scores": scores,
            "aggregate_analysis": _aggregate_scores(scores),
            "performance_rating": _rate_performance(scores),
            "percentile_ranking": _calculate_percentile_rank(scores),
            "benchmark_comparison": _compare_to_benchmarks(scores),
            "growth_potential": _assess_growth_potential(scores)
        }
    }
    return performance

def _aggregate_scores(scores: dict) -> Dict[str, Any]:
    """Aggregate individual scores."""
    if not scores or not isinstance(scores, dict):
        return {"total_score": 0, "average": 0, "question_count": 0}
    
    score_values = [v for v in scores.values() if isinstance(v, (int, float))]
    if not score_values:
        return {"total_score": 0, "average": 0, "question_count": 0}
    
    total = sum(score_values)
    avg = total / len(score_values)
    
    return {
        "total_score": total,
        "average": round(avg, 1),
        "question_count": len(score_values),
        "max_possible": len(score_values) * 100,
        "percentage": round((total / (len(score_values) * 100)) * 100, 1)
    }

def _rate_performance(scores: dict) -> Dict[str, str]:
    """Rate overall performance."""
    agg = _aggregate_scores(scores)
    avg = agg.get("average", 0)
    
    for rating, benchmark in PERFORMANCE_BENCHMARKS.items():
        if benchmark["score_range"][0] <= avg <= benchmark["score_range"][1]:
            return {
                "rating": rating.upper(),
                "description": benchmark["description"],
                "score": round(avg, 1)
            }
    
    return {"rating": "UNKNOWN", "description": "Unable to rate", "score": 0}

def _calculate_percentile_rank(scores: dict) -> int:
    """Calculate percentile ranking."""
    agg = _aggregate_scores(scores)
    avg = agg.get("average", 0)
    
    if avg >= 90:
        return 95
    elif avg >= 85:
        return 85
    elif avg >= 80:
        return 75
    elif avg >= 75:
        return 65
    elif avg >= 70:
        return 50
    elif avg >= 65:
        return 35
    elif avg >= 60:
        return 25
    else:
        return 10

def _compare_to_benchmarks(scores: dict) -> Dict[str, Any]:
    """Compare to industry benchmarks."""
    agg = _aggregate_scores(scores)
    avg = agg.get("average", 0)
    
    return {
        "your_score": round(avg, 1),
        "benchmark_good": 70,
        "benchmark_excellent": 85,
        "below_benchmark": avg < 70,
        "meets_benchmark": 70 <= avg < 85,
        "exceeds_benchmark": avg >= 85
    }

def _assess_growth_potential(scores: dict) -> str:
    """Assess growth potential and trajectory."""
    agg = _aggregate_scores(scores)
    avg = agg.get("average", 0)
    
    if avg >= 75:
        return "High - Likely to improve rapidly with focused practice"
    elif avg >= 65:
        return "Moderate - Can reach 80+ with consistent effort"
    else:
        return "Developing - Focus on fundamentals for next 2-4 weeks"

def recommend_improvements(payload: dict) -> Dict[str, Any]:
    """Recommend improvements based on performance."""
    is_valid, error = _validate_params(payload, ["performance_data"])
    if not is_valid:
        return {"success": False, "error": error}
    
    perf_data = payload.get("performance_data", {})
    weak_areas = payload.get("weak_areas", [])
    
    improvements = {
        "success": True,
        "improvement_recommendations": {
            "priority_areas": _prioritize_improvements(weak_areas),
            "improvement_strategies": _get_improvement_strategies(weak_areas),
            "practice_plan": _create_practice_plan(weak_areas),
            "expected_timeline": _estimate_improvement_timeline(weak_areas),
            "success_checkpoints": _define_checkpoints()
        }
    }
    return improvements

def _prioritize_improvements(weak_areas: list) -> List[Dict[str, str]]:
    """Prioritize improvement areas."""
    if not weak_areas:
        weak_areas = ["Overall structure", "Impact quantification", "Delivery clarity"]
    
    priority_map = {
        "structure": 1,
        "content": 2,
        "impact": 1,
        "delivery": 3,
        "reflection": 2
    }
    
    prioritized = []
    for area in weak_areas[:5]:
        area_lower = area.lower()
        priority = min([priority_map.get(key, 3) for key in priority_map if key in area_lower] or [3])
        prioritized.append({
            "area": area,
            "priority": f"P{priority}",
            "focus": f"Improve {area.lower()}"
        })
    
    return sorted(prioritized, key=lambda x: x["priority"])

def _get_improvement_strategies(weak_areas: list) -> Dict[str, List[str]]:
    """Get strategies to improve weak areas."""
    return {
        "structure": [
            "Practice STAR method with 5-10 stories",
            "Use story templates to organize thoughts",
            "Record and review your delivery"
        ],
        "content": [
            "Add more specific details and examples",
            "Research industry terminology",
            "Study company and role requirements"
        ],
        "impact": [
            "Quantify all achievements with numbers",
            "Calculate and include ROI",
            "Research relevant metrics for your field"
        ],
        "delivery": [
            "Practice speaking slowly and clearly",
            "Record and listen for filler words",
            "Join Toastmasters or speaking group"
        ]
    }

def _create_practice_plan(weak_areas: list) -> Dict[str, str]:
    """Create focused practice plan."""
    return {
        "frequency": "4-5 times per week",
        "duration": "30-45 minutes per session",
        "format": "Mix of written practice and mock interviews",
        "focus_areas": ", ".join(weak_areas[:3]) if weak_areas else "All areas",
        "weekly_goal": "Answer 15-20 practice questions",
        "monthly_goal": "Achieve 75+ average score"
    }

def _estimate_improvement_timeline(weak_areas: list) -> Dict[str, str]:
    """Estimate timeline for improvement."""
    num_areas = len(weak_areas) if weak_areas else 3
    weeks = max(2, (num_areas + 1) // 2)
    
    return {
        "estimated_weeks": weeks,
        "week_1_2": "Focus on structure and content",
        "week_3_4": "Add impact metrics and delivery",
        "expected_score_improvement": f"+15-25 points over {weeks} weeks",
        "target_readiness": f"{weeks} weeks"
    }

def _define_checkpoints() -> List[Dict[str, str]]:
    """Define success checkpoints."""
    return [
        {"checkpoint": "Week 1", "goal": "Achieve 60+ average", "action": "Review STAR method"},
        {"checkpoint": "Week 2", "goal": "Achieve 65+ average", "action": "Add metrics to stories"},
        {"checkpoint": "Week 3", "goal": "Achieve 70+ average", "action": "Mock interviews"},
        {"checkpoint": "Week 4", "goal": "Achieve 75+ average", "action": "Final prep"}
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
            "generate_questions": generate_questions,
            "evaluate_answer": evaluate_answer,
            "provide_feedback": provide_feedback,
            "track_practice": track_practice,
            "score_performance": score_performance,
            "recommend_improvements": recommend_improvements
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
