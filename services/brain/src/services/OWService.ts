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
        console.log(`Openweb Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);

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

        console.log(`OWService availability check:`);
        console.log(`  - apiKey: ${this.apiKey ? `"${this.apiKey.substring(0, 10)}..."` : 'undefined'}`);
        console.log(`  - apiUrl: ${this.apiUrl}`);
        console.log(`  - available: ${available}`);

        return available;
    }
}

export const owService = new OWService();
export default owService;