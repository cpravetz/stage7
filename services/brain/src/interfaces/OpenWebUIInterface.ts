import { BaseInterface, LLMConversationType } from './baseInterface';
import { BaseService, ExchangeType } from '../services/baseService';
import { analyzeError } from '@cktmcs/errorhandler';

export class OpenWebUIInterface extends BaseInterface {
    interfaceName: string = 'openwebui';

    constructor() {
        super();
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number } = {}): Promise<string> {
        try {
            if (!service || !service.isAvailable()) {
                throw new Error('OpenWebUI service is not available');
            }

            const baseUrl = service.apiUrl;
            const apiKey = service.apiKey;

            if (!baseUrl || !apiKey) {
                throw new Error('OpenWebUI service configuration is incomplete');
            }

            // Format messages for OpenWebUI API
            // Ensure all messages have valid content (not undefined or null)
            const formattedMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content || '' // Ensure content is never undefined or null
            }));

            // Log the formatted messages for debugging
            console.log('Formatted messages for OpenWebUI:', JSON.stringify(formattedMessages));

            // Prepare request body
            const body = JSON.stringify({
                model: 'knownow', // Default model name
                messages: formattedMessages,
                // Optional parameters
                temperature: options.temperature || 0.3,
                max_tokens: options.max_length || 4096,
            });

            console.log(`Sending request to OpenWebUI at ${baseUrl}/api/chat/completions`);

            // Make the API call
            const response = await fetch(`${baseUrl}/api/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                },
                body
            });

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
                console.log('OpenWebUI response data:', JSON.stringify(data));
            } catch (err) {
                console.error('Error parsing JSON response:', err);
                throw new Error('Failed to parse OpenWebUI response');
            }

            // Extract the response content
            if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                return data.choices[0].message.content;
            } else {
                console.error('Unexpected response format from OpenWebUI:', JSON.stringify(data));
                throw new Error('Unexpected response format from OpenWebUI');
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error in OpenWebUI interface:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: any): Promise<any> {
        // OpenWebUI only supports text-to-text conversion
        if (conversionType !== LLMConversationType.TextToText) {
            throw new Error(`Conversion type ${conversionType} not supported by OpenWebUI interface`);
        }

        // If we have a prompt, use it to create a simple message
        if (convertParams.prompt) {
            return this.chat(service, [{ role: 'user', content: convertParams.prompt }], {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length
            });
        }

        // If we have messages, use them directly
        if (convertParams.messages) {
            return this.chat(service, convertParams.messages, {
                temperature: convertParams.temperature,
                max_length: convertParams.max_length
            });
        }

        throw new Error('No prompt or messages provided for OpenWebUI conversion');
    }
}

const openWebUIInterface = new OpenWebUIInterface();
export default openWebUIInterface;
