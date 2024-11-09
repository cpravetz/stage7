const accomplishPlugin = {
    id: 'plugin-ACCOMPLISH',
    verb: 'ACCOMPLISH',
    description: 'Accomplishes a given goal or creates a plan to achieve it',
    explanation: 'This plugin takes a goal statement and either returns the result of accomplishing the goal or a plan of tasks to achieve it',
    inputDefinitions: [
        {
            name: 'goal',
            required: true,
            type: 'string',
            description: 'The goal to be accomplished or planned for'
        }
    ],
    outputDefinitions: [
        {
            name: 'plan',
            required: false,
            type: 'plan',
            description: 'A plan of tasks to achieve the goal, or a direct answer if the goal can be immediately accomplished'
        },
        {
            name: 'answer',
            required: false,
            type: 'string',
            description: 'A solution that matches or achieves the goal'
        }

    ],
    language: 'javascript',
    entryPoint: {
        main: 'ACCOMPLISH.js',
        files: [
            {
                'accomplish.js': `
const axios = require('axios');

async function execute(input) {
    try {
        const goal = input.args?.goal || input.inputValue;
        
        if (!goal) {
            throw new Error('Goal is required for ACCOMPLISH plugin');
        }

        const prompt = generatePrompt(goal);
        const response = await queryBrain(prompt);
        
        try {
            const parsedResponse = JSON.parse(response);
            if (parsedResponse.type === 'PLAN') {
                const tasks = convertJsonToTasks(parsedResponse.plan);
                //console.log('ACCOMPLISH plugin succeeded creating a plan', { tasks });
                return {
                    success: true,
                    resultType: 'plan',
                    resultDescription: \`A plan to: \${goal}\`,
                    result: tasks,
                    mimeType: 'application/json'
                };
            } else if (parsedResponse.type === 'DIRECT_ANSWER') {
                return {
                    success: true,
                    resultType: 'string',
                    resultDescription: \`LLM Response\`,
                    result: parsedResponse.answer,
                    mimeType: 'text/plain'
                };
            } else {
                throw new Error('Invalid response format from Brain');
            }
        } catch (parseError) {
            let errorMessage = 'Failed to parse Brain response';
            if (parseError instanceof Error) {
                errorMessage += \`: \${parseError.message}\`;
            } else if (typeof parseError === 'string') {
                errorMessage += \`: \${parseError}\`;
            } else {
                errorMessage += ': Unknown error occurred during parsing';
            }
            throw new Error(errorMessage);
        }
    
    } catch (error) { analyzeError(error as Error);
        console.error('ACCOMPLISH plugin failed', error instanceof Error ? error.message : error);
        return {
            success: false,
            resultType: 'error',
            resultDescription: 'Error',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
            mimeType: 'text/plain'
        };
    }
}

function generatePrompt(goal) {
    return \`
Accomplish the following goal: \${goal}

If you can provide a complete and direct answer or solution, respond with a JSON object in this format:
{
    "type": "DIRECT_ANSWER",
    "answer": "Your direct answer here"
}

If a plan is needed, respond with a JSON object in this format:
{
    "type": "PLAN",
    "plan": [
        {
            "number": 1,
            "verb": "ACTION_VERB",
            "description": "Brief description of the step",
            "args": {
                "key1": "value1",
                "key2": "value2"
            },
            "dependencies": [0],
            "outputs": {
                "output1": "Description of output1",
                "output2": "Description of output2"
            }
        },
        {
            "number": 2,
            "verb": "ANOTHER_ACTION",
            "description": "Description of another step",
            "args": {
                "key3": "value3"
            },
            "dependencies": [1],
            "outputs": {
                "output3": "Description of output3"
            }
        }
    ]
}

Guidelines for creating a plan:
1. Number each step sequentially, starting from 1.
2. Use specific, actionable verbs for each step (e.g., SCRAPE, ANALYZE, PREDICT).
3. Ensure each step has a clear, concise description.
4. Provide detailed arguments for each step, including data sources or specific parameters.
5. List dependencies as an array of step numbers. Use [0] if the step has no dependencies.
6. Specify the outputs of each step that may be used by dependent steps.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields.  This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or prediction.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.

Ensure your response is a valid JSON object starting with either "type": "DIRECT_ANSWER" or "type": "PLAN".
\`;
}

async function queryBrain(prompt) {
    try {
        const brainUrl = process.env.BRAIN_URL || 'brain:5070';
        const response = await axios.post(\`http://\${brainUrl}/chat\`, {
            exchanges: [{ role: 'user', message: prompt }],
            optimization: 'accuracy'
        });
        return response.data.response;
    } catch (error) { analyzeError(error as Error);
        console.error('Error querying Brain:', error instanceof Error ? error.message : error);
        throw new Error('Failed to query Brain');
    }
}

function convertJsonToTasks(jsonPlan) {
    return jsonPlan.map(step => ({
        verb: step.verb,
        args: {
            ...step.args,
            description: step.description,
            expectedOutputs: step.outputs
        },
        dependencies: step.dependencies
    }));
}

module.exports = { execute };
                `
            }
        ]
    }
};

export default accomplishPlugin;