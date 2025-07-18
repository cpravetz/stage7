import { BaseInterface, ConvertParamsType } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { HfInference } from '@huggingface/inference';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';
import { ModelPerformanceTracker } from '../utils/performanceTracker';

export class HuggingfaceInterface extends BaseInterface {
    interfaceName = 'huggingface';
    private performanceTracker: ModelPerformanceTracker;
    // Patterns to detect when we've exceeded our monthly credits
    private static MONTHLY_CREDIT_ERROR_PATTERNS = [
        /exceeded your monthly included credits/i,
        /exceeded monthly credits/i,
        /quota exceeded/i,
        /rate limit exceeded/i
    ];

    // Flag to track if we've already blacklisted models for the month
    private static modelsBlacklistedUntilNextMonth = false;

    constructor() {
        super('huggingface');
        this.performanceTracker = new ModelPerformanceTracker();
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

    /**
     * Check if an error message indicates that we've exceeded our monthly credits
     * @param errorMessage The error message to check
     * @returns True if the error indicates we've exceeded monthly credits
     */
    private isMonthlyCreditsExceededError(errorMessage: string): boolean {
        // Check against all error patterns that indicate we've exceeded our monthly credits
        return HuggingfaceInterface.MONTHLY_CREDIT_ERROR_PATTERNS.some(pattern =>
            pattern.test(errorMessage)
        );
    }

    /**
     * Blacklist all Huggingface models until the first day of the next month
     * @param errorMessage The error message that triggered the blacklisting
     */
    private blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage: string): void {
        // Only blacklist once per month to avoid excessive logging
        if (HuggingfaceInterface.modelsBlacklistedUntilNextMonth) {
            // If we've already blacklisted, just make sure the global variable is set
            if (!(global as any).huggingfaceBlacklistedUntil) {
                // Calculate the first day of the next month
                const now = new Date();
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                (global as any).huggingfaceBlacklistedUntil = nextMonth.toISOString();
                console.log(`Re-set global Huggingface blacklist until ${nextMonth.toLocaleString()}`);
            }
            return;
        }

        console.log('BLACKLISTING ALL HUGGINGFACE MODELS UNTIL NEXT MONTH due to:', errorMessage);

        // Calculate the first day of the next month
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        // Set the global blacklist variable that BaseModel.isAvailable() checks
        (global as any).huggingfaceBlacklistedUntil = nextMonth.toISOString();
        console.log(`Set global Huggingface blacklist until ${nextMonth.toLocaleString()}`);

        // Get all models from the performance tracker
        const performanceData = this.performanceTracker.getAllPerformanceData();

        // Find all Huggingface models and blacklist them
        let blacklistedCount = 0;
        for (const [modelName, modelData] of Object.entries(performanceData)) {
            if (modelName.toLowerCase().includes('huggingface') ||
                modelName.toLowerCase().includes('hf/')) {

                // Blacklist for all conversation types
                for (const conversationType of Object.keys(modelData.metrics)) {
                    const metrics = modelData.metrics[conversationType as LLMConversationType];
                    if (metrics) {
                        // Set blacklisted until next month
                        metrics.blacklistedUntil = nextMonth.toISOString();
                        metrics.consecutiveFailures = Math.max(metrics.consecutiveFailures, 5); // Ensure it stays blacklisted
                        blacklistedCount++;
                    }
                }
            }
        }

        console.log(`Blacklisted ${blacklistedCount} Huggingface model/conversation type combinations until ${nextMonth.toLocaleString()}`);

        // The performance data will be saved automatically when the application exits
        // or when the updateMetrics method is called

        // Set the flag to avoid blacklisting again this month
        HuggingfaceInterface.modelsBlacklistedUntilNextMonth = true;
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error generating response from Huggingface:', errorMessage);

            // Throw descriptive error instead of returning empty string
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') ||
                errorMessage.includes('timeout') || errorMessage.includes('network')) {
                throw new Error(`Huggingface connection error: ${errorMessage}`);
            } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
                throw new Error(`Huggingface authentication error: ${errorMessage}`);
            } else if (errorMessage.includes('429')) {
                throw new Error(`Huggingface rate limit error: ${errorMessage}`);
            } else if (errorMessage.includes('404')) {
                throw new Error(`Huggingface model not found: ${errorMessage}`);
            } else {
                throw new Error(`Huggingface API error: ${errorMessage}`);
            }
        }
    }

    // Removed unused isResponseComplete method

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
                throw new Error(`Input too long: ${inputTokens} tokens used, only ${availableTokens} tokens available for response`);
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

                // --- Ensure JSON if required ---
                let requireJson = false;
                if (options.modelName && options.modelName.toLowerCase().includes('code')) requireJson = true;
                if (trimmedMessages && trimmedMessages.length > 0 && trimmedMessages[0].content &&
                    (trimmedMessages[0].content.includes('JSON') || trimmedMessages[0].content.includes('json'))) {
                    requireJson = true;
                }
                if (requireJson) {
                    return this.ensureJsonResponse(out, true);
                }
                return out || 'No response generated';
            } catch (streamError) {
                const streamErrorMessage = streamError instanceof Error ? streamError.message : String(streamError);
                console.error('Error in Huggingface stream:', streamErrorMessage);

                // Check if this is a 404 error - let the Brain handle blacklisting
                if (streamErrorMessage.includes('404')) {
                    throw new Error(`Huggingface model ${options.modelName} returned 404 and has been blacklisted temporarily.`);
                }

                // Check if this is a monthly credits exceeded error
                if (this.isMonthlyCreditsExceededError(streamErrorMessage)) {
                    // Blacklist all Huggingface models until the first of next month
                    this.blacklistAllHuggingfaceModelsUntilNextMonth(streamErrorMessage);
                    throw new Error(`Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month. Error: ${streamErrorMessage}`);
                }

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
                    // Check if the fallback error is also a monthly credits exceeded error
                    const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                    if (this.isMonthlyCreditsExceededError(fallbackErrorMessage)) {
                        // Blacklist all Huggingface models until the first of next month
                        this.blacklistAllHuggingfaceModelsUntilNextMonth(fallbackErrorMessage);
                        throw new Error(`Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month. Error: ${fallbackErrorMessage}`);
                    }

                    throw fallbackError; // Let the outer catch handle this
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error generating response from Huggingface:', errorMessage);

            // Check if this is a monthly credits exceeded error in the outer catch
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
                return `Error: Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month.`;
            }

            // Return error message instead of throwing to prevent system crashes
            // The Brain service will detect this as a failed response and handle fallback
            return `Error: ${errorMessage}`;
        }
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        try {
            const { service, prompt, modelName } = args;
            if (!service) {
                throw new Error('HuggingfaceInterface: No service provided for text-to-text conversion');
            }

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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error in Huggingface text generation:', errorMessage);

            // Check if this is a monthly credits exceeded error
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
                return `Error: Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month.`;
            }
            return `Error: ${errorMessage}`;
        }
    }

    async convertTextToImage(args: ConvertParamsType): Promise<Blob| undefined> {
        try {
            const { service, prompt, modelName } = args;
            if (!service) {
                console.log('HuggingfaceInterface: No service provided for text-to-text conversion');
                return Promise.resolve(undefined);
            }   
            const inference = new HfInference(service.apiKey);
            const response = await inference.textToImage({
                model: modelName || 'stabilityai/stable-diffusion-2',
                inputs: prompt || '',
            });
            return response;  // This is a base64 encoded image
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error in Huggingface text-to-image:', errorMessage);

            // Check if this is a monthly credits exceeded error
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
            }
            throw error; // Re-throw to be handled by the caller
        }
    }

    async convertTextToAudio(args: ConvertParamsType): Promise<Blob| undefined> {
        try {
            const { service, text, modelName } = args;
            if (!service) {
                console.log('HuggingfaceInterface: No service provided for text-to-text conversion');
                return Promise.resolve(undefined);
            }   
            const inference = new HfInference(service.apiKey);
            const response = await inference.textToSpeech({
                model: modelName || 'facebook/fastspeech2-en-ljspeech',
                inputs: text||'',
            });
            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error in Huggingface text-to-audio:', errorMessage);

            // Check if this is a monthly credits exceeded error
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
            }
            throw error; // Re-throw to be handled by the caller
        }
    }

    async convertAudioToText(args: ConvertParamsType): Promise<string> {
        try {
            const { service, audio, modelName } = args;
            if (!service) {
                console.log('HuggingfaceInterface: No service provided for text-to-text conversion');
                return Promise.resolve('');
            }   
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error in Huggingface audio-to-text:', errorMessage);

            // Check if this is a monthly credits exceeded error
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
                return `Error: Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month.`;
            }
            return `Error: ${errorMessage}`;
        }
    }

    async convertImageToText(args: ConvertParamsType): Promise<string> {
        try {
            const { service, image, modelName } = args;
            if (!service) {
                console.log('HuggingfaceInterface: No service provided for text-to-text conversion');
                return Promise.resolve('');
            }   
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error in Huggingface image-to-text:', errorMessage);

            // Check if this is a monthly credits exceeded error
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
                return `Error: Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month.`;
            }
            return `Error: ${errorMessage}`;
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        try {
            const converter = this.converters.get(conversionType);
            if (!converter) {
                throw new Error(`Conversion type ${conversionType} not supported by Huggingface interface`);
            }
            const requiredParams = converter.requiredParams;
            convertParams.service = service;
            const missingParams = requiredParams.filter((param: any) => !(param in convertParams));
            if (missingParams.length > 0) {
                throw new Error(`Missing required parameters for Huggingface conversion: ${missingParams.join(', ')}`);
            }
            return await converter.converter(convertParams);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if this is a monthly credits exceeded error
            if (this.isMonthlyCreditsExceededError(errorMessage)) {
                // Blacklist all Huggingface models until the first of next month
                this.blacklistAllHuggingfaceModelsUntilNextMonth(errorMessage);
                return `Error: Huggingface monthly credits exceeded. All Huggingface models have been blacklisted until the first of next month.`;
            }
            // For other errors, return a generic error message
            return `Error: ${errorMessage}`;
        }
    }
}

const aiInterface = new HuggingfaceInterface();
export default aiInterface;
