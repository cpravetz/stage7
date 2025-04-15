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
                model: options.modelName || 'HuggingFaceH4/zephyr-7b-beta',
                messages: messages,
                max_tokens: options.max_length || 4000,
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

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, timeout?: number }): Promise<string> {
        try {
            const MODEL_MAX_TOKENS = 4096;
            const SAFETY_MARGIN = 200;

            // Validate service and API key
            if (!service || !service.apiKey || service.apiKey === 'dummy-key' || service.apiKey === '') {
                return 'Error: No valid Huggingface API key provided. Please set the HUGGINGFACE_API_KEY environment variable.';
            }

            // Ensure messages array is valid
            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                return 'Error: No valid messages provided for chat completion.';
            }

            // Format messages for the API
            const formattedMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content || ''
            }));

            const trimmedMessages = this.trimMessages(formattedMessages, MODEL_MAX_TOKENS);

            // Calculate token usage
            const inputTokens = trimmedMessages.reduce((sum, message) => {
                return sum + Math.ceil((message.content?.length || 0) / 3.7);
            }, 0);

            const availableTokens = MODEL_MAX_TOKENS - inputTokens - SAFETY_MARGIN;

            if (availableTokens < 100) {
                return `Error: Input too long: ${inputTokens} tokens used, only ${availableTokens} tokens available for response`;
            }

            const max_new_tokens = Math.min(
                availableTokens,
                options.max_length || MODEL_MAX_TOKENS,
                MODEL_MAX_TOKENS - inputTokens - SAFETY_MARGIN
            );

            console.log(`Token allocation: input=${inputTokens}, max_new=${max_new_tokens}, total=${inputTokens + max_new_tokens}`);

            // Create inference instance with API key
            const inference = new HfInference(service.apiKey);
            let out = "";

            try {
                const stream = await inference.chatCompletionStream({
                    model: options.modelName || "HuggingFaceH4/zephyr-7b-beta",
                    messages: trimmedMessages,
                    max_tokens: max_new_tokens,
                    temperature: options.temperature || 0.5,
                    top_p: 0.7,
                    timeout: options.timeout || 450000, // Use the timeout option here
                });

                for await (const chunk of stream) {
                    if (chunk.choices && chunk.choices.length > 0 && chunk.choices[0].delta) {
                        const newContent = chunk.choices[0].delta.content || '';
                        out += newContent;
                    }
                }

                return out || 'No response generated';
            } catch (streamError) {
                analyzeError(streamError as Error);
                const streamErrorMessage = streamError instanceof Error ? streamError.message : String(streamError);
                console.error('Error in Huggingface stream:', streamErrorMessage);

                // Try a non-streaming fallback
                try {
                    const response = await inference.textGeneration({
                        model: options.modelName || "HuggingFaceH4/zephyr-7b-beta",
                        inputs: trimmedMessages[trimmedMessages.length - 1].content,
                        parameters: {
                            max_new_tokens: max_new_tokens,
                            temperature: options.temperature || 0.5,
                            top_p: 0.7,
                        }
                    });
                    return response.generated_text || 'No response generated';
                } catch (fallbackError) {
                    analyzeError(fallbackError as Error);
                    throw fallbackError; // Let the outer catch handle this
                }
            }
        } catch (error) {
            analyzeError(error as Error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error generating response from Huggingface:', errorMessage);
            // Return error message instead of throwing to prevent loops
            return `Error: ${errorMessage}`;
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
