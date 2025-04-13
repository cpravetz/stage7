import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig, isAxiosError } from 'axios';
import { IBaseEntity } from './interfaces/IBaseEntity.js';

/**
 * Client for making authenticated API requests
 */

export class AuthenticatedApiClient {
  private api: AxiosInstance;
  private securityManagerUrl: string;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(private baseEntity: IBaseEntity) {
    this.securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';
    this.api = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

    this.api.interceptors.request.use(this.authInterceptor.bind(this));
  }

  private async authInterceptor(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
    if (this.accessToken && Date.now() < this.tokenExpirationTime) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${this.accessToken}`;
      return config;
    }

    await this.refreshToken();
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${this.accessToken}`;
    return config;
  }

  private async refreshToken(): Promise<void> {
    try {
      const componentType = this.baseEntity.componentType;

      // Try to get component-specific client secret first, then fall back to generic CLIENT_SECRET
      const componentSpecificSecretKey = `${componentType.toUpperCase()}_CLIENT_SECRET`;
      let clientSecret = process.env[componentSpecificSecretKey] || process.env.CLIENT_SECRET;

      if (!clientSecret) {
        console.error(`Neither ${componentSpecificSecretKey} nor CLIENT_SECRET is set in environment variables`);
        throw new Error(`Client secret not found for ${componentType}`);
      }

      console.log(`Authenticating ${componentType} with security manager at ${this.securityManagerUrl}`);

      const response = await axios.post(
        `http://${this.securityManagerUrl}/auth/service`,
        { componentType, clientSecret },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.authenticated && response.data.token) {
        this.accessToken = response.data.token;
        // Set expiration time (e.g., 55 minutes from now if token is valid for 1 hour)
        this.tokenExpirationTime = Date.now() + 55 * 60 * 1000;
      } else {
        throw new Error('Failed to authenticate component');
      }
    } catch (error) {
      // Provide more detailed error information
      if (isAxiosError(error)) {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error(`Authentication error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          // The request was made but no response was received
          console.error(`No response from security manager: ${error.message}`);
          console.error(`Is the security manager running at ${this.securityManagerUrl}?`);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error(`Error setting up authentication request: ${error.message}`);
        }
      } else {
        console.error('Failed to refresh token:', error);
      }

      // Rethrow the error to be handled by the caller
      throw error;
    }
  }

  public async get(url: string, config?: AxiosRequestConfig) {
    return this.api.get(url, config);
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.api.post(url, data, config);
  }

  public async put(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.api.put(url, data, config);
  }

  public async delete(url: string, config?: AxiosRequestConfig) {
    return this.api.delete(url, config);
  }
}