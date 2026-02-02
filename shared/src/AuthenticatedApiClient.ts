import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IBaseEntity } from './interfaces/IBaseEntity';
import { createAuthenticatedAxios } from './http/createAuthenticatedAxios';

/**
 * Normalizes a URL by fixing protocol issues
 * - Removes extra 'http://' or 'https://' prefixes (e.g., "http://http://example.com" -> "http://example.com")
 * - Adds 'http://' if no protocol is provided
 * - Preserves other valid protocols (ws://, ftp://, etc.)
 * @param url The URL to normalize
 * @returns Normalized URL with proper protocol
 */
function normalizeUrl(url: string): string {
  if (!url) return url;

  // Check if URL already has a valid protocol
  const protocolMatch = url.match(/^([a-z]+:)\/\//i);

  if (protocolMatch) {
    // URL has a protocol - check for duplicate http:// or https://
    const protocol = protocolMatch[1].toLowerCase();
    
    if (protocol === 'http:' || protocol === 'https:') {
      // For http:// or https://, check if there's a duplicate protocol after it
      const afterProtocol = url.substring(protocol.length + 2); // +2 for //
      const duplicateProtocolMatch = afterProtocol.match(/^([a-z]+:)\/\//i);
      
      if (duplicateProtocolMatch) {
        // Remove the duplicate protocol
        const duplicateProtocol = duplicateProtocolMatch[1].toLowerCase();
        return protocol + '//' + afterProtocol.substring(duplicateProtocol.length + 2);
      }
    }
    
    // URL has a valid protocol (including non-http protocols like ws://, ftp://)
    return url;
  }
 
  // No protocol found - add http://
  return 'http://' + url;
}

/**
 * Client for making authenticated API requests
 */
export class AuthenticatedApiClient {
  public api: AxiosInstance;

  constructor(private baseEntity: IBaseEntity) {
    const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    const componentType = this.baseEntity.componentType;
    const clientSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';

    // Use the shared authenticated axios instance
    this.api = createAuthenticatedAxios(componentType, securityManagerUrl, clientSecret);
  }

  public async get(url: string, config?: AxiosRequestConfig) {
    const normalizedUrl = normalizeUrl(url);
    console.log('[GET] ' + normalizedUrl);
    return this.api.get(normalizedUrl, config);
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig) {
    const normalizedUrl = normalizeUrl(url);
    console.log('[POST] ' + normalizedUrl);
    return this.api.post(normalizedUrl, data, config);
  }

  public async put(url: string, data?: any, config?: AxiosRequestConfig) {
    const normalizedUrl = normalizeUrl(url);
    console.log('[PUT] ' + normalizedUrl);
    return this.api.put(normalizedUrl, data, config);
  }

  public async delete(url: string, config?: AxiosRequestConfig) {
    const normalizedUrl = normalizeUrl(url);
    console.log('[DELETE] ' + normalizedUrl);
    return this.api.delete(normalizedUrl, config);
  }
}