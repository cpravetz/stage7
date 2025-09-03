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

class InputValue:
    """Represents a plugin input parameter."""
    def __init__(self, inputName: str, value: Any, valueType: str, args: Dict[str, Any] = None):
        self.inputName = inputName
        self.value = value
        self.valueType = valueType
        self.args = args or {}





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
        prompt = f"Perform a web search for '{search_term}' and return the top 5 results as a JSON array of objects, where each object has 'title', 'url', and 'snippet' keys."
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
        brain_url = brain_url_input.value if brain_url_input and brain_url_input.value else 'brain:5070'
        
        payload = {
            "messages": [{"role": "system", "content": "You are a helpful assistant that outputs JSON."},
                         {"role": "user", "content": prompt}],
            "conversationType": "TextToJSON" if response_type == "json" else "TextToText",
            "temperature": 0.1
        }
        headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {auth_token}'}
        response = requests.post(f"http://{brain_url}/chat", json=payload, headers=headers, timeout=60)
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
                logger.info("Found Brain auth token in environment variable.")
                return os.environ['BRAIN_AUTH_TOKEN']

            # Then check inputs
            token_input = self.inputs.get('__brain_auth_token')
            if token_input:
                token_data = token_input.value
                if isinstance(token_data, dict):
                    if 'value' in token_data:
                        logger.info("Found Brain auth token in inputs['__brain_auth_token'].value['value']")
                        return token_data['value']
                    elif 'token' in token_data:
                        logger.info("Found Brain auth token in inputs['__brain_auth_token'].value['token']")
                        return token_data['token']
                elif isinstance(token_data, str):
                    logger.info("Found Brain auth token in inputs['__brain_auth_token'].value")
                    return token_data
        except Exception as e:
            logger.error(f"Failed to get Brain auth token: {str(e)}")
            raise

class GoogleSearchProvider(SearchProvider):
    """Search provider for Google Custom Search."""
    def __init__(self, api_key: str, cse_id: str):
        super().__init__("Google")
        self.api_key = api_key
        self.cse_id = cse_id

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        url = "https://www.googleapis.com/customsearch/v1"
        params = {"key": self.api_key, "cx": self.cse_id, "q": search_term}
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        return [{"title": item.get("title"), "url": item.get("link")} for item in data.get("items", [])]

