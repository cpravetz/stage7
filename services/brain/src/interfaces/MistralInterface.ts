import { BaseInterface, LLMConversationType } from './baseInterface';
import { BaseService, ExchangeType } from '../services/baseService';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';

export class MistralInterface extends BaseInterface {
    interfaceName: string = 'mistral';

    constructor() {
        super();
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string } = {}): Promise<string> {
        try {
            if (!service || !service.isAvailable()) {
                throw new Error('Mistral service is not available');
            }

            const apiUrl = service.apiUrl;
            const apiKey = service.apiKey;

            if (!apiUrl || !apiKey) {
                throw new Error('Mistral service configuration is incomplete');
            }

            // Format messages for Mistral API
            const formattedMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content || ''
            }));

            console.log(`Sending request to Mistral at ${apiUrl}/chat/completions`);

            const response = await axios.post(
                `${apiUrl}/chat/completions`,
                {
                    model: options.modelName || 'mistral-small-latest',
                    messages: formattedMessages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.max_length || 2048,
                    top_p: 0.95
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content;
            } else {
                console.error('Unexpected response format from Mistral:', JSON.stringify(response.data));
                throw new Error('Unexpected response format from Mistral');
            }
        } catch (error) {
            analyzeError(error as Error);
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
                modelName: convertParams.modelName
            });
        }

        // If we have messages, use them directly
        if (convertParams.messages) {
            return this.chat(service, convertParams.messages, {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length,
                modelName: convertParams.modelName
            });
        }

        throw new Error('No prompt or messages provided for Mistral conversion');
    }
}

const mistralInterface = new MistralInterface();
export default mistralInterface;