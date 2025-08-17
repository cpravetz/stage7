import { BaseService } from './baseService';

export class CloudflareWorkersAIService extends BaseService {
    constructor() {
        super(
            'cloudflare-workers-ai',
            process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN || '',
            process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID ? `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID}/ai/run` : '',
            ['cloudflare-workers-ai']
        );
    }

    isAvailable(): boolean {
        return !!this.apiKey && !!this.apiUrl;
    }
}

export default new CloudflareWorkersAIService();
