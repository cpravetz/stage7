import { PluginExecutor } from '../src/utils/pluginExecutor';
import { ConfigManager } from '../src/utils/configManager';
import { ContainerManager } from '../src/utils/containerManager';
import { ServiceTokenManager, PluginDefinition, InputValue, PluginOutput, PluginParameterType, OpenAPITool, MCPTool, Step } from '@cktmcs/shared';
import { executePluginInSandbox, validatePluginPermissions, hasDangerousPermissions } from '@cktmcs/shared';
import { generateStructuredError, GlobalErrorCodes } from '../src/utils/errorReporter';
import { ensurePythonDependencies, validatePythonOutput } from '../src/utils/pythonPluginHelper';
import { validateAndStandardizeInputs } from '../src/utils/validator';
import { spawn } from 'child_process';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Mock external dependencies
jest.mock('../src/utils/configManager');
jest.mock('../src/utils/containerManager');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'), // Import and retain default behavior
    ServiceTokenManager: jest.fn(() => ({
        getToken: jest.fn().mockResolvedValue('mock-token'),
    })),
    executePluginInSandbox: jest.fn(),
    validatePluginPermissions: jest.fn().mockReturnValue([]),
    hasDangerousPermissions: jest.fn().mockReturnValue(false),
}));
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)), // Simplify error generation for tests
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
}));
jest.mock('../src/utils/pythonPluginHelper');
jest.mock('../src/utils/validator');
jest.mock('child_process', () => ({
    spawn: jest.fn(),
}));
jest.mock('axios');
jest.mock('fs');

// Mock instances
const mockConfigManager = {
    getPluginConfig: jest.fn(),
    recordPluginUsage: jest.fn(),
    initialize: jest.fn(),
} as unknown as ConfigManager;
const mockContainerManager = new ContainerManager();
const mockServiceTokenManager = new ServiceTokenManager('url', 'client', 'secret');

// Cast mocked functions
const mockExecutePluginInSandbox = executePluginInSandbox as jest.Mock;
const mockValidatePluginPermissions = validatePluginPermissions as jest.Mock;
const mockHasDangerousPermissions = hasDangerousPermissions as jest.Mock;
const mockGenerateStructuredError = generateStructuredError as jest.Mock;
const mockEnsurePythonDependencies = ensurePythonDependencies as jest.Mock;
const mockValidatePythonOutput = validatePythonOutput as jest.Mock;
const mockValidateAndStandardizeInputs = validateAndStandardizeInputs as jest.Mock;
const mockSpawn = spawn as jest.Mock;
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockFsExistsSync = fs.existsSync as jest.Mock;


