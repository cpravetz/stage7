/**
 * Service Token Manager
 *
 * Manages authentication tokens for service-to-service communication
 */

import axios from 'axios';

export class ServiceTokenManager {
  private token: string = '';
  private tokenExpiry: number = 0;
  private authUrl: string;
  private serviceId: string;
  private serviceSecret: string;

  /**
   * Create a new ServiceTokenManager
   * @param authUrl URL of the authentication service
   * @param serviceId ID of this service
   * @param serviceSecret Secret for this service
   */
  constructor(authUrl: string, serviceId: string, serviceSecret: string) {
    this.authUrl = authUrl;
    this.serviceId = serviceId;
    this.serviceSecret = serviceSecret;
  }

  /**
   * Get a valid token, refreshing if necessary
   * @returns Promise resolving to a valid token
   */
  async getToken(): Promise<string> {
    const now = Date.now();

    // If we have a valid token, return it
    if (this.token !== '' && this.tokenExpiry > now + 5000) {
      return this.token;
    }

    // Otherwise, get a new token
    try {
      console.log(`Authenticating ${this.serviceId} with security manager at ${this.authUrl}`);

      const response = await axios.post(this.authUrl + '/auth/service', {
        componentType: this.serviceId,
        clientSecret: this.serviceSecret
      });

      if (response.data.authenticated && response.data.token) {
        this.token = response.data.token;
        // Add buffer before expiry (token valid for 1h, we'll refresh after 50 min)
        this.tokenExpiry = now + (50 * 60 * 1000);
        console.log(`Successfully authenticated ${this.serviceId}, token received`);
        return this.token;
      } else {
        console.error(`Authentication response did not contain expected data: ${JSON.stringify(response.data)}`);
        throw new Error('Failed to authenticate service: Invalid response format');
      }
    } catch (error: any) {
      // Provide more detailed error information
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error(`Authentication error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
          console.error(`Request URL: ${error.config?.url}`);
        } else if (error.request) {
          console.error(`No response from security manager: ${error.message}`);
        } else {
          console.error(`Error setting up authentication request: ${error.message}`);
        }
      } else {
        console.error('Failed to get auth token:', error);
      }

      // In development mode, return a fake token to allow the system to function
      if (process.env.NODE_ENV === 'development') {
        console.warn('DEVELOPMENT MODE: Using fake token due to authentication failure');
        this.token = 'fake-dev-token-' + this.serviceId;
        this.tokenExpiry = now + (50 * 60 * 1000);
        return this.token;
      }

      throw new Error(`Authentication service unavailable: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get authorization header with token
   * @returns Promise resolving to authorization header
   */
  async getAuthHeader(): Promise<{ Authorization: string }> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Clear the token, forcing a refresh on next use
   */
  clearToken(): void {
    this.token = '';
    this.tokenExpiry = 0;
  }
}
