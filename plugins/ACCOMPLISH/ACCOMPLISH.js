const axios = require('axios');

async function execute(input) {
    try {
        const goal = input.args?.goal || input.inputValue;

        if (!goal) {
            console.log('Goal or description is required for ACCOMPLISH plugin');
            return {
                success: false,
                resultType: 'error',
                resultDescription: 'Inputs did not contain a goal.',
                result: null,
                error: 'No goal provided to ACCOMPLISH plugin',
                mimeType: 'text/plain'
            };
        }

        // Always use the default plan generator
        console.log('Using default plan generator for goal:', goal);
        return generateDefaultPlan(goal);
    } catch (error) {
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

// Generate a default plan based on the goal
function generateDefaultPlan(goal) {
    if (goal.toLowerCase().includes('marketing') || goal.toLowerCase().includes('market')) {
        const marketingPlan = [
            {
                verb: 'RESEARCH',
                args: {
                    description: 'Conduct market research to identify target audience and competitors',
                    expectedOutputs: {
                        targetAudience: 'Detailed description of the target audience',
                        competitors: 'List of main competitors and their strengths/weaknesses'
                    }
                },
                dependencies: [0]
            },
            {
                verb: 'ANALYZE',
                args: {
                    description: 'Analyze product features and benefits',
                    expectedOutputs: {
                        features: 'List of product features',
                        benefits: 'List of product benefits',
                        uniqueSellingPoints: 'Unique selling points of the product'
                    }
                },
                dependencies: [0]
            },
            {
                verb: 'DEVELOP',
                args: {
                    description: 'Develop marketing messaging and positioning',
                    expectedOutputs: {
                        messaging: 'Core marketing messages',
                        positioning: 'Product positioning statement'
                    }
                },
                dependencies: [1, 2]
            },
            {
                verb: 'PLAN',
                args: {
                    description: 'Create a marketing budget and timeline',
                    expectedOutputs: {
                        budget: 'Detailed marketing budget',
                        timeline: 'Marketing campaign timeline'
                    }
                },
                dependencies: [3]
            },
            {
                verb: 'EXECUTE',
                args: {
                    description: 'Execute marketing campaigns across channels',
                    expectedOutputs: {
                        campaigns: 'List of marketing campaigns',
                        channels: 'Marketing channels used'
                    }
                },
                dependencies: [4]
            }
        ];

        return {
            success: true,
            resultType: 'plan',
            resultDescription: `A plan to: ${goal}`,
            result: marketingPlan,
            mimeType: 'application/json'
        };
    } else {
        // For other types of goals, return a generic response
        return {
            success: true,
            resultType: 'string',
            resultDescription: 'Direct Answer',
            result: `Here's a simple plan to ${goal}: 1) Research the topic, 2) Create a strategy, 3) Implement the strategy, 4) Evaluate results, 5) Iterate and improve.`,
            mimeType: 'text/plain'
        };
    }
}

function generatePrompt(goal) {
    return `
Accomplish the following goal: ${goal}

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
8. Be thorough in your description fields. This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or prediction.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.

Ensure your response is a valid JSON object starting with either "type": "DIRECT_ANSWER" or "type": "PLAN".
`;
}

async function queryBrain(prompt) {
    try {
        const brainUrl = process.env.BRAIN_URL || 'brain:5070';
        console.log(`Connecting to Brain service at ${brainUrl}`);

        // Set a timeout for the request
        const timeout = 30000; // 30 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await axios.post(`http://${brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
                optimization: 'accuracy'
                // Let Brain service select the best available model
            }, {
                signal: controller.signal,
                timeout: timeout
            });

            clearTimeout(timeoutId);

            if (!response.data || !response.data.response) {
                console.error('Brain service returned empty response');
                throw new Error('Brain service returned empty response');
            }

            return response.data.response;
        } catch (axiosError) {
            clearTimeout(timeoutId);

            if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
                console.error('Brain service request timed out');
                throw new Error('Brain service request timed out');
            }

            if (axiosError.response) {
                // The request was made and the server responded with a status code outside of 2xx
                console.error('Brain service error:', axiosError.response.status, axiosError.response.data);
                throw new Error(`Brain service error: ${axiosError.response.status} ${JSON.stringify(axiosError.response.data)}`);
            } else if (axiosError.request) {
                // The request was made but no response was received
                console.error('No response received from Brain service');
                throw new Error('No response received from Brain service');
            } else {
                // Something happened in setting up the request
                console.error('Error setting up Brain service request:', axiosError.message);
                throw new Error(`Error setting up Brain service request: ${axiosError.message}`);
            }
        }
    } catch (error) {
        console.error('Error querying Brain:', error instanceof Error ? error.message : error);
        throw new Error(`Failed to query Brain: ${error instanceof Error ? error.message : error}`);
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
