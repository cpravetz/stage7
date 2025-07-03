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
        try {
            parsed = JSON.parse(cleanedResponse);
            console.log('Response is valid JSON after initial cleaning.');
        } catch (e) {
            console.log('Response is not valid JSON after initial cleaning, attempting extraction/repair.');
            
            const jsonPatterns = [
                // Match complete objects or arrays with proper nesting
                /(\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\})/g,
                /(\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])/g
            ];

            let bestMatch = null;
            let bestScore = 0;

            for (const pattern of jsonPatterns) {
                const matches = Array.from(cleanedResponse.matchAll(pattern));
                for (const match of matches) {
                    const candidate = match[1];
                    try {
                        const tempParsed = JSON.parse(candidate);
                        let score = candidate.length;

                        if (typeof tempParsed === 'object' && tempParsed !== null) {
                            // Boost score for expected top-level types
                            if (tempParsed.type && ['PLAN', 'PLUGIN', 'DIRECT_ANSWER'].includes(tempParsed.type)) {
                                score += 1000;
                            }
                            // Boost score for plan structure (if wrapped or raw array)
                            if (tempParsed.plan && Array.isArray(tempParsed.plan)) {
                                score += 500;
                            } else if (Array.isArray(tempParsed) && tempParsed.length > 0) {
                                // Check if it looks like a raw plan array by looking for 'verb' or 'actionVerb'
                                const firstStep = tempParsed[0];
                                if (typeof firstStep === 'object' && (firstStep.verb || firstStep.actionVerb) && firstStep.description) {
                                    score += 1500; // High boost for raw plan array
                                }
                            }
                        }

                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = candidate;
                        }
                    } catch (e) {
                        // This candidate is not valid JSON, continue
                    }
                }
            }
            
            if (bestMatch) {
                console.log('Found best JSON match, parsing it.');
                parsed = JSON.parse(bestMatch);
            } else {
                console.log('Could not extract valid JSON from response using patterns. Trying common repair strategies.');
                const anyJsonMatch = cleanedResponse.match(/[\{\[][\s\S]*[\}\]]/);
                if (anyJsonMatch) {
                    let candidate = anyJsonMatch[0];
                    const fixes = [
                        (s: string) => s.replace(/,(\s*[}\]])/g, '$1'), // Remove trailing commas before a closing brace/bracket
                        (s: string) => s.replace(/'/g, '"'),          // Fix single quotes to double quotes
                        (s: string) => s.replace(/\/\/.*$/gm, ''),    // Remove single-line comments
                        (s: string) => s.replace(/(\w+):/g, '"$1":'), // Add quotes to unquoted keys
                        (s: string) => s.replace(/,\s*([\]\}])/g, '$1'), // Remove trailing commas (more robust)
                        // Attempt to fix missing commas between key-value pairs if separated by a newline
                        (s: string) => s.replace(/("\s*:\s*(?:true|false|null|"[^"]*"|[\d\.]+)\s*)\n(\s*")/g, '$1,\n$2'),
                        // Attempt to fix key"":""value typos to key":"value
                        (s: string) => s.replace(/("\s*":)":"\s*([^"]*")/g, '$1"$2"')
                    ];
                    for (const fix of fixes) {
                        try {
                            const fixed = fix(candidate);
                            JSON.parse(fixed);
                            console.log('Successfully fixed JSON with repair strategy');
                            parsed = JSON.parse(fixed);
                            break;
                        } catch (e) {
                            candidate = fix(candidate); // Keep applying fixes cumulatively if one fails
                        }
                    }
                }
            }

            if (!parsed) {
                console.log('Could not extract or repair valid JSON from response', response);
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
