import axios from 'axios';
// @ts-ignore
import { parseJSON } from 'json-alexander';
import { MapSerializer, PluginInput, PluginOutput, PluginParameterType, ActionVerbTask } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

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

Otherwise, if a plan is needed, respond with a JSON object in this format:
{
"type": "PLAN",
"context": "Any overarching points or introduction to the plan you want to share",
"plan": [
    {
        "number": 1,
        "verb": "ACTION_VERB",
        "description": "Brief description of the step",
        "inputs": {
            "inputName1": {"value": "predeterminedValue"},
            "inputName2": {"outputKey": "outputKeyFromPreviousStep"}
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
            "inputName3": {"outputKey": "outputKey2"}
        },
        "dependencies": {"outputKey2": 1},
        "outputs": {
            "outputKey3": "Description of output3"
        }
    }
    // ... more steps ...
    ]
}


This is important:  Your response needs to be fully formed JSON.

Guidelines for creating a plan:
1. Number each step sequentially, starting from 1.
2. Use specific, actionable verbs for each step (e.g., SCRAPE, ANALYZE, PREDICT).
3. Ensure each step has a clear, concise description.
4. For inputs, use the expected input names for the action verb as the input names. 
Each input should be an object with either a 'value' property for predetermined values or an 'outputKey' property referencing an output from a previous step. So 
an input would be defined as: {"inputName1": {value: "predeterminedValue"}} or {"inputName2": {outputKey: "outputKeyFromPreviousStep"}}
5. List dependencies for each step, referencing the step numbers that provide the required inputs.
6. Specify the outputs of each step that may be used by dependent steps.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields. This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or prediction.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. input values may be determined by preceeding steps.  In those instances set the value to 'undefined'

A number of plugins are available to execute steps of the plan for you.  Some have required inputs, which are required properties for the inputs object.  These plugins include:

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

If it makes sense to break work into multiple streams, you can use the actionVerb DELEGATE to create a sub-agent with a goal of it's own.

Ensure your response is a valid JSON object starting with either "type": "DIRECT_ANSWER" or "type": "PLAN". 
Double check that you are returning valid JSON. Remove any leading or trailing characters that might invalidate the response as a JSON object.
`}

export async function execute(inputs: Map<string, PluginInput> | Record<string, any>): Promise<PluginOutput[]> {
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
        //console.log('Raw Brain response:', response);

        try {
            const parsedResponse = await parseJsonWithErrorCorrection(response);
            //console.log('Parsed Brain response:', parsedResponse);
            if (parsedResponse.type === 'PLAN') {
                const tasks = convertJsonToTasks(parsedResponse.plan);
                //console.log('ACCOMPLISH: ACCOMPLISH plugin succeeded creating a plan',  MapSerializer.transformForSerialization(tasks));
                return [{
                    success: true,
                    name: 'plan',
                    resultType: PluginParameterType.PLAN,
                    resultDescription: `A plan to: ${goal}`,
                    result: MapSerializer.transformForSerialization(tasks)
                }];
            } else if (parsedResponse.type === 'DIRECT_ANSWER') {
                return [{
                    success: true,
                    name: 'answer',
                    resultType: PluginParameterType.STRING,
                    resultDescription: `LLM Response`,
                    result: parsedResponse.answer
                }];
            } else {
                throw new Error('Invalid response format from Brain');
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error parsing Brain response:', error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Failed to parse Brain response',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown parsing error'
            }];
        }
    } catch (error) { analyzeError(error as Error);
        console.error('ACCOMPLISH plugin execute() failed', error instanceof Error ? error.message : error);
        return [{
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            resultDescription: 'Error in ACCOMPLISH plugin',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        }];
    }
}

 
async function parseJsonWithErrorCorrection(jsonString: string): Promise<any> {
    let correctedJson = '';
    try {

        // Remove any leading or trailing quotation marks
        correctedJson = jsonString.trim().replace(/^"|"$/g, '');

        correctedJson = correctedJson.replace(/```/g, '');        
        // Replace 'undefined' with null
        correctedJson = correctedJson.replace(/: undefined/gi, ': null');

         // Handle string concatenation in JSON
         correctedJson = correctedJson.replace(/"\s*\+\s*JSON\.stringify\((.*?)\)\s*\+\s*"/g, (match, p1) => {
            try {
                const parsed = JSON.parse(p1);
                return JSON.stringify(parsed);
            } catch (e) {
                return match; // If parsing fails, leave it as is
            }
        });

        return parseJSON(correctedJson);
    } catch (error) { analyzeError(error as Error);
        console.log('JSON correction failed, attempting to use LLM...');
        console.log('Malformed JSON:', correctedJson);
            
        const brainUrl = process.env.BRAIN_URL || 'brain:5070';
        const prompt = `The following JSON is malformed. Please correct it and return only the corrected JSON:\n\n${correctedJson}`;
            
        try {
            const response = await axios.post(`http://${brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
                optimization: 'accuracy'
            });
            const fullResponse = response.data.response;
            const startIndex = fullResponse.indexOf('{');
            const endIndex = fullResponse.lastIndexOf('}') + 1;
            const correctedByLLM = fullResponse.substring(startIndex, endIndex);
                
            console.log('LLM corrected JSON:', correctedByLLM);
            return parseJSON(correctedByLLM);
        } catch (llmError) {
            console.error('LLM correction failed:', llmError);
            throw new Error(`Failed to parse JSON even with LLM assistance: ${llmError}`);
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
    } catch (error) { analyzeError(error as Error);
        console.error('Error querying Brain:', error instanceof Error ? error.message : error);
        throw new Error('Failed to query Brain');
    }
}

function convertJsonToTasks(jsonPlan: JsonPlanStep[]): ActionVerbTask[] {
    return jsonPlan.map(step => {
        const inputs = new Map<string, PluginInput>();
        for (const [key, inputData] of Object.entries(step.inputs)) {
            inputs.set(key, {
                inputName: key,
                inputValue: inputData.value !== undefined ? inputData.value : undefined,
                args: { outputKey: inputData.outputKey }
            });
        }

        const dependencies = new Map<string, number>();
        for (const [key, value] of Object.entries(step.dependencies)) {
            dependencies.set(key, value);
        }

        return {
            verb: step.verb,
            inputs: inputs,
            expectedOutputs: new Map(Object.entries(step.outputs)),
            description: step.description,
            dependencies: dependencies
        };
    });
}

