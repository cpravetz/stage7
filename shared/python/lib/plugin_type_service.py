#!/usr/bin/env python3
"""
Plugin Type Service for API-based plugin information retrieval.
Phase 1 implementation: Lightweight API calls for plugin type information.
"""

import json
import logging
import requests
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


class PluginTypeService:
    """Service for fetching plugin type information via API calls."""
    
    def __init__(self, capabilities_manager_url: str, auth_token: Optional[str] = None):
        """
        Initialize the plugin type service.
        
        Args:
            capabilities_manager_url: Base URL for the CapabilitiesManager service
            auth_token: Optional authentication token
        """
        self.base_url = capabilities_manager_url.rstrip('/')
        self.auth_token = auth_token
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.session = requests.Session()
        
        if auth_token:
            self.session.headers.update({'Authorization': f'Bearer {auth_token}'})
    
    def get_plugin_type_info(self, action_verb: str) -> Optional[Dict[str, Any]]:
        """
        Get type information for a single plugin.
        
        Args:
            action_verb: The action verb to get type info for
            
        Returns:
            Dictionary with inputDefinitions, outputDefinitions, etc. or None if not found
        """
        action_verb = action_verb.upper()

        # Check cache first
        if action_verb in self.cache:
            logger.debug(f"Cache hit for plugin type info: {action_verb}")
            return self.cache[action_verb]

        # Handle internal verbs - don't make API calls for these
        internal_verbs = ['THINK', 'GENERATE', 'IF_THEN', 'WHILE', 'UNTIL', 'SEQUENCE', 'TIMEOUT', 'REPEAT', 'FOREACH', 'CHAT']
        if action_verb in internal_verbs:
            logger.debug(f"Skipping API call for internal verb: {action_verb}")
            # Cache negative result to avoid repeated checks
            self.cache[action_verb] = None
            return None

        try:
            url = urljoin(self.base_url, f'/plugins/types/{action_verb}')
            logger.debug(f"Fetching plugin type info from: {url}")
            
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 404:
                logger.warning(f"Plugin not found for actionVerb: {action_verb}")
                return None
            
            response.raise_for_status()
            type_info = response.json()
            
            # Cache the result
            self.cache[action_verb] = type_info
            logger.debug(f"Cached plugin type info for: {action_verb}")
            
            return type_info
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch plugin type info for {action_verb}: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response for plugin type info {action_verb}: {e}")
            return None
    
    def get_batch_plugin_type_info(self, action_verbs: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get type information for multiple plugins in a single API call.
        
        Args:
            action_verbs: List of action verbs to get type info for
            
        Returns:
            Dictionary mapping action verbs to their type information
        """
        action_verbs = [verb.upper() for verb in action_verbs]
        result = {}
        uncached_verbs = []
        
        # Check cache first
        for verb in action_verbs:
            if verb in self.cache:
                result[verb] = self.cache[verb]
                logger.debug(f"Cache hit for plugin type info: {verb}")
            else:
                uncached_verbs.append(verb)
        
        # Fetch uncached verbs
        if uncached_verbs:
            try:
                url = urljoin(self.base_url, '/plugins/types/batch')
                logger.debug(f"Fetching batch plugin type info from: {url} for {len(uncached_verbs)} verbs")
                
                response = self.session.post(
                    url,
                    json={'actionVerbs': uncached_verbs},
                    timeout=30
                )
                response.raise_for_status()
                
                batch_result = response.json()
                type_infos = batch_result.get('typeInfos', [])
                
                # Cache and add to result
                for type_info in type_infos:
                    verb = type_info['actionVerb']
                    self.cache[verb] = type_info
                    result[verb] = type_info
                    logger.debug(f"Cached plugin type info for: {verb}")
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Failed to fetch batch plugin type info: {e}")
                # Fall back to individual requests for uncached verbs
                for verb in uncached_verbs:
                    individual_result = self.get_plugin_type_info(verb)
                    if individual_result:
                        result[verb] = individual_result
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON response for batch plugin type info: {e}")
        
        return result
    
    def get_input_output_types(self, action_verb: str) -> Tuple[List[Dict], List[Dict]]:
        """
        Get only input and output definitions for a plugin.
        
        Args:
            action_verb: The action verb to get definitions for
            
        Returns:
            Tuple of (input_definitions, output_definitions)
        """
        type_info = self.get_plugin_type_info(action_verb)
        if not type_info:
            return [], []
        
        input_definitions = type_info.get('inputDefinitions', [])
        output_definitions = type_info.get('outputDefinitions', [])
        
        return input_definitions, output_definitions
    
    def clear_cache(self):
        """Clear the plugin type information cache."""
        self.cache.clear()
        logger.debug("Plugin type cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring."""
        return {
            'cached_plugins': len(self.cache),
            'cached_verbs': list(self.cache.keys())
        }


def create_plugin_type_service(inputs: Dict[str, Any]) -> Optional[PluginTypeService]:
    """
    Create a PluginTypeService instance from plan validator inputs.
    
    Args:
        inputs: Dictionary containing service URLs and auth tokens
        
    Returns:
        PluginTypeService instance or None if required inputs are missing
    """
    # Extract CapabilitiesManager URL
    cm_url_input = inputs.get('capabilitiesmanager_url') or inputs.get('missioncontrol_url')
    if not cm_url_input:
        logger.error("No CapabilitiesManager URL found in inputs")
        return None
    
    if isinstance(cm_url_input, dict):
        cm_url = cm_url_input.get('value')
    else:
        cm_url = cm_url_input
    
    if not cm_url:
        logger.error("CapabilitiesManager URL value is empty")
        return None
    
    # Extract auth token
    auth_token = None
    auth_input = inputs.get('__auth_token')
    if auth_input:
        if isinstance(auth_input, dict):
            auth_token = auth_input.get('value')
        else:
            auth_token = auth_input
    
    # Construct full URL
    if not cm_url.startswith('http'):
        cm_url = f'http://{cm_url}'
    
    logger.info(f"Creating PluginTypeService with URL: {cm_url}")
    return PluginTypeService(cm_url, auth_token)