class LangsearchSearchProvider(SearchProvider):
    """Search provider for Langsearch with advanced semantic search capabilities."""
    def __init__(self, api_key: str):
        super().__init__("Langsearch", performance_score=100)  # Start with highest priority
        self.api_key = api_key
        self.base_url = os.getenv('LANGSEARCH_API_URL', 'https://api.langsearch.com')
        self.rate_limit_seconds = 1
        self.timestamp_file = "/tmp/langsearch_ratelimit.txt"

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        """Execute semantic search using LangSearch API."""
        # --- Rate Limiting Logic ---
        last_request_time = 0
        try:
            with open(self.timestamp_file, 'r') as f:
                last_request_time = float(f.read())
        except (FileNotFoundError, ValueError):
            pass # File doesn't exist or is invalid, proceed

        current_time = time.time()
        time_since_last_request = current_time - last_request_time

        if time_since_last_request < self.rate_limit_seconds:
            sleep_duration = self.rate_limit_seconds - time_since_last_request
            logger.info(f"LangSearch rate limit: sleeping for {sleep_duration:.2f} seconds.")
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
            
            logger.info(f"Calling LangSearch API at {url}")
            response = requests.post(url, headers=headers, json=payload, timeout=15)
            response.raise_for_status()
            
            full_response = response.json()
            data = full_response.get("data", full_response)

            results = []
            if "webPages" in data and "value" in data["webPages"]:
                for item in data["webPages"]["value"]:
                    if item.get("title") and item.get("url"):
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
            
            logger.info(f"LangSearch found {len(results)} results")
            return results
            
        except requests.exceptions.RequestException as e:
            logger.error(f"LangSearch API request failed: {str(e)}")
            self.update_performance(success=False)
            raise
        except Exception as e:
            logger.error(f"LangSearch processing failed: {str(e)}")
            self.update_performance(success=False)
            raise
        finally:
            with open(self.timestamp_file, 'w') as f:
                f.write(str(time.time()))

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
            'https://searx.stream/',
            'https://search.inetol.net/',
            'https://search.rhscz.eu/',
            'https://s.mble.dk/',
            'https://search.hbubli.cc/'
        ]
        self.current_url_index = 0

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
                data = response.json()
                results = []
                for item in data.get("results", []):
                    results.append({"title": item.get("title"), "url": item.get("url"), "snippet": item.get("content")})

                if results:
                    logger.info(f"Successfully retrieved {len(results)} results from SearxNG instance {self.base_urls[self.current_url_index]}")
                    return results
                    
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
    def __init__(self, inputs: Dict[str, InputValue]):
        self.inputs = inputs
        self.providers = self._initialize_providers()

    def _initialize_providers(self) -> List[SearchProvider]:
        """Initializes all available search providers in priority order."""
        providers = []
        
        # 1. LangSearch as primary provider (if available)
        langsearch_api_key = None
        
        # Try getting API key from multiple sources
        if 'LANGSEARCH_API_KEY' in os.environ:
            langsearch_api_key = os.environ['LANGSEARCH_API_KEY']
            logger.info("Found LangSearch API key in environment")
        elif '__langsearch_api_key' in self.inputs:
            key_data = self.inputs['__langsearch_api_key']
            if isinstance(key_data, dict) and 'value' in key_data:
                langsearch_api_key = key_data['value']
                logger.info("Found LangSearch API key in inputs")
                
        if langsearch_api_key:
            logger.info("Initializing LangSearch as primary search provider")
            try:
                provider = LangsearchSearchProvider(api_key=langsearch_api_key)
                providers.append(provider)
            except Exception as e:
                logger.error(f"Failed to initialize LangSearch provider: {str(e)}")
        else:
            logger.warning("LangSearch API key not found in any expected location - semantic search will not be available")

        # 2. Google CSE as first fallback
        google_api_key = None
        google_cse_id = None
        if 'GOOGLE_SEARCH_API_KEY' in os.environ:
            google_api_key = os.getenv('GOOGLE_SEARCH_API_KEY')
            logger.info("Found Google API key in environment")
        elif '__google_search_api_key' in self.inputs:
            key_data = self.inputs['__google_search_api_key']
            if isinstance(key_data, dict) and 'value' in key_data:
                google_api_key = key_data['value']
                logger.info("Found Google API key in inputs")
        if 'GOOGLE_CSE_ID' in os.environ:
            google_cse_id = os.getenv('GOOGLE_CSE_ID')
            logger.info("Found Google CSE ID in environment")
        elif '__google_cse_id' in self.inputs:
            key_data = self.inputs['__google_cse_id']
            if isinstance(key_data, dict) and 'value' in key_data:
                google_cse_id = key_data['value']
                logger.info("Found Google CSE key in inputs")
        if google_api_key and google_cse_id:
            logger.info("Initializing Google Custom Search")
            providers.append(GoogleSearchProvider(api_key=google_api_key, cse_id=google_cse_id))
            logger.info("Successfully initialized Google Custom Search")

        # 3. DuckDuckGo as third fallback
        logger.info("Initializing DuckDuckGo search provider")
        providers.append(DuckDuckGoSearchProvider())

        # 4. SearxNG as second fallback
        logger.info("Initializing SearxNG search provider")
        providers.append(SearxNGSearchProvider())
        
        # 5. Brain as final fallback (always available if there's a token)
        if '__brain_auth_token' in self.inputs or 'BRAIN_AUTH_TOKEN' in os.environ:
            logger.info("Initializing Brain search as final fallback")
            brain_provider = BrainSearchProvider(inputs=self.inputs)
            brain_provider.performance_score = 40  # Lower initial score as it's a fallback
            providers.append(brain_provider)
        
        if not providers:
            logger.error("No search providers were successfully initialized!")
            raise RuntimeError("Failed to initialize any search providers")
            
        logger.info(f"Initialized {len(providers)} search providers in priority order")
        return providers

    def execute_search(self, search_terms: List[str]) -> Tuple[List[Dict[str, str]], List[str]]:
        """
        Executes the search across providers, managing fallbacks and performance.
        Returns a tuple of (all_results, all_errors).
        """
        all_results = []
        all_errors = []

        for term in search_terms:
            term_results = []
            term_errors = []
            
            # Sort providers by performance score, highest first
            sorted_providers = sorted(self.providers, key=lambda p: p.performance_score, reverse=True)
            
            search_successful = False
            for provider in sorted_providers:
                try:
                    logger.info(f"Attempting search with {provider.name} provider (score: {provider.performance_score})")
                    results = provider.search(term)
                    
                    if results:
                        logger.info(f"Successfully found {len(results)} results for '{term}' using {provider.name}")
                        term_results.extend(results)
                        provider.update_performance(success=True)
                        search_successful = True
                        break  # Move to the next search term
                    else:
                        logger.warning(f"{provider.name} found no results for '{term}' - trying next provider")
                        # Only slightly penalize for no results
                        provider.performance_score = max(0, provider.performance_score - 5)
                        time.sleep(1) # Add a small delay to avoid overwhelming services
                except Exception as e:
                    error_msg = f"{provider.name} search failed for '{term}': {e}"
                    logger.error(error_msg)
                    term_errors.append(error_msg)
                    provider.update_performance(success=False)
            
            if not search_successful:
                logger.error(f"All providers failed for search term: {term}")
                # Try brain search as a last resort if it's not already tried
                brain_provider = next((p for p in self.providers if isinstance(p, BrainSearchProvider)), None)
                if brain_provider:
                    try:
                        logger.info("Attempting final fallback to BrainSearchProvider")
                        results = brain_provider.search(term)
                        if results:
                            logger.info(f"Successfully found {len(results)} results for '{term}' using BrainSearchProvider fallback")
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

