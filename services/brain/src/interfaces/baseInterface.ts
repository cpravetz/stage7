import { BaseService, ExchangeType } from '../services/baseService';

export enum LLMConversationType {
    TextToText = 'text/text',
    TextToImage = 'text/image',
    TextToAudio = 'text/audio',
    TextToVideo = 'text/video',
    AudioToText = 'audio/text',
    ImageToText = 'image/text',
    ImageToImage = 'image/image',
    ImageToAudio = 'image/audio',
    ImageToVideo = 'image/video',
    VideoToText = 'video/text',
    VideoToImage = 'video/image',
    VideoToAudio = 'video/audio',
    VideoToVideo = 'video/video',
    TextToCode = 'text/code',
    CodeToText = 'code/text',
}

export type converterType = {
    conversationType : LLMConversationType,
    requiredParams: string[],
    converter : Function
}

export type ConvertParamsType = {
    service: BaseService,
    prompt?: string,
    modelName?: string,
    audio? : string,
    video? : string,
    image? : string,
    file? : string,
    input?: string,
    text?: string,
    language?: string,
    quality?: string,
    style?: string,
    mask?: string,
    voice?: string,
    temperature?: number,
    response_format?: string,
    size?: string,
    messages?: ExchangeType[],
    max_length?: number,
    format?: string,
}

export abstract class BaseInterface {
    abstract interfaceName: string;
    converters: Map<LLMConversationType, converterType> = new Map();

    constructor() {

    }
    abstract chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number }): Promise<string>;

    abstract convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> ;

    /**
     * Helper method to ensure a response is in JSON format
     * @param response The response from the LLM
     * @param requireJson Whether JSON is required
     * @returns The response, possibly converted to JSON
     */
    protected ensureJsonResponse(response: string, requireJson: boolean = false): string {
        if (!requireJson) {
            return response;
        }

        // Check if the response is already valid JSON
        try {
            JSON.parse(response.trim());
            console.log('Response is already valid JSON');
            return response;
        } catch (e) {
            console.log('Response is not valid JSON, attempting to fix');
        }

        // If the response doesn't contain any JSON-like structure, wrap it in a DIRECT_ANSWER
        if (!response.includes('{') && !response.includes('}')) {
            console.log('Response does not contain any JSON-like structure, wrapping in DIRECT_ANSWER');
            return JSON.stringify({
                type: 'DIRECT_ANSWER',
                answer: response.trim()
            });
        }

        // Try to extract JSON from the response
        const jsonRegex = /\{[\s\S]*\}/;
        const match = response.match(jsonRegex);
        if (match) {
            console.log('Found JSON-like structure in response, attempting to parse');
            try {
                const extracted = match[0];
                JSON.parse(extracted); // Validate it's valid JSON
                return extracted;
            } catch (e) {
                console.log('Extracted JSON-like structure is not valid JSON');
            }
        }

        // If all else fails, wrap the response in a DIRECT_ANSWER
        console.log('Could not extract valid JSON, wrapping in DIRECT_ANSWER');
        return JSON.stringify({
            type: 'DIRECT_ANSWER',
            answer: response.trim()
        });
    }

    protected trimMessages(messages: ExchangeType, maxTokens: number): ExchangeType {
        const targetTokens = Math.floor(maxTokens / 2);
        let estimatedTokens = 0;
        const trimmedMessages: ExchangeType = [];

        // Estimate tokens (4 characters ~= 1 token)
        const estimateTokens = (text: string) => Math.ceil(text.length / 4);

        // Iterate through messages in reverse order
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            let messageTokens = 0;

            if (typeof message.content === 'string') {
                messageTokens = estimateTokens(message.content);
            }

            if (i === messages.length - 1 || estimatedTokens + messageTokens <= targetTokens) {
                trimmedMessages.unshift(message);
                estimatedTokens += messageTokens;
            } else {
                break;
            }
        }

        return trimmedMessages;
    }
}

export default BaseInterface;