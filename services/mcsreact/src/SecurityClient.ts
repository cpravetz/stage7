import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

const AUTH_TOKEN_KEY = 'authToken';
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

interface RetryableRequest extends AxiosRequestConfig {
    _retry?: boolean;
}

export class SecurityClient {
    private postOfficeUrl: string;
    private api: AxiosInstance;
    private refreshTokenTimeout: NodeJS.Timeout | null = null;

    constructor(postOfficeUrl: string) {
        this.postOfficeUrl = postOfficeUrl.startsWith('http://') ? postOfficeUrl : `http://${postOfficeUrl}`;
        console.log('Created SecurityClient with PostOffice URL: ', this.postOfficeUrl);

        this.api = axios.create({
            baseURL: this.postOfficeUrl,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });

        this.api.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                if (error.response.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
                    if (refreshToken) {
                        try {
                            const response = await this.api.post(`${this.postOfficeUrl}/securityManager/refresh-token`, { refreshToken });
                            const { accessToken } = response.data;
                            localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
                            this.api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                            return this.api(originalRequest);
                        } catch (refreshError) {
                            // Refresh token is invalid, logout the user
                            this.logout();
                            return Promise.reject(refreshError);
                        }
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    public getAccessToken(): string | null {
        return localStorage.getItem(AUTH_TOKEN_KEY);
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
            const { token, user } = response.data;
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
            this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
                const response = await this.api.post(`${this.postOfficeUrl}/securityManager/refresh-token`, { refreshToken });
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
            const response = await this.api.post(`${this.postOfficeUrl}/securityManager/register`, { name, email, password });
            this.storeTokens(response.data.token, response.data.refreshToken);
        } catch (error) {
            console.error('Registration error:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    async refreshAccessToken(): Promise<string | null> {
        try {
            const refreshToken = this.getRefreshToken();
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }
            const response = await this.api.post(`${this.postOfficeUrl}/securityManager/refresh-token`, { refreshToken });
            this.storeTokens(response.data.token, response.data.refreshToken);
            return response.data.token;
        } catch (error) {
            console.error('Failed to refresh token:', error);
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
        localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }

    private clearTokens(): void {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
}