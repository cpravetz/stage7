import { BaseService } from './baseService';

export class AntService extends BaseService {
    constructor() {
        super('AntService', process.env.ANTHROPIC_API_KEY || '',
                            process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages', ['anthropic']);
        console.log(`Anthropic Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }
}

export const antService = new AntService();
export default antService;