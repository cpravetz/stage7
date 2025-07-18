import { InputValue, PluginDefinition, MapSerializer } from '@cktmcs/shared';
import { PluginRegistry } from './pluginRegistry';


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
            // Handle object validation - accept actual objects or valid JSON strings
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                return true;
            }
            // If it's a string, try to parse it as JSON
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


export const validateAndStandardizeInputs = async (plugin: PluginDefinition, inputs: Map<string, InputValue>):
    Promise<{ success: boolean; inputs?: Map<string, InputValue>; error?: string }> => {
        console.log('validateAndStandardizeInputs: Called for plugin:', plugin.verb, 'version:', plugin.version);
        console.log('validateAndStandardizeInputs: Raw inputs received (serialized):', MapSerializer.transformForSerialization(inputs));
        const validInputs = new Map<string, InputValue>();
        try {
            // Ensure inputDefinitions exists and is iterable
            const inputDefinitions = plugin.inputDefinitions || [];
            if (!Array.isArray(inputDefinitions)) {
                console.error('validateAndStandardizeInputs: plugin.inputDefinitions is not an array:', typeof inputDefinitions, inputDefinitions);
                return { success: false, error: `Plugin ${plugin.verb} has invalid inputDefinitions: expected array, got ${typeof inputDefinitions}` };
            }

            for (const inputDef of inputDefinitions) {
                const inputName = inputDef.name;
                let input = inputs.get(inputName);

                if (!input) {
                    // Look for case-insensitive match
                    for (const [key, value] of inputs) {
                        if (key.toLowerCase() === inputName.toLowerCase()) {
                            input = value;
                            break;
                        }
                    }
                }

                // If input is missing, try to provide a default value
                if (!input) {
                    let defaultValue: any = undefined;

                    // First check if explicit defaultValue is defined
                    if (inputDef.defaultValue !== undefined) {
                        defaultValue = inputDef.defaultValue;
                        console.log(`validateAndStandardizeInputs: Using explicit defaultValue for '${inputName}' in plugin '${plugin.verb}'.`);
                    }
                    // For optional inputs without explicit defaults, provide reasonable type-based defaults
                    else if (!inputDef.required) {
                        switch (inputDef.type.toLowerCase()) {
                            case 'object':
                                defaultValue = {};
                                break;
                            case 'array':
                                defaultValue = [];
                                break;
                            case 'string':
                                defaultValue = '';
                                break;
                            case 'number':
                                defaultValue = 0;
                                break;
                            case 'boolean':
                                defaultValue = false;
                                break;
                            default:
                                defaultValue = null;
                        }
                        console.log(`validateAndStandardizeInputs: Using type-based default (${defaultValue}) for optional input '${inputName}' in plugin '${plugin.verb}'.`);
                    }

                    if (defaultValue !== undefined) {
                        input = {
                            inputName,
                            value: defaultValue,
                            valueType: inputDef.type,
                            args: {}
                        };
                    }
                }

                // Handle required inputs
                if (inputDef.required) {
                    let missingOrInvalid = false;
                    let reason = "";

                    if (!input) {
                        missingOrInvalid = true;
                        reason = `Missing required input \"${inputName}\" for plugin \"${plugin.verb}\" and no defaultValue provided.`;
                    } else if (input.value === null || input.value === undefined) {
                        missingOrInvalid = true;
                        reason = `Required input \"${inputName}\" for plugin \"${plugin.verb}\" must not be null or undefined.`;
                    } else if (inputDef.type === 'string' && String(input.value).trim() === '') {
                        missingOrInvalid = true;
                        reason = `Required string input \"${inputName}\" for plugin \"${plugin.verb}\" must not be empty or whitespace-only.`;
                    }

                    if (missingOrInvalid) {
                        console.error(`validateAndStandardizeInputs: Validation Error for plugin \"${plugin.verb}\", input \"${inputName}\": ${reason}`);
                        return {
                            success: false,
                            error: reason
                        };
                    }
                }

                // Validate input type if present
                if (input && inputDef.type) {
                    const isValid = await validateInputType(input.value, inputDef.type);
                    if (!isValid) {
                        return {
                            success: false,
                            error: `Invalid type for input \"${inputName}\". Expected ${inputDef.type}`
                        };
                    }

                    // Parse JSON strings for object types
                    if (inputDef.type.toLowerCase() === 'object' && typeof input.value === 'string') {
                        try {
                            input.value = JSON.parse(input.value);
                        } catch (error) {
                            // This shouldn't happen since validation passed, but just in case
                            return {
                                success: false,
                                error: `Invalid JSON string for object input \"${inputName}\"`
                            };
                        }
                    }
                }

                if (input) {
                    validInputs.set(inputName, input);
                }
            }

            console.log(`validateAndStandardizeInputs: Successfully validated and standardized inputs for ${plugin.verb} (serialized):`, MapSerializer.transformForSerialization(validInputs));
            if (plugin.verb === 'SEARCH' && validInputs.has('searchTerm')) {
              const searchInput = validInputs.get('searchTerm');
              // Log the entire InputValues object for searchTerm
              console.log(`validateAndStandardizeInputs: For SEARCH, the full 'searchTerm' InputValues object is: ${JSON.stringify(searchInput)}`);
              if (searchInput) {
                // Log the inputValue and its type specifically
                console.log(`validateAndStandardizeInputs: For SEARCH, direct inputValue of 'searchTerm' is: "${searchInput.value}"`);
                console.log(`validateAndStandardizeInputs: For SEARCH, typeof searchTerm inputValue is: ${typeof searchInput.value}`);
              } else {
                console.log("validateAndStandardizeInputs: For SEARCH, validInputs.get('searchTerm') returned undefined/null even though validInputs.has('searchTerm') was true.");
              }
            }
            return { success: true, inputs: validInputs };
        } catch (error) {
            return {
                success: false,
                error: `Input validation error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

/**
 * Generic plan validation that can be used by any plugin
 * Validates plan structure, action verbs, and input references
 */
export const validatePlanStructure = async (planData: any[], pluginRegistry: PluginRegistry): Promise<{ success: boolean; error?: string; errorType?: string; stepNumber?: number }> => {
    if (!Array.isArray(planData) || planData.length === 0) {
        return {
            success: false,
            error: "Plan must be a non-empty array of steps",
            errorType: "plan_structure_error"
        };
    }

    // Get available plugins from registry
    const availablePlugins = new Set<string>();
    try {
        // Access the verbIndex to get all available verbs
        const verbIndex = (pluginRegistry as any).verbIndex;
        if (verbIndex && verbIndex instanceof Map) {
            for (const verb of verbIndex.keys()) {
                availablePlugins.add(verb);
            }
        }
    } catch (error) {
        console.warn('validatePlanStructure: Could not fetch plugins from registry:', error);
        // Continue validation without plugin verification if registry is unavailable
    }

    for (let i = 0; i < planData.length; i++) {
        const step = planData[i];
        const stepNumber = i + 1;

        // Check required fields
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

        // Validate actionVerb is a known plugin (if we have plugin data)
        const actionVerb = step.actionVerb;
        if (availablePlugins.size > 0 && !availablePlugins.has(actionVerb)) {
            return {
                success: false,
                error: `Step ${stepNumber} uses invalid actionVerb '${actionVerb}'. Available plugins: ${Array.from(availablePlugins).sort().join(', ')}`,
                errorType: "invalid_action_verb",
                stepNumber
            };
        }

        // Validate input references format
        if (step.inputReferences && typeof step.inputReferences === 'object') {
            for (const [inputName, inputRef] of Object.entries(step.inputReferences)) {
                if (inputRef && typeof inputRef === 'object' && 'value' in inputRef) {
                    const value = (inputRef as any).value;
                    // Check for malformed dictionary strings
                    if (typeof value === 'string' && value.startsWith("{'") && value.endsWith("'}")) {
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

        // Validate dependencies reference previous steps only
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
