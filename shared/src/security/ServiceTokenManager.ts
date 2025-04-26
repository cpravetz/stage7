/**
 * Service Token Manager
 *
 * Manages authentication tokens for service-to-service communication
 * Provides a unified token verification mechanism for all services
 */

import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import { createAuthenticatedAxios } from '@cktmcs/shared';

export class ServiceTokenManager {
  private token: string = '';
  private tokenExpiry: number = 0;
  private authUrl: string;
  private serviceId: string;
  private serviceSecret: string;
  private publicKey: string = '';
  private static instance: ServiceTokenManager | null = null;

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
   * Get a singleton instance of the ServiceTokenManager
   * @param authUrl URL of the authentication service
   * @param serviceId ID of this service
   * @param serviceSecret Secret for this service
   * @returns ServiceTokenManager instance
   */
  public static getInstance(authUrl: string, serviceId: string, serviceSecret: string): ServiceTokenManager {
    if (!ServiceTokenManager.instance) {
      ServiceTokenManager.instance = new ServiceTokenManager(authUrl, serviceId, serviceSecret);
    }
    return ServiceTokenManager.instance;
  }

  /**
   * Fetch the public key from the security manager
   * This is used to verify tokens locally
   */
  private async fetchPublicKey(): Promise<void> {
    try {
      console.log(`[ServiceTokenManager] Fetching public key for ${this.serviceId}`);

      // First try to load from file system
      try {
        // Check multiple possible locations for the public key
        const possiblePaths = [
          path.join(__dirname, '../../keys/public.key'),
          path.join(__dirname, '../../keys/public.pem'),
          path.join(__dirname, '../../../shared/keys/public.key'),
          path.join(__dirname, '../../../shared/keys/public.pem'),
          path.join(process.cwd(), 'keys/public.key'),
          path.join(process.cwd(), 'keys/public.pem'),
          path.join(process.cwd(), 'shared/keys/public.key'),
          path.join(process.cwd(), 'shared/keys/public.pem')
        ];

        console.log(`[ServiceTokenManager] Checking for public key in these locations:`, possiblePaths);

        for (const publicKeyPath of possiblePaths) {
          if (fs.existsSync(publicKeyPath)) {
            this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
            console.log(`[ServiceTokenManager] Public key loaded from file: ${publicKeyPath} for ${this.serviceId}`);
            console.log(`[ServiceTokenManager] Public key content (first 40 chars): ${this.publicKey.substring(0, 40)}...`);
            return;
          }
        }

        console.warn(`[ServiceTokenManager] Could not find public key in any of the expected locations`);
      } catch (fsError: any) {
        console.warn(`[ServiceTokenManager] Could not load public key from file: ${fsError.message}`);
      }

      // If file system fails, fetch from security manager with retry logic
      console.log(`[ServiceTokenManager] Fetching public key from ${this.authUrl}/public-key`);

      const maxRetries = 3;
      let retryCount = 0;
      let lastError: any = null;

      while (retryCount < maxRetries) {
        try {
          const response = await axios.get(`${this.authUrl}/public-key`, { timeout: 5000 });

          if (!response.data) {
            throw new Error('Empty response received from public-key endpoint');
          }

          this.publicKey = response.data;
          console.log(`[ServiceTokenManager] Public key received from server (first 40 chars): ${this.publicKey.substring(0, 40)}...`);

          // Save the public key to file for future use
          try {
            // Try multiple locations for saving the key
            const keysDirs = [
              path.join(__dirname, '../../keys'),
              path.join(process.cwd(), 'keys'),
              path.join(process.cwd(), 'shared/keys')
            ];

            for (const keysDir of keysDirs) {
              try {
                if (!fs.existsSync(keysDir)) {
                  fs.mkdirSync(keysDir, { recursive: true });
                }
                fs.writeFileSync(path.join(keysDir, 'public.key'), this.publicKey);
                console.log(`[ServiceTokenManager] Public key saved to file: ${path.join(keysDir, 'public.key')}`);
                break;
              } catch (dirError: any) {
                console.warn(`[ServiceTokenManager] Could not save public key to ${keysDir}: ${dirError.message}`);
              }
            }
          } catch (fsError: any) {
            console.warn(`[ServiceTokenManager] Could not save public key to file: ${fsError.message}`);
          }

          console.log(`[ServiceTokenManager] Public key fetched successfully for ${this.serviceId}`);
          return;
        } catch (error: any) {
          lastError = error;
          retryCount++;
          console.warn(`[ServiceTokenManager] Failed to fetch public key (attempt ${retryCount}/${maxRetries}): ${error.message}`);

          if (axios.isAxiosError(error)) {
            if (error.response) {
              console.error(`[ServiceTokenManager] Response status: ${error.response.status}`);
              console.error(`[ServiceTokenManager] Response data: ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
              console.error(`[ServiceTokenManager] No response received from server`);
            }
          }

          if (retryCount < maxRetries) {
            // Wait before retrying (exponential backoff)
            const delay = Math.pow(2, retryCount) * 1000;
            console.log(`[ServiceTokenManager] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // If we get here, all retries failed
      throw lastError || new Error('Failed to fetch public key after multiple attempts');
    } catch (error: any) {
      console.error(`[ServiceTokenManager] Failed to fetch public key: ${error.message}`);
      throw error;
    }
  }

  // Track authentication attempts to prevent too many requests
  private lastAuthAttempt: number = 0;
  private authInProgress: boolean = false;
  private authRetryTimeout: number = 10000; // 10 seconds between auth attempts

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

    // Prevent multiple simultaneous authentication attempts
    if (this.authInProgress) {
      console.log(`Authentication already in progress for ${this.serviceId}, waiting...`);
      // Wait a bit and check if token is available
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (this.token !== '' && this.tokenExpiry > now + 5000) {
        return this.token;
      }
      // If still no token, wait longer
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.token !== '') {
        return this.token;
      }
    }

    // Prevent too frequent authentication attempts
    if (now - this.lastAuthAttempt < this.authRetryTimeout) {
      console.log(`Too many authentication attempts for ${this.serviceId}, using existing token or waiting`);
      if (this.token !== '') {
        // Use existing token even if it might be expired
        return this.token;
      }
      // Wait until we can try again
      const waitTime = this.authRetryTimeout - (now - this.lastAuthAttempt);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Set auth in progress flag
    this.authInProgress = true;
    this.lastAuthAttempt = now;

    try {
      // Make sure we have the public key
      if (!this.publicKey) {
        await this.fetchPublicKey();
      }

      console.log(`Authenticating ${this.serviceId} with security manager at ${this.authUrl}`);

      // Use a dedicated axios instance with proper timeout but no auth
      // This is the auth endpoint itself, so we can't authenticate this request
      const response = await axios.post(this.authUrl + '/auth/service', {
        componentType: this.serviceId,
        clientSecret: this.serviceSecret
      }, {
        timeout: 5000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.authenticated && response.data.token) {
        this.token = response.data.token;
        // Add buffer before expiry (token valid for 1h, we'll refresh after 50 min)
        this.tokenExpiry = now + (50 * 60 * 1000);
        console.log(`Successfully authenticated ${this.serviceId}, token received`);
        this.authInProgress = false;
        return this.token;
      } else {
        console.error(`Authentication response did not contain expected data: ${JSON.stringify(response.data)}`);
        this.authInProgress = false;
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

      // If we have an existing token, use it even if expired
      if (this.token !== '') {
        console.warn(`Using existing token for ${this.serviceId} despite authentication failure`);
        this.authInProgress = false;
        return this.token;
      }

      this.authInProgress = false;
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
   * Verify a token using the SecurityManager's verify endpoint
   * This is the preferred method for token verification
   * @param token JWT token to verify
   * @returns Promise resolving to decoded token payload or null if invalid
   */
  async verifyTokenWithSecurityManager(token: string): Promise<any | null> {
    try {
      console.log(`[ServiceTokenManager] Verifying token with SecurityManager endpoint for ${this.serviceId}`);
      console.log(`[ServiceTokenManager] SecurityManager URL: ${this.authUrl}/verify`);

      // Log token details for debugging (without revealing the full token)
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
          console.log(`[ServiceTokenManager] Token header for SecurityManager verification:`, header);
        }
      } catch (parseError) {
        console.error(`[ServiceTokenManager] Error parsing token for SecurityManager verification:`, parseError);
      }

      // Set a timeout for the request to prevent hanging
      const timeoutMs = 5000; // 5 seconds

      // We're sending the token to verify in the Authorization header
      // This is correct - we don't need to authenticate this request with our own token
      const response = await axios.post(`${this.authUrl}/verify`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: timeoutMs
      });

      if (response.data && response.data.valid) {
        console.log(`[ServiceTokenManager] Token verified by SecurityManager for ${this.serviceId}`);
        return response.data.user;
      } else {
        console.log(`[ServiceTokenManager] Token rejected by SecurityManager for ${this.serviceId}:`, response.data?.error || 'Unknown error');
        console.log(`[ServiceTokenManager] Response data:`, response.data);
        return null;
      }
    } catch (error: any) {
      console.error(`[ServiceTokenManager] SecurityManager verification failed for ${this.serviceId}:`, error.message);
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error(`[ServiceTokenManager] Response data:`, error.response.data);
          console.error(`[ServiceTokenManager] Response status:`, error.response.status);
        } else if (error.request) {
          console.error(`[ServiceTokenManager] No response received from SecurityManager, request timed out or failed to connect`);
        }
      }
      return null;
    }
  }

  /**
   * Verify a token locally using the public key with RS256 algorithm
   * This is a fallback method if the SecurityManager is unavailable
   * @param token JWT token to verify
   * @returns Promise resolving to decoded token payload or null if invalid
   */
  async verifyTokenLocally(token: string): Promise<any | null> {
    try {
      // Make sure we have the public key
      if (!this.publicKey) {
        console.log(`[ServiceTokenManager] No public key available for ${this.serviceId}, fetching...`);
        await this.fetchPublicKey();
      }

      // If we still don't have a public key, we can't verify
      if (!this.publicKey) {
        console.error(`[ServiceTokenManager] Failed to fetch public key for ${this.serviceId}`);
        return null;
      }

      console.log(`[ServiceTokenManager] Public key available for verification (first 40 chars): ${this.publicKey.substring(0, 40)}...`);

      console.log(`[ServiceTokenManager] Verifying token for ${this.serviceId} using public key (length: ${this.publicKey.length})`);
      console.log(`[ServiceTokenManager] Public key starts with: ${this.publicKey.substring(0, 40)}...`);

      try {
        // First check if the token is in the correct format
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          console.error('[ServiceTokenManager] Invalid token format - not a valid JWT');
          return null;
        }

        // Try to parse the header to check the algorithm
        const headerStr = Buffer.from(tokenParts[0], 'base64').toString();
        const header = JSON.parse(headerStr);
        console.log(`[ServiceTokenManager] Token header:`, header);

        if (header.alg !== 'RS256') {
          console.error(`[ServiceTokenManager] Token uses unsupported algorithm: ${header.alg}. Only RS256 is supported.`);
          return null;
        }

        // Verify with RS256 only - no fallback to HS256
        const decoded = jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
        console.log(`[ServiceTokenManager] Token verified successfully for ${this.serviceId}`);
        return decoded;
      } catch (rs256Error) {
        console.error(`[ServiceTokenManager] RS256 verification failed for ${this.serviceId}:`, rs256Error);

        // Log token details for debugging (without revealing the full token)
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            console.log(`[ServiceTokenManager] Token header:`, header);
            console.log(`[ServiceTokenManager] Token payload exp:`, payload.exp);
            console.log(`[ServiceTokenManager] Token payload iat:`, payload.iat);

            // Check if token is expired
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
              console.error(`[ServiceTokenManager] Token is expired. Expired at ${new Date(payload.exp * 1000).toISOString()}, current time is ${new Date().toISOString()}`);
            }
          }
        } catch (parseError) {
          console.error(`[ServiceTokenManager] Error parsing token:`, parseError);
        }

        return null;
      }
    } catch (error) {
      console.error(`[ServiceTokenManager] Local token verification failed for ${this.serviceId}:`, error);
      return null;
    }
  }

  // Cache verified tokens to reduce verification requests
  private verifiedTokens: Map<string, { payload: any, expiry: number }> = new Map();
  private lastVerificationAttempt: number = 0;
  private verificationRetryTimeout: number = 2000; // 2 seconds between verification attempts
  private static MAX_CACHE_SIZE: number = 1000; // Maximum number of tokens to cache

  /**
   * Unified token verification method
   * First checks cache, then tries local verification, and only if needed uses SecurityManager
   * @param token JWT token to verify
   * @returns Promise resolving to decoded token payload or null if invalid
   */
  async verifyToken(token: string): Promise<any | null> {
    if (!token) {
      console.error('No token provided for verification');
      return null;
    }

    const now = Date.now();

    // Check if token is in cache and not expired
    const cachedResult = this.verifiedTokens.get(token);
    if (cachedResult && cachedResult.expiry > now) {
      return cachedResult.payload;
    }

    // Prevent too frequent verification attempts
    if (now - this.lastVerificationAttempt < this.verificationRetryTimeout) {
      // If we have a cached result, use it even if expired
      if (cachedResult) {
        return cachedResult.payload;
      }

      // Wait until we can try again
      const waitTime = this.verificationRetryTimeout - (now - this.lastVerificationAttempt);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastVerificationAttempt = now;

    try {
      // Try local verification first (faster and doesn't hit the network)
      const localResult = await this.verifyTokenLocally(token);
      if (localResult) {
        // Cache the result
        const expiry = typeof localResult.exp === 'number'
          ? localResult.exp * 1000 // Convert seconds to milliseconds
          : now + (50 * 60 * 1000); // Default 50 minutes if no exp claim

        // Manage cache size - remove oldest entries if cache is too large
        if (this.verifiedTokens.size >= ServiceTokenManager.MAX_CACHE_SIZE) {
          this.pruneTokenCache();
        }

        this.verifiedTokens.set(token, { payload: localResult, expiry });
        return localResult;
      }

      // Only if local verification fails, try with SecurityManager
      const securityManagerResult = await this.verifyTokenWithSecurityManager(token);
      if (securityManagerResult) {
        // Cache the result
        const expiry = now + (50 * 60 * 1000); // Default 50 minutes

        // Manage cache size - remove oldest entries if cache is too large
        if (this.verifiedTokens.size >= ServiceTokenManager.MAX_CACHE_SIZE) {
          this.pruneTokenCache();
        }

        this.verifiedTokens.set(token, { payload: securityManagerResult, expiry });
        return securityManagerResult;
      }

      return null;
    } catch (error) {
      console.error('Error during token verification:', error);

      // If we have a cached result, use it even if expired
      if (cachedResult) {
        return cachedResult.payload;
      }

      return null;
    }
  }


  /**
   * Extract token from Authorization header
   * @param authHeader Authorization header value
   * @returns Token or null if not found
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Prune the token cache by removing expired tokens and oldest tokens if still over size limit
   * @private
   */
  private pruneTokenCache(): void {
    const now = Date.now();

    // First, remove all expired tokens
    for (const [token, data] of this.verifiedTokens.entries()) {
      if (data.expiry < now) {
        this.verifiedTokens.delete(token);
      }
    }

    // If still over size limit, remove oldest tokens
    if (this.verifiedTokens.size >= ServiceTokenManager.MAX_CACHE_SIZE) {
      // Convert to array for sorting
      const entries = Array.from(this.verifiedTokens.entries());

      // Sort by expiry (oldest first)
      entries.sort((a, b) => a[1].expiry - b[1].expiry);

      // Remove oldest entries until under size limit
      const entriesToRemove = entries.slice(0, entries.length - ServiceTokenManager.MAX_CACHE_SIZE / 2);
      for (const [token] of entriesToRemove) {
        this.verifiedTokens.delete(token);
      }

      console.log(`Pruned token cache from ${entries.length} to ${this.verifiedTokens.size} entries`);
    }
  }
}




