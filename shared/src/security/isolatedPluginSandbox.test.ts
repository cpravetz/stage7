import { executePluginInSandbox } from './isolatedPluginSandbox';
import { PluginDefinition, PluginInput, PluginOutput, PluginParameterType } from '../types/Plugin';

describe('isolatedPluginSandbox', () => {
  // Mock plugin definition
  const mockPlugin: PluginDefinition = {
    id: 'test-plugin',
    verb: 'test',
    description: 'Test plugin',
    inputDefinitions: [],
    outputDefinitions: [],
    language: 'javascript',
    version: '1.0.0',
    security: {
      permissions: ['fs.read'],
      sandboxOptions: {
        allowEval: false,
        timeout: 1000,
        memory: 128,
        allowedModules: [],
        allowedAPIs: []
      },
      trust: {}
    }
  };

  // Mock environment
  const mockEnvironment = {
    env: process.env,
    credentials: []
  };

  // Mock inputs
  const mockInputs: PluginInput[] = [
    {
      inputName: 'test',
      inputValue: 'test value',
      args: {}
    }
  ];

  // Test simple plugin execution
  test('should execute a simple plugin', async () => {
    // Add code to the mock plugin
    const pluginWithCode = {
      ...mockPlugin,
      entryPoint: {
        main: 'index.js',
        files: {
          'index.js': `
            module.exports = {
              execute: function(inputs, environment) {
                return [
                  {
                    success: true,
                    name: 'result',
                    resultType: 'string',
                    result: 'Hello from sandbox!',
                    resultDescription: 'Test result'
                  }
                ];
              }
            };
          `
        },
        test: {}
      }
    };

    // Execute the plugin
    const result = await executePluginInSandbox(pluginWithCode, mockInputs, mockEnvironment);

    // Verify the result
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(true);
    expect(result[0].name).toBe('result');
    expect(result[0].resultType).toBe('string');
    expect(result[0].result).toBe('Hello from sandbox!');
  });

  // Test plugin with error
  test('should handle plugin execution errors', async () => {
    // Add code with error to the mock plugin
    const pluginWithError = {
      ...mockPlugin,
      entryPoint: {
        main: 'index.js',
        files: {
          'index.js': `
            module.exports = {
              execute: function(inputs, environment) {
                throw new Error('Test error');
              }
            };
          `
        },
        test: {}
      }
    };

    // Execute the plugin
    const result = await executePluginInSandbox(pluginWithError, mockInputs, mockEnvironment);

    // Verify the result
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(false);
    expect(result[0].name).toBe('error');
    expect(result[0].resultType).toBe(PluginParameterType.ERROR);
    expect(result[0].resultDescription).toContain('Error executing plugin in sandbox');
  });

  // Test plugin with invalid permissions
  test('should reject plugins with invalid permissions', async () => {
    // Add invalid permission to the mock plugin
    const pluginWithInvalidPermission = {
      ...mockPlugin,
      security: {
        ...mockPlugin.security,
        permissions: ['invalid.permission']
      }
    };

    // Execute the plugin
    const result = await executePluginInSandbox(pluginWithInvalidPermission, mockInputs, mockEnvironment);

    // Verify the result
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(false);
    expect(result[0].name).toBe('error');
    expect(result[0].resultType).toBe(PluginParameterType.ERROR);
    expect(result[0].resultDescription).toContain('Plugin has invalid permissions');
  });
});
