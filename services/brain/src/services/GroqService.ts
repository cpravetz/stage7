import { BaseService } from './baseService';

export class GroqService extends BaseService {
    private ready: boolean = true;

    constructor() {
        super(
            'groq',
            process.env.GROQ_API_KEY || '',
            process.env.GROQ_URL || 'https://api.groq.com/openai/v1',
            ['groq']
        );
    }

    isAvailable(): boolean {
        return this.ready && !!this.apiKey;
    }
}

const groqService = new GroqService();
export default groqService;
