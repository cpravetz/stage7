import { Component } from './types/Component';
import { analyzeError } from '@cktmcs/shared';

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

  private normalizeUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `http://${url}`;
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
        // Use enhanced discovery with retry logic (5 attempts, 3 second delay between retries)
        const discoveredUrl = await this.serviceDiscovery.discoverService(type, undefined, 5, 3000);
          
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
      return envUrl.startsWith('http://') || envUrl.startsWith('https://') ? envUrl : `http://${envUrl}`;
    }
     
    // Fall back to the local registry as a last resort
    const services = Array.from(this.components.entries())
      .filter(([_, service]) => service.type === type)
      .map(([gid, service]) => ({ gid, ...service }));
     
    if (services.length > 0) {
      console.log(`Service ${type} found in local registry: ${services[0].url}`);
      const normalizedUrl = services[0].url.startsWith('http://') || services[0].url.startsWith('https://') ? services[0].url : `http://${services[0].url}`;
      return normalizedUrl;
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
            id, // Use the unique 'id' as the service name in Consul
            url, // Pass the original fully qualified URL
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
   * Get a component URL by ID
   * @param id Component ID
   * @returns Component URL or undefined if not found
   */
  getComponentUrl(id: string): string | undefined {
    const component = this.components.get(id);
    if (component) {
      return this.normalizeUrl(component.url);
    }
    return undefined;
  }

  /**
   * Get all services
   * @returns Object containing service URLs
   */
  getServices(): Record<string, string> {
    const services = {
      capabilitiesManagerUrl: this.normalizeUrl(this.getComponentUrl('CapabilitiesManager') || process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060') || '',
      brainUrl: this.getComponentUrl('Brain') || process.env.BRAIN_URL || 'brain:5070' || '',
      librarianUrl: this.getComponentUrl('Librarian') || process.env.LIBRARIAN_URL || 'librarian:5040' || '',
      missionControlUrl: this.getComponentUrl('MissionControl') || process.env.MISSIONCONTROL_URL || 'missioncontrol:5030' || '',
      engineerUrl: this.getComponentUrl('Engineer') || process.env.ENGINEER_URL || 'engineer:5050' || '',
      // Add assistant services with environment variable fallback and correct ports
      hotelOpsAssistantUrl: this.getComponentUrl('hotel-ops-assistant') || process.env.HOTEL_OPS_ASSISTANT_URL || 'hotel-ops-assistant-api:3017' || '',
      restaurantOpsAssistantUrl: this.getComponentUrl('restaurant-ops-assistant') || process.env.RESTAURANT_OPS_ASSISTANT_URL || 'restaurant-ops-assistant-api:3016' || '',
      pmAssistantUrl: this.getComponentUrl('pm-assistant') || process.env.PM_ASSISTANT_URL || 'pm-assistant-api:3000' || '',
      salesAssistantUrl: this.getComponentUrl('sales-assistant') || process.env.SALES_ASSISTANT_URL || 'sales-assistant-api:3002' || '',
      marketingAssistantUrl: this.getComponentUrl('marketing-assistant') || process.env.MARKETING_ASSISTANT_URL || 'marketing-assistant-api:3003' || '',
      hrAssistantUrl: this.getComponentUrl('hr-assistant') || process.env.HR_ASSISTANT_URL || 'hr-assistant-api:3004' || '',
      financeAssistantUrl: this.getComponentUrl('finance-assistant') || process.env.FINANCE_ASSISTANT_URL || 'finance-assistant-api:3005' || '',
      supportAssistantUrl: this.getComponentUrl('support-assistant') || process.env.SUPPORT_ASSISTANT_URL || 'support-assistant-api:3006' || '',
      legalAssistantUrl: this.getComponentUrl('legal-assistant') || process.env.LEGAL_ASSISTANT_URL || 'legal-assistant-api:3007' || '',
      healthcareAssistantUrl: this.getComponentUrl('healthcare-assistant') || process.env.HEALTHCARE_ASSISTANT_URL || 'healthcare-assistant-api:3008' || '',
      educationAssistantUrl: this.getComponentUrl('education-assistant') || process.env.EDUCATION_ASSISTANT_URL || 'education-assistant-api:3009' || '',
      eventAssistantUrl: this.getComponentUrl('event-assistant') || process.env.EVENT_ASSISTANT_URL || 'event-assistant-api:3010' || '',
      executiveAssistantUrl: this.getComponentUrl('executive-assistant') || process.env.EXECUTIVE_ASSISTANT_URL || 'executive-assistant-api:3011' || '',
      careerAssistantUrl: this.getComponentUrl('career-assistant') || process.env.CAREER_ASSISTANT_URL || 'career-assistant-api:3012' || '',
      contentCreatorAssistantUrl: this.getComponentUrl('content-creator-assistant') || process.env.CONTENT_CREATOR_ASSISTANT_URL || 'content-creator-assistant-api:3013' || '',
      songwriterAssistantUrl: this.getComponentUrl('songwriter-assistant') || process.env.SONGWRITER_ASSISTANT_URL || 'songwriter-assistant-api:3014' || '',
      scriptwriterAssistantUrl: this.getComponentUrl('scriptwriter-assistant') || process.env.SCRIPTWRITER_ASSISTANT_URL || 'scriptwriter-assistant-api:3015' || ''
    };
    
    console.log('Service URLs:', services);
    return services;
  }
}
