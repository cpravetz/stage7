import * as ivm from 'isolated-vm';
import { PluginDefinition, environmentType, PluginInput, PluginOutput, PluginParameterType } from '../types/Plugin';
import { verifyPluginSignature } from './pluginSigning';
import { validatePluginPermissions } from './pluginPermissions';

/**
 * Executes a plugin in a secure sandbox using isolated-vm
 * @param plugin The plugin to execute
 * @param inputs The inputs to pass to the plugin
 * @param environment The environment in which the plugin is running
 * @returns The outputs from the plugin execution
 */
export async function executePluginInSandbox(
  plugin: PluginDefinition,
  inputs: PluginInput[],
  environment: environmentType
): Promise<PluginOutput[]> {
  try {
    // Verify plugin signature if it has one
    if (plugin.security?.trust?.signature) {
      const isValid = await verifyPluginSignature(plugin);
      if (!isValid) {
        throw new Error('Plugin signature verification failed');
      }
    }

    // Check plugin permissions
    const permissionErrors = validatePluginPermissions(plugin);
    if (permissionErrors.length > 0) {
      throw new Error(`Plugin has invalid permissions: ${permissionErrors.join(', ')}`);
    }

    // Create a new isolate with memory limits
    const isolate = new ivm.Isolate({ memoryLimit: 128 });

    // Create a new context within the isolate
    const context = await isolate.createContext();

    // Set up the plugin environment using context.eval
    // Pass the inputs directly to the script
    const inputsJson = JSON.stringify(inputs);
    await context.eval(`global.inputs = ${inputsJson}`);

    // Set up console logging
    const pluginId = plugin.id || 'unknown';
    await context.eval(`
      global.console = {
        log: function(...args) {
          // Use a special function to log to the host console
          // In a real implementation, you would use a callback or transfer mechanism
          // For now, we'll just stringify the arguments
          console.log('[Plugin ${pluginId}]', ...args);
        },
        error: function(...args) {
          console.error('[Plugin ${pluginId}]', ...args);
        },
        warn: function(...args) {
          console.warn('[Plugin ${pluginId}]', ...args);
        },
        info: function(...args) {
          console.info('[Plugin ${pluginId}]', ...args);
        }
      };
    `);

    // Add safe APIs
    await context.eval(`
      global.setTimeout = function(callback, ms) {
        // In a real implementation, you would use a transfer mechanism
        // For now, we'll just create a simple setTimeout wrapper
        return setTimeout(callback, ms);
      };
    `);

    // Prepare the plugin code
    const pluginCode = `
      const plugin = ${JSON.stringify(plugin)};
      const environment = ${JSON.stringify(environment)};

      // Execute the plugin function
      function executePlugin() {
        try {
          // Create the plugin function from the code
          const pluginFunction = new Function('inputs', 'environment', plugin.code);

          // Execute the plugin function with the inputs and environment
          const result = pluginFunction(inputs, environment);

          // Return the result
          return result;
        } catch (error) {
          return [{
            success: false,
            name: 'error',
            resultType: 'ERROR',
            result: null,
            resultDescription: 'Error executing plugin: ' + (error.message || String(error))
          }];
        }
      }

      // Return the result of the plugin execution
      executePlugin();
    `;

    // Compile the script
    const script = await isolate.compileScript(pluginCode);

    // Run the script in the context
    const result = await script.run(context);

    // Get the result from the isolate
    const outputs = await result.copy();

    // Clean up resources
    context.release();
    isolate.dispose();

    // Validate and return the outputs
    return validateOutputs(outputs);
  } catch (error) {
    console.error('Error executing plugin in sandbox:', error);

    return [{
      success: false,
      name: 'error',
      resultType: PluginParameterType.ERROR,
      result: null,
      resultDescription: `Error executing plugin in sandbox: ${error instanceof Error ? error.message : String(error)}`
    }];
  }
}

/**
 * Validates the outputs from a plugin execution
 * @param outputs The outputs to validate
 * @returns The validated outputs
 */
function validateOutputs(outputs: any): PluginOutput[] {
  if (!Array.isArray(outputs)) {
    return [{
      success: false,
      name: 'error',
      resultType: PluginParameterType.ERROR,
      result: null,
      resultDescription: 'Plugin did not return an array of outputs'
    }];
  }

  return outputs.map(output => {
    // Ensure the output has the required properties
    if (!output || typeof output !== 'object') {
      return {
        success: false,
        name: 'error',
        resultType: PluginParameterType.ERROR,
        result: null,
        resultDescription: 'Invalid output format'
      };
    }

    // Ensure the output has a valid result type
    if (!Object.values(PluginParameterType).includes(output.resultType)) {
      output.resultType = PluginParameterType.ERROR;
    }

    return {
      success: output.success === true,
      name: output.name || 'unnamed',
      resultType: output.resultType || PluginParameterType.ERROR,
      result: output.result,
      resultDescription: output.resultDescription || ''
    };
  });
}
