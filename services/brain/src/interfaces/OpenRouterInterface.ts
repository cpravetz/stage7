import { ModelInterface } from './ModelInterface';
import OpenAI from 'openai';


export class OpenRouterInterface extends ModelInterface {
    name = 'OpenRouter';
    private OpenRouterApiClient: OpenAI;

    constructor(apiKey: string) {
        super();
        this.OpenRouterApiClient = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" }); 
    }

    async generate(messages: string[], options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const max_length = options.max_length || 2000;
        const temperature = options.temperature || 0.7;

        // Format messages for OpenRouter API
        const formattedMessages = messages.map((message) => ({ role: 'user' as const, content: message }));

        try {
            const response = await this.OpenRouterApiClient.chat.completions.create({
                model: options.modelName || 'gpt-4',
                messages: formattedMessages,
                temperature,
                max_tokens: max_length,
            });

            if (!response.choices[0].message?.content) {
                throw new Error('No content in OpenRouter response');
            }

            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error generating response from OpenRouter:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate response from OpenRouter: ${error.message}`);
            } else {
                throw new Error('Failed to generate response from OpenRouter: Unknown error');
            }
        }
    }

}

const aiInterface = new OpenRouterInterface(process.env.OPENROUTER_API_KEY || '');
export default aiInterface;