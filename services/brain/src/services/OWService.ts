import { BaseService } from './baseService';

export class OWService extends BaseService {
    // Add baseUrl property to match the interface usage
    public baseUrl: string;

    constructor() {
        // Initialize with environment variables
        super(
            'OWService',
            process.env.OPENWEBUI_API_KEY || 'default-key',
            process.env.OPENWEB_URL || 'https://knllm.dusdusdusd.com',
            ['openwebui']
        );

        // Set baseUrl from apiUrl
        this.baseUrl = this.apiUrl;

        // Log service configuration
        console.log(`OWService initialized with URL: ${this.baseUrl}`);
        console.log(`OWService API key: ${this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'Not available'}`);

        // Validate configuration
        if (!this.apiKey || this.apiKey === 'default-key') {
            console.error('WARNING: OWService API key is not properly set. Check OPENWEBUI_API_KEY environment variable.');
        }

        if (!this.apiUrl || this.apiUrl === 'https://knllm.dusdusdusd.com') {
            console.log('Using default OpenWebUI URL: https://knllm.dusdusdusd.com');
        }
    }

    isAvailable(): boolean {
        const available = !!this.apiKey && !!this.apiUrl && this.apiKey !== 'default-key';
        console.log(`OWService availability check: ${available ? 'Available' : 'Not available'}`);
        if (!available) {
            console.error('OWService is not available. Check OPENWEBUI_API_KEY and OPENWEB_URL environment variables.');
        }
        return available;
    }
}

export const owService = new OWService();
export default owService;