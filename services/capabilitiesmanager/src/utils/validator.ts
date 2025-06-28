import { PluginInput, PluginDefinition, MapSerializer } from '@cktmcs/shared';


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
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        default:
            return true; // Allow unknown types to pass validation
    }
}


export const validateAndStandardizeInputs = async (plugin: PluginDefinition, inputs: Map<string, PluginInput>): 
    Promise<{ success: boolean; inputs?: Map<string, PluginInput>; error?: string }> => {
        console.log('validateAndStandardizeInputs: Called for plugin:', plugin.verb, 'version:', plugin.version);
        console.log('validateAndStandardizeInputs: Raw inputs received (serialized):', MapSerializer.transformForSerialization(inputs));
        const validInputs = new Map<string, PluginInput>();
        try {
            for (const inputDef of plugin.inputDefinitions) {
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

                // If input is missing and defaultValue is defined, use it
                if (!input && inputDef.defaultValue !== undefined) {
                    input = {
                        inputName,
                        inputValue: inputDef.defaultValue,
                        args: {}
                    };
                    console.log(`validateAndStandardizeInputs: Added missing input '${inputName}' with defaultValue for plugin '${plugin.verb}'.`);
                }

                // Handle required inputs
                if (inputDef.required) {
                    let missingOrInvalid = false;
                    let reason = "";

                    if (!input) {
                        missingOrInvalid = true;
                        reason = `Missing required input \"${inputName}\" for plugin \"${plugin.verb}\" and no defaultValue provided.`;
                    } else if (input.inputValue === null || input.inputValue === undefined) {
                        missingOrInvalid = true;
                        reason = `Required input \"${inputName}\" for plugin \"${plugin.verb}\" must not be null or undefined.`;
                    } else if (inputDef.type === 'string' && String(input.inputValue).trim() === '') {
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
                    const isValid = await validateInputType(input.inputValue, inputDef.type);
                    if (!isValid) {
                        return {
                            success: false,
                            error: `Invalid type for input \"${inputName}\". Expected ${inputDef.type}`
                        };
                    }
                }

                if (input) {
                    validInputs.set(inputName, input);
                }
            }

            console.log(`validateAndStandardizeInputs: Successfully validated and standardized inputs for ${plugin.verb} (serialized):`, MapSerializer.transformForSerialization(validInputs));
            if (plugin.verb === 'SEARCH' && validInputs.has('searchTerm')) {
              const searchInput = validInputs.get('searchTerm');
              // Log the entire PluginInput object for searchTerm
              console.log(`validateAndStandardizeInputs: For SEARCH, the full 'searchTerm' PluginInput object is: ${JSON.stringify(searchInput)}`);
              if (searchInput) {
                // Log the inputValue and its type specifically
                console.log(`validateAndStandardizeInputs: For SEARCH, direct inputValue of 'searchTerm' is: "${searchInput.inputValue}"`);
                console.log(`validateAndStandardizeInputs: For SEARCH, typeof searchTerm inputValue is: ${typeof searchInput.inputValue}`);
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
