import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { BaseEntity } from './BaseEntity';

export class AuthenticatedApiClient {
  private api: AxiosInstance;
  private securityManagerUrl: string;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(private baseEntity: BaseEntity) {
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
      const clientSecret = process.env.CLIENT_SECRET;
  
      if (!clientSecret) {
        throw new Error('CLIENT_SECRET is not set in environment variables');
      }
  
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
      console.error('Failed to refresh token:', error);
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