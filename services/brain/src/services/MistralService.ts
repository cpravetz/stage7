import { BaseService } from './baseService';

export class MistralService extends BaseService {
    private ready: boolean = true;
    private rateLimitResetTime: number | null = null; // Timestamp when service becomes available again

    constructor() {
        super('MistralService',
              process.env.MISTRAL_API_KEY || '',
              'https://api.mistral.ai/v1',
              ['mistral']);
        console.log(`Mistral Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
    }

    /**
     * Call this method when a 429 rate limit error is caught from Mistral.
     * It will set a cooldown period for the service.
     */
    handleRateLimitError(error: any) {
        // Mistral doesn't provide specific retry times in error messages like Groq does
        // So we'll use a default cooldown period
        const cooldownMs = 60 * 1000; // 1 minute default cooldown
        this.rateLimitResetTime = Date.now() + cooldownMs;
        this.ready = false;
        console.warn(`MistralService rate limited. Will be available again in 1 minute (at ${new Date(this.rateLimitResetTime).toISOString()})`);
    }

    isAvailable(): boolean {
        // Check if rate limited first
        if (this.rateLimitResetTime) {
            if (Date.now() >= this.rateLimitResetTime) {
                this.rateLimitResetTime = null;
                this.ready = true;
            } else {
                return false;
            }
        }

        const available = !!this.apiKey && this.apiKey.length > 0 && this.ready;
        if (!available) {
            if (!this.apiKey || this.apiKey.length === 0) {
                console.error('MistralService is not available. Check MISTRAL_API_KEY environment variable.');
            } else if (!this.ready) {
                console.warn('MistralService is temporarily unavailable due to rate limiting.');
            }
        }

        return available;
    }
}

export const mistralService = new MistralService();
export default mistralService;