describe('PluginExecutor', () => {
    let pluginExecutor: PluginExecutor;
    const MOCK_LIBRARIAN_URL = 'http://mock-librarian';
    const MOCK_SECURITY_MANAGER_URL = 'http://mock-security';
    const MOCK_TRACE_ID = 'test-trace-id';

    beforeEach(() => {
        jest.clearAllMocks();
        pluginExecutor = new PluginExecutor(mockConfigManager, mockContainerManager, MOCK_LIBRARIAN_URL, MOCK_SECURITY_MANAGER_URL);

        // Default mock implementations for common dependencies
        (mockConfigManager.getPluginConfig as jest.Mock).mockResolvedValue([]);
        (mockConfigManager.recordPluginUsage as jest.Mock).mockResolvedValue(undefined);
        (mockServiceTokenManager.getToken as jest.Mock).mockResolvedValue('mock-token');
        mockValidateAndStandardizeInputs.mockResolvedValue({ success: true, inputs: new Map() });
        mockExecutePluginInSandbox.mockResolvedValue([]);
        mockEnsurePythonDependencies.mockResolvedValue(undefined);
        mockValidatePythonOutput.mockReturnValue([]);
        mockAxios.mockResolvedValue({ data: {}, status: 200 });

        // Mock process.env for consistent testing
        process.env.MISSION_ID = 'mock-mission-id';
        process.env.POSTOFFICE_URL = 'http://mock-postoffice';
        process.env.BRAIN_URL = 'http://mock-brain';
        process.env.LIBRARIAN_URL = 'http://mock-librarian-env';
        process.env.GOOGLE_SEARCH_API_KEY = 'mock-google-api-key';
        process.env.GOOGLE_CSE_ID = 'mock-google-cse-id';
        process.env.LANGSEARCH_API_KEY = 'mock-langsearch-api-key';
    });

    describe('execute', () => {
        const mockPluginDefinition: PluginDefinition = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            description: 'A test plugin',
            language: 'javascript',
            version: '1.0.0',
            entryPoint: { main: 'index.js' },
            inputDefinitions: [],
            outputDefinitions: [],
            security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 1000, memory: 128, allowedModules: [], allowedAPIs: [] }, trust: {} }
        };
        const mockInputs = new Map<string, InputValue>();
        const mockRootPath = '/mock/plugin/path';

        it('should execute a JavaScript plugin successfully', async () => {
            mockExecutePluginInSandbox.mockResolvedValueOnce([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js-result', resultDescription: 'a js result' }]);

            const result = await pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockValidateAndStandardizeInputs).toHaveBeenCalledWith(mockPluginDefinition, mockInputs);
            expect(mockValidatePluginPermissions).toHaveBeenCalledWith(mockPluginDefinition);
            expect(mockConfigManager.getPluginConfig).toHaveBeenCalledWith(mockPluginDefinition.id);
            expect(mockConfigManager.recordPluginUsage).toHaveBeenCalledWith(mockPluginDefinition.id);
            expect(mockExecutePluginInSandbox).toHaveBeenCalledWith(
                mockPluginDefinition,
                expect.any(Array),
                expect.objectContaining({ env: expect.any(Object), credentials: expect.any(Array) })
            );
            expect(result).toEqual([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js-result', resultDescription: 'a js result' }]);
        });

        it('should execute a Python plugin successfully', async () => {
            const pythonPluginDef = { ...mockPluginDefinition, language: 'python' };
            const pythonOutput: PluginOutput[] = [{ success: true, name: 'py_out', resultType: PluginParameterType.STRING, result: 'py-result', resultDescription: 'a python result' }];
            mockValidatePythonOutput.mockReturnValueOnce(pythonOutput);
            mockFsExistsSync.mockReturnValue(true); // Mock venv python exists

            // Mock the spawn process for Python
            const mockPythonProcess = { 
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn(),
                stdin: { write: jest.fn(), end: jest.fn() }
            };
            mockSpawn.mockReturnValue(mockPythonProcess);

            // Simulate process close with success
            mockPythonProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(0); // Exit code 0 for success
                }
            });

            const result = await pluginExecutor.execute(pythonPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockEnsurePythonDependencies).toHaveBeenCalledWith(mockRootPath, MOCK_TRACE_ID);
            expect(mockSpawn).toHaveBeenCalledWith(
                expect.stringContaining('python'),
                [path.join(mockRootPath, pythonPluginDef.entryPoint!.main), mockRootPath],
                expect.objectContaining({ cwd: mockRootPath, env: expect.any(Object) })
            );
            expect(result).toEqual(pythonOutput);
        });

        it('should execute a Container plugin successfully', async () => {
            const containerPluginDef: PluginDefinition = {
                ...mockPluginDefinition,
                language: 'container',
                container: { 
                    dockerfile: 'Dockerfile', 
                    buildContext: '.', 
                    image: 'test-image', 
                    ports: [], 
                    environment: {}, 
                    resources: { memory: '128m', cpu: '0.5' }, 
                    healthCheck: { path: '/', interval: '10s', timeout: '5s', retries: 3 } 
                },
                api: { endpoint: '/', method: 'POST', timeout: 10000 },
                entryPoint: { main: 'app.py'},
                inputDefinitions: [],
                outputDefinitions: [],
                security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 1000, memory: 128, allowedModules: [], allowedAPIs: [] }, trust: {} } 
            };
            const containerOutput: PluginOutput[] = [{ success: true, name: 'container_out', resultType: PluginParameterType.STRING, result: 'container-result', resultDescription: 'a container result' }];

            (mockContainerManager.buildPluginImage as jest.Mock).mockResolvedValue(undefined);
            (mockContainerManager.startPluginContainer as jest.Mock).mockResolvedValue({ id: 'mock-container-id' });
            (mockContainerManager.executePluginInContainer as jest.Mock).mockResolvedValue({ success: true, outputs: { container_out: 'container-result' } });
            (mockContainerManager.stopPluginContainer as jest.Mock).mockResolvedValue(undefined);

            const result = await pluginExecutor.execute(containerPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockContainerManager.buildPluginImage).toHaveBeenCalledWith(expect.any(Object), mockRootPath, MOCK_TRACE_ID);
            expect(mockContainerManager.startPluginContainer).toHaveBeenCalledWith(expect.any(Object), MOCK_TRACE_ID);
            expect(mockContainerManager.executePluginInContainer).toHaveBeenCalledWith(
                { id: 'mock-container-id' },
                expect.any(Object),
                expect.objectContaining({ inputs: {}, context: { trace_id: MOCK_TRACE_ID, plugin_id: containerPluginDef.id, version: containerPluginDef.version } }),
                MOCK_TRACE_ID
            );
            expect(mockContainerManager.stopPluginContainer).toHaveBeenCalledWith('mock-container-id', MOCK_TRACE_ID);
            expect(result).toEqual(containerOutput);
        });

        it('should throw error for unsupported language', async () => {
            const unsupportedPluginDef = { ...mockPluginDefinition, language: 'unsupported' as any };

            await expect(pluginExecutor.execute(unsupportedPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Unsupported plugin language: unsupported');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE,
                message: 'Unsupported plugin language: unsupported',
            }));
        });

        it('should throw structured error on input validation failure', async () => {
            mockValidateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: 'Invalid input', validationType: 'schema' });

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Invalid input (Type: schema)');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INVALID_INPUT,
                message: 'Invalid input (Type: schema)',
            }));
        });

        it('should throw structured error on permission validation failure', async () => {
            mockValidatePluginPermissions.mockReturnValueOnce(['permission1', 'permission2']);

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Plugin permission validation failed: permission1, permission2');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                message: 'Plugin permission validation failed: permission1, permission2',
            }));
        });

        it('should log warning for dangerous permissions', async () => {
            mockHasDangerousPermissions.mockReturnValueOnce(true);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('has dangerous permissions'));
            consoleWarnSpy.mockRestore();
        });

        it('should include environment variables in plugin inputs', async () => {
            const jsPluginDef = { ...mockPluginDefinition, language: 'javascript' };
            mockExecutePluginInSandbox.mockResolvedValueOnce([]);

            await pluginExecutor.execute(jsPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            const expectedEnv = expect.objectContaining({
                env: expect.objectContaining({
                    CM_AUTH_TOKEN: 'mock-token',
                    BRAIN_AUTH_TOKEN: 'mock-token',
                    MISSION_ID: 'mock-mission-id',
                    POSTOFFICE_URL: 'http://mock-postoffice',
                    BRAIN_URL: 'http://mock-brain',
                    LIBRARIAN_URL: 'http://mock-librarian-env',
                    GOOGLE_SEARCH_API_KEY: 'mock-google-api-key',
                    GOOGLE_CSE_ID: 'mock-google-cse-id',
                    LANGSEARCH_API_KEY: 'mock-langsearch-api-key',
                }),
                credentials: expect.any(Array)
            });
            expect(mockExecutePluginInSandbox).toHaveBeenCalledWith(
                jsPluginDef,
                expect.any(Array),
                expectedEnv
            );
        });

        it('should handle sandbox execution failure for JS plugins', async () => {
            const sandboxError = new Error('Sandbox failed');
            mockExecutePluginInSandbox.mockRejectedValueOnce(sandboxError);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow(`Execution failed for plugin test-plugin v${mockPluginDefinition.version}: Sandbox failed`);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Sandbox execution failed'), expect.any(Error));
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                original_error: sandboxError,
            }));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('executeOpenAPITool', () => {
        const mockOpenAPITool: OpenAPITool = {
            id: 'weather-tool',
            name: 'Weather Tool',
            description: 'A tool to get the weather',
            version: '1.0.0',
            specUrl: 'http://api.weather.com/swagger.json',
            specVersion: '3.0',
            baseUrl: 'http://api.weather.com',
            actionMappings: [
                {
                    actionVerb: 'GET_WEATHER',
                    operationId: 'getWeather',
                    method: 'GET',
                    path: '/current',
                    inputs: [
                        { name: 'city', in: 'query', type: PluginParameterType.STRING, required: true, description: '' },
                        { name: 'api_key', in: 'header', type: PluginParameterType.STRING, required: true, description: '' }
                    ],
                    outputs: []
                }
            ],
            authentication: { type: 'apiKey' as 'none' | 'apiKey' | 'bearer' | 'oauth2' | 'basic', apiKey: { name: 'X-API-Key', in: 'header', credentialSource: 'env:WEATHER_API_KEY' } },
            metadata: { created: new Date(), tags: [], category: 'Weather' }
        };

        const mockStep: Step = {
            actionVerb: 'GET_WEATHER',
            inputValues: new Map([
                ['city', { inputName: 'city', value: 'London', valueType: PluginParameterType.STRING, args: {} }],
            ])
        } as any;

        beforeEach(() => {
            process.env.WEATHER_API_KEY = 'mock-weather-key';
        });

        it('should execute an OpenAPI tool successfully', async () => {
            mockAxios.mockResolvedValueOnce({ data: { temperature: 15 }, status: 200 });

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'get',
                url: 'http://api.weather.com/current?city=London',
                headers: expect.objectContaining({
                    'X-API-Key': 'mock-weather-key',
                    'Content-Type': 'application/json',
                }),
            }));
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'result', result: { temperature: 15 } }),
                expect.objectContaining({ name: 'statusCode', result: 200 }),
                expect.objectContaining({ name: 'responseTime', resultType: PluginParameterType.NUMBER }),
            ]));
        });

        it('should handle OpenAPI tool execution failure', async () => {
            mockAxios.mockRejectedValueOnce(new Error('API call failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: 'error', error: 'API call failed' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing OpenAPI tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle missing action verb', async () => {
            const stepWithMissingVerb = { ...mockStep, actionVerb: 'NON_EXISTENT_VERB' } as any;
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, stepWithMissingVerb, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: 'error', error: `OpenAPI execution failed: Action verb NON_EXISTENT_VERB not found in OpenAPI tool ${mockOpenAPITool.id}` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing OpenAPI tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle different authentication types (bearer)', async () => {
            const bearerTool = { ...mockOpenAPITool, authentication: { type: 'bearer' as 'bearer', bearer: { credentialSource: 'env:BEARER_TOKEN' } } as any };
            process.env.BEARER_TOKEN = 'mock-bearer-token';
            mockAxios.mockResolvedValueOnce({ data: {}, status: 200 });

            await pluginExecutor.executeOpenAPITool(bearerTool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer mock-bearer-token',
                }),
            }));
        });

        it('should handle different authentication types (basic)', async () => {
            const basicTool = { ...mockOpenAPITool, authentication: { type: 'basic', basic: { credentialSource: 'env:BASIC_CREDENTIALS' } } as any };
            process.env.BASIC_CREDENTIALS = 'user:pass';
            mockAxios.mockResolvedValueOnce({ data: {}, status: 200 });

            await pluginExecutor.executeOpenAPITool(basicTool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Basic dXNlcjpwYXNz',
                }),
            }));
        });
    });

    describe('executeMCPTool', () => {
        const mockMCPTool: MCPTool = {
            id: 'payment-tool',
            name: 'Payment Tool',
            description: 'A tool to process payments',
            version: '1.0.0',
            actionMappings: [
                {
                    actionVerb: 'PROCESS_PAYMENT',
                    mcpServiceTarget: {
                        serviceName: 'payment-service',
                        endpointOrCommand: '/process',
                        method: 'post',
                    },
                    inputs: [
                        { name: 'amount', type: PluginParameterType.NUMBER, required: true, description: '' },
                        { name: 'currency', type: PluginParameterType.STRING, required: true, description: '' }
                    ],
                    outputs: [
                        { name: 'transactionId', type: PluginParameterType.STRING, required: true, description: '' }
                    ]
                }
            ],
            authentication: { type: 'apiKey', apiKey: { name: 'X-MCP-Key', in: 'header', credentialSource: 'env:MCP_API_KEY' } },
            metadata: { created: new Date().toISOString(), tags: [], category: 'Billing' }
        };

        const mockStep: Step = {
            actionVerb: 'PROCESS_PAYMENT',
            inputValues: new Map([
                ['amount', { inputName: 'amount', value: 100, valueType: PluginParameterType.NUMBER, args: {} }],
                ['currency', { inputName: 'currency', value: 'USD', valueType: PluginParameterType.STRING, args: {} }],
            ])
        } as any;

        beforeEach(() => {
            process.env.MCP_API_KEY = 'mock-mcp-key';
            process.env.MCP_SERVICE_PAYMENT_SERVICE_URL = 'http://mock-payment-service';
            mockValidateAndStandardizeInputs.mockResolvedValue({ success: true, inputs: mockStep.inputValues });
        });

        it('should execute an MCP tool successfully', async () => {
            mockAxios.mockResolvedValueOnce({ data: { transactionId: 'txn-123' } });

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(mockValidateAndStandardizeInputs).toHaveBeenCalledWith(expect.any(Object), mockStep.inputValues);
            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: 'http://mock-payment-service/process',
                headers: expect.objectContaining({
                    'X-MCP-Key': 'mock-mcp-key',
                    'Content-Type': 'application/json',
                }),
                data: { amount: 100, currency: 'USD' }
            }));
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'transactionId', result: 'txn-123' }),
            ]));
        });

        it('should handle MCP tool execution failure', async () => {
            mockAxios.mockRejectedValueOnce(new Error('MCP call failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: 'MCP tool execution failed: MCP call failed' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing MCP tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle missing action verb', async () => {
            const stepWithMissingVerb = { ...mockStep, actionVerb: 'NON_EXISTENT_MCP_VERB' } as any;
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, stepWithMissingVerb, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: `ActionVerb 'NON_EXISTENT_MCP_VERB' not found in MCP Tool '${mockMCPTool.id}'. This should have been caught by getHandlerForActionVerb.` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`ActionVerb 'NON_EXISTENT_MCP_VERB' not found in MCP Tool '${mockMCPTool.id}'. This should have been caught by getHandlerForActionVerb.`),);
            consoleErrorSpy.mockRestore();
        });

        it('should handle input validation failure for MCP tool', async () => {
            mockValidateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: 'Invalid MCP input' });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.INPUT_VALIDATION_FAILED, error: 'Invalid MCP input' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid MCP input'));
            consoleErrorSpy.mockRestore();
        });

        it('should handle unresolved MCP service name', async () => {
            process.env.MCP_SERVICE_PAYMENT_SERVICE_URL = ''; // Unset env var
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: `Cannot resolve MCP service name '${mockMCPTool.actionMappings[0].mcpServiceTarget.serviceName}'.` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Cannot resolve MCP service name '${mockMCPTool.actionMappings[0].mcpServiceTarget.serviceName}'.`));
            consoleErrorSpy.mockRestore();
        });
    });
});


// Mock external dependencies
jest.mock('../src/utils/configManager');
jest.mock('../src/utils/containerManager');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'), // Import and retain default behavior
    ServiceTokenManager: jest.fn(() => ({
        getToken: jest.fn().mockResolvedValue('mock-token'),
    })),
    executePluginInSandbox: jest.fn(),
    validatePluginPermissions: jest.fn().mockReturnValue([]),
    hasDangerousPermissions: jest.fn().mockReturnValue(false),
}));
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)), // Simplify error generation for tests
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
}));
jest.mock('../src/utils/pythonPluginHelper');
jest.mock('../src/utils/validator');
jest.mock('child_process', () => ({
    spawn: jest.fn(),
}));
jest.mock('axios');
jest.mock('fs');

describe('PluginExecutor', () => {
    let pluginExecutor: PluginExecutor;
    const MOCK_LIBRARIAN_URL = 'http://mock-librarian';
    const MOCK_SECURITY_MANAGER_URL = 'http://mock-security';
    const MOCK_TRACE_ID = 'test-trace-id';

    beforeEach(() => {
        jest.clearAllMocks();
        pluginExecutor = new PluginExecutor(mockConfigManager, mockContainerManager, MOCK_LIBRARIAN_URL, MOCK_SECURITY_MANAGER_URL);

        // Default mock implementations for common dependencies
        (mockConfigManager.getPluginConfig as jest.Mock).mockResolvedValue([]);
        (mockConfigManager.recordPluginUsage as jest.Mock).mockResolvedValue(undefined);
        (mockServiceTokenManager.getToken as jest.Mock).mockResolvedValue('mock-token');
        mockValidateAndStandardizeInputs.mockResolvedValue({ success: true, inputs: new Map() });
        mockExecutePluginInSandbox.mockResolvedValue([]);
        mockEnsurePythonDependencies.mockResolvedValue(undefined);
        mockValidatePythonOutput.mockReturnValue([]);
        mockAxios.mockResolvedValue({ data: {}, status: 200 });

        // Mock process.env for consistent testing
        process.env.MISSION_ID = 'mock-mission-id';
        process.env.POSTOFFICE_URL = 'http://mock-postoffice';
        process.env.BRAIN_URL = 'http://mock-brain';
        process.env.LIBRARIAN_URL = 'http://mock-librarian-env';
        process.env.GOOGLE_SEARCH_API_KEY = 'mock-google-api-key';
        process.env.GOOGLE_CSE_ID = 'mock-google-cse-id';
        process.env.LANGSEARCH_API_KEY = 'mock-langsearch-api-key';
    });

    describe('execute', () => {
        const mockPluginDefinition: PluginDefinition = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            description: 'A test plugin',
            language: 'javascript',
            version: '1.0.0',
            entryPoint: { main: 'index.js' },
            inputDefinitions: [],
            outputDefinitions: [],
            security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 1000, memory: 128, allowedModules: [], allowedAPIs: [] }, trust: {} }
        };
        const mockInputs = new Map<string, InputValue>();
        const mockRootPath = '/mock/plugin/path';

        it('should execute a JavaScript plugin successfully', async () => {
            mockExecutePluginInSandbox.mockResolvedValueOnce([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js-result', resultDescription: 'a js result' }]);

            const result = await pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockValidateAndStandardizeInputs).toHaveBeenCalledWith(mockPluginDefinition, mockInputs);
            expect(mockValidatePluginPermissions).toHaveBeenCalledWith(mockPluginDefinition);
            expect(mockConfigManager.getPluginConfig).toHaveBeenCalledWith(mockPluginDefinition.id);
            expect(mockConfigManager.recordPluginUsage).toHaveBeenCalledWith(mockPluginDefinition.id);
            expect(mockExecutePluginInSandbox).toHaveBeenCalledWith(
                mockPluginDefinition,
                expect.any(Array),
                expect.objectContaining({ env: expect.any(Object), credentials: expect.any(Array) })
            );
            expect(result).toEqual([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js-result', resultDescription: 'a js result' }]);
        });

        it('should execute a Python plugin successfully', async () => {
            const pythonPluginDef = { ...mockPluginDefinition, language: 'python' };
            const pythonOutput: PluginOutput[] = [{ success: true, name: 'py_out', resultType: PluginParameterType.STRING, result: 'py-result', resultDescription: 'a python result' }];
            mockValidatePythonOutput.mockReturnValueOnce(pythonOutput);
            mockFsExistsSync.mockReturnValue(true); // Mock venv python exists

            // Mock the spawn process for Python
            const mockPythonProcess = { 
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn(),
                stdin: { write: jest.fn(), end: jest.fn() }
            };
            mockSpawn.mockReturnValue(mockPythonProcess);

            // Simulate process close with success
            mockPythonProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(0); // Exit code 0 for success
                }
            });

            const result = await pluginExecutor.execute(pythonPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockEnsurePythonDependencies).toHaveBeenCalledWith(mockRootPath, MOCK_TRACE_ID);
            expect(mockSpawn).toHaveBeenCalledWith(
                expect.stringContaining('python'),
                [path.join(mockRootPath, pythonPluginDef.entryPoint!.main), mockRootPath],
                expect.objectContaining({ cwd: mockRootPath, env: expect.any(Object) })
            );
            expect(result).toEqual(pythonOutput);
        });

        it('should execute a Container plugin successfully', async () => {
            const containerPluginDef: PluginDefinition = {
                ...mockPluginDefinition,
                language: 'container',
                container: { 
                    dockerfile: 'Dockerfile', 
                    buildContext: '.', 
                    image: 'test-image', 
                    ports: [], 
                    environment: {}, 
                    resources: { memory: '128m', cpu: '0.5' }, 
                    healthCheck: { path: '/', interval: '10s', timeout: '5s', retries: 3 } 
                },
                api: { endpoint: '/', method: 'POST', timeout: 10000 }
            };
            const containerOutput: PluginOutput[] = [{ success: true, name: 'container_out', resultType: PluginParameterType.STRING, result: 'container-result', resultDescription: 'a container result' }];

            (mockContainerManager.buildPluginImage as jest.Mock).mockResolvedValue(undefined);
            (mockContainerManager.startPluginContainer as jest.Mock).mockResolvedValue({ id: 'mock-container-id' });
            (mockContainerManager.executePluginInContainer as jest.Mock).mockResolvedValue({ success: true, outputs: { container_out: 'container-result' } });
            (mockContainerManager.stopPluginContainer as jest.Mock).mockResolvedValue(undefined);

            const result = await pluginExecutor.execute(containerPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockContainerManager.buildPluginImage).toHaveBeenCalledWith(expect.any(Object), mockRootPath, MOCK_TRACE_ID);
            expect(mockContainerManager.startPluginContainer).toHaveBeenCalledWith(expect.any(Object), MOCK_TRACE_ID);
            expect(mockContainerManager.executePluginInContainer).toHaveBeenCalledWith(
                { id: 'mock-container-id' },
                expect.any(Object),
                expect.objectContaining({ inputs: {}, context: { trace_id: MOCK_TRACE_ID, plugin_id: containerPluginDef.id, version: containerPluginDef.version } }),
                MOCK_TRACE_ID
            );
            expect(mockContainerManager.stopPluginContainer).toHaveBeenCalledWith('mock-container-id', MOCK_TRACE_ID);
            expect(result).toEqual(containerOutput);
        });

        it('should throw error for unsupported language', async () => {
            const unsupportedPluginDef = { ...mockPluginDefinition, language: 'unsupported' as any };

            await expect(pluginExecutor.execute(unsupportedPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Unsupported plugin language: unsupported');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE,
                message: 'Unsupported plugin language: unsupported',
            }));
        });

        it('should throw structured error on input validation failure', async () => {
            mockValidateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: 'Invalid input', validationType: 'schema' });

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Invalid input (Type: schema)');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INVALID_INPUT,
                message: 'Invalid input (Type: schema)',
            }));
        });

        it('should throw structured error on permission validation failure', async () => {
            mockValidatePluginPermissions.mockReturnValueOnce(['permission1', 'permission2']);

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Plugin permission validation failed: permission1, permission2');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                message: 'Plugin permission validation failed: permission1, permission2',
            }));
        });

        it('should log warning for dangerous permissions', async () => {
            mockHasDangerousPermissions.mockReturnValueOnce(true);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('has dangerous permissions'));
            consoleWarnSpy.mockRestore();
        });

        it('should include environment variables in plugin inputs', async () => {
            const jsPluginDef = { ...mockPluginDefinition, language: 'javascript' };
            mockExecutePluginInSandbox.mockResolvedValueOnce([]);

            await pluginExecutor.execute(jsPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            const expectedEnv = expect.objectContaining({
                env: expect.objectContaining({
                    CM_AUTH_TOKEN: 'mock-token',
                    BRAIN_AUTH_TOKEN: 'mock-token',
                    MISSION_ID: 'mock-mission-id',
                    POSTOFFICE_URL: 'http://mock-postoffice',
                    BRAIN_URL: 'http://mock-brain',
                    LIBRARIAN_URL: 'http://mock-librarian-env',
                    GOOGLE_SEARCH_API_KEY: 'mock-google-api-key',
                    GOOGLE_CSE_ID: 'mock-google-cse-id',
                    LANGSEARCH_API_KEY: 'mock-langsearch-api-key',
                }),
                credentials: expect.any(Array)
            });
            expect(mockExecutePluginInSandbox).toHaveBeenCalledWith(
                jsPluginDef,
                expect.any(Array),
                expectedEnv
            );
        });

        it('should handle sandbox execution failure for JS plugins', async () => {
            const sandboxError = new Error('Sandbox failed');
            mockExecutePluginInSandbox.mockRejectedValueOnce(sandboxError);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow(`Execution failed for plugin test-plugin v${mockPluginDefinition.version}: Sandbox failed`);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Sandbox execution failed'), expect.any(Error));
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                original_error: sandboxError,
            }));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('executeOpenAPITool', () => {
        const mockOpenAPITool: OpenAPITool = {
            id: 'weather-tool',
            name: 'Weather Tool',
            description: 'A tool to get the weather',
            version: '1.0.0',
            specUrl: 'http://api.weather.com/swagger.json',
            specVersion: '3.0',
            baseUrl: 'http://api.weather.com',
            actionMappings: [
                {
                    actionVerb: 'GET_WEATHER',
                    operationId: 'getWeather',
                    method: 'GET',
                    path: '/current',
                    inputs: [
                        { name: 'city', in: 'query', type: PluginParameterType.STRING, required: true },
                        { name: 'api_key', in: 'header', type: PluginParameterType.STRING, required: true }
                    ],
                    outputs: []
                }
            ],
            authentication: { type: 'apiKey', apiKey: { name: 'X-API-Key', in: 'header', credentialSource: 'env:WEATHER_API_KEY' } },
            metadata: { created: new Date(), tags: [], category: 'Weather' }
        };

        const mockStep: Step = {
            actionVerb: 'GET_WEATHER',
            inputValues: new Map([
                ['city', { inputName: 'city', value: 'London', valueType: PluginParameterType.STRING, args: {} }],
            ])
        } as any;

        beforeEach(() => {
            process.env.WEATHER_API_KEY = 'mock-weather-key';
        });

        it('should execute an OpenAPI tool successfully', async () => {
            mockAxios.mockResolvedValueOnce({ data: { temperature: 15 }, status: 200 });

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'get',
                url: 'http://api.weather.com/current?city=London',
                headers: expect.objectContaining({
                    'X-API-Key': 'mock-weather-key',
                    'Content-Type': 'application/json',
                }),
            }));
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'result', result: { temperature: 15 } }),
                expect.objectContaining({ name: 'statusCode', result: 200 }),
                expect.objectContaining({ name: 'responseTime', resultType: PluginParameterType.NUMBER }),
            ]));
        });

        it('should handle OpenAPI tool execution failure', async () => {
            mockAxios.mockRejectedValueOnce(new Error('API call failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: 'error', error: 'API call failed' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing OpenAPI tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle missing action verb', async () => {
            const stepWithMissingVerb = { ...mockStep, actionVerb: 'NON_EXISTENT_VERB' } as any;
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, stepWithMissingVerb, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: 'error', error: `OpenAPI execution failed: Action verb NON_EXISTENT_VERB not found in OpenAPI tool ${mockOpenAPITool.id}` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing OpenAPI tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle different authentication types (bearer)', async () => {
            const bearerTool = { ...mockOpenAPITool, authentication: { type: 'bearer', bearer: { credentialSource: 'env:BEARER_TOKEN' } } as any };
            process.env.BEARER_TOKEN = 'mock-bearer-token';
            mockAxios.mockResolvedValueOnce({ data: {}, status: 200 });

            await pluginExecutor.executeOpenAPITool(bearerTool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer mock-bearer-token',
                }),
            }));
        });

        it('should handle different authentication types (basic)', async () => {
            const basicTool = { ...mockOpenAPITool, authentication: { type: 'basic', basic: { credentialSource: 'env:BASIC_CREDENTIALS' } } as any };
            process.env.BASIC_CREDENTIALS = 'user:pass';
            mockAxios.mockResolvedValueOnce({ data: {}, status: 200 });

            await pluginExecutor.executeOpenAPITool(basicTool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Basic dXNlcjpwYXNz',
                }),
            }));
        });
    });

    describe('executeMCPTool', () => {
        const mockMCPTool: MCPTool = {
            id: 'payment-tool',
            name: 'Payment Tool',
            description: 'A tool to process payments',
            version: '1.0.0',
            actionMappings: [
                {
                    actionVerb: 'PROCESS_PAYMENT',
                    mcpServiceTarget: {
                        serviceName: 'payment-service',
                        endpointOrCommand: '/process',
                        method: 'post',
                    },
                    inputs: [
                        { name: 'amount', type: PluginParameterType.NUMBER, required: true, description: '' },
                        { name: 'currency', type: PluginParameterType.STRING, required: true, description: '' }
                    ],
                    outputs: [
                        { name: 'transactionId', type: PluginParameterType.STRING, required: true, description: '' }
                    ]
                }
            ],
            authentication: { type: 'apiKey', apiKey: { name: 'X-MCP-Key', in: 'header', credentialSource: 'env:MCP_API_KEY' } },
            metadata: { created: new Date().toISOString(), tags: [], category: 'Billing' }
        };

        const mockStep: Step = {
            actionVerb: 'PROCESS_PAYMENT',
            inputValues: new Map([
                ['amount', { inputName: 'amount', value: 100, valueType: PluginParameterType.NUMBER, args: {} }],
                ['currency', { inputName: 'currency', value: 'USD', valueType: PluginParameterType.STRING, args: {} }],
            ])
        } as any;

        beforeEach(() => {
            process.env.MCP_API_KEY = 'mock-mcp-key';
            process.env.MCP_SERVICE_PAYMENT_SERVICE_URL = 'http://mock-payment-service';
            mockValidateAndStandardizeInputs.mockResolvedValue({ success: true, inputs: mockStep.inputValues });
        });

        it('should execute an MCP tool successfully', async () => {
            mockAxios.mockResolvedValueOnce({ data: { transactionId: 'txn-123' } });

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(mockValidateAndStandardizeInputs).toHaveBeenCalledWith(expect.any(Object), mockStep.inputValues);
            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: 'http://mock-payment-service/process',
                headers: expect.objectContaining({
                    'X-MCP-Key': 'mock-mcp-key',
                    'Content-Type': 'application/json',
                }),
                data: { amount: 100, currency: 'USD' }
            }));
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'transactionId', result: 'txn-123' }),
            ]));
        });

        it('should handle MCP tool execution failure', async () => {
            mockAxios.mockRejectedValueOnce(new Error('MCP call failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: 'MCP tool execution failed: MCP call failed' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing MCP tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle missing action verb', async () => {
            const stepWithMissingVerb = { ...mockStep, actionVerb: 'NON_EXISTENT_MCP_VERB' } as any;
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, stepWithMissingVerb, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: `ActionVerb 'NON_EXISTENT_MCP_VERB' not found in MCP Tool '${mockMCPTool.id}'. This should have been caught by getHandlerForActionVerb.` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`ActionVerb 'NON_EXISTENT_MCP_VERB' not found in MCP Tool '${mockMCPTool.id}'. This should have been caught by getHandlerForActionVerb.`),);
            consoleErrorSpy.mockRestore();
        });

        it('should handle input validation failure for MCP tool', async () => {
            mockValidateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: 'Invalid MCP input' });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.INPUT_VALIDATION_FAILED, error: 'Invalid MCP input' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid MCP input'));
            consoleErrorSpy.mockRestore();
        });

        it('should handle unresolved MCP service name', async () => {
            process.env.MCP_SERVICE_PAYMENT_SERVICE_URL = ''; // Unset env var
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: `Cannot resolve MCP service name '${mockMCPTool.actionMappings[0].mcpServiceTarget.serviceName}'.` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Cannot resolve MCP service name '${mockMCPTool.actionMappings[0].mcpServiceTarget.serviceName}'.`));
            consoleErrorSpy.mockRestore();
        });
    });
});


// Mock external dependencies
jest.mock('../src/utils/configManager');
jest.mock('../src/utils/containerManager');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'), // Import and retain default behavior
    ServiceTokenManager: jest.fn(() => ({
        getToken: jest.fn().mockResolvedValue('mock-token'),
    })),
    executePluginInSandbox: jest.fn(),
    validatePluginPermissions: jest.fn().mockReturnValue([]),
    hasDangerousPermissions: jest.fn().mockReturnValue(false),
}));
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)), // Simplify error generation for tests
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
}));
jest.mock('../src/utils/pythonPluginHelper');
jest.mock('../src/utils/validator');
jest.mock('child_process', () => ({
    spawn: jest.fn(),
}));
jest.mock('axios');
jest.mock('fs');

describe('PluginExecutor', () => {
    let pluginExecutor: PluginExecutor;
    const MOCK_LIBRARIAN_URL = 'http://mock-librarian';
    const MOCK_SECURITY_MANAGER_URL = 'http://mock-security';
    const MOCK_TRACE_ID = 'test-trace-id';

    beforeEach(() => {
        jest.clearAllMocks();
        pluginExecutor = new PluginExecutor(mockConfigManager, mockContainerManager, MOCK_LIBRARIAN_URL, MOCK_SECURITY_MANAGER_URL);

        // Default mock implementations for common dependencies
        (mockConfigManager.getPluginConfig as jest.Mock).mockResolvedValue([]);
        (mockConfigManager.recordPluginUsage as jest.Mock).mockResolvedValue(undefined);
        (mockServiceTokenManager.getToken as jest.Mock).mockResolvedValue('mock-token');
        mockValidateAndStandardizeInputs.mockResolvedValue({ success: true, inputs: new Map() });
        mockExecutePluginInSandbox.mockResolvedValue([]);
        mockEnsurePythonDependencies.mockResolvedValue(undefined);
        mockValidatePythonOutput.mockReturnValue([]);
        mockAxios.mockResolvedValue({ data: {}, status: 200 });

        // Mock process.env for consistent testing
        process.env.MISSION_ID = 'mock-mission-id';
        process.env.POSTOFFICE_URL = 'http://mock-postoffice';
        process.env.BRAIN_URL = 'http://mock-brain';
        process.env.LIBRARIAN_URL = 'http://mock-librarian-env';
        process.env.GOOGLE_SEARCH_API_KEY = 'mock-google-api-key';
        process.env.GOOGLE_CSE_ID = 'mock-google-cse-id';
        process.env.LANGSEARCH_API_KEY = 'mock-langsearch-api-key';
    });

    describe('execute', () => {
        const mockPluginDefinition: PluginDefinition = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            version: '1.0.0',
            entryPoint: { main: 'index.js' },
            inputDefinitions: [],
            outputDefinitions: [],
            description: '',
            security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 1000, memory: 128, allowedModules: [], allowedAPIs: [] }, trust: {} }
        };
        const mockInputs = new Map<string, InputValue>();
        const mockRootPath = '/mock/plugin/path';

        it('should execute a JavaScript plugin successfully', async () => {
            mockExecutePluginInSandbox.mockResolvedValueOnce([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js-result' }]);

            const result = await pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockValidateAndStandardizeInputs).toHaveBeenCalledWith(mockPluginDefinition, mockInputs);
            expect(mockValidatePluginPermissions).toHaveBeenCalledWith(mockPluginDefinition);
            expect(mockConfigManager.getPluginConfig).toHaveBeenCalledWith(mockPluginDefinition.id);
            expect(mockConfigManager.recordPluginUsage).toHaveBeenCalledWith(mockPluginDefinition.id);
            expect(mockExecutePluginInSandbox).toHaveBeenCalledWith(
                mockPluginDefinition,
                expect.any(Array),
                expect.objectContaining({ env: expect.any(Object), credentials: expect.any(Array) })
            );
            expect(result).toEqual([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js-result' }]);
        });

        it('should execute a Python plugin successfully', async () => {
            const pythonPluginDef = { ...mockPluginDefinition, language: 'python' };
            const pythonOutput: PluginOutput[] = [{ success: true, name: 'py_out', resultType: PluginParameterType.STRING, result: 'py-result', resultDescription: '' }];
            mockValidatePythonOutput.mockReturnValueOnce(pythonOutput);
            mockFsExistsSync.mockReturnValue(true); // Mock venv python exists

            // Mock the spawn process for Python
            const mockPythonProcess = { 
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() },
                on: jest.fn(),
                stdin: { write: jest.fn(), end: jest.fn() }
            };
            mockSpawn.mockReturnValue(mockPythonProcess);

            // Simulate process close with success
            mockPythonProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(0); // Exit code 0 for success
                }
            });

            const result = await pluginExecutor.execute(pythonPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockEnsurePythonDependencies).toHaveBeenCalledWith(mockRootPath, MOCK_TRACE_ID);
            expect(mockSpawn).toHaveBeenCalledWith(
                expect.stringContaining('python'),
                [path.join(mockRootPath, pythonPluginDef.entryPoint!.main), mockRootPath],
                expect.objectContaining({ cwd: mockRootPath, env: expect.any(Object) })
            );
            expect(result).toEqual(pythonOutput);
        });

        it('should execute a Container plugin successfully', async () => {
            const containerPluginDef = {
                ...mockPluginDefinition,
                language: 'container',
                container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'test-image', ports: [], environment: {}, resources: { memory: '128m', cpu: '0.5' }, healthCheck: { path: '/', interval: '10s', timeout: '5s', retries: 3 } },
                api: { endpoint: '/', method: 'POST' as 'POST', timeout: 10000 },
                security: { permissions: [], trust: {}, sandboxOptions: { allowEval: false, timeout: 1000, memory: 128, allowedModules: [], allowedAPIs: [] } },
                inputDefinitions: [],
                outputDefinitions: [],
                description: '',
                metadata: { created: new Date().toISOString(), tags: [], category: ['Container'] },
                version: '1.0.0'
            };
            const containerOutput: PluginOutput[] = [{ success: true, name: 'container_out', resultType: PluginParameterType.STRING, result: 'container-result', resultDescription: '' }];

            (mockContainerManager.buildPluginImage as jest.Mock).mockResolvedValue(undefined);
            (mockContainerManager.startPluginContainer as jest.Mock).mockResolvedValue({ id: 'mock-container-id' });
            (mockContainerManager.executePluginInContainer as jest.Mock).mockResolvedValue({ success: true, outputs: { container_out: 'container-result' } });
            (mockContainerManager.stopPluginContainer as jest.Mock).mockResolvedValue(undefined);

            const result = await pluginExecutor.execute(containerPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(mockContainerManager.buildPluginImage).toHaveBeenCalledWith(expect.any(Object), mockRootPath, MOCK_TRACE_ID);
            expect(mockContainerManager.startPluginContainer).toHaveBeenCalledWith(expect.any(Object), MOCK_TRACE_ID);
            expect(mockContainerManager.executePluginInContainer).toHaveBeenCalledWith(
                { id: 'mock-container-id' },
                expect.any(Object),
                expect.objectContaining({ inputs: {}, context: { trace_id: MOCK_TRACE_ID, plugin_id: containerPluginDef.id, version: containerPluginDef.version } }),
                MOCK_TRACE_ID
            );
            expect(mockContainerManager.stopPluginContainer).toHaveBeenCalledWith('mock-container-id', MOCK_TRACE_ID);
            expect(result).toEqual(containerOutput);
        });

        it('should throw error for unsupported language', async () => {
            const unsupportedPluginDef = { ...mockPluginDefinition, language: 'unsupported' as any };

            await expect(pluginExecutor.execute(unsupportedPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Unsupported plugin language: unsupported');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.UNSUPPORTED_LANGUAGE,
                message: 'Unsupported plugin language: unsupported',
            }));
        });

        it('should throw structured error on input validation failure', async () => {
            mockValidateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: 'Invalid input', validationType: 'schema' });

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Invalid input (Type: schema)');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INVALID_INPUT,
                message: 'Invalid input (Type: schema)',
            }));
        });

        it('should throw structured error on permission validation failure', async () => {
            mockValidatePluginPermissions.mockReturnValueOnce(['permission1', 'permission2']);

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow('Plugin permission validation failed: permission1, permission2');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.PLUGIN_PERMISSION_VALIDATION_FAILED,
                message: 'Plugin permission validation failed: permission1, permission2',
            }));
        });

        it('should log warning for dangerous permissions', async () => {
            mockHasDangerousPermissions.mockReturnValueOnce(true);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID);

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('has dangerous permissions'));
            consoleWarnSpy.mockRestore();
        });

        it('should include environment variables in plugin inputs', async () => {
            const jsPluginDef = { ...mockPluginDefinition, language: 'javascript' };
            mockExecutePluginInSandbox.mockResolvedValueOnce([]);

            await pluginExecutor.execute(jsPluginDef, mockInputs, mockRootPath, MOCK_TRACE_ID);

            const expectedEnv = expect.objectContaining({
                env: expect.objectContaining({
                    CM_AUTH_TOKEN: 'mock-token',
                    BRAIN_AUTH_TOKEN: 'mock-token',
                    MISSION_ID: 'mock-mission-id',
                    POSTOFFICE_URL: 'http://mock-postoffice',
                    BRAIN_URL: 'http://mock-brain',
                    LIBRARIAN_URL: 'http://mock-librarian-env',
                    GOOGLE_SEARCH_API_KEY: 'mock-google-api-key',
                    GOOGLE_CSE_ID: 'mock-google-cse-id',
                    LANGSEARCH_API_KEY: 'mock-langsearch-api-key',
                }),
                credentials: expect.any(Array)
            });
            expect(mockExecutePluginInSandbox).toHaveBeenCalledWith(
                jsPluginDef,
                expect.any(Array),
                expectedEnv
            );
        });

        it('should handle sandbox execution failure for JS plugins', async () => {
            const sandboxError = new Error('Sandbox failed');
            mockExecutePluginInSandbox.mockRejectedValueOnce(sandboxError);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(pluginExecutor.execute(mockPluginDefinition, mockInputs, mockRootPath, MOCK_TRACE_ID)).rejects.toThrow(`Execution failed for plugin test-plugin v${mockPluginDefinition.version}: Sandbox failed`);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Sandbox execution failed'), expect.any(Error));
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED,
                original_error: sandboxError,
            }));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('executeOpenAPITool', () => {
        const mockOpenAPITool: OpenAPITool = {
            id: 'weather-tool',
            name: 'Weather Tool',
            description: 'A tool to get the weather',
            version: '1.0.0',
            specUrl: 'http://api.weather.com/swagger.json',
            specVersion: '3.0', 
            baseUrl: 'http://api.weather.com',
            metadata: { created: new Date(), tags: [], category: 'Weather' },
            actionMappings: [
                {
                    actionVerb: 'GET_WEATHER',
                    method: 'GET',
                    path: '/current',
                    inputs: [
                        { name: 'city', in: 'query', type: PluginParameterType.STRING, required: false },
                        { name: 'api_key', in: 'header', type: PluginParameterType.STRING, required: true}
                    ],
                    outputs: [],
                    operationId: 'getWeather'
                }
            ],
            authentication: { type: 'apiKey', apiKey: { name: 'X-API-Key', in: 'header', credentialSource: 'env:WEATHER_API_KEY' } }
        };

        const mockStep: Step = {
            actionVerb: 'GET_WEATHER',
            inputValues: new Map([
                ['city', { inputName: 'city', value: 'London', valueType: PluginParameterType.STRING, args: {} }],
            ])
        } as any;

        beforeEach(() => {
            process.env.WEATHER_API_KEY = 'mock-weather-key';
        });

        it('should execute an OpenAPI tool successfully', async () => {
            mockAxios.mockResolvedValueOnce({ data: { temperature: 15 }, status: 200 });

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'get',
                url: 'http://api.weather.com/current?city=London',
                headers: expect.objectContaining({
                    'X-API-Key': 'mock-weather-key',
                    'Content-Type': 'application/json',
                }),
            }));
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'result', result: { temperature: 15 } }),
                expect.objectContaining({ name: 'statusCode', result: 200 }),
                expect.objectContaining({ name: 'responseTime', resultType: PluginParameterType.NUMBER }),
            ]));
        });

        it('should handle OpenAPI tool execution failure', async () => {
            mockAxios.mockRejectedValueOnce(new Error('API call failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: 'error', error: 'API call failed' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing OpenAPI tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle missing action verb', async () => {
            const stepWithMissingVerb = { ...mockStep, actionVerb: 'NON_EXISTENT_VERB' } as any;
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeOpenAPITool(mockOpenAPITool, stepWithMissingVerb, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: 'error', error: `OpenAPI execution failed: Action verb NON_EXISTENT_VERB not found in OpenAPI tool ${mockOpenAPITool.id}` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing OpenAPI tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle different authentication types (bearer)', async () => {
            const bearerTool = { ...mockOpenAPITool, authentication: { type: 'bearer' as 'bearer', bearer: { credentialSource: 'env:BEARER_TOKEN' } } };
            process.env.BEARER_TOKEN = 'mock-bearer-token';
            mockAxios.mockResolvedValueOnce({ data: {}, status: 200 });

            await pluginExecutor.executeOpenAPITool(bearerTool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer mock-bearer-token',
                }),
            }));
        });

        it('should handle different authentication types (basic)', async () => {
            const basicTool = { ...mockOpenAPITool, authentication: { type: 'basic' as 'basic', basic: { credentialSource: 'env:BASIC_CREDENTIALS' } } };
            process.env.BASIC_CREDENTIALS = 'user:pass';
            mockAxios.mockResolvedValueOnce({ data: {}, status: 200 });

            await pluginExecutor.executeOpenAPITool(basicTool, mockStep, MOCK_TRACE_ID);

            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Basic dXNlcjpwYXNz',
                }),
            }));
        });
    });

    describe('executeMCPTool', () => {
        const mockMCPTool: MCPTool = {
            id: 'payment-tool',
            name: 'Payment Tool',
            description: 'A tool to process payments',
            version: '1.0.0',
            metadata: { created: new Date().toISOString(), tags: [], category: 'Billing' },
            actionMappings: [
                {
                    actionVerb: 'PROCESS_PAYMENT',
                    mcpServiceTarget: {
                        serviceName: 'payment-service',
                        endpointOrCommand: '/process',
                        method: 'post',
                    },
                    inputs: [
                        { name: 'amount', type: PluginParameterType.NUMBER, required: true, description: '' },
                        { name: 'currency', type: PluginParameterType.STRING, required: true, description: '' }
                    ],
                    outputs: [
                        { name: 'transactionId', type: PluginParameterType.STRING, required: true, description: '' }
                    ]
                }
            ],
            authentication: { type: 'apiKey', apiKey: { name: 'X-MCP-Key', in: 'header', credentialSource: 'env:MCP_API_KEY' } }
        };

        const mockStep: Step = {
            actionVerb: 'PROCESS_PAYMENT',
            inputValues: new Map([
                ['amount', { inputName: 'amount', value: 100, valueType: PluginParameterType.NUMBER, args: {} }],
                ['currency', { inputName: 'currency', value: 'USD', valueType: PluginParameterType.STRING, args: {} }],
            ])
        } as any;

        beforeEach(() => {
            process.env.MCP_API_KEY = 'mock-mcp-key';
            process.env.MCP_SERVICE_PAYMENT_SERVICE_URL = 'http://mock-payment-service';
            mockValidateAndStandardizeInputs.mockResolvedValue({ success: true, inputs: mockStep.inputValues });
        });

        it('should execute an MCP tool successfully', async () => {
            mockAxios.mockResolvedValueOnce({ data: { transactionId: 'txn-123' } });

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(mockValidateAndStandardizeInputs).toHaveBeenCalledWith(expect.any(Object), mockStep.inputValues);
            expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: 'http://mock-payment-service/process',
                headers: expect.objectContaining({
                    'X-MCP-Key': 'mock-mcp-key',
                    'Content-Type': 'application/json',
                }),
                data: { amount: 100, currency: 'USD' }
            }));
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ name: 'transactionId', result: 'txn-123' }),
            ]));
        });

        it('should handle MCP tool execution failure', async () => {
            mockAxios.mockRejectedValueOnce(new Error('MCP call failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: 'MCP tool execution failed: MCP call failed' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error executing MCP tool'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle missing action verb', async () => {
            const stepWithMissingVerb = { ...mockStep, actionVerb: 'NON_EXISTENT_MCP_VERB' } as any;
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, stepWithMissingVerb, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: `ActionVerb 'NON_EXISTENT_MCP_VERB' not found in MCP Tool '${mockMCPTool.id}'. This should have been caught by getHandlerForActionVerb.` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`ActionVerb 'NON_EXISTENT_MCP_VERB' not found in MCP Tool '${mockMCPTool.id}'. This should have been caught by getHandlerForActionVerb.`),);
            consoleErrorSpy.mockRestore();
        });

        it('should handle input validation failure for MCP tool', async () => {
            mockValidateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: 'Invalid MCP input' });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.INPUT_VALIDATION_FAILED, error: 'Invalid MCP input' }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid MCP input'));
            consoleErrorSpy.mockRestore();
        });

        it('should handle unresolved MCP service name', async () => {
            process.env.MCP_SERVICE_PAYMENT_SERVICE_URL = ''; // Unset env var
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await pluginExecutor.executeMCPTool(mockMCPTool, mockStep, MOCK_TRACE_ID);

            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ success: false, name: GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED, error: `Cannot resolve MCP service name '${mockMCPTool.actionMappings[0].mcpServiceTarget.serviceName}'.` }),
            ]));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Cannot resolve MCP service name '${mockMCPTool.actionMappings[0].mcpServiceTarget.serviceName}'.`));
            consoleErrorSpy.mockRestore();
        });
    });
});
