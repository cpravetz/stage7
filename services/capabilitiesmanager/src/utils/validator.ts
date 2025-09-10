import { InputValue, PluginDefinition, MapSerializer, PluginParameterType } from '@cktmcs/shared';
import { v4 as uuidv4 } from 'uuid';
import { createAuthenticatedAxios } from '@cktmcs/shared';
import { sanitizeInputValue, performPreExecutionChecks } from './inputSanitizer';

// Simple in-memory cache for transformed inputs
const transformCache = new Map<string, Map<string, InputValue>>();

interface EnhancedInputValue extends InputValue {
    validationType?: string;
    originalName?: string;
}

interface ValidationResult {
    success: boolean;
    inputs?: Map<string, EnhancedInputValue>;
    error?: string;
    validationType?: string;
}

function getTypeDefaultValue(type: PluginParameterType): any {
    switch (type) {
        case PluginParameterType.OBJECT:
            return {};
        case PluginParameterType.ARRAY:
            return [];
        case PluginParameterType.STRING:
            return '';
        case PluginParameterType.NUMBER:
            return 0;
        case PluginParameterType.BOOLEAN:
            return false;
        default:
            return null;
    }
}

async function transformInputsWithBrain(
    plugin: PluginDefinition,
    providedInputs: Map<string, InputValue>,
    trace_id: string,
    errorMessage?: string
): Promise<Map<string, InputValue>> {
    const source_component = "validator.transformInputsWithBrain";
    const cacheKey = `${plugin.verb}:${JSON.stringify(Array.from(providedInputs.entries()))}`;

    if (transformCache.has(cacheKey)) {
        console.log(`[${trace_id}] ${source_component}: Using cached transformed inputs for ${plugin.verb}`);
        return transformCache.get(cacheKey)!;
    }

    const MAX_BRAIN_ATTEMPTS = 2;
    let lastBrainError: string | undefined;

    for (let attempt = 1; attempt <= MAX_BRAIN_ATTEMPTS; attempt++) {
        try {
            const authenticatedApi = createAuthenticatedAxios(
                'Validator',
                process.env.BRAIN_URL || 'brain:5070',
                process.env.CLIENT_SECRET || 'stage7AuthSecret'
            );
            
            let prompt = `
                You are an expert at transforming inputs for a plugin.
                Your task is to map the 'Inputs Provided' to the 'Inputs Required' based on the plugin's definition.
                You must return a valid JSON object with the transformed inputs, ensuring all required inputs are present and correctly typed.
                ${errorMessage ? `The previous attempt failed with this error: ${errorMessage}. Please correct it.` : ''}

                --- Plugin Definition ---
                Plugin Name: ${plugin.verb}
                Description: ${plugin.description}
                All Input Definitions:
                ${JSON.stringify(plugin.inputDefinitions, null, 2)}

                --- Input Mapping Task ---
                Inputs Provided (from the user/previous steps):
                ${JSON.stringify(Object.fromEntries(providedInputs), null, 2)}

                Your Goal: Create a JSON object where keys are the input names and values are the corresponding transformed values.
                This object MUST include every required input with non-empty values.
                Return ONLY the transformed JSON object.
            `;

            const response = await authenticatedApi.post(
                `http://${process.env.BRAIN_URL || 'brain:5070'}/chat`,
                {
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an input transformation expert. Return ONLY valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    conversationType: "TextToJSON",
                    temperature: 0.1
                }
            );

            let result = typeof response.data.result === 'string' ? 
                response.data.result : 
                JSON.stringify(response.data.result);

            let cleanResult = result.trim();
            if (cleanResult.startsWith('```json')) {
                const match = cleanResult.match(/```json\n([\s\S]*?)```/);
                if (match) cleanResult = match[1].trim();
            }

            const parsedResponse = JSON.parse(cleanResult);
            const transformedInputsMap = new Map<string, InputValue>();

            for (const [key, value] of Object.entries(parsedResponse)) {
                const inputDef = plugin.inputDefinitions?.find(def => def.name === key);
                const valueType = inputDef?.type || PluginParameterType.ANY;

                // Sanitize the transformed input
                const input: InputValue = {
                    inputName: key,
                    value: value,
                    valueType: valueType,
                    args: inputDef?.args || {}
                };
                
                transformedInputsMap.set(key, sanitizeInputValue(input, plugin.verb, trace_id));
            }

            transformCache.set(cacheKey, transformedInputsMap);
            return transformedInputsMap;

        } catch (error: any) {
            lastBrainError = error?.message || 'Unknown error';
            console.error(`[${trace_id}] ${source_component}: Brain transformation attempt ${attempt} failed: ${lastBrainError}`);
            if (attempt === MAX_BRAIN_ATTEMPTS) {
                throw new Error(`Input transformation failed after ${MAX_BRAIN_ATTEMPTS} Brain attempts: ${lastBrainError}`);
            }
        }
    }
    throw new Error(`Input transformation failed: No valid response received`);
}

