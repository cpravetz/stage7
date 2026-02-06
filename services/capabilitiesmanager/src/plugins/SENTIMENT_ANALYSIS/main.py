#!/usr/bin/env python3
"""
SENTIMENT_ANALYSIS Plugin - Sentiment and emotion analysis
Production-grade implementation with comprehensive business logic
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Sentiment lexicons
POSITIVE_WORDS = {
    'excellent': 0.9, 'great': 0.85, 'amazing': 0.95, 'wonderful': 0.9,
    'good': 0.7, 'love': 0.85, 'perfect': 0.9, 'fantastic': 0.95,
    'awesome': 0.9, 'best': 0.8, 'brilliant': 0.9, 'outstanding': 0.85,
    'happy': 0.8, 'pleased': 0.75, 'satisfied': 0.7, 'delighted': 0.85
}

NEGATIVE_WORDS = {
    'terrible': 0.95, 'awful': 0.9, 'horrible': 0.95, 'bad': 0.75,
    'hate': 0.9, 'disgusting': 0.95, 'worst': 0.9, 'poor': 0.75,
    'disappointing': 0.8, 'useless': 0.85, 'broken': 0.8, 'angry': 0.85,
    'sad': 0.75, 'unhappy': 0.8, 'frustrated': 0.75, 'annoyed': 0.7
}

# Emotion indicators
EMOTION_KEYWORDS = {
    'joy': ['happy', 'joyful', 'cheerful', 'delighted', 'wonderful'],
    'sadness': ['sad', 'unhappy', 'depressed', 'miserable', 'grief'],
    'anger': ['angry', 'furious', 'enraged', 'livid', 'outraged'],
    'fear': ['afraid', 'scared', 'terrified', 'anxious', 'nervous'],
    'trust': ['confident', 'assured', 'trusting', 'believing', 'faithful'],
    'disgust': ['disgusted', 'repulsed', 'nauseated', 'revolted', 'disgusting'],
    'surprise': ['surprised', 'shocked', 'astonished', 'amazed', 'unexpected'],
    'anticipation': ['excited', 'eager', 'looking_forward', 'hopeful', 'interested']
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs, checking aliases, and extracting from {{'value':...}} wrapper."""
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

def _validate_text(text: str) -> Tuple[bool, str]:
    """Validate text input."""
    if not text or not isinstance(text, str):
        return False, "Text must be a non-empty string"
    if len(text.strip()) < 2:
        return False, "Text must have at least 2 characters"
    return True, ""

def _analyze_sentiment_score(text: str) -> Dict[str, Any]:
    """Calculate sentiment score based on word analysis."""
    text_lower = text.lower()
    words = text_lower.split()
    
    positive_score = 0
    negative_score = 0
    word_count = 0
    
    for word in words:
        word_clean = word.strip('.,!?;:')
        if word_clean in POSITIVE_WORDS:
            positive_score += POSITIVE_WORDS[word_clean]
            word_count += 1
        elif word_clean in NEGATIVE_WORDS:
            negative_score += NEGATIVE_WORDS[word_clean]
            word_count += 1
    
    if word_count == 0:
        overall_sentiment = 0.5
        polarity = "neutral"
        confidence = 0.0
    else:
        overall_sentiment = (positive_score - negative_score) / max(1, word_count * 2)
        overall_sentiment = max(-1, min(1, overall_sentiment))
        confidence = min(1.0, (positive_score + negative_score) / max(1, len(words)))
        
        if overall_sentiment > 0.2:
            polarity = "positive"
        elif overall_sentiment < -0.2:
            polarity = "negative"
        else:
            polarity = "neutral"
    
    # Normalize to 0-100 scale
    normalized_score = (overall_sentiment + 1) / 2 * 100
    
    return {
        "score": round(normalized_score, 2),
        "polarity": polarity,
        "confidence": round(confidence, 3),
        "positive_indicators": positive_score,
        "negative_indicators": negative_score
    }

def _detect_emotion(text: str) -> Dict[str, Any]:
    """Detect dominant emotion in text."""
    text_lower = text.lower()
    emotion_scores = defaultdict(float)
    
    for emotion, keywords in EMOTION_KEYWORDS.items():
        for keyword in keywords:
            keyword_lower = keyword.lower().replace('_', ' ')
            if keyword_lower in text_lower:
                emotion_scores[emotion] += 1.0 / len(keywords)
    
    total_score = sum(emotion_scores.values())
    if total_score == 0:
        return {
            "dominant_emotion": "neutral",
            "confidence": 0.0,
            "emotion_breakdown": {}
        }
    
    emotion_breakdown = {e: round(s / total_score, 3) for e, s in emotion_scores.items()}
    dominant = max(emotion_scores, key=emotion_scores.get)
    
    return {
        "dominant_emotion": dominant,
        "confidence": round(emotion_scores[dominant] / total_score, 3),
        "emotion_breakdown": emotion_breakdown
    }

