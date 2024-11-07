import axios from 'axios';


export class SecurityClient {
    private postOfficeUrl: string;
    private token: string | null = null;
    
    constructor(postOfficeUrl: string) {
        this.postOfficeUrl = postOfficeUrl.startsWith('http://') ? postOfficeUrl : `http://${postOfficeUrl}`;
        console.log('Created SecurityClient with PostOffice URL: ', this.postOfficeUrl);
    }

    async sendHeartbeat(guid: string, token: string): Promise<void> {
        await axios.post(`${this.postOfficeUrl}/component/heartbeat`, {
            guid,
            token
        });
    }

    async login(email: string, password: string): Promise<string> {
        const response = await axios.post(`${this.postOfficeUrl}/securityManager/login`, {
            email,
            password
        });
        this.token = response.data.token;
        return this.token || '';
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
    
    async refreshToken(): Promise<string> {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const response = await axios.post(`${this.postOfficeUrl}/securityManager/refresh-token`, {
            refreshToken
        });
        
        this.token = response.data.token;
        localStorage.setItem('authToken', this.token ||'');
        localStorage.setItem('refreshToken', response.data.refreshToken);
        return this.token || '';
    }

}

