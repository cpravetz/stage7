#!/usr/bin/env python3
"""
SCRAPE Plugin - Python Implementation
Scrapes content from a given URL using requests and BeautifulSoup
"""

import json
import sys
import os
import requests
from bs4 import BeautifulSoup
from typing import Dict, List, Any, Optional, Union
import logging
import time
import random
from urllib.parse import urljoin, urlparse, urlparse

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PluginParameterType:
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    ERROR = "ERROR"

class ScrapePlugin:
    def __init__(self):
        self.security_manager_url = os.getenv('SECURITYMANAGER_URL', 'securitymanager:5010')
        self.client_secret = os.getenv('CLIENT_SECRET', 'stage7AuthSecret')
        self.token = None
        
        # User agents for rotation
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0'
        ]
        
    def get_auth_token(self) -> Optional[str]:
        """Get authentication token from SecurityManager"""
        try:
            response = requests.post(
                f"http://{self.security_manager_url}/auth/service",
                json={
                    "componentType": "CapabilitiesManager",
                    "clientSecret": self.client_secret
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            return data.get('token')
        except Exception as e:
            logger.error(f"Failed to get auth token: {e}")
            return None

    def fetch_html(self, url: str) -> str:
        """Fetch HTML content from URL with rate limiting and user agent rotation"""
        try:
            # Add random delay for respectful scraping
            time.sleep(random.uniform(1, 3))
            
            headers = {
                'User-Agent': random.choice(self.user_agents),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
            
            response = requests.get(
                url,
                headers=headers,
                timeout=30,
                allow_redirects=True
            )
            response.raise_for_status()
            
            # Check content type
            content_type = response.headers.get('content-type', '').lower()
            if 'text/html' not in content_type and 'application/xhtml' not in content_type:
                logger.warning(f"URL {url} returned non-HTML content: {content_type}")
            
            return response.text
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch HTML from {url}: {e}")
            # Instead of raising, we'll let the caller handle this
            raise Exception(f"Failed to fetch HTML from {url}: {str(e)}")

    def scrape_content(self, html: str, config: Dict[str, Any]) -> List[str]:
        """Scrape content from HTML using BeautifulSoup"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Select elements based on selector
            selector = config.get('selector')
            elements = []
            if selector:
                elements = soup.select(selector)
                if not elements:
                    logger.warning(f"Selector '{selector}' returned no elements. Trying fallback selectors.")

            if not elements:
                fallback_selectors = ['main', 'article', '#content', '#main', '.content', '.main']
                for fallback in fallback_selectors:
                    elements = soup.select(fallback)
                    if elements:
                        logger.info(f"Found content with fallback selector: '{fallback}'")
                        break
            
            if not elements:
                logger.warning("All selectors and fallbacks failed. No content found.")
                return []
            
            # Extract content based on attribute
            attribute = config.get('attribute')
            result = []
            
            for element in elements:
                if attribute:
                    # Extract specific attribute
                    if attribute == 'text':
                        content = element.get_text(strip=True)
                    elif attribute == 'html':
                        content = str(element)
                    else:
                        content = element.get(attribute, '')
                else:
                    # Default to text content
                    content = element.get_text(strip=True)
                
                if content:
                    result.append(content)
            
            # Apply limit if specified
            limit = config.get('limit')
            if limit and isinstance(limit, int) and limit > 0:
                result = result[:limit]
            
            return result
            
        except Exception as e:
            logger.error(f"Error scraping content: {e}")
            raise Exception(f"Error scraping content: {str(e)}")

    def parse_config(self, inputs_map: Dict[str, Any]) -> Dict[str, Any]:
        """Parse scraping configuration from inputs"""
        config = {
            'selector': self._get_input_value(inputs_map, 'selector'),
            'attribute': self._get_input_value(inputs_map, 'attribute'),
            'limit': self._get_input_value(inputs_map, 'limit')
        }

        # Filter out None values so we can use .get() with defaults later
        config = {k: v for k, v in config.items() if v is not None}

        # Convert limit to integer if provided
        if 'limit' in config:
            try:
                config['limit'] = int(config['limit'])
            except (ValueError, TypeError):
                logger.warning(f"Invalid limit value provided: {config['limit']}. Ignoring limit.")
                del config['limit']

        return config

    @staticmethod
    def convert_to_full_url(partial_url, default_scheme='https', context_url=None):
        """
        Advanced URL converter with additional features.
    
        Args:
            partial_url (str): The partial URL to convert
            default_scheme (str): Default scheme to use if none provided
            context_url (str): Optional context URL to inherit scheme from protocol-relative URLs
    
        Returns:
            str: A full URL with scheme
        """
        if not partial_url:
            raise ValueError("URL cannot be empty")
    
        # Strip whitespace and clean up duplicated schemes
        url = partial_url.strip()
        while url.lower().startswith(('http://http://', 'https://https://', 'http://https://', 'https://http://')):
            if url.lower().startswith('http://'):
                url = url[7:]
            elif url.lower().startswith('https://'):
                url = url[8:]

        # Case 1: Already has a scheme
        if url.startswith(('https://', 'http://', 'ftp://', 'ftps://')):
            return url
    
        # Case 2: Protocol-relative URL (starts with //)
        if url.startswith('//'):
            # If context URL is provided, use its scheme
            if context_url and context_url.startswith(('https://', 'http://')):
                context_scheme = context_url.split('://')[0]
                return f"{context_scheme}:{url}"
            return f"{default_scheme}:{url}"
    
        # Case 3: Domain only (no scheme or //)
        return f"{default_scheme}://{url}"

    def _get_input_value(self, inputs: Dict[str, Any], key: str, default: Any = None) -> Any:
        """Safely gets a value from the parsed inputs dictionary and strips it if it's a string."""
        value_obj = inputs.get(key)
        
        if isinstance(value_obj, dict):
            value = value_obj.get('value', default)
        else:
            value = value_obj if value_obj is not None else default
            
        if isinstance(value, str):
            return value.strip()
        return value

    

    def _is_valid_url(self, url: str) -> bool:
        try:
            result = urlparse(url)
            # Check if scheme and netloc (network location, i.e., domain) exist
            return all([result.scheme, result.netloc])
        except ValueError:
            return False

    def _extract_url_from_input(self, url_input: Any) -> Optional[str]:
        """
        Extracts a URL string from various input formats.
        This method is designed to be robust, handling raw strings, dictionaries,
        and even JSON strings that might contain URL information.
        """
        if url_input is None:
            return None

        # If it's already a string, strip and return if not empty
        if isinstance(url_input, str):
            url_stripped = url_input.strip()
            if url_stripped:
                # Attempt to parse as JSON if it looks like a JSON object
                if url_stripped.startswith('{') and url_stripped.endswith('}'):
                    try:
                        parsed = json.loads(url_stripped)
                        if isinstance(parsed, dict):
                            # Recursively call with the parsed dictionary
                            return self._extract_url_from_input(parsed)
                    except (json.JSONDecodeError, TypeError):
                        pass  # Not a valid JSON, treat as a plain URL string
                return url_stripped
            return None

        # If it's a dictionary, check for common URL keys and 'value'
        if isinstance(url_input, dict):
            # Prioritize explicit URL keys
            for url_key in ['url', 'website', 'link', 'endpoint', 'href', 'src']:
                if url_key in url_input and url_input[url_key]:
                    extracted = self._extract_url_from_input(url_input[url_key])
                    if extracted:
                        return extracted

            # Fallback to 'value' key, common in InputValue objects
            if 'value' in url_input and url_input['value']:
                extracted = self._extract_url_from_input(url_input['value'])
                if extracted:
                    return extracted

            # If it's a single key-value pair, the value might be the URL or a JSON string
            if len(url_input) == 1:
                for key, value in url_input.items():
                    extracted = self._extract_url_from_input(value)
                    if extracted:
                        return extracted

        # If it's a list, try to extract from the first item
        if isinstance(url_input, list) and len(url_input) > 0:
            extracted = self._extract_url_from_input(url_input[0])
            if extracted:
                return extracted

        return None

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        try:
            url_input = (
                self._get_input_value(inputs_map, 'url') or
                self._get_input_value(inputs_map, 'website') or
                self._get_input_value(inputs_map, 'link') or
                self._get_input_value(inputs_map, 'endpoint') or
                self._get_input_value(inputs_map, 'websites')
            )

            urls_to_scrape = []
            # Ensure url_input is always an iterable for consistent processing
            if isinstance(url_input, str):
                items_to_process = [url_input]
            elif isinstance(url_input, list):
                items_to_process = url_input
            elif isinstance(url_input, dict):
                items_to_process = [url_input]
            else:
                items_to_process = []

            for item in items_to_process:
                extracted_url = self._extract_url_from_input(item)
                if extracted_url:
                    urls_to_scrape.append(extracted_url)

            if not urls_to_scrape:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": f"No valid URLs found in input: {url_input}",
                    "result": None,
                    "error": f"Could not extract valid URL from input: {type(url_input).__name__} - {str(url_input)[:100]}"
                }]

            all_scraped_data = []
            failed_urls = []
            successful_urls = []

            for url in urls_to_scrape:
                try:
                    full_url = self.convert_to_full_url(url, 'https')
                    if not self._is_valid_url(full_url):
                        error_detail = {
                            "url": url,
                            "errorType": "Invalid URL",
                            "message": f"Skipping invalid or unresolvable URL: {url} (converted to: {full_url})"
                        }
                        logger.warning(error_detail["message"])
                        failed_urls.append(error_detail)
                        continue
                    config = self.parse_config(inputs_map)
                    try:
                        html = self.fetch_html(full_url)
                        scraped_data = self.scrape_content(html, config)
                        all_scraped_data.extend(scraped_data)
                        successful_urls.append(url)
                    except requests.exceptions.RequestException as req_e:
                        status_code = getattr(req_e.response, 'status_code', None)
                        content_type = getattr(req_e.response, 'headers', {}).get('content-type', None) if getattr(req_e, 'response', None) else None
                        error_detail = {
                            "url": full_url,
                            "errorType": "Network/HTTP Error",
                            "statusCode": status_code,
                            "contentType": content_type,
                            "message": str(req_e)
                        }
                        logger.error(f"Failed to fetch HTML from {full_url}: {str(req_e)}")
                        failed_urls.append(error_detail)
                    except Exception as e:
                        error_detail = {
                            "url": full_url,
                            "errorType": "Scraping Error",
                            "message": str(e)
                        }
                        logger.error(f"Failed to scrape {full_url}: {str(e)}")
                        failed_urls.append(error_detail)
                except Exception as e:
                    error_detail = {
                        "url": url,
                        "errorType": "General Error",
                        "message": str(e)
                    }
                    logger.error(f"General error scraping {url}: {str(e)}")
                    failed_urls.append(error_detail)

            if successful_urls:
                result_description = f"Scraped content from {len(successful_urls)} URL(s)"
                if failed_urls:
                    result_description += f" ({len(failed_urls)} failed)\nFailed URLs: "
                    for err in failed_urls:
                        result_description += f"\n- {err['url']}: {err['errorType']} ({err.get('statusCode', '')}) {err['message']}"
                return [{
                    "success": True,
                    "name": "content",
                    "resultType": PluginParameterType.ARRAY,
                    "resultDescription": result_description,
                    "result": all_scraped_data,
                    "mimeType": "application/json",
                    "errors": failed_urls
                }]
            else:
                error_summary = "Failed to scrape any URLs.\n"
                for err in failed_urls:
                    error_summary += f"- {err['url']}: {err['errorType']} ({err.get('statusCode', '')}) {err['message']}\n"
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": error_summary,
                    "result": None,
                    "error": error_summary,
                    "errors": failed_urls
                }]
        except Exception as e:
            logger.error(f"SCRAPE plugin execution failed: {e}")
            try:
                url_for_error = self._get_input_value(inputs_map, 'url', 'undefined URL')
                if isinstance(url_for_error, (dict, list)):
                    url_for_error = str(url_for_error)[:50] + "..." if len(str(url_for_error)) > 50 else str(url_for_error)
            except Exception:
                url_for_error = "undefined URL"
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error scraping {url_for_error}",
                "result": None,
                "error": str(e)
            }]

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

def main():
    """Main entry point for the plugin"""
    try:
        # Read inputs from stdin
        inputs_str = sys.stdin.read()
        inputs_map = parse_inputs(inputs_str)

        # Execute plugin
        plugin = ScrapePlugin()
        results = plugin.execute(inputs_map)

        # Output results to stdout
        print(json.dumps(results))

    except Exception as e:
        error_result = [{
            "success": False,
            "name": "error",
            "resultType": PluginParameterType.ERROR,
            "resultDescription": "Plugin execution error",
            "result": None,
            "error": str(e)
        }]
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()