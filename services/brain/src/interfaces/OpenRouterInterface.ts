import { BaseInterface, ConvertParamsType } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';

export class OpenRouterInterface extends BaseInterface {
    interfaceName = 'openrouter';

    constructor() {
        super('openrouter');
        this.converters.set(LLMConversationType.TextToImage, {
            conversationType: LLMConversationType.TextToImage,
            requiredParams: ['service','prompt'],
            converter: this.convertTextToImage.bind(this),
        });this.converters.set(LLMConversationType.TextToText, {
            conversationType: LLMConversationType.TextToText,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText.bind(this),
        });
        this.converters.set(LLMConversationType.ImageToText, {
            conversationType: LLMConversationType.ImageToText,
            requiredParams: ['service', 'image', 'prompt'],
            converter: this.convertImageToText.bind(this),
        });
        this.converters.set(LLMConversationType.TextToCode, {
            conversationType: LLMConversationType.TextToCode,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToCode.bind(this),
        });
        this.converters.set(LLMConversationType.TextToJSON, {
            conversationType: LLMConversationType.TextToJSON,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToJSON.bind(this),
        });
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName, responseType } = args;
        if (!service) {
            throw new Error('OpenRouterInterface: No service provided for text-to-text conversion');
        }

        const messages: ExchangeType = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName, responseType });
    }

    async convertImageToText(args: ConvertParamsType): Promise<string> {
        const { service, image, prompt, modelName } = args;
        if (!service) {
            throw new Error('OpenRouterInterface: No service provided for image-to-text conversion');
        }

        if (!image || !prompt) {
            console.log('No image file provided');
            return '';
        }
        const imageBase64 = fs.readFileSync(image, { encoding: 'base64' });
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                ]
            }
        ];
        const body = JSON.stringify({
            model: modelName || 'gpt-4',
            messages: messages,
            temperature: args.temperature || 0.7,
            max_tokens: args.max_length || 2000,
        })
        return this.chatCompletion(service, body);
    }

    async convertTextToCode(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName, responseType } = args;
        if (!service) {
            throw new Error('OpenRouterInterface: No service provided for text-to-code conversion');
        }

        // Check if this is a JSON request based on prompt content
        const isJsonRequest = responseType === 'json';

        const systemMessage = isJsonRequest
            ? 'You are a JSON generation assistant. You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { and ending with }.'
            : 'You are a code generation assistant. Provide only code without explanations.';

        const messages: ExchangeType = [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt || '' }
        ];
        return this.chat(service, messages, { modelName, responseType });
    }

    async convertTextToJSON(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('OpenRouterInterface: No service provided for text-to-JSON conversion');
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
        return this.sanitizeResponse(jsonResponse, 'json');
    }

    async convertTextToImage(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName, responseType } = args;
        if (!service) {
            throw new Error('OpenRouterInterface: No service provided for text-to-image conversion');
        }
        const body = JSON.stringify({
            model: modelName || 'dall-e-2',
            messages: [{ role: 'user', content: prompt }],
            size: args.size || '1024x1024',
            responseType: responseType
        })
        return this.chatCompletion(service, body);
    }

    async chatCompletion(service: BaseService, body: string) {
        const result = await fetch(service.apiUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${service.apiKey}`,
              "Content-Type": "application/json"
            },
            body: body
          });
          return result.json();
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, responseType?: string, schema?: any }): Promise<string> {
        const max_length = options.max_length || 4000;
        const temperature = options.temperature || 0.7;
        let trimmedMessages = this.trimMessages(messages, max_length);

        const requestOptions: any = {
            model: options.modelName || 'gpt-4',
            messages: trimmedMessages as ChatCompletionMessageParam[],
            temperature,
            max_tokens: max_length,
            stream: false, // Always use non-streaming for compatibility
        };

        // If schema is provided and API supports it, pass it in requestOptions
        if (options.schema) {
            // OpenRouter does not support JSON schema natively, so add to prompt
            if (Array.isArray(requestOptions.messages)) {
                requestOptions.messages.unshift({ role: 'system', content: `Your response must comply with this schema: ${JSON.stringify(options.schema)}` });
            }
        }

        // If responseType is 'json', set response_format and prepend system prompt
        if (options.responseType === 'json') {
            requestOptions.response_format = { type: 'json_object' };
            if (Array.isArray(requestOptions.messages)) {
                requestOptions.messages.unshift({ role: 'system', content: 'You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { and ending with }.' });
            }
        }

        // so it can properly track the failure and blacklist the model
        const openRouterApiClient = new OpenAI({ apiKey: service.apiKey, baseURL: service.apiUrl });

        let fullResponse = '';
        try {
            const response = await openRouterApiClient.chat.completions.create(requestOptions);
            if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
                fullResponse = response.choices[0].message.content;
            }
            console.log(`OpenRouterInterface: Received response with content: ${fullResponse.substring(0, 140)}... (truncated)`);
        } catch (error) {
            console.error(`OpenRouterInterface: Error during chat completion:`, error);
            if (error instanceof Error) {
                if (error.message) {
                    console.error(`OpenRouterInterface: Error message: ${error.message}`);
                }
            }
            throw error;
        }

        // --- Ensure JSON if required ---
        const requireJson = options.responseType === 'json';
        if (requireJson) {
            const jsonResponse = await this.ensureJsonResponse(fullResponse, true, service);
            if (jsonResponse === null) {
                throw new Error("Failed to extract valid JSON from the model's response.");
            }
            return this.sanitizeResponse(jsonResponse, 'json');
        }

        return this.sanitizeResponse(fullResponse || '', 'text');
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            console.log(`ORI convert:Unsupported conversion type: ${conversionType}`);
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

}

const aiInterface = new OpenRouterInterface();
export default aiInterface;