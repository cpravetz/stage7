import { ModelInterface } from './ModelInterface';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

export class OpenAIInterface extends ModelInterface {
    name = 'OpenAI';
    private openAiApiClient: OpenAI;

    constructor(apiKey: string) {
        super();
        this.openAiApiClient = new OpenAI({ apiKey });
    }

    async generate(messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const max_length = options.max_length || 2000;
        const temperature = options.temperature || 0.7;

        try {
            const response = await this.openAiApiClient.chat.completions.create({
                model: options.modelName || 'gpt-4',
                messages: messages as ChatCompletionMessageParam[],
                temperature,
                max_tokens: max_length,
            });
            if (!response.choices[0].message?.content) {
                throw new Error('No content in OpenAI response');
            }

            return response.choices[0].message.content;
        } catch (error) {
            console.error('Error generating response from OpenAI:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to generate response from OpenAI: ${error.message}`);
            } else {
                throw new Error('Failed to generate response from OpenAI: Unknown error');
            }
        }
    }

}

const aiInterface = new OpenAIInterface(process.env.OPENAI_API_KEY || '');
export default aiInterface;