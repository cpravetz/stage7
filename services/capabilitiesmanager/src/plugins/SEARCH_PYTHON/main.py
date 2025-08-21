#!/usr/bin/env python3
"""
SEARCH Plugin for Stage7 (Python Version)

This plugin searches various providers for a given term and returns a list of links.
"""

import sys
import json
import os
import requests
from typing import Dict, List, Any, Optional, Tuple
import logging
import random
import re

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
        # This provider is a fallback that uses an LLM, which can hallucinate results.
        # Instead of returning potentially fake data, we will raise an exception
        # to indicate that all primary, real search providers have failed.
        logger.error("All primary search providers failed. BrainSearchProvider will not be used to prevent fake results.")
        raise Exception("All primary search providers failed. Aborting to prevent fake results.")

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
                
            logger.warning("Brain auth token not found in expected locations")
            raise Exception("No valid authentication token found for Brain service")
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

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        """Execute semantic search using LangSearch API."""
        try:
            url = f"{self.base_url}/v1/web-search"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            # Updated search parameters to match actual API
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
            
            # Extract the 'data' field from the top-level response
            full_response = response.json()
            if "data" in full_response:
                data = full_response["data"]
            else:
                # If 'data' key is not present, assume the response itself is the data
                data = full_response

            # Handle different response structures
            results = []
            
            # Check for Bing-like response structure
            if "webPages" in data and "value" in data["webPages"]:
                for item in data["webPages"]["value"]:
                    result = {
                        "title": item.get("name", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("snippet", "")
                    }
                    if result["title"] and result["url"]:
                        results.append(result)
            
            # Check for direct results array
            elif "results" in data and isinstance(data["results"], list):
                for item in data["results"]:
                    result = {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("snippet", "")
                    }
                    if result["title"] and result["url"]:
                        results.append(result)
            
            # Check for items array
            elif "items" in data and isinstance(data["items"], list):
                for item in data["items"]:
                    result = {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("snippet", "")
                    }
                    if result["title"] and result["url"]:
                        results.append(result)
            
            # Handle case where data is directly the results
            elif isinstance(data, list):
                for item in data:
                    result = {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("snippet", "")
                    }
                    if result["title"] and result["url"]:
                        results.append(result)
            
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
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
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
        super().__init__("SearxNG", performance_score=60)  # Lower initial score due to potential rate limiting
        self.base_urls = [
            'https://searx.space/search',
            'https://searx.prvcy.eu/search',
            'https://searx.be/search',
            'https://search.bus-hit.me/search',
            'https://searx.work/search',
            'https://searx.xyz/search',
            'https://search.projectsegfau.lt/search',
            'https://searx.mx/search'
        ]
        self.current_url_index = 0

    def search(self, search_term: str, **kwargs) -> List[Dict[str, str]]:
        errors = []
        for _ in range(len(self.base_urls)):
            searxng_url = f"{self.base_urls[self.current_url_index]}/search"
            try:
                params = {
                    'q': search_term,
                    'format': 'json',
                    'categories': 'general',
                    'language': 'en',
                    'engines': 'google,bing,brave,duckduckgo',  # Specify preferred engines
                    'timeout': 5.0  # Shorter timeout to fail faster
                }
                
                response = requests.get(
                    searxng_url,
                    params=params,
                    timeout=8,
                    headers={'User-Agent': 'Mozilla/5.0 Stage7SearchBot/1.0'}
                )
                response.raise_for_status()
                data = response.json()
                
                if 'error' in data:
                    raise Exception(f"SearxNG API error: {data['error']}")
                
                results = []
                for r in data.get('results', []):
                    if r.get('title') and r.get('url'):
                        results.append({
                            'title': r['title'],
                            'url': r['url'],
                            'snippet': r.get('content', '')
                        })
                
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
        google_api_key = os.getenv('GOOGLE_SEARCH_API_KEY')
        google_cse_id = os.getenv('GOOGLE_CSE_ID')
        if google_api_key and google_cse_id:
            logger.info("Initializing Google Custom Search")
            providers.append(GoogleSearchProvider(api_key=google_api_key, cse_id=google_cse_id))
        
        # 3. SearxNG as second fallback
        # logger.info("Initializing SearxNG search provider")
        # providers.append(SearxNGSearchProvider()) # Disabled due to consistent failures
        
        # 4. DuckDuckGo as third fallback
        logger.info("Initializing DuckDuckGo search provider")
        providers.append(DuckDuckGoSearchProvider())

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

            for provider in sorted_providers:
                try:
                    logger.info(f"Attempting search with {provider.name} provider (score: {provider.performance_score})")
                    results = provider.search(term)
                    
                    if results:
                        logger.info(f"Successfully found {len(results)} results for '{term}' using {provider.name}")
                        term_results.extend(results)
                        provider.update_performance(success=True)
                        break  # Move to the next search term
                    else:
                        logger.warning(f"{provider.name} found no results for '{term}' - trying next provider")
                        # Only slightly penalize for no results
                        provider.performance_score = max(0, provider.performance_score - 5)
                except Exception as e:
                    error_msg = f"{provider.name} search failed for '{term}': {e}"
                    logger.error(error_msg)
                    term_errors.append(error_msg)
                    provider.update_performance(success=False)
            
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
            key, value_dict = item
            if isinstance(value_dict, dict) and 'value' in value_dict:
                inputs[key] = InputValue(
                    inputName=key,
                    value=value_dict['value'],
                    valueType=value_dict.get('valueType', 'string'),
                    args=value_dict.get('args', {})
                )
            else: # Fallback for non-standard value formats
                inputs[key] = InputValue(inputName=key, value=value_dict, valueType='string')

        outputs = execute_plugin(inputs)
        print(json.dumps(outputs, indent=2))

    except Exception as e:
        logger.exception("Plugin execution failed at main level")
        error_output = PluginOutput(False, "error", "error", None, f"Plugin execution failed: {e}")
        print(json.dumps([error_output.to_dict()], indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
