import axios, { AxiosError } from 'axios';
import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';

export class AnthropicInterface extends BaseInterface {
    interfaceName = 'anthropic';
    
    constructor() {
        super();
        this.converters.set(LLMConversationType.TextToText, {
            conversationType: LLMConversationType.TextToText,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText,
        });
        this.converters.set(LLMConversationType.TextToCode, {
            conversationType: LLMConversationType.TextToCode,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToCode,
        });        
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, model?: string }): Promise<string> {
        const max_tokens = options.max_length || 4000;
        // Convert string messages to the new messages format
        const trimmedMessages = this.trimMessages(messages, max_tokens);

        try {
            const response = await axios.post(
                service.apiUrl,
                {
                    model: options?.model || 'claude-3-haiku-20240307',
                    max_tokens: max_tokens,
                    temperature: options?.temperature ?? 0.7,
                    messages: trimmedMessages
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'X-API-Key': service.apiKey,
                    },
                    // Add retry and timeout configurations
                    timeout: 30000, // 30 seconds timeout
                }
            );

            // Return the content of the first message in the response
            return response.data.content[0].text;
        } catch (error) { analyzeError(error as Error);
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
            console.error('Error generating response from Anthropic:', error instanceof Error ? error.message : error);
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
            } catch (error) { analyzeError(error as Error);
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

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { model: modelName });
    }

    async convertTextToCode(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages = [
            { role: 'system', content: 'You are a code generation assistant. Provide only code without explanations.' },
            { role: 'user', content: prompt || ''}
        ];
        return this.chat(service, messages, { model: modelName });
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            throw new Error(`Unsupported conversion type: ${conversionType}`);
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter(param => !(param in convertParams));
        if (missingParams.length > 0) {
            throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
        }
        return converter.converter(convertParams);
    }

}

const aiInterface = new AnthropicInterface();
export default aiInterface;