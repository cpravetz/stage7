import { BaseService, ExchangeType } from '../services/baseService';

export enum LLMConversationType {
    TextToText = 'text/text',
    TextToImage = 'text/image',
    TextToAudio = 'text/audio',
    TextToVideo = 'text/video',
    AudioToText = 'audio/text',
    ImageToText = 'image/text',
    ImageToImage = 'image/image',
    ImageToAudio = 'image/audio',
    ImageToVideo = 'image/video',
    VideoToText = 'video/text',
    VideoToImage = 'image/image',
    VideoToAudio = 'image/audio',
    VideoToVideo = 'video/video',
    TextToCode = 'text/code',
    CodeToText = 'code/text',
}

export type converterType = {
    conversationType : LLMConversationType,
    requiredParams: string[],
    converter : Function
}

export type ConvertParamsType = {
    service: BaseService,
    prompt?: string,
    modelName?: string,
    audio? : string,
    video? : string,
    image? : string,
    file? : string,
    input?: string,
    text?: string,
    language?: string,
    quality?: string,
    style?: string,
    mask?: string,
    voice?: string,
    temperature?: number,
    response_format?: string,
    size?: string,
    messages?: ExchangeType[],
    max_length?: number,
    format?: string,
}

export abstract class BaseInterface {
    abstract interfaceName: string;
    converters: Map<LLMConversationType, converterType> = new Map();

