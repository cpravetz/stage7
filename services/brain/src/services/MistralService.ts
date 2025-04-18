import { BaseService } from './baseService';

export class MistralService extends BaseService {
    constructor() {
        super('MistralService', 
              process.env.MISTRAL_API_KEY || '', 
              'https://api.mistral.ai/v1', 
              ['mistral']);
    }

    isAvailable(): boolean {
        return !!this.apiKey && this.apiKey.length > 0;
    }
}

export const mistralService = new MistralService();
export default mistralService;