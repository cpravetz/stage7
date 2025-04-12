import { PluginDefinition, environmentType, PluginInput, PluginOutput, PluginParameterType } from '../types/Plugin';
import { VM, VMScript } from 'vm2';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Options for the plugin sandbox
 */
export interface SandboxOptions {
  timeout: number;
  memory: number;
  allowEval: boolean;
  allowedModules: string[];
  allowedAPIs: string[];
}

/**
 * Default sandbox options
 */
export const DEFAULT_SANDBOX_OPTIONS: SandboxOptions = {
  timeout: 5000, // 5 seconds
  memory: 128 * 1024 * 1024, // 128MB
  allowEval: false,
  allowedModules: ['fs', 'path', 'http', 'https'],
  allowedAPIs: ['fetch', 'console']
};

/**
 * Execute a plugin in a sandbox environment
 * @param plugin Plugin definition
 * @param inputs Plugin inputs
 * @param environment Plugin environment
 * @returns Plugin outputs
 */
export async function executePluginInSandbox(
  plugin: PluginDefinition,
  inputs: Map<string, PluginInput>,
  environment: environmentType
): Promise<PluginOutput[]> {
  // Validate plugin security settings
  if (!plugin.security || !plugin.security.sandboxOptions) {
    throw new Error('Plugin security settings are missing');
  }

  // Merge plugin sandbox options with defaults
  const sandboxOptions: SandboxOptions = {
    ...DEFAULT_SANDBOX_OPTIONS,
    ...plugin.security.sandboxOptions
  };

  // Create a sandbox environment
  const sandbox = new VM({
    timeout: sandboxOptions.timeout,
    sandbox: {
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      process: {
        env: filterEnvironment(environment.env, plugin.security.permissions)
      },
      Buffer,
      inputs: Array.from(inputs.entries()),
      credentials: environment.credentials,
      require: createSafeRequire(sandboxOptions.allowedModules)
    },
    eval: sandboxOptions.allowEval,
    wasm: false
  });

  try {
    // Load the plugin code
    const pluginCode = await loadPluginCode(plugin);

    // Create a script from the plugin code
    const script = new VMScript(pluginCode, path.join(process.cwd(), 'sandbox.js'));

    // Execute the script in the sandbox
    const result = sandbox.run(script);

    // Call the execute function
    if (typeof result.execute !== 'function') {
      throw new Error('Plugin does not export an execute function');
    }

    // Execute the plugin
    return await result.execute(inputs, environment);
  } catch (error) {
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
 * Load the plugin code from the plugin definition
 * @param plugin Plugin definition
 * @returns Plugin code as a string
 */
async function loadPluginCode(plugin: PluginDefinition): Promise<string> {
  if (!plugin.entryPoint || !plugin.entryPoint.main) {
    throw new Error('Plugin entry point is missing');
  }

  // If the plugin has inline files, use them
  if (plugin.entryPoint.files && Object.keys(plugin.entryPoint.files).length > 0) {
    // Find the main file
    const mainFile = Object.entries(plugin.entryPoint.files).find(
      ([filename]) => filename === plugin.entryPoint!.main
    );

    if (mainFile) {
      return mainFile[1];
    }
  }

  // Otherwise, load the file from disk
  const pluginDir = path.join(process.cwd(), 'plugins', plugin.verb);
  const mainFilePath = path.join(pluginDir, plugin.entryPoint.main);

  try {
    return await fs.readFile(mainFilePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to load plugin code: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a safe require function that only allows specific modules
 * @param allowedModules List of allowed modules
 * @returns Safe require function
 */
function createSafeRequire(allowedModules: string[]): (moduleName: string) => any {
  return (moduleName: string) => {
    // Check if the module is allowed
    const baseModule = moduleName.split('/')[0];
    if (!allowedModules.includes(baseModule)) {
      throw new Error(`Module '${moduleName}' is not allowed`);
    }

    // Require the module
    return require(moduleName);
  };
}

/**
 * Filter environment variables based on permissions
 * @param env Environment variables
 * @param permissions Plugin permissions
 * @returns Filtered environment variables
 */
function filterEnvironment(env: NodeJS.ProcessEnv, permissions: string[]): NodeJS.ProcessEnv {
  // If the plugin has the 'env.read' permission, return all environment variables
  if (permissions.includes('env.read')) {
    return { ...env };
  }

  // Otherwise, return only safe environment variables
  const safeEnv: NodeJS.ProcessEnv = {};
  const safeKeys = [
    'NODE_ENV',
    'TZ',
    'LANG',
    'LC_ALL',
    'PATH',
    'TEMP',
    'TMP'
  ];

  for (const key of safeKeys) {
    if (env[key]) {
      safeEnv[key] = env[key];
    }
  }

  return safeEnv;
}