def _get_polarity(text: str) -> Dict[str, Any]:
    """Get detailed polarity analysis."""
    sentiment = _analyze_sentiment_score(text)
    
    return {
        "score": sentiment["score"],
        "intensity": "strong" if sentiment["confidence"] > 0.7 else "moderate" if sentiment["confidence"] > 0.4 else "weak",
        "direction": sentiment["polarity"],
        "detailed_score": sentiment["score"]
    }

def _analyze_subjectivity(text: str) -> Dict[str, Any]:
    """Analyze subjectivity vs objectivity."""
    subjective_words = ['think', 'believe', 'feel', 'opinion', 'seems', 'appears', 'maybe', 'perhaps']
    objective_words = ['fact', 'data', 'evidence', 'research', 'study', 'analysis', 'result', 'conclusion']
    
    text_lower = text.lower()
    words = text_lower.split()
    
    subj_count = sum(1 for w in words if any(s in w for s in subjective_words))
    obj_count = sum(1 for w in words if any(o in w for o in objective_words))
    
    total_markers = subj_count + obj_count
    if total_markers == 0:
        subjectivity_score = 0.5
    else:
        subjectivity_score = subj_count / total_markers
    
    return {
        "subjectivity_score": round(subjectivity_score, 3),
        "classification": "subjective" if subjectivity_score > 0.6 else "objective" if subjectivity_score < 0.4 else "mixed",
        "subjective_indicators": subj_count,
        "objective_indicators": obj_count
    }

def _track_sentiment_trends(data_points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Track sentiment trends over time."""
    if not data_points:
        return {"error": "No data points provided"}
    
    scores = [d.get("score", 0) for d in data_points if "score" in d]
    if not scores:
        return {"error": "No valid scores in data points"}
    
    avg_score = sum(scores) / len(scores)
    trend = "increasing" if scores[-1] > scores[0] else "decreasing" if scores[-1] < scores[0] else "stable"
    
    return {
        "average_sentiment": round(avg_score, 2),
        "trend": trend,
        "highest_score": max(scores),
        "lowest_score": min(scores),
        "volatility": round((max(scores) - min(scores)) / 100, 3) if scores else 0
    }

def analyze_sentiment(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze sentiment of text."""
    text = payload.get("text", "")
    
    valid, msg = _validate_text(text)
    if not valid:
        return {"success": False, "error": msg}
    
    sentiment = _analyze_sentiment_score(text)
    return {"success": True, "result": sentiment}

def detect_emotion(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Detect emotion in text."""
    text = payload.get("text", "")
    
    valid, msg = _validate_text(text)
    if not valid:
        return {"success": False, "error": msg}
    
    emotion = _detect_emotion(text)
    return {"success": True, "result": emotion}

def get_polarity(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Get polarity analysis."""
    text = payload.get("text", "")
    
    valid, msg = _validate_text(text)
    if not valid:
        return {"success": False, "error": msg}
    
    polarity = _get_polarity(text)
    return {"success": True, "result": polarity}

def analyze_subjectivity(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze subjectivity of text."""
    text = payload.get("text", "")
    
    valid, msg = _validate_text(text)
    if not valid:
        return {"success": False, "error": msg}
    
    subjectivity = _analyze_subjectivity(text)
    return {"success": True, "result": subjectivity}

def track_trends(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Track sentiment trends."""
    data_points = payload.get("data_points", [])
    
    if not isinstance(data_points, list):
        return {"success": False, "error": "data_points must be a list"}
    
    trends = _track_sentiment_trends(data_points)
    
    if "error" in trends:
        return {"success": False, "error": trends["error"]}
    
    return {"success": True, "result": trends}

def generate_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate comprehensive sentiment report."""
    texts = payload.get("texts", [])
    
    if not isinstance(texts, list):
        return {"success": False, "error": "texts must be a list"}
    
    if not texts:
        return {"success": False, "error": "texts list cannot be empty"}
    
    report = {
        "total_samples": len(texts),
        "analysis": [],
        "summary": {}
    }
    
    sentiments = []
    emotions = []
    
    for i, text in enumerate(texts):
        if isinstance(text, str):
            sent = _analyze_sentiment_score(text)
            emot = _detect_emotion(text)
            sentiments.append(sent["score"])
            emotions.append(emot.get("dominant_emotion", "neutral"))
            
            report["analysis"].append({
                "index": i,
                "sentiment": sent,
                "emotion": emot
            })
    
    if sentiments:
        report["summary"] = {
            "average_sentiment": round(sum(sentiments) / len(sentiments), 2),
            "most_common_emotion": max(set(emotions), key=emotions.count) if emotions else "neutral",
            "positive_ratio": round(sum(1 for s in sentiments if s > 60) / len(sentiments), 3),
            "negative_ratio": round(sum(1 for s in sentiments if s < 40) / len(sentiments), 3)
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
        
        if action_lower == 'analyzesentiment':
            result = analyze_sentiment(payload)
        elif action_lower == 'detectemotion':
            result = detect_emotion(payload)
        elif action_lower == 'getpolarity':
            result = get_polarity(payload)
        elif action_lower == 'analyzesubjectivity':
            result = analyze_subjectivity(payload)
        elif action_lower == 'tracktrends':
            result = track_trends(payload)
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
