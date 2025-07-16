import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';
import { ImageEditParams, ImageGenerateParams } from 'openai/resources';
import { SpeechCreateParams } from 'openai/resources/audio/speech';
import { Stream } from 'openai/streaming';

export class OpenAIInterface extends BaseInterface {
    interfaceName = 'openai';

    constructor() {
        super('openai');
        this.converters.set(LLMConversationType.TextToImage, {
            conversationType: LLMConversationType.TextToImage,
            requiredParams: ['service','prompt'],
            converter: this.convertTextToImage,
        });
        this.converters.set(LLMConversationType.TextToAudio, {
            conversationType: LLMConversationType.TextToAudio,
            requiredParams: ['service', 'text'],
            converter: this.convertTextToAudio,
        });
        this.converters.set(LLMConversationType.AudioToText, {
            conversationType: LLMConversationType.AudioToText,
            requiredParams: ['service', 'audio'],
            converter: this.convertAudioToText,
        });
        this.converters.set(LLMConversationType.TextToCode, {
            conversationType: LLMConversationType.TextToCode,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToCode,
        });
        this.converters.set(LLMConversationType.ImageToImage, {
            conversationType: LLMConversationType.ImageToImage,
            requiredParams: ['service','image','prompt'],
            converter: this.convertImageToImage,
        });
        this.converters.set(LLMConversationType.TextToText, {
            conversationType: LLMConversationType.TextToText,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText,
        });
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const max_length = options.max_length || 4000;
        const temperature = options.temperature || 0.7;
        const trimmedMessages = this.trimMessages(messages, max_length);
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            const stream = await openAiApiClient.chat.completions.create({
                model: options.modelName || 'gpt-4',
                messages: trimmedMessages as ChatCompletionMessageParam[],
                temperature,
                max_tokens: max_length,
                stream: true
            });
    
            let fullResponse = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;
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
            console.error('Error generating response from OpenAI:', errorMessage);
            analyzeError(error as Error);

            // Instead of returning empty string, throw a more descriptive error
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
                errorMessage.includes('timeout') || errorMessage.includes('network')) {
                throw new Error(`OpenAI connection error: ${errorMessage}`);
            } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
                throw new Error(`OpenAI authentication error: ${errorMessage}`);
            } else if (errorMessage.includes('429')) {
                throw new Error(`OpenAI rate limit error: ${errorMessage}`);
            } else if (errorMessage.includes('404')) {
                throw new Error(`OpenAI model not found: ${errorMessage}`);
            } else {
                throw new Error(`OpenAI API error: ${errorMessage}`);
            }
        }
    }

    async convertTextToImage(args: ConvertParamsType): Promise<any> {
        const { service, prompt, modelName } = args;
            if (!service) {
                console.log('OpenAIInterface: No service provided for text-to-text conversion');
                return Promise.resolve('');
            }   
        try {
            const openAiApiClient = new OpenAI({ 
                apiKey: service.apiKey
            });
            const response = await openAiApiClient.images.generate({
                model: modelName || 'dall-e-3',
                prompt: prompt || '',
                size: args.size as ImageGenerateParams["size"] || '1024x1024',
                response_format: args.response_format as ImageGenerateParams["response_format"] || 'b64_json',
                quality: args.quality as ImageGenerateParams["quality"] || 'standard',
                style: args.style as ImageGenerateParams["style"] || 'vivid',
            });
    
            if (!response.data || response.data.length === 0) {
                console.error('No image data in response');
                return {};
            }
    
            return response.data[0];
        } catch (error) {
            console.error('Error generating image from OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            return {};
        }
    }
    
    async convertTextToAudio(args: ConvertParamsType): Promise<any> {
        const { service, input, modelName } = args;
            if (!service) {
                console.log('OpenAIInterface: No service provided for text-to-text conversion');
                return Promise.resolve('');
            }   
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            const response = await openAiApiClient.audio.speech.create({
                model: modelName || 'tts-1',
                voice: args.voice as SpeechCreateParams["voice"]|| 'alloy',
                input: input || '',
                response_format: args.response_format as SpeechCreateParams["response_format"] || 'mp3',
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            return buffer;
        } catch (error) {
            console.error('Error generating audio from OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            return undefined;
        }
    }

    async convertAudioToText(args: ConvertParamsType): Promise<string> {
        const { service, audio, modelName } = args;
            if (!service) {
                console.log('OpenAIInterface: No service provided for text-to-text conversion');
                return Promise.resolve('');
            }   
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            if (!openAiApiClient || !audio) {
                console.error('No audio file provided');
                return '';
            }
            const response = await openAiApiClient.audio.transcriptions.create({
                file: fs.createReadStream(audio),
                model: modelName || 'whisper-1',
            });

            return response.text;
        } catch (error) {
            console.error('Error transcribing audio with OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            return '';
        }
    }

    async convertTextToCode(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('OpenAIInterface: No service provided for text-to-code conversion');
        }
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            const response = await openAiApiClient.chat.completions.create({
                model: modelName || 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are a code generation assistant. Provide only code without explanations.' },
                    { role: 'user', content: prompt || '' }
                ],
                temperature: 0.7,
                max_tokens: args.max_length || 1000,
            });

            if (!response.choices[0].message?.content) {
                throw new Error('OpenAI returned empty response');
            }

            return response.choices[0].message.content;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`OAI Interface: Error generating code with ${service.serviceName}:`, errorMessage);
            analyzeError(error as Error);

            // Throw descriptive error instead of returning empty string
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
                errorMessage.includes('timeout') || errorMessage.includes('network')) {
                throw new Error(`OpenAI connection error: ${errorMessage}`);
            } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
                throw new Error(`OpenAI authentication error: ${errorMessage}`);
            } else if (errorMessage.includes('404')) {
                throw new Error(`OpenAI model not found: ${errorMessage}`);
            } else {
                throw new Error(`OpenAI API error: ${errorMessage}`);
            }
        }
    }
        
    async convertImageToImage(args: ConvertParamsType): Promise<any> {
        const { service, image, prompt, modelName } = args;
        try {
            if (!service) {
                console.log('OpenAIInterface: No service provided for text-to-text conversion');
                return Promise.resolve('');
            }   
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            if (!openAiApiClient || !image) {
                console.error('OAI ImageToImage: No image file provided');
                return {};
            }
            // Ensure the image is a readable stream
            const imageStream = fs.createReadStream(image);

            // Create a transparent mask if not provided
            const maskStream = args.mask ? fs.createReadStream(args.mask) : undefined;

            const response = await openAiApiClient.images.edit({
                model: modelName || 'dall-e-2',
                image: imageStream,
                mask: maskStream,
                prompt: prompt || '',
                size: args.size as ImageEditParams["size"] || '1024x1024',
                response_format: args.response_format as ImageEditParams["response_format"] || 'b64_json',
            });

            if (!response.data || response.data.length === 0) {
                console.error(`OAI ImageToImage: No image data in ${service.serviceName} response`);
                return {};
            }

            return response.data[0];
        } catch (error) {
            console.error('Error editing image with OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            return {};
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('OpenAIInterface: No service provided for text-to-text conversion');
        }
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            const response = await openAiApiClient.chat.completions.create({
                model: modelName || 'gpt-4',
                messages: [
                    { role: 'user', content: prompt || '' }
                ],
                temperature: 0.7,
                max_tokens: args.max_length || 1000,
            });

            if (!response.choices[0].message?.content) {
                throw new Error('OpenAI returned empty response');
            }

            return response.choices[0].message.content;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`OAI TextToText: Error generating response with ${service.serviceName}:`, errorMessage);
            analyzeError(error as Error);

            // Throw descriptive error instead of returning empty string
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
                errorMessage.includes('timeout') || errorMessage.includes('network')) {
                throw new Error(`OpenAI connection error: ${errorMessage}`);
            } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
                throw new Error(`OpenAI authentication error: ${errorMessage}`);
            } else if (errorMessage.includes('429')) {
                throw new Error(`OpenAI rate limit error: ${errorMessage}`);
            } else if (errorMessage.includes('404')) {
                throw new Error(`OpenAI model not found: ${errorMessage}`);
            } else {
                throw new Error(`OpenAI API error: ${errorMessage}`);
            }
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            throw new Error(`Conversion type ${conversionType} not supported by OpenAI interface`);
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter((param: any) => !(param in convertParams));
        if (missingParams.length > 0) {
            throw new Error(`Missing required parameters for OpenAI conversion: ${missingParams.join(', ')}`);
        }
        return converter.converter(convertParams);
    }

}

const aiInterface = new OpenAIInterface();
export default aiInterface;