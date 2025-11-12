import { BaseService } from './baseService';


export class ORService extends BaseService {
    constructor() {
        super('ORService', process.env.OPENROUTER_API_KEY || '', 'https://openrouter.ai/api/v1/', ['openrouter']);
        console.log(`OpenRouter Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }
}

export const orService = new ORService();
export default orService;