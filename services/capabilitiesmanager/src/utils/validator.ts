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

                IMPORTANT BEHAVIOR RULES (please follow exactly):
                1) If a required input is missing but there already exists another provided input whose name and value clearly correspond to the missing input (for example camelCase vs snake_case, synonyms like filePath vs path, or identical values), RENAME that existing provided input to the required input name instead of adding a new duplicate input. Prefer renaming over adding a new input when it preserves intent and types match.
                2) If multiple candidate provided inputs could be the intended source, choose the one with the closest string similarity and matching value type, and document your choice in a top-level field '_repair_note' in the returned JSON (this field will be ignored by the system but is useful for auditing).
                3) If you must add a new input (no candidate exists), add it with appropriate 'value' and 'valueType' or as 'outputName'/'sourceStep' if you can determine it.
                4) RETURN ONLY A SINGLE JSON OBJECT mapping final input names to values. Do NOT include explanatory text or markdown. If you include '_repair_note', it must be a string field in the same object.

                Your Goal: Create a JSON object where keys are the input names and values are the corresponding transformed values.
                This object MUST include every required input with non-empty values.
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
    
    let currentInputs = new Map(inputs);

    // Early-stage rename for single-input plugins
    const requiredInputs = plugin.inputDefinitions?.filter(def => def.required) || [];
    const providedInputKeys = Array.from(currentInputs.keys());

    if (requiredInputs.length === 1 && providedInputKeys.length === 1) {
        const requiredInputName = requiredInputs[0].name;
        const providedInputKey = providedInputKeys[0];

        if (requiredInputName !== providedInputKey) {
            console.log(`[${trace_id}] ${source_component}: Applying single-input rename rule: '${providedInputKey}' -> '${requiredInputName}'`);
            const inputValue = currentInputs.get(providedInputKey)!;
            
            const updatedInputValue: InputValue = { ...inputValue, inputName: requiredInputName };

            currentInputs = new Map([[requiredInputName, updatedInputValue]]);
        }
    }
    
    const MAX_ATTEMPTS = 3;  // Allow up to 3 attempts with Brain transformations
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
                error: `Plugin '${plugin.verb}' has invalid inputDefinitions. Expected an array but received: ${typeof plugin.inputDefinitions}`,
                validationType: 'InvalidPluginDefinition'
            };
        }
        
        // Handle novel verbs by checking if this is a dynamic plugin
        const isNovelVerb = !plugin.id || plugin.id.startsWith('dynamic-') || plugin.verb.includes('_DYNAMIC_');
        if (isNovelVerb) {
            console.log(`[${trace_id}] ${source_component}: Processing novel verb plugin: ${plugin.verb}`);
            // For novel verbs, be more permissive with input validation
        }

        const standardizedInputs = new Map<string, EnhancedInputValue>();

        // First pass: Match and standardize inputs (prioritize direct match)
        for (const inputDef of inputDefinitions) {
            console.log(`[${trace_id}] Processing inputDef: ${inputDef.name}`);
            const inputName = inputDef.name;
            let inputKey: string | undefined = undefined;

            // Prioritize exact match first (preserve actual field names)
            if (sanitizedInputs.has(inputName)) {
                console.log(`[${trace_id}] Found exact match for ${inputName}`);
                inputKey = inputName;
            } else {
                console.log(`[${trace_id}] No exact match for ${inputName}. Checking aliases and similar names...`);
                const aliases: string[] = (inputDef as any).aliases || [];
                console.log(`[${trace_id}] Aliases for ${inputName}: ${JSON.stringify(aliases)}`);
                
                // Find an input key that matches the input definition name or any declared aliases
                inputKey = Array.from(sanitizedInputs.keys()).find(key => {
                    console.log(`[${trace_id}]   - Comparing sanitized key '${key}' against ${inputName}`);
                    if (typeof key !== 'string') return false;
                    const lowerKey = key.toLowerCase();
                    const lowerInputName = inputName.toLowerCase();

                    // Direct match (already checked above, but good for robustness)
                    if (lowerKey === lowerInputName) {
                        console.log(`[${trace_id}]     - Direct match found (case-insensitive)`);
                        return true;
                    }

                    // Check manifest-declared aliases first (exact matches)
                    for (const a of aliases) {
                        if (typeof a === 'string' && lowerKey === a.toLowerCase()) {
                             console.log(`[${trace_id}]     - Alias match found: '${key}' matches alias '${a}'`);
                             return true;
                        }
                    }

                    // Simple pluralization handling
                    if (lowerKey === lowerInputName + 's' || (lowerInputName.endsWith('s') && lowerKey + 's' === lowerInputName)) {
                        console.log(`[${trace_id}]     - Pluralization match found`);
                        return true;
                    }

                    // CamelCase vs snake_case normalization: strip underscores and compare
                    if (lowerKey.replace(/_/g, '') === lowerInputName.replace(/_/g, '')) {
                        console.log(`[${trace_id}]     - Case normalization (snake/camel) match found`);
                        return true;
                    }

                    return false;
                });
                console.log(`[${trace_id}] Result of alias search for ${inputName}: inputKey = ${inputKey}`);
            }

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
                // Enhanced error message with available fields suggestion
                const availableFields = Array.from(standardizedInputs.keys()).join(', ');
                const suggestion = availableFields ? ` Available fields: ${availableFields}.` : ' No input fields provided.';
                
                // For novel verbs, provide more helpful guidance
                if (isNovelVerb) {
                    return {
                        success: false,
                        error: `Missing required input field: '${inputDef.name}' (type: ${inputDef.type}) for novel verb plugin '${plugin.verb}'.${suggestion} Novel verbs may require explicit field mapping.`,
                        validationType: 'MissingRequiredInput'
                    };
                } else {
                    return {
                        success: false,
                        error: `Missing required input field: '${inputDef.name}' (type: ${inputDef.type}). This field is mandatory for plugin '${plugin.verb}'.${suggestion}`,
                        validationType: 'MissingRequiredInput'
                    };
                }
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
                            error: `Empty value for required input field: '${inputDef.name}' (type: ${inputDef.type}). Plugin '${plugin.verb}' requires a non-empty value for this field.`,
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
                            error: `Invalid JSON format for input field '${inputDef.name}' (expected: ${inputDef.type}). Error: ${e.message}. Please provide valid JSON.`,
                            validationType: 'InvalidJSONFormat'
                        };
                    }
                }
                
                // Additional type validation
                if (value !== undefined && value !== null) {
                    const expectedType = inputDef.type;
                    const actualType = typeof value;
                    
                    // Check for type mismatches
                    if (expectedType === PluginParameterType.NUMBER && actualType !== 'number') {
                        return {
                            success: false,
                            error: `Type mismatch for input field '${inputDef.name}'. Expected: ${expectedType}, Received: ${actualType}. Value: ${JSON.stringify(value)}`,
                            validationType: 'TypeMismatch'
                        };
                    }
                    
                    if (expectedType === PluginParameterType.BOOLEAN && actualType !== 'boolean') {
                        return {
                            success: false,
                            error: `Type mismatch for input field '${inputDef.name}'. Expected: ${expectedType}, Received: ${actualType}. Value: ${JSON.stringify(value)}`,
                            validationType: 'TypeMismatch'
                        };
                    }
                    
                    if (expectedType === PluginParameterType.ARRAY && !Array.isArray(value)) {
                        return {
                            success: false,
                            error: `Type mismatch for input field '${inputDef.name}'. Expected: array, Received: ${actualType}. Value: ${JSON.stringify(value)}`,
                            validationType: 'TypeMismatch'
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
