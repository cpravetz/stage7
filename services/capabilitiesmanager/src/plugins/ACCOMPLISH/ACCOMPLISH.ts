import axios from 'axios';
// @ts-ignore
import { parseJSON } from 'json-alexander';
import { MapSerializer, PluginInput, PluginOutput, PluginParameterType, ActionVerbTask, PlanDependency } from '@cktmcs/shared';
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

You MUST respond with ONLY a JSON object in ONLY ONE of these three formats:

1. If you have a full and complete answer to the goal, respond with a JSON object in this format:

{
    "type": "DIRECT_ANSWER",
    "answer": "Your direct answer here"
}

2. When the goal is discrete and can be accomplished most efficiently with a new plugin, defined one.  Creating a plugin should be avoided
when the goal can be accomplished with a plan.  If you determine a plugin is needed, respond with a JSON object in this format:

{
    "type": "PLUGIN",
    "plugin": {
        "id": "plugin-{verb}",
        "verb": "{verb}",
        "description": "A short description of the plugin",
        "explanation": "A more complete description including inputs, process overview, and outputs than a software engineer can use to build the plugin",
        "inputDefinitions": [
            {
                "name": "{input name}",
                "required": true/false,
                "type": "string",
                "description": "Brief explanation of the input"
            },
            // ... more inputs ...
        ],
}


3. If the goal can be sub-divided into smaller steps, respond with a plan as a JSON object in this format:

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


This is important:  Your response needs to be fully formed JSON with minimal whitespace.

Guidelines for creating a plan:
1. Number each step sequentially, starting from 1.
2. Use specific, actionable verbs for each step (e.g., SCRAPE, ANALYZE, PREDICT).
3. Ensure each step has a clear, concise description.
4. For inputs, each input should be an object with either a 'value' property for predetermined values or an 'outputKey' property referencing an output from a previous step. So 
an input would be defined as: {"inputName1": {value: "predeterminedValue"}} or {"inputName2": {outputKey: "outputKeyFromPreviousStep"}}
5. List dependencies for each step, as an object with the property names being the outputs needed and the values being the step number that provides the required inputlike: {outputname: stepNumber}
There must be a dependency entry for every input that comes from a previous step output.
6. Specify the outputs of each step.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields. This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or prediction.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. input values may be determined by preceeding steps.  In those instances set the value to 'undefined'

A number of plugins are available to execute steps of the plan. Some have required inputs - required properties for the inputs object.  These plugins include:

ACCOMPLISH - this plugin takes a specific goal and either achieves it or returns a plan to achieve it.
    (required input: goal)
THINK - this plugin sends prompts to the chat function of the LLMs attached to the system in order to generate content from a conversation.
    (required input: prompt) (optional inputs: optimization, ConversationType)
    if included, optimization must be one of 'cost', 'accuracy', 'creativity', 'speed', or 'continuity'
    accuracy is the default
GENERATE - this plugin uses LLM services to generate content from a prompt or other content. Services include image creation, audio transscription, image editing, etc.
    (required input: COnversationType) (optional inputs: modelName, optimization, prompt, file, audio, video, image...)
FILE_OPS - this plugin provides services for file operations read, write, append
    (required inputs: path, operation, content)
SEARCH - this plugin searches DuckDuckGo for a given term and returns a list of links
    (required input: searchTerm)
SCRAPE - this plugin scrapes content from a given URL
    (required inputs: url, selector, attribute, limit)
GET_USER_INPUT - this plugin requests input from the user
    (required inputs: question, answerType) (optional input: choices)

Ensure your response is a valid JSON object starting with either "type": "DIRECT_ANSWER", "type": "PLAN", or "type": "PLUGIN". 
Double check that you are returning valid JSON and only valid JSON. Remove any leading or trailing characters that might invalidate the response as a JSON object. 
`}

function validateResponse(response: any): boolean {
    if (!response || typeof response !== 'object') return false;
    
    if (!response.type || !['PLAN', 'PLUGIN', 'DIRECT_ANSWER'].includes(response.type)) return false;
    
    if (response.type === 'PLAN') {
        return Array.isArray(response.plan) && 
               response.plan.every((step: any) => 
                   typeof step.number === 'number' &&
                   typeof step.verb === 'string' &&
                   typeof step.description === 'string' &&
                   step.inputs && typeof step.inputs === 'object' &&
                   step.dependencies && typeof step.dependencies === 'object' &&
                   step.outputs && typeof step.outputs === 'object'
               );
    }

    return typeof response.answer === 'string';
    
}

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
            console.log('Goal or description is required for ACCOMPLISH plugin');
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Inputs did not contain a goal.',
                result: null,
                error: 'No goal provided to ACCOMPLISH plugin'
            }];
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
            } else if (parsedResponse.type === 'DIRECT_ANSWER' || parsedResponse.type === 'PLUGIN') {
                return [{
                    success: true,
                    name: 'answer',
                    resultType: PluginParameterType.STRING,
                    resultDescription: `LLM Response`,
                    result: parsedResponse.answer
                }];
            } else {
                console.error(`Invalid response format from Brain: ${parsedResponse.type}`);
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Failed to parse Brain response',
                    result: null,
                    error: `Response type not PLAN or DIRECT_ANSWER: ${parsedResponse.type}`
            }];
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

        // Remove all characters before first opening brace
        correctedJson = correctedJson.substring(correctedJson.indexOf('{'));
        // Remove all characters after last closing brace
        correctedJson = correctedJson.substring(0, correctedJson.lastIndexOf('}') + 1);
        // Remove all triple backticks
        correctedJson = correctedJson.replace(/```/g, '');        
        // Replace 'undefined' with null
        correctedJson = correctedJson.replace(/: undefined/gi, ': null');

         // Handle string concatenation in JSON
         correctedJson = correctedJson.replace(/"\s*\+\s*JSON\.stringify\((.*?)\)\s*\+\s*"/g, (match, p1) => {
            try {
                const parsed = parseJSON(p1);
                return JSON.stringify(parsed);
            } catch (e) {
                return match; // If parsing fails, leave it as is
            }
        });

        return parseJSON(correctedJson);
    } catch (error) { 
        analyzeError(error as Error);
        console.log('JSON correction failed, attempting to use LLM...');
        console.log('Malformed JSON: -->', correctedJson,'<--');
            
        const brainUrl = process.env.BRAIN_URL || 'brain:5070';
        const prompt = `The following JSON is malformed. Please correct it and return only the corrected JSON:\n\n${correctedJson}`;
            
        try {
            const response = await axios.post(`http://${brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
                optimization: 'accuracy',
                optionals: { temperature: 0.2, response_format: { "type": "json_object" }}
            });
            const fullResponse = response.data.response;
            const startIndex = fullResponse.indexOf('{');
            const endIndex = fullResponse.lastIndexOf('}') + 1;
            const correctedByLLM = fullResponse.substring(startIndex, endIndex);
                
            console.log('LLM corrected JSON:', correctedByLLM);
            return parseJSON(correctedByLLM);
        } catch (llmError) {
            analyzeError(llmError as Error);
            console.error('LLM correction failed:', llmError);
            return '';
        }
    }
}

async function queryBrain(messages: { role: string, content: string }[]): Promise<string> {
    const brainUrl = process.env.BRAIN_URL || 'brain:5070';
    try {
        const response = await axios.post(`http://${brainUrl}/chat`, {
            exchanges: messages,
            optimization: 'accuracy',
            optionals: { temperature: 0.2, response_format: { "type": "json_object" }}
        });
        console.log('Brain raw response:', response.data.response);
        return response.data.response;
    } catch (error) { analyzeError(error as Error);
        console.error('Error querying Brain:', error instanceof Error ? error.message : error);
        return '';
    }
}

function convertJsonToTasks(jsonPlan: JsonPlanStep[]): ActionVerbTask[] {
    try{
        //console.log('convertJsonToTasks: jsonPlan:', jsonPlan);
        if (!jsonPlan || !Array.isArray(jsonPlan)) {
            console.log('ACCOMPLISH:Cannot convert JSON to tasks. Invalid JSON plan format');
            return [];
        }

        // First pass: Create a map of output keys to step numbers
        const outputToStepMap = new Map<string, number>();
        jsonPlan.forEach((step, index) => {
            if (step.outputs) {
                Object.keys(step.outputs).forEach(outputKey => {
                    outputToStepMap.set(outputKey, step.number || index + 1);
                });
            }
        });

        return jsonPlan.map((step, index) => {
            const inputs = new Map<string, PluginInput>();
            const planDependencies: PlanDependency[] = [];

            // Process inputs and create initial dependencies from explicit declarations
            if (step.inputs) {
                for (const [key, inputData] of Object.entries(step.inputs)) {
                    inputs.set(key, {
                        inputName: key,
                        inputValue: inputData.value !== undefined ? inputData.value : undefined,
                        args: { outputKey: inputData.outputKey }
                    });

                    // If this input references an output key but has no explicit dependency
                    if (inputData.outputKey && 
                        (!step.dependencies || !Object.entries(step.dependencies).some(([depKey]) => depKey === key))) {
                        const sourceStepNo = outputToStepMap.get(inputData.outputKey);
                        if (sourceStepNo !== undefined && sourceStepNo < (step.number || index + 1)) {
                            planDependencies.push({
                                inputName: key,
                                sourceStepNo: sourceStepNo,
                                outputName: inputData.outputKey
                            });
                        }
                    }
                }
            }

            // Add explicit dependencies from the step definition
            if (step.dependencies) {
                for (const [inputName, depInfo] of Object.entries(step.dependencies)) {
                    // Only add if we haven't already added a dependency for this input
                    if (!planDependencies.some(dep => dep.inputName === inputName)) {
                        planDependencies.push({
                            inputName,
                            sourceStepNo: depInfo,
                            outputName: step.outputs && Object.keys(step.outputs).length > 0 
                                ? Object.keys(step.outputs)[0] 
                                : (step.inputs[inputName]?.args?.outputKey || 'result')
                        });
                    }
                }
            }            

            return {
                verb: step.verb,
                inputs: inputs,
                expectedOutputs: new Map(Object.entries(step.outputs)),
                description: step.description,
                dependencies: planDependencies
            };
        });
    } catch (error) { analyzeError(error as Error);
        console.error('Error converting JSON to tasks:', error instanceof Error ? error.message : error);
        return [];
    }
}
