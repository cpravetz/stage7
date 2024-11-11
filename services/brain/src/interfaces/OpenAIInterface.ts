import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';
import { ImageEditParams, ImageGenerateParams } from 'openai/resources';
import { SpeechCreateParams } from 'openai/resources/audio/speech';

export class OpenAIInterface extends BaseInterface {
    interfaceName = 'openai';

    constructor() {
        super();
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
        const max_length = options.max_length || 2000;
        const temperature = options.temperature || 0.7;

        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            const response = await openAiApiClient.chat.completions.create({
                model: options.modelName || 'gpt-4',
                messages: messages as ChatCompletionMessageParam[],
                temperature,
                max_tokens: max_length,
            });
            if (!response.choices[0].message?.content) {
                throw new Error('No content in OpenAI response');
            }

            return response.choices[0].message.content;
        } catch (error) { analyzeError(error as Error);
            console.error('Error generating response from OpenAI:', error instanceof Error ? error.message : error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate response from OpenAI: ${error.message}`);
            } else {
                throw new Error('Failed to generate response from OpenAI: Unknown error');
            }
        }
    }

    async convertTextToImage(args: ConvertParamsType): Promise<any> {
        const { service, prompt, modelName } = args;
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
                throw new Error('No image data in response');
            }
    
            return response.data[0];
        } catch (error) {
            console.error('Error generating image from OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            throw new Error(`Failed to generate image from ${service.serviceName}`);
        }
    }
    
    async convertTextToAudio(args: ConvertParamsType): Promise<any> {
        const { service, input, modelName } = args;
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
            throw new Error(`Failed to generate audio from ${service.serviceName}`);
        }
    }

    async convertAudioToText(args: ConvertParamsType): Promise<string> {
        const { service, audio, modelName } = args;
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            if (!openAiApiClient || !audio) {
                throw new Error('No audio file provided');
            }
            const response = await openAiApiClient.audio.transcriptions.create({
                file: fs.createReadStream(audio),
                model: modelName || 'whisper-1',
            });

            return response.text;
        } catch (error) {
            console.error('Error transcribing audio with OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            throw new Error(`Failed to transcribe audio with ${service.serviceName}`);
        }
    }

    async convertTextToCode(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
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
                throw new Error('No content in OpenAI response');
            }

            return response.choices[0].message.content;
        } catch (error) {
            console.error(`Error generating code with ${service.serviceName}}:`, error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            throw new Error(`Failed to generate code with ${service.serviceName}`);
        }
    }
        
    async convertImageToImage(args: ConvertParamsType): Promise<any> {
        const { service, image, prompt, modelName } = args;
        try {
            const openAiApiClient = new OpenAI({ apiKey: service.apiKey });
            if (!openAiApiClient || !image) {
                throw new Error('No image file provided');
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
                throw new Error(`No image data in ${service.serviceName} response`);
            }

            return response.data[0];
        } catch (error) {
            console.error('Error editing image with OpenAI:', error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            throw new Error(`Failed to edit image with ${service.serviceName}`);
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
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
                throw new Error('No content in OpenAI response');
            }

            return response.choices[0].message.content;
        } catch (error) {
            console.error(`Error generating code with ${service.serviceName}}:`, error instanceof Error ? error.message : error);
            analyzeError(error as Error);
            throw new Error(`Failed to generate code with ${service.serviceName}`);
        }
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

const aiInterface = new OpenAIInterface();
export default aiInterface;