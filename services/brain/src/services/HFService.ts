import { BaseService } from './baseService';

export class HFService extends BaseService {
    constructor() {
        // Use the API key from environment variables or a default key for testing
        const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY || '';
        super('HFService', apiKey, process.env.HUGGINGFACE_API_URL || 'https://router.huggingface.co/hf-inference/models', ['huggingface']);
        console.log(`Huggingface Service created with API key: ${apiKey ? 'Set (length: ' + apiKey.length + ')' : 'Not set'}`);
    }

    // Check if the service is available based on whether an API key is provided
    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey.length > 0 && this.apiKey !== 'dummy-key';
    }
}

export const hfService = new HFService();
export default hfService;