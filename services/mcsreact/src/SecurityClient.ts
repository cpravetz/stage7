import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user?: any;
}

interface RegisterData {
  email: string;
  password: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

interface RegisterResponse {
  success: boolean;
  message: string;
  user?: any;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * SecurityClient handles authentication and token management
 */
export class SecurityClient {
  private static instance: SecurityClient | null = null;
  private api: AxiosInstance;
  private baseUrl: string;
  private refreshInProgress: Promise<string | null> | null = null;
  private tokenKey = 'auth_tokens';
  private maxRefreshAttempts = 3;
  private refreshAttempts = 0;

  /**
   * Get singleton instance of SecurityClient
   */
  public static getInstance(baseUrl: string): SecurityClient {
    if (!SecurityClient.instance) {
      SecurityClient.instance = new SecurityClient(baseUrl);
    }
    return SecurityClient.instance;
  }

  /**
   * Create a new SecurityClient
   */
  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
    console.log('[SecurityClient] Created with base URL:', this.baseUrl);
    
    // Create API instance
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Add request interceptor for authentication
    this.api.interceptors.request.use(
      (config) => this.addAuthHeader(config),
      (error) => Promise.reject(error)
    );
    
    // Add response interceptor for token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Only try to refresh token for 401 errors on authenticated requests
        const originalRequest = error.config;
        
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !this.isAuthEndpoint(originalRequest.url) &&
          this.refreshAttempts < this.maxRefreshAttempts
        ) {
          originalRequest._retry = true;
          this.refreshAttempts++;
          
          try {
            const token = await this.refreshToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            console.error('[SecurityClient] Token refresh failed:', refreshError);
            // Clear tokens on definitive refresh failure
            this.clearTokens();
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if URL is an authentication endpoint
   */
  private isAuthEndpoint(url: string): boolean {
    const authPaths = ['/auth/', '/login', '/register', '/public-key', '/refresh-token'];
    return authPaths.some(path => url.includes(path));
  }

  /**
   * Add authentication header to request if token exists
   */
  private async addAuthHeader(config: AxiosRequestConfig): Promise<any> {
    // Skip for auth endpoints
    if (this.isAuthEndpoint(config.url || '')) {
      return config;
    }

    const tokens = this.getTokens();
    if (tokens?.accessToken) {
      return {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      };
    }
    
    return config;
  }

  /**
   * Get stored tokens
   */
  private getTokens(): AuthTokens | null {
    const tokensJson = localStorage.getItem(this.tokenKey);
    if (!tokensJson) return null;
    
    try {
      return JSON.parse(tokensJson);
    } catch (e) {
      console.error('[SecurityClient] Failed to parse stored tokens');
      return null;
    }
  }

  /**
   * Store tokens securely
   */
  private storeTokens(tokens: AuthTokens): void {
    localStorage.setItem(this.tokenKey, JSON.stringify(tokens));
  }

  /**
   * Clear stored tokens
   */
  private clearTokens(): void {
    localStorage.removeItem(this.tokenKey);
    this.refreshAttempts = 0;
  }

  /**
   * Get the current access token
   */
  public getAccessToken(): string | null {
    return this.getTokens()?.accessToken || null;
  }

  /**
   * Login with credentials
   */
  public async login(email: string, password: string): Promise<void> {
    try {
      const response = await axios.post<LoginResponse>(
        `${this.baseUrl}/securityManager/login`,
        { email, password }
      );
      
      if (!response.data?.accessToken) {
        throw new Error('Invalid response: No access token received');
      }
      
      this.storeTokens({
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      });
      
      this.refreshAttempts = 0;
    } catch (error) {
      console.error('[SecurityClient] Login failed:', error);
      throw error;
    }
  }

  /**
   * Register a new user
   */
  public async register(registerData: RegisterData): Promise<RegisterResponse> {
    try {
      console.log('[SecurityClient] Registering new user:', registerData.email);
      
      const response = await axios.post<RegisterResponse>(
        `${this.baseUrl}/securityManager/register`,
        registerData
      );
      
      // If registration returns tokens, store them
      if (response.data?.accessToken && response.data?.refreshToken) {
        this.storeTokens({
          accessToken: response.data.accessToken,
          refreshToken: response.data.refreshToken,
        });
        this.refreshAttempts = 0;
      }
      
      return response.data;
    } catch (error) {
      console.error('[SecurityClient] Registration failed:', error);
      
      // Provide a standardized error response
      if (axios.isAxiosError(error) && error.response?.data) {
        return {
          success: false,
          message: error.response.data.message || 'Registration failed',
        };
      }
      
      throw error;
    }
  }

  /**
   * Logout and clear tokens
   */
  public async logout(): Promise<void> {
    const tokens = this.getTokens();
    if (tokens) {
      try {
        await this.api.post(`${this.baseUrl}/securityManager/logout`, {}, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` }
        });
      } catch (error) {
        console.warn('[SecurityClient] Logout request failed, clearing tokens anyway');
      }
    }
    
    this.clearTokens();
  }

  /**
   * Refresh the access token using the refresh token
   * Uses a promise cache to prevent multiple simultaneous refresh attempts
   */
  public async refreshToken(): Promise<string | null> {
    // Use cached refresh promise if one is in progress
    if (this.refreshInProgress) {
      return await this.refreshInProgress;
    }
    
    const tokens = this.getTokens();
    if (!tokens?.refreshToken) {
      console.warn('[SecurityClient] No refresh token available');
      return null;
    }
    
    // Create a new refresh promise
    this.refreshInProgress = this.doRefreshToken(tokens.refreshToken);
    
    try {
      const newToken = await this.refreshInProgress;
      return newToken;
    } finally {
      // Clear the promise when done
      this.refreshInProgress = null;
    }
  }

  /**
   * Perform the actual token refresh
   */
  private async doRefreshToken(refreshToken: string): Promise<string | null> {
    try {
      console.log('[SecurityClient] Refreshing access token');
      
      // Use a direct axios call to avoid interceptors
      const response = await axios.post(
        `${this.baseUrl}/securityManager/auth/refresh-token`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      if (!response.data?.accessToken) {
        throw new Error('Invalid response: No access token received');
      }
      
      // Update stored tokens
      this.storeTokens({
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken || refreshToken, // Use old refresh token if not provided
      });
      
      console.log('[SecurityClient] Token refresh successful');
      return response.data.accessToken;
    } catch (error) {
      console.error('[SecurityClient] Token refresh failed:', error);
      
      // Only clear tokens on specific errors (401, 403)
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.log('[SecurityClient] Unauthorized error during token refresh, clearing tokens');
        this.clearTokens();
      }
      
      return null;
    }
  }

  /**
   * Initialize client with default credentials if no valid token exists
   */
  public async initializeWithDefaultCredentials(): Promise<boolean> {
    // First check if we already have valid tokens
    const tokens = this.getTokens();
    if (tokens?.accessToken) {
      try {
        // Validate the token
        await this.api.post('/securityManager/verify', {}, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` }
        });
        console.log('[SecurityClient] Existing token is valid');
        return true;
      } catch (error) {
        // Token validation failed, try to refresh
        if (tokens.refreshToken) {
          try {
            const newToken = await this.refreshToken();
            if (newToken) {
              return true;
            }
          } catch (refreshError) {
            console.log('[SecurityClient] Token refresh failed, will try default login');
          }
        }
      }
    }
    
    // Try default credentials as last resort
    try {
      await this.login('admin@example.com', 'password');
      return true;
    } catch (error) {
      console.warn('[SecurityClient] Default login failed');
      return false;
    }
  }

  /**
   * Get authorization header for external use
   */
  public getAuthHeader(): { Authorization?: string } {
    const token = this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Check if user is currently authenticated
   */
  public isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Get the underlying API instance
   */
  public getApi(): AxiosInstance {
    return this.api;
  }
}