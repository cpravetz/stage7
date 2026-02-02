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
    this.consulUrl = consulUrl.startsWith('http://') || consulUrl.startsWith('https://') ? consulUrl : `http://${consulUrl}`;
    this.securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';

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
   * @param serviceType Type of the service
   * @param serviceUrl URL where the service can be reached
   * @param tags Optional tags for the service
   * @param port Port the service is running on
   * @returns Promise that resolves when registration is complete
   */
  async registerService(
    serviceId: string,
    serviceType: string,
    serviceUrl: string,
    tags: string[] = [],
    port: number = 80
  ): Promise<void> {
    try {
      console.log(`[REGISTER_START] Attempting to register service ${serviceId} (${serviceType}) at ${serviceUrl}`);
      
      // Extract host from URL
      const url = new URL(serviceUrl.startsWith('http') ? serviceUrl : `http://${serviceUrl}`);
      const host = url.hostname;
      const actualPort = url.port ? parseInt(url.port) : port;

      console.log(`[REGISTER_DETAILS] Service ID: ${serviceId}, Type: ${serviceType}, Host: ${host}, Port: ${actualPort}`);
      console.log(`[REGISTER_HEALTH_CHECK] Health check URL: ${serviceUrl}/health`);

      // Register the service with Consul with improved health check settings
      await this.authenticatedApi.put(`${this.consulUrl}/v1/agent/service/register`, {
        ID: serviceId,
        Name: serviceId, // Set Name to serviceId to match discoverService queries
        Tags: [...tags, serviceType], // Add serviceType to tags for categorization
        Address: host,
        Port: actualPort,
        Check: {
          HTTP: `${serviceUrl}/health`,
          Interval: '45s',  // Increased interval
          Timeout: '15s',  // Increased timeout
          DeregisterCriticalServiceAfter: '5m'
        }
      });

      // Track registered service locally
      this.registeredServices.add(serviceId);
      console.log(`[REGISTER_SUCCESS] Service ${serviceId} registered with Consul`);
    } catch (error) {
      console.error(`[REGISTER_ERROR] Failed to register service ${serviceId} with Consul:`, error instanceof Error ? error.message : error);
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
      await this.authenticatedApi.put(`${this.consulUrl}/v1/agent/service/deregister/${serviceId}`);
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
   * Discover a service by name with retry logic
   * @param serviceType Name of the service to discover
   * @param tag Optional tag to filter services
   * @param maxRetries Maximum number of retry attempts
   * @param retryDelay Delay between retries in milliseconds
   * @returns Promise that resolves with the service URL
   */
  async discoverService(
    serviceId: string, 
    tag?: string,
    maxRetries: number = 3,
    retryDelay: number = 2000
  ): Promise<string | null> {
    // Check cache first
    const cacheKey = `${serviceId}${tag ? `:${tag}` : ''}`;
    const cachedService = this.serviceCache.get(cacheKey);

    if (cachedService && (Date.now() - cachedService.timestamp) < this.cacheTTL) {
      console.log(`[CACHE] Returning cached URL for ${serviceId}: ${cachedService.url}`);
      return cachedService.url;
    }

    // Special case for PostOffice - return the environment variable or default
    if (serviceId === 'PostOffice') {
      const postOfficeUrl = process.env.POSTOFFICE_URL || 'http://postoffice:5020';
      console.log(`[HARDCODED] Using hardcoded PostOffice URL: ${postOfficeUrl}`);

      // Update cache
      this.serviceCache.set(cacheKey, {
        url: postOfficeUrl,
        timestamp: Date.now()
      });

      return postOfficeUrl;
    }

    // Implement retry logic for service discovery
    let attempt = 0;
    let lastError: any = null;

    while (attempt < maxRetries) {
      attempt++;
      
      try {
        console.log(`[CONSUL_QUERY] Querying Consul for healthy instances of ${serviceId} (attempt ${attempt}/${maxRetries})...`);
        console.log(`[CONSUL_QUERY_URL] Full URL: ${this.consulUrl}/v1/health/service/${serviceId}?passing=true${tag ? `&tag=${tag}` : ''}`);
        
        // Query Consul for healthy service instances
        const response = await this.authenticatedApi.get(
          `${this.consulUrl}/v1/health/service/${serviceId}?passing=true${tag ? `&tag=${tag}` : ''}`
        );

        console.log(`[CONSUL_RESPONSE] Received response for ${serviceId}`);
        console.log(`[CONSUL_RESPONSE_DATA] Full response data:`, JSON.stringify(response.data, null, 2));
        
        // Log the status code and headers for debugging
        console.log(`[CONSUL_RESPONSE_STATUS] Status code: ${response.status}`);
        console.log(`[CONSUL_RESPONSE_HEADERS] Headers:`, JSON.stringify(response.headers, null, 2));

        if (response.data && response.data.length > 0) {
          // Get a random healthy instance
          const instance = response.data[Math.floor(Math.random() * response.data.length)];
          const serviceUrl = `http://${instance.Service.Address}:${instance.Service.Port}`;

          console.log(`[SERVICE_FOUND] Found healthy instance of ${serviceId} at ${serviceUrl}`);
          
          // Update cache
          this.serviceCache.set(cacheKey, {
            url: serviceUrl,
            timestamp: Date.now()
          });

          return serviceUrl;
        } else {
          console.warn(`[NO_HEALTHY_INSTANCES] No healthy instances found for ${serviceId} (attempt ${attempt}/${maxRetries})`);
          
          // If this is not the last attempt, wait and retry
          if (attempt < maxRetries) {
            console.log(`[RETRY_WAIT] Waiting ${retryDelay}ms before retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }

        lastError = new Error('No healthy instances available');
      } catch (error) {
        console.error(`[CONSUL_ERROR] Failed to discover service ${serviceId} (attempt ${attempt}/${maxRetries}):`, 
          error instanceof Error ? error.message : error);
        
        lastError = error;
        
        // If this is not the last attempt, wait and retry
        if (attempt < maxRetries) {
          console.log(`[RETRY_WAIT] Waiting ${retryDelay}ms before retrying...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    console.error(`[DISCOVERY_FAILED] Failed to discover service ${serviceId} after ${maxRetries} attempts`);
    return null;
  }

  /**
   * Get all instances of a service
   * @param serviceType Name of the service to discover
   * @param tag Optional tag to filter services
   * @returns Promise that resolves with an array of service URLs
   */
  async getAllServiceInstances(serviceType: string, tag?: string): Promise<string[]> {
    try {
      // Query Consul for services with the given serviceType as a tag
      const servicesResponse = await this.authenticatedApi.get(
        `${this.consulUrl}/v1/catalog/services?tag=${serviceType}`
      );
      const services = servicesResponse.data;
      const serviceNames = Object.keys(services);

      if (serviceNames.length === 0) {
        return [];
      }

      // Fetch all instances for the found services in parallel
      const instancePromises = serviceNames.map((serviceName) => {
        const tagFilter = tag ? `&tag=${tag}` : '';
        return this.authenticatedApi.get(
          `${this.consulUrl}/v1/health/service/${serviceName}?passing=true${tagFilter}`
        );
      });

      const responses = await Promise.all(instancePromises);

      // Flatten the array of arrays of instances
      const allInstances = responses.flatMap((response) =>
        response.data.map(
          (instance: any) =>
            `http://${instance.Service.Address}:${instance.Service.Port}`
        )
      );

      return allInstances;
    } catch (error) {
      console.error(
        `Failed to discover service instances for ${serviceType}:`,
        error
      );
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
