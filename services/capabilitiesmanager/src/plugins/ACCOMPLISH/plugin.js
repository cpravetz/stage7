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
        const goal = input.inputs?.goal || input.inputValue;

        if (!goal) {
            console.log('Goal or description is required for ACCOMPLISH plugin');
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'JS: Inputs did not contain a goal.',
                result: null,
                error: 'No goal provided to ACCOMPLISH plugin'
            }];
        }

        const prompt = generatePrompt(goal);
        const response = await queryBrain(prompt);

        try {
            const parsedResponse = JSON.parse(response);
            if (parsedResponse.type.toUpperCase() === 'PLAN') {
                const tasks = convertJsonToTasks(parsedResponse.plan);
                //console.log('ACCOMPLISH plugin succeeded creating a plan', { tasks });
                return {
                    success: true,
                    resultType: 'plan',
                    resultDescription: \`JS: A plan to: \${goal}\`,
                    result: tasks,
                    mimeType: 'application/json'
                };
            } else if (parsedResponse.type.toUpperCase() === 'DIRECT_ANSWER') {
                return {
                    success: true,
                    resultType: 'string',
                    resultDescription: \`JS: LLM Response\`,
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
            resultDescription: 'JS: Error',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
            mimeType: 'text/plain'
        };
    }
}

function generatePrompt(goal) {
    return \`
Accomplish the following goal: \${goal}

Crucially, you must directly respond with a JSON object in one of the following formats based on whether a complete answer or a plan is required. Do not provide descriptive text or recommendations; directly output the complete JSON.


If a plan is needed to reach the goal, respond with a JSON object in this format:
{
    "type": "PLAN",
    "created": "A plan for reaching the goal",
    "plan": [
        {
            "number": 1,
            "verb": "ACTION_VERB",
            "description": "Brief description of the step",
            "inputs": {
                "key1": "value1",
                "key2": "value2"
            },
            "dependencies": [],
            "outputs": {
                "output1": "Description of output1",
                "output2": "Description of output2"
            }
        },
        {
            "number": 2,
            "verb": "ANOTHER_ACTION",
            "description": "Description of another step",
            "inputs": {
                "key3": "value3"
            },
            "dependencies": [{sourceStepNo: 1, sourceOutputName: "output2"}],
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
5. List dependencies as an array of step numbers. Use [] if the step has no dependencies.
6. Specify the outputs of each step that may be used by dependent steps.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields.  This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or prediction.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. Always use the "inputs" property within each step of the plan to define its parameters. The term "args" is not used for this purpose in the plan structure.
12. For each step, include a "recommendedRole" field with one of the available agent roles that would be best suited for the task.

If a plan is unnecessary and you can provide a complete, factual answer or solution, not a recommendation, respond with a JSON object in this format:
{
    "type": "DIRECT_ANSWER",
    "answer": "Your direct answer here"
}


Ensure your response is a valid JSON object starting with either "type": "DIRECT_ANSWER" or "type": "PLAN".
\`;
}

async function queryBrain(prompt) {
    try {
        const brainUrl = process.env.BRAIN_URL || 'brain:5070';

        const response = await axios.post(\`http://\${brainUrl}/chat\`, {
            exchanges: [{ role: 'user', content: prompt }],
            optimization: 'accuracy'
        });
        return response.data.response;
    } catch (error) { //analyzeError(error as Error);
        console.error('Error querying Brain:', error instanceof Error ? error.message : error);
        throw new Error('Failed to query Brain');
    }
}

function convertJsonToTasks(jsonPlan) {
    return jsonPlan.map(step => ({
        verb: step.verb,
        inputs: {
            ...step.inputs,
            ...step.args,
        },
        description: step.description,
        expectedOutputs: step.outputs,
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