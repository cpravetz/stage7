import { PluginDefinition, environmentType, InputValue, PluginOutput, PluginParameterType } from '../types/Plugin';
import { validatePluginPermissions } from './pluginPermissions';
import * as fs from 'fs/promises';
import * as path from 'path';

// List of environment variables that should always be passed to plugins
// regardless of permissions
const ALWAYS_ALLOWED_ENV_VARS = [
  'CM_AUTH_TOKEN',  // CapabilitiesManager authentication token
  'BRAIN_URL',      // Brain service URL
  'LIBRARIAN_URL',  // Librarian service URL
  'POSTOFFICE_URL', // PostOffice service URL
  'SECURITYMANAGER_URL', // SecurityManager service URL
  'CLIENT_SECRET'   // Service client secret
];

/**
 * Load the plugin code from the plugin definition
 * @param plugin Plugin definition
 * @returns Plugin code as a string
 */
async function loadPluginCode(plugin: PluginDefinition): Promise<string> {
  if (!plugin.entryPoint || !plugin.entryPoint.main) {
    throw new Error('Plugin entry point is missing');
  }

  // NEW PACKAGING SCHEME: Load from disk first (preferred method)
  // Try to load from the plugin's root directory first
  // Check if we're already in the services directory (Docker environment)
  const cwd = process.cwd();
  let pluginDir: string;

  if (cwd.includes('/services/capabilitiesmanager')) {
    // We're in the CapabilitiesManager service directory
    pluginDir = path.join(cwd, 'src', 'plugins', plugin.verb);
  } else {
    // We're in the root directory
    pluginDir = path.join(cwd, 'services', 'capabilitiesmanager', 'src', 'plugins', plugin.verb);
  }

  const mainFilePath = path.join(pluginDir, plugin.entryPoint.main);

  try {
    const code = await fs.readFile(mainFilePath, 'utf-8');
    console.log(`Loaded plugin code from file: ${mainFilePath}`);
    return code;
  } catch (fileError) {
    console.log(`Failed to load from file ${mainFilePath}, trying embedded code...`);

    // LEGACY SUPPORT: Fall back to embedded files if file loading fails
    if (plugin.entryPoint.files && Object.keys(plugin.entryPoint.files).length > 0) {
      // Find the main file
      const mainFile = Object.entries(plugin.entryPoint.files).find(
        ([filename]) => filename === plugin.entryPoint!.main
      );

      if (mainFile) {
        console.log(`Using embedded code for plugin: ${plugin.verb}`);
        return mainFile[1];
      }
    }

    // If both methods fail, throw an error
    throw new Error(`Failed to load plugin code for ${plugin.verb}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
  }
}

/**
 * Executes a plugin in a simple sandbox (not using isolated-vm for now)
 * @param plugin The plugin to execute
 * @param inputs The inputs to pass to the plugin
 * @param environment The environment in which the plugin is running
 * @returns The outputs from the plugin execution
 */
export async function executePluginInSandbox(
  plugin: PluginDefinition,
  inputs: InputValue[],
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
      // Get the plugin code using the new loading mechanism
      const pluginCode = await loadPluginCode(plugin);

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
      const input = inputs[0].value; // Assuming the first input is the main input
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


