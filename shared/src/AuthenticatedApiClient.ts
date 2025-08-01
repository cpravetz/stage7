import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IBaseEntity } from './interfaces/IBaseEntity';
import { createAuthenticatedAxios } from './http/createAuthenticatedAxios';

/**
 * Client for making authenticated API requests
 */
export class AuthenticatedApiClient {
  private api: AxiosInstance;

  constructor(private baseEntity: IBaseEntity) {
    const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    const componentType = this.baseEntity.componentType;
    const clientSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';

    // Use the shared authenticated axios instance
    this.api = createAuthenticatedAxios(componentType, securityManagerUrl, clientSecret);
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