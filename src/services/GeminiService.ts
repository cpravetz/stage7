import { BaseService } from './baseService';
import { GeminiInterface } from '../interfaces/GeminiInterface';

export class GeminiService extends BaseService {
    serviceName = 'gemini';
    apiKey = process.env.GEMINI_API_KEY || '';
    apiUrl = 'https://generativelanguage.googleapis.com/v1beta';
    interface = new GeminiInterface();

    constructor() {
        super();
        this.isReady = true;
    }

    isAvailable(): boolean {
        return this.isReady && !!this.apiKey;
    }
}
