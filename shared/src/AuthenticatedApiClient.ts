import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { IBaseEntity } from './interfaces/IBaseEntity.js';
import { ServiceTokenManager } from './security/ServiceTokenManager.js';

/**
 * Client for making authenticated API requests
 */

export class AuthenticatedApiClient {
  private api: AxiosInstance;
  private securityManagerUrl: string;
  private tokenManager: ServiceTokenManager;

  constructor(private baseEntity: IBaseEntity) {
    this.securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';

    // Create a token manager for this service
    const componentType = this.baseEntity.componentType;
    const clientSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
    this.tokenManager = new ServiceTokenManager(
      `http://${this.securityManagerUrl}`,
      componentType,
      clientSecret
    );

    this.api = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

    this.api.interceptors.request.use(this.authInterceptor.bind(this));
  }

  private async authInterceptor(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
    try {
      // Get token
      const token = await this.tokenManager.getToken();
      // Set Authorization header
      config.headers.set('Authorization', `Bearer ${token}`);
      return config;
    } catch (error) {
      console.error('Error adding auth header to request:', error);
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