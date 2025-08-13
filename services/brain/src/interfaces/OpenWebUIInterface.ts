import { BaseInterface } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService, ExchangeType } from '../services/baseService';
import { analyzeError } from '@cktmcs/errorhandler';

export class OpenWebUIInterface extends BaseInterface {
    interfaceName: string = 'openwebui';
    private readonly DEFAULT_TIMEOUT = 300000; // 5 minutes timeout for knownow model

    constructor() {
        super('openwebui');
        console.log(`OpenWebUIInterface initialized with DEFAULT_TIMEOUT: ${this.DEFAULT_TIMEOUT}ms`);
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, responseType?: string } = {}): Promise<string> {
        try {
            if (!service || !service.isAvailable()) {
                throw new Error('OpenWebUI service is not available');
            }

            const baseUrl = service.apiUrl;
            const apiKey = service.apiKey;

            if (!baseUrl || !apiKey) {
                throw new Error('OpenWebUI service configuration is incomplete');
            }

            console.log(`OpenWebUI service URL: ${baseUrl}`);
            console.log(`OpenWebUI API key available: ${apiKey ? 'Yes' : 'No'}`);
            console.log(`Using timeout of ${this.DEFAULT_TIMEOUT}ms for OpenWebUI request`);

            // If responseType is 'json', prepend a system prompt to enforce JSON output
            let contentParts = messages;
            if (options.responseType === 'json') {
                contentParts = [
                    { role: 'system', content: 'You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { and ending with }.' },
                    ...messages
                ];
            }

            // Format messages for OpenWebUI API
            // Ensure all messages have valid content (not undefined or null)
            const formattedMessages = contentParts.map(msg => ({
                role: msg.role,
                content: msg.content || '' // Ensure content is never undefined or null
            }));

            // Log the formatted messages for debugging
            console.log('Formatted messages for OpenWebUI:', JSON.stringify(formattedMessages));

            // Prepare request body
            const body = JSON.stringify({
                model: options.modelName,
                messages: formattedMessages,
                // Optional parameters
                temperature: options.temperature || 0.3,
                max_tokens: options.max_length || 4096,
                stream: false // Disable streaming for simplicity
            });

            console.log(`Sending request to OpenWebUI at ${baseUrl}/api/chat/completions`);

            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.error(`OpenWebUI request timed out after ${this.DEFAULT_TIMEOUT}ms`);
            }, this.DEFAULT_TIMEOUT);

            try {
                // Make the actual API call with timeout
                const response = await fetch(`${baseUrl}/api/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: body,
                    signal: controller.signal
                });

                // Clear the timeout since we got a response
                clearTimeout(timeoutId);

                if (!response.ok) {
                    try {
                        const errorText = await response.text();
                        console.error(`OpenWebUI API error (${response.status}): ${errorText}`);

                        // If we get a 400 error with 'content' in the error message, it's likely a formatting issue
                        if (response.status === 400 && errorText.includes('content')) {
                            console.error('Content format error detected. Request body was:', body);
                            throw new Error(`OpenWebUI API content format error: ${response.status} - ${errorText}`);
                        }

                        throw new Error(`OpenWebUI API error: ${response.status} - ${errorText}`);
                    } catch (err) {
                        console.error('Error parsing error response:', err);
                        throw new Error(`OpenWebUI API error: ${response.status}`);
                    }
                }

                let data;
                try {
                    data = await response.json();
                    console.log('OpenWebUI response received successfully');
                    console.log(`OpenWebUI response data length: ${JSON.stringify(data).length} characters`);
                } catch (err) {
                    console.error('Error parsing JSON response:', err);
                    throw new Error('Failed to parse OpenWebUI response');
                }

                // Extract the response content
                if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                    const content = data.choices[0].message.content;
                    console.log(`OpenWebUI: Received response with content: ${content.substring(0, 140)}... (truncated)`);

                    // --- Ensure JSON if required ---
                    let requireJson = options.responseType === 'json' ? true : false;
                    if (requireJson) {
                        return this.ensureJsonResponse(content, true);
                    }
                    return content;
                } else {
                    console.error('Unexpected response format from OpenWebUI:', JSON.stringify(data));
                    throw new Error('Unexpected response format from OpenWebUI');
                }
            } catch (fetchError: unknown) {
                // Clear the timeout if there was an error
                clearTimeout(timeoutId);

                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                    throw new Error(`OpenWebUI request timed out after ${this.DEFAULT_TIMEOUT}ms`);
                }
                throw fetchError;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error in OpenWebUI interface:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: any): Promise<any> {
        // OpenWebUI supports text-to-text and text-to-JSON conversion
        if (conversionType !== LLMConversationType.TextToText && conversionType !== LLMConversationType.TextToJSON) {
            throw new Error(`Conversion type ${conversionType} not supported by OpenWebUI interface`);
        }

        let messages: ExchangeType = [];

        // Handle TextToJSON with special system message
        if (conversionType === LLMConversationType.TextToJSON) {
            const systemMessage = 'You are a JSON generation assistant. You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { or [ and ending with } or ].';
            messages.push({ role: 'system', content: systemMessage });
        }

        // If we have a prompt, use it to create a simple message
        if (convertParams.prompt) {
            messages.push({ role: 'user', content: convertParams.prompt });

            const response = await this.chat(service, messages, {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length,
                modelName: convertParams.modelName,
                responseType: conversionType === LLMConversationType.TextToJSON ? 'json' : convertParams.responseType
            });

            // Apply JSON cleanup for TextToJSON conversion type
            if (conversionType === LLMConversationType.TextToJSON) {
                return this.ensureJsonResponse(response, true);
            }

            return response;
        }

        // If we have messages, use them directly
        if (convertParams.messages) {
            const allMessages = [...messages, ...convertParams.messages];
            const response = await this.chat(service, allMessages, {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length,
                responseType: conversionType === LLMConversationType.TextToJSON ? 'json' : convertParams.responseType
            });

            // Apply JSON cleanup for TextToJSON conversion type
            if (conversionType === LLMConversationType.TextToJSON) {
                return this.ensureJsonResponse(response, true);
            }

            return response;
        }

        throw new Error('No prompt or messages provided for OpenWebUI conversion');
    }
}

const openWebUIInterface = new OpenWebUIInterface();
export default openWebUIInterface;
