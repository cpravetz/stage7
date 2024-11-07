import { ModelInterface } from './ModelInterface';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { analyzeError } from '@cktmcs/errorhandler';


export class OpenRouterInterface extends ModelInterface {
    name = 'OpenRouter';
    private openRouterApiClient: OpenAI;

    constructor(apiKey: string) {
        super();
        this.openRouterApiClient = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" }); 
    }

    async generate(messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const max_length = options.max_length || 2000;
        const temperature = options.temperature || 0.7;

        try {
            const response = await this.openRouterApiClient.chat.completions.create({
                model: options.modelName || 'gpt-4',
                messages: messages as ChatCompletionMessageParam[],
                temperature,
                max_tokens: max_length,
            });

            if (!response.choices[0].message?.content) {
                throw new Error('No content in OpenRouter response');
            }

            return response.choices[0].message.content;
        } catch (error) { analyzeError(error as Error);
            console.error('Error generating response from OpenRouter:', error instanceof Error ? error.message : error);
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