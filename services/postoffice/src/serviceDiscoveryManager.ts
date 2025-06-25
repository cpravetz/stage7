import { Component } from './types/Component';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * ServiceDiscoveryManager class handles discovering services via Consul
 * It prioritizes Consul for service discovery and falls back to other methods if needed
 */
export class ServiceDiscoveryManager {
  private components: Map<string, Component>;
  private componentsByType: Map<string, Set<string>>;
  private serviceDiscovery: any;

  constructor(
    components: Map<string, Component>,
    componentsByType: Map<string, Set<string>>,
    serviceDiscovery: any
  ) {
    this.components = components;
    this.componentsByType = componentsByType;
    this.serviceDiscovery = serviceDiscovery;
  }

  /**
   * Discover a service by type
   * @param type Service type to discover
   * @returns Promise that resolves with the service URL or undefined if not found
   */
  async discoverService(type: string): Promise<string | undefined> {
    console.log(`Discovering service: ${type}`);
    
    // First try to discover the service using Consul (primary method)
    if (this.serviceDiscovery) {
      try {
        console.log(`Attempting to discover ${type} via Consul...`);
        const discoveredUrl = await this.serviceDiscovery.discoverService(type);
        
        if (discoveredUrl) {
          console.log(`Service ${type} discovered via Consul: ${discoveredUrl}`);
          return discoveredUrl;
        } else {
          console.log(`Service ${type} not found in Consul`);
        }
      } catch (error) {
        console.error(`Error discovering service ${type} via Consul:`, 
          error instanceof Error ? error.message : 'Unknown error');
        // Continue with fallback methods
      }
    } else {
      console.warn('Service discovery not initialized, falling back to environment variables');
    }
    
    // Fall back to environment variables (secondary method)
    const envVarName = `${type.toUpperCase()}_URL`;
    const envUrl = process.env[envVarName];
    
    if (envUrl) {
      console.log(`Service ${type} found via environment variable ${envVarName}: ${envUrl}`);
      return envUrl;
    }
    
    // The local registry (this.components) is no longer reliably populated by external services.
    // Thus, looking it up here for general service discovery is not effective.
    // It might only contain PostOffice itself or other internally managed components.
    console.warn(`Service ${type} not found via Consul or environment variable. Local registry in PostOffice is not used for this lookup anymore.`);
    return undefined;
  }

  // Removed registerComponent method as services extending BaseEntity now handle their own Consul registration.
  // The local registry in PostOffice (this.components, this.componentsByType) will no longer be populated by this method.

  /**
   * Get a component URL by type from the local PostOffice registry.
   * Note: This registry is no longer populated by external services calling /registerComponent.
   * Its use is limited to components that might be registered internally within PostOffice.
   * For discovering external services, use discoverService.
   * @param type Component type
   * @returns Component URL or undefined if not found in the local registry
   */
  getComponentUrl(type: string): string | undefined {
    const componentGuids = this.componentsByType.get(type);
    if (componentGuids && componentGuids.size > 0) {
      const randomGuid = Array.from(componentGuids)[0];
      const component = this.components.get(randomGuid);
      if (component) {
        console.log(`Service ${type} found in PostOffice local registry: ${component.url}`);
        return component.url;
      }
    }
    console.log(`Service ${type} not found in PostOffice local registry.`);
    return undefined;
  }

  /**
   * Get all services. This method primarily uses getComponentUrl (local PostOffice registry)
   * and falls back to environment variables.
   * Given that the local registry is no longer the primary source for external services,
   * this method's list might be incomplete or rely heavily on environment variables.
   * @returns Object containing service URLs
   */
  getServices(): Record<string, string> {
    // This method's utility is reduced as getComponentUrl now mainly checks local PO registry.
    // For a more robust list of services, direct Consul queries would be needed,
    // or this should be refactored to use `discoverService` for each type.
    const services: Record<string, string | undefined> = {
      capabilitiesManagerUrl: await this.discoverService('CapabilitiesManager'),
      brainUrl: await this.discoverService('Brain'),
      trafficManagerUrl: await this.discoverService('TrafficManager'),
      librarianUrl: await this.discoverService('Librarian'),
      missionControlUrl: await this.discoverService('MissionControl'),
      engineerUrl: await this.discoverService('Engineer')
    };

    const resolvedServices: Record<string, string> = {};
    for (const key in services) {
        if (services[key]) {
            resolvedServices[key] = services[key] as string;
        } else {
            // Fallback to environment variable if discoverService didn't find it
            const envVarKey = `${key.replace('Url', '').toUpperCase()}_URL`;
            const envVarValue = process.env[envVarKey];
            if (envVarValue) {
                resolvedServices[key] = envVarValue;
                console.log(`Service for ${key} taken from env var ${envVarKey} as fallback in getServices.`);
            } else {
                console.warn(`Service URL for ${key} could not be determined in getServices.`);
            }
        }
    }
    
    console.log('Service URLs from PostOffice.getServices():', resolvedServices);
    return resolvedServices;
  }
}
