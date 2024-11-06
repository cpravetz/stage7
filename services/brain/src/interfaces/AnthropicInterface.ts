import axios, { AxiosError } from 'axios';
import { ModelInterface } from './ModelInterface';
import OpenAI from 'openai';

export class AnthropicInterface extends ModelInterface {
    name = 'Anthropic';
    private apiUrl: string = 'https://api.anthropic.com/v1/messages';
    private ApiClient: OpenAI;
    private apiKey: string;
    
    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey;
        this.ApiClient = new OpenAI({ apiKey });
    }

    async generate(messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number, model?: string }): Promise<string> {
        // Convert string messages to the new messages format
        const formattedMessages = messages.map((msg, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: msg
        }));

        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    model: options?.model || 'claude-3-haiku-20240307',
                    max_tokens: options?.max_length || 2000,
                    temperature: options?.temperature ?? 0.7,
                    messages: formattedMessages
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'X-API-Key': this.apiKey,
                    },
                    // Add retry and timeout configurations
                    timeout: 30000, // 30 seconds timeout
                }
            );

            // Return the content of the first message in the response
            return response.data.content[0].text;
        } catch (error) {
            // Detailed error handling
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                
                // Handle specific error scenarios
                if (axiosError.response) {
                    // The request was made and the server responded with a status code
                    switch (axiosError.response.status) {
                        case 429: // Rate limit exceeded
                            throw new Error('Anthropic API rate limit reached. Please try again later.');
                        
                        case 401: // Unauthorized
                            throw new Error('Invalid Anthropic API key. Please check your credentials.');
                        
                        case 500: // Server error
                            throw new Error('Anthropic API encountered an internal server error.');
                        
                        default:
                            throw new Error(`Anthropic API error: ${JSON.stringify(axiosError.response.statusText)}`);
                    }
                } else if (axiosError.request) {
                    // The request was made but no response was received
                    throw new Error('No response received from Anthropic API. Check your network connection.');
                }
            }
            
            // Generic error handling
            console.error('Error generating response from Anthropic:', error);
            throw new Error('Failed to generate response from Anthropic');
        }
    }

    // Optional: Add a method to handle retries with exponential backoff
    private async retryRequest(
        fn: () => Promise<any>, 
        maxRetries = 3, 
        baseDelay = 1000
    ): Promise<any> {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                return await fn();
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 429) {
                    const delay = baseDelay * Math.pow(2, retries);
                    console.warn(`Rate limited. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries++;
                } else {
                    throw error;
                }
            }
        }
        throw new Error('Max retries exceeded');
    }
}

const aiInterface = new AnthropicInterface(process.env.ANTHROPIC_API_KEY || '');
export default aiInterface;