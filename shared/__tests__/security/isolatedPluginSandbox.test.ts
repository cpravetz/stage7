import { executePluginInSandbox } from '../src/security/isolatedPluginSandbox';
import { PluginDefinition, environmentType, InputValue, PluginOutput, PluginParameterType } from '../src/types/Plugin';
import { validatePluginPermissions } from '../src/security/pluginPermissions';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies
jest.mock('../src/security/pluginPermissions');
jest.mock('fs/promises');
jest.mock('path');

// Cast mocked functions
const mockValidatePluginPermissions = validatePluginPermissions as jest.Mock;
const mockFsReadFile = fs.readFile as jest.Mock;
const mockPathJoin = path.join as jest.Mock;

describe('isolatedPluginSandbox', () => {
    let originalProcessCwd: () => string;
    let originalProcessEnv: NodeJS.ProcessEnv;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_PLUGIN_ID = 'test-plugin';
    const MOCK_PLUGIN_VERB = 'TEST_VERB';
    const MOCK_PLUGIN_VERSION = '1.0.0';
    const MOCK_TRACE_ID = 'test-trace-id';

    const mockPluginDefinition: PluginDefinition = {
        id: MOCK_PLUGIN_ID,
        verb: MOCK_PLUGIN_VERB,
        language: 'javascript',
        entryPoint: { main: 'index.js' },
        inputDefinitions: [],
        outputDefinitions: [],
        repository: { type: 'local' }
    };

    const mockInputs: InputValue[] = [
        { inputName: 'data', value: 'input-data', valueType: PluginParameterType.STRING, args: {} }
    ];

    const mockEnvironment: environmentType = {
        env: {
            CM_AUTH_TOKEN: 'mock-auth-token',
            BRAIN_URL: 'http://mock-brain',
            CUSTOM_ENV_VAR: 'custom-value',
        },
        credentials: [],
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Store original process.cwd and process.env
        originalProcessCwd = process.cwd;
        originalProcessEnv = process.env;

        // Mock process.cwd and process.env
        process.cwd = jest.fn(() => '/mock/cwd');
        process.env = { ...originalProcessEnv }; // Create a writable copy

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Default mocks for fs and path
        mockFsReadFile.mockResolvedValue('module.exports.execute = (input) => [{ success: true, result: input + "-processed" }];');
        mockPathJoin.mockImplementation((...args) => args.join('/'));
        mockValidatePluginPermissions.mockReturnValue([]); // No permission errors by default
    });

    afterEach(() => {
        // Restore original process.cwd and process.env
        process.cwd = originalProcessCwd;
        process.env = originalProcessEnv;
        jest.restoreAllMocks();
    });

    describe('executePluginInSandbox', () => {
        it('should execute a plugin successfully from file', async () => {
            const result = await executePluginInSandbox(mockPluginDefinition, mockInputs, mockEnvironment);

            expect(mockValidatePluginPermissions).toHaveBeenCalledWith(mockPluginDefinition);
            expect(mockFsReadFile).toHaveBeenCalledWith('/mock/cwd/services/capabilitiesmanager/src/plugins/TEST_VERB/index.js', 'utf-8');
            expect(process.env.CM_AUTH_TOKEN).toBe('mock-auth-token');
            expect(process.env.BRAIN_URL).toBe('http://mock-brain');
            expect(process.env.CUSTOM_ENV_VAR).toBeUndefined(); // Should not be added as it's not ALWAYS_ALLOWED
            expect(result).toEqual([
                { success: true, result: 'input-data-processed' }
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Loaded plugin code from file'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added CM_AUTH_TOKEN to global process.env'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added BRAIN_URL to global process.env'));
        });

        it('should execute a plugin successfully from embedded files if file read fails', async () => {
            mockFsReadFile.mockRejectedValueOnce(new Error('File not found')); // Simulate file read failure
            const pluginWithEmbeddedCode = {
                ...mockPluginDefinition,
                entryPoint: {
                    main: 'embedded.js',
                    files: { 'embedded.js': 'module.exports.execute = (input) => [{ success: true, result: input + "-embedded" }];' }
                }
            };

            const result = await executePluginInSandbox(pluginWithEmbeddedCode, mockInputs, mockEnvironment);

            expect(mockFsReadFile).toHaveBeenCalledTimes(1); // Only one attempt to read file
            expect(result).toEqual([
                { success: true, result: 'input-data-embedded' }
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load from file'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Using embedded code for plugin'));
        });

        it('should return error if plugin entry point is missing', async () => {
            const pluginWithoutEntryPoint = { ...mockPluginDefinition, entryPoint: undefined };
            const result = await executePluginInSandbox(pluginWithoutEntryPoint, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin entry point is missing');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin'), expect.any(Error));
        });

        it('should return error if plugin does not export execute function', async () => {
            mockFsReadFile.mockResolvedValueOnce('module.exports.someOtherFunction = () => {};');
            const result = await executePluginInSandbox(mockPluginDefinition, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin does not export an execute function');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin'), expect.any(Error));
        });

        it('should return error if plugin execution throws an error', async () => {
            mockFsReadFile.mockResolvedValueOnce('module.exports.execute = () => { throw new Error("Plugin runtime error"); };');
            const result = await executePluginInSandbox(mockPluginDefinition, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Error executing plugin: Plugin runtime error');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin'), expect.any(Error));
        });

        it('should return error if plugin has invalid permissions', async () => {
            mockValidatePluginPermissions.mockReturnValueOnce(['permission1', 'permission2']);
            const result = await executePluginInSandbox(mockPluginDefinition, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin has invalid permissions: permission1, permission2');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin in sandbox'), expect.any(Error));
        });

        it('should handle plugin returning non-array result', async () => {
            mockFsReadFile.mockResolvedValueOnce('module.exports.execute = (input) => ({ success: true, result: input });');
            const result = await executePluginInSandbox(mockPluginDefinition, mockInputs, mockEnvironment);
            expect(result).toEqual([
                { success: true, result: 'input-data' }
            ]);
        });

        it('should log authentication-related environment variables', async () => {
            await executePluginInSandbox(mockPluginDefinition, mockInputs, mockEnvironment);
            expect(consoleLogSpy).toHaveBeenCalledWith(
                'Authentication-related environment variables available to plugin:',
                expect.arrayContaining([
                    'CM_AUTH_TOKEN: present',
                    'BRAIN_URL: present',
                ])
            );
        });

        it('should warn if no authentication-related environment variables are found', async () => {
            const envWithoutAuth: environmentType = { env: {}, credentials: [] };
            await executePluginInSandbox(mockPluginDefinition, mockInputs, envWithoutAuth);
            expect(consoleWarnSpy).toHaveBeenCalledWith('No authentication-related environment variables found for plugin execution');
        });
    });
});
