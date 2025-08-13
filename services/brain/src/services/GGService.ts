import { BaseService } from './baseService';


export class GGService extends BaseService {
    constructor() {
        super('GGService', process.env.GEMINI_API_KEY || '', process.env.GEMINI_API_URL || '', ['gemini']);
        console.log(`GG Gemini Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }
}

export const ggService = new GGService();
export default ggService;