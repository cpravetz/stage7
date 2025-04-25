import { BaseService } from './baseService';

export class GroqService extends BaseService {
    private ready: boolean = true;

    constructor() {
        // Use the API key from the environment variable
        const apiKey = process.env.GROQ_API_KEY || '';

        super(
            'groq',
            apiKey,
            process.env.GROQ_URL || 'https://api.groq.com/openai/v1',
            ['groq']
        );
        console.log(`Groq Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
        // Log the API key status for debugging (without revealing the actual key)
        if (this.apiKey && this.apiKey.length > 0 && this.apiKey !== "''" && this.apiKey !== '""') {
            console.log(`GroqService initialized with API key: Set (length: ${this.apiKey.length})`);
        } else {
            console.error('WARNING: GROQ_API_KEY environment variable is not set or is empty!');
            console.error('Please ensure the .env file is properly loaded and contains a valid GROQ_API_KEY');
        }
    }

    isAvailable(): boolean {
        // Check if API key is valid (not empty and not just quotes)
        const hasValidKey = !!(this.apiKey && this.apiKey !== "''" && this.apiKey !== '""');
        const available = this.ready && hasValidKey;

        console.log(`GroqService availability check: ${available ? 'Available' : 'Not available'}`);

        // Log API key status without revealing the actual key
        if (hasValidKey) {
            console.log(`GroqService API key: Set (length: ${this.apiKey.length})`);
        } else {
            console.log(`GroqService API key: ${this.apiKey === "''" || this.apiKey === '""' ? 'Empty quotes' : 'Not set'}`);
        }

        console.log(`GroqService API URL: ${this.apiUrl || 'Not set'}`);
        console.log(`GroqService ready state: ${this.ready ? 'Ready' : 'Not ready'}`);

        if (!available) {
            console.error('GroqService is not available. Check GROQ_API_KEY environment variable in .env file.');
            console.error('Make sure the .env file is properly loaded and contains a valid GROQ_API_KEY');
        } else {
            console.log('GroqService is available and ready to use.');
        }

        return available;
    }
}

const groqService = new GroqService();
export default groqService;
