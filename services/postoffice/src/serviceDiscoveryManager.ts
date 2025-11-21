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
    
    // Fall back to the local registry as a last resort
    const services = Array.from(this.components.entries())
      .filter(([_, service]) => service.type === type)
      .map(([gid, service]) => ({ gid, ...service }));
    
    if (services.length > 0) {
      console.log(`Service ${type} found in local registry: ${services[0].url}`);
      return services[0].url;
    }
    
    console.error(`Service ${type} not found in any registry`);
    return undefined;
  }

  /**
   * Register a component with the PostOffice and Consul
   * @param id Component ID
   * @param type Component type
   * @param url Component URL
   * @returns Promise that resolves when registration is complete
   */
  async registerComponent(id: string, type: string, url: string): Promise<void> {
    try {
      // Register the component in the local registry
      const component: Component = { id, type, url };
      this.components.set(id, component);
      
      if (!this.componentsByType.has(type)) {
        this.componentsByType.set(type, new Set());
      }
      this.componentsByType.get(type)!.add(id);
      
      console.log(`Component registered in local registry: ${id} of type ${type} at ${url}`);
      
      // Also register the component with Consul if available
      if (this.serviceDiscovery) {
        try {
          // Extract host and port from URL
          const urlObj = new URL(url);
          const host = urlObj.hostname;
          const port = parseInt(urlObj.port || '80', 10);
          
          // Register with Consul
          await this.serviceDiscovery.registerService(
            id,
            type,
            host+':'+port.toString(),
            [type.toLowerCase()],
            port
          );
          
          console.log(`Component also registered with Consul: ${id} of type ${type}`);
        } catch (error) {
          console.error(`Failed to register component ${id} with Consul:`, 
            error instanceof Error ? error.message : 'Unknown error');
          // Continue even if Consul registration fails - we still have the local registry
        }
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Failed to register component ${id}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get a component URL by type
   * @param type Component type
   * @returns Component URL or undefined if not found
   */
  getComponentUrl(type: string): string | undefined {
    const componentGuids = this.componentsByType.get(type);
    if (componentGuids && componentGuids.size > 0) {
      const randomGuid = Array.from(componentGuids)[0]; // Get the first registered component of this type
      const component = this.components.get(randomGuid);
      return component?.url;
    }
    return undefined;
  }

  /**
   * Get all services
   * @returns Object containing service URLs
   */
  getServices(): Record<string, string> {
    const services = {
      capabilitiesManagerUrl: this.getComponentUrl('CapabilitiesManager') || process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060',
      brainUrl: this.getComponentUrl('Brain') || process.env.BRAIN_URL || 'brain:5070',
      trafficManagerUrl: this.getComponentUrl('TrafficManager') || process.env.TRAFFICMANAGER_URL || 'trafficmanager:5080',
      librarianUrl: this.getComponentUrl('Librarian') || process.env.LIBRARIAN_URL || 'librarian:5040',
      missionControlUrl: this.getComponentUrl('MissionControl') || process.env.MISSIONCONTROL_URL || 'missioncontrol:5030',
      engineerUrl: this.getComponentUrl('Engineer') || process.env.ENGINEER_URL || 'engineer:5050'
    };
    
    console.log('Service URLs:', services);
    return services;
  }
}
