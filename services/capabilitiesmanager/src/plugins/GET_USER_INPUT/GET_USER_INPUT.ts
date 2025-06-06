import axios from 'axios';
import { PluginParameterType, PluginInput, PluginOutput, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

interface UserInputRequest {
    question: string;
    choices?: string[];
    answerType: 'text' | 'number' | 'boolean' | 'multipleChoice';
}

export async function execute(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        try {
            const question = inputs.get('question')?.inputValue || '';
            const choices = inputs.get('choices')?.inputValue || [];
            const answerType = inputs.get('answerType')?.inputValue || 'text';

            if (question === '') {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Error in execute',
                    result: null,
                    error: 'Question is required for GET_USER_INPUT plugin'
                }];
            }

            const response = await sendUserInputRequest({ question, choices, answerType });

            return [{
                success: true,
                name: 'answer',
                resultType: PluginParameterType.STRING,
                resultDescription: 'User response',
                result: response
            }];
        } catch (error) { analyzeError(error as Error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in execute',
                result: null,
                error: error instanceof Error ? error.message : 'An unknown error occurred'
            }];
        }
    }

// Create an authenticated API client
const securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';
const authenticatedApi = createAuthenticatedAxios(
    'GET_USER_INPUT_Plugin',
    securityManagerUrl,
    process.env.CLIENT_SECRET || 'stage7AuthSecret'
);

async function sendUserInputRequest(request: { question: string; choices?: string[]; answerType?: string }): Promise<string> {
        try {
            const postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020';
            const response = await authenticatedApi.post(`http://${postOfficeUrl}/sendUserInputRequest`, request);
            return response.data.result;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error sending user input request:', error instanceof Error ? error.message : error);
            return '';
        }
    }


export default execute;