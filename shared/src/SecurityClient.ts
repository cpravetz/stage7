import axios from 'axios';

export class SecurityClient {
    private postOfficeUrl: string;
    private token: string | null = null;
    
    constructor(postOfficeUrl: string) {
        this.postOfficeUrl = postOfficeUrl.startsWith('http://') ? postOfficeUrl : `http://${postOfficeUrl}`;
        console.log('Created SecurityClient with PostOffice URL: ', this.postOfficeUrl);
    }

    async sendHeartbeat(guid: string, token: string): Promise<void> {
        await axios.post(`http://${this.postOfficeUrl}/component/heartbeat`, {
            guid,
            token
        });
    }

    async login(email: string, password: string): Promise<string> {
        const response = await axios.post(`http://${this.postOfficeUrl}/login`, {
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
        const response = await axios.post(`http://${this.postOfficeUrl}/register`, {
            name,
            email,
            password
        });
        this.token = response.data.token;
        return this.token || '';
    }
}

