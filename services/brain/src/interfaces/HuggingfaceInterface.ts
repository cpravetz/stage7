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
            return '';
        }
    }

    private isResponseComplete(response: string): boolean {
        try {
            JSON.parse(response);
            return true;
        } catch (e) {
            return false;
        }
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            const trimmedMessages = this.trimMessages(messages, Math.min(options.max_length || 4096, 4096));
            const inputTokens = trimmedMessages.reduce((sum, message) => {
                return sum + Math.ceil(message.content.length / 3.8);
            }, 0);
            const max_new_tokens = Math.max(1, (options.max_length || 4096) - inputTokens);

            const inference = new HfInference(service.apiKey);

            let out = "";
            const stream = inference.chatCompletionStream({
                model: "meta-llama/Llama-3.2-3B-Instruct",
                messages: trimmedMessages,
                max_tokens: 4096-inputTokens,
                temperature: 0.5,
                top_p: 0.7
            });
            
            for await (const chunk of stream) {
                if (chunk.choices && chunk.choices.length > 0) {
                    const newContent = chunk.choices[0].delta.content;
                    out += newContent;
                }  
            }
            
            const generatedText = out;
            return generatedText;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            return '';
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const inference = new HfInference(service.apiKey);
    
        // Estimate the number of tokens in the input prompt
        // A rough estimate is 1 token per 4 characters
        const estimatedInputTokens = Math.ceil((prompt?.length || 0) / 3.5);
    
        // Calculate the maximum new tokens, ensuring we don't exceed the model's limit
        const maxTotalTokens = args.max_length || 2048; // Default to 2048 if not specified
        const maxNewTokens = Math.max(1, maxTotalTokens - estimatedInputTokens);
    
        const response = await inference.textGeneration({
            model: modelName || 'gpt2',
            inputs: prompt || '',
            parameters: {
                max_new_tokens: maxNewTokens,
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
            console.error('No audio file provided');
            return '';
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
            console.error('No image file provided');
            return '';
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
            console.error(`Unsupported conversion type: ${conversionType}`);
            return '';
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter(param => !(param in convertParams));
        if (missingParams.length > 0) {
            console.error(`HFinterface:Missing required parameters: ${missingParams.join(', ')}`);
            return '';
        }
        return converter.converter(convertParams);
    }


}

const aiInterface = new HuggingfaceInterface();
export default aiInterface;
