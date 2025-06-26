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

    convertTextToText = async (args: ConvertParamsType): Promise<string> => {
        const { service, prompt, modelName } = args;

        if (!prompt) {
            console.log('GroqInterface: No prompt provided for text-to-text conversion');
            return Promise.resolve('');
        }

        console.log(`GroqInterface: Converting text-to-text with prompt: ${prompt.substring(0, 50)}...`);
        const formattedMessages: ExchangeType = [{ role: 'user', content: prompt }];

        console.log('GroqInterface: Calling chat method from convertTextToText');
        // Don't use this.chat directly, use the chat method of this instance
        return this.chat(service, formattedMessages, { modelName: modelName });
    }

    chat = async (service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, response_format?: any }): Promise<string> => {
        console.log('GroqInterface: chat method called directly');
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
            let modelName = options.modelName || 'llama-3-8b-8192';
            if (modelName.startsWith('groq/')) {
                modelName = modelName.substring(5); // Remove 'groq/' prefix
            }

            console.log(`Using Groq model: ${modelName}`);

            // Format messages for Groq API (OpenAI format)
            const formattedMessages = messages.map(msg => {
                // Check if the message has a 'message' property instead of 'content'
                // This is to handle a potential issue where the message structure might be incorrect
                const content = msg.content || (msg as any).message || '';

                // Log the message structure for debugging
                console.log(`GroqInterface: Message structure: ${JSON.stringify(msg, null, 2)}`);

                return {
                    role: msg.role === 'user' ? 'user' : 'assistant',
                    content: content
                } as OpenAI.ChatCompletionMessageParam;
            });

            // Log the formatted messages
            console.log(`GroqInterface: Formatted messages: ${JSON.stringify(formattedMessages, (key, value) => {
                // Truncate long content for readability
                if (key === 'content' && typeof value === 'string' && value.length > 200) {
                    return value.substring(0, 200) + '... (truncated)';
                }
                return value;
            }, 2)}`);

            // Check if the first message is very long and might need to be truncated
            if (formattedMessages.length > 0 && typeof formattedMessages[0].content === 'string' && formattedMessages[0].content.length > 10000) {
                console.log(`GroqInterface: First message is very long (${formattedMessages[0].content.length} chars), it might be truncated by the API`);
            }

            // Check if we need to request a JSON response
            const requestOptions: any = {
                model: modelName,
                messages: formattedMessages,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_length || 2048,
                stream: false
            };

            // Add response_format if specified in options
            if (options.response_format) {
                console.log(`GroqInterface: Setting response_format to ${JSON.stringify(options.response_format)}`);
                requestOptions.response_format = options.response_format;
            } /*else if (messages && messages.length > 0 && messages[0].content &&
                      (messages[0].content.includes('JSON') || messages[0].content.includes('json'))) {
                // If the message content mentions JSON, set response_format to JSON
                console.log('GroqInterface: JSON format detected in message, setting response_format to JSON');
                requestOptions.response_format = { type: 'json_object' };
            }*/

            // Log the full request for debugging
            console.log(`GroqInterface: Full request options: ${JSON.stringify(requestOptions, (key, value) => {
                // Truncate long message content for readability
                if (key === 'content' && typeof value === 'string' && value.length > 200) {
                    return value.substring(0, 200) + '... (truncated)';
                }
                return value;
            }, 2)}`);

            // Log the first 500 characters of the first message content for debugging
            if (messages && messages.length > 0 && messages[0].content) {
                const content = messages[0].content;
                console.log(`GroqInterface: First message content preview: ${content.substring(0, 500)}${content.length > 500 ? '... (truncated)' : ''}`);
            }

            // Create the completion
            const completion = await groqClient.chat.completions.create(requestOptions);

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
