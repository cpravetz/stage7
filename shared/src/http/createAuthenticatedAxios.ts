import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ServiceTokenManager } from '../security/ServiceTokenManager.js';

// Health check paths that should bypass authentication
// Note: /health is kept for backward compatibility but redirects to /ready?detail=full
const HEALTH_CHECK_PATHS = ['/healthy', '/ready', '/health', '/status'];

// Auth paths that should bypass authentication
const AUTH_PATHS = ['/auth/', '/login', '/register', '/public-key', '/refresh-token', '/registerComponent'];

/**
 * Check if a path should bypass authentication
 */
function shouldBypassAuth(path: string): boolean {
  // Check for exact health check paths
  if (HEALTH_CHECK_PATHS.some(p => path === p)) {
    return true;
  }

  // Check for health check paths with additional segments
  if (HEALTH_CHECK_PATHS.some(p => path.startsWith(`${p}/`))) {
    return true;
  }

  // Check for /ready with query parameters
  if (path.startsWith('/ready?')) {
    return true;
  }

  // Check for auth paths
  if (AUTH_PATHS.some(p => {
    // For /registerComponent, check for exact match
    if (p === '/registerComponent') {
      return path === p;
    }
    // For other auth paths, check if the path includes the auth path
    return path.includes(p);
  })) {
    return true;
  }

  return false;
}

/**
 * Creates an authenticated axios instance for services
 */
export function createAuthenticatedAxios(
  serviceId: string,
  securityManagerUrl: string = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
  clientSecret: string = process.env.CLIENT_SECRET || 'stage7AuthSecret'
): AxiosInstance {
  // Create a token manager for this service
  const tokenManager = ServiceTokenManager.getInstance(
    `http://${securityManagerUrl}`,
    serviceId,
    clientSecret
  );

  // Create axios instance
  const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

  // Add authentication interceptor
  api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    try {
      // Extract path from URL
      const url = new URL(config.url || '', config.baseURL || 'http://localhost');
      const path = url.pathname;

      // Skip authentication for certain paths
      if (shouldBypassAuth(path)) {
        return config;
      }

      // Get token and set Authorization header
      const token = await tokenManager.getToken();
      config.headers.set('Authorization', `Bearer ${token}`);
    } catch (error) {
      console.error('Error adding auth header to request:', error);
    }
    return config;
  });

  return api;
}

/**
 * Creates an authenticated axios instance for frontend clients
 */
export function createClientAuthenticatedAxios(getToken: () => string | null): AxiosInstance {
  const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

  api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    try {
      // Extract path from URL
      const url = new URL(config.url || '', config.baseURL || 'http://localhost');
      const path = url.pathname;

      // Skip authentication for certain paths
      if (shouldBypassAuth(path)) {
        return config;
      }

      // Get token and set Authorization header if available
      const token = getToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (error) {
      console.error('Error adding auth header to request:', error);
    }
    return config;
  });

  return api;
}
