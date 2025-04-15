import { BaseService } from './baseService';

export class OWService extends BaseService {
    // Add baseUrl property to match the interface usage
    public baseUrl: string;

    constructor() {
        // Initialize with environment variables
        super(
            'OWService',
            process.env.OPENWEBUI_API_KEY || '',
            process.env.OPENWEB_URL || 'https://openwebuicom',
            ['openwebui']
        );

        // Set baseUrl from apiUrl
        this.baseUrl = this.apiUrl;

        // Log service configuration
        console.log(`OWService initialized with URL: ${this.baseUrl}`);
        console.log(`OWService API key available: ${this.apiKey ? 'Yes' : 'No'}`);
    }

    isAvailable(): boolean {
        const available = super.isAvailable();
        if (!available) {
            console.log('OWService is not available. Check OPENWEBUI_API_KEY and OPENWEB_URL environment variables.');
        }
        return available;
    }
}

export const owService = new OWService();
export default owService;