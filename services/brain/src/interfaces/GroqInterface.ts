import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';
import OpenAI from 'openai';

export class GroqInterface extends BaseInterface {
    interfaceName = 'groq';

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
            converter: this.convertTextToText,
        });
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages: ExchangeType = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName });
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            if (!service || !service.isAvailable() || !service.apiKey) {
                throw new Error('Groq service is not available or API key is missing');
            }

            // Initialize the Groq client using OpenAI's SDK
            const groqClient = new OpenAI({
                apiKey: service.apiKey,
                baseURL: service.apiUrl
            });

            // Get the model name from options or use a default
            // Strip the 'groq/' prefix if present
            let modelName = options.modelName || 'llama-3-8b-8192';
            if (modelName.startsWith('groq/')) {
                modelName = modelName.substring(5); // Remove 'groq/' prefix
            }

            console.log(`Using Groq model: ${modelName}`);

            // Format messages for Groq API (OpenAI format)
            const formattedMessages = messages.map(msg => {
                return {
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: msg.content || ''
                } as OpenAI.ChatCompletionMessageParam;
            });

            // Create the completion
            const completion = await groqClient.chat.completions.create({
                model: modelName,
                messages: formattedMessages,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_length || 2048,
                stream: false
            });

            // Return the response
            if (completion.choices && completion.choices.length > 0) {
                return completion.choices[0].message.content || '';
            }

            return '';
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error generating response from Groq:', error instanceof Error ? error.message : error);
            throw error; // Rethrow to allow the Brain to handle the error
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            console.log(`Unsupported conversion type: ${conversionType}`);
            return undefined;
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter(param => !(param in convertParams));
        if (missingParams.length > 0) {
            console.log(`Missing required parameters: ${missingParams.join(', ')}`);
            return undefined;
        }
        return converter.converter(convertParams);
    }
}

const aiInterface = new GroqInterface();
export default aiInterface;
