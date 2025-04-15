import { BaseService } from './baseService';
import { GeminiInterface } from '../interfaces/GeminiInterface';

export class GeminiService extends BaseService {
    interface = new GeminiInterface();

    constructor() {
        super(
            'gemini',
            process.env.GEMINI_API_KEY || '',
            'https://generativelanguage.googleapis.com/v1',
            ['gemini']
        );
    }

    isAvailable(): boolean {
        return this.apiKey !== '';
    }
}

const geminiService = new GeminiService();
export default geminiService;
