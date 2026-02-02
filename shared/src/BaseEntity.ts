import { BaseService } from './BaseService';

// Export middleware for easy access
export { createAuthMiddleware, requireRoles, requirePermissions } from './middleware/authMiddleware';

// Export authenticated axios creator for easy access
export { createAuthenticatedAxios, createClientAuthenticatedAxios } from './http/createAuthenticatedAxios';

// Forward declaration to avoid circular dependency
type AuthenticatedApiClientType = any; // Will be properly typed when used

export class BaseEntity extends BaseService {
  authenticatedApi: AuthenticatedApiClientType;

  constructor(id: string, componentType: string, urlBase: string, port: string, skipPostOfficeRegistration: boolean = false, skipServiceDiscovery: boolean = false) {
    super(id, componentType, urlBase, port, skipPostOfficeRegistration, skipServiceDiscovery);
    // Dynamically import to avoid circular dependency
    const { AuthenticatedApiClient } = require('./AuthenticatedApiClient');
    this.authenticatedApi = new AuthenticatedApiClient(this);
  }

    override async sendMessage(type: string, recipient: string, content: any, requiresSync: boolean = false, visibility: 'user' | 'developer' = 'developer'): Promise<any> {

      console.log(`${this.componentType} ${this.id} sending authenticated message of type ${type} to ${recipient}`);

      const message = {
        type: type,
        content,
        sender: this.id,
        recipient,
        requiresSync,
        timestamp: new Date().toISOString(),
        visibility,
      };

      try {
        // Use authenticated API for HTTP communication
        // this.postOfficeUrl is inherited from BaseService
        const postOfficeUrl = this.postOfficeUrl; 
        const response = await this.authenticatedApi.post(`${postOfficeUrl}/message`, message);
        console.log(`Successfully sent authenticated message to ${recipient} via HTTP. Response status: ${response.status}`);
        return response.data;
      } catch (directError) {
        console.error(`Failed to send authenticated message via HTTP:`, directError instanceof Error ? directError.message : directError);
        throw directError;
      }
    }

  override async getServiceUrl(serviceType: string): Promise<string | null> {
    try {
      // First try environment variables (highest priority for consistency)
      const envVarName = `${serviceType.toUpperCase()}_URL`;
      const envUrl = process.env[envVarName];
      if (envUrl) {
        console.log(`Service ${serviceType} found via environment variable ${envVarName}: ${envUrl}`);
        return this.normalizeUrl(envUrl); // Use normalizeUrl from BaseService
      }

      // Next try to discover the service using service discovery
      if (this.serviceDiscovery) {
        try {
          const discoveredUrl = await this.serviceDiscovery.discoverService(serviceType);
          if (discoveredUrl) {
            console.log(`Service ${serviceType} discovered via service discovery: ${discoveredUrl}`);
            return this.normalizeUrl(discoveredUrl);
          }
        } catch (error) {
          console.error(`Error discovering service ${serviceType} via service discovery:`, error);
          // Continue with fallback methods
        }
      }

      // Then try to get the URL from PostOffice using authenticated API
      try {
        const response = await this.authenticatedApi.get(`${this.postOfficeUrl}/getServices`);
        const services = response.data;

        // Convert service type to camelCase for property lookup
        const serviceTypeLower = serviceType.charAt(0).toLowerCase() + serviceType.slice(1);
        const urlPropertyName = `${serviceTypeLower}Url`;

        if (services && services[urlPropertyName]) {
          console.log(`Service ${serviceType} found via PostOffice: ${services[urlPropertyName]}`);
          return this.normalizeUrl(services[urlPropertyName]);
        }
      } catch (error) {
        console.error(`Error getting service ${serviceType} URL from PostOffice (authenticated call):`, error);
        // Continue with fallback methods
      }

      // If all else fails, use default Docker service name and port
      const defaultPort = this.getDefaultPortForService(serviceType);
      const defaultUrl = `${serviceType.toLowerCase()}:${defaultPort}`;
      console.log(`Using default URL for service ${serviceType}: ${defaultUrl}`);
      return this.normalizeUrl(defaultUrl);
    } catch (error) {
      console.error(`Error getting URL for service ${serviceType}:`, error);
      return null;
    }
  }

  override async getServiceUrls(): Promise<{
    capabilitiesManagerUrl: string,
    brainUrl: string,
    librarianUrl: string,
    missionControlUrl: string,
    engineerUrl: string
  }> {
    const [capabilitiesManagerUrl, brainUrl, librarianUrl, missionControlUrl, engineerUrl] = await Promise.all([
      this.getServiceUrl('CapabilitiesManager').then(url => this.normalizeUrl(url || 'capabilitiesmanager:5060') || ''),
      this.getServiceUrl('Brain').then(url => this.normalizeUrl(url || 'brain:5070') || ''),
      this.getServiceUrl('Librarian').then(url => this.normalizeUrl(url || 'librarian:5040') || ''),
      this.getServiceUrl('MissionControl').then(url => this.normalizeUrl(url || 'missioncontrol:5030') || ''),
      this.getServiceUrl('Engineer').then(url => this.normalizeUrl(url || 'engineer:5050') || '')
    ]);

    return {
      capabilitiesManagerUrl,
      brainUrl,
      librarianUrl,
      missionControlUrl,
      engineerUrl
    };
  }
}