import { BaseInterface } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService, ExchangeType } from '../services/baseService';
import axios from 'axios';

export class MistralInterface extends BaseInterface {
    interfaceName: string = 'mistral';

    constructor() {
        super('mistral');
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, responseType?: string   } = {}): Promise<string> {
        try {
            if (!service || !service.isAvailable()) {
                throw new Error('Mistral service is not available');
            }

            const apiUrl = service.apiUrl;
            const apiKey = service.apiKey;

            if (!apiUrl || !apiKey) {
                throw new Error('Mistral service configuration is incomplete');
            }

            // If responseType is 'json', prepend a system prompt to enforce JSON output
            let contentParts = messages;
            if (options.responseType === 'json') {
                contentParts = [
                    { role: 'system', content: 'You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { and ending with }.' },
                    ...messages
                ];
            }

            // Format messages for Mistral API
            const formattedMessages = contentParts.map(msg => ({
                role: msg.role,
                content: msg.content || ''
            }));

            console.log(`Sending request to Mistral at ${apiUrl}/chat/completions`);

            const requestBody = {
                model: options.modelName || 'mistral-small-latest',
                messages: formattedMessages,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_length,
                top_p: 0.95
            };
            console.log('Mistral Request Body:', JSON.stringify(requestBody, null, 2)); // Log the request body

            const response = await axios.post(
                `${apiUrl}/chat/completions`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                let content = response.data.choices[0].message.content;

                // --- Ensure JSON if required ---
                let requireJson = options.responseType === 'json' ? true : false;
                if (requireJson) {
                    return this.ensureJsonResponse(content, true);
                }
                return content;
            } else {
                console.error('Unexpected response format from Mistral:', JSON.stringify(response.data));
                throw new Error('Unexpected response format from Mistral');
            }
        } catch (error) {
            console.error('Error in Mistral interface:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: any): Promise<any> {
        // Mistral only supports text-to-text and text-to-code conversion
        if (conversionType !== LLMConversationType.TextToText && conversionType !== LLMConversationType.TextToCode) {
            throw new Error(`Conversion type ${conversionType} not supported by Mistral interface`);
        }

        // If we have a prompt, use it to create a simple message
        if (convertParams.prompt) {
            return this.chat(service, [{ role: 'user', content: convertParams.prompt }], {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length,
                modelName: convertParams.modelName,
                responseType: convertParams.responseType
            });
        }

        // If we have messages, use them directly
        if (convertParams.messages) {
            return this.chat(service, convertParams.messages, {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length,
                modelName: convertParams.modelName, responseType: convertParams.responseType,
            });
        }

        throw new Error('No prompt or messages provided for Mistral conversion');
    }
}

const mistralInterface = new MistralInterface();
export default mistralInterface;