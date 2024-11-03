
const getUserInputPlugin = {
    id: 'plugin-GET_USER_INPUT',
    verb: 'GET_USER_INPUT',
    description: 'Requests input from the user',
    explanation: 'This plugin sends a question to the user and returns their response',
    inputs: [
        {
            name: 'question',
            type: 'string',
            description: 'The question to ask the user'
        },
        {
            name: 'choices',
            type: 'array',
            description: 'Optional array of choices for multiple choice questions'
        },
        {
            name: 'answerType',
            type: 'string',
            description: 'Type of answer expected (text, number, boolean, or multipleChoice)'
        }
    ],
    outputs: [
        {
            name: 'result',
            type: 'string',
            description: 'The user\'s response'
        }
    ],
    language: 'javascript',
    entryPoint: {
        main: 'GET_USER_INPUT.js',
        files: [
            {
                'main.js': `
const axios = require('axios');

async function execute(input) {
    try {
        const { question, choices, answerType } = input.args;

        if (!question) {
            throw new Error('Question is required for GET_USER_INPUT plugin');
        }

        const postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020';
        const response = await sendUserInputRequest(postOfficeUrl, { question, choices, answerType });

        return {
            success: true,
            resultType: 'string',
            resultDescription: 'User response',
            result: response,
            mimeType: 'text/plain'
        };
    } catch (error) {
        console.error('GET_USER_INPUT plugin failed', error);
        return {
            success: false,
            resultType: 'error',
            resultDescription: 'Error getting user input',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
            mimeType: 'text/plain'
        };
    }
}

async function sendUserInputRequest(postOfficeUrl, request) {
    try {
        const response = await axios.post(\`http://\${postOfficeUrl}/sendUserInputRequest\`, request);
        return response.data.result;
    } catch (error) {
        console.error('Error sending user input request:', error);
        throw new Error('Failed to get user input');
    }
}

module.exports = { execute };
                `
            }
        ]
    }
};

export default getUserInputPlugin;