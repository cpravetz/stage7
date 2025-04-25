import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';
import { Stream } from 'openai/streaming';

export class OpenRouterInterface extends BaseInterface {
    interfaceName = 'openrouter';

    constructor() {
        super();
        this.converters.set(LLMConversationType.TextToImage, {
            conversationType: LLMConversationType.TextToImage,
            requiredParams: ['service','prompt'],
            converter: this.convertTextToImage,
        });this.converters.set(LLMConversationType.TextToText, {
            conversationType: LLMConversationType.TextToText,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText,
        });
        this.converters.set(LLMConversationType.ImageToText, {
            conversationType: LLMConversationType.ImageToText,
            requiredParams: ['service', 'image', 'prompt'],
            converter: this.convertImageToText,
        });
        this.converters.set(LLMConversationType.TextToCode, {
            conversationType: LLMConversationType.TextToCode,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToCode,
        });
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages: ExchangeType = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName });
    }

    async convertImageToText(args: ConvertParamsType): Promise<string> {
        const { service, image, prompt, modelName } = args;
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
        const { service, prompt, modelName } = args;
        const messages: ExchangeType = [
            { role: 'system', content: 'You are a code generation assistant. Provide only code without explanations.' },
            { role: 'user', content: prompt || '' }
        ];
        return this.chat(service, messages, { modelName });
    }

    async convertTextToImage(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const body = JSON.stringify({
            model: modelName || 'dall-e-2',
            messages: [{ role: 'user', content: prompt }],
            size: args.size || '1024x1024',
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

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const max_length = options.max_length || 4000;
        const temperature = options.temperature || 0.7;
        const trimmedMessages = this.trimMessages(messages, max_length);

        // Don't catch errors here - let them propagate to the Brain service
        // so it can properly track the failure and blacklist the model
        const openRouterApiClient = new OpenAI({ apiKey: service.apiKey, baseURL: service.apiUrl });
        const stream = await openRouterApiClient.chat.completions.create({
            model: options.modelName || 'gpt-4',
            messages: trimmedMessages as ChatCompletionMessageParam[],
            temperature,
            max_tokens: max_length,
            stream: true,
        });

        let fullResponse = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            fullResponse += content;
        }

        return fullResponse || '';
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            console.log(`ORI convert:Unsupported conversion type: ${conversionType}`);
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

const aiInterface = new OpenRouterInterface();
export default aiInterface;