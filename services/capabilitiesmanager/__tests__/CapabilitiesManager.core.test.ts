import { CapabilitiesManager } from '../src/CapabilitiesManager';
import express from 'express';
import { MapSerializer, InputValue, PluginParameterType, PluginOutput, PluginManifest, PluginRepositoryType, PluginLocator } from '@cktmcs/shared';
import { GlobalErrorCodes } from '../src/utils/errorReporter';
import { ConfigManager } from '../src/utils/configManager';
import { PluginRegistry } from '../src/utils/pluginRegistry';
import { ContainerManager } from '../src/utils/containerManager';
import { PluginExecutor } from '../src/utils/pluginExecutor';
import { PluginContextManager, PluginContext } from '../src/utils/PluginContextManager';

jest.mock('express');
jest.mock('axios');
jest.mock('fs/promises');
jest.mock('child_process');

jest.mock('../src/utils/configManager', () => ({
    ConfigManager: {
        initialize: jest.fn().mockResolvedValue({
            getPluginConfig: jest.fn().mockResolvedValue([]),
            recordPluginUsage: jest.fn().mockResolvedValue(undefined),
            getEnvironmentVariable: jest.fn().mockResolvedValue(undefined),
            ensurePluginMetadata: jest.fn().mockResolvedValue(undefined),
        }) as jest.Mock,
    },
}));

jest.mock('../src/utils/pluginRegistry', () => {
    const mockPluginRegistryInstance = {
        initialize: jest.fn().mockResolvedValue(undefined) as jest.Mock,
        fetchOneByVerb: jest.fn().mockResolvedValue(null) as jest.Mock,
        list: jest.fn().mockResolvedValue([]) as jest.Mock,
        fetchOne: jest.fn().mockResolvedValue(null) as jest.Mock,
        store: jest.fn().mockResolvedValue(undefined) as jest.Mock,
        delete: jest.fn().mockResolvedValue(undefined) as jest.Mock,
        preparePluginForExecution: jest.fn().mockImplementation((manifest: any) => Promise.resolve({
            pluginRootPath: `/tmp/plugins/${manifest.id}`,
            effectiveManifest: manifest
        })) as jest.Mock,
        getActiveRepositories: jest.fn().mockReturnValue([]) as jest.Mock,
        updatePluginMarketplace: jest.fn() as jest.Mock,
    };
    return {
        PluginRegistry: jest.fn().mockImplementation(() => mockPluginRegistryInstance)
    };
});

jest.mock('../src/utils/containerManager', () => ({
    ContainerManager: jest.fn().mockImplementation(() => ({
        cleanup: jest.fn().mockResolvedValue(undefined) as jest.Mock,
    })),
}));

jest.mock('../src/utils/pluginExecutor', () => ({
    PluginExecutor: jest.fn().mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue([]) as jest.Mock,
        executeOpenAPITool: jest.fn().mockResolvedValue([]) as jest.Mock,
        executeMCPTool: jest.fn().mockResolvedValue([]) as jest.Mock,
    })),
}));

jest.mock('../src/utils/PluginContextManager', () => ({
    PluginContextManager: jest.fn().mockImplementation(() => ({
        generateContext: jest.fn().mockResolvedValue({ relevantPlugins: [], totalTokens: 0, confidence: 0, reasoning: '', formattedString: '' } as PluginContext) as jest.Mock,
        updateUsageStats: jest.fn().mockResolvedValue(undefined) as jest.Mock,
        refreshCache: jest.fn().mockResolvedValue(undefined) as jest.Mock,
    })),
}));

const mockExpress = express as jest.MockedFunction<typeof express>;
const mockConfigManager = ConfigManager;
const mockPluginRegistry = PluginRegistry;
const mockContainerManager = ContainerManager;
const mockPluginExecutor = PluginExecutor;
const mockPluginContextManager = PluginContextManager;

