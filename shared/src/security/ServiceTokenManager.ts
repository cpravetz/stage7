/**
 * Service Token Manager
 *
 * Manages authentication tokens for service-to-service communication
 */

import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

export class ServiceTokenManager {
  private token: string = '';
  private tokenExpiry: number = 0;
  private authUrl: string;
  private serviceId: string;
  private serviceSecret: string;
  private publicKey: string = '';

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

    // Fetch the public key when the token manager is created
    this.fetchPublicKey().catch(error => {
      console.warn(`Failed to fetch public key: ${error.message}. Will retry later.`);
    });
  }

  /**
   * Fetch the public key from the security manager
   */
  private async fetchPublicKey(): Promise<void> {
    try {
      // First try to load from file system
      try {
        const publicKeyPath = path.join(__dirname, '../../keys/public.key');
        if (fs.existsSync(publicKeyPath)) {
          this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
          console.log(`Public key loaded from file for ${this.serviceId}`);
          return;
        }
      } catch (fsError: any) {
        console.warn(`Could not load public key from file: ${fsError.message}`);
      }

      // If file system fails, fetch from security manager
      const response = await axios.get(`${this.authUrl}/public-key`);
      this.publicKey = response.data;

      // Save the public key to file for future use
      try {
        const keysDir = path.join(__dirname, '../../keys');
        if (!fs.existsSync(keysDir)) {
          fs.mkdirSync(keysDir, { recursive: true });
        }
        fs.writeFileSync(path.join(keysDir, 'public.key'), this.publicKey);
      } catch (fsError: any) {
        console.warn(`Could not save public key to file: ${fsError.message}`);
      }

      console.log(`Public key fetched successfully for ${this.serviceId}`);
    } catch (error: any) {
      console.error(`Failed to fetch public key: ${error.message}`);
      throw error;
    }
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

    // Make sure we have the public key
    if (!this.publicKey) {
      await this.fetchPublicKey();
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

      // Try to authenticate with retry logic
      console.warn(`Authentication failed, retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        const retryResponse = await axios.post(this.authUrl + '/auth/service', {
          componentType: this.serviceId,
          clientSecret: this.serviceSecret
        });

        if (retryResponse.data.authenticated && retryResponse.data.token) {
          this.token = retryResponse.data.token;
          this.tokenExpiry = now + (50 * 60 * 1000);
          console.log(`Successfully authenticated ${this.serviceId} on retry`);
          return this.token;
        }
      } catch (retryError: any) {
        console.error(`Retry authentication failed: ${retryError.message || 'Unknown error'}`);
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

  /**
   * Verify a token locally using the public key
   * @param token JWT token to verify
   * @returns Decoded token payload or null if invalid
   */
  async verifyToken(token: string): Promise<any | null> {
    try {
      // Make sure we have the public key
      if (!this.publicKey) {
        await this.fetchPublicKey();
      }

      // Verify the token
      return jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }
}
