import { PluginDefinition, environmentType, PluginInput, PluginOutput, PluginParameterType } from '../types/Plugin';
import { verifyPluginSignature } from './pluginSigning';
import { validatePluginPermissions } from './pluginPermissions';

/**
 * Executes a plugin in a simple sandbox (not using isolated-vm for now)
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
      console.log('Plugin signature verification in sandbox:', isValid ? 'passed' : 'failed');
      // Enforce signature verification
      if (!isValid) {
        throw new Error('Plugin signature verification failed');
      }
    }

    // Check plugin permissions
    const permissionErrors = validatePluginPermissions(plugin);
    if (permissionErrors.length > 0) {
      throw new Error(`Plugin has invalid permissions: ${permissionErrors.join(', ')}`);
    }

    // Simple execution without isolated-vm
    try {
      // Get the plugin code
      const pluginCode = plugin.entryPoint?.files?.[plugin.entryPoint.main];
      if (!pluginCode) {
        throw new Error('Plugin code not found');
      }

      // Create a module from the plugin code
      const module = { exports: {} };
      const moduleFunction = new Function('module', 'exports', 'require', pluginCode);
      moduleFunction(module, module.exports, require);

      // Get the execute function from the module
      const moduleExports = module.exports as { execute?: Function };
      const executeFunction = moduleExports.execute;
      if (typeof executeFunction !== 'function') {
        throw new Error('Plugin does not export an execute function');
      }

      // Execute the plugin function with the inputs
      const input = inputs[0]; // Assuming the first input is the main input
      const result = await executeFunction(input);

      // Return the result as an array of outputs
      if (Array.isArray(result)) {
        return result;
      } else {
        return [result];
      }
    } catch (error) {
      console.error('Error executing plugin:', error);
      return [{
        success: false,
        name: 'error',
        resultType: PluginParameterType.ERROR,
        result: null,
        resultDescription: `Error executing plugin: ${error instanceof Error ? error.message : String(error)}`
      }];
    }
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