def execute_plugin(inputs: Dict[str, InputValue]) -> List[Dict[str, Any]]:
    """Main plugin execution function."""
    try:
        search_term_input = inputs.get('searchTerm')
        if not search_term_input:
            return [PluginOutput(False, "error", "error", None, "Missing required input: searchTerm").to_dict()]

        search_terms_raw = search_term_input.value
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

def main():
    """Main entry point for the plugin."""
    try:
        input_data = sys.stdin.read().strip()
        # Temporary debug logging
        with open("/tmp/search_plugin_input.log", "a") as f:
            f.write(input_data + "\n")

        if not input_data:
            raise ValueError("No input data provided")

        input_list_of_pairs = json.loads(input_data)
        if not isinstance(input_list_of_pairs, list):
            raise ValueError("Input data should be a JSON array of [key, value] pairs.")

        inputs: Dict[str, InputValue] = {}
        for item in input_list_of_pairs:
            if not (isinstance(item, (list, tuple)) and len(item) == 2):
                raise ValueError(f"Each item in the input array should be a [key, value] pair. Found: {item}")
            key, raw_value = item # Renamed value_dict to raw_value for clarity
            
            # Create InputValue object from the raw_value
            # We assume the type is string for simplicity, or infer if possible
            inferred_value_type = 'string'
            if isinstance(raw_value, bool):
                inferred_value_type = 'boolean'
            elif isinstance(raw_value, (int, float)):
                inferred_value_type = 'number'
            elif isinstance(raw_value, list):
                inferred_value_type = 'array'
            elif isinstance(raw_value, dict):
                # If it's a dict, it could be a complex object or an output reference
                if 'outputName' in raw_value and 'sourceStep' in raw_value:
                    inferred_value_type = 'reference' # Custom type for internal handling
                else:
                    inferred_value_type = 'object'

            inputs[key] = InputValue(
                inputName=key,
                value=raw_value,
                valueType=inferred_value_type,
                args={} # No args provided in the raw input
            )

        outputs = execute_plugin(inputs)
        print(json.dumps(outputs, indent=2))

    except Exception as e:
        logger.exception("Plugin execution failed at main level")
        error_output = PluginOutput(False, "error", "error", None, f"Plugin execution failed: {e}")
        print(json.dumps([error_output.to_dict()], indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
