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

  // First handle duplicate protocol prefixes if present (e.g. "http://http://librarian:5040/path")
  let cleanUrl = url;
  const duplicateMatch = cleanUrl.match(/^(https?:\/\/)(https?:\/\/)(.*)$/i);
  if (duplicateMatch) {
    cleanUrl = duplicateMatch[1] + duplicateMatch[3];
  } else if (!cleanUrl.match(/^([a-z]+:)\/\//i)) {
    cleanUrl = 'http://' + cleanUrl;
  }

  try {
    const parsed = new URL(cleanUrl);
    // Sanitize host and path to prevent SSRF / URL manipulation
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid protocol: ${parsed.protocol}`);
    }
    return parsed.href;
  } catch {
    return cleanUrl;
  }
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