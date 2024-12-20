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
    
            return fullResponse || '';
        } catch (error) {
            console.error('Error generating response from Anthropic:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            return '';
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName: modelName });
    }

    async convertTextToCode(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages = [
            { role: 'system', content: 'You are a code generation assistant. Provide only code without explanations.' },
            { role: 'user', content: prompt || ''}
        ];
        return this.chat(service, messages, { modelName: modelName });
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            return '';
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter(param => !(param in convertParams));
        if (missingParams.length > 0) {
            console.log(`Missing required parameters: ${missingParams.join(', ')}`);
            return '';
        }
        return converter.converter(convertParams);
    }

}

const aiInterface = new AnthropicInterface();
export default aiInterface;