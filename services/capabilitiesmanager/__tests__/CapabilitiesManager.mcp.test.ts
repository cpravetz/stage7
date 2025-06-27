import { CapabilitiesManager } from '../src/CapabilitiesManager';
import { MCPTool, Step, PluginParameterType, PluginOutput, MapSerializer, GlobalErrorCodes } from '@cktmcs/shared';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock shared utilities and BaseEntity
jest.mock('@cktmcs/shared', () => {
    const originalShared = jest.requireActual('@cktmcs/shared');
    return {
        ...originalShared,
        BaseEntity: class {
            serviceName = 'MockedCMBaseEntity';
            serviceType = 'MockedCMService';
            id = 'mocked-cm-id';
            port = '5060';
            url = 'http://localhost:5060';
            postOfficeUrl = 'postoffice:5000';
            securityManagerUrl = 'security:5010';
            librarianUrl = 'librarian:5040';
            token = 'mocked-cm-token';
            registeredWithPostOffice = true;
            authenticatedApi = {
                get: jest.fn(),
                post: jest.fn(),
                put: jest.fn(),
                delete: jest.fn(),
            };
            verifyToken = jest.fn((req, res, next) => next());
            registerWithPostOffice = jest.fn().mockResolvedValue(undefined);
            getTokenManager = jest.fn().mockReturnValue({
                getToken: jest.fn().mockResolvedValue('mocked-cm-service-token')
            });
             handleBaseMessage = jest.fn().mockResolvedValue(undefined);
        },
        validateAndStandardizeInputs: jest.fn().mockImplementation(async (def, inputs) => {
            // Simplified mock: assumes all inputs are valid and returns them
            return { success: true, inputs: inputs };
        }),
    };
});

import { DefinitionManifest, DefinitionType, createMcpDefinitionManifest, createOpenApiDefinitionManifest, OpenAPITool } from '@cktmcs/shared'; // Import DefinitionManifest related types

// Mock internal utilities of CapabilitiesManager if they are complex or make external calls
let mockPluginRegistryInstance: any;
jest.mock('../src/utils/pluginRegistry', () => {
    mockPluginRegistryInstance = {
        fetchOneByVerb: jest.fn().mockResolvedValue(null), // Default to no plugin found
        list: jest.fn().mockResolvedValue([]),
        preparePluginForExecution: jest.fn().mockImplementation((manifest) => Promise.resolve({
            pluginRootPath: `/tmp/plugins/${manifest.id}`,
            effectiveManifest: manifest
        })),
        getAvailablePluginsStr: jest.fn().mockResolvedValue(""),
        fetchOne: jest.fn().mockResolvedValue(null),
    };
    return {
        PluginRegistry: jest.fn().mockImplementation(() => mockPluginRegistryInstance)
    };
});
jest.mock('../src/utils/configManager', () => {
    return {
        ConfigManager: {
            initialize: jest.fn().mockResolvedValue({
                getPluginConfig: jest.fn().mockResolvedValue([]),
                recordPluginUsage: jest.fn().mockResolvedValue(undefined),
            }),
        }
    };
});


describe('CapabilitiesManager - MCP and OpenAPI Tool Execution via PluginRegistry', () => {
    let capabilitiesManager: CapabilitiesManager;
    // let mockAuthApi: any; // No longer needed as we don't mock direct Librarian calls here

    const sampleMCPTool: MCPTool = {
        id: 'mcp-financial-tool-001', // This is the ID of the MCPTool definition itself
        name: 'MCP Financial Tool',
        description: 'Handles financial transactions via MCP.',
        version: '1.2.0',
        authentication: { // Tool-level auth
            type: 'apiKey',
            apiKey: {
                in: 'header',
                name: 'X-MCP-Tool-Token',
                credentialSource: 'ENV_MCP_TOOL_TOKEN'
            }
        },
        actionMappings: [
            {
                actionVerb: 'PROCESS_PAYMENT_MCP',
                description: 'Processes a payment through MCP.',
                mcpServiceTarget: {
                    serviceName: 'mcp-payment-service', // Resolves to http://mcp-payment-service.example.com
                    endpointOrCommand: '/api/v2/payments',
                    method: 'POST',
                },
                inputs: [
                    { name: 'amount', type: PluginParameterType.NUMBER, required: true, description: 'Payment amount' },
                    { name: 'currency', type: PluginParameterType.STRING, required: true, description: 'Currency code' },
                    { name: 'recipientId', type: PluginParameterType.STRING, required: true, description: 'Recipient ID' },
                ],
                outputs: [
                    { name: 'transactionId', type: PluginParameterType.STRING, required: true, description: 'MCP Transaction ID' },
                    { name: 'status', type: PluginParameterType.STRING, required: true, description: 'Payment status' },
                ],
            },
            {
                actionVerb: 'GET_BALANCE_MCP',
                description: 'Gets account balance from MCP.',
                mcpServiceTarget: {
                    serviceName: 'MCP_ACCOUNT_SERVICE_URL', // Direct URL from env
                    endpointOrCommand: '/api/balance',
                    method: 'GET',
                },
                authentication: { // Action-level auth override
                    type: 'customToken',
                    customToken: {
                        headerName: 'Authorization',
                        tokenPrefix: 'MCPBearer ',
                        credentialSource: 'ENV_MCP_ACCOUNT_TOKEN'
                    }
                },
                inputs: [{ name: 'accountId', type: PluginParameterType.STRING, required: true, description: 'Account ID' }],
                outputs: [{ name: 'balance', type: PluginParameterType.NUMBER, required: true, description: 'Account balance' }],
            }
        ],
        metadata: {
            author: 'MCP Corp',
            created: new Date().toISOString(),
            tags: ['finance', 'mcp', 'payment'],
            category: 'financial_services',
        },
    };

    const createStep = (actionVerb: string, inputs: Record<string, any>): Step => {
        const inputMap = new Map<string, any>();
        for (const key in inputs) {
            inputMap.set(key, { inputName: key, inputValue: inputs[key], args: {} });
        }
        return {
            id: `step-${Date.now()}`,
            stepNo: 1,
            actionVerb,
            inputs: inputMap,
            dependencies: [],
            status: 'pending',
        };
    };

    beforeAll(() => {
        // Set up environment variables for credential sources
        process.env.ENV_MCP_TOOL_TOKEN = 'tool_api_key_123';
        process.env.ENV_MCP_ACCOUNT_TOKEN = 'account_custom_token_456';
        process.env.MCP_SERVICE_MCP_PAYMENT_SERVICE_URL = 'http://mcp-payment-service.example.com';
        process.env.MCP_ACCOUNT_SERVICE_URL = 'http://mcp-account-service.example.com';

    });

    afterAll(() => {
        delete process.env.ENV_MCP_TOOL_TOKEN;
        delete process.env.ENV_MCP_ACCOUNT_TOKEN;
        delete process.env.MCP_SERVICE_MCP_PAYMENT_SERVICE_URL;
        delete process.env.MCP_ACCOUNT_SERVICE_URL;
    });


    });


    beforeEach(async () => {
        jest.clearAllMocks();
        capabilitiesManager = new CapabilitiesManager();
        // Ensure pluginRegistry mock is fresh for each test if needed
        mockPluginRegistryInstance.fetchOneByVerb.mockResolvedValue(null);
        mockPluginRegistryInstance.list.mockResolvedValue([]);
        mockPluginRegistryInstance.fetchOne.mockResolvedValue(null);

        // Mock getCredential directly on the CM instance for these tests
        // as it's a private method called by auth logic.
        jest.spyOn(capabilitiesManager as any, 'getCredential').mockImplementation(async (source: string) => {
            if (source === 'ENV_MCP_TOOL_TOKEN') return 'tool_api_key_123';
            if (source === 'ENV_MCP_ACCOUNT_TOKEN') return 'account_custom_token_456';
            if (source === 'ENV_OPENAPI_KEY') return 'openapi_key_789';
            return `unknown_credential_${source}`;
        });
    });

    // --- Test Data for OpenAPI ---
    const sampleOpenAPITool: OpenAPITool = {
        id: 'openapi-weather-tool-001',
        name: 'OpenAPI Weather Tool',
        description: 'Provides weather forecasts.',
        version: '1.0.0',
        specUrl: 'http://weather.example.com/openapi.json',
        baseUrl: 'http://weather.example.com/api',
        authentication: {
            type: 'apiKey',
            apiKey: { name: 'X-Weather-API-Key', in: 'header', credentialSource: 'ENV_OPENAPI_KEY' }
        },
        actionMappings: [
            {
                actionVerb: 'GET_WEATHER_FORECAST_OPENAPI',
                operationId: 'getForecast',
                method: 'GET',
                path: '/forecast',
                description: 'Gets the weather forecast for a location.',
                inputs: [{ name: 'location', type: PluginParameterType.STRING, required: true, description: 'City name' }],
                outputs: [{ name: 'forecast', type: PluginParameterType.OBJECT, required: true, description: 'Forecast data' }]
            }
        ],
        metadata: { created: new Date().toISOString(), tags: ['weather', 'openapi'], category: 'utilities' }
    };

    describe('executeActionVerb with MCP Tool via PluginRegistry', () => {
        it('should execute an MCP tool fetched from PluginRegistry', async () => {
            const mcpVerb = 'PROCESS_PAYMENT_MCP';
            const mcpManifest = createMcpDefinitionManifest(sampleMCPTool, mcpVerb);

            mockPluginRegistryInstance.fetchOneByVerb.mockResolvedValue(mcpManifest);

            const step = createStep(mcpVerb, { amount: 100, currency: 'USD', recipientId: 'recv-001' });
            const mcpApiResponse = { transactionId: 'txn_123abc', status: 'completed' };
            mockedAxios.mockResolvedValueOnce({ data: mcpApiResponse, status: 200 });

            // Simulate express request/response for executeActionVerb
            const mockReq: any = { body: step, trace_id: 'trace-exec-mcp' };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn() // Added for error cases
            };

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginRegistryInstance.fetchOneByVerb).toHaveBeenCalledWith(mcpVerb, expect.any(String));
            expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: 'http://mcp-payment-service.example.com/api/v2/payments',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    'X-Trace-ID': 'trace-mcp-post',
                    'X-MCP-Tool-Token': 'tool_api_key_123'
                }),
                data: { amount: 100, currency: 'USD', recipientId: 'recv-001' }
            }));
            expect(result).toEqual([
                { success: true, name: 'transactionId', resultType: PluginParameterType.STRING, result: 'txn_123abc', resultDescription: expect.any(String) },
                { success: true, name: 'status', resultType: PluginParameterType.STRING, result: 'completed', resultDescription: expect.any(String) },
            ]);
        });

        it('should execute a GET MCP tool action successfully with action-level auth', async () => {
            const step = createStep('GET_BALANCE_MCP', { accountId: 'acc-007' });
            const mcpApiResponse = { balance: 5000.75 };
            mockedAxios.mockResolvedValueOnce({ data: mcpApiResponse, status: 200 });

            const result = await (capabilitiesManager as any).executeMCPTool(sampleMCPTool, step, 'trace-mcp-get');

            expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'get',
                url: 'http://mcp-account-service.example.com/api/balance', // Note: GET request usually sends data in query params, not body
                headers: expect.objectContaining({
                    'Content-Type': 'application/json', // May not be needed for GET if no body
                    'X-Trace-ID': 'trace-mcp-get',
                    'Authorization': 'MCPBearer account_custom_token_456'
                }),
                // data: { accountId: 'acc-007' } // For GET, this should likely be a query param. The current executeMCPTool sends all inputs as body.
                                                 // This might need refinement in executeMCPTool for GET requests.
            }));
            expect(result).toEqual([
                { success: true, name: 'balance', resultType: PluginParameterType.NUMBER, result: 5000.75, resultDescription: expect.any(String) },
            ]);
        });

        it('should handle input validation failure', async () => {
            const step = createStep('PROCESS_PAYMENT_MCP', { currency: 'USD', recipientId: 'recv-001' }); // Missing 'amount'

            // Mock validateAndStandardizeInputs to return a failure
            const mockedShared = require('@cktmcs/shared');
            mockedShared.validateAndStandardizeInputs.mockResolvedValueOnce({ success: false, error: "Missing required input: amount" });

            const result = await (capabilitiesManager as any).executeMCPTool(sampleMCPTool, step, 'trace-mcp-validation-fail');

            expect(result.length).toBe(1);
            expect(result[0].success).toBe(false);
            expect(result[0].name).toBe(GlobalErrorCodes.INPUT_VALIDATION_FAILED);
            expect(result[0].error).toContain("Missing required input: amount");
            expect(mockedAxios).not.toHaveBeenCalled();
        });

        it('should handle MCP service returning an error', async () => {
            const step = createStep('PROCESS_PAYMENT_MCP', { amount: 100, currency: 'USD', recipientId: 'recv-001' });
            const mcpApiErrorResponse = { message: "Insufficient funds" };
            mockedAxios.mockRejectedValueOnce({ response: { data: mcpApiErrorResponse, status: 400 }});

            const result = await (capabilitiesManager as any).executeMCPTool(sampleMCPTool, step, 'trace-mcp-service-error');

            expect(result.length).toBe(1);
            expect(result[0].success).toBe(false);
            expect(result[0].name).toBe(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED);
            expect(result[0].error).toContain("MCP Tool 'mcp-financial-tool-001' action 'PROCESS_PAYMENT_MCP' execution failed");
            expect(result[0].result.contextual_info.responseData).toEqual(mcpApiErrorResponse);
        });

        it('should handle failure in resolving MCP service URL', async () => {
             const badTool: MCPTool = JSON.parse(JSON.stringify(sampleMCPTool)); // Deep clone
             badTool.actionMappings[0].mcpServiceTarget.serviceName = 'non-resolvable-service';

            const step = createStep('PROCESS_PAYMENT_MCP', { amount: 100, currency: 'USD', recipientId: 'recv-001' });
            const result = await (capabilitiesManager as any).executeMCPTool(badTool, step, 'trace-mcp-url-fail');

            expect(result.length).toBe(1);
            expect(result[0].success).toBe(false);
            expect(result[0].name).toBe(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED);
            expect(result[0].error).toContain("Cannot resolve MCP service name 'non-resolvable-service'");
        });

        it('should handle authentication credential fetching failure', async () => {
            const step = createStep('PROCESS_PAYMENT_MCP', { amount: 100, currency: 'USD', recipientId: 'recv-001' });

            // Mock getCredential to throw an error
            jest.spyOn(capabilitiesManager as any, 'getCredential').mockRejectedValueOnce(new Error("Vault unavailable"));

            const result = await (capabilitiesManager as any).executeMCPTool(sampleMCPTool, step, 'trace-mcp-auth-fail');

            expect(result.length).toBe(1);
            expect(result[0].success).toBe(false);
            expect(result[0].name).toBe(GlobalErrorCodes.CAPABILITIES_MANAGER_MCP_TOOL_EXECUTION_FAILED); // The error is caught by executeMCPTool's main try-catch
            expect(result[0].error).toContain("Failed to apply MCP authentication: Vault unavailable"); // The specific error from applyMCPAuthentication
        });
    });

    describe('listCapabilities', () => {
        it('should include MCP tools in the list of capabilities', async () => {
            // Mock Librarian response for MCP tools
            mockAuthApi.post.mockImplementation(async (url: string, data: any) => {
                if (url.includes('/queryData') && data.collection === 'mcpTools') {
                    return { data: { data: [sampleMCPTool] } };
                }
                if (url.includes('/queryData') && (data.collection === 'openApiTools' || data.collection === 'planTemplates')) {
                    return { data: { data: [] } }; // No OpenAPI tools or plan templates
                }
                return { data: { data: [] } }; // Default for other queries
            });
            // Mock pluginRegistry.list to return no plugins
            (capabilitiesManager['pluginRegistry'].list as jest.Mock).mockResolvedValue([]);

            const mockReq: any = { query: {} }; // No filters
            const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

            await (capabilitiesManager as any).listCapabilities(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            const responseJson = mockRes.json.mock.calls[0][0];
            expect(responseJson.capabilities).toBeInstanceOf(Array);

            const mcpCapability = responseJson.capabilities.find((c:any) => c.type === 'mcptool');
            expect(mcpCapability).toBeDefined();
            expect(mcpCapability.name).toBe(sampleMCPTool.actionMappings[0].actionVerb);
            expect(mcpCapability.toolId).toBe(sampleMCPTool.id);
            expect(mcpCapability.category).toBe(sampleMCPTool.metadata.category);
        });
    });
});
