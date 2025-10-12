#!/usr/bin/env python3
"""
SEARCH Plugin for Stage7 (Python Version)

This plugin searches various providers for a given term and returns a list of links.
"""

import sys
import json
import os
import requests
import urllib.request
import urllib.parse
import re
from typing import Dict, List, Any, Optional, Tuple
import logging
import random
import time

# Configure logging
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Data Classes ---

class PluginOutput:
    """Represents a plugin output result."""
    def __init__(self, success: bool, name: str, result_type: str,
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
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

# --- Search Provider Abstraction ---

class SearchProvider:
    """Abstract base class for a search provider."""
    def __init__(self, name: str, performance_score: int = 100):
        self.name = name
        self.performance_score = performance_score

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        """Perform the search and return a list of results."""
        raise NotImplementedError

    def update_performance(self, success: bool):
        """Update the performance score based on search success."""
        if success:
            self.performance_score = min(100, self.performance_score + 5)
        else:
            self.performance_score = max(0, self.performance_score - 20)

# --- Concrete Search Providers ---

class BrainSearchProvider(SearchProvider):
    """Search provider that uses the Brain service."""
    def __init__(self, **kwargs):
        super().__init__("Brain")
        self.inputs = kwargs.get('inputs', {})

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        logger.warning("All primary search providers failed. Using BrainSearchProvider as a last resort. Results may be hallucinated.")
        prompt = f"Perform a web search for '{search_term}' and return the top 5 results as a JSON array of objects, where each object has 'name', 'url', and 'snippet' keys."
        try:
            raw_response = self._call_brain(prompt, "json")
            results = json.loads(raw_response)
            if isinstance(results, list):
                return results
            else:
                logger.error(f"Brain search returned non-list response: {results}")
                return []
        except Exception as e:
            logger.error(f"Brain search failed: {e}")
            return []

    def _call_brain(self, prompt: str, response_type: str) -> str:
        auth_token = self._get_auth_token()
        brain_url_input = self.inputs.get('brain_url')
        brain_url = brain_url_input if brain_url_input else 'brain:5070'
        
        payload = {
            "messages": [{"role": "system", "content": "You are a helpful assistant that outputs JSON."},
                         {"role": "user", "content": prompt}],
            "conversationType": "TextToJSON" if response_type == "json" else "TextToText",
            "temperature": 0.1
        }
        headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {auth_token}'}
        response = requests.post(f"http://{brain_url}/chat", json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        result = response.json()
        if 'result' not in result:
            raise Exception("Brain response missing 'result' field")
        return result['result']

    def _get_auth_token(self) -> str:
        """Get Brain authentication token from inputs with enhanced error handling."""
        try:
            # First check environment variable (set by CapabilitiesManager)
            if 'BRAIN_AUTH_TOKEN' in os.environ:
                return os.environ['BRAIN_AUTH_TOKEN']

            # Then check inputs
            token_input = self.inputs.get('__brain_auth_token')
            if token_input:
                token_data = token_input
                if isinstance(token_data, dict):
                    if 'value' in token_data:
                        return token_data['value']
                    elif 'token' in token_data:
                        return token_data['token']
                elif isinstance(token_data, str):
                    return token_data
        except Exception as e:
            logger.error(f"Failed to get Brain auth token: {str(e)}")
            raise

class GoogleWebSearchProvider(SearchProvider):
    """Search provider that uses Google Custom Search API."""
    def __init__(self, inputs: Dict[str, Any] = {}):
        super().__init__("GoogleWebSearch", performance_score=95) # High priority
        self.api_key = os.getenv('GOOGLE_API_KEY')
        self.search_engine_id = os.getenv('GOOGLE_SEARCH_ENGINE_ID')

        if not self.api_key and '__google_api_key' in inputs:
            key_data = inputs['__google_api_key']
            if isinstance(key_data, dict) and 'value' in key_data:
                self.api_key = key_data['value']
        
        if not self.search_engine_id and '__google_search_engine_id' in inputs:
            key_data = inputs['__google_search_engine_id']
            if isinstance(key_data, dict) and 'value' in key_data:
                self.search_engine_id = key_data['value']

        self.base_url = "https://www.googleapis.com/customsearch/v1"

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        try:
            if not self.api_key or not self.search_engine_id:
                logger.warning("Google Custom Search API key or Search Engine ID not configured. Skipping Google search.")
                self.update_performance(success=False)
                raise Exception("Google API credentials not configured")

            params = {
                'key': self.api_key,
                'cx': self.search_engine_id,
                'q': search_term,
                'num': 10,  # Number of results to return (max 10 per request)
                'safe': 'medium',  # Safe search setting
                'fields': 'items(title,link,snippet)'  # Only return fields we need
            }

            response = requests.get(self.base_url, params=params, timeout=15)
            response.raise_for_status()

            data = response.json()
            results = []

            if 'items' in data:
                for item in data['items']:
                    results.append({
                        'title': item.get('title', item.get('name', '')),
                        'url': item.get('link', ''),
                        'snippet': item.get('snippet', '')
                    })

            self.update_performance(success=True)
            return results

        except requests.exceptions.RequestException as e:
            logger.error(f"Google Custom Search API request failed: {str(e)}")
            self.update_performance(success=False)
            raise
        except Exception as e:
            logger.error(f"GoogleWebSearch failed: {str(e)}")
            self.update_performance(success=False)
            raise

class LangsearchSearchProvider(SearchProvider):
    """Search provider for Langsearch with advanced semantic search capabilities."""
    def __init__(self, api_key: str):
        super().__init__("Langsearch", performance_score=100)  
        self.api_key = api_key
        self.base_url = os.getenv('LANGSEARCH_API_URL', 'https://api.langsearch.com')
        self.rate_limit_seconds = 1
        self.last_request_time = 0

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        """Execute semantic search using LangSearch API."""
        retries = 3
        backoff_factor = 0.5

        for attempt in range(retries):
            # --- Rate Limiting Logic ---
            current_time = time.time()
            time_since_last_request = current_time - self.last_request_time

            if time_since_last_request < self.rate_limit_seconds:
                sleep_duration = self.rate_limit_seconds - time_since_last_request
                time.sleep(sleep_duration)
            # --- End Rate Limiting ---

            try:
                url = f"{self.base_url}/v1/web-search"
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
                
                payload = {
                    "query": search_term,
                    "count": 10
                }
                if 'freshness' in kwargs:
                    payload['freshness'] = kwargs['freshness']
                if 'summary' in kwargs:
                    payload['summary'] = kwargs['summary']
                
                response = requests.post(url, headers=headers, json=payload, timeout=15)
                response.raise_for_status()
                
                full_response = response.json()
                data = full_response.get("data", full_response)

                results = []
                if "webPages" in data and "value" in data["webPages"]:
                    for item in data["webPages"]["value"]:
                        if item.get("name") and item.get("url"):
                            results.append({"title": item.get("name", ""), "url": item.get("url", ""), "snippet": item.get("snippet", "")})
                elif "results" in data and isinstance(data["results"], list):
                    for item in data["results"]:
                        if item.get("title") and item.get("url"):
                            results.append({"title": item.get("title", ""), "url": item.get("url", ""), "snippet": item.get("snippet", "")})
                elif "items" in data and isinstance(data["items"], list):
                    for item in data["items"]:
                        if item.get("title") and item.get("url"):
                            results.append({"title": item.get("title", ""), "url": item.get("url", ""), "snippet": item.get("snippet", "")})
                elif isinstance(data, list):
                    for item in data:
                        if item.get("title") and item.get("url"):
                            results.append({"title": item.get("title", ""), "url": item.get("url", ""), "snippet": item.get("snippet", "")})
                
                return results
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429 and attempt < retries - 1:
                    sleep_time = backoff_factor * (2 ** attempt)
                    logger.warning(f"LangSearch rate limited (429). Retrying in {sleep_time:.2f} seconds...")
                    time.sleep(sleep_time)
                    continue
                else:
                    logger.error(f"LangSearch API request failed: {str(e)}")
                    self.update_performance(success=False)
                    return []  # Return empty results instead of raising
            except requests.exceptions.RequestException as e:
                logger.error(f"LangSearch API request failed: {str(e)}")
                self.update_performance(success=False)
                return []  # Return empty results instead of raising
            except Exception as e:
                logger.error(f"LangSearch processing failed: {str(e)}")
                self.update_performance(success=False)
                return []  # Return empty results instead of raising
            finally:
                self.last_request_time = time.time()
        
        logger.error(f"LangSearch search failed after {retries} retries.")
        return []

class DuckDuckGoSearchProvider(SearchProvider):
    """Search provider for DuckDuckGo."""
    def __init__(self):
        super().__init__("DuckDuckGo", performance_score=80)
        self.base_url = "https://api.duckduckgo.com"

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        try:
            params = {
                'q': search_term,
                'format': 'json',
                'no_html': 1,
                'skip_disambig': 1
            }
            url = f"{self.base_url}/?{urllib.parse.urlencode(params)}"
            with urllib.request.urlopen(url, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
            
            results = []
            # Add abstract result if available
            if data.get('AbstractURL') and data.get('AbstractText'):
                results.append({
                    'title': data.get('Heading', 'Abstract'),
                    'url': data.get('AbstractURL'),
                    'snippet': data.get('AbstractText')
                })
            
            # Add related topics
            for topic in data.get('RelatedTopics', []):
                if isinstance(topic, dict) and topic.get('FirstURL') and topic.get('Text'):
                    results.append({
                        'title': topic['Text'].split(' - ')[0],
                        'url': topic['FirstURL'],
                        'snippet': topic.get('Text', '')
                    })
            
            return results
            
        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {str(e)}")
            self.update_performance(success=False)
            raise

class SearxNGSearchProvider(SearchProvider):
    """Search provider for SearxNG with improved error handling."""
    def __init__(self):
        super().__init__("SearxNG", performance_score=60)
        self.base_urls = [
            'http://searxng:8080',
            'https://searx.stream/',
            'https://search.inetol.net/',
            'https://search.rhscz.eu/',
            'https://s.mble.dk/',
            'https://search.hbubli.cc/'
        ]
        self.current_url_index = 0
        self.backoff_time = 5 # Increased initial backoff time in seconds
        self.max_backoff_time = 60 # Maximum backoff time

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        errors = []
        for _ in range(len(self.base_urls)):
            searxng_url = f"{self.base_urls[self.current_url_index]}/search"
            try:
                params = {
                    'q': search_term,
                    'categories': 'general',
                    'language': 'en',
                    'engines': 'google,bing,brave,duckduckgo',
                    'format': 'json'
                }
                
                response = requests.get(
                    searxng_url,
                    params=params,
                    timeout=10,
                    headers={'User-Agent': 'Mozilla/5.0 Stage7SearchBot/1.0'}
                )
                response.raise_for_status()
                try:
                    data = response.json()
                except json.JSONDecodeError as json_e:
                    error_msg = f"SearxNG instance {searxng_url} failed: JSONDecodeError: {json_e}. Raw response: {response.text}"
                    logger.warning(error_msg)
                    errors.append(error_msg)
                    # Continue to next instance in the loop
                    self.current_url_index = (self.current_url_index + 1) % len(self.base_urls)
                    continue # Skip to the next iteration of the for loop

                results = []
                for item in data.get("results", []):
                    results.append({"title": item.get("title"), "url": item.get("url"), "snippet": item.get("content")})

                if results:
                    self.backoff_time = 5 # Reset backoff time on success
                    return results
                    
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:
                    error_msg = f"SearxNG instance {searxng_url} failed: 429 Client Error: Too Many Requests for url: {searxng_url}"
                    logger.warning(f"SearxNG instance rate limited (429) - sleeping for {self.backoff_time} seconds.")
                    time.sleep(self.backoff_time)
                    self.backoff_time = min(self.backoff_time * 2, self.max_backoff_time) # Exponential backoff with cap
                else:
                    error_msg = f"SearxNG instance {searxng_url} failed: {str(e)}"
                    logger.warning(error_msg)
                errors.append(error_msg)
            except requests.exceptions.RequestException as e:
                error_msg = f"SearxNG instance {searxng_url} failed: {str(e)}"
                logger.warning(error_msg)
                errors.append(error_msg)
                
            # Rotate to next instance
            self.current_url_index = (self.current_url_index + 1) % len(self.base_urls)
        
        # If we get here, all instances failed
        logger.error(f"All SearxNG instances failed: {'; '.join(errors)}")
        self.update_performance(success=False)
        raise Exception("All SearxNG instances failed")

# --- Plugin Logic ---

class SearchPlugin:
    """Manages search providers and executes the search."""
    def __init__(self, inputs: Dict[str, Any]):
        self.inputs = inputs
        self.providers = self._initialize_providers()

    def _initialize_providers(self) -> List[SearchProvider]:
        """Initializes all available search providers in priority order."""
        providers = []
        
        # 1. GoogleWebSearch as primary provider (using the built-in tool)
        providers.append(GoogleWebSearchProvider(self.inputs))

        # 2. LangSearch as second provider (if available)
        langsearch_api_key = None
        if 'LANGSEARCH_API_KEY' in os.environ:
            langsearch_api_key = os.environ['LANGSEARCH_API_KEY']
        elif '__langsearch_api_key' in self.inputs:
            key_data = self.inputs['__langsearch_api_key']
            if isinstance(key_data, dict) and 'value' in key_data:
                langsearch_api_key = key_data['value']
                
        if langsearch_api_key:
            try:
                provider = LangsearchSearchProvider(api_key=langsearch_api_key)
                providers.append(provider)
            except Exception as e:
                logger.error(f"Failed to initialize LangSearch provider: {str(e)}")
        else:
            logger.warning("LangSearch API key not found in any expected location - semantic search will not be available")

        # 3. DuckDuckGo as third fallback
        providers.append(DuckDuckGoSearchProvider())

        # 4. SearxNG as fourth fallback
        providers.append(SearxNGSearchProvider())
        
        # 5. Brain as final fallback (always available if there's a token)
        if '__brain_auth_token' in self.inputs or 'BRAIN_AUTH_TOKEN' in os.environ:
            brain_provider = BrainSearchProvider(inputs=self.inputs)
            brain_provider.performance_score = 40  # Lower initial score as it's a fallback
            providers.append(brain_provider)
        
        if not providers:
            logger.error("No search providers were successfully initialized!")
            raise RuntimeError("Failed to initialize any search providers")
            
        return providers

    def execute_search(self, search_terms: List[str]) -> Tuple[List[Dict[str, str]], List[str]]:
        """
        Executes the search across providers, managing fallbacks and performance.
        Returns a tuple of (all_results, all_errors).
        """
        all_results = []
        all_errors = []

        for term in search_terms:
            original_term = term
            for i in range(3): # Try up to 3 times (original + 2 generalizations)
                term_results = []
                term_errors = []
                
                # Sort providers by performance score, highest first
                sorted_providers = sorted(self.providers, key=lambda p: p.performance_score, reverse=True)
                
                search_successful = False
                for provider in sorted_providers:
                    try:
                        results = provider.search(term)
                        
                        if results:
                            term_results.extend(results)
                            provider.update_performance(success=True)
                            search_successful = True
                            break  # Move to the next provider
                        else:
                            logger.warning(f"{provider.name} found no results for '{term}' - trying next provider")
                            # Only slightly penalize for no results
                            provider.performance_score = max(0, provider.performance_score - 5)
                    except Exception as e:
                        error_msg = f"{provider.name} search failed for '{term}': {e}"
                        logger.error(error_msg)
                        term_errors.append(error_msg)
                        provider.update_performance(success=False)

                    if search_successful:
                        break
                
                if search_successful:
                    break # Break the generalization loop if search is successful
                else:
                    # Generalize the search term by removing the last word
                    term_parts = term.split()
                    if len(term_parts) > 1:
                        term = " ".join(term_parts[:-1])
                    else:
                        break # Cannot generalize further

            if not search_successful:
                logger.error(f"All providers failed for search term: {original_term}")
                # Try brain search as a last resort if it's not already tried
                brain_provider = next((p for p in self.providers if isinstance(p, BrainSearchProvider)), None)
                if brain_provider:
                    try:
                        results = brain_provider.search(original_term)
                        if results:
                            term_results.extend(results)
                            search_successful = True
                    except Exception as e:
                        logger.error(f"BrainSearchProvider fallback also failed: {e}")
                        all_errors.append(f"BrainSearchProvider fallback failed: {e}")


            if term_results:
                all_results.extend(term_results)
            else:
                all_errors.extend(term_errors)
        
        return all_results, all_errors

def execute_plugin(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Main plugin execution function."""
    try:
        search_term_input = inputs.get('searchTerm')
        if not search_term_input:
            return [PluginOutput(False, "error", "error", None, "Missing required input: searchTerm").to_dict()]

        # Extract value if it's a dict
        if isinstance(search_term_input, dict) and 'value' in search_term_input:
            search_terms_raw = search_term_input['value']
        else:
            search_terms_raw = search_term_input
        if isinstance(search_terms_raw, str):
            search_terms = [search_terms_raw.strip()]
        elif isinstance(search_terms_raw, list):
            search_terms = [term.strip() for term in search_terms_raw if isinstance(term, str) and term.strip()]
        else:
            return [PluginOutput(False, "error", "error", None, "Search term(s) must be a non-empty string or list of strings").to_dict()]

        if not search_terms:
            return [PluginOutput(False, "error", "error", None, "Search term(s) cannot be empty").to_dict()]

        plugin = SearchPlugin(inputs)
        all_results, all_errors = plugin.execute_search(search_terms)

        if not all_results and all_errors:
            return [PluginOutput(False, "error", "error", None, "All search providers failed: " + ". ".join(all_errors)).to_dict()]
        
        description = f"Found {len(all_results)} results for '{', '.join(search_terms)}'" if all_results else "No results found"
        return [PluginOutput(True, "results", "array", all_results, description).to_dict()]

    except Exception as e:
        logger.exception("An unexpected error occurred in execute_plugin")
        return [PluginOutput(False, "error", "error", None, f"An unexpected error occurred: {e}").to_dict()]

# --- Main Execution ---
def parse_inputs(inputs_str: str) -> Dict[str, Any]:
    """Parse and normalize the plugin stdin JSON payload into a dict of inputName -> InputValue.

    Plugins should accept inputs formatted as a JSON array of [ [key, value], ... ] where value
    may be a primitive (string/number/bool), or an object like {"value": ...}. This helper
    normalizes non-dict raw values into {'value': raw}. It also filters invalid entries.
    """
    try:
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

        return inputs
    except Exception as e:
        logger.error(f"Input parsing failed: {e}")
        raise

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read()
        inputs = parse_inputs(input_data)

        outputs = execute_plugin(inputs)
        print(json.dumps(outputs, indent=2))

    except Exception as e:
        logger.exception("Plugin execution failed at main level")
        error_output = PluginOutput(False, "error", "error", None, f"Plugin execution failed: {e}")
        print(json.dumps([error_output.to_dict()], indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()