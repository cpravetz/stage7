import axios, { AxiosError } from 'axios';
import { ModelInterface } from './ModelInterface';
import { HfInference } from '@huggingface/inference';
import { analyzeError } from '@cktmcs/errorhandler';

export class HuggingfaceInterface extends ModelInterface {
    name = 'Huggingface';
    private apiKey: string;
    private apiUrl: string = 'https://api-inference.huggingface.co/models/';

    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey;
    }

    async getChatCompletion(inference: HfInference, messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            let response: string = "";
            for await (const chunk of inference.chatCompletionStream({
                model: options.modelName || 'meta-llama/llama-3.2-3b-instruct',
                messages: messages,
                max_tokens: options.max_length || 2000,
                temperature: options.temperature || 0.8,
            })) {
                response += chunk.choices[0]?.delta?.content || "";
            }
            response = response.replace(/```[^]*?```/g, '');
            return response;
        } catch (error) { analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }

    private isResponseComplete(response: string): boolean {
        // Implement your logic here. For example:
        return response.endsWith('}') || response.toLowerCase().includes('end of response');
    }

    async generate(messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            const inference = new HfInference(this.apiKey);
            let response: string = await this.getChatCompletion(inference, messages, options) || "";

            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                if (this.isResponseComplete(response)) {
                    return response;
                } else {
                    console.log(`Response incomplete, attempt ${attempts + 1} of ${maxAttempts}`);
                    console.log(response);
                    messages.push({
                        role: 'system',
                        content: `Your response was truncated. Please continue from: "${response.substring(response.length - 50)}"`
                    });
                    const continuation = await this.getChatCompletion(inference, messages, options);
                    response += continuation;
                    attempts++;
                }
            }

            console.warn('Max attempts reached. Returning potentially incomplete response.');
            return response;
    
        } catch (error) { analyzeError(error as Error);
            console.error('Error generating response from Huggingface:', error instanceof Error ? error.message : error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }
}

const aiInterface = new HuggingfaceInterface(process.env.HUGGINGFACE_API_KEY || '');
export default aiInterface;
