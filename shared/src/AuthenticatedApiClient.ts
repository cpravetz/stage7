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
      const clientId = this.baseEntity.componentType;
      const clientSecret = process.env.CLIENT_SECRET;
  
      if (!clientSecret) {
        throw new Error('CLIENT_SECRET is not set in environment variables');
      }
  
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const response = await axios.post(
        `http://${this.securityManagerUrl}/oauth/token`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpirationTime = Date.now() + response.data.expires_in * 1000;
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