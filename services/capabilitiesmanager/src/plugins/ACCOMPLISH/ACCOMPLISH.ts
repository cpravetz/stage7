import axios from 'axios';
import { MapSerializer, PluginInput, PluginOutput, PluginParameterType, ActionVerbTask } from '@cktmcs/shared';

interface JsonPlanStep {
    number: number;
    verb: string;
    description: string;
    inputs: Record<string, any>;
    dependencies: Map<string, number>;
    outputs: Record<string, string>;
}


function generatePrompt(goal: string): string {
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
        "inputs": {
            "key1": "value1",
            "key2": "value2"
        },
        "dependencies": {},
        "outputs": {
            "outputKey1": "Description of output1",
            "outputKey2": "Description of output2"
        }
    },
    {
        "number": 2,
        "verb": "ANOTHER_ACTION",
        "description": "Description of another step",
        "inputs": {
            "outputKey2": "value3"
        },
        "dependencies": {"outputKey2":1},
        "outputs": {
            "outputKey3": "Description of output3"
        }
    },
    {
        "number": 3,
        "verb": "YET_ANOTHER_ACTION",
        "description": "Description of another step",
        "inputs": {
            "outputKey2": "value3",
            "outputKey3": "value4"
        },
        "dependencies": {"outputKey2":1, "outputKey3":2},
        "outputs": {
            "outputKey4": "Description of output3"
        }
    },
    // ... more steps ...
    ]
}


Don't forget that trailing curly bracket right above in your JSON!

Guidelines for creating a plan:
1. Number each step sequentially, starting from 1.
2. Use specific, actionable verbs for each step (e.g., SCRAPE, ANALYZE, PREDICT).
3. Ensure each step has a clear, concise description.
4. Provide detailed arguments for each step, including data sources or specific parameters.
5. List dependencies for each step as a set of key values (from the inputs) and the step number that should provide the value for that input.
 Don't use the literal objecetKey# as the key, use the name given to the output from the preceeding step that is the input for this step.  The output name
 from the preceeding step and the input name for the depedent step should be the same.
6. Specify the outputs of each step that may be used by dependent steps.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields.  This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or prediction.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. input values may be determined by preceeding steps.  In those instances set the value to 'undefined'

A number of plugins are available to execute steps of the plan for you.  These include:

ACCOMPLISH - this plugin takes a specific goal and either achieves it or returns a plan to achieve it.
    (required input: goal)
FILE_OPS - this plugin provides services for file operations read, write, append
    (required inputs: path, operation, content)
SEARCH - this plugin searches DuckDuckGo for a given term and returns a list of links
    (required input: searchTerm)
SCRAPE - this plugin scrapes content from a given URL
    (required inputs: url, selector, attribute, limit)
GET_USER_INPUT - this plugin requests input from the user
    (required inputs: question, answerType) (optional imput: choices)

If it makes sense to break work into multiple streams, you can use the actionVerb DELEGATE to create a sub-agent with a goal of its own.

Ensure your response is a valid JSON object starting with either "type": "DIRECT_ANSWER" or "type": "PLAN". 
Double check that you are returning valid JSON. Remove any leading or trailing characters that might invalidate the response as a JSON object.
`  }

export async function execute(inputs: Map<string, PluginInput> | Record<string, any>): Promise<PluginOutput> {
    try {
        console.log('ACCOMPLISH plugin inputs:', inputs);
        
        let inputMap: Map<string, PluginInput>;
        
        if (inputs instanceof Map) {
            inputMap = inputs;
        } else {
            inputMap = new Map();
            for (const [key, value] of Object.entries(inputs)) {
                if (typeof value === 'object' && value !== null && 'inputValue' in value) {
                    inputMap.set(key, value as PluginInput);
                } else {
                    inputMap.set(key, {
                        inputName: key,
                        inputValue: value,
                        args: { [key]: value }
                    });
                }
            }
        }

        const goal = inputMap.get('goal')?.inputValue || inputMap.get('description')?.inputValue || false;

        if (!goal) {
            throw new Error('Goal or description is required for ACCOMPLISH plugin');
        }
        const prompt = generatePrompt(goal.toString());
        const messages = [{ role: 'user', content: prompt }];

        const response = await queryBrain(messages);
        
        try {
            //console.log(`Brain response: `, MapSerializer.transformForSerialization(response));
            const parsedResponse = await parseJsonWithErrorCorrection(response);
            //console.log(`Parsed Brain response: `, MapSerializer.transformForSerialization(parsedResponse));
            if (parsedResponse.type === 'PLAN') {
                const tasks = convertJsonToTasks(parsedResponse.plan);
                console.log('ACCOMPLISH: ACCOMPLISH plugin succeeded creating a plan',  MapSerializer.transformForSerialization(tasks));
                return {
                    success: true,
                    resultType: PluginParameterType.PLAN,
                    resultDescription: `A plan to: ${goal}`,
                    result: MapSerializer.transformForSerialization(tasks)
                };
            } else if (parsedResponse.type === 'DIRECT_ANSWER') {
                return {
                    success: true,
                    resultType: PluginParameterType.STRING,
                    resultDescription: `LLM Response`,
                    result: parsedResponse.answer
                };
            } else {
                throw new Error('Invalid response format from Brain');
            }
        } catch (parseError) {
            let errorMessage = 'Failed to parse Brain response';
            if (parseError instanceof Error) {
                errorMessage += `: ${parseError.message}`;
            } else if (typeof parseError === 'string') {
                errorMessage += `: ${parseError}`;
            } else {
                errorMessage += ': Unknown error occurred during parsing';
            }
            errorMessage += ` with response: ${JSON.stringify(response)}`;
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('ACCOMPLISH plugin execute() failed', error);
        return {
            success: false,
            resultType: PluginParameterType.ERROR,
            resultDescription: 'Error',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        };
    }
}

 
async function parseJsonWithErrorCorrection(jsonString: string): Promise<any> {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.log('Initial JSON parse failed, attempting to correct...');
        
        // Replace 'undefined' with null
        const correctedJson = jsonString.replace(/: undefined/g, ': null');
        
        try {
            return JSON.parse(correctedJson);
        } catch (secondError) {
            console.log('JSON correction failed, attempting to use LLM...');
            
            // If simple correction fails, use LLM to attempt correction
            const brainUrl = process.env.BRAIN_URL || 'brain:5070';
            const prompt = `The following JSON is malformed. Please correct it and return only the corrected JSON:\n\n${jsonString}`;
            
            try {
                const response = await axios.post(`http://${brainUrl}/chat`, {
                    exchanges: [{ role: 'user', message: prompt }],
                    optimization: 'accuracy'
                });
                
                const correctedByLLM = response.data.response;
                return JSON.parse(correctedByLLM);
            } catch (llmError) {
                throw new Error(`Failed to parse JSON even with LLM assistance: ${llmError}`);
            }
        }
    }
}

async function queryBrain(messages: { role: string, content: string }[]): Promise<string> {
    const brainUrl = process.env.BRAIN_URL || 'brain:5070';
    try {
        const response = await axios.post(`http://${brainUrl}/chat`, {
            exchanges: messages,
            optimization: 'accuracy'
        });
        return response.data.response;
    } catch (error) {
        console.error('Error querying Brain:', error);
        throw new Error('Failed to query Brain');
    }
}

function convertJsonToTasks(jsonPlan: JsonPlanStep[]): ActionVerbTask[] {
    try{    
        return jsonPlan.map(task => {
            //console.log('ACCOMPLISH: Mapping from json Step:',task);
            let inputMap: Map<string, PluginInput>;
            if (task.inputs instanceof Map) {
                inputMap = task.inputs;
            } else {
                inputMap = new Map();
                for (const [key, value] of Object.entries(task.inputs)) {
                    console.log(`Adding ${key} to inputMap with value: ${value} `);
                    inputMap.set(key, {
                        inputName: key,
                        inputValue: value,
                        args: { [key]: value }
                    });
                }
            }

            let dependencyMap: Map<string, number>;
            if (task.dependencies instanceof Map) {
                dependencyMap = task.dependencies;
            } else {
                dependencyMap = new Map();
                for (const [key, value] of Object.entries(task.dependencies)) {
                    console.log(`Adding ${key} to dependencyMap with value: ${value} `);
                    dependencyMap.set(key, value as number);
                }
            }

            let outputMap: Map<string, string>;
            if (task.outputs instanceof Map) {
                outputMap = task.outputs;
            } else {
                outputMap = new Map();
                for (const [key, value] of Object.entries(task.outputs)) {
                    outputMap.set(key, value as string);
                }
            }

            return { 
                verb: task.verb,
                inputs: inputMap,
                description: task.description + `Expected outputs: ${JSON.stringify(task.outputs)}`,
                expectedOutputs: outputMap,
                dependencies: dependencyMap
            }
        });
    } catch (error) {
        console.error('Error converting json to tasks:', error);
        throw new Error('Failed to convert json to tasks');
    }
}

