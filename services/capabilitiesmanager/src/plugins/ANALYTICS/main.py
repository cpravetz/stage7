#!/usr/bin/env python3
"""
ANALYTICS Plugin - Analytics and reporting
"""

import sys
import json
import logging
import os
from typing import Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

def get_engagement_metrics(payload: dict) -> dict:
    """Get engagement metrics across platforms"""
    platforms = payload.get('platforms', [])
    time_range = payload.get('timeRange', '30d')

    logger.info(f"Getting engagement metrics for platforms: {platforms}, timeRange: {time_range}")

    # TODO: Integrate with actual analytics platforms (Google Analytics, etc.)
    return {
        "platforms": platforms,
        "timeRange": time_range,
        "metrics": {
            "totalViews": 15000,
            "uniqueVisitors": 8500,
            "avgTimeOnPage": "3:45",
            "bounceRate": 0.35,
            "engagement": {
                "likes": 450,
                "shares": 120,
                "comments": 85
            }
        }
    }


def get_seo_performance(payload: dict) -> dict:
    """Get SEO performance metrics"""
    content_ids = payload.get('contentIds', [])

    logger.info(f"Getting SEO performance for content: {content_ids}")

    # TODO: Integrate with SEO tools (SEMrush, Ahrefs, etc.)
    return {
        "contentIds": content_ids,
        "seoMetrics": {
            "averageRanking": 12.5,
            "organicTraffic": 5200,
            "keywords": {
                "total": 45,
                "top10": 8,
                "top20": 15
            },
            "backlinks": 127
        }
    }


def get_audience_insights(payload: dict) -> dict:
    """Get audience insights"""
    audience_segment = payload.get('audienceSegment', 'all')

    logger.info(f"Getting audience insights for segment: {audience_segment}")

    # TODO: Integrate with analytics platforms
    return {
        "segment": audience_segment,
        "demographics": {
            "ageGroups": {
                "18-24": 0.15,
                "25-34": 0.35,
                "35-44": 0.30,
                "45+": 0.20
            },
            "gender": {
                "male": 0.52,
                "female": 0.48
            },
            "locations": {
                "US": 0.45,
                "UK": 0.20,
                "Other": 0.35
            }
        }
    }


def generate_performance_report(payload: dict) -> dict:
    """Generate performance report"""
    content_ids = payload.get('contentIds', [])

    logger.info(f"Generating performance report for content: {content_ids}")

    # TODO: Generate comprehensive report
    return {
        "contentIds": content_ids,
        "report": {
            "summary": "Overall performance is strong with 15% growth",
            "topPerformers": content_ids[:3] if content_ids else [],
            "recommendations": [
                "Increase posting frequency",
                "Focus on video content",
                "Optimize for mobile"
            ]
        }
    }


def track_conversion_rates(payload: dict) -> dict:
    """Track conversion rates"""
    campaign_id = payload.get('campaignId')
    if not campaign_id:
        raise ValueError("campaignId is required")

    logger.info(f"Tracking conversion rates for campaign: {campaign_id}")

    # TODO: Integrate with conversion tracking
    return {
        "campaignId": campaign_id,
        "conversions": {
            "total": 245,
            "rate": 0.035,
            "byChannel": {
                "email": 0.042,
                "social": 0.028,
                "organic": 0.038
            }
        }
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

        # Action handlers
        action_handlers = {
            'getEngagementMetrics': get_engagement_metrics,
            'getSEOPerformance': get_seo_performance,
            'getAudienceInsights': get_audience_insights,
            'generatePerformanceReport': generate_performance_report,
            'trackConversionRates': track_conversion_rates
        }

        handler = action_handlers.get(action)
        if not handler:
            return [{
                "success": False,
                "name": "error",
                "resultType": "error",
                "result": f"Unknown action: {action}",
                "error": f"Unknown action: {action}"
            }]

        logger.info(f"Executing action: {action} with payload: {payload}")
        result_data = handler(payload)

        return [{
            "success": True,
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
