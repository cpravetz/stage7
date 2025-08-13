import { InputValue, PluginDefinition, MapSerializer, PluginParameterType } from '@cktmcs/shared';
import { PluginRegistry } from './pluginRegistry';
import { v4 as uuidv4 } from 'uuid';
import { createAuthenticatedAxios } from '@cktmcs/shared';

// Simple in-memory cache for transformed inputs
const transformCache = new Map<string, Map<string, InputValue>>();

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

interface EnhancedInputValue extends InputValue {
    validationType?: string;
    originalName?: string;
}

export const validateInputType = async (value: any, expectedType: string): Promise<boolean> => {
    switch (expectedType.toLowerCase()) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number';
        case 'boolean':
            return typeof value === 'boolean';
        case 'array':
            return Array.isArray(value);
        case 'object':
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                return true;
            }
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
                } catch {
                    return false;
                }
            }
            return false;
        default:
            return true; // Allow unknown types to pass validation
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

    const MAX_BRAIN_ATTEMPTS = 2; // Allow one retry for JSON parsing issues
    let lastBrainError: string | undefined;

    for (let attempt = 1; attempt <= MAX_BRAIN_ATTEMPTS; attempt++) {
        try {
            const authenticatedApi = createAuthenticatedAxios(
                'Validator',
                process.env.BRAIN_URL || 'brain:5070',
                process.env.CLIENT_SECRET || 'stage7AuthSecret'
            );
            const requiredInputs = plugin.inputDefinitions?.filter(def => def.required).map(def => def.name) || [];
            
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

                Inputs Required (by the plugin, based on 'required: true' in definitions):
                ${requiredInputs.length > 0 ? requiredInputs.join(', ') : 'None explicitly required, but consider common sense defaults.'}

                Your Goal: Create a JSON object where keys are the input names and values are the corresponding transformed values from 'Inputs Provided'.
                This object MUST include every required input.
                If a required input is NOT present in 'Inputs Provided' and you cannot derive a sensible value, provide a reasonable default based on its 'valueType'.
                For example, if 'valueType' is 'string', use an empty string ""; if 'number', use 0; if 'boolean', use false; if 'object', use {}; if 'array', use [].
                If no sensible default can be determined, explicitly set the value to null.

                Return ONLY the transformed JSON object.
                DO NOT include any explanation, markdown formatting, or extra text.
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

            if (!response.data || typeof response.data !== 'object') {
                throw new Error('Invalid response format from Brain service');
            }

            let result: string;
            if (typeof response.data.result === 'string') {
                result = response.data.result;
            } else if (response.data.result && typeof response.data.result === 'object') {
                result = JSON.stringify(response.data.result);
            } else {
                throw new Error('Brain response missing result field');
            }

            // Clean up and parse the result
            // Log raw Brain response for debugging
            console.log(`[${trace_id}] ${source_component}: Raw Brain response: ${result.substring(0, 500)}...`);

            let cleanResult = result.trim();
            if (cleanResult.startsWith('```json')) {
                const match = cleanResult.match(/```json\n([\s\S]*?)```/);
                if (match) cleanResult = match[1].trim();
            }

            const parsedResponse = JSON.parse(cleanResult);
            const transformedInputsMap = new Map<string, InputValue>();

            // Validate and transform each input
            for (const key in parsedResponse) {
                const inputDef = plugin.inputDefinitions?.find(def => def.name === key);
                const value = parsedResponse[key];
                const valueType = inputDef?.type || PluginParameterType.ANY;

                // Validate the transformed value against the expected type
                const isValid = await validateInputType(value, valueType);
                if (!isValid) {
                    console.warn(`[${trace_id}] ${source_component}: Transformed value for ${key} doesn't match expected type ${valueType}`);
                    continue;
                }

                transformedInputsMap.set(key, {
                    inputName: key,
                    value: value,
                    valueType: valueType,
                    args: inputDef?.args || {}
                });
            }

            // Verify all required inputs are present
            const missingRequired = requiredInputs.filter(input => !transformedInputsMap.has(input));
            if (missingRequired.length > 0) {
                throw new Error(`Missing required inputs after transformation: ${missingRequired.join(', ')}`);
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
    throw new Error(`Input transformation failed after ${MAX_BRAIN_ATTEMPTS} Brain attempts: No valid response received.`);
}

export const validateAndStandardizeInputs = async (plugin: PluginDefinition, inputs: Map<string, InputValue>):
    Promise<{ success: boolean; inputs?: Map<string, EnhancedInputValue>; error?: string }> => {
    const trace_id = `validate-${uuidv4().substring(0,8)}`;
    console.log(`[${trace_id}] validateAndStandardizeInputs: Called for plugin:`, plugin.verb, 'version:', plugin.version);

    const performValidation = async (
        inputsToValidate: Map<string, InputValue>
    ): Promise<{ success: boolean; inputs?: Map<string, EnhancedInputValue>; error?: string }> => {
        const inputDefinitions = plugin.inputDefinitions || [];
        let standardizedInputs = new Map<string, EnhancedInputValue>(); // Changed to let
        let processedInputs = new Map(inputsToValidate); // Changed to let

        // --- START: Specific remediation for TEXT_ANALYSIS ---
        if (plugin.verb === 'TEXT_ANALYSIS') {
            const textDataInput = processedInputs.get('textData');
            if (textDataInput && !processedInputs.has('text')) {
                processedInputs.set('text', textDataInput);
                processedInputs.delete('textData');
                console.log(`[${trace_id}] validateAndStandardizeInputs: Remapped 'textData' to 'text' for TEXT_ANALYSIS plugin.`);
            }
        }
        // --- END: Specific remediation for TEXT_ANALYSIS ---

        // First pass: Standardize keys to match definition case and handle simple pluralization
        // This loop populates standardizedInputs with initially matched inputs
        for (const inputDef of inputDefinitions) {
            const inputName = inputDef.name;
            const inputKey = Array.from(processedInputs.keys()).find(key => {
                const lowerKey = key.toLowerCase();
                const lowerInputName = inputName.toLowerCase();
                return (
                    lowerKey === lowerInputName ||
                    lowerKey === lowerInputName + 's' || // e.g., 'terms' -> 'term'
                    (lowerInputName.endsWith('s') && lowerKey + 's' === lowerInputName) // e.g., 'term' -> 'terms'
                );
            });

            if (inputKey) { // If a match is found (either exact or pluralized)
                const value = processedInputs.get(inputKey)!;
                standardizedInputs.set(inputName, { // Use the canonical inputName from definition
                    ...value,
                    inputName: inputName, // Ensure inputName in value object is correct
                    validationType: inputDef.type,
                    originalName: inputKey // Keep original name for debugging if needed
                });
                processedInputs.delete(inputKey); // Remove from processedInputs as it's now handled
            } else if (inputDef.defaultValue !== undefined) {
                standardizedInputs.set(inputName, {
                    inputName,
                    value: inputDef.defaultValue,
                    valueType: inputDef.type,
                    args: {}
                });
            }
        }

        // Identify truly missing required inputs and unmatched provided inputs after first pass
        const missingRequiredInputs = inputDefinitions.filter(def => def.required && !standardizedInputs.has(def.name));
        const unmatchedProvidedInputs = Array.from(processedInputs.entries()); // These are inputs not matched to any definition

        // --- START: Single Missing Input / Single Unmatched Provided Input Heuristic ---
        if (missingRequiredInputs.length === 1 && unmatchedProvidedInputs.length === 1) {
            const missingInputDef = missingRequiredInputs[0];
            const [unmatchedKey, unmatchedValue] = unmatchedProvidedInputs[0];

            console.log(`[${trace_id}] validateAndStandardizeInputs: Applying single missing/unmatched heuristic.`);
            console.log(`[${trace_id}] Missing: ${missingInputDef.name}, Unmatched: ${unmatchedKey}`);

            // Automatically rename the unmatched input to the missing required input's name
            standardizedInputs.set(missingInputDef.name, {
                ...unmatchedValue,
                inputName: missingInputDef.name,
                validationType: missingInputDef.type,
                originalName: unmatchedKey
            });
            processedInputs.delete(unmatchedKey); // Remove from processedInputs as it's now handled
            
            // Re-evaluate missing required inputs after this heuristic
            missingRequiredInputs.length = 0; // Clear the array
            inputDefinitions.forEach(def => {
                if (def.required && !standardizedInputs.has(def.name)) {
                    missingRequiredInputs.push(def);
                }
            });
        }
        // --- END: Single Missing Input / Single Unmatched Provided Input Heuristic ---

        // Final validation pass for required inputs and type checking
        for (const inputDef of inputDefinitions) {
            const inputName = inputDef.name;
            let input = standardizedInputs.get(inputName); // Get from standardizedInputs now

            if (!input && inputDef.required) {
                return {
                    success: false,
                    error: `Missing required input: ${inputName}`
                };
            }

            if (input) {
                const type = input.valueType || inputDef.type;
                const typeValidation = await validateInputType(input.value, type);
                if (!typeValidation) {
                    return {
                        success: false,
                        error: `Invalid type for input ${inputName}: expected ${type}, got ${typeof input.value}`
                    };
                }

                if (inputDef.required) {
                    const value = input.value;
                    let isEmpty = false;
                    if (value === null || value === undefined) {
                        isEmpty = true;
                    } else if (typeof value === 'string' && value.trim() === '') {
                        isEmpty = true;
                    } else if (Array.isArray(value) && value.length === 0) {
                        isEmpty = true;
                    } else if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
                        isEmpty = true;
                    }
                    if (isEmpty) {
                        return {
                            success: false,
                            error: `Missing value for required input: ${inputName}`
                        };
                    }
                }

                if (type === PluginParameterType.OBJECT && typeof input.value === 'string') {
                    try {
                        input.value = JSON.parse(input.value);
                    } catch {
                        return {
                            success: false,
                            error: `Invalid JSON string for object input "${inputName}"`
                        };
                    }
                }
                // No need to set standardizedInputs here, it's already populated
            }
        }

        // Add any remaining processedInputs (those not defined in manifest) to standardizedInputs
        for (const [inputName, input] of processedInputs.entries()) {
            if (!standardizedInputs.has(inputName)) { // Ensure it wasn't added by heuristic
                standardizedInputs.set(inputName, {
                    ...input,
                    validationType: input.valueType || PluginParameterType.ANY,
                    originalName: inputName
                });
            }
        }

        return { success: true, inputs: standardizedInputs };
    };

    try {
        const inputDefinitions = plugin.inputDefinitions || [];
        if (!Array.isArray(inputDefinitions)) {
            console.error(`[${trace_id}] validateAndStandardizeInputs: plugin.inputDefinitions is not an array`);
            return { success: false, error: `Plugin ${plugin.verb} has invalid inputDefinitions` };
        }

        const MAX_ATTEMPTS = 3;
        let currentInputs = new Map(inputs);
        let lastError: string | undefined;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const validationResult = await performValidation(currentInputs);

            if (validationResult.success) {
                console.log(`[${trace_id}] validateAndStandardizeInputs: Validation successful for ${plugin.verb} on attempt ${attempt}`);
                console.log(`[${trace_id}] validateAndStandardizeInputs: Results for ${plugin.verb}:`, {
                    pluginVerb: plugin.verb,
                    pluginVersion: plugin.version,
                    original: Array.from(inputs.keys()),
                    validated: Array.from(validationResult.inputs!.keys())
                });
                return validationResult;
            }

            lastError = validationResult.error;
            console.log(`[${trace_id}] validateAndStandardizeInputs: Attempt ${attempt} failed for ${plugin.verb}. Error: ${lastError}. Attempting Brain transformation.`);

            if (attempt < MAX_ATTEMPTS) {
                try {
                    currentInputs = await transformInputsWithBrain(plugin, currentInputs, trace_id, lastError);
                } catch (transformError: any) {
                    lastError = transformError.message;
                    console.error(`[${trace_id}] Brain transformation failed: ${lastError}`);
                    // Break the loop if transform fails, as we can't proceed
                    break;
                }
            }
        }

        console.error(`[${trace_id}] validateAndStandardizeInputs: Validation failed after ${MAX_ATTEMPTS} attempts for ${plugin.verb}. Final error: ${lastError}`);
        return {
            success: false,
            error: `Input validation failed for ${plugin.verb} after ${MAX_ATTEMPTS} attempts: ${lastError}`
        };

    } catch (error) {
        console.error(`[${trace_id}] validateAndStandardizeInputs Error:`, error);
        return {
            success: false,
            error: `Input validation error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

export const validatePlanStructure = async (planData: any[], pluginRegistry: PluginRegistry): Promise<{ success: boolean; error?: string; errorType?: string; stepNumber?: number }> => {
    if (!Array.isArray(planData) || planData.length === 0) {
        return {
            success: false,
            error: "Plan must be a non-empty array of steps",
            errorType: "plan_structure_error"
        };
    }

    const availablePlugins = new Set<string>();
    try {
        const verbIndex = (pluginRegistry as any).verbIndex;
        if (verbIndex && verbIndex instanceof Map) {
            for (const verb of verbIndex.keys()) {
                availablePlugins.add(verb);
            }
        }
    } catch (error) {
        console.warn('validatePlanStructure: Could not fetch plugins from registry:', error);
    }

    for (let i = 0; i < planData.length; i++) {
        const step = planData[i];
        const stepNumber = i + 1;

        const requiredFields = ['actionVerb', 'description'];
        for (const field of requiredFields) {
            if (!step[field]) {
                return {
                    success: false,
                    error: `Step ${stepNumber} missing required field '${field}'`,
                    errorType: "missing_field",
                    stepNumber
                };
            }
        }

        const actionVerb = step.actionVerb;
        if (availablePlugins.size > 0 && !availablePlugins.has(actionVerb)) {
            return {
                success: false,
                error: `Step ${stepNumber} uses invalid actionVerb '${actionVerb}'. Available plugins: ${Array.from(availablePlugins).sort().join(', ')}`,
                errorType: "invalid_action_verb",
                stepNumber
            };
        }

        if (step.inputReferences && typeof step.inputReferences === 'object') {
            for (const [inputName, inputRef] of Object.entries(step.inputReferences)) {
                if (inputRef && typeof inputRef === 'object' && 'value' in inputRef) {
                    const value = (inputRef as any).value;
                    if (typeof value === 'string' && value.startsWith("{''") && value.endsWith("''}")) {
                        return {
                            success: false,
                            error: `Step ${stepNumber} input '${inputName}' has malformed dictionary string: ${value}`,
                            errorType: "malformed_input_reference",
                            stepNumber
                        };
                    }
                }
            }
        }

        if (step.actionVerb === 'IF_THEN') {
            const inputs = step.inputs || {};
            if (!inputs.condition) {
                return {
                    success: false,
                    error: `Step ${stepNumber} IF_THEN missing required 'condition' input`,
                    errorType: "missing_if_then_condition",
                    stepNumber
                };
            }

            if (inputs.trueSteps && !Array.isArray(inputs.trueSteps.value)) {
                return {
                    success: false,
                    error: `Step ${stepNumber} IF_THEN 'trueSteps' must be an array`,
                    errorType: "invalid_if_then_structure",
                    stepNumber
                };
            }

            if (inputs.falseSteps && !Array.isArray(inputs.falseSteps.value)) {
                return {
                    success: false,
                    error: `Step ${stepNumber} IF_THEN 'falseSteps' must be an array`,
                    errorType: "invalid_if_then_structure",
                    stepNumber
                };
            }
        }

        if (step.actionVerb === 'FILE_OPERATION') {
            const inputs = step.inputs || {};
            if (!inputs.operation) {
                return {
                    success: false,
                    error: `Step ${stepNumber} FILE_OPERATION missing required 'operation' input`,
                    errorType: "missing_file_operation",
                    stepNumber
                };
            }

            const operation = inputs.operation.value;
            if (operation === 'write' || operation === 'append') {
                if (!inputs.content && !inputs.fileId) {
                    return {
                        success: false,
                        error: `Step ${stepNumber} FILE_OPERATION ${operation} requires 'content' input`,
                        errorType: "missing_file_content",
                        stepNumber
                    };
                }
            } else if (operation === 'read') {
                if (!inputs.fileId) {
                    return {
                        success: false,
                        error: `Step ${stepNumber} FILE_OPERATION read requires 'fileId' input`,
                        errorType: "missing_file_id",
                        stepNumber
                    };
                }
            }
        }

        if (step.dependencies && typeof step.dependencies === 'object') {
            for (const [outputName, depStep] of Object.entries(step.dependencies)) {
                let depStepNumber: number;
                try {
                    depStepNumber = typeof depStep === 'string' ? parseInt(depStep, 10) : Number(depStep);
                    if (isNaN(depStepNumber) || depStepNumber <= 0) {
                        throw new Error('Invalid dependency step number');
                    }
                } catch {
                    return {
                        success: false,
                        error: `Step ${stepNumber} dependency '${outputName}' has invalid step number: ${depStep}`,
                        errorType: "invalid_dependency_value",
                        stepNumber
                    };
                }

                if (depStepNumber >= stepNumber) {
                    return {
                        success: false,
                        error: `Step ${stepNumber} depends on future step ${depStepNumber}`,
                        errorType: "invalid_dependency",
                        stepNumber
                    };
                }
            }
        }
    }

    return { success: true };
};