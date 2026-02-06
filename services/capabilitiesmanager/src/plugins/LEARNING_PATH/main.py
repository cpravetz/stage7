#!/usr/bin/env python3
"""
LEARNING_PATH Plugin - Personalized learning paths
Production-grade implementation with comprehensive business logic
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta
import random

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Learning levels
LEARNING_LEVELS = ["beginner", "intermediate", "advanced", "expert"]

# Subject modules (mock curriculum)
SUBJECT_MODULES = {
    "python": [
        {"name": "Fundamentals", "duration": 10, "difficulty": "beginner"},
        {"name": "Functions & Scope", "duration": 8, "difficulty": "beginner"},
        {"name": "Data Structures", "duration": 12, "difficulty": "intermediate"},
        {"name": "OOP", "duration": 15, "difficulty": "intermediate"},
        {"name": "Advanced Concepts", "duration": 20, "difficulty": "advanced"}
    ],
    "javascript": [
        {"name": "Variables & Types", "duration": 8, "difficulty": "beginner"},
        {"name": "Functions", "duration": 10, "difficulty": "beginner"},
        {"name": "DOM Manipulation", "duration": 12, "difficulty": "intermediate"},
        {"name": "Async Programming", "duration": 14, "difficulty": "intermediate"},
        {"name": "Frameworks", "duration": 20, "difficulty": "advanced"}
    ]
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs."""
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

def _validate_subject(subject: str) -> Tuple[bool, str]:
    """Validate subject."""
    if subject.lower() not in SUBJECT_MODULES:
        return False, f"Invalid subject. Supported: {list(SUBJECT_MODULES.keys())}"
    return True, ""

def _validate_level(level: str) -> Tuple[bool, str]:
    """Validate learning level."""
    if level.lower() not in LEARNING_LEVELS:
        return False, f"Invalid level. Supported: {LEARNING_LEVELS}"
    return True, ""

def _create_path_modules(subject: str, level: str) -> List[Dict[str, Any]]:
    """Create learning path modules based on subject and level."""
    modules = SUBJECT_MODULES.get(subject.lower(), [])
    level_index = LEARNING_LEVELS.index(level.lower()) if level.lower() in LEARNING_LEVELS else 0
    
    path_modules = []
    for module in modules[:level_index + 2]:
        path_modules.append({
            "id": f"mod_{len(path_modules) + 1}",
            "name": module["name"],
            "duration_hours": module["duration"],
            "difficulty": module["difficulty"],
            "completed": False,
            "progress": 0
        })
    
    return path_modules

def _estimate_completion_time(modules: List[Dict[str, Any]]) -> float:
    """Estimate total completion time in hours."""
    return sum(m.get("duration_hours", 0) for m in modules)

def _calculate_overall_progress(modules: List[Dict[str, Any]]) -> float:
    """Calculate overall progress percentage."""
    if not modules:
        return 0
    completed = sum(m.get("progress", 0) for m in modules)
    return round((completed / len(modules)) / 100, 2)

