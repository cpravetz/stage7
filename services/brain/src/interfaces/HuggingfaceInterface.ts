import axios, { AxiosError } from 'axios';
import { ModelInterface } from './ModelInterface';
import { HfInference } from '@huggingface/inference';

export class HuggingfaceInterface extends ModelInterface {
    name = 'Huggingface';
    private apiKey: string;
    private apiUrl: string = 'https://api-inference.huggingface.co/models/';

    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey;
    }

    async generate(messages: string[], options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            const inference = new HfInference(this.apiKey);
            let response:string = "";
            for await (const chunk of inference.chatCompletionStream({
                model: options.modelName || 'meta-llama/llama-3.2-3b-instruct',
                messages: messages,
                max_tokens: options.max_length || 1000,
                temperature: options.temperature || 0.7,
            })) {
                response += chunk.choices[0]?.delta?.content || "";
            }

            console.log('HF response: ', response);
            return response;
    
        } catch (error) {
            console.error('Error generating response from Huggingface:', error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }
}

const aiInterface = new HuggingfaceInterface(process.env.HUGGINGFACE_API_KEY || '');
export default aiInterface;
