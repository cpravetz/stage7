import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import { HfInference } from '@huggingface/inference';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';

export class HuggingfaceInterface extends BaseInterface {
    interfaceName = 'huggingface';

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
        this.converters.set(LLMConversationType.TextToImage, {
            conversationType: LLMConversationType.TextToImage,
            requiredParams: ['service', 'prompt'],
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
        this.converters.set(LLMConversationType.ImageToText, {
            conversationType: LLMConversationType.ImageToText,
            requiredParams: ['service', 'image'],
            converter: this.convertImageToText,
        });
    }

    async getChatCompletion(inference: HfInference, messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            let response: string = "";
            for await (const chunk of inference.chatCompletionStream({
                model: options.modelName || 'meta-llama/llama-3.2-3b-instruct',
                messages: messages,
                max_tokens: options.max_length || 4096,
                temperature: options.temperature || 0.2,
            })) {
                response += chunk.choices[0]?.delta?.content || "";
            }
            response = response.replace(/```/g, '');
            return response;
        } catch (error) { analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }

    private isResponseComplete(response: string): boolean {
        let isEndOfResponse = false;
        if (!response.startsWith('{')) {
            isEndOfResponse = true;
        } else {
            isEndOfResponse = response.endsWith('}');
        }
        return isEndOfResponse;
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            const inference = new HfInference(service.apiKey);
            let response: string = "";
            let attempts = 0;
            const maxAttempts = 3;
            let seemsComplete = false;
            while (!seemsComplete && attempts < maxAttempts) {
                for await (const chunk of inference.chatCompletionStream({
                    model: options.modelName || 'meta-llama/llama-3.2-3b-instruct',
                    messages: messages,
                    max_tokens: options.max_length || 4096,
                    temperature: options.temperature || 0.2,
                })) {
                    response += chunk.choices[0]?.delta?.content || "";
                }
                if (this.isResponseComplete(response)) {
                    seemsComplete = true;
                } else {
                    console.log(`Response incomplete, attempt ${attempts + 1} of ${maxAttempts}`);
                    messages.push({
                        role: 'system',
                        content: `Your response seems to be truncated. Please continue from: "${response.substring(response.length - 50)}" or return an empty string.`
                    });
                    attempts++;
                }
            }
            return response;
        } catch (error) { analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const inference = new HfInference(service.apiKey);
        const response = await inference.textGeneration({
            model: modelName || 'gpt2',
            inputs: prompt,
            parameters: {
                max_new_tokens: args.max_length || 100,
                temperature: args.temperature || 0.3,
            },
        });
        return response.generated_text;
    }

    async convertTextToImage(args: ConvertParamsType): Promise<Blob> {
        const { service, prompt, modelName } = args;
        const inference = new HfInference(service.apiKey);
        const response = await inference.textToImage({
            model: modelName || 'stabilityai/stable-diffusion-2',
            inputs: prompt || '',
        });
        return response;  // This is a base64 encoded image
    }

    async convertTextToAudio(args: ConvertParamsType): Promise<Blob> {
        const { service, text, modelName } = args;
        const inference = new HfInference(service.apiKey);
        const response = await inference.textToSpeech({
            model: modelName || 'facebook/fastspeech2-en-ljspeech',
            inputs: text||'',
        });
        return response;
    }

    async convertAudioToText(args: ConvertParamsType): Promise<string> {
        const { service, audio, modelName } = args;
        const inference = new HfInference(service.apiKey);
        if (!inference || !audio) {
            throw new Error('No audio file provided');
        }
        const audioBuffer = fs.readFileSync(audio);
        const response = await inference.automaticSpeechRecognition({
            model: modelName || 'facebook/wav2vec2-large-960h-lv60-self',
            data: audioBuffer,
        });
        return response.text;
    }

    async convertImageToText(args: ConvertParamsType): Promise<string> {
        const { service, image, modelName } = args;
        const inference = new HfInference(service.apiKey);
        if (!inference || !image) {
            throw new Error('No image file provided');
        }
        const imageBuffer = fs.readFileSync(image);
        const response = await inference.imageToText({
            model: modelName || 'nlpconnect/vit-gpt2-image-captioning',
            data: imageBuffer,
        });
        return response.generated_text;
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

const aiInterface = new HuggingfaceInterface();
export default aiInterface;