    constructor() {

    }
    abstract chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number }): Promise<string>;

    abstract convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> ;

    /**
     * Converts various input definition formats into the desired
     * {"value": "..."} or {"outputKey": "..."} format.
     * It handles old `inputValue` and `inputName` fields and strips them.
     * @param inputs The inputs object from a plan step.
     * @returns The converted inputs object.
     */
    private convertInputsFormat(inputs: any): any {
        if (!inputs) return {};
    
        const converted: any = {};
        for (const [key, value] of Object.entries(inputs)) {
            if (typeof value === 'object' && value !== null) {
                const inputObj = value as any;
                // Prioritize the desired {"value": ...} or {"outputKey": ...} format if already present
                if (inputObj.value !== undefined) {
                    converted[key] = { value: inputObj.value };
                } else if (inputObj.outputKey !== undefined) {
                    converted[key] = { outputKey: inputObj.outputKey };
                } else if (inputObj.inputValue !== undefined) {
                    // This is the old format with inputValue
                    const inputValue = inputObj.inputValue;
                    // Check if it's an outputKey reference like "${outputKeyFromPreviousStep}"
                    if (typeof inputValue === 'string' && inputValue.startsWith('${') && inputValue.endsWith('}')) {
                        const outputKey = inputValue.substring(2, inputValue.length - 1);
                        converted[key] = { outputKey: outputKey };
                    } else {
                        // It's a direct value (can be null, string, number, etc.)
                        converted[key] = { value: inputValue };
                    }
                } else {
                    // Fallback for unexpected object structures, treat as direct value
                    converted[key] = { value: value };
                }
            } else {
                // Primitive value (string, number, boolean, null) treated as a direct value
                converted[key] = { value: value };
            }
        }
        return converted;
    }

    /**
     * Generates a default 'outputs' object for a plan step if none is provided by the LLM,
     * or if the provided outputs object is empty.
     * This ensures the 'outputs' field is always present and non-empty as per schema.
     * @param step The plan step object.
     * @returns A generated outputs object.
     */
    private generateOutputsFromStep(step: any): any {
        const outputs: any = {};
        const verb = (step.verb || step.actionVerb || '').toLowerCase(); // Use 'verb' if present, fallback to 'actionVerb'
    
        if (verb.includes('research') || verb.includes('gather')) {
            outputs.research_results = 'Gathered information and insights';
        } else if (verb.includes('analyze')) {
            outputs.analysis_results = 'Analysis findings and recommendations';
        } else if (verb.includes('create') || verb.includes('develop') || verb.includes('write')) {
            outputs.created_content = 'Developed materials and resources';
        } else if (verb.includes('identify')) {
            outputs.identified_items = 'Identified entities and characteristics';
        } else if (verb.includes('execute') || verb.includes('perform')) {
            outputs.execution_status = 'Status of execution';
        } else if (verb.includes('delegate')) {
            outputs.delegation_status = 'Status of delegated task';
        }
        
        // Ensure at least one output is always present
        if (Object.keys(outputs).length === 0) {
            outputs.step_results = 'Results from step execution';
        }
    
        return outputs;
    }

    /**
     * Converts various dependency formats into the desired {"outputKey": stepNumber} format.
     * Handles arrays like ["step_1"] and ensures values are numbers.
     * @param dependencies The dependencies from a plan step (can be array or object).
     * @returns The converted dependencies object.
     */
    private convertDependenciesFormat(dependencies: any): { [key: string]: number } {
        const converted: { [key: string]: number } = {};

        if (Array.isArray(dependencies)) {
            // If it's an array like ["step_1", "step_2"]
            dependencies.forEach((dep: any) => {
                if (typeof dep === 'string' && dep.startsWith('step_')) {
                    const stepNum = parseInt(dep.replace('step_', ''), 10);
                    if (!isNaN(stepNum) && stepNum > 0) {
                        // Use a generic outputKey for array dependencies if not specified
                        // This assumes the Python side handles the generic key or it's purely for dependency tracking
                        converted[`output_from_step_${stepNum}`] = stepNum;
                    }
                }
            });
        } else if (typeof dependencies === 'object' && dependencies !== null) {
            // If it's already an object, normalize keys/values
            for (const key in dependencies) {
                if (dependencies.hasOwnProperty(key)) {
                    let value = dependencies[key];
                    if (typeof value === 'string' && value.startsWith('step_')) {
                        value = parseInt(value.replace('step_', ''), 10);
                    }
                    if (typeof value === 'number' && value > 0) {
                        converted[key] = value;
                    }
                }
            }
        }
        return converted;
    }
    
    /**
     * Helper method to ensure a response is in JSON format and conforms to expected schemas,
     * especially for 'PLAN' types that might be returned in a raw array or with malformed inputs.
     * @param response The response from the LLM.
     * @param requireJson Whether JSON is strictly required.
     * @returns The response, possibly converted and schema-adjusted to JSON string.
     */
    public ensureJsonResponse(response: string, requireJson: boolean = false): string {
        if (!requireJson) {
            return response;
        }

        console.log('Original response length:', response.length);
        console.log('First 200 chars:', response.substring(0, 200));

        // Remove common markdown formatting
        let cleanedResponse = response.trim();
        cleanedResponse = cleanedResponse.replace(/^```(?:json|JSON)?\s*/i, '');
        cleanedResponse = cleanedResponse.replace(/\s*```$/, '');
        cleanedResponse = cleanedResponse.trim();

        let parsed: any;

        const commonFixes = [
            (s: string) => s.replace(/,\s*([\]\}])/g, '$1'), // Remove trailing commas (more robust)
            (s: string) => s.replace(/'/g, '"'),          // Fix single quotes to double quotes
            (s: string) => s.replace(/\/\/.*$/gm, ''),    // Remove single-line comments
            // Add quotes to unquoted keys - careful not to break existing quoted keys or values
            (s: string) => s.replace(/(?<!")(\b\w+\b)(?=\s*:)/g, '"$1"'),
            // Attempt to fix missing commas between key-value pairs if separated by a newline
            (s: string) => s.replace(/("\s*:\s*(?:true|false|null|"[^"]*"|-?[\d\.]+(?:e[+-]?\d+)?)\s*)\n(\s*")/gi, '$1,\n$2'),
            // Attempt to fix key"":""value typos to key":"value
            (s: string) => s.replace(/("\s*":)":"\s*([^"]*")/g, '$1"$2"'),
            // Remove newline characters that might break string literals if not properly escaped by LLM
            (s: string) => s.replace(/\\n(?!(t|r|b|f|\\|'|"))/g, '\n'), // Cautious newline replacement
        ];

        const applyFixes = (candidate: string): string => {
            let current = candidate;
            for (const fix of commonFixes) {
                current = fix(current);
            }
            return current;
        };

        try {
            parsed = JSON.parse(cleanedResponse);
            console.log('Response is valid JSON after initial cleaning.');
        } catch (e) {
            console.log('Response is not valid JSON after initial cleaning. Attempting targeted repairs and extraction.');

            // Attempt 1: Try to fix the whole cleanedResponse string
            try {
                const fixedWhole = applyFixes(cleanedResponse);
                parsed = JSON.parse(fixedWhole);
                console.log('Successfully parsed after applying common fixes to the whole response.');
            } catch (e2: any) { // Explicitly type e2 or use type guard
                console.log('Could not parse after applying common fixes to whole response. Error:', e2 instanceof Error ? e2.message : String(e2));

                let potentialJsonString: string | null = null;
                // Attempt 2: Check if the cleaned response IS a top-level object or array.
                const trimmedCleaned = cleanedResponse.trim();
                if ((trimmedCleaned.startsWith('{') && trimmedCleaned.endsWith('}')) || (trimmedCleaned.startsWith('[') && trimmedCleaned.endsWith(']'))) {
                    potentialJsonString = trimmedCleaned;
                }

                if (potentialJsonString) {
                    console.log('Identified cleaned response as potential top-level JSON. Attempting to parse with fixes.');
                    try {
                        const fixedPotential = applyFixes(potentialJsonString);
                        parsed = JSON.parse(fixedPotential);
                        console.log('Successfully parsed potential top-level JSON string after fixes.');
                    } catch (e3: any) { // Explicitly type e3 or use type guard
                        console.log('Failed to parse identified top-level JSON string even after fixes. Error:', e3 instanceof Error ? e3.message : String(e3));
                        // Fall through to plan recovery if it contains "plan":
                    }
                }

                // Attempt 3: Targeted PLAN recovery (if not already parsed)
                // This is crucial for the original problem.
                if (!parsed && cleanedResponse.includes('"plan"')) {
                    console.log('Attempting targeted PLAN recovery from cleanedResponse.');
                    try {
                        // Try to extract the main JSON object containing the plan
                        // This regex tries to find a structure that looks like an object containing a "plan" array.
                        const mainObjectMatch = cleanedResponse.match(/\{[\s\S]*"plan"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
                        let objectToProcessForPlan = cleanedResponse; // Default to whole response

                        if (mainObjectMatch && mainObjectMatch[0]) {
                             // If we find a plausible main object, focus on that.
                            objectToProcessForPlan = mainObjectMatch[0];
                            console.log('Found plausible main object for PLAN recovery.');
                        }

                        objectToProcessForPlan = applyFixes(objectToProcessForPlan);

                        const planArrayMatch = objectToProcessForPlan.match(/"plan"\s*:\s*(\[[\s\S]*?\])/); // Non-greedy match for plan array
                        if (planArrayMatch && planArrayMatch[1]) {
                            let planArrayStr = planArrayMatch[1];
                            planArrayStr = applyFixes(planArrayStr); // Apply fixes to the extracted array string

                            const steps: any[] = [];
                            let malformedSteps = 0;

                            // More robust step splitting:
                            // Iterate through the string, tracking brace depth to find individual objects.
                            let depth = 0;
                            let currentStepStart = -1;
                            for (let i = 0; i < planArrayStr.length; i++) {
                                if (planArrayStr[i] === '{') {
                                    if (depth === 0) currentStepStart = i;
                                    depth++;
                                } else if (planArrayStr[i] === '}') {
                                    depth--;
                                    if (depth === 0 && currentStepStart !== -1) {
                                        const stepStr = planArrayStr.substring(currentStepStart, i + 1);
                                        try {
                                            const fixedStepStr = applyFixes(stepStr); // Apply fixes per step
                                            steps.push(JSON.parse(fixedStepStr));
                                        } catch (stepError: any) { // Explicitly type stepError or use type guard
                                            malformedSteps++;
                                            console.log(`Could not parse step: [${stepStr}]. Error: ${stepError instanceof Error ? stepError.message : String(stepError)}`);
                                        }
                                        currentStepStart = -1;
                                    }
                                }
                            }

                            if (steps.length > 0 || (planArrayStr.trim() !== '[]' && malformedSteps > 0) ) { // Proceed if steps found or if array wasn't empty but all steps failed
                                let type = "PLAN";
                                let context = `Recovered ${steps.length} steps. ${malformedSteps} steps failed to parse.`;
                                try {
                                    // A light attempt to parse the main object without the plan array for its keys
                                    const tempMainObjectStr = objectToProcessForPlan.replace(planArrayMatch[0], '"plan": []');
                                    const tempMainObject = JSON.parse(applyFixes(tempMainObjectStr)); // Fixes on temp main obj
                                    if (tempMainObject.type) type = tempMainObject.type;
                                    if (tempMainObject.context) context = tempMainObject.context + " " + context;
                                    else if (tempMainObject.description && steps.length === 0) context = tempMainObject.description + " " + context;


                                    parsed = { type: type, plan: steps, context: context };
                                    // If original object had other keys, try to preserve them
                                    for(const key in tempMainObject) {
                                        if (key !== "type" && key !== "plan" && key !== "context") {
                                            parsed[key] = tempMainObject[key];
                                        }
                                    }

                                } catch {
                                     parsed = { type: type, plan: steps, context: context };
                                }
                                console.log(`Partially/Fully recovered PLAN object with ${steps.length} steps. ${malformedSteps} malformed.`);
                            }
                        }
                    } catch (planRecoveryError: any) { // Explicitly type planRecoveryError or use type guard
                        console.log('Error during PLAN array recovery attempt:', planRecoveryError instanceof Error ? planRecoveryError.message : String(planRecoveryError));
                    }
                }

                // Attempt 4: Fallback to old regex pattern matching if still not parsed
                if (!parsed) {
                    console.log('Falling back to regex pattern fragment matching.');
                    const jsonPatterns = [
                        /(\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\})/g, // Match complete objects
                        /(\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])/g  // Match complete arrays
                    ];
                    let bestMatch: string | null = null;
                    let bestScore = 0;

                    for (const pattern of jsonPatterns) {
                        const matches = Array.from(cleanedResponse.matchAll(pattern));
                        for (const match of matches) {
                            const candidate = match[1];
                            try {
                                const tempParsedCandidate = JSON.parse(applyFixes(candidate)); // Apply fixes here too
                                let score = candidate.length;
                                if (typeof tempParsedCandidate === 'object' && tempParsedCandidate !== null) {
                                    if (tempParsedCandidate.type && ['PLAN', 'PLUGIN', 'DIRECT_ANSWER'].includes(tempParsedCandidate.type)) score += 1000;
                                    if (tempParsedCandidate.plan && Array.isArray(tempParsedCandidate.plan)) score += 500;
                                } else if (Array.isArray(tempParsedCandidate) && tempParsedCandidate.length > 0 && tempParsedCandidate[0] && (tempParsedCandidate[0].verb || tempParsedCandidate[0].actionVerb)) {
                                    score += 1500; // Raw plan array
                                }
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMatch = candidate;
                                }
                            } catch (e) { /* ignore invalid fragments */ }
                        }
                    }
                    if (bestMatch) {
                        console.log('Found best JSON fragment via pattern matching, parsing it after fixes.');
                        try {
                            parsed = JSON.parse(applyFixes(bestMatch));
                        } catch (fragmentParseError: any) { // Explicitly type fragmentParseError or use type guard
                             console.log('Failed to parse best fragment even after fixes. Error:', fragmentParseError instanceof Error ? fragmentParseError.message : String(fragmentParseError));
                        }
                    }
                }
            }

            if (!parsed) {
                console.log('Could not extract or repair valid JSON from response. Original response will be returned.', response);
                return response;
            }
        }

        // At this point, 'parsed' is a valid JSON object or array.
        // Now, we handle specific schema adjustments for 'PLAN' types.

        // Case 1: LLM returned a raw array of plan steps instead of a wrapped PLAN object
        if (Array.isArray(parsed) && parsed.length > 0) {
            const firstStep = parsed[0];
            // Check if the first element looks like a plan step (has 'verb' or 'actionVerb' and 'description')
            if (typeof firstStep === 'object' && (firstStep.verb || firstStep.actionVerb) && firstStep.description) {
                console.log('Detected raw array of plan steps. Wrapping and normalizing into PLAN format.');
                const convertedPlan = parsed.map((step: any, index: number) => {
                    // Apply conversion for inputs
                    const inputs = this.convertInputsFormat(step.inputs);
                    
                    // Ensure 'outputs' exist and are non-empty, generating defaults if needed
                    const outputs = (step.outputs && Object.keys(step.outputs).length > 0) ? step.outputs : this.generateOutputsFromStep(step); 

                    // Normalize 'number' (if LLM used 'stepId' or it's missing)
                    const stepNumber = step.number || (typeof step.stepId === 'string' ? parseInt(step.stepId.replace('step_', ''), 10) : null) || (index + 1);
                    
                    // Normalize 'verb' (if LLM used 'actionVerb')
                    const verb = step.verb || step.actionVerb || 'UNKNOWN_VERB';

                    // Normalize dependencies to the expected object format
                    const dependencies = this.convertDependenciesFormat(step.dependencies);

                    // Normalize recommendedRole (if it's missing)
                    const recommendedRole = step.recommendedRole || 'executor';


                    return {
                        number: stepNumber,
                        verb: verb,
                        description: step.description || 'No description provided.',
                        inputs: inputs,
                        dependencies: dependencies,
                        outputs: outputs,
                        recommendedRole: recommendedRole
                    };
                });
                parsed = {
                    type: 'PLAN',
                    context: 'Plan extracted and normalized from raw array response.',
                    plan: convertedPlan
                };
            }
        }

        // Handle cases where the LLM might nest the actual response inside a DIRECT_ANSWER 'answer' field
        // This is a last resort if the direct parsing and plan array detection failed,
        // and a top-level DIRECT_ANSWER with complex content is found.
        if (parsed && parsed.type === 'DIRECT_ANSWER' && typeof parsed.answer === 'string') {
            try {
                let innerContent = parsed.answer.trim();
                // Remove 'json\n' if the LLM put it inside the answer string
                if (innerContent.startsWith('json\n')) {
                    innerContent = innerContent.substring(5).trim();
                }

                const innerParsed = JSON.parse(innerContent);
                // If the inner content is a valid PLAN or a raw array that looks like a plan
                if ((typeof innerParsed === 'object' && innerParsed.type === 'PLAN') || 
                    (Array.isArray(innerParsed) && innerParsed.length > 0 && (innerParsed[0].verb || innerParsed[0].actionVerb))) {
                    
                    console.log('Extracted plan from DIRECT_ANSWER.answer field.');
                    // Recursively call ensureJsonResponse to process the inner content
                    return this.ensureJsonResponse(innerContent, true);
                }
            } catch (e) {
                console.log('DIRECT_ANSWER.answer content is not a parsable JSON plan, retaining as is.');
            }
        }


        return JSON.stringify(parsed, null, 2);
    }

    protected trimMessages(messages: ExchangeType, maxTokens: number): ExchangeType {
        const targetTokens = Math.floor(maxTokens / 2);
        let estimatedTokens = 0;
        const trimmedMessages: ExchangeType = [];

        // Estimate tokens (4 characters ~= 1 token)
        const estimateTokens = (text: string) => Math.ceil(text.length / 4);

        // Iterate through messages in reverse order
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            let messageTokens = 0;

            if (typeof message.content === 'string') {
                messageTokens = estimateTokens(message.content);
            }

            if (i === messages.length - 1 || estimatedTokens + messageTokens <= targetTokens) {
                trimmedMessages.unshift(message);
                estimatedTokens += messageTokens;
            } else {
                break;
            }
        }

        return trimmedMessages;
    }
}

export default BaseInterface;
