import { BaseInterface, ConvertParamsType } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService, ExchangeType } from '../services/baseService';
import axios from 'axios';

export class CloudflareWorkersAIInterface extends BaseInterface {
    interfaceName = 'cloudflare-workers-ai';

    constructor() {
        super('cloudflare-workers-ai');
        this.converters.set(LLMConversationType.TextToText, {
            conversationType: LLMConversationType.TextToText,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText,
        });
        this.converters.set(LLMConversationType.TextToJSON, {
            conversationType: LLMConversationType.TextToJSON,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToJSON,
        });
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('CloudflareWorkersAIInterface: No service provided for text-to-text conversion');
        }

        const messages: ExchangeType = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName });
    }

    async convertTextToJSON(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('CloudflareWorkersAIInterface: No service provided for text-to-JSON conversion');
        }

        const systemMessage = 'You are a JSON generation assistant. You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { or [ and ending with } or ].';

        const messages: ExchangeType = [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt || '' }
        ];

        const response = await this.chat(service, messages, { modelName, responseType: 'json' });

        // Always apply JSON cleanup for TextToJSON conversion type
        const jsonResponse = await this.ensureJsonResponse(response, true, service);
        if (jsonResponse === null) {
            throw new Error("Failed to extract valid JSON from the model's response.");
        }
        return jsonResponse;
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            console.log(`Unsupported conversion type: ${conversionType}`);
            return undefined;
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter((param: any) => !(param in convertParams));
        if (missingParams.length > 0) {
            console.log(`Missing required parameters: ${missingParams.join(', ')}`);
            return undefined;
        }
        return converter.converter(convertParams);
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, responseType?: string }): Promise<string> {
        try {
            if (!service || !service.isAvailable() || !service.apiKey || !service.apiUrl) {
                throw new Error('Cloudflare Workers AI service is not available or API key/URL is missing');
            }

            // Cloudflare Workers AI uses the OpenAI-compatible API
            const model = options.modelName || '@cf/meta/llama-3-8b-instruct'; // Default model
            const apiUrl = `${service.apiUrl}/${model}`;

            const headers = {
                'Authorization': `Bearer ${service.apiKey}`,
                'Content-Type': 'application/json',
            };

            const payload = {
                messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
                temperature: options.temperature || 0.7,
                max_tokens: options.max_length || 2048,
            };

            console.log(`Sending request to Cloudflare Workers AI with model ${model} at ${apiUrl}`);

            const response = await axios.post(apiUrl, payload, { headers });

            let content = '';
            if (response.data && response.data.result && response.data.result.response) {
                content = response.data.result.response;
            } else if (response.data && response.data.result && response.data.result.choices && response.data.result.choices.length > 0) {
                // Fallback for OpenAI-compatible response structure
                content = response.data.result.choices[0].message.content;
            } else {
                throw new Error(`Unexpected response format from Cloudflare Workers AI: ${JSON.stringify(response.data)}`);
            }

            const requireJson = options.responseType === 'json';
            if (requireJson) {
                const jsonResponse = await this.ensureJsonResponse(content, true, service);
                if (jsonResponse === null) {
                    throw new Error("Failed to extract valid JSON from the model's response.");
                }
                return jsonResponse;
            }
            return content;
        } catch (error) {
            console.error('Error generating response from Cloudflare Workers AI:', error instanceof Error ? error.message : error);
            throw error;
        }
    }
}

export default new CloudflareWorkersAIInterface();
