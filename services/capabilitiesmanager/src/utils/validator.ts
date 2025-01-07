import { PluginInput, PluginDefinition } from '@cktmcs/shared';


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

                // Handle required inputs
                if (!input && inputDef.required) {
                    return {
                        success: false,
                        error: `Missing required input "${inputName}" for ${plugin.verb}`
                    };
                }

                // Validate input type if present
                if (input && inputDef.type) {
                    const isValid = await validateInputType(input.inputValue, inputDef.type);
                    if (!isValid) {
                        return {
                            success: false,
                            error: `Invalid type for input "${inputName}". Expected ${inputDef.type}`
                        };
                    }
                }

                if (input) {
                    validInputs.set(inputName, input);
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