def _assess_mastery(module_scores: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Assess mastery level based on module scores."""
    if not module_scores:
        return {"status": "no_data", "mastery_level": "unknown"}
    
    scores = [m.get("score", 0) for m in module_scores if "score" in m]
    if not scores:
        return {"status": "incomplete", "mastery_level": "unknown"}
    
    avg_score = sum(scores) / len(scores)
    
    if avg_score >= 90:
        mastery = "expert"
    elif avg_score >= 80:
        mastery = "advanced"
    elif avg_score >= 70:
        mastery = "intermediate"
    else:
        mastery = "beginner"
    
    return {
        "mastery_level": mastery,
        "average_score": round(avg_score, 2),
        "total_modules_passed": sum(1 for s in scores if s >= 70)
    }

def _identify_learning_gaps(modules: List[Dict[str, Any]], scores: List[Dict[str, Any]]) -> List[str]:
    """Identify learning gaps."""
    gaps = []
    
    for i, module in enumerate(modules):
        if i < len(scores):
            score = scores[i].get("score", 0)
            if score < 70:
                gaps.append(f"Needs improvement in {module['name']}")
    
    return gaps if gaps else ["No significant learning gaps detected"]

def create_path(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Create a personalized learning path."""
    subject = payload.get("subject", "")
    starting_level = payload.get("starting_level", "beginner")
    learner_id = payload.get("learner_id", f"learner_{random.randint(1000, 9999)}")
    
    valid, msg = _validate_subject(subject)
    if not valid:
        return {"success": False, "error": msg}
    
    valid, msg = _validate_level(starting_level)
    if not valid:
        return {"success": False, "error": msg}
    
    modules = _create_path_modules(subject, starting_level)
    total_hours = _estimate_completion_time(modules)
    
    path = {
        "path_id": f"path_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "learner_id": learner_id,
        "subject": subject,
        "starting_level": starting_level,
        "modules": modules,
        "estimated_completion_hours": total_hours,
        "created_at": datetime.now().isoformat(),
        "status": "active"
    }
    
    return {"success": True, "result": path}

def add_module(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add a module to learning path."""
    path_id = payload.get("path_id", "")
    module_name = payload.get("module_name", "")
    duration = payload.get("duration", 10)
    difficulty = payload.get("difficulty", "intermediate")
    
    if not path_id or not module_name:
        return {"success": False, "error": "path_id and module_name are required"}
    
    module = {
        "id": f"mod_{random.randint(1000, 9999)}",
        "name": module_name,
        "duration_hours": duration,
        "difficulty": difficulty,
        "completed": False,
        "progress": 0
    }
    
    return {
        "success": True,
        "result": {
            "path_id": path_id,
            "module": module,
            "status": "added"
        }
    }

def track_progress(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Track learning progress."""
    path_id = payload.get("path_id", "")
    modules = payload.get("modules", [])
    
    if not path_id or not modules:
        return {"success": False, "error": "path_id and modules are required"}
    
    overall_progress = _calculate_overall_progress(modules)
    completed_modules = sum(1 for m in modules if m.get("completed"))
    
    return {
        "success": True,
        "result": {
            "path_id": path_id,
            "overall_progress_percentage": round(overall_progress * 100, 2),
            "completed_modules": completed_modules,
            "total_modules": len(modules),
            "estimated_completion_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        }
    }

def assess_mastery(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Assess mastery level."""
    module_scores = payload.get("module_scores", [])
    
    if not module_scores:
        return {"success": False, "error": "module_scores is required"}
    
    mastery = _assess_mastery(module_scores)
    
    return {"success": True, "result": mastery}

def recommend_next(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Recommend next module to study."""
    modules = payload.get("modules", [])
    current_progress = payload.get("current_progress", 0)
    
    if not modules:
        return {"success": False, "error": "modules is required"}
    
    # Find next incomplete module
    next_module = None
    for module in modules:
        if not module.get("completed"):
            next_module = module
            break
    
    if not next_module:
        return {
            "success": True,
            "result": {
                "status": "completed",
                "message": "All modules completed!",
                "recommendation": "Consider starting an advanced path"
            }
        }
    
    return {
        "success": True,
        "result": {
            "next_module": next_module,
            "why_recommended": f"Natural progression after current learning",
            "estimated_time": f"{next_module.get('duration_hours', 10)} hours",
            "difficulty": next_module.get("difficulty", "intermediate")
        }
    }

def generate_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate learning path report."""
    path_id = payload.get("path_id", "")
    modules = payload.get("modules", [])
    module_scores = payload.get("module_scores", [])
    
    if not path_id or not modules:
        return {"success": False, "error": "path_id and modules are required"}
    
    gaps = _identify_learning_gaps(modules, module_scores)
    mastery = _assess_mastery(module_scores)
    progress = _calculate_overall_progress(modules)
    
    report = {
        "path_id": path_id,
        "generated_at": datetime.now().isoformat(),
        "overall_progress": round(progress * 100, 2),
        "mastery_assessment": mastery,
        "learning_gaps": gaps,
        "recommendations": [
            "Focus on weak areas identified",
            "Increase study frequency for better retention",
            "Practice hands-on projects after each module"
        ]
    }
    
    return {"success": True, "result": report}

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

        action_lower = action.lower().replace('_', '').replace('-', '')
        
        if action_lower == 'createpath':
            result = create_path(payload)
        elif action_lower == 'addmodule':
            result = add_module(payload)
        elif action_lower == 'trackprogress':
            result = track_progress(payload)
        elif action_lower == 'assessmastery':
            result = assess_mastery(payload)
        elif action_lower == 'recommendnext':
            result = recommend_next(payload)
        elif action_lower == 'generatereport':
            result = generate_report(payload)
        else:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        logger.info(f"Executing action: {action}")
        
        return [{
            "success": result.get("success", False),
            "name": "result" if result.get("success") else "error",
            "resultType": "object",
            "result": result.get("result", result.get("error")),
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
