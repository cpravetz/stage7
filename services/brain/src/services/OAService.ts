import { BaseService } from './baseService';


export class OAService extends BaseService {
    constructor() {
        super('OAService', process.env.OPENAI_API_KEY || '', 'https://api.openai.com/v1/', ['openai']);
        console.log(`OpenAI Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }
}

export const oaService = new OAService();
export default oaService;