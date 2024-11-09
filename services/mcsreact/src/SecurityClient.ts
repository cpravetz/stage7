import axios, { AxiosInstance } from 'axios';


export class SecurityClient {
    private postOfficeUrl: string;
    private token: string | null = null;
    private api: AxiosInstance;
    private refreshToken: string | null = null;
    
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
                    const newToken = await this.refreshAccessToken();
                    if (newToken) {
                        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                        return this.api(originalRequest);
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    async sendHeartbeat(guid: string, token: string): Promise<void> {
        await axios.post(`${this.postOfficeUrl}/component/heartbeat`, {
            guid,
            token
        });
    }

    async login(email: string, password: string): Promise<string> {
        const response = await this.api.post('/securityManager/login', {
            email,
            password
        });
        this.token = response.data.token;
        this.refreshToken = response.data.refreshToken;
        localStorage.setItem('authToken', this.token || '');
        localStorage.setItem('refreshToken', this.refreshToken || '');
        return this.token || '';
    }

    async logout(): Promise<void> {
        try {
          await axios.post(`${this.postOfficeUrl}/securityManager/logout`, {}, {
            headers: this.getAuthHeader()
          });
          this.token = null;
        } catch (error) {
          console.error('Logout failed:', error instanceof Error ? error.message : error);
          throw error;
        }
      }

    getAuthHeader() {
        return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    }

    async register(name: string, email: string, password: string): Promise<string> {    
        try {
            const response = await axios.post(
                `${this.postOfficeUrl}/securityManager/register`,
                { name, email, password }
            );
            
            this.token = response.data.token;
            return this.token || '';
        } catch (error) { 
            console.error('Registration error:', error instanceof Error ? error.message : error);
            throw error;
        }
    }
    
    async refreshAccessToken(): Promise<string | null> {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }
    
            const response = await this.api.post('/securityManager/refreshToken', { refreshToken });
            const newToken = response.data.token;
            const newRefreshToken = response.data.refreshToken;
    
            localStorage.setItem('authToken', newToken);
            localStorage.setItem('refreshToken', newRefreshToken);
    
            return newToken;
        } catch (error) {
            console.error('Failed to refresh token:', error);
            return null;
        }
    }

}

