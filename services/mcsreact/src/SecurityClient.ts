import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

interface RetryableRequest extends AxiosRequestConfig {
    _retry?: boolean;
}

/**
 * Create an authenticated axios instance for the frontend
 * @param getToken Function to get the current token
 * @returns Authenticated axios instance
 */
function createClientAuthenticatedAxios(
    getToken: () => string | null,
    baseURL: string
): AxiosInstance {
    // Create axios instance
    const api = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });

    // Add authentication interceptor
    api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
        try {
            // Skip authentication for health check endpoints
            const url = new URL(config.url || '', config.baseURL || 'http://localhost');
            const path = url.pathname;
            if (path.includes('/health') || path.includes('/healthy') || path.includes('/ready') || path.includes('/status')) {
                return config;
            }

            // Skip authentication for security manager authentication endpoints
            if (path.includes('/auth/') || path.includes('/login') || path.includes('/register') ||
                path.includes('/public-key') || path.includes('/refresh-token')) {
                return config;
            }

            // Get token
            const token = getToken();
            if (token) {
                // Set Authorization header
                config.headers.set('Authorization', `Bearer ${token}`);
            }

            return config;
        } catch (error) {
            console.error('Error adding auth header to request:', error);
            // Continue with the request even if authentication fails
            return config;
        }
    });

    return api;
}

export class SecurityClient {
    private postOfficeUrl: string;
    private api: AxiosInstance;
    private refreshTokenTimeout: NodeJS.Timeout | null = null;
    private static instance: SecurityClient | null = null;

    // Singleton pattern to ensure we only have one instance
    public static getInstance(postOfficeUrl: string = API_BASE_URL): SecurityClient {
        if (!SecurityClient.instance) {
            SecurityClient.instance = new SecurityClient(postOfficeUrl);
        }
        return SecurityClient.instance;
    }

    constructor(postOfficeUrl: string = API_BASE_URL) {
        this.postOfficeUrl = postOfficeUrl.startsWith('http://') || postOfficeUrl.startsWith('https://') ? postOfficeUrl : `http://${postOfficeUrl}`;
        console.log('[SecurityClient] Created with PostOffice URL: ', this.postOfficeUrl);

        // Create an authenticated API instance
        this.api = createClientAuthenticatedAxios(() => this.getAccessToken(), this.postOfficeUrl);

        this.api.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (!error.response) {
                    console.error('[SecurityClient] Network error:', error.message);
                    return Promise.reject(error);
                }

                const originalRequest = error.config;
                if (error.response.status === 401 && !originalRequest._retry) {
                    console.log('[SecurityClient] Received 401 error, attempting to refresh token');
                    originalRequest._retry = true;
                    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
                    if (refreshToken) {
                        try {
                            console.log('[SecurityClient] Refresh token found, attempting to refresh');
                            // Use the refreshAccessToken method which now uses a direct axios instance
                            const accessToken = await this.refreshAccessToken();
                            if (accessToken) {
                                console.log('[SecurityClient] Token refreshed successfully');
                                return this.api(originalRequest);
                            } else {
                                console.error('[SecurityClient] Failed to get a new access token');
                                // Try to initialize with default credentials
                                try {
                                    await this.initializeWithDefaultCredentials();
                                    if (this.getAccessToken()) {
                                        console.log('[SecurityClient] Successfully initialized with default credentials');
                                        return this.api(originalRequest);
                                    }
                                } catch (initError) {
                                    console.error('[SecurityClient] Failed to initialize with default credentials:', initError);
                                }
                                // Refresh token is invalid, logout the user
                                this.logout();
                                return Promise.reject(new Error('Failed to refresh token'));
                            }
                        } catch (refreshError) {
                            console.error('[SecurityClient] Failed to refresh token:', refreshError);
                            // Try to initialize with default credentials
                            try {
                                await this.initializeWithDefaultCredentials();
                                if (this.getAccessToken()) {
                                    console.log('[SecurityClient] Successfully initialized with default credentials');
                                    return this.api(originalRequest);
                                }
                            } catch (initError) {
                                console.error('[SecurityClient] Failed to initialize with default credentials:', initError);
                            }
                            // Refresh token is invalid, logout the user
                            this.logout();
                            return Promise.reject(refreshError);
                        }
                    } else {
                        console.log('[SecurityClient] No refresh token found');
                        // Try to initialize with default credentials if available
                        try {
                            await this.initializeWithDefaultCredentials();
                            if (this.getAccessToken()) {
                                // If we got a token, retry the request
                                return this.api(originalRequest);
                            }
                        } catch (initError) {
                            console.error('[SecurityClient] Failed to initialize with default credentials:', initError);
                        }
                    }
                }
                return Promise.reject(error);
            }
        );

        // Try to initialize with default credentials when created
        this.initializeWithDefaultCredentials().catch(error => {
            console.warn('[SecurityClient] Could not initialize with default credentials:', error);
        });
    }

    /**
     * Initialize the security client with default credentials if available
     * This allows automatic authentication without user interaction
     */
    public async initializeWithDefaultCredentials(): Promise<boolean> {
        console.log('[SecurityClient] Attempting to initialize with default credentials');

        // First check if we already have a valid token
        const existingToken = this.getAccessToken();
        if (existingToken) {
            console.log('[SecurityClient] Found existing token, validating...');
            try {
                // Validate the token using the SecurityManager's verify endpoint
                await this.api.post(`${this.postOfficeUrl}/securityManager/verify`, {}, {
                    headers: {
                        'Authorization': `Bearer ${existingToken}`
                    }
                });
                console.log('[SecurityClient] Existing token is valid');
                return true;
            } catch (error) {
                console.log('[SecurityClient] Existing token is invalid, will try to refresh or login');
                // Token is invalid, try to refresh it
                const refreshToken = this.getRefreshToken();
                if (refreshToken) {
                    try {
                        await this.refreshAccessToken();
                        return true;
                    } catch (refreshError) {
                        console.log('[SecurityClient] Failed to refresh token, will try default login');
                    }
                }
            }
        }

        // Try to login with default credentials
        try {
            // Default credentials - in a real app, these might come from environment variables
            // or a secure configuration store
            const defaultEmail = 'admin@example.com';
            const defaultPassword = 'password';

            await this.login(defaultEmail, defaultPassword);
            console.log('[SecurityClient] Successfully logged in with default credentials');
            return true;
        } catch (loginError) {
            console.error('[SecurityClient] Failed to login with default credentials:', loginError);
            return false;
        }
    }

    public getAccessToken(): string | null {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    }

    async login(email: string, password: string): Promise<void> {
        console.log('Logging in user:', email);
        try {
            const response = await this.api.post(`${this.postOfficeUrl}/securityManager/login`,
                { email, password },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Login response:', response.data);

            // Check if we have a valid response
            if (!response.data) {
                console.error('Empty response from server');
                throw new Error('Authentication failed: Empty response from server');
            }

            // Extract tokens from response
            // The security manager returns accessToken and refreshToken
            const { accessToken, refreshToken, token, user } = response.data;

            // Handle different response formats
            const actualToken = accessToken || token;
            const actualRefreshToken = refreshToken || '';

            if (!actualToken) {
                console.error('No access token received from server');
                throw new Error('Authentication failed: No access token received');
            }

            // Store tokens
            this.storeTokens(actualToken, actualRefreshToken);

            // Set the Authorization header for future requests
            this.api.defaults.headers.common['Authorization'] = `Bearer ${actualToken}`;

            // Log token details for debugging
            try {
                const tokenParts = actualToken.split('.');
                if (tokenParts.length === 3) {
                    const payload = JSON.parse(atob(tokenParts[1]));
                    console.log('Token payload:', payload);
                    console.log('Token expiry:', new Date(payload.exp * 1000).toISOString());
                }
            } catch (e) {
                console.error('Error parsing token:', e);
            }

            console.log('Login successful:', user);
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async logout(): Promise<void> {
        await this.api.post(`${this.postOfficeUrl}/securityManager/logout`);
        this.clearTokens();
        delete this.api.defaults.headers.common['Authorization'];
        if (this.refreshTokenTimeout) {
            clearTimeout(this.refreshTokenTimeout);
        }
    }

    private setupRefreshTokenTimer() {
        if (this.refreshTokenTimeout) {
            clearTimeout(this.refreshTokenTimeout);
        }
        this.refreshTokenTimeout = setTimeout(() => this.refreshToken(), 50 * 60 * 1000); // Refresh 10 minutes before expiry
    }

    private async refreshToken() {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
            try {
                const response = await this.api.post(`${this.postOfficeUrl}/securityManager/auth/refresh-token`, { refreshToken });
                const { accessToken } = response.data;
                localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
                this.api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                this.setupRefreshTokenTimer();
            } catch (error) {
                // If refresh fails, logout the user
                this.logout();
            }
        }
    }

    async register(name: string, email: string, password: string): Promise<void> {
        try {
            console.log('[SecurityClient] Registering user:', email);
            const response = await this.api.post(`${this.postOfficeUrl}/securityManager/register`, { name, email, password });

            console.log('[SecurityClient] Registration response:', response.data);

            // Check if we have a valid response
            if (!response.data) {
                console.error('[SecurityClient] Empty response from server');
                throw new Error('Registration failed: Empty response from server');
            }

            // Extract tokens from response
            // The security manager returns accessToken and refreshToken
            const { accessToken, refreshToken, token, user } = response.data;

            // Handle different response formats
            const actualToken = accessToken || token;
            const actualRefreshToken = refreshToken || '';

            if (!actualToken) {
                console.error('[SecurityClient] No access token received from server');
                throw new Error('Registration failed: No access token received');
            }

            // Store tokens
            this.storeTokens(actualToken, actualRefreshToken);

            console.log('[SecurityClient] Registration successful:', user);
        } catch (error) {
            console.error('[SecurityClient] Registration error:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    async refreshAccessToken(): Promise<string | null> {
        try {
            console.log('[SecurityClient] Attempting to refresh access token');
            const refreshToken = this.getRefreshToken();
            if (!refreshToken) {
                console.error('[SecurityClient] No refresh token available');
                throw new Error('No refresh token available');
            }

            // All requests should go through the PostOffice service
            console.log('[SecurityClient] Refresh token found, sending refresh request to:', `${this.postOfficeUrl}/securityManager/auth/refresh-token`);

            // Create a direct axios instance without authentication for token refresh
            // This avoids circular dependency where we need a token to refresh a token
            const directAxios = axios.create({
                baseURL: this.postOfficeUrl,
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            // Make the token refresh request directly without authentication
            const response = await directAxios.post(`/securityManager/auth/refresh-token`, { refreshToken });
            console.log('[SecurityClient] Refresh token response received:', response.status);

            if (response.data && response.data.accessToken) {
                console.log('[SecurityClient] New access token received');
                this.storeTokens(response.data.accessToken, refreshToken);
                return response.data.accessToken;
            } else if (response.data && response.data.token) {
                console.log('[SecurityClient] New token received (legacy format)');
                this.storeTokens(response.data.token, response.data.refreshToken || refreshToken);
                return response.data.token;
            } else {
                console.error('[SecurityClient] Invalid response format:', response.data);
                throw new Error('Invalid response format from refresh token endpoint');
            }
        } catch (error) {
            console.error('[SecurityClient] Failed to refresh token:', error);

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    console.error('[SecurityClient] Response status:', error.response.status);
                    console.error('[SecurityClient] Response data:', error.response.data);
                } else if (error.request) {
                    console.error('[SecurityClient] No response received from server');
                } else {
                    console.error('[SecurityClient] Error setting up request:', error.message);
                }
            }

            // Only remove tokens if it's an authentication error (401)
            if (axios.isAxiosError(error) && error.response && error.response.status === 401) {
                this.clearTokens();
            }

            return null;
        }
    }

    getAuthHeader(): { Authorization?: string } {
        const token = this.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    private getRefreshToken(): string | null {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    private storeTokens(accessToken: string, refreshToken: string): void {
        console.log('[SecurityClient] Storing tokens in localStorage');
        if (!accessToken) {
            console.error('[SecurityClient] Attempted to store empty access token');
            return;
        }

        // Store tokens in localStorage
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        if (refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        }

        // Update the Authorization header for future requests
        this.api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        // Log the header for debugging
        console.log('[SecurityClient] Set Authorization header:', `Bearer ${accessToken.substring(0, 10)}...`);

        console.log('[SecurityClient] Tokens stored successfully');

        // Log token details for debugging (without revealing the full token)
        try {
            const tokenParts = accessToken.split('.');
            if (tokenParts.length === 3) {
                // Use atob for browser compatibility
                const payload = JSON.parse(atob(tokenParts[1]));
                console.log('[SecurityClient] Token payload:', payload);
                console.log('[SecurityClient] Token expiry:', payload.exp ? new Date(payload.exp * 1000).toISOString() : 'No expiry');
                console.log('[SecurityClient] Token issued at:', payload.iat ? new Date(payload.iat * 1000).toISOString() : 'No issue time');
            }
        } catch (parseError) {
            console.error('[SecurityClient] Error parsing token:', parseError);
        }
    }

    private clearTokens(): void {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    /**
     * Verify email with token
     * @param token Verification token
     * @returns Promise<void>
     */
    async verifyEmail(token: string): Promise<void> {
        try {
            await this.api.post(`${this.postOfficeUrl}/securityManager/verify-email`, { token });
        } catch (error) {
            console.error('Email verification error:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    /**
     * Request password reset
     * @param email User email
     * @returns Promise<void>
     */
    async requestPasswordReset(email: string): Promise<void> {
        try {
            await this.api.post(`${this.postOfficeUrl}/securityManager/request-password-reset`, { email });
        } catch (error) {
            console.error('Password reset request error:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    /**
     * Reset password with token
     * @param token Reset token
     * @param newPassword New password
     * @returns Promise<void>
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
        try {
            await this.api.post(`${this.postOfficeUrl}/securityManager/reset-password`, { token, newPassword });
        } catch (error) {
            console.error('Password reset error:', error instanceof Error ? error.message : error);
            throw error;
        }
    }
}