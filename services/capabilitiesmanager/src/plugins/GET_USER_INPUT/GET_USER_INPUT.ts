import axios from 'axios';
import { PluginParameterType, PluginInput, PluginOutput } from '@cktmcs/shared';

interface UserInputRequest {
    question: string;
    choices?: string[];
    answerType: 'text' | 'number' | 'boolean' | 'multipleChoice';
}

export async function execute(inputs: Map<string, PluginInput>): Promise<PluginOutput> {
        try {
            const question = inputs.get('question')?.inputValue || '';
            const choices = inputs.get('choices')?.inputValue || [];
            const answerType = inputs.get('answerType')?.inputValue || 'text';

            if (question === '') {
                throw new Error('Question is required for GET_USER_INPUT plugin');
            }

            const response = await sendUserInputRequest({ question, choices, answerType });

            return {
                success: true,
                resultType: PluginParameterType.STRING,
                resultDescription: 'User response',
                result: response
            };
        } catch (error) {
            return {
                success: false,
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error',
                result: null,
                error: error instanceof Error ? error.message : 'An unknown error occurred'
            };
        }
    }

async function sendUserInputRequest(request: { question: string; choices?: string[]; answerType?: string }): Promise<string> {
        try {
            const postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020';
            const response = await axios.post(`http://${postOfficeUrl}/sendUserInputRequest`, request);
            return response.data.result;
        } catch (error) {
            console.error('Error sending user input request:', error);
            throw new Error('Failed to get user input');
        }
    }


export default execute;