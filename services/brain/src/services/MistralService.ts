import { BaseService } from './baseService';

export class MistralService extends BaseService {
    constructor() {
        super('MistralService',
              process.env.MISTRAL_API_KEY || '',
              'https://api.mistral.ai/v1',
              ['mistral']);
        console.log(`Mistral Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }

    isAvailable(): boolean {
        const available = !!this.apiKey && this.apiKey.length > 0;
        //console.log(`MistralService availability check: ${available ? 'Available' : 'Not available'}`);
        if (!available) {
            console.error('MistralService is not available. Check MISTRAL_API_KEY environment variable.');
        } else {
            console.log('MistralService is available and ready to use.');
        }

        return available;
    }
}

export const mistralService = new MistralService();
export default mistralService;