import axios from 'axios';
// @ts-ignore
import { parseJSON } from 'json-alexander';
import { MapSerializer, PluginInput, PluginOutput, PluginParameterType, ActionVerbTask, PlanDependency, ServiceTokenManager } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { v4 as uuidv4 } from 'uuid';

// Initialize token manager for service-to-service authentication
const securityManagerUrl = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010';
const serviceId = 'CapabilitiesManager';
const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
const tokenManager = ServiceTokenManager.getInstance(
    `http://${securityManagerUrl}`,
    serviceId,
    serviceSecret
);

interface JsonPlanStep {
    number: number;
    verb: string;
    description: string;
    inputs?: Record<string, any>;
    args?: Record<string, any>;
    dependencies?: any; // Can be Map<string, number>, array, or object
    outputs: Record<string, any>;
    recommendedRole?: string;
}


function generatePrompt(goal: string, verbToAvoid: string): string {
    return `
Resolve the following goal or develop a plan to do so: ${goal}
IMPORTANT: Do NOT use the action verb "${verbToAvoid}" in your plan or response.

You MUST respond with ONLY a JSON object in ONLY ONE of these three formats. DO NOT include any explanations, markdown formatting, or additional text outside the JSON object.

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
        ]
    }
}


3. If the goal can be sub-divided into smaller steps, respond with a plan as a JSON object in this format:

{
    "type": "PLAN",
    "context": "Any overarching points or introduction to the plan you want to share",
    "plan": [
        {
            "number": 1,
            "verb": "DESCRIPTTIVE_ACTION_VERB",
            "description": "Brief description of the step",
            "inputs": {
                "inputName1": {"value": "predeterminedValue"},
                "inputName2": {"outputKey": "outputKeyFromPreviousStep"}
            },
            "dependencies": {},
            "outputs": {
                "outputKey1": "Description of output1",
                "outputKey2": "Description of output2"
            },
            "recommendedRole": "coordinator"
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
            },
            "recommendedRole": "researcher"
        }
    ]
}

Guidelines for creating a plan:
1. Number each step sequentially.
2. Use specific, actionable verbs or phrases for each step (e.g.  ANALYZE_CSV, ANALYZE_AUDIOFILE, PREDICT, WRITE_TEXT, WRITE_CODE, BOOK_A_CAR).
3. The schema of the step must be  as defined above - every field is mandatory but inputs field may be empty.
4. Each step input should be an object with either a 'value' property for predetermined values or an 'outputKey' property referencing an output from a previous step.
5. List dependencies for each step as an object with the property names being the outputs needed and the values being the step number that provides the required input like: {"outputname": 1}
There MUST be a dependency entry for every input that comes from a previous step output.
6. Specify the outputs of each step. At least one output is mandatory.
7. Aim for 5-10 steps in the plan, breaking down complex tasks if necessary.
8. Be thorough in your description fields. This is the only instruction the performer will have.
9. Ensure the final step produces the desired outcome or mission of the goal.
10. The actionVerb DELEGATE is available to use to create sub-agents with goals of their own.
11. Input values may be determined by preceeding steps. In those instances set the value to 'undefined'
12. For each step, include a "recommendedRole" field with one of the available agent roles that would be best suited for the task.

Plugins are available to execute steps of the plan. Some have required inputs - required properties for the inputs object.  These plugins include:

ACCOMPLISH - takes a specific goal and either achieves it or returns a plan to achieve it.
    (required input: goal)
THINK - sends prompts to the chat function of the LLMs attached to the system in order to generate content from a conversation.
    (required input: prompt) (optional inputs: optimization ('cost'|'accuracy'|'creativity'|'speed'|'continuity'), ConversationType)
    accuracy is the default optimization
GENERATE - uses LLM services to generate content from a prompt or other content. Services include image creation, audio transscription, image editing, etc.
    (required input: ConversationType) (optional inputs: modelName, optimization, prompt, file, audio, video, image...)
FILE_OPS - provides services for file operations read, write, append
    (required inputs: path, operation, content)
SEARCH - searches DuckDuckGo for a given term and returns a list of links.
    VERY IMPORTANT: This plugin REQUIRES a 'searchTerm' string in its 'inputs'.
    If the search term cannot be determined from the goal or previous steps, you MUST use the GET_USER_INPUT plugin *before* this SEARCH step to ask the user for the search term. Do NOT generate a SEARCH step without a 'searchTerm'.
SCRAPE - scrapes content from a given URL
    (required inputs: url, selector, attribute, limit)
GET_USER_INPUT - requests input from the user
    (required inputs: question, answerType) (optional input: choices)
DECIDE - Conditional branching based on a condition
    (required inputs: condition: {"inputName": "value"}, trueSteps[], falseSteps[])
WHILE - Repeat steps while a condition is true
    (required inputs: condition: {"inputName": "value"}, steps[])
UNTIL - Repeat steps until a condition becomes true
    (required inputs: condition: {"inputName": "value"}, steps[])
SEQUENCE - Execute steps in strict sequential order / no concurrency
    (required inputs: steps[])
TIMEOUT - Set a timeout for a group of steps
    (required inputs: timeout, steps[])
REPEAT - Repeat steps a specific number of times
    (required inputs: count, steps[])

Available Agent Roles:
- coordinator: Coordinates activities of other agents, manages task allocation, and ensures mission success. Good for planning, delegation, and monitoring.
- researcher: Gathers, analyzes, and synthesizes information from various sources. Good for information gathering and data analysis.
- creative: Generates creative ideas, content, and solutions to problems. Good for idea generation and content creation.
- critic: Evaluates ideas, plans, and content, providing constructive feedback. Good for quality assessment and risk identification.
- executor: Implements plans and executes tasks with precision and reliability. Good for task execution and process following.
- domain_expert: Provides specialized knowledge and expertise in a specific domain. Good for technical analysis and expert advice.

IMPORTANT: Your response MUST be a valid JSON object with no additional text or formatting. The JSON must start with { and end with } and must include one of the three types: "DIRECT_ANSWER", "PLAN", or "PLUGIN".
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

// Add a global function to log to a file that will be visible outside the sandbox
function logToFile(message: string) {
    try {
        // This will be visible in the CapabilitiesManager logs
        console.log(`ACCOMPLISH_PLUGIN_LOG: ${message}`);
    } catch (error) {
        console.error('Error logging to file:', error);
    }
}

export async function execute(inputs: Map<string, PluginInput> | Record<string, any>): Promise<PluginOutput[]> {
    try {
        console.log('ACCOMPLISH plugin inputs:', inputs);
        console.log('ACCOMPLISH plugin execute() called');

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

        // Fix verbToAvoid parameter access
        let verbToAvoid = '';
        if (inputs instanceof Map) {
            verbToAvoid = inputs.get('verbToAvoid')?.inputValue as string || '';
        } else if (inputMap.has('verbToAvoid')) {
            verbToAvoid = inputMap.get('verbToAvoid')?.inputValue as string || '';
        }

        console.log('Goal:', goal, 'VerbToAvoid:', verbToAvoid);

        if (!goal) {
            console.log('Goal or description is required for ACCOMPLISH plugin');
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'TS: Inputs did not contain a goal.',
                result: null,
                error: 'No goal provided to ACCOMPLISH plugin'
            }];
        }
        const prompt = generatePrompt(goal.toString(), verbToAvoid);

        // Log the prompt length for debugging
        logToFile(`Generated prompt length: ${prompt.length} characters`);
        logToFile(`Prompt preview: ${prompt.substring(0, 500)}...`);

        // Create the messages array with the correct format
        const messages = [{ role: 'user', content: prompt }];

        // Validate the message format
        logToFile(`Message format: ${JSON.stringify(messages, null, 2)}`);
        if (!messages[0].role || !messages[0].content) {
            logToFile('WARNING: Message is missing role or content');
        }

        console.log('ACCOMPLISH plugin executing with goal:', goal);
        console.log('Generated prompt length:', prompt.length);
        console.log('Prompt preview:', prompt.substring(0, 200) + '...');
        console.log('Messages being sent to Brain:', JSON.stringify(messages, null, 2));
        const response = await queryBrain(messages);
        console.log('Raw Brain response received: ', response );

        try {
            logToFile('Parsing response from Brain...');
            const parsedResponse = await parseJsonWithErrorCorrection(response);
            logToFile(`Parsed response type: ${parsedResponse.type}`);

            if (parsedResponse.type === 'PLAN') {
                logToFile(`Plan has ${parsedResponse.plan.length} steps`);
                logToFile(`First step verb: ${parsedResponse.plan[0].verb}`);

                const tasks = convertJsonToTasks(parsedResponse.plan);
                logToFile(`Converted to ${tasks.length} tasks`);

                // Check for forbidden verbs
                const forbiddenVerbTask = tasks.find(task => task.verb === verbToAvoid);
                if (forbiddenVerbTask) {
                    console.error(`Generated plan contains forbidden verb: ${verbToAvoid}`);
                    logToFile(`Generated plan contains forbidden verb: ${verbToAvoid}`);
                    return [{
                        success: false,
                        name: 'error',
                        resultType: PluginParameterType.ERROR,
                        resultDescription: `TS: Generated plan contains ${verbToAvoid} verb`,
                        result: null,
                        error: `Plan contains ${verbToAvoid} verb`
                    }];
                }

                console.log('ACCOMPLISH: Successfully created a plan with', tasks.length, 'tasks');
                console.log('ACCOMPLISH: Plan tasks:', JSON.stringify(tasks, null, 2));
                logToFile(`ACCOMPLISH: Successfully created a plan with ${tasks.length} tasks`);

                // Log the serialized tasks for debugging
                const serializedTasks = MapSerializer.transformForSerialization(tasks);
                console.log('ACCOMPLISH: Serialized tasks:', JSON.stringify(serializedTasks, null, 2));
                logToFile(`Serialized tasks: ${JSON.stringify(serializedTasks).substring(0, 200)}...`);

                // Ensure we return an array of PluginOutput objects
                const result = {
                    success: true,
                    name: 'plan', // Use 'plan' as the name to make it clear this is a plan
                    resultType: PluginParameterType.PLAN,
                    resultDescription: `TS: A plan to: ${goal}`,
                    result: tasks // Return the original tasks array, not the serialized version
                };
                return [result];
            } else if (parsedResponse.type === 'DIRECT_ANSWER' && parsedResponse.answer) {
                logToFile(`Direct answer: ${parsedResponse.answer.substring(0, 100)}...`);
                // Ensure we return an array of PluginOutput objects
                const answerResult = {
                    success: true,
                    name: 'answer',
                    resultType: PluginParameterType.STRING,
                    resultDescription: `TS: LLM Response`,
                    result: parsedResponse.answer
                };
                return [answerResult];
            } else {
                console.error(`Invalid response format from Brain: ${parsedResponse.type}`);
                logToFile(`Invalid response format from Brain: ${parsedResponse.type}`);
                // Ensure we return an array of PluginOutput objects
                const errorResult = {
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'TS: Failed to parse Brain response',
                    result: null,
                    error: `Response type not PLAN, PLUGIN or DIRECT_ANSWER: ${parsedResponse.type}`
            };
            return [errorResult];
            }
        } catch (error) { analyzeError(error as Error);
            console.error('Error parsing Brain response:', error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'TS: Failed to parse Brain response',
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
            resultDescription: 'TS: Error in ACCOMPLISH plugin',
            result: null,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        }];
    }
}


async function parseJsonWithErrorCorrection(jsonString: string): Promise<any> {
    let correctedJson = '';
    try {
        logToFile('parseJsonWithErrorCorrection called with string length: ' + (jsonString ? jsonString.length : 0));
        logToFile('Input string preview: ' + (jsonString ? jsonString.substring(0, 200) + '...' : 'EMPTY'));
        if (!jsonString) {
            console.error('Empty response from Brain');
            throw new Error('Empty response from Brain');
        }

        // Log the first 500 characters of the response for debugging
        logToFile(`Response preview: ${jsonString.substring(0, 500)}${jsonString.length > 500 ? '...' : ''}`);

        // Check if the response is not even close to JSON
        if (!jsonString.includes('{') && !jsonString.includes('}')) {
            console.error('Response does not contain any JSON-like structure');
            logToFile('Response does not contain any JSON-like structure. Attempting to fix by wrapping in a DIRECT_ANSWER structure.');

            // If it's just plain text, wrap it in a DIRECT_ANSWER structure
            return {
                type: 'DIRECT_ANSWER',
                answer: jsonString.trim()
            };
        }

        // First, check if the string is already valid JSON
        try {
            console.log('Attempting direct JSON parse');
            const directParse = JSON.parse(jsonString.trim());
            console.log('Direct JSON parse successful, type:', directParse.type);
            return directParse;
        } catch (directParseError) {
            console.log('Direct JSON parse failed:', directParseError instanceof Error ? directParseError.message : String(directParseError));
            // Continue with extraction methods
        }

        // Handle markdown code blocks
        console.log('Attempting to extract code blocks');
        const codeBlockRegex = /```(?:json)?([\s\S]*?)```/g;
        let match;
        let codeBlockFound = false;

        while ((match = codeBlockRegex.exec(jsonString)) !== null) {
            if (match && match[1] && match[1].trim()) {
                console.log('Code block found, extracted content length:', match[1].length);
                const extractedJson = match[1].trim();
                try {
                    // Try to parse the extracted JSON
                    const parsed = JSON.parse(extractedJson);
                    console.log('Successfully parsed JSON from code block');
                    return parsed;
                } catch (codeBlockError) {
                    console.log('Failed to parse code block as JSON:', codeBlockError instanceof Error ? codeBlockError.message : String(codeBlockError));
                    // If this is the first code block, save it for further processing
                    if (!codeBlockFound) {
                        correctedJson = extractedJson;
                        codeBlockFound = true;
                    }
                }
            }
        }

        if (!codeBlockFound) {
            console.log('No code blocks found, using original string');
            correctedJson = jsonString;
        }

        // Remove any leading or trailing quotation marks
        correctedJson = correctedJson.trim().replace(/^"|"$/g, '');

        // Fix common JSON issues
        correctedJson = correctedJson
            // Replace control characters with spaces
            .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
            // Fix unescaped quotes in strings
            .replace(/([^\\])"([^"]*?)([^\\])"/g, '$1\"$2\"$3')
            // Replace 'undefined' with null
            .replace(/: undefined/gi, ': null')
            // Fix trailing commas in arrays and objects
            .replace(/,\s*([\]\}])/g, '$1')
            // Fix missing quotes around property names
            .replace(/(\{|,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
            // Fix single quotes used instead of double quotes
            .replace(/'/g, '"');

        // Extract JSON object
        console.log('Extracting JSON object from corrected string');
        const firstBrace = correctedJson.indexOf('{');
        const lastBrace = correctedJson.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
            throw new Error('No JSON object found in response');
        };
        correctedJson = correctedJson.substring(firstBrace, lastBrace + 1);


        try {
            console.log('Attempting final JSON.parse');
            const result = JSON.parse(correctedJson);
            console.log('Final JSON.parse successful, type:', result.type);
            if (result.type === 'PLAN' && result.plan) {
                console.log('Plan detected with', result.plan.length, 'steps');
            }
            return result;
        } catch (jsonError) {
            console.log('Final JSON.parse failed, trying parseJSON:', jsonError instanceof Error ? jsonError.message : String(jsonError));
            try {
                const result = parseJSON(correctedJson);
                console.log('parseJSON result type:', result.type);
                return result;
            } catch (parseJSONError) {
                console.log('parseJSON also failed:', parseJSONError instanceof Error ? parseJSONError.message : String(parseJSONError));
                throw parseJSONError;
            }
        }
    } catch (error) {
        analyzeError(error as Error);
        const brainUrl = process.env.BRAIN_URL || 'brain:5070';
        const prompt = `The following JSON is malformed. Please correct it and return only the corrected JSON:\n\n${correctedJson}`;

        try {
            // Get a token for authentication
            const token = await tokenManager.getToken();

            const response = await axios.post(`http://${brainUrl}/chat`, {
                exchanges: [{ role: 'user', content: prompt }],
                optimization: 'accuracy',
                optionals: { temperature: 0.2, response_format: { "type": "json_object" }}
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
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
    logToFile('ACCOMPLISH plugin is executing queryBrain');
    logToFile(`Messages: ${JSON.stringify(messages, null, 2)}`);

    // Extract the goal from the messages
    const goal = messages[0]?.content || 'Create a plan';
    logToFile(`Extracted goal: ${goal}`);

    // Try to call the Brain service first
    const brainUrl = process.env.BRAIN_URL || 'brain:5070';
    logToFile(`Brain URL: ${brainUrl}`);

    try {
        logToFile('Attempting to call Brain service...');

        logToFile(`Sending request to Brain with response_format set to JSON`);

        // Ensure the messages are properly formatted
        const formattedMessages = messages.map(msg => ({
            role: msg.role || 'user',
            content: msg.content || ''
        }));

        logToFile(`Formatted messages: ${JSON.stringify(formattedMessages, null, 2)}`);

        // Get a token for authentication
        const token = await tokenManager.getToken();

        // Make the request to the Brain service
        const response = await axios.post(`http://${brainUrl}/chat`, {
            exchanges: formattedMessages,
            optimization: 'accuracy',
            optionals: {
                temperature: 0.2,
                response_format: { "type": "json_object" },
                max_tokens: 4000
            }
        }, {
            timeout: 60000, // Increased timeout to 60 seconds
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        logToFile('Brain service response received');
        logToFile(`Full Brain response: ${JSON.stringify(response.data)}`);

        if (response.data && response.data.response) {
            logToFile(`Brain response length: ${response.data.response.length}`);
            logToFile(`Brain response preview: ${response.data.response.substring(0, 200)}...`);
            return response.data.response;
        } else {
            logToFile('Empty or invalid response from Brain service');
            return '';
        }
    } catch (error) {
        logToFile(`Error calling Brain service: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`ACCOMPLISH ERROR: Failed to call Brain service: ${error instanceof Error ? error.message : String(error)}`);

        if (axios.isAxiosError(error)) {
            console.log(`ACCOMPLISH ERROR: Axios error details:`);
            console.log(`  Status: ${error.response?.status}`);
            console.log(`  Status Text: ${error.response?.statusText}`);
            console.log(`  Data: ${JSON.stringify(error.response?.data)}`);
            console.log(`  Config: ${JSON.stringify(error.config)}`);
        }
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
            step.inputs = step.inputs || [];
            // Add explicit dependencies from the step definition
            if (step.dependencies) {
                for (const [inputName, depInfo] of Object.entries(step.dependencies)) {
                    // Only add if we haven't already added a dependency for this input
                    if (!planDependencies.some(dep => dep.inputName === inputName)) {
                        planDependencies.push({
                            inputName,
                            sourceStepNo: depInfo as number,
                            outputName: step.outputs && Object.keys(step.outputs).length > 0
                                ? Object.keys(step.outputs)[0]
                                : (step.inputs[inputName]?.args?.outputKey || 'result')
                        });
                    }
                }
            }

            if (planDependencies.length > 0) {
                console.log(`Created task for step ${step.number || index + 1}:`, {
                    verb: step.verb,
                    inputs: Object.fromEntries(inputs),
                    expectedOutputs: step.outputs,
                    description: step.description,
                    dependencies: planDependencies
                });
            }

            return {
                id: uuidv4(),
                verb: step.verb,
                inputs: inputs,
                expectedOutputs: new Map(Object.entries(step.outputs)),
                description: step.description,
                dependencies: planDependencies,
                recommendedRole: step.recommendedRole || 'executor' // Default to executor if no role is specified
            };
        });
    } catch (error) { analyzeError(error as Error);
        console.error('Error converting JSON to tasks:', error instanceof Error ? error.message : error);
        return [];
    }
}