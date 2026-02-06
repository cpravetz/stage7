#!/usr/bin/env python3
"""
SCRIPTWRITER_CONTENT Plugin - Script writing assistance
Production-grade implementation with comprehensive business logic
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple
from datetime import datetime
import re

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Script formats
SCRIPT_FORMATS = {
    "feature": {"max_pages": 180, "scene_structure": 3},
    "tv_episode": {"max_pages": 60, "scene_structure": 4},
    "short": {"max_pages": 30, "scene_structure": 2},
    "web_series": {"max_pages": 15, "scene_structure": 2}
}

# Dialogue templates
DIALOGUE_PATTERNS = [
    {"type": "exposition", "pattern": "This {object} allows us to {action}"},
    {"type": "conflict", "pattern": "I can't {action} because {reason}"},
    {"type": "emotion", "pattern": "{character}, {emotion}! {consequence}"}
]

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

def _validate_script_type(script_type: str) -> Tuple[bool, str]:
    """Validate script type."""
    if script_type not in SCRIPT_FORMATS:
        return False, f"Invalid type. Supported: {list(SCRIPT_FORMATS.keys())}"
    return True, ""

def _generate_scene_structure(script_type: str, act: int = 1) -> Dict[str, Any]:
    """Generate scene structure template."""
    structure = []
    scenes_per_act = SCRIPT_FORMATS[script_type].get("scene_structure", 3)
    
    for i in range(1, scenes_per_act + 1):
        structure.append({
            "scene_number": f"Act {act}, Scene {i}",
            "setting": "INT/EXT. LOCATION - DAY/NIGHT",
            "characters": [],
            "description": "Scene description",
            "duration_pages": 3
        })
    
    return {"scenes": structure}

def _estimate_page_count(dialogue_count: int, action_lines: int) -> float:
    """Estimate script page count."""
    dialogue_pages = dialogue_count * 0.15
    action_pages = action_lines * 0.05
    return round(dialogue_pages + action_pages, 2)

def _analyze_pacing(script_content: str) -> Dict[str, Any]:
    """Analyze script pacing."""
    lines = script_content.split('\n')
    dialogue_lines = sum(1 for line in lines if re.match(r'^\s*[A-Z][A-Z\s]*$', line))
    action_lines = len(lines) - dialogue_lines
    
    pacing_ratio = dialogue_lines / max(1, action_lines)
    
    if pacing_ratio > 2:
        pacing = "dialogue-heavy"
    elif pacing_ratio < 0.5:
        pacing = "action-heavy"
    else:
        pacing = "balanced"
    
    return {
        "pacing": pacing,
        "dialogue_percentage": round(dialogue_lines / max(1, len(lines)) * 100, 2),
        "action_percentage": round(action_lines / max(1, len(lines)) * 100, 2),
        "estimated_duration_minutes": round(_estimate_page_count(dialogue_lines, action_lines) * 0.75, 2)
    }

def _check_formatting(content: str) -> Dict[str, Any]:
    """Check screenplay formatting."""
    issues = []
    standards = []
    
    if "INT." not in content and "EXT." not in content:
        issues.append("Missing scene headings (INT./EXT.)")
    else:
        standards.append("Scene headings present")
    
    if "FADE IN:" not in content:
        issues.append("Missing FADE IN")
    else:
        standards.append("FADE IN present")
    
    if "FADE OUT." not in content:
        issues.append("Missing FADE OUT")
    else:
        standards.append("FADE OUT present")
    
    return {
        "formatting_score": max(0, 100 - (len(issues) * 20)),
        "issues": issues,
        "standards_met": standards
    }

def _analyze_dialogue_quality(dialogue: str) -> Dict[str, Any]:
    """Analyze dialogue quality."""
    words = dialogue.split()
    avg_word_length = sum(len(w) for w in words) / max(1, len(words))
    
    if avg_word_length < 4:
        style = "simple"
    elif avg_word_length < 6:
        style = "moderate"
    else:
        style = "complex"
    
    return {
        "word_count": len(words),
        "average_word_length": round(avg_word_length, 2),
        "style": style,
        "natural": "yes" if style in ["simple", "moderate"] else "possibly complex"
    }

def generate_script(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a script outline."""
    title = payload.get("title", "Untitled")
    script_type = payload.get("script_type", "feature")
    premise = payload.get("premise", "")
    num_acts = payload.get("num_acts", 3)
    
    valid, msg = _validate_script_type(script_type)
    if not valid:
        return {"success": False, "error": msg}
    
    script = {
        "title": title,
        "type": script_type,
        "premise": premise,
        "acts": []
    }
    
    for act in range(1, num_acts + 1):
        script["acts"].append(_generate_scene_structure(script_type, act))
    
    return {"success": True, "result": script}

def analyze_structure(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze script structure."""
    content = payload.get("content", "")
    script_type = payload.get("script_type", "feature")
    
    if not content:
        return {"success": False, "error": "content is required"}
    
    pacing = _analyze_pacing(content)
    formatting = _check_formatting(content)
    
    return {
        "success": True,
        "result": {
            "pacing_analysis": pacing,
            "formatting": formatting,
            "structure_quality": round((pacing["dialogue_percentage"] + formatting["formatting_score"]) / 2, 2)
        }
    }

def suggest_dialogue(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest dialogue for a scene."""
    scene_description = payload.get("scene_description", "")
    character = payload.get("character", "")
    emotion = payload.get("emotion", "neutral")
    
    if not scene_description or not character:
        return {"success": False, "error": "scene_description and character are required"}
    
    suggestions = [
        f"{character}: That's {emotion.lower()}, but necessary.",
        f"{character}: I never thought it would come to this.",
        f"{character}: We have to try, don't we?"
    ]
    
    return {
        "success": True,
        "result": {
            "character": character,
            "dialogue_suggestions": suggestions,
            "context": scene_description
        }
    }

def check_formatting(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Check screenplay formatting."""
    content = payload.get("content", "")
    
    if not content:
        return {"success": False, "error": "content is required"}
    
    result = _check_formatting(content)
    return {"success": True, "result": result}

def analyze_pacing(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze script pacing."""
    content = payload.get("content", "")
    
    if not content:
        return {"success": False, "error": "content is required"}
    
    result = _analyze_pacing(content)
    return {"success": True, "result": result}

def generate_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate comprehensive script report."""
    content = payload.get("content", "")
    title = payload.get("title", "Script")
    
    if not content:
        return {"success": False, "error": "content is required"}
    
    report = {
        "title": title,
        "generated_at": datetime.now().isoformat(),
        "pacing": _analyze_pacing(content),
        "formatting": _check_formatting(content),
        "overall_score": 0
    }
    
    report["overall_score"] = round(
        (report["pacing"].get("dialogue_percentage", 50) + 
         report["formatting"]["formatting_score"]) / 2, 2
    )
    
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
        
        if action_lower == 'generatescript':
            result = generate_script(payload)
        elif action_lower == 'analyzestructure':
            result = analyze_structure(payload)
        elif action_lower == 'suggestdialogue':
            result = suggest_dialogue(payload)
        elif action_lower == 'checkformatting':
            result = check_formatting(payload)
        elif action_lower == 'analyzepacing':
            result = analyze_pacing(payload)
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