describe('CapabilitiesManager Core Functionality', () => {
    let capabilitiesManager: CapabilitiesManager;
    let mockApp: any;
    let mockListen: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        mockListen = jest.fn((port: any, callback: any) => callback());
        mockApp = {
            use: jest.fn(),
            post: jest.fn(),
            get: jest.fn(),
            listen: mockListen,
            on: jest.fn(),
            set: jest.fn(),
        };
        mockExpress.mockReturnValue(mockApp as unknown as express.Express);

        // Manually mock BaseEntity methods that CapabilitiesManager uses
        jest.spyOn(CapabilitiesManager.prototype, 'registerWithPostOffice' as any).mockResolvedValue(true);
        jest.spyOn(CapabilitiesManager.prototype, 'verifyToken' as any).mockImplementation((req: any, res: any, next: any) => next());
        jest.spyOn(CapabilitiesManager.prototype, 'handleBaseMessage' as any).mockResolvedValue(undefined);
        jest.spyOn(CapabilitiesManager.prototype, 'authenticatedApi' as any, 'get').mockResolvedValue({ data: { capabilitiesManagerUrl: 'http://localhost:5060' } });

        capabilitiesManager = new CapabilitiesManager();
    });

    describe('Initialization', () => {
        it('should initialize ConfigManager and PluginRegistry on startup', async () => {
            // Ensure the constructor's async initialization completes
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to allow async init to run

            expect(mockConfigManager.initialize).toHaveBeenCalled();
            expect(mockPluginRegistry.prototype.initialize).toHaveBeenCalled();
            expect(capabilitiesManager['initializationStatus'].overall).toBe(true);
        });

        it('should attempt to register with PostOffice', async () => {
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to allow async init to run
            expect(capabilitiesManager['registerWithPostOffice']).toHaveBeenCalledWith(15, 2000);
        });

        it('should handle initialization failures gracefully', async () => {
            mockConfigManager.initialize.mockRejectedValue(new Error('Config init failed'));
            mockPluginRegistry.prototype.initialize.mockRejectedValue(new Error('Registry init failed'));

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Re-instantiate to trigger the failing initialization
            capabilitiesManager = new CapabilitiesManager();
            await new Promise(resolve => setTimeout(resolve, 5000)); // Allow retries to complete

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('INIT_FAILURE'), expect.any(String), expect.any(Object));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('PluginRegistry initialization failed'), expect.any(Error));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('ConfigManager initialization failed'), expect.any(Error));
            expect(capabilitiesManager['initializationStatus'].overall).toBe(true); // Still true because it continues with limited functionality
            consoleErrorSpy.mockRestore();
            consoleWarnSpy.mockRestore();
        });
    });

    describe('Server Setup and Routes', () => {
        it('should set up core routes and health checks', async () => {
            await capabilitiesManager.start();

            expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // Body parser
            expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // Auth middleware
            expect(mockApp.post).toHaveBeenCalledWith('/executeAction', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));
            expect(mockApp.get).toHaveBeenCalledWith('/ready', expect.any(Function));
        });

        it('should handle /health endpoint correctly', async () => {
            const mockReq: any = {};
            const mockRes: any = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };
            await capabilitiesManager.start(); // Ensure server is set up
            const healthHandler = mockApp.get.mock.calls.find(call => call[0] === '/health')[1];
            healthHandler(mockReq, mockRes);

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'ok',
                service: 'CapabilitiesManager',
                initialization: expect.any(Object)
            }));
        });

        it('should handle /ready endpoint correctly when ready', async () => {
            const mockReq: any = {};
            const mockRes: any = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };
            await capabilitiesManager.start(); // Ensure server is set up
            const readyHandler = mockApp.get.mock.calls.find(call => call[0] === '/ready')[1];
            capabilitiesManager['initializationStatus'].overall = true; // Simulate ready state
            readyHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: true,
                service: 'CapabilitiesManager'
            }));
        });

        it('should handle /ready endpoint correctly when not ready', async () => {
            const mockReq: any = {};
            const mockRes: any = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };
            await capabilitiesManager.start(); // Ensure server is set up
            const readyHandler = mockApp.get.mock.calls.find(call => call[0] === '/ready')[1];
            capabilitiesManager['initializationStatus'].overall = false; // Simulate not ready state
            readyHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: false,
                service: 'CapabilitiesManager'
            }));
        });

        it('should handle /plugins GET route', async () => {
            const mockReq: any = { query: {} };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginRegistry.prototype.list.mockResolvedValueOnce([{ id: 'test-plugin', verb: 'TEST_VERB', repository: { type: 'local' } }]);

            await capabilitiesManager.start();
            const pluginsGetHandler = mockApp.get.mock.calls.find(call => call[0] === '/plugins')[1];
            await pluginsGetHandler(mockReq, mockRes);

            expect(mockPluginRegistry.prototype.list).toHaveBeenCalledWith(undefined);
            expect(mockRes.json).toHaveBeenCalledWith({ plugins: [{ id: 'test-plugin', verb: 'TEST_VERB', repository: { type: 'local' } }] });
        });

        it('should handle /plugins/:id GET route', async () => {
            const mockReq: any = { params: { id: 'test-plugin' }, query: {} };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginRegistry.prototype.fetchOne.mockResolvedValueOnce({ id: 'test-plugin', verb: 'TEST_VERB' });

            await capabilitiesManager.start();
            const pluginGetHandler = mockApp.get.mock.calls.find(call => call[0] === '/plugins/:id')[1];
            await pluginGetHandler(mockReq, mockRes);

            expect(mockPluginRegistry.prototype.fetchOne).toHaveBeenCalledWith('test-plugin', undefined, undefined);
            expect(mockRes.json).toHaveBeenCalledWith({ plugin: { id: 'test-plugin', verb: 'TEST_VERB' } });
        });

        it('should handle /plugins POST route', async () => {
            const mockReq: any = { body: { id: 'new-plugin', verb: 'NEW_VERB' } };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginRegistry.prototype.store.mockResolvedValueOnce(undefined);

            await capabilitiesManager.start();
            const pluginsPostHandler = mockApp.post.mock.calls.find(call => call[0] === '/plugins')[1];
            await pluginsPostHandler(mockReq, mockRes);

            expect(mockPluginRegistry.prototype.store).toHaveBeenCalledWith({ id: 'new-plugin', verb: 'NEW_VERB' });
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
        });

        it('should handle /plugins PUT route', async () => {
            const mockReq: any = { params: { id: 'update-plugin' }, body: { id: 'update-plugin', verb: 'UPDATED_VERB' } };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginRegistry.prototype.store.mockResolvedValueOnce(undefined);

            await capabilitiesManager.start();
            const pluginsPutHandler = mockApp.put.mock.calls.find(call => call[0] === '/plugins/:id')[1];
            await pluginsPutHandler(mockReq, mockRes);

            expect(mockPluginRegistry.prototype.store).toHaveBeenCalledWith({ id: 'update-plugin', verb: 'UPDATED_VERB' });
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
        });

        it('should handle /plugins DELETE route', async () => {
            const mockReq: any = { params: { id: 'delete-plugin' }, query: { repository: 'librarian-definition' } };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginRegistry.prototype.delete.mockResolvedValueOnce(undefined);

            await capabilitiesManager.start();
            const pluginsDeleteHandler = mockApp.delete.mock.calls.find(call => call[0] === '/plugins/:id')[1];
            await pluginsDeleteHandler(mockReq, mockRes);

            expect(mockPluginRegistry.prototype.delete).toHaveBeenCalledWith('delete-plugin', undefined, 'librarian-definition');
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
        });

        it('should handle /pluginRepositories GET route', async () => {
            const mockReq: any = {};
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginRegistry.prototype.getActiveRepositories.mockReturnValueOnce([{ type: 'local', label: 'Local' }]);

            await capabilitiesManager.start();
            const reposGetHandler = mockApp.get.mock.calls.find(call => call[0] === '/pluginRepositories')[1];
            await reposGetHandler(mockReq, mockRes);

            expect(mockPluginRegistry.prototype.getActiveRepositories).toHaveBeenCalled();
            expect(mockRes.json).toHaveBeenCalledWith({ repositories: [{ type: 'local', label: 'Local' }] });
        });

        it('should handle /message POST route', async () => {
            const mockReq: any = { body: { type: 'test-message' } };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };

            await capabilitiesManager.start();
            const messagePostHandler = mockApp.post.mock.calls.find(call => call[0] === '/message')[1];
            await messagePostHandler(mockReq, mockRes);

            expect(capabilitiesManager['handleBaseMessage']).toHaveBeenCalledWith({ type: 'test-message' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message received and processed' });
        });

       it('should handle /generatePluginContext POST route', async () => {
            const mockReq: any = { body: { goal: 'test goal', constraints: {} } };
            const mockRes: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
            mockPluginContextManager.prototype.generateContext.mockResolvedValueOnce({ context: 'generated' });

            await capabilitiesManager.start();
            const generateContextPostHandler = mockApp.post.mock.calls.find(call => call[0] === '/generatePluginContext')[1];
            await generateContextPostHandler(mockReq, mockRes);

            expect(mockPluginContextManager.prototype.generateContext).toHaveBeenCalledWith('test goal', expect.objectContaining({ maxTokens: 2000, maxPlugins: 20 }));
            expect(mockRes.json).toHaveBeenCalledWith({ context: 'generated' });
        });
    });

    describe('Transaction Management', () => {
        it('should begin a transaction and add to activeOperations', async () => {
            const step = { actionVerb: 'TEST_VERB', id: 'step-123' } as any;
            const opId = await capabilitiesManager['beginTransaction']('trace-id', step);
            expect(capabilitiesManager['activeOperations'].has(opId)).toBe(true);
            expect(capabilitiesManager['activeOperations'].get(opId)?.resources.size).toBe(0);
        });

        it('should commit a transaction and clear resources', async () => {
            const step = { actionVerb: 'TEST_VERB', id: 'step-123' } as any;
            const opId = await capabilitiesManager['beginTransaction']('trace-id', step);
            capabilitiesManager['activeOperations'].get(opId)?.resources.add('resource-1');
            capabilitiesManager['resourceUsage'].set('resource-1', { inUse: true, lastAccessed: Date.now() });

            await capabilitiesManager['commitTransaction'](opId);
            expect(capabilitiesManager['activeOperations'].has(opId)).toBe(false);
            expect(capabilitiesManager['resourceUsage'].get('resource-1')?.inUse).toBe(false);
        });

        it('should rollback a transaction and release resources', async () => {
            const step = { actionVerb: 'TEST_VERB', id: 'step-123' } as any;
            const opId = await capabilitiesManager['beginTransaction']('trace-id', step);
            capabilitiesManager['activeOperations'].get(opId)?.resources.add('resource-2');
            capabilitiesManager['resourceUsage'].set('resource-2', { inUse: true, lastAccessed: Date.now() });

            await capabilitiesManager['rollbackTransaction'](opId);
            expect(capabilitiesManager['activeOperations'].has(opId)).toBe(false);
            expect(capabilitiesManager['resourceUsage'].get('resource-2')?.inUse).toBe(false);
        });
    });

    describe('Resource Cleanup', () => {
        it('should cleanup stale operations and resources', async () => {
            const oldOpId = 'old-op';
            const oldResourceId = 'old-resource';

            capabilitiesManager['activeOperations'].set(oldOpId, {
                resources: new Set([oldResourceId]),
                startTime: Date.now() - (35 * 60 * 1000) // 35 minutes ago
            });
            capabilitiesManager['resourceUsage'].set(oldResourceId, {
                inUse: true,
                lastAccessed: Date.now() - (35 * 60 * 1000)
            });

            capabilitiesManager['cleanupStaleResources']();

            expect(capabilitiesManager['activeOperations'].has(oldOpId)).toBe(false);
            expect(capabilitiesManager['resourceUsage'].has(oldResourceId)).toBe(false);
        });

        it('should call containerManager.cleanup on graceful shutdown', async () => {
            await capabilitiesManager.cleanup();
            expect(mockContainerManager.prototype.cleanup).toHaveBeenCalled();
        });
    });

    describe('Error Classification', () => {
        it('should classify input validation errors', () => {
            const error = { error_code: GlobalErrorCodes.INPUT_VALIDATION_FAILED, message: 'Validation failed' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('validation_error');
        });

        it('should classify authentication errors', () => {
            const error = { error_code: GlobalErrorCodes.AUTHENTICATION_ERROR, message: 'Auth failed' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('authentication_error');
        });

        it('should classify plugin execution errors', () => {
            const error = { error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_EXECUTION_FAILED, message: 'Exec failed' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('plugin_execution_error');
        });

        it('should classify unknown verb errors', () => {
            const error = { error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_UNKNOWN_VERB_HANDLING_FAILED, message: 'Unknown verb' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('unknown_verb');
        });

        it('should classify brain service errors', () => {
            const error = { message: 'Brain service returned 500' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('brain_service_error');
        });

        it('should classify JSON parse errors', () => {
            const error = { message: 'Failed to parse JSON' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('json_parse_error');
        });

        it('should classify generic errors', () => {
            const error = { message: 'Something unexpected happened' };
            expect(capabilitiesManager['classifyError'](error, 'trace')).toBe('generic_error');
        });
    });

    describe('getHandlerForActionVerb', () => {
        it('should return a plugin handler if found by verb', async () => {
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce({ id: 'test-plugin', verb: 'TEST_VERB', language: 'javascript' });
            const handler = await capabilitiesManager['getHandlerForActionVerb']('TEST_VERB', 'trace');
            expect(handler).toEqual({ type: 'plugin', handler: { id: 'test-plugin', verb: 'TEST_VERB', language: 'javascript' } });
        });

        it('should return null if no handler is found', async () => {
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(null);
            const handler = await capabilitiesManager['getHandlerForActionVerb']('UNKNOWN_VERB', 'trace');
            expect(handler).toBeNull();
        });
    });

    describe('executeActionVerb - ACCOMPLISH handling', () => {
        it('should redirect ACCOMPLISH verb to executeAccomplishPlugin', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'ACCOMPLISH',
                    inputValues: MapSerializer.transformForSerialization(new Map([['goal', { inputName: 'goal', value: 'test goal', valueType: PluginParameterType.STRING, args: {} }]])),
                },
                trace_id: 'trace-accomplish'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockAccomplishResult: PluginOutput[] = [{
                success: true,
                name: 'plan',
                resultType: PluginParameterType.PLAN,
                result: [{ stepNo: 1, actionVerb: 'STEP_ONE' }],
                resultDescription: 'Generated plan'
            }];
            jest.spyOn(capabilitiesManager as any, 'executeAccomplishPlugin').mockResolvedValueOnce(mockAccomplishResult);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(capabilitiesManager['executeAccomplishPlugin']).toHaveBeenCalledWith(expect.any(Map), 'trace-accomplish');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization(mockAccomplishResult));
        });
    });

    describe('executeActionVerb - Plugin Execution', () => {
        it('should execute a JavaScript plugin', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'JS_VERB',
                    inputValues: MapSerializer.transformForSerialization(new Map()),
                },
                trace_id: 'trace-js'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockPluginManifest = { id: 'js-plugin', verb: 'JS_VERB', language: 'javascript', inputDefinitions: [] };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockPluginManifest);
            mockPluginExecutor.prototype.execute.mockResolvedValueOnce([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js result' }]);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginExecutor.prototype.execute).toHaveBeenCalledWith(
                expect.objectContaining({ language: 'javascript' }),
                expect.any(Map),
                expect.any(String),
                'trace-js'
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'js result' }]));
        });

        it('should execute a Python plugin', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'PY_VERB',
                    inputValues: MapSerializer.transformForSerialization(new Map()),
                },
                trace_id: 'trace-py'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockPluginManifest = { id: 'py-plugin', verb: 'PY_VERB', language: 'python', inputDefinitions: [] };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockPluginManifest);
            mockPluginExecutor.prototype.execute.mockResolvedValueOnce([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'py result' }]);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginExecutor.prototype.execute).toHaveBeenCalledWith(
                expect.objectContaining({ language: 'python' }),
                expect.any(Map),
                expect.any(String),
                'trace-py'
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'py result' }]));
        });

        it('should execute a Container plugin', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'CONTAINER_VERB',
                    inputValues: MapSerializer.transformForSerialization(new Map()),
                },
                trace_id: 'trace-container'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockPluginManifest = { id: 'container-plugin', verb: 'CONTAINER_VERB', language: 'container', inputDefinitions: [] };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockPluginManifest);
            mockPluginExecutor.prototype.execute.mockResolvedValueOnce([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'container result' }]);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginExecutor.prototype.execute).toHaveBeenCalledWith(
                expect.objectContaining({ language: 'container' }),
                expect.any(Map),
                expect.any(String),
                'trace-container'
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization([{ success: true, name: 'output', resultType: PluginParameterType.STRING, result: 'container result' }]));
        });

        it('should execute an OpenAPI tool', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'GET_WEATHER_FORECAST_OPENAPI',
                    inputValues: MapSerializer.transformForSerialization(new Map()),
                },
                trace_id: 'trace-openapi'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockOpenAPIToolManifest = {
                id: 'openapi-weather-tool',
                verb: 'GET_WEATHER_FORECAST_OPENAPI',
                language: 'openapi',
                toolDefinition: { specUrl: 'http://example.com/openapi.json' }
            };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockOpenAPIToolManifest);
            mockPluginExecutor.prototype.executeOpenAPITool.mockResolvedValueOnce([{ success: true, name: 'weather', resultType: PluginParameterType.OBJECT, result: { temp: 25 } }]);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginExecutor.prototype.executeOpenAPITool).toHaveBeenCalledWith(
                expect.objectContaining({ specUrl: 'http://example.com/openapi.json' }),
                expect.any(Object),
                'trace-openapi'
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization([{ success: true, name: 'weather', resultType: PluginParameterType.OBJECT, result: { temp: 25 } }]));
        });

        it('should execute an MCP tool', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'PROCESS_PAYMENT_MCP',
                    inputValues: MapSerializer.transformForSerialization(new Map()),
                },
                trace_id: 'trace-mcp'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockMCPToolManifest = {
                id: 'mcp-financial-tool',
                verb: 'PROCESS_PAYMENT_MCP',
                language: 'mcp',
                toolDefinition: { actionMappings: [{ actionVerb: 'PROCESS_PAYMENT_MCP' }] }
            };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockMCPToolManifest);
            mockPluginExecutor.prototype.executeMCPTool.mockResolvedValueOnce([{ success: true, name: 'transactionId', resultType: PluginParameterType.STRING, result: 'txn-123' }]);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginExecutor.prototype.executeMCPTool).toHaveBeenCalledWith(
                expect.objectContaining({ actionMappings: expect.any(Array) }),
                expect.any(Object),
                'trace-mcp'
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization([{ success: true, name: 'transactionId', resultType: PluginParameterType.STRING, result: 'txn-123' }]));
        });

        it('should handle internal verbs by returning special response', async () => {
            const mockReq: any = {
                body: {
                    actionVerb: 'CHAT',
                    inputValues: MapSerializer.transformForSerialization(new Map([['message', { value: 'Hello user!', valueType: 'string' }]])),
                },
                trace_id: 'trace-internal'
            };
            const mockRes: any = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
                json: jest.fn()
            };

            const mockInternalManifest = {
                id: 'internal-CHAT',
                verb: 'CHAT',
                language: 'internal',
                inputDefinitions: [{ name: 'message', type: PluginParameterType.STRING, required: true }]
            };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockInternalManifest);

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(MapSerializer.transformForSerialization([{
                success: true,
                name: 'internal_verb_detected',
                resultType: PluginParameterType.STRING,
                resultDescription: "Internal verb 'CHAT' should be handled by Agent",
                result: 'INTERNAL_VERB',
                mimeType: 'text/plain'
            }]));
        });
    });

    describe('handleUnknownVerb', () => {
        it('should call executeAccomplishPlugin and return a plan', async () => {
            const mockStep = {
                actionVerb: 'NOVEL_VERB',
                description: 'A new task',
                inputValues: new Map(),
                outputs: new Map(),
                missionId: 'mission-123'
            } as any;

            const mockAccomplishResult: PluginOutput[] = [{
                success: true,
                name: 'plan',
                resultType: PluginParameterType.PLAN,
                result: [{ stepNo: 1, actionVerb: 'SUB_STEP' }],
                resultDescription: 'Generated plan for novel verb'
            }];
            jest.spyOn(capabilitiesManager as any, 'executeAccomplishPlugin').mockResolvedValueOnce(mockAccomplishResult);

            const result = await (capabilitiesManager as any).handleUnknownVerb(mockStep, 'trace-novel');

            expect(capabilitiesManager['executeAccomplishPlugin']).toHaveBeenCalledWith(expect.any(Map), 'trace-novel');
            expect(result).toEqual(mockAccomplishResult);
            expect(capabilitiesManager['planCache'].has('NOVEL_VERB')).toBe(true);
        });

        it('should return an error if ACCOMPLISH plugin fails', async () => {
            const mockStep = {
                actionVerb: 'NOVEL_VERB',
                description: 'A new task',
                inputValues: new Map(),
                outputs: new Map(),
                missionId: 'mission-123'
            } as any;

            jest.spyOn(capabilitiesManager as any, 'executeAccomplishPlugin').mockRejectedValueOnce(new Error('ACCOMPLISH failed'));

            const result = await (capabilitiesManager as any).handleUnknownVerb(mockStep, 'trace-novel-fail');

            expect(result.length).toBe(1);
            expect(result[0].success).toBe(false);
            expect(result[0].name).toBe('handleUnknownVerb');
            expect(result[0].error).toContain('ACCOMPLISH failed');
        });
    });

    describe('executeAccomplishPlugin', () => {
        it('should fetch ACCOMPLISH plugin and execute it', async () => {
            const mockInputs = new Map([['goal', { inputName: 'goal', value: 'test goal', valueType: PluginParameterType.STRING, args: {} }]]);
            const mockAccomplishManifest = { id: 'plugin-ACCOMPLISH', verb: 'ACCOMPLISH', language: 'python', inputDefinitions: [] };
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(mockAccomplishManifest);
            mockPluginExecutor.prototype.execute.mockResolvedValueOnce([{ success: true, name: 'plan', resultType: PluginParameterType.PLAN, result: [] }]);

            const result = await (capabilitiesManager as any).executeAccomplishPlugin(mockInputs, 'trace-accomplish-exec');

            expect(mockPluginRegistry.prototype.fetchOneByVerb).toHaveBeenCalledWith('ACCOMPLISH');
            expect(mockPluginExecutor.prototype.execute).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'plugin-ACCOMPLISH' }),
                expect.any(Map),
                expect.any(String),
                'trace-accomplish-exec'
            );
            expect(result[0].success).toBe(true);
        });

        it('should throw error if ACCOMPLISH plugin manifest not found', async () => {
            const mockInputs = new Map([['goal', { inputName: 'goal', value: 'test goal', valueType: PluginParameterType.STRING, args: {} }]]);
            mockPluginRegistry.prototype.fetchOneByVerb.mockResolvedValueOnce(null);

            await expect((capabilitiesManager as any).executeAccomplishPlugin(mockInputs, 'trace-no-manifest')).rejects.toThrow(
                expect.objectContaining({ error_code: GlobalErrorCodes.ACCOMPLISH_PLUGIN_MANIFEST_NOT_FOUND })
            );
        });
    });
});
