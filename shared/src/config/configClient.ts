import axios from 'axios';
import { ServiceDiscovery } from '../discovery/serviceDiscovery';

/**
 * Client for the configuration service
 */
export class ConfigClient {
  private configServiceUrl: string;
  private serviceDiscovery: ServiceDiscovery | null = null;
  private configCache: Map<string, { value: any, timestamp: number }> = new Map();
  private cacheTTL: number = 60000; // 1 minute cache TTL
  private environment: string;

  constructor(
    configServiceUrl: string = process.env.CONFIG_SERVICE_URL || 'configservice:5090',
    environment: string = process.env.NODE_ENV || 'development'
  ) {
    this.configServiceUrl = configServiceUrl;
    this.environment = environment;
    
    // Initialize service discovery if CONSUL_URL is set
    if (process.env.CONSUL_URL) {
      this.serviceDiscovery = new ServiceDiscovery(process.env.CONSUL_URL);
    }
  }

  /**
   * Get a configuration value
   * @param key Configuration key
   * @param defaultValue Default value if configuration is not found
   * @returns Configuration value or default value
   */
  async get<T>(key: string, defaultValue?: T): Promise<T> {
    // Check cache first
    const cacheKey = `${this.environment}:${key}`;
    const cachedConfig = this.configCache.get(cacheKey);
    
    if (cachedConfig && (Date.now() - cachedConfig.timestamp) < this.cacheTTL) {
      return cachedConfig.value as T;
    }

    try {
      // Try to discover config service via service discovery
      let configServiceUrl = this.configServiceUrl;
      
      if (this.serviceDiscovery) {
        try {
          const discoveredUrl = await this.serviceDiscovery.discoverService('ConfigService');
          if (discoveredUrl) {
            configServiceUrl = discoveredUrl;
          }
        } catch (error) {
          console.error('Failed to discover ConfigService, using default URL:', error);
          // Continue with default URL
        }
      }

      // Get configuration from service
      const response = await axios.get(
        `http://${configServiceUrl}/config/${key}?environment=${this.environment}`
      );

      if (response.status === 200 && response.data) {
        const value = response.data.value;
        
        // Update cache
        this.configCache.set(cacheKey, { 
          value, 
          timestamp: Date.now() 
        });
        
        return value as T;
      }
    } catch (error) {
      console.error(`Failed to get configuration ${key}:`, error);
      // Fall back to default value
    }

    return defaultValue as T;
  }

  /**
   * Set a configuration value
   * @param key Configuration key
   * @param value Configuration value
   * @param description Optional description
   * @returns Promise that resolves when the configuration is set
   */
  async set(key: string, value: any, description?: string): Promise<void> {
    try {
      // Try to discover config service via service discovery
      let configServiceUrl = this.configServiceUrl;
      
      if (this.serviceDiscovery) {
        try {
          const discoveredUrl = await this.serviceDiscovery.discoverService('ConfigService');
          if (discoveredUrl) {
            configServiceUrl = discoveredUrl;
          }
        } catch (error) {
          console.error('Failed to discover ConfigService, using default URL:', error);
          // Continue with default URL
        }
      }

      // Set configuration in service
      await axios.put(
        `http://${configServiceUrl}/config/${key}?environment=${this.environment}`,
        { value, description }
      );

      // Update cache
      const cacheKey = `${this.environment}:${key}`;
      this.configCache.set(cacheKey, { 
        value, 
        timestamp: Date.now() 
      });
    } catch (error) {
      console.error(`Failed to set configuration ${key}:`, error);
      throw error;
    }
  }

  /**
   * Clear the configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Set the environment for configuration
   * @param environment Environment name
   */
  setEnvironment(environment: string): void {
    this.environment = environment;
    this.clearCache();
  }
}
