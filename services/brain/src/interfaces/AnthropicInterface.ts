import axios, { AxiosError } from 'axios';
import { BaseInterface, ConvertParamsType } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService, ExchangeType } from '../services/baseService';

export class AnthropicInterface extends BaseInterface {
    interfaceName = 'anthropic';
    
    constructor() {
        super('anthropic');
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

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, timeout?: number }): Promise<string> {
        const max_tokens = options.max_length || 4000;
        const trimmedMessages = this.trimMessages(messages, max_tokens);
    
        try {
            const response = await axios.post(
                service.apiUrl,
                {
                    model: options?.modelName || 'claude-3-haiku-20240307',
                    max_tokens: max_tokens,
                    temperature: options?.temperature ?? 0.7,
                    messages: trimmedMessages,
                    stream: true,
                    timeout: options?.timeout || 60000, // 60 seconds
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        'X-API-Key': service.apiKey,
                    },
                    responseType: 'stream',
                }
            );
    
            let fullResponse = '';
            for await (const chunk of response.data) {
                const lines = chunk.toString('utf8').split('\n').filter((line: string) => line.trim() !== '');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content_block_delta') {
                            fullResponse += data.delta.text;
                        }
                    }
                }
            }
    
            if (!fullResponse) {
                console.log('No content in Anthropic response');
            }

            // --- Ensure JSON if required ---
            let requireJson = false;
            if (options.modelName && options.modelName.toLowerCase().includes('code')) requireJson = true;
            if (messages && messages.length > 0 && messages[0].content &&
                (messages[0].content.includes('JSON') || messages[0].content.includes('json'))) {
                requireJson = true;
            }
            if (requireJson) {
                return this.ensureJsonResponse(fullResponse, true);
            }
    
            return fullResponse || '';
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error generating response from Anthropic:', errorMessage);

            // Instead of returning empty string, throw a more descriptive error
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
                errorMessage.includes('timeout') || errorMessage.includes('network')) {
                throw new Error(`Anthropic connection error: ${errorMessage}`);
            } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
                throw new Error(`Anthropic authentication error: ${errorMessage}`);
            } else if (errorMessage.includes('429')) {
                throw new Error(`Anthropic rate limit error: ${errorMessage}`);
            } else {
                throw new Error(`Anthropic API error: ${errorMessage}`);
            }
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('AnthropicInterface: No service provided for text-to-text conversion');
        }
        const messages = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName: modelName });
    }

    async convertTextToCode(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('AnthropicInterface: No service provided for text-to-code conversion');
        }
        const messages = [
            { role: 'system', content: 'You are a code generation assistant. Provide only code without explanations.' },
            { role: 'user', content: prompt || ''}
        ];
        return this.chat(service, messages, { modelName: modelName });
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            throw new Error(`Conversion type ${conversionType} not supported by Anthropic interface`);
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter((param:any) => !(param in convertParams));
        if (missingParams.length > 0) {
            throw new Error(`Missing required parameters for Anthropic conversion: ${missingParams.join(', ')}`);
        }
        return converter.converter(convertParams);
    }

}

const aiInterface = new AnthropicInterface();
export default aiInterface;