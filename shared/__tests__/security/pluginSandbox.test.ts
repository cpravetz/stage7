import { executePluginInSandbox, DEFAULT_SANDBOX_OPTIONS } from '../src/security/pluginSandbox';
import { PluginManifest, InputValue, environmentType, PluginOutput, PluginParameterType } from '../src/types/Plugin';
import { VM, VMScript } from 'vm2';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies
jest.mock('vm2');
jest.mock('fs/promises');
jest.mock('path');

// Cast mocked classes/functions
const MockedVM = VM as jest.MockedClass<typeof VM>;
const MockedVMScript = VMScript as jest.MockedClass<typeof VMScript>;
const mockFsReadFile = fs.readFile as jest.Mock;
const mockPathJoin = path.join as jest.Mock;

describe('pluginSandbox', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let originalProcessCwd: () => string;
    let originalProcessEnv: NodeJS.ProcessEnv;

    const MOCK_PLUGIN_VERB = 'TEST_VERB';
    const MOCK_PLUGIN_ID = 'test-plugin';

    const mockPluginManifest: PluginManifest = {
        id: MOCK_PLUGIN_ID,
        verb: MOCK_PLUGIN_VERB,
        language: 'javascript',
        entryPoint: { main: 'index.js' },
        security: { sandboxOptions: { timeout: 10000, allowedModules: ['axios'] }, permissions: [] },
        repository: { type: 'local' }
    };

    const mockInputs: Map<string, InputValue> = new Map([
        ['data', { inputName: 'data', value: 'input-data', valueType: PluginParameterType.STRING, args: {} }]
    ]);

    const mockEnvironment: environmentType = {
        env: {
            NODE_ENV: 'development',
            CM_AUTH_TOKEN: 'mock-auth-token',
            CUSTOM_VAR: 'custom-value',
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
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock VM and VMScript
        MockedVM.mockImplementation(() => ({
            run: jest.fn().mockReturnValue({ execute: jest.fn().mockResolvedValue([{ success: true, result: 'plugin-output' }]) }),
        } as any));
        MockedVMScript.mockImplementation(() => ({} as any));

        // Mock fs and path
        mockFsReadFile.mockResolvedValue('// plugin code');
        mockPathJoin.mockImplementation((...args) => args.join('/'));
    });

    afterEach(() => {
        // Restore original process.cwd and process.env
        process.cwd = originalProcessCwd;
        process.env = originalProcessEnv;
        jest.restoreAllMocks();
    });

    describe('executePluginInSandbox', () => {
        it('should execute a plugin in the sandbox successfully', async () => {
            const result = await executePluginInSandbox(mockPluginManifest, mockInputs, mockEnvironment);

            expect(mockFsReadFile).toHaveBeenCalledWith('/mock/cwd/services/capabilitiesmanager/src/plugins/TEST_VERB/index.js', 'utf-8');
            expect(MockedVMScript).toHaveBeenCalledWith('// plugin code', '/mock/cwd/sandbox.js');
            expect(MockedVM).toHaveBeenCalledTimes(1);
            const vmInstance = MockedVM.mock.results[0].value;
            expect(vmInstance.run).toHaveBeenCalledTimes(1);
            expect(vmInstance.run().execute).toHaveBeenCalledWith(mockInputs, mockEnvironment);
            expect(result).toEqual([{ success: true, result: 'plugin-output' }]);
        });

        it('should merge sandbox options with defaults', async () => {
            await executePluginInSandbox(mockPluginManifest, mockInputs, mockEnvironment);

            expect(MockedVM).toHaveBeenCalledWith(expect.objectContaining({
                timeout: 10000, // From plugin manifest
                eval: DEFAULT_SANDBOX_OPTIONS.allowEval, // From default
                sandbox: expect.objectContaining({
                    allowedModules: ['axios'], // From plugin manifest
                })
            }));
        });

        it('should filter environment variables based on permissions', async () => {
            const pluginWithEnvRead: PluginManifest = {
                ...mockPluginManifest,
                security: { ...mockPluginManifest.security, permissions: ['env.read'] }
            };

            await executePluginInSandbox(pluginWithEnvRead, mockInputs, mockEnvironment);

            const vmOptions = MockedVM.mock.calls[0][0];
            const sandboxEnv = vmOptions.sandbox.process.env;
            expect(sandboxEnv.CM_AUTH_TOKEN).toBe('mock-auth-token');
            expect(sandboxEnv.CUSTOM_VAR).toBe('custom-value'); // All env vars passed with env.read
        });

        it('should only pass safe environment variables if env.read permission is missing', async () => {
            const pluginWithoutEnvRead: PluginManifest = {
                ...mockPluginManifest,
                security: { ...mockPluginManifest.security, permissions: [] }
            };

            await executePluginInSandbox(pluginWithoutEnvRead, mockInputs, mockEnvironment);

            const vmOptions = MockedVM.mock.calls[0][0];
            const sandboxEnv = vmOptions.sandbox.process.env;
            expect(sandboxEnv.NODE_ENV).toBe('development'); // Safe env var
            expect(sandboxEnv.CM_AUTH_TOKEN).toBeUndefined(); // Not safe, not passed
            expect(sandboxEnv.CUSTOM_VAR).toBeUndefined(); // Not safe, not passed
        });

        it('should return error if plugin security settings are missing', async () => {
            const pluginWithoutSecurity: PluginManifest = { ...mockPluginManifest, security: undefined };
            const result = await executePluginInSandbox(pluginWithoutSecurity, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin security settings are missing');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin in sandbox'), expect.any(Error));
        });

        it('should return error if plugin entry point is missing', async () => {
            const pluginWithoutEntryPoint = { ...mockPluginManifest, entryPoint: undefined };
            const result = await executePluginInSandbox(pluginWithoutEntryPoint, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin entry point is missing');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin in sandbox'), expect.any(Error));
        });

        it('should return error if plugin does not export an execute function', async () => {
            MockedVM.mockImplementationOnce(() => ({
                run: jest.fn().mockReturnValue({ someOtherFunction: jest.fn() }),
            } as any));

            const result = await executePluginInSandbox(mockPluginManifest, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Plugin does not export an execute function');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin in sandbox'), expect.any(Error));
        });

        it('should return error if plugin execution throws an error', async () => {
            MockedVM.mockImplementationOnce(() => ({
                run: jest.fn().mockReturnValue({ execute: jest.fn().mockRejectedValueOnce(new Error('Plugin runtime error')) }),
            } as any));

            const result = await executePluginInSandbox(mockPluginManifest, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Error executing plugin in sandbox: Plugin runtime error');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin in sandbox'), expect.any(Error));
        });

        it('should return error if loading plugin code fails', async () => {
            mockFsReadFile.mockRejectedValueOnce(new Error('File not found'));
            const pluginWithNoEmbeddedCode = { ...mockPluginManifest, entryPoint: { main: 'nonexistent.js', files: {} } };

            const result = await executePluginInSandbox(pluginWithNoEmbeddedCode, mockInputs, mockEnvironment);

            expect(result[0].success).toBe(false);
            expect(result[0].resultDescription).toContain('Failed to load plugin code');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing plugin in sandbox'), expect.any(Error));
        });

        it('should create safe require function that allows only specified modules', async () => {
            const pluginWithAllowedModules: PluginManifest = {
                ...mockPluginManifest,
                security: { sandboxOptions: { allowedModules: ['fs'] }, permissions: [] }
            };
            MockedVM.mockImplementationOnce((options) => {
                const safeRequire = options.sandbox.require;
                expect(() => safeRequire('fs')).not.toThrow();
                expect(() => safeRequire('path')).toThrow('Module 'path' is not allowed');
                return {
                    run: jest.fn().mockReturnValue({ execute: jest.fn().mockResolvedValue([]) }),
                } as any;
            });

            await executePluginInSandbox(pluginWithAllowedModules, mockInputs, mockEnvironment);
        });
    });
});
