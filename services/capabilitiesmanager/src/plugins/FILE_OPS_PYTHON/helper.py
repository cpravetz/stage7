import json
import os
import logging
import hashlib
import requests
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Simple dedupe protection to avoid re-processing identical failing inputs
_seen_hashes = set()


def send_to_errorhandler(error, context=None):
    try:
        errorhandler_url = os.environ.get('ERRORHANDLER_URL', 'errorhandler:5090')
        payload = {
            'error': str(error),
            'context': context or ''
        }
        requests.post(f'http://{errorhandler_url}/analyze', json=payload, timeout=10)
    except Exception as e:
        logger.warning(f"Failed to send error to errorhandler: {e}")


def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and normalize the plugin stdin JSON payload into a dict of inputName -> InputValue.

    Plugins should accept inputs formatted as a JSON array of [ [key, value], ... ] where value
    may be a primitive (string/number/bool), or an object like {"value": ...}. This helper
    normalizes non-dict raw values into {'value': raw}. It also filters invalid entries.
    """
    try:
        logger.info(f"Parsing input string ({len(inputs_str)} chars)")
        payload = json.loads(inputs_str)
        inputs: Dict[str, Any] = {}

        # Case A: payload is a list of [key, value] pairs (legacy / preferred)
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, list) and len(item) == 2:
                    key, raw_value = item
                    if isinstance(raw_value, dict):
                        inputs[key] = raw_value
                    else:
                        inputs[key] = {'value': raw_value}
                else:
                    logger.debug(f"Skipping invalid input item in list payload: {item}")

        # Case B: payload is a serialized Map object with entries: [[key, value], ...]
        elif isinstance(payload, dict) and payload.get('_type') == 'Map' and isinstance(payload.get('entries'), list):
            for entry in payload.get('entries', []):
                if isinstance(entry, list) and len(entry) == 2:
                    key, raw_value = entry
                    if isinstance(raw_value, dict):
                        inputs[key] = raw_value
                    else:
                        inputs[key] = {'value': raw_value}
                else:
                    logger.debug(f"Skipping invalid Map entry: {entry}")

        # Case C: payload is already a dict mapping keys -> values (possibly already normalized)
        elif isinstance(payload, dict):
            for key, raw_value in payload.items():
                # Skip internal meta fields if present
                if key == '_type' or key == 'entries':
                    continue
                if isinstance(raw_value, dict):
                    inputs[key] = raw_value
                else:
                    inputs[key] = {'value': raw_value}

        else:
            # Unsupported top-level type, provide clear error
            raise ValueError("Unsupported input format: expected array of pairs, Map with entries, or object mapping")

        logger.info(f"Successfully parsed {len(inputs)} input fields")
        return inputs
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise
