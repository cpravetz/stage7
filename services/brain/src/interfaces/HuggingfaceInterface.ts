import axios, { AxiosError } from 'axios';
import { ModelInterface } from './ModelInterface';

export class HuggingfaceInterface extends ModelInterface {
    name = 'Huggingface';
    private apiKey: string;
    private apiUrl: string = 'https://api-inference.huggingface.co/models/gpt2';

    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey;
    }

    async generate(messages: string[], options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const text = messages.join(' ');
        const data = {
            inputs: text,
            model: options.modelName || 'gpt2',
            parameters: {
                max_length: options.max_length || 2000,
                temperature: options.temperature || 0.7,
            },
        };

        try {
            const response = await axios.post(this.apiUrl, data, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data[0].generated_text;
        } catch (error) {
            console.error('Error generating response from Huggingface:', error);
            throw new Error('Failed to generate response from Huggingface');
        }
    }
}

const aiInterface = new HuggingfaceInterface(process.env.HUGGINGFACE_API_KEY || '');
export default aiInterface;
