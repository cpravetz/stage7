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
        try {
            JSON.parse(response);
            return true;
        } catch (e) {
            return false;
        }
    }

/* Streaming chat
    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            const trimmedMessages = this.trimMessages(messages, options.max_length || 4096);
            const inputTokens = trimmedMessages.reduce((sum, message) => {
                return sum + Math.ceil(message.content.length / 3.5);
            }, 0);
            const max_new_tokens = Math.max(1, (options.max_length || 4096) - inputTokens);
            console.log(`Huggingface input tokens: ${inputTokens} max_length: ${options.max_length} max_new_tokens: ${max_new_tokens}`);
    
            const inference = new HfInference(service.apiKey);
            let fullResponse: string = "";
            let chunkCount = 0;
    
            for await (const chunk of inference.chatCompletionStream({
                model: options.modelName || 'meta-llama/llama-3.2-3b-instruct',
                messages: trimmedMessages,
                max_new_tokens: max_new_tokens,
                temperature: options.temperature || 0.2,
            })) {
                console.log(`Huggingface chunk ${chunkCount++}: ${JSON.stringify(chunk)}`);
                const content = chunk.choices[0]?.delta?.content || "";
                fullResponse += content;
                if (chunk.choices[0]?.finish_reason === "stop" || chunk.choices[0]?.finish_reason === "length") {
                    break;
                }
            }
    
            if (!fullResponse) {
                throw new Error('No content in Huggingface response');
            }
    
            console.log(`Huggingface full response: ${fullResponse}`);
            return fullResponse;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }
*/

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            const trimmedMessages = this.trimMessages(messages, options.max_length || 4096);
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
            /*                    
            const response = await inference.chatCompletion({
                model: options.modelName || 'meta-llama/llama-3.2-3b-instruct',
                messages: trimmedMessages,
                max_new_tokens: max_new_tokens,
                temperature: options.temperature || 0.2,
            });

            if (!response || !response.choices[0].message.content) {
                console.log('Bad response from Huggingface:', response);
                throw new Error('No content in Huggingface response');
            }

            const generatedText = response.choices[0].message;
            

            // If generatedText is an object, we need to extract the actual text content
            if (typeof generatedText === 'object' && generatedText !== null) {
                if (Array.isArray(generatedText)) {
                    // If it's an array, assume the last element is the response
                    const lastMessage = generatedText[generatedText.length - 1];
                    if (typeof lastMessage === 'object' && lastMessage !== null && 'content' in lastMessage) {
                        return lastMessage.content as string;
                    }
                } else if ('content' in generatedText) {
                    // If it's an object with a 'content' property
                    return generatedText.content as string;
                } else {
                    // If it's some other object structure, stringify it
                    return JSON.stringify(generatedText);
                }
            } else if (typeof generatedText === 'string') {
                return generatedText;
            }
            throw new Error('Unexpected response format from Huggingface');
            */
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate response from Huggingface');
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
