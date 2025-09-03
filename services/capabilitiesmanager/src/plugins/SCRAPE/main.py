# --- Robust wrapper for deduplication, temp dir hygiene, and error escalation ---
import tempfile
import shutil
import hashlib

seen_hashes = set()

def robust_execute_plugin(inputs):
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in seen_hashes:
            return [
                {
                    "success": False,
                    "name": "error",
                    "resultType": "error",
                    "resultDescription": "Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.",
                    "error": "Duplicate input detected."
                }
            ]
        seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="scrape_plugin_")
        os.environ["SCRAPE_PLUGIN_TEMP_DIR"] = temp_dir

        # Call the original plugin logic
        result = execute_plugin(inputs)

        # Strict output validation: must be a list or dict
        if not isinstance(result, (list, dict)):
            raise ValueError("Output schema validation failed: must be a list or dict.")

        return result
    except Exception as e:
        # Log the error locally and return a structured error output
        logger.error(f"Error in robust_execute_plugin: {e}")
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
            raise Exception(f"Failed to fetch HTML from {url}: {str(e)}")

    def scrape_content(self, html: str, config: Dict[str, Any]) -> List[str]:
        """Scrape content from HTML using BeautifulSoup"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Select elements based on selector
            selector = config.get('selector')
            if selector:
                elements = soup.select(selector)
            else:
                elements = soup.find_all()
            
            if not elements:
                logger.warning(f"No elements found for selector: {selector or 'all'}")
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

    def execute(self, inputs_map: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute the SCRAPE plugin"""
        try:
            # Extract URL directly
            url_input = self._get_input_value(inputs_map, 'url') or self._get_input_value(inputs_map, 'websites')

            if not url_input:
                return [{
                    "success": False,
                    "name": "error",
                    "resultType": PluginParameterType.ERROR,
                    "resultDescription": "URL is required for SCRAPE plugin",
                    "result": None,
                    "error": "No URL provided to SCRAPE plugin"
                }]

            urls_to_scrape = []
            if isinstance(url_input, str):
                urls_to_scrape.append(url_input)
            elif isinstance(url_input, list):
                urls_to_scrape.extend(url_input)

            all_scraped_data = []
            for url in urls_to_scrape:
                try:
                    # Validate and convert URL
                    full_url = self.convert_to_full_url(url, 'https')
                    
                    # Add stricter URL validation
                    if not self._is_valid_url(full_url):
                        logger.warning(f"Skipping invalid or unresolvable URL: {url} (converted to: {full_url})")
                        continue

                    # Parse configuration
                    config = self.parse_config(inputs_map)
                    # Fetch HTML content
                    html = self.fetch_html(full_url)
                    
                    # Scrape content
                    scraped_data = self.scrape_content(html, config)
                    all_scraped_data.extend(scraped_data)
                except Exception as e:
                    logger.error(f"Failed to scrape {url}: {e}")

            return [{
                "success": True,
                "name": "content",
                "resultType": PluginParameterType.ARRAY,
                "resultDescription": f"Scraped content from {len(urls_to_scrape)} URL(s)",
                "result": all_scraped_data,
                "mimeType": "application/json"
            }]

        except Exception as e:
            logger.error(f"SCRAPE plugin execution failed: {e}")
            return [{
                "success": False,
                "name": "error",
                "resultType": PluginParameterType.ERROR,
                "resultDescription": f"Error scraping {self._get_input_value(inputs_map, 'url', 'undefined URL')}", # Direct access
                "result": None,
                "error": str(e)
            }]

def main():
    """Main entry point for the plugin"""
    try:
        # Read inputs from stdin
        inputs_str = sys.stdin.read().strip()
        if not inputs_str:
            raise ValueError("No input provided")

        # Parse inputs - expecting serialized Map format
        inputs_list = json.loads(inputs_str)
        inputs_map = {}
        for item in inputs_list:
            if isinstance(item, list) and len(item) == 2:
                key, val = item
                inputs_map[key] = val
            else:
                logger.warning(f"Skipping invalid input item: {item}")

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
