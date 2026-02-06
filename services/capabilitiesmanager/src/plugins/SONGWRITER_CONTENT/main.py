#!/usr/bin/env python3
"""
SONGWRITER_CONTENT Plugin - Song composition assistance
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

# Song structures
SONG_STRUCTURES = {
    "pop": ["verse", "pre-chorus", "chorus", "verse", "pre-chorus", "chorus", "bridge", "chorus"],
    "hip_hop": ["intro", "verse", "chorus", "verse", "chorus", "verse", "chorus", "outro"],
    "ballad": ["verse", "verse", "chorus", "verse", "chorus", "bridge", "chorus"],
    "folk": ["verse", "chorus", "verse", "chorus", "bridge", "chorus"]
}

# Rhyme scheme patterns
RHYME_SCHEMES = {
    "AABB": ["AA", "BB"],
    "ABAB": ["AB", "AB"],
    "AABA": ["AA", "BA"],
    "ABCB": ["AB", "CB"]
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

def _validate_genre(genre: str) -> Tuple[bool, str]:
    """Validate music genre."""
    valid_genres = list(SONG_STRUCTURES.keys())
    if genre not in valid_genres:
        return False, f"Invalid genre. Supported: {valid_genres}"
    return True, ""

def _get_song_structure(genre: str) -> List[str]:
    """Get song structure for genre."""
    return SONG_STRUCTURES.get(genre, SONG_STRUCTURES["pop"])

def _check_rhyme_scheme(lyrics: str) -> Dict[str, Any]:
    """Analyze rhyme scheme."""
    lines = [line.strip() for line in lyrics.split('\n') if line.strip()]
    if len(lines) < 2:
        return {"status": "insufficient_lines", "scheme": "unknown"}
    
    # Extract last words
    last_words = []
    for line in lines:
        words = line.split()
        if words:
            last_words.append(words[-1].lower().rstrip('.,!?;:'))
    
    # Simple rhyme detection (ending sounds)
    rhymes = {}
    for i, word in enumerate(last_words):
        suffix = word[-2:] if len(word) > 2 else word
        if suffix not in rhymes:
            rhymes[suffix] = []
        rhymes[suffix].append(i)
    
    rhyming_pairs = sum(1 for v in rhymes.values() if len(v) > 1)
    total_lines = len(lines)
    
    return {
        "total_lines": total_lines,
        "rhyming_pairs": rhyming_pairs,
        "rhyme_density": round(rhyming_pairs / max(1, total_lines), 2),
        "quality": "strong" if rhyming_pairs >= total_lines * 0.5 else "moderate" if rhyming_pairs >= total_lines * 0.3 else "weak"
    }

def _analyze_lyrical_structure(lyrics: str) -> Dict[str, Any]:
    """Analyze lyrical structure."""
    lines = [line.strip() for line in lyrics.split('\n') if line.strip()]
    
    word_count = sum(len(line.split()) for line in lines)
    avg_line_length = word_count / max(1, len(lines))
    
    # Identify verses, choruses, bridges
    structure = []
    current_section = []
    
    for line in lines:
        if line and not line[0].isspace():
            if current_section:
                structure.append(current_section)
            current_section = [line]
        else:
            current_section.append(line)
    
    if current_section:
        structure.append(current_section)
    
    return {
        "total_lines": len(lines),
        "word_count": word_count,
        "average_line_length": round(avg_line_length, 2),
        "sections": len(structure),
        "structure_quality": "good" if 3 <= len(structure) <= 8 else "fair"
    }

def _suggest_melody_improvements(lyrics: str) -> List[str]:
    """Suggest melody improvements."""
    suggestions = []
    
    lines = [line.strip() for line in lyrics.split('\n') if line.strip()]
    
    # Check line length variation
    line_lengths = [len(line) for line in lines]
    if len(set(line_lengths)) < 2:
        suggestions.append("Vary line lengths for better melodic interest")
    
    # Check for repetitive patterns
    if lyrics.count("\n") < 8:
        suggestions.append("Add more lines for better song structure")
    
    # Check for emphasis words
    if "!" not in lyrics and "?" not in lyrics:
        suggestions.append("Use punctuation to emphasize emotional moments")
    
    return suggestions if suggestions else ["Lyrics have good melodic potential"]

def generate_lyrics(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate song lyrics."""
    genre = payload.get("genre", "pop").lower()
    topic = payload.get("topic", "love")
    mood = payload.get("mood", "uplifting")
    
    valid, msg = _validate_genre(genre)
    if not valid:
        return {"success": False, "error": msg}
    
    structure = _get_song_structure(genre)
    
    lyrics = f"""
[Verse 1]
The theme of {topic} fills the air
A feeling of {mood} beyond compare
With every moment, every breath
I find myself in this duet

[Chorus]
{topic.upper()}, here you are
Shining like a brilliant star
{topic.upper()}, don't you see
You mean everything to me

[Verse 2]
The melody flows through my soul
Making broken pieces whole
With every word and every phrase
I'm lost within your gentle gaze

[Chorus]
{topic.upper()}, here you are
Shining like a brilliant star
{topic.upper()}, don't you see
You mean everything to me
"""
    
    return {
        "success": True,
        "result": {
            "lyrics": lyrics.strip(),
            "genre": genre,
            "topic": topic,
            "mood": mood,
            "structure": structure
        }
    }