export const validateAndStandardizeInputs = async (
    plugin: PluginDefinition,
    inputs: Map<string, InputValue>
): Promise<ValidationResult> => {
    const trace_id = `validate-${uuidv4().substring(0,8)}`;
    const source_component = "validator.validateAndStandardizeInputs";
    
    const MAX_ATTEMPTS = 3;  // Allow up to 3 attempts with Brain transformations
    let currentInputs = new Map(inputs);
    let lastError: string | undefined;
    let lastValidationType: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            // First, sanitize current inputs
            const sanitizedInputs = new Map<string, InputValue>();
            for (const [key, input] of currentInputs.entries()) {
                sanitizedInputs.set(key, sanitizeInputValue(input, plugin.verb, trace_id));
        }

        // Perform pre-execution checks
        const preCheckResult = performPreExecutionChecks(sanitizedInputs, plugin.verb, trace_id);
        if (!preCheckResult.isValid) {
            console.warn(`[${trace_id}] ${source_component}: Pre-execution check warnings:\n${preCheckResult.issues.join('\n')}`);
            sanitizedInputs.set('__validation_warnings', {
                inputName: '__validation_warnings',
                value: preCheckResult.issues,
                valueType: PluginParameterType.ARRAY,
                args: {}
            });
        }

        const inputDefinitions = plugin.inputDefinitions || [];
        if (!Array.isArray(inputDefinitions)) {
            return {
                success: false,
                error: `Plugin ${plugin.verb} has invalid inputDefinitions`,
                validationType: 'InvalidPluginDefinition'
            };
        }

        const standardizedInputs = new Map<string, EnhancedInputValue>();

        // First pass: Match and standardize inputs
        for (const inputDef of inputDefinitions) {
            const inputName = inputDef.name;
            const inputKey = Array.from(sanitizedInputs.keys()).find(key => {
                if (typeof key !== 'string') {
                    return false;
                }
                const lowerKey = key.toLowerCase();
                const lowerInputName = inputName.toLowerCase();
                return lowerKey === lowerInputName || 
                       lowerKey === lowerInputName + 's' || 
                       (lowerInputName.endsWith('s') && lowerKey + 's' === lowerInputName);
            });

            if (inputKey) {
                const value = sanitizedInputs.get(inputKey)!;
                let extractedValue: any;

                // Extract the actual value from InputValue object
                if (value && 'value' in value) {
                    extractedValue = value.value;
                } else {
                    extractedValue = value; // Use as is if not an InputValue object
                }

                standardizedInputs.set(inputName, {
                    ...value, // Keep original InputValue structure for other properties
                    inputName,
                    value: extractedValue, // Use the extracted actual value
                    validationType: inputDef.type,
                    originalName: inputKey
                });
                sanitizedInputs.delete(inputKey);
            } else if (inputDef.defaultValue !== undefined) {
                standardizedInputs.set(inputName, {
                    inputName,
                    value: inputDef.defaultValue,
                    valueType: inputDef.type,
                    args: {},
                    validationType: inputDef.type
                });
            }
        }

        // Validate required inputs and types
        for (const inputDef of inputDefinitions) {
            const input = standardizedInputs.get(inputDef.name);

            if (!input && inputDef.required) {
                return {
                    success: false,
                    error: `Missing required input: ${inputDef.name}`,
                    validationType: 'MissingRequiredInput'
                };
            }

            if (input) {
                const value = input.value;
                if (inputDef.required) {
                    const isEmpty = !value || 
                        (typeof value === 'string' && !value.trim()) ||
                        (Array.isArray(value) && !value.length) ||
                        (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);

                    if (isEmpty) {
                        return {
                            success: false,
                            error: `Empty value for required input: ${inputDef.name}`,
                            validationType: 'EmptyRequiredInput'
                        };
                    }
                }

                // Type validation and conversion
                if (input.valueType === PluginParameterType.OBJECT && typeof value === 'string') {
                    try {
                        input.value = JSON.parse(value);
                    } catch (e: any) {
                        return {
                            success: false,
                            error: `Invalid JSON for input "${inputDef.name}": ${e.message}`,
                            validationType: 'InvalidJSONFormat'
                        };
                    }
                }
            }
        }

        // Add any remaining unmatched inputs
        for (const [key, input] of sanitizedInputs.entries()) {
            if (!standardizedInputs.has(key)) {
                standardizedInputs.set(key, {
                    ...input,
                    validationType: input.valueType || PluginParameterType.ANY,
                    originalName: key
                });
            }
        }

        const validationResult: ValidationResult = { 
            success: true, 
            inputs: standardizedInputs 
        };

        if (validationResult.success) {
            return validationResult;
        } else {
            lastError = validationResult.error;
            lastValidationType = validationResult.validationType;
            
            // If this isn't our last attempt, try using Brain to transform the inputs
            if (attempt < MAX_ATTEMPTS) {
                console.log(`[${trace_id}] ${source_component}: Attempt ${attempt} failed. Error: ${lastError}. Using Brain to transform inputs...`);
                try {
                    currentInputs = await transformInputsWithBrain(plugin, currentInputs, trace_id, lastError);
                    continue;
                } catch (brainError: any) {
                    console.error(`[${trace_id}] ${source_component}: Brain transformation failed:`, brainError);
                    // If Brain transform fails, continue with next attempt using original inputs
                }
            }
        }
    } catch (error: any) {
        console.error(`[${trace_id}] ${source_component}: Validation error:`, error);
        lastError = error.message || 'Unknown validation error';
        lastValidationType = 'ValidationError';
        
        // If this isn't our last attempt, try using Brain
        if (attempt < MAX_ATTEMPTS) {
            try {
                currentInputs = await transformInputsWithBrain(plugin, currentInputs, trace_id, lastError);
                continue;
            } catch (brainError: any) {
                console.error(`[${trace_id}] ${source_component}: Brain transformation failed:`, brainError);
            }
        }
    }
    }

    // If we get here, all attempts have failed
    console.error(`[${trace_id}] ${source_component}: All validation attempts failed after ${MAX_ATTEMPTS} tries`);
    return {
        success: false,
        error: lastError || 'Validation failed after multiple attempts',
        validationType: lastValidationType || 'ValidationError'
    };
};
