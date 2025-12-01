import { BaseInterface } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService, ExchangeType } from '../services/baseService';

export class OpenWebUIInterface extends BaseInterface {
    interfaceName: string = 'openwebui';
    private readonly DEFAULT_TIMEOUT = 300000; // 300 seconds timeout for openwebui model (increased from 60s)

    constructor() {
        super('openwebui');
        console.log(`OpenWebUIInterface initialized with DEFAULT_TIMEOUT: ${this.DEFAULT_TIMEOUT}ms`);
    }

    async chat(
        service: BaseService,
        messages: ExchangeType,
        options: {
            max_length?: number,
            temperature?: number,
            modelName?: string,
            responseType?: string,
            streamCallback?: (chunk: string) => void,
            signal?: AbortSignal,
        } = {}
    ): Promise<string> {
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
                content: msg.content || '', // Ensure content is never undefined or null
            }));

            console.log('Formatted messages for OpenWebUI:', JSON.stringify(formattedMessages));

            // Prepare request body
            const body = JSON.stringify({
                model: options.modelName,
                messages: formattedMessages,
                temperature: options.temperature || 0.3,
                max_tokens: options.max_length || 4096,
                stream: !!options.streamCallback
            });

            console.log(`Sending request to OpenWebUI at ${baseUrl}/api/chat/completions`);

            // Controller and timeout setup
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.error(`OpenWebUI request timed out after ${this.DEFAULT_TIMEOUT}ms`);
            }, this.DEFAULT_TIMEOUT);

            const signalToUse = options.signal || controller.signal;

            try {
                const response = await fetch(`${baseUrl}/api/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body,
                    signal: signalToUse
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`OpenWebUI API error (${response.status}): ${errorText}`);
                    throw new Error(`OpenWebUI API error: ${response.status} - ${errorText}`);
                }

                clearTimeout(timeoutId);

                if (!options.streamCallback) {
                    let data;
                    try {
                        data = await response.json();
                        console.log('OpenWebUI response received successfully');
                    } catch (err) {
                        console.error('OpenWebUI Error parsing JSON response:', err);
                        throw new Error('Failed to parse OpenWebUI response');
                    }

                    if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                        let content = data.choices[0].message.content;
                        // Sanitize text responses to remove control characters that break downstream consumers
                        content = this.sanitizeString(content);
                        console.log(`OpenWebUI: Received response with content: ${content.substring(0, 140)}... (truncated)`);

                        const requireJson = options.responseType === 'json';
                        if (requireJson) {
                            // ensureJsonResponse expects raw text; sanitizeString above preserves JSON structural chars
                            const jsonResponse = await this.ensureJsonResponse(content, true, service);
                            if (jsonResponse === null) {
                                throw new Error("OpenWebUI Failed to extract valid JSON from the model's response.");
                            }
                            // sanitize final JSON string (removes control chars inside any string fields)
                            return this.sanitizeResponse(jsonResponse, 'json');
                        }
                        return this.sanitizeResponse(content, 'text');
                    } else {
                        console.error('Unexpected response format from OpenWebUI:', JSON.stringify(data));
                        throw new Error('Unexpected response format from OpenWebUI');
                    }
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error('ReadableStream not supported in response body');
                }

                const decoder = new TextDecoder('utf-8');
                let done = false;
                let accumulated = '';

                while (!done) {
                    const { value, done: doneReading } = await reader.read();
                    done = doneReading;
                    if (value) {
                        const chunk = decoder.decode(value, { stream: true });
                        accumulated += chunk;
                        options.streamCallback(chunk);
                    }
                }

                if (options.responseType === 'json') {
                    const jsonResponse = await this.ensureJsonResponse(accumulated, true, service);
                    if (jsonResponse === null) {
                        throw new Error("OpenWebUI Failed to extract valid JSON from the streamed response.");
                    }
                    return this.sanitizeResponse(jsonResponse, 'json');
                }

                // Sanitize streamed text
                return this.sanitizeResponse(accumulated, 'text');

            } catch (fetchError: unknown) {
                clearTimeout(timeoutId);

                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                    throw new Error(`OpenWebUI request timed out after ${this.DEFAULT_TIMEOUT}ms`);
                }
                throw fetchError;
            }
        } catch (error) {
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
                const jsonResponse = await this.ensureJsonResponse(response, true, service);
                if (jsonResponse === null) {
                    throw new Error("Failed to extract valid JSON from the model's response.");
                }
                return jsonResponse;
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
                return this.ensureJsonResponse(response, true, service);
            }

            return response;
        }

        throw new Error('No prompt or messages provided for OpenWebUI conversion');
    }
}

const openWebUIInterface = new OpenWebUIInterface();
export default openWebUIInterface;
