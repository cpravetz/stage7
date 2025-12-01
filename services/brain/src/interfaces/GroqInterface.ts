import { BaseInterface, ConvertParamsType } from './baseInterface';
import { modelManagerInstance } from '../utils/modelManager';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService, ExchangeType } from '../services/baseService';
import OpenAI from 'openai';

export class GroqInterface extends BaseInterface {
    interfaceName = 'groq';

    constructor() {
        super('groq');

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
        this.converters.set(LLMConversationType.TextToJSON, {
            conversationType: LLMConversationType.TextToJSON,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToJSON,
        });
    }

    convertTextToText = async (args: ConvertParamsType): Promise<string> => {
        const { service, prompt, modelName, responseType } = args;

        if (!prompt) {
            console.log('GroqInterface: No prompt provided for text-to-text conversion');
            return Promise.resolve('');
        }

        if (!service) {
            console.log('GroqInterface: No service provided for text-to-text conversion');
            return Promise.resolve('');
        }

        console.log(`GroqInterface: Converting text-to-text with prompt: ${prompt.substring(0, 50)}...`);
        const formattedMessages: ExchangeType = [{ role: 'user', content: prompt }];

        console.log('GroqInterface: Calling chat method from convertTextToText');
        // Don't use this.chat directly, use the chat method of this instance
        return this.chat(service, formattedMessages, { modelName: modelName, responseType: responseType} );
    }

    convertTextToJSON = async (args: ConvertParamsType): Promise<string> => {
        const { service, prompt, modelName } = args;

        if (!prompt) {
            console.log('GroqInterface: No prompt provided for text-to-JSON conversion');
            return Promise.resolve('');
        }

        if (!service) {
            console.log('GroqInterface: No service provided for text-to-JSON conversion');
            return Promise.resolve('');
        }

        console.log(`GroqInterface: Converting text-to-JSON with prompt: ${prompt.substring(0, 50)}...`);

        const systemMessage = 'You are a JSON generation assistant. You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { or [ and ending with } or ].';

        const formattedMessages: ExchangeType = [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt }
        ];

        console.log('GroqInterface: Calling chat method from convertTextToJSON');
        const response = await this.chat(service, formattedMessages, { modelName: modelName, responseType: 'json'} );

        // Always apply JSON cleanup for TextToJSON conversion type
        const jsonResponse = await this.ensureJsonResponse(response, true, service);
        if (jsonResponse === null) {
            throw new Error("Failed to extract valid JSON from the model's response.");
        }
        return this.sanitizeResponse(jsonResponse, 'json');
    }

    chat = async (service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, responseType:string, response_format?: any }): Promise<string> => {
        console.log('GroqInterface: chat method called directly');
        const maxRetries = 5;
        let attempt = 0;
        let waitTime = 1000; // Initial wait time in ms
    let lastTokenLimit: number | undefined;
    let model: any = undefined;
    let modelIdentifier: string = options.modelName || 'groq/llama-3-8b-8192';

        while (attempt < maxRetries) {
            try {
                if (!service || !service.isAvailable() || !service.apiKey) {
                    throw new Error('Groq service is not available or API key is missing');
                }

                // Initialize the Groq client using OpenAI's SDK
                console.log(`GroqInterface: Using API key with length ${service.apiKey.length}`);
                console.log(`GroqInterface: Using API URL: ${service.apiUrl}`);

                const groqClient = new OpenAI({
                    apiKey: service.apiKey,
                    baseURL: service.apiUrl
                });

                // Get the model name from options or use a default
                // Strip the 'groq/' prefix if present
                modelIdentifier = options.modelName || 'groq/llama-3-8b-8192';
                let modelName = modelIdentifier;
                if (modelName.startsWith('groq/')) {
                    modelName = modelName.substring(5); // Remove 'groq/' prefix
                }

                console.log(`Using Groq model: ${modelName}`);

                // Get the model from the model manager to check the token limit
                model = modelManagerInstance.getModel(modelIdentifier);
                let tokenLimit = model ? model.tokenLimit : 8192; // Default to 8192 if model not found
                lastTokenLimit = tokenLimit;

                // Format messages for Groq API (OpenAI format)
                const formattedMessages = messages.map(msg => {
                    const content = msg.content || (msg as any).message || '';
                    return {
                        role: msg.role === 'user' ? 'user' : 'assistant',
                        content: content
                    } as OpenAI.ChatCompletionMessageParam;
                });

                if (formattedMessages.length > 0 && typeof formattedMessages[0].content === 'string' && formattedMessages[0].content.length > 10000) {
                    console.log(`GroqInterface: First message is very long (${formattedMessages[0].content.length} chars), it might be truncated by the API`);
                }

                let maxTokens = Math.min(options.max_length || 6000, tokenLimit);
                const requestOptions: any = {
                    model: modelName,
                    messages: formattedMessages,
                    temperature: options.temperature || 0.7,
                    max_tokens: maxTokens,
                    stream: false
                };

                if (options.response_format) {
                    console.log(`GroqInterface: Setting response_format to ${JSON.stringify(options.response_format)}`);
                    requestOptions.response_format = options.response_format;
                }
                console.log(`GroqInterface: Full request options: ${JSON.stringify(requestOptions, (key, value) => {
                    if (key === 'content' && typeof value === 'string' && value.length > 200) {
                        return value.substring(0, 200) + '... (truncated)';
                    }
                    return value;
                }, 2)}`);

                const completion = await groqClient.chat.completions.create(requestOptions);

                if (completion.choices && completion.choices.length > 0) {
                    const content = completion.choices[0].message.content || '';
                    console.log(`GroqInterface: Received response with content: ${content.substring(0, 140)}... (truncated)`);
                    const requireJson = (options.response_format?.type === 'json_object') || options.responseType === 'json';
                    if (requireJson) {
                        const jsonResponse = await this.ensureJsonResponse(content, true, service);
                        if (jsonResponse === null) {
                            throw new Error("Failed to extract valid JSON from the model's response.");
                        }
                        return this.sanitizeResponse(jsonResponse, 'json');
                    }
                    return this.sanitizeResponse(content, 'text');
                }

                return '';
            } catch (error: Error | any) {
                // Handle context window/max_tokens errors
                if (error.message && error.message.match(/max_tokens|context_window|maximum context length/i) && attempt < maxRetries - 1) {
                    attempt++;
                    // Reduce max_tokens and update model tokenLimit
                    lastTokenLimit = Math.max(Math.floor((lastTokenLimit || 8192) * 0.75), 512);
                    if (model) {
                        model.tokenLimit = lastTokenLimit;
                        console.warn(`GroqInterface: Reducing tokenLimit for model ${modelIdentifier} to ${lastTokenLimit}`);
                    }
                    options.max_length = lastTokenLimit;
                    console.warn(`GroqInterface: Context window error. Retrying with max_tokens=${lastTokenLimit} (Attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    waitTime *= 2;
                    continue;
                }
                if (error.status === 429 && attempt < maxRetries - 1) {
                    attempt++;
                    const retryAfter = error.headers['retry-after'];
                    if (retryAfter) {
                        const retryAfterSeconds = parseInt(retryAfter, 10);
                        if (!isNaN(retryAfterSeconds)) {
                            waitTime = retryAfterSeconds * 1000;
                        }
                    }
                    console.warn(`Rate limit exceeded. Retrying in ${waitTime / 1000} seconds... (Attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    waitTime *= 2; // Exponential backoff
                    continue;
                } else {
                    console.error('Error generating response from Groq:', error instanceof Error ? error.message : error);
                    throw error; // Rethrow to allow the Brain to handle the error
                }
            }
        }
        throw new Error('Failed to get response from Groq after multiple retries');
    }

    convert = async (service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> => {
        console.log(`GroqInterface: convert method called with conversion type: ${conversionType}`);
        console.log(`GroqInterface: convertParams:`, JSON.stringify(convertParams, null, 2));

        const converter = this.converters.get(conversionType);
        if (!converter) {
            console.log(`GroqInterface: Unsupported conversion type: ${conversionType}`);
            return undefined;
        }

        // Ensure service is set
        convertParams.service = service;

        // If messages are provided but prompt is not, extract prompt from the last message
        if (!convertParams.prompt && convertParams.messages && Array.isArray(convertParams.messages) && convertParams.messages.length > 0) {
            const lastMessage = convertParams.messages[convertParams.messages.length - 1];
            if (lastMessage && typeof lastMessage === 'object' && 'content' in lastMessage) {
                convertParams.prompt = String(lastMessage.content || '');
                if (convertParams.prompt) {
                    const previewLength = Math.min(50, convertParams.prompt.length);
                    console.log(`Extracted prompt from messages: ${convertParams.prompt.substring(0, previewLength)}${previewLength < convertParams.prompt.length ? '...' : ''}`);
                }
            }
        }

        const requiredParams = converter.requiredParams;
        const missingParams = requiredParams.filter((param: any) => !(param in convertParams));
        if (missingParams.length > 0) {
            console.log(`Missing required parameters: ${missingParams.join(', ')}`);
            return undefined;
        }

        return converter.converter(convertParams);
    }
}

const aiInterface = new GroqInterface();
export default aiInterface;
