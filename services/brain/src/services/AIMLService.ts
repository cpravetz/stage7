import { BaseService } from './baseService';


export class AIMLService extends BaseService {
    constructor() {
        super('AIMLService', process.env.AIML_API_KEY || '', 'https://api.aimlapi.com/v1/', ['openai']);
        console.log(`AI/ML Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }
}

export const aimlService = new AIMLService();
export default aimlService;