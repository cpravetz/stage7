# --- Robust wrapper for deduplication, temp dir hygiene, and error escalation ---
import tempfile
import shutil
import hashlib

# Error handler integration (for unexpected/code errors only)
def send_to_errorhandler(error, context=None):
    try:
        import requests
        errorhandler_url = os.environ.get('ERRORHANDLER_URL', 'errorhandler:5090')
        payload = {
            'error': str(error),
            'context': context or ''
        }
        requests.post(f'http://{errorhandler_url}/analyze', json=payload, timeout=10)
    except Exception as e:
        print(f"Failed to send error to errorhandler: {e}")

_seen_hashes = set()

def robust_execute_plugin(script_parameters):
    temp_dir = None
    try:
        # Deduplication: hash the script_parameters
        hash_input = json.dumps(script_parameters, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in _seen_hashes:
            return [
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                    "error": "Duplicate input detected."
                }
            ]
        _seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="text_analysis_")
        os.environ["TEXT_ANALYSIS_TEMP_DIR"] = temp_dir

        # Call the original plugin logic
        result = execute_plugin(script_parameters)

        # Strict output validation: must be a list or dict
        if not isinstance(result, (list, dict)):
            raise ValueError("Output schema validation failed: must be a list or dict.")

        return result
    except Exception as e:
        # Only escalate to errorhandler for unexpected/code errors
        send_to_errorhandler(e, context=json.dumps(script_parameters))
        return [
            {
                "success": False,
                "name": "error",
                "resultType": "error",
                "resultDescription": f"Error: {str(e)}",
                "error": str(e)
            }
        ]
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")
#!/usr/bin/env python3
"""
TEXT_ANALYSIS Plugin for Stage7

This plugin performs various text analysis operations including:
- Word count and character count
- Sentiment analysis (basic)
- Keyword extraction
- Language detection
- Text statistics
"""

import sys
import json
import os
import re
from typing import Dict, List, Any, Optional
from collections import Counter


class InputValue:
    """Represents a plugin input parameter in the new format"""
    def __init__(self, inputName: str, value: Any, valueType: str, args: Dict[str, Any] = None):
        self.inputName = inputName
        self.value = value
        self.valueType = valueType
        self.args = args or {}



class PluginOutput:
    """Represents a plugin output result"""
    def __init__(self, success: bool, name: str, result_type: str, 
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        output = {
            "success": self.success,
            "name": self.name,
            "resultType": self.result_type,
            "result": self.result,
            "resultDescription": self.result_description
        }
        if self.error:
            output["error"] = self.error
        return output


def create_success_output(name: str, result: Any, result_type: str = "string", 
                         description: str = "Plugin executed successfully") -> PluginOutput:
    """Helper function to create a successful output"""
    return PluginOutput(
        success=True,
        name=name,
        result_type=result_type,
        result=result,
        result_description=description
    )


def create_error_output(name: str, error_message: str, 
                       description: str = "Plugin execution failed") -> PluginOutput:
    """Helper function to create an error output"""
    return PluginOutput(
        success=False,
        name=name,
        result_type="error",
        result=None,
        result_description=description,
        error=error_message
    )


def analyze_text_statistics(text: str) -> Dict[str, Any]:
    """
    Analyze basic text statistics
    
    Args:
        text: Input text to analyze
        
    Returns:
        Dictionary with text statistics
    """
    # Basic counts
    char_count = len(text)
    char_count_no_spaces = len(text.replace(' ', ''))
    word_count = len(text.split())
    
    # Sentence count (basic)
    sentences = re.split(r'[.!?]+', text)
    sentence_count = len([s for s in sentences if s.strip()])
    
    # Paragraph count
    paragraphs = text.split('\n\n')
    paragraph_count = len([p for p in paragraphs if p.strip()])
    
    # Average word length
    words = text.split()
    avg_word_length = sum(len(word.strip('.,!?;:"()[]{}')) for word in words) / len(words) if words else 0
    
    # Average sentence length
    avg_sentence_length = word_count / sentence_count if sentence_count > 0 else 0
    
    return {
        "character_count": char_count,
        "character_count_no_spaces": char_count_no_spaces,
        "word_count": word_count,
        "sentence_count": sentence_count,
        "paragraph_count": paragraph_count,
        "average_word_length": round(avg_word_length, 2),
        "average_sentence_length": round(avg_sentence_length, 2)
    }


def extract_keywords(text: str, top_n: int = 10) -> List[Dict[str, Any]]:
    """
    Extract keywords from text (simple frequency-based approach)
    
    Args:
        text: Input text
        top_n: Number of top keywords to return
        
    Returns:
        List of keyword dictionaries with word and frequency
    """
    # Convert to lowercase and remove punctuation
    clean_text = re.sub(r'[\w\s]', '', text.lower())
    
    # Split into words
    words = clean_text.split()
    
    # Filter out common stop words (basic list)
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
        'his', 'her', 'its', 'our', 'their', 'not', 'no', 'yes', 'so', 'if', 'then', 'than', 'as'
    }
    
    # Filter words
    filtered_words = [word for word in words if len(word) > 2 and word not in stop_words]
    
    # Count frequencies
    word_freq = Counter(filtered_words)
    
    # Get top keywords
    top_keywords = word_freq.most_common(top_n)
    
    return [{"word": word, "frequency": freq} for word, freq in top_keywords]


def basic_sentiment_analysis(text: str) -> Dict[str, Any]:
    """
    Perform basic sentiment analysis using keyword matching
    
    Args:
        text: Input text
        
    Returns:
        Dictionary with sentiment analysis results
    """
    # Simple positive and negative word lists
    positive_words = {
        'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome', 'love',
        'like', 'enjoy', 'happy', 'pleased', 'satisfied', 'perfect', 'brilliant', 'outstanding',
        'superb', 'magnificent', 'marvelous', 'terrific', 'fabulous', 'incredible', 'remarkable'
    }
    
    negative_words = {
        'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry', 'sad', 'disappointed',
        'frustrated', 'annoyed', 'upset', 'disgusted', 'furious', 'miserable', 'depressed',
        'worried', 'concerned', 'stressed', 'anxious', 'poor', 'worst', 'dreadful', 'appalling'
    }
    
    # Convert to lowercase and split into words
    words = re.findall(r'\b\w+\b', text.lower())
    
    # Count positive and negative words
    positive_count = sum(1 for word in words if word in positive_words)
    negative_count = sum(1 for word in words if word in negative_words)
    
    # Calculate sentiment score
    total_sentiment_words = positive_count + negative_count
    if total_sentiment_words == 0:
        sentiment_score = 0.0
        sentiment_label = "neutral"
    else:
        sentiment_score = (positive_count - negative_count) / total_sentiment_words
        if sentiment_score > 0.1:
            sentiment_label = "positive"
        elif sentiment_score < -0.1:
            sentiment_label = "negative"
        else:
            sentiment_label = "neutral"
    
    return {
        "sentiment_label": sentiment_label,
        "sentiment_score": round(sentiment_score, 3),
        "positive_words_count": positive_count,
        "negative_words_count": negative_count,
        "confidence": min(total_sentiment_words / len(words) * 10, 1.0) if words else 0.0
    }


def execute_plugin(script_parameters: Dict[str, InputValue]) -> List[PluginOutput]:
    """
    Main plugin execution function for TEXT_ANALYSIS plugin
    
    Args:
        script_parameters: Dictionary of input parameters
        
    Returns:
        List of PluginOutput objects
    """
    try:
        # Get text input
        text_input = script_parameters.get('text')
        if not text_input:
            return [create_error_output("error", "Missing required input: text")]
        
        text = text_input.value
        if not text or not isinstance(text, str):
            return [create_error_output("error", "Text must be a non-empty string")]
        
        # Get analysis type (optional)
        analysis_type_input = script_parameters.get('analysis_type')
        analysis_type = analysis_type_input.value if analysis_type_input else 'all'
        
        # Get keyword count (optional)
        keyword_count_input = script_parameters.get('keyword_count')
        keyword_count = keyword_count_input.value if keyword_count_input else 10
        if not isinstance(keyword_count, int) or keyword_count < 1:
            keyword_count = 10
        
        results = []
        
        # Perform requested analysis
        if analysis_type in ['all', 'statistics']:
            stats = analyze_text_statistics(text)
            results.append(create_success_output("statistics", stats, "object", 
                                               "Text statistics analysis"))
        
        if analysis_type in ['all', 'keywords']:
            keywords = extract_keywords(text, keyword_count)
            results.append(create_success_output("keywords", keywords, "array", 
                                               f"Top {keyword_count} keywords extracted"))
        
        if analysis_type in ['all', 'sentiment']:
            sentiment = basic_sentiment_analysis(text)
            results.append(create_success_output("sentiment", sentiment, "object", 
                                               "Sentiment analysis results"))
        
        # Create summary
        if analysis_type == 'all':
            stats = analyze_text_statistics(text)
            sentiment = basic_sentiment_analysis(text)
            summary = (f"Text analysis complete: {stats['word_count']} words, "
                      f"{stats['sentence_count']} sentences, "
                      f"sentiment: {sentiment['sentiment_label']}")
            results.append(create_success_output("summary", summary, "string", 
                                               "Analysis summary"))
        
        return results
        
    except Exception as e:
        return [create_error_output("error", f"Unexpected error: {str(e)}")]


def main():
    """Main entry point for the plugin"""
    try:
        # Read inputs from stdin
        inputs_str = sys.stdin.read().strip()
        if not inputs_str:
            raise ValueError("No input provided")

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)
        inputs_map = {item[0]: item[1] for item in inputs_list}

        # Convert to InputValue objects for compatibility
        script_parameters = {}
        for key, value in inputs_map.items():
            if isinstance(value, dict) and 'value' in value:
                script_parameters[key] = InputValue(
                    inputName=key,
                    value=value['value'],
                    valueType=value.get('valueType', 'string'),
                    args=value.get('args', {})
                )
            else:
                script_parameters[key] = InputValue(
                    inputName=key,
                    value=value,
                    valueType='string',
                    args={}
                )

        # Execute the plugin
        outputs = execute_plugin(script_parameters)

        # Convert outputs to dictionaries and print as JSON
        output_dicts = [output.to_dict() for output in outputs]
        print(json.dumps(output_dicts))

    except Exception as e:
        # Handle any errors in the main execution
        error_output = create_error_output("error", str(e), "Plugin execution failed")
        print(json.dumps([error_output.to_dict()]))


if __name__ == "__main__":
    main()