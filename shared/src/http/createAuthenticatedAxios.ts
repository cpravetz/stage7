import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ServiceTokenManager } from '../security/ServiceTokenManager.js';

// Environment configuration
const ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (ENV === 'production' ? 'error' : 'debug');
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '1000', 10);

// Health check paths that should bypass authentication
// Note: /health is kept for backward compatibility but redirects to /ready?detail=full
const HEALTH_CHECK_PATHS = ['/healthy', '/ready', '/health', '/status'];

// Auth paths that should bypass authentication
const AUTH_PATHS = ['/auth/', '/login', '/register', '/public-key', '/refresh-token', '/registerComponent'];

/**
 * Configuration options for authenticated axios instances
 */
export interface AuthenticatedAxiosOptions {
  /** Service ID used for token acquisition */
  serviceId: string;

  /** URL of the security manager service */
  securityManagerUrl?: string;

  /** Client secret for authentication */
  clientSecret?: string;

  /** Whether to enable request retries */
  enableRetry?: boolean;

  /** Maximum number of retries */
  maxRetries?: number;

  /** Whether to enable token refresh on 401 errors */
  enableTokenRefresh?: boolean;

  /** Log level for this instance */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Helper function for controlled logging
 * @param level Log level
 * @param message Message to log
 * @param data Optional data to include
 * @param instanceLogLevel Optional instance-specific log level
 */
function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any, instanceLogLevel?: string) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const effectiveLogLevel = instanceLogLevel || LOG_LEVEL;

  if (levels[level] >= levels[effectiveLogLevel as keyof typeof levels]) {
    if (data) {
      console[level](message, data);
    } else {
      console[level](message);
    }
  }
}

/**
 * Check if a path should bypass authentication
 * Only health check endpoints and authentication endpoints should bypass auth
 */
function shouldBypassAuth(path: string): boolean {
  // Normalize the path - remove trailing slashes and ensure it starts with a slash
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  const finalPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  // Check for exact health check paths
  if (HEALTH_CHECK_PATHS.some(p => finalPath === p)) {
    console.log(`[shouldBypassAuth] Bypassing auth for health check path: ${finalPath}`);
    return true;
  }

  // Check for health check paths with additional segments
  if (HEALTH_CHECK_PATHS.some(p => finalPath.startsWith(`${p}/`))) {
    console.log(`[shouldBypassAuth] Bypassing auth for health check path with segments: ${finalPath}`);
    return true;
  }

  // Check for /ready with query parameters
  if (finalPath.startsWith('/ready?')) {
    console.log(`[shouldBypassAuth] Bypassing auth for ready path with query params: ${finalPath}`);
    return true;
  }

  // Check for auth paths
  for (const authPath of AUTH_PATHS) {
    // For /registerComponent, check for exact match
    if (authPath === '/registerComponent' && finalPath === authPath) {
      console.log(`[shouldBypassAuth] Bypassing auth for registerComponent: ${finalPath}`);
      return true;
    }

    // For other auth paths, check if the path includes the auth path
    if (authPath !== '/registerComponent' && finalPath.includes(authPath)) {
      console.log(`[shouldBypassAuth] Bypassing auth for auth path: ${finalPath} (matched ${authPath})`);
      return true;
    }
  }

  return false;
}

/**
 * Creates an authenticated axios instance for services with comprehensive error handling and token management
 * @param options Configuration options or service ID string (for backward compatibility)
 * @returns Configured axios instance
 */
export function createAuthenticatedAxios(
  optionsOrServiceId: AuthenticatedAxiosOptions | string,
  securityManagerUrl: string = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
  clientSecret: string = process.env.CLIENT_SECRET || 'stage7AuthSecret'
): AxiosInstance {
  // Handle both new options object and legacy parameters
  const options: AuthenticatedAxiosOptions = typeof optionsOrServiceId === 'string'
    ? {
        serviceId: optionsOrServiceId,
        securityManagerUrl,
        clientSecret,
        enableRetry: true,
        enableTokenRefresh: true,
      }
    : {
        enableRetry: true,
        enableTokenRefresh: true,
        ...optionsOrServiceId
      };

  const {
    serviceId,
    securityManagerUrl: securityUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
    clientSecret: secret = process.env.CLIENT_SECRET || 'stage7AuthSecret',
    enableRetry = true,
    maxRetries = MAX_RETRIES,
    enableTokenRefresh = true
  } = options;

  // Set log level for this instance
  const instanceLogLevel = options.logLevel || LOG_LEVEL;

  // Create a token manager for this service
  const tokenManager = ServiceTokenManager.getInstance(
    `http://${securityUrl}`,
    serviceId,
    secret
  );

  // Create axios instance with timeout
  const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    timeout: 30000, // 30 second timeout
  });

  // Add request interceptor for authentication
  api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    // Generate a unique request ID for tracing
    const requestId = Math.random().toString(36).substring(2, 15);
    config.headers.set('X-Request-ID', requestId);

    // Record start time for metrics
    const requestStartTime = Date.now();
    (config as any)._requestStartTime = requestStartTime;

    try {
      // Extract path from URL with comprehensive error handling
      const fullUrl = config.url || '';
      let path = '';

      try {
        // Handle different URL formats
        if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
          // Full URL
          const url = new URL(fullUrl);
          path = url.pathname;
        } else if (config.baseURL) {
          // Relative URL with baseURL
          const url = new URL(fullUrl, config.baseURL);
          path = url.pathname;
        } else if (fullUrl.startsWith('/')) {
          // Absolute path
          path = fullUrl.split('?')[0];
        } else {
          // Relative path without baseURL
          path = '/' + fullUrl.split('?')[0];
        }

        log('debug', `[AuthenticatedAxios] Request ${requestId}: Extracted path: ${path} from URL: ${fullUrl}`, undefined, instanceLogLevel);
      } catch (urlError) {
        log('error', `[AuthenticatedAxios] Request ${requestId}: Error parsing URL:`, urlError, instanceLogLevel);
        // Fallback to a simple approach
        path = '/' + (fullUrl.split('?')[0].split('/').pop() || '');
        log('debug', `[AuthenticatedAxios] Request ${requestId}: Using fallback path: ${path}`, undefined, instanceLogLevel);
      }

      // Log request details for debugging
      log('debug', `[AuthenticatedAxios] Request ${requestId} started:`, {
        method: config.method,
        url: config.url,
        baseURL: config.baseURL,
        path: path,
        headers: { ...config.headers, Authorization: config.headers.get('Authorization') ? '(present)' : '(not set)' },
        data: config.data ? (typeof config.data === 'string'
          ? config.data.substring(0, 100) + (config.data.length > 100 ? '...' : '')
          : JSON.stringify(config.data).substring(0, 100) + (JSON.stringify(config.data).length > 100 ? '...' : ''))
          : null
      }, instanceLogLevel);

      // Skip authentication for certain paths
      if (shouldBypassAuth(path)) {
        log('debug', `[AuthenticatedAxios] Request ${requestId}: Skipping authentication for path: ${path}`, undefined, instanceLogLevel);
        return config;
      }

      // Get token and set Authorization header with validation
      try {
        const token = await tokenManager.getToken();

        if (!token) {
          log('error', `[AuthenticatedAxios] Request ${requestId}: Failed to get token for service ${serviceId}`, undefined, instanceLogLevel);
        } else {
          // Always set the token - we don't have validation in ServiceTokenManager yet
          config.headers.set('Authorization', `Bearer ${token}`);
          log('debug', `[AuthenticatedAxios] Request ${requestId}: Added authentication token for ${serviceId}`, undefined, instanceLogLevel);

          // Note: The code below is commented out because ServiceTokenManager doesn't have these methods yet
          // When they are added, this code can be uncommented

          /*
          // Validate token before using it (if token validation is implemented in ServiceTokenManager)
          let isValid = true;
          if (typeof (tokenManager as any).validateToken === 'function') {
            try {
              isValid = await (tokenManager as any).validateToken(token);
            } catch (validationError) {
              log('error', `[AuthenticatedAxios] Request ${requestId}: Token validation error:`, validationError);
              isValid = false;
            }
          }

          if (isValid) {
            config.headers.set('Authorization', `Bearer ${token}`);
            log('debug', `[AuthenticatedAxios] Request ${requestId}: Added valid authentication token for ${serviceId}`);
          } else if (enableTokenRefresh && typeof (tokenManager as any).refreshToken === 'function') {
            log('warn', `[AuthenticatedAxios] Request ${requestId}: Token validation failed, attempting refresh`);
            try {
              await (tokenManager as any).refreshToken();
              const newToken = await tokenManager.getToken();
              if (newToken) {
                config.headers.set('Authorization', `Bearer ${newToken}`);
                log('debug', `[AuthenticatedAxios] Request ${requestId}: Added refreshed token for ${serviceId}`);
              }
            } catch (refreshError) {
              log('error', `[AuthenticatedAxios] Request ${requestId}: Token refresh failed:`, refreshError);
            }
          }
          */
        }
      } catch (tokenError) {
        log('error', `[AuthenticatedAxios] Request ${requestId}: Error getting token:`, tokenError, instanceLogLevel);
      }
    } catch (error) {
      log('error', `[AuthenticatedAxios] Request ${requestId}: Error in request interceptor for ${serviceId}:`, error, instanceLogLevel);
    }

    return config;
  });

  // Add response interceptor for logging and metrics
  api.interceptors.response.use(
    (response) => {
      const requestId = response.config.headers['X-Request-ID'];
      const requestTime = Date.now() - ((response.config as any)._requestStartTime || Date.now());

      log('debug', `[AuthenticatedAxios] Request ${requestId}: Completed in ${requestTime}ms with status ${response.status}`, undefined, instanceLogLevel);

      // Here you could send metrics to a monitoring system
      // recordMetric('request_time', requestTime, { path: response.config.url });

      return response;
    },
    async (error) => {
      const requestId = error.config?.headers?.['X-Request-ID'];
      const requestTime = Date.now() - ((error.config as any)?._requestStartTime || Date.now());

      log('error', `[AuthenticatedAxios] Request ${requestId || 'unknown'}: Failed after ${requestTime}ms:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url
      }, instanceLogLevel);

      // Implement retry logic for failed requests
      if (enableRetry) {
        // Skip retry for certain status codes
        if (error.response && [400, 403, 404].includes(error.response.status)) {
          return Promise.reject(error);
        }

        // Get the original request config
        const originalRequest = error.config;

        // Only retry if we haven't already reached max retries
        if (originalRequest && !originalRequest._retryCount) {
          originalRequest._retryCount = 0;
        }

        if (originalRequest && originalRequest._retryCount < maxRetries) {
          originalRequest._retryCount++;

          log('warn', `[AuthenticatedAxios] Request ${requestId}: Retrying (${originalRequest._retryCount}/${maxRetries})`, undefined, instanceLogLevel);

          // For 401, try to get a new token if enabled
          if (enableTokenRefresh && error.response?.status === 401) {
            try {
              log('debug', `[AuthenticatedAxios] Request ${requestId}: Getting new token before retry`, undefined, instanceLogLevel);

              // Note: The code below is commented out because ServiceTokenManager doesn't have refreshToken method yet
              // When it is added, this code can be uncommented
              /*
              // Try to refresh the token
              if (typeof (tokenManager as any).refreshToken === 'function') {
                await (tokenManager as any).refreshToken();
              }
              */

              // Get a new token (this will create a new one if needed)
              const newToken = await tokenManager.getToken();

              // Update the failed request with the new token
              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

              log('debug', `[AuthenticatedAxios] Request ${requestId}: Got new token, retrying request`, undefined, instanceLogLevel);
            } catch (refreshError) {
              log('error', `[AuthenticatedAxios] Request ${requestId}: Getting new token failed during retry:`, refreshError, instanceLogLevel);
            }
          }

          // Add a small delay before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

          // Retry the request
          return axios(originalRequest);
        }
      }

      return Promise.reject(error);
    }
  );

  return api;
}

/**
 * Configuration options for client authenticated axios instances
 */
export interface ClientAuthenticatedAxiosOptions {
  /** Function to get the current token */
  getToken: () => string | null;

  /** Base URL for requests */
  baseURL?: string;

  /** Whether to enable request retries */
  enableRetry?: boolean;

  /** Maximum number of retries */
  maxRetries?: number;

  /** Log level for this instance */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /** Custom headers to include in all requests */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Creates an authenticated axios instance for frontend clients with improved error handling
 * @param options Configuration options or getToken function (for backward compatibility)
 * @returns Configured axios instance
 */
export function createClientAuthenticatedAxios(
  optionsOrGetToken: ClientAuthenticatedAxiosOptions | (() => string | null),
  baseURL?: string
): AxiosInstance {
  // Handle both new options object and legacy parameters
  const options: ClientAuthenticatedAxiosOptions = typeof optionsOrGetToken === 'function'
    ? {
        getToken: optionsOrGetToken,
        baseURL,
        enableRetry: true,
      }
    : {
        enableRetry: true,
        ...optionsOrGetToken
      };

  const {
    getToken,
    baseURL: baseUrl = '',
    enableRetry = true,
    maxRetries = MAX_RETRIES,
    headers = {},
    timeout = 30000
  } = options;

  // Set log level for this instance
  const instanceLogLevel = options.logLevel || LOG_LEVEL;

  // Create axios instance with timeout and base URL
  const api = axios.create({
    baseURL: baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers
    },
    timeout
  });

  // Add request interceptor for authentication
  api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    // Generate a unique request ID for tracing
    const requestId = Math.random().toString(36).substring(2, 15);
    config.headers.set('X-Request-ID', requestId);

    // Record start time for metrics
    const requestStartTime = Date.now();
    (config as any)._requestStartTime = requestStartTime;

    try {
      // Extract path from URL with comprehensive error handling
      const fullUrl = config.url || '';
      let path = '';

      try {
        // Handle different URL formats
        if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
          // Full URL
          const url = new URL(fullUrl);
          path = url.pathname;
        } else if (config.baseURL) {
          // Relative URL with baseURL
          const url = new URL(fullUrl, config.baseURL);
          path = url.pathname;
        } else if (fullUrl.startsWith('/')) {
          // Absolute path
          path = fullUrl.split('?')[0];
        } else {
          // Relative path without baseURL
          path = '/' + fullUrl.split('?')[0];
        }

        log('debug', `[ClientAuthenticatedAxios] Request ${requestId}: Extracted path: ${path} from URL: ${fullUrl}`, undefined, instanceLogLevel);
      } catch (urlError) {
        log('error', `[ClientAuthenticatedAxios] Request ${requestId}: Error parsing URL:`, urlError, instanceLogLevel);
        // Fallback to a simple approach
        path = '/' + (fullUrl.split('?')[0].split('/').pop() || '');
        log('debug', `[ClientAuthenticatedAxios] Request ${requestId}: Using fallback path: ${path}`, undefined, instanceLogLevel);
      }

      // Log request details for debugging
      log('debug', `[ClientAuthenticatedAxios] Request ${requestId} started:`, {
        method: config.method,
        url: config.url,
        baseURL: config.baseURL,
        path: path,
        headers: { ...config.headers, Authorization: config.headers.get('Authorization') ? '(present)' : '(not set)' }
      }, instanceLogLevel);

      // Skip authentication for certain paths
      if (shouldBypassAuth(path)) {
        log('debug', `[ClientAuthenticatedAxios] Request ${requestId}: Skipping authentication for path: ${path}`, undefined, instanceLogLevel);
        return config;
      }

      // Get token and set Authorization header if available
      const token = getToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
        log('debug', `[ClientAuthenticatedAxios] Request ${requestId}: Added authentication token to request`, undefined, instanceLogLevel);
      } else {
        log('warn', `[ClientAuthenticatedAxios] Request ${requestId}: No token available for request to ${path}`, undefined, instanceLogLevel);
      }
    } catch (error) {
      log('error', `[ClientAuthenticatedAxios] Request ${requestId}: Error adding auth header:`, error, instanceLogLevel);
    }

    return config;
  });

  // Add response interceptor for logging and metrics
  api.interceptors.response.use(
    (response) => {
      const requestId = response.config.headers['X-Request-ID'];
      const requestTime = Date.now() - ((response.config as any)._requestStartTime || Date.now());

      log('debug', `[ClientAuthenticatedAxios] Request ${requestId}: Completed in ${requestTime}ms with status ${response.status}`, undefined, instanceLogLevel);

      return response;
    },
    async (error) => {
      const requestId = error.config?.headers?.['X-Request-ID'];
      const requestTime = Date.now() - ((error.config as any)?._requestStartTime || Date.now());

      log('error', `[ClientAuthenticatedAxios] Request ${requestId || 'unknown'}: Failed after ${requestTime}ms:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url
      }, instanceLogLevel);

      // Implement retry logic for failed requests
      if (enableRetry) {
        // Skip retry for certain status codes
        if (error.response && [400, 403, 404].includes(error.response.status)) {
          return Promise.reject(error);
        }

        // Get the original request config
        const originalRequest = error.config;

        // Only retry if we haven't already reached max retries
        if (originalRequest && !originalRequest._retryCount) {
          originalRequest._retryCount = 0;
        }

        if (originalRequest && originalRequest._retryCount < maxRetries) {
          originalRequest._retryCount++;

          log('warn', `[ClientAuthenticatedAxios] Request ${requestId}: Retrying (${originalRequest._retryCount}/${maxRetries})`, undefined, instanceLogLevel);

          // Add a small delay before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

          // Retry the request
          return axios(originalRequest);
        }
      }

      return Promise.reject(error);
    }
  );

  return api;
}