def suggest_melody(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest melody characteristics."""
    genre = payload.get("genre", "pop").lower()
    tempo = payload.get("tempo", "moderate")
    
    valid, msg = _validate_genre(genre)
    if not valid:
        return {"success": False, "error": msg}
    
    melody_suggestions = {
        "pop": {"tempo": 120, "range": "octave", "style": "catchy and repetitive"},
        "hip_hop": {"tempo": 90, "range": "5th", "style": "rhythmic with spoken elements"},
        "ballad": {"tempo": 60, "range": "octave+", "style": "slow and emotional"},
        "folk": {"tempo": 100, "range": "5th", "style": "simple and singable"}
    }
    
    suggestion = melody_suggestions.get(genre, melody_suggestions["pop"])
    
    return {
        "success": True,
        "result": {
            "genre": genre,
            "recommended_tempo": suggestion["tempo"],
            "vocal_range": suggestion["range"],
            "style": suggestion["style"],
            "key_suggestion": "Capo 2 on Acoustic Guitar"
        }
    }

def analyze_structure(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze song structure."""
    lyrics = payload.get("lyrics", "")
    genre = payload.get("genre", "pop")
    
    if not lyrics:
        return {"success": False, "error": "lyrics is required"}
    
    structure = _analyze_lyrical_structure(lyrics)
    
    return {
        "success": True,
        "result": {
            "genre": genre,
            "structure_analysis": structure,
            "matches_expected": "good" if 3 <= structure["sections"] <= 8 else "needs work"
        }
    }

def check_rhyme_scheme(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Check rhyme scheme."""
    lyrics = payload.get("lyrics", "")
    expected_scheme = payload.get("scheme", "ABAB")
    
    if not lyrics:
        return {"success": False, "error": "lyrics is required"}
    
    analysis = _check_rhyme_scheme(lyrics)
    
    return {
        "success": True,
        "result": {
            "analysis": analysis,
            "expected_scheme": expected_scheme,
            "overall_quality": analysis.get("quality", "unknown")
        }
    }

def suggest_improvements(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Suggest lyrical improvements."""
    lyrics = payload.get("lyrics", "")
    
    if not lyrics:
        return {"success": False, "error": "lyrics is required"}
    
    suggestions = _suggest_melody_improvements(lyrics)
    rhyme_check = _check_rhyme_scheme(lyrics)
    
    return {
        "success": True,
        "result": {
            "improvement_suggestions": suggestions,
            "rhyme_analysis": rhyme_check,
            "overall_assessment": "ready to publish" if len(suggestions) <= 1 else "needs refinement"
        }
    }

def generate_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate comprehensive song report."""
    lyrics = payload.get("lyrics", "")
    title = payload.get("title", "Untitled")
    genre = payload.get("genre", "pop")
    
    if not lyrics:
        return {"success": False, "error": "lyrics is required"}
    
    report = {
        "title": title,
        "genre": genre,
        "generated_at": datetime.now().isoformat(),
        "structure_analysis": _analyze_lyrical_structure(lyrics),
        "rhyme_scheme_analysis": _check_rhyme_scheme(lyrics),
        "improvement_suggestions": _suggest_melody_improvements(lyrics),
        "overall_score": 0
    }
    
    rhyme_quality = {"strong": 100, "moderate": 70, "weak": 40}.get(
        report["rhyme_scheme_analysis"].get("quality"), 50
    )
    structure_quality = {"good": 100, "fair": 70}.get(
        report["structure_analysis"].get("structure_quality"), 50
    )
    
    report["overall_score"] = round((rhyme_quality + structure_quality) / 2, 2)
    
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
        
        if action_lower == 'generatelyrics':
            result = generate_lyrics(payload)
        elif action_lower == 'suggestmelody':
            result = suggest_melody(payload)
        elif action_lower == 'analyzestructure':
            result = analyze_structure(payload)
        elif action_lower == 'checkrhymescheme':
            result = check_rhyme_scheme(payload)
        elif action_lower == 'suggestimprovements':
            result = suggest_improvements(payload)
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
