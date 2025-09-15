import { BaseService } from './baseService';

export class GroqService extends BaseService {
    private ready: boolean = true;
    private rateLimitResetTime: number | null = null; // Timestamp when service becomes available again

    constructor() {
        // Use the API key from the environment variable
        const apiKey = process.env.GROQ_API_KEY || '';

        super(
            'groq',
            apiKey,
            process.env.GROQ_URL || 'https://api.groq.com/openai/v1',
            ['groq']
        );
        console.log(`Groq Service created, ApiKey starts ${this.apiKey.substring(0,6)}`);
        // Log the API key status for debugging (without revealing the actual key)
        if (this.apiKey && this.apiKey.length > 0 && this.apiKey !== "''" && this.apiKey !== '""') {
            console.log(`GroqService initialized with API key: Set (length: ${this.apiKey.length})`);
        } else {
            console.error('WARNING: GROQ_API_KEY environment variable is not set or is empty!');
            console.error('Please ensure the .env file is properly loaded and contains a valid GROQ_API_KEY');
        }
    }

    /**
     * Call this method when a 429 rate limit error is caught from Groq.
     * It will parse the error message and set the cooldown accordingly.
     */
    handleRateLimitError(error: any) {
        if (!error || !error.message) return;
        const match = error.message.match(/Please try again in ([0-9]+)m([0-9.]+)s/);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseFloat(match[2]);
            const now = Date.now();
            const cooldownMs = (minutes * 60 + seconds) * 1000;
            this.rateLimitResetTime = now + cooldownMs;
            this.ready = false;
            console.warn(`GroqService rate limited. Will be available again in ${minutes}m${seconds}s (at ${new Date(this.rateLimitResetTime).toISOString()})`);
        } else {
            // If we can't parse, fallback to a default cooldown (e.g., 1 minute)
            this.rateLimitResetTime = Date.now() + 60 * 1000;
            this.ready = false;
            console.warn('GroqService rate limited. Could not parse retry time, defaulting to 1 minute cooldown.');
        }
    }

    isAvailable(): boolean {
        // If rate limited, check if cooldown has expired
        if (this.rateLimitResetTime) {
            if (Date.now() >= this.rateLimitResetTime) {
                this.rateLimitResetTime = null;
                this.ready = true;
            } else {
                console.warn(`GroqService is rate limited until ${new Date(this.rateLimitResetTime).toISOString()}`);
                return false;
            }
        }
        // Check if API key is valid (not empty and not just quotes)
        const hasValidKey = !!(this.apiKey && this.apiKey !== "''" && this.apiKey !== '""');
        const available = this.ready && hasValidKey;

        //console.log(`GroqService availability check: ${available ? 'Available' : 'Not available'}`);
        console.log(`GroqService ready state: ${this.ready ? 'Ready' : 'Not ready'}`);

        if (!available) {
            console.error('GroqService is not available. Check GROQ_API_KEY environment variable in .env file.');
            console.error('Make sure the .env file is properly loaded and contains a valid GROQ_API_KEY');
        } else {
            console.log('GroqService is available and ready to use.');
        }

        return available;
    }
}

const groqService = new GroqService();
export default groqService;
