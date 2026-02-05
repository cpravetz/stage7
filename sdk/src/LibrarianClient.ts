import type { AxiosInstance } from 'axios';

export interface LibrarianStoreRequest {
  id?: string;
  data: any;
  collection?: string;
  storageType?: 'mongo' | 'redis';
}

export interface LibrarianStoreResponse {
  status: string;
  id: string;
}

export interface LibrarianLoadResponse<T = any> {
  data: T;
}

export interface LibrarianQueryResponse<T = any> {
  data: T[];
}

export class LibrarianClient {
  private getAxios: () => AxiosInstance;
  private getBaseUrl: () => Promise<string>;

  constructor(getAxios: () => AxiosInstance, getBaseUrl: () => Promise<string>) {
    this.getAxios = getAxios;
    this.getBaseUrl = getBaseUrl;
  }

  async storeData(request: LibrarianStoreRequest): Promise<LibrarianStoreResponse> {
    const baseUrl = await this.getBaseUrl();
    const axios = this.getAxios();
    const response = await axios.post(`${baseUrl}/storeData`, {
      storageType: request.storageType || 'mongo',
      collection: request.collection,
      id: request.id,
      data: request.data
    });
    return response.data;
  }

  async loadData<T = any>(collection: string, query: any, storageType: 'mongo' | 'redis' = 'mongo'): Promise<LibrarianLoadResponse<T>> {
    const baseUrl = await this.getBaseUrl();
    const axios = this.getAxios();
    const response = await axios.get(`${baseUrl}/loadData`, {
      params: {
        collection,
        storageType,
        query: JSON.stringify(query || {})
      }
    });
    return response.data;
  }

  async queryData<T = any>(collection: string, query: any, storageType: 'mongo' | 'redis' = 'mongo'): Promise<LibrarianQueryResponse<T>> {
    const baseUrl = await this.getBaseUrl();
    const axios = this.getAxios();
    const response = await axios.post(`${baseUrl}/queryData`, {
      collection,
      storageType,
      query
    });
    return response.data;
  }

  async deleteData(collection: string, id: string, storageType: 'mongo' | 'redis' = 'mongo'): Promise<{ status: string }> {
    const baseUrl = await this.getBaseUrl();
    const axios = this.getAxios();
    const response = await axios.delete(`${baseUrl}/deleteData/${id}`, {
      params: { collection, storageType }
    });
    return response.data;
  }
}
