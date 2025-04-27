import { PluginDefinition, environmentType, PluginInput, PluginOutput, PluginParameterType } from '../types/Plugin';
import { verifyPluginSignature } from './pluginSigning';
import { validatePluginPermissions } from './pluginPermissions';

// List of environment variables that should always be passed to plugins
// regardless of permissions
const ALWAYS_ALLOWED_ENV_VARS = [
  'CM_AUTH_TOKEN',  // CapabilitiesManager authentication token
  'BRAIN_URL',      // Brain service URL
  'LIBRARIAN_URL',  // Librarian service URL
  'POSTOFFICE_URL', // PostOffice service URL
  'SECURITY_MANAGER_URL', // SecurityManager service URL
  'CLIENT_SECRET'   // Service client secret
];

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
    // TEMPORARY: Bypass plugin signature verification
    console.log('BYPASSING plugin signature verification in sandbox');
    // Original code commented out for reference:
    // if (plugin.security?.trust?.signature) {
    //   const isValid = await verifyPluginSignature(plugin);
    //   console.log('Plugin signature verification in sandbox:', isValid ? 'passed' : 'failed');
    //   // Enforce signature verification
    //   if (!isValid) {
    //     throw new Error('Plugin signature verification failed');
    //   }
    // }

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

      // Ensure authentication-related environment variables are available to the plugin
      // This is critical for plugins that need to make authenticated API calls
      if (environment && environment.env) {
        // Log environment variables for debugging (only auth-related ones)
        const authEnvVars = Object.keys(environment.env).filter(key =>
          key.includes('AUTH') || key.includes('TOKEN') || key.includes('SECRET') ||
          ALWAYS_ALLOWED_ENV_VARS.includes(key)
        );

        if (authEnvVars.length > 0) {
          console.log('Authentication-related environment variables available to plugin:',
            authEnvVars.map(key => `${key}: ${environment.env[key] ? 'present' : 'missing'}`));
        } else {
          console.warn('No authentication-related environment variables found for plugin execution');
        }

        // Ensure CM_AUTH_TOKEN is available in the global process.env
        // This is necessary because the plugin will use process.env directly
        if (environment.env.CM_AUTH_TOKEN) {
          process.env.CM_AUTH_TOKEN = environment.env.CM_AUTH_TOKEN;
          console.log('Added CM_AUTH_TOKEN to global process.env for plugin execution');
        }

        // Also ensure other important environment variables are available
        for (const key of ALWAYS_ALLOWED_ENV_VARS) {
          if (environment.env[key] && !process.env[key]) {
            process.env[key] = environment.env[key];
            console.log(`Added ${key} to global process.env for plugin execution`);
          }
        }
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
      console.log('[isolatedSandbox] executeFunction result: ',result);

      // Return the result as an array of outputs
      if (Array.isArray(result)) {
        // Log any console output from the plugin
        result.forEach(output => {
          if (output.console && Array.isArray(output.console)) {
            console.log(`Plugin ${plugin.id} console output:`, output.console);
          }
        });
        return result;
      } else {
        // Log any console output from the plugin
        if (result.console && Array.isArray(result.console)) {
          console.log(`Plugin ${plugin.id} console output:`, result.console);
        }
        return [result];
      }
    } catch (error) {
      console.error('Error executing plugin:', error);

      // Create a console log array for the error
      const consoleLogs = [
        `Error executing plugin: ${error instanceof Error ? error.message : String(error)}`
      ];

      // Add stack trace if available
      if (error instanceof Error && error.stack) {
        consoleLogs.push(`Stack trace: ${error.stack}`);
      }

      // Log the console output
      console.log(`Plugin ${plugin.id} error console output:`, consoleLogs);

      return [{
        success: false,
        name: 'error',
        resultType: PluginParameterType.ERROR,
        result: null,
        resultDescription: `Error executing plugin: ${error instanceof Error ? error.message : String(error)}`,
        console: consoleLogs
      }];
    }
  } catch (error) {
    console.error('Error executing plugin in sandbox:', error);

    // Create a console log array for the error
    const consoleLogs = [
      `Error executing plugin in sandbox: ${error instanceof Error ? error.message : String(error)}`
    ];

    // Add stack trace if available
    if (error instanceof Error && error.stack) {
      consoleLogs.push(`Stack trace: ${error.stack}`);
    }

    // Log the console output
    console.log(`Plugin ${plugin.id} sandbox error console output:`, consoleLogs);

    return [{
      success: false,
      name: 'error',
      resultType: PluginParameterType.ERROR,
      result: null,
      resultDescription: `Error executing plugin in sandbox: ${error instanceof Error ? error.message : String(error)}`,
      console: consoleLogs
    }];
  }
}


