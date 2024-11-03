import { ModelInterface } from './ModelInterface';
import OpenAI from 'openai';

export class OpenAIInterface extends ModelInterface {
    name = 'OpenAI';
    private openAiApiClient: OpenAI;

    constructor(apiKey: string) {
        super();
        this.openAiApiClient = new OpenAI({ apiKey });
    }

    async generate(messages: string[], options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        const max_length = options.max_length || 2000;
        const temperature = options.temperature || 0.7;

        // Format messages for OpenAI API
        const formattedMessages = messages.map((message) => ({ role: 'user' as const, content: message }));

        try {
            const response = await this.openAiApiClient.chat.completions.create({
                model: options.modelName || 'gpt-4',
                messages: formattedMessages,
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