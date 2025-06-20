import axios from 'axios';
import { createAuthenticatedAxios } from '../http/createAuthenticatedAxios';

/**
 * Service Discovery client for Consul
 */
export class ServiceDiscovery {
  private consulUrl: string;
  private serviceCache: Map<string, { url: string, timestamp: number }> = new Map();
  private cacheTTL: number = 60000; // 1 minute cache TTL
  private registeredServices: Set<string> = new Set();
  private authenticatedApi: any;
  private securityManagerUrl: string;

  constructor(consulUrl: string = process.env.CONSUL_URL || 'consul:8500') {
    this.consulUrl = consulUrl;
    this.securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';

    // Create authenticated API client
    this.authenticatedApi = createAuthenticatedAxios(
      'ServiceDiscovery',
      this.securityManagerUrl,
      process.env.CLIENT_SECRET || 'stage7AuthSecret'
    );
  }

  /**
   * Register a service with Consul
   * @param serviceId Unique identifier for the service
   * @param serviceName Name of the service (used for service type)
   * @param serviceUrl URL where the service can be reached
   * @param tags Optional tags for the service
   * @param port Port the service is running on
   * @returns Promise that resolves when registration is complete
   */
  async registerService(
    serviceId: string,
    serviceName: string,
    serviceUrl: string,
    tags: string[] = [],
    port: number = 80
  ): Promise<void> {
    try {
      // Extract host from URL
      const url = new URL(serviceUrl.startsWith('http') ? serviceUrl : `http://${serviceUrl}`);
      const host = url.hostname;
      const actualPort = url.port ? parseInt(url.port) : port;

      // Register the service with Consul
      await this.authenticatedApi.put(`http://${this.consulUrl}/v1/agent/service/register`, {
        ID: serviceId,
        Name: serviceName,
        Tags: tags,
        Address: host,
        Port: actualPort,
        Check: {
          HTTP: `http://${serviceUrl}/health`,
          Interval: '15s',
          Timeout: '5s'
        }
      });

      // Track registered service locally
      this.registeredServices.add(serviceId);
      console.log(`Service ${serviceId} registered with Consul`);
    } catch (error) {
      console.error(`Failed to register service ${serviceId} with Consul`);
      // Continue without service discovery - will fall back to environment variables
    }
  }

  /**
   * Deregister a service from Consul
   * @param serviceId Unique identifier for the service
   * @returns Promise that resolves when deregistration is complete
   */
  async deregisterService(serviceId: string): Promise<void> {
    try {
      await this.authenticatedApi.put(`http://${this.consulUrl}/v1/agent/service/deregister/${serviceId}`);
      // Remove from local tracking
      this.registeredServices.delete(serviceId);
      console.log(`Service ${serviceId} deregistered from Consul`);
    } catch (error) {
      console.error('Failed to deregister service from Consul:', error);
    }
  }

  /**
   * Check if a service is registered
   * @param serviceId Unique identifier for the service
   * @returns true if the service is registered, false otherwise
   */
  isRegistered(serviceId: string): boolean {
    return this.registeredServices.has(serviceId);
  }

  /**
   * Discover a service by name
   * @param serviceName Name of the service to discover
   * @param tag Optional tag to filter services
   * @returns Promise that resolves with the service URL
   */
  async discoverService(serviceName: string, tag?: string): Promise<string | null> {
    // Check cache first
    const cacheKey = `${serviceName}${tag ? `:${tag}` : ''}`;
    const cachedService = this.serviceCache.get(cacheKey);

    if (cachedService && (Date.now() - cachedService.timestamp) < this.cacheTTL) {
      return cachedService.url;
    }

    // Special case for PostOffice - return the environment variable or default
    if (serviceName === 'PostOffice') {
      const postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020';
      console.log(`Using hardcoded PostOffice URL: ${postOfficeUrl}`);

      // Update cache
      this.serviceCache.set(cacheKey, {
        url: postOfficeUrl,
        timestamp: Date.now()
      });

      return postOfficeUrl;
    }

    try {
      // Query Consul for healthy service instances
      const response = await this.authenticatedApi.get(
        `http://${this.consulUrl}/v1/health/service/${serviceName}?passing=true${tag ? `&tag=${tag}` : ''}`
      );

      if (response.data && response.data.length > 0) {
        // Get a random healthy instance
        const instance = response.data[Math.floor(Math.random() * response.data.length)];
        const serviceUrl = `${instance.Service.Address}:${instance.Service.Port}`;

        // Update cache
        this.serviceCache.set(cacheKey, {
          url: serviceUrl,
          timestamp: Date.now()
        });

        return serviceUrl;
      }

      return null;
    } catch (error) {
      console.error(`Failed to discover service ${serviceName}:`, error);
      return null;
    }
  }

  /**
   * Get all instances of a service
   * @param serviceName Name of the service to discover
   * @param tag Optional tag to filter services
   * @returns Promise that resolves with an array of service URLs
   */
  async getAllServiceInstances(serviceName: string, tag?: string): Promise<string[]> {
    try {
      // Query Consul for healthy service instances
      const response = await this.authenticatedApi.get(
        `http://${this.consulUrl}/v1/health/service/${serviceName}?passing=true${tag ? `&tag=${tag}` : ''}`
      );

      if (response.data && response.data.length > 0) {
        return response.data.map((instance: any) =>
          `${instance.Service.Address}:${instance.Service.Port}`
        );
      }

      return [];
    } catch (error) {
      console.error(`Failed to discover service instances for ${serviceName}:`, error);
      return [];
    }
  }

  /**
   * Clear the service cache
   */
  clearCache(): void {
    this.serviceCache.clear();
  }
}
