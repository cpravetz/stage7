import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

const AUTH_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

interface RetryableRequest extends AxiosRequestConfig {
    _retry?: boolean;
}

export class SecurityClient {
    private postOfficeUrl: string;
    private api: AxiosInstance;

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
            async (error: AxiosError) => {
                const originalRequest = error.config as RetryableRequest;
                if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
                    originalRequest._retry = true;
                    const newToken = await this.refreshAccessToken();
                    if (newToken && originalRequest.headers) {
                        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                        return this.api(originalRequest);
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
        const response = await this.api.post('/securityManager/login', { email, password });
        this.storeTokens(response.data.token, response.data.refreshToken);
    }

    async logout(): Promise<void> {
        try {
            await this.api.post(`/securityManager/logout`, {}, { headers: this.getAuthHeader() });
            this.clearTokens();
        } catch (error) {
            console.error('Logout failed:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    async register(name: string, email: string, password: string): Promise<void> {
        try {
            const response = await this.api.post('/securityManager/register', { name, email, password });
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

            const response = await this.api.post('/securityManager/refreshToken', { refreshToken });
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