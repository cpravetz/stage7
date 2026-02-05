import { CapabilitiesManager } from '../src/CapabilitiesManager';
import { PluginRepositoryManager } from '../src/utils/pluginRepositoryManager';
import { PluginExecutor } from '../src/utils/pluginExecutor';
import { PluginManifest, PluginParameterType } from '@cktmcs/shared';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

// Cast mocked functions/modules
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockPluginExecutor = PluginExecutor as jest.MockedClass<typeof PluginExecutor>;

// Mock CapabilitiesManager for testing
jest.mock('../src/CapabilitiesManager', () => {
    const originalModule = jest.requireActual('../src/CapabilitiesManager');
    return {
        __esModule: true,
        ...originalModule,
        CapabilitiesManager: jest.fn().mockImplementation(() => {
            return {
                getHandlerForActionVerb: jest.fn(),
                executeActionVerb: jest.fn(),
                start: jest.fn(),
                ...originalModule.CapabilitiesManager.prototype
            };
        })
    };
});

// Promisify exec for async/await
const execAsync = promisify(exec);

// Promisify exec for async/await
const execAsync = promisify(exec);

describe('Weather Plugin Integration Tests', () => {
    let capabilitiesManager: CapabilitiesManager;
    let mockPluginExecutorInstance: jest.Mocked<PluginExecutor>;
    let pluginRepositoryManager: PluginRepositoryManager;
    let testPluginDir: string;
    let testPluginManifest: PluginManifest;

    const realWeatherPluginManifest = {
        id: 'plugin-WEATHER',
        verb: 'WEATHER',
        description: 'Fetches current weather information for a specified location',
        explanation: 'This plugin uses the OpenWeatherMap API to retrieve current weather conditions, temperature, humidity, and other meteorological data for any city or location worldwide.',
        inputGuidance: 'Inputs for this plugin must include \'location\'.',
        repository: { type: 'github' },
        inputDefinitions: [
            {
                name: 'location',
                required: true,
                type: PluginParameterType.STRING,
                description: 'City name, state/country'
            },
            {
                name: 'api_key',
                required: false,
                type: PluginParameterType.STRING,
                description: 'OpenWeatherMap API key'
            }
        ],
        outputDefinitions: [
            {
                name: 'weather_data',
                required: true,
                type: PluginParameterType.OBJECT,
                description: 'Detailed weather information including temperature, humidity, pressure, wind, etc.'
            },
            {
                name: 'summary',
                required: true,
                type: PluginParameterType.STRING,
                description: 'Human-readable weather summary'
            }
        ],
        language: 'python',
        entryPoint: {
            main: 'main.py',
            packageSource: {
                type: 'local',
                path: './',
                requirements: 'requirements.txt'
            }
        },
        security: {
            permissions: [PluginParameterType.STRING],
            sandboxOptions: {
                allowEval: false,
                timeout: 15000,
                memory: 67108864,
                allowedModules: [
                    'json',
                    'sys',
                    'os',
                    'typing',
                    'requests',
                    'urllib3'
                ],
                allowedAPIs: ['print']
            },
            trust: {
                publisher: 'stage7-examples',
                signature: null
            }
        },
        version: '1.0.0',
        metadata: {
            author: 'Stage7 Development Team',
            tags: ['weather', 'api', 'meteorology', 'openweathermap'],
            category: 'utility',
            license: 'MIT',
            documentation: 'README.md'
        },
        configuration: [
            {
                name: 'api_key',
                type: PluginParameterType.STRING,
                description: 'OpenWeatherMap API key',
                defaultValue: '',
                required: false,
                sensitive: true
            },
            {
                name: 'timeout',
                type: PluginParameterType.NUMBER,
                description: 'API request timeout in milliseconds',
                defaultValue: 15000,
                required: false
            },
            {
                name: 'units',
                type: PluginParameterType.STRING,
                description: 'Temperature units (metric, imperial, kelvin)',
                defaultValue: 'metric',
                required: false
            }
        ],
        createdAt: '2024-12-01T00:00:00Z',
        updatedAt: '2024-12-01T00:00:00Z'
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create mock instances
        capabilitiesManager = new CapabilitiesManager();
        mockPluginExecutorInstance = new PluginExecutor();
        pluginRepositoryManager = new PluginRepositoryManager(
            { owner: 'stage7-examples', repo: 'weather-plugin', token: 'test-token', branch: 'main' },
            mockPluginExecutorInstance
        );

        // Default mocks
        mockPluginExecutor.mockImplementation(() => mockPluginExecutorInstance);
        mockPluginExecutorInstance.execute.mockResolvedValue([]);
        mockPluginExecutorInstance.executeOpenAPITool.mockResolvedValue([]);
        mockPluginExecutorInstance.executeMCPTool.mockResolvedValue([]);

        // Default fs mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');

        // Default path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => '/' + args.join('/'));

        // Default uuid mock
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });

        // Create test plugin directory
        testPluginDir = '/tmp/test-plugins/plugin-WEATHER';
        mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockFs.mkdirSync.mockImplementation((dir) => {
            if (!mockFs.existsSync(dir)) {
                // Create directory structure
                const dirPath = dir.toString();
                const dirs = dirPath.split('/').filter(Boolean);
                let currentPath = '/';
                dirs.forEach(dirName => {
                    currentPath = path.join(currentPath, dirName);
                    if (!mockFs.existsSync(currentPath)) {
                        mockFs.mkdirSync(currentPath);
                    }
                });
            }
        });

        // Create test plugin manifest
        testPluginManifest = { ...realWeatherPluginManifest };
    });

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create mock instances
        capabilitiesManager = new CapabilitiesManager();
        mockPluginExecutorInstance = new PluginExecutor();
        pluginRepositoryManager = new PluginRepositoryManager(
            { owner: 'stage7-examples', repo: 'weather-plugin', token: 'test-token', branch: 'main' },
            mockPluginExecutorInstance
        );

        // Default mocks
        mockPluginExecutor.mockImplementation(() => mockPluginExecutorInstance);
        mockPluginExecutorInstance.execute.mockResolvedValue([]);
        mockPluginExecutorInstance.executeOpenAPITool.mockResolvedValue([]);
        mockPluginExecutorInstance.executeMCPTool.mockResolvedValue([]);

        // Default fs mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');

        // Default path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => '/' + args.join('/'));

        // Default uuid mock
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });

        // Create test plugin directory
        testPluginDir = '/tmp/test-plugins/plugin-WEATHER';
        mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockFs.mkdirSync.mockImplementation((dir) => {
            if (!mockFs.existsSync(dir)) {
                // Create directory structure
                const dirPath = dir.toString();
                const dirs = dirPath.split('/').filter(Boolean);
                let currentPath = '/';
                dirs.forEach(dirName => {
                    currentPath = path.join(currentPath, dirName);
                    if (!mockFs.existsSync(currentPath)) {
                        mockFs.mkdirSync(currentPath);
                    }
                });
            }
        });

        // Create test plugin manifest
        testPluginManifest = { ...realWeatherPluginManifest };
    });

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create mock instances
        capabilitiesManager = new CapabilitiesManager();
        mockPluginExecutorInstance = new PluginExecutor();
        pluginRepositoryManager = new PluginRepositoryManager(
            { owner: 'stage7-examples', repo: 'weather-plugin', token: 'test-token', branch: 'main' },
            mockPluginExecutorInstance
        );

        // Default mocks
        mockPluginExecutor.mockImplementation(() => mockPluginExecutorInstance);
        mockPluginExecutorInstance.execute.mockResolvedValue([]);
        mockPluginExecutorInstance.executeOpenAPITool.mockResolvedValue([]);
        mockPluginExecutorInstance.executeMCPTool.mockResolvedValue([]);

        // Default fs mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');

        // Default path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => '/' + args.join('/'));

        // Default uuid mock
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });

        // Create test plugin directory
        testPluginDir = '/tmp/test-plugins/plugin-WEATHER';
        mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockFs.mkdirSync.mockImplementation((dir) => {
            if (!mockFs.existsSync(dir)) {
                // Create directory structure
                const dirPath = dir.toString();
                const dirs = dirPath.split('/').filter(Boolean);
                let currentPath = '/';
                dirs.forEach(dirName => {
                    currentPath = path.join(currentPath, dirName);
                    if (!mockFs.existsSync(currentPath)) {
                        mockFs.mkdirSync(currentPath);
                    }
                });
            }
        });

        // Create test plugin manifest
        testPluginManifest = { ...realWeatherPluginManifest };
    });

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create mock instances
        capabilitiesManager = new CapabilitiesManager();
        mockPluginExecutorInstance = new PluginExecutor();
        pluginRepositoryManager = new PluginRepositoryManager(
            { owner: 'stage7-examples', repo: 'weather-plugin', token: 'test-token', branch: 'main' },
            mockPluginExecutorInstance
        );

        // Default mocks
        mockPluginExecutor.mockImplementation(() => mockPluginExecutorInstance);
        mockPluginExecutorInstance.execute.mockResolvedValue([]);
        mockPluginExecutorInstance.executeOpenAPITool.mockResolvedValue([]);
        mockPluginExecutorInstance.executeMCPTool.mockResolvedValue([]);

        // Default fs mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');

        // Default path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => '/' + args.join('/'));

        // Default uuid mock
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });

        // Create test plugin directory
        testPluginDir = '/tmp/test-plugins/plugin-WEATHER';
        mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockFs.mkdirSync.mockImplementation((dir) => {
            if (!mockFs.existsSync(dir)) {
                // Create directory structure
                const dirPath = dir.toString();
                const dirs = dirPath.split('/').filter(Boolean);
                let currentPath = '/';
                dirs.forEach(dirName => {
                    currentPath = path.join(currentPath, dirName);
                    if (!mockFs.existsSync(currentPath)) {
                        mockFs.mkdirSync(currentPath);
                    }
                });
            }
        });

        // Create test plugin manifest
        testPluginManifest = { ...realWeatherPluginManifest };
    });

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create mock instances
        capabilitiesManager = new CapabilitiesManager();
        mockPluginExecutorInstance = new PluginExecutor();
        pluginRepositoryManager = new PluginRepositoryManager(
            { owner: 'stage7-examples', repo: 'weather-plugin', token: 'test-token', branch: 'main' },
            mockPluginExecutorInstance
        );

        // Default mocks
        mockPluginExecutor.mockImplementation(() => mockPluginExecutorInstance);
        mockPluginExecutorInstance.execute.mockResolvedValue([]);
        mockPluginExecutorInstance.executeOpenAPITool.mockResolvedValue([]);
        mockPluginExecutorInstance.executeMCPTool.mockResolvedValue([]);

        // Default fs mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');

        // Default path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => '/' + args.join('/'));

        // Default uuid mock
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });

        // Create test plugin directory
        testPluginDir = '/tmp/test-plugins/plugin-WEATHER';
        mockFs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockFs.mkdirSync.mockImplementation((dir) => {
            if (!mockFs.existsSync(dir)) {
                // Create directory structure
                const dirPath = dir.toString();
                const dirs = dirPath.split('/').filter(Boolean);
                let currentPath = '/';
                dirs.forEach(dirName => {
                    currentPath = path.join(currentPath, dirName);
                    if (!mockFs.existsSync(currentPath)) {
                        mockFs.mkdirSync(currentPath);
                    }
                });
            }
        });

        // Create test plugin manifest
        testPluginManifest = { ...realWeatherPluginManifest };
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock instances
        capabilitiesManager = new CapabilitiesManager();
        mockPluginExecutorInstance = new PluginExecutor();
        pluginRepositoryManager = new PluginRepositoryManager(
            { owner: 'stage7-examples', repo: 'weather-plugin', token: 'test-token', branch: 'main' },
            mockPluginExecutorInstance
        );

        // Default mocks
        mockPluginExecutor.mockImplementation(() => mockPluginExecutorInstance);
        mockPluginExecutorInstance.execute.mockResolvedValue([]);
        mockPluginExecutorInstance.executeOpenAPITool.mockResolvedValue([]);
        mockPluginExecutorInstance.executeMCPTool.mockResolvedValue([]);

        // Default fs mocks
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');

        // Default path mocks
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => '/' + args.join('/'));

        // Default uuid mock
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });
    });

    describe('Weather Plugin Discovery', () => {
        it('should discover weather plugin from GitHub repository', async () => {
            // Mock GitHub API response with plugin registry
            const mockRegistry = [{
                id: 'plugin-WEATHER',
                name: 'Weather Plugin',
                version: '1.0.0',
                description: 'Fetches current weather information',
                author: 'Stage7 Development Team',
                category: 'utility',
                tags: ['weather', 'api', 'meteorology', 'openweathermap'],
                downloadUrl: 'https://github.com/stage7-examples/weather-plugin/releases/download/v1.0.0/plugin-WEATHER-1.0.0.s7pkg',
                packageHash: 'mock-hash',
                createdAt: '2024-12-01T00:00:00Z',
                updatedAt: '2024-12-01T00:00:00Z',
                compatibility: ['1.0.0'],
                verified: true
            }];

            jest.spyOn(pluginRepositoryManager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);

            const plugins = await pluginRepositoryManager.listPlugins();

            expect(plugins).toHaveLength(1);
            expect(plugins[0].id).toBe('plugin-WEATHER');
            expect(plugins[0].name).toBe('Weather Plugin');
            expect(plugins[0].version).toBe('1.0.0');
            expect(plugins[0].downloadUrl).toContain('plugin-WEATHER-1.0.0.s7pkg');
        });

        it('should search for weather-related plugins', async () => {
            const mockRegistry = [
                {
                    id: 'plugin-WEATHER',
                    name: 'Weather Plugin',
                    version: '1.0.0',
                    description: 'Fetches current weather information',
                    author: 'Stage7 Development Team',
                    category: 'utility',
                    tags: ['weather', 'api', 'meteorology', 'openweathermap'],
                    downloadUrl: 'https://github.com/stage7-examples/weather-plugin/releases/download/v1.0.0/plugin-WEATHER-1.0.0.s7pkg',
                    packageHash: 'mock-hash',
                    createdAt: '2024-12-01T00:00:00Z',
                    updatedAt: '2024-12-01T00:00:00Z',
                    compatibility: ['1.0.0'],
                    verified: true
                },
                {
                    id: 'plugin-FORECAST',
                    name: 'Weather Forecast',
                    version: '1.0.0',
                    description: 'Provides weather forecast',
                    author: 'Stage7 Development Team',
                    category: 'utility',
                    tags: ['weather', 'forecast', 'api'],
                    downloadUrl: 'https://github.com/stage7-examples/weather-plugin/releases/download/v1.0.0/plugin-FORECAST-1.0.0.s7pkg',
                    packageHash: 'mock-hash',
                    createdAt: '2024-12-01T00:00:00Z',
                    updatedAt: '2024-12-01T00:00:00Z',
                    compatibility: ['1.0.0'],
                    verified: true
                }
            ];

            jest.spyOn(pluginRepositoryManager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);

            const weatherPlugins = await pluginRepositoryManager.searchPlugins('weather');

            expect(weatherPlugins).toHaveLength(2);
            expect(weatherPlugins[0].id).toBe('plugin-WEATHER');
            expect(weatherPlugins[1].id).toBe('plugin-FORECAST');
        });

        it('should filter weather plugins by category', async () => {
            const mockRegistry = [
                {
                    id: 'plugin-WEATHER',
                    name: 'Weather Plugin',
                    version: '1.0.0',
                    description: 'Fetches current weather information',
                    author: 'Stage7 Development Team',
                    category: 'utility',
                    tags: ['weather', 'api', 'meteorology', 'openweathermap'],
                    downloadUrl: 'https://github.com/stage7-examples/weather-plugin/releases/download/v1.0.0/plugin-WEATHER-1.0.0.s7pkg',
                    packageHash: 'mock-hash',
                    createdAt: '2024-12-01T00:00:00Z',
                    updatedAt: '2024-12-01T00:00:00Z',
                    compatibility: ['1.0.0'],
                    verified: true
                },
                {
                    id: 'plugin-ANALYTICS',
                    name: 'Analytics Plugin',
                    version: '1.0.0',
                    description: 'Data analytics',
                    author: 'Stage7 Development Team',
                    category: 'analytics',
                    tags: ['data', 'analytics'],
                    downloadUrl: 'https://github.com/stage7-examples/analytics-plugin/releases/download/v1.0.0/plugin-ANALYTICS-1.0.0.s7pkg',
                    packageHash: 'mock-hash',
                    createdAt: '2024-12-01T00:00:00Z',
                    updatedAt: '2024-12-01T00:00:00Z',
                    compatibility: ['1.0.0'],
                    verified: true
                }
            ];

            jest.spyOn(pluginRepositoryManager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);

            const utilityPlugins = await pluginRepositoryManager.listPlugins('utility');

            expect(utilityPlugins).toHaveLength(1);
            expect(utilityPlugins[0].id).toBe('plugin-WEATHER');
        });
    });

    describe('Weather Plugin Installation', () => {
        it('should install weather plugin successfully', async () => {
            const mockRegistryEntry = {
                id: 'plugin-WEATHER',
                name: 'Weather Plugin',
                version: '1.0.0',
                description: 'Fetches current weather information',
                author: 'Stage7 Development Team',
                category: 'utility',
                tags: ['weather', 'api', 'meteorology', 'openweathermap'],
                downloadUrl: 'https://github.com/stage7-examples/weather-plugin/releases/download/v1.0.0/plugin-WEATHER-1.0.0.s7pkg',
                packageHash: 'mock-hash',
                createdAt: '2024-12-01T00:00:00Z',
                updatedAt: '2024-12-01T00:00:00Z',
                compatibility: ['1.0.0'],
                verified: true
            };

            jest.spyOn(pluginRepositoryManager as any, 'getPluginRegistry').mockResolvedValue([mockRegistryEntry]);
            jest.spyOn(pluginRepositoryManager as any, 'downloadPackage').mockResolvedValue('/tmp/plugin-WEATHER-1.0.0.s7pkg');
            mockPluginExecutorInstance.unpackPlugin.mockResolvedValue(mockWeatherPluginManifest);
            mockPluginExecutorInstance.installDependencies.mockResolvedValue(undefined);

            const result = await pluginRepositoryManager.installPlugin('plugin-WEATHER', '1.0.0');

            expect(result).toEqual(mockWeatherPluginManifest);
            expect((pluginRepositoryManager as any).downloadPackage).toHaveBeenCalledWith(mockRegistryEntry);
            expect(mockPluginExecutorInstance.unpackPlugin).toHaveBeenCalledWith('/tmp/plugin-WEATHER-1.0.0.s7pkg', expect.stringContaining('/plugins/plugin-WEATHER'));
            expect(mockPluginExecutorInstance.installDependencies).toHaveBeenCalledWith(expect.stringContaining('/plugins/plugin-WEATHER'));
            expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/plugin-WEATHER-1.0.0.s7pkg');
        });

        it('should install latest version of weather plugin if no version specified', async () => {
            const oldEntry = { ...mockRegistryEntry, version: '0.9.0', updatedAt: new Date(0).toISOString() };
            const latestEntry = { ...mockRegistryEntry, version: '1.0.0', updatedAt: new Date().toISOString() };

            jest.spyOn(pluginRepositoryManager as any, 'getPluginRegistry').mockResolvedValue([oldEntry, latestEntry]);
            jest.spyOn(pluginRepositoryManager as any, 'downloadPackage').mockResolvedValue('/tmp/plugin-WEATHER-1.0.0.s7pkg');
            mockPluginExecutorInstance.unpackPlugin.mockResolvedValue(mockWeatherPluginManifest);
            mockPluginExecutorInstance.installDependencies.mockResolvedValue(undefined);

            await pluginRepositoryManager.installPlugin('plugin-WEATHER');

            expect((pluginRepositoryManager as any).downloadPackage).toHaveBeenCalledWith(latestEntry);
        });

        it('should handle installation errors gracefully', async () => {
            const mockRegistryEntry = {
                id: 'plugin-WEATHER',
                name: 'Weather Plugin',
                version: '1.0.0',
                description: 'Fetches current weather information',
                author: 'Stage7 Development Team',
                category: 'utility',
                tags: ['weather', 'api', 'meteorology', 'openweathermap'],
                downloadPackageUrl: 'https://github.com/stage7-examples/weather-plugin/releases/download/v1.0.0/plugin-WEATHER-1.0.0.s7pkg',
                packageHash: 'mock-hash',
                createdAt: '2024-12-01T00:00:00Z',
                updatedAt: '2024-12-01T00:00:00Z',
                compatibility: ['1.0.0'],
                verified: true
            };

            jest.spyOn(pluginRepositoryManager as any, 'getPluginRegistry').mockResolvedValue([mockRegistryEntry]);
            jest.spyOn(pluginRepositoryManager as any, 'downloadPackage').mockRejectedValue(new Error('Download failed'));

            await expect(pluginRepositoryManager.installPlugin('plugin-WEATHER', '1.0.0')).rejects.toThrow('Download failed');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to install plugin'), expect.any(Error));
        });
    });

    describe('Weather Plugin Execution', () => {
        it('should execute weather plugin with valid inputs', async () => {
            const mockInputs = {
                location: 'New York',
                api_key: 'test-key'
            };

            // Mock plugin execution
            mockPluginExecutorInstance.execute.mockResolvedValue([
                {
                    name: 'weather_data',
                    success: true,
                    resultType: 'object',
                    result: {
                        temperature: 22,
                        humidity: 65,
                        pressure: 1013,
                        wind_speed: 5.5
                    },
                    resultDescription: 'Weather data for New York'
                },
                {
                    name: 'summary',
                    success: true,
                    resultType: 'string',
                    result: 'Partly cloudy with a chance of rain',
                    resultDescription: 'Weather summary'
                }
            ]);

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: true,
                resultType: 'object',
                result: {
                    weather_data: {
                        temperature: 22,
                        humidity: 65,
                        pressure: 1013,
                        wind_speed: 5.5
                    },
                    summary: 'Partly cloudy with a chance of rain'
                }
            });
        });

        it('should handle missing required location input', async () => {
            const mockInputs = {
                api_key: 'test-key'
            };

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: false,
                error: 'Missing required input: location'
            });
        });

        it('should handle plugin execution errors', async () => {
            const mockInputs = {
                location: 'New York',
                api_key: 'test-key'
            };

            mockPluginExecutorInstance.execute.mockRejectedValue(new Error('API request failed'));

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: false,
                error: 'Plugin execution failed: API request failed'
            });
        });
    });

    describe('Weather Plugin Configuration', () => {
        it('should use default configuration values', async () => {
            const mockInputs = {
                location: 'London'
            };

            // Mock plugin execution with default config
            mockPluginExecutorInstance.execute.mockResolvedValue([
                {
                    name: 'weather_data',
                    success: true,
                    resultType: 'object',
                    result: { temperature: 15 },
                    resultDescription: 'Weather data'
                },
                {
                    name: 'summary',
                    success: true,
                    resultType: 'string',
                    result: 'Cool and cloudy',
                    resultDescription: 'Weather summary'
                }
            ]);

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            // Verify that default config values were used
            expect(mockPluginExecutorInstance.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    configuration: {
                        api_key: '',
                        timeout: 15000,
                        units: 'metric'
                    }
                })
            );
        });

        it('should override default configuration with provided values', async () => {
            const mockInputs = {
                location: 'Tokyo',
                units: 'imperial'
            };

            mockPluginExecutorInstance.execute.mockResolvedValue([
                {
                    name: 'weather_data',
                    success: true,
                    resultType: 'object',
                    result: { temperature: 70 },
                    resultDescription: 'Weather data'
                },
                {
                    name: 'summary',
                    success: true,
                    resultType: 'string',
                    result: 'Warm and sunny',
                    resultDescription: 'Weather summary'
                }
            ]);

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockPluginExecutorInstance.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    configuration: {
                        api_key: '',
                        timeout: 15000,
                        units: 'imperial' // Overridden value
                    }
                })
            );
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle plugin not found error', async () => {
            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue(null);

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: { location: 'Paris' }
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: false,
                error: 'Plugin not found for action verb: WEATHER'
            });
        });

        it('should handle invalid plugin manifest', async () => {
            const invalidManifest = { ...mockWeatherPluginManifest, inputDefinitions: null };

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: invalidManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: { location: 'Berlin' }
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: false,
                error: 'Invalid plugin manifest'
            });
        });

        it('should handle timeout during plugin execution', async () => {
            const mockInputs = {
                location: 'Sydney'
            };

            mockPluginExecutorInstance.execute.mockRejectedValue(new Error('Timeout exceeded'));

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(504);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: false,
                error: 'Plugin execution timeout'
            });
        });

        it('should handle memory limit exceeded', async () => {
            const mockInputs = {
                location: 'Mumbai'
            };

            mockPluginExecutorInstance.execute.mockRejectedValue(new Error('Memory limit exceeded'));

            jest.spyOn(capabilitiesManager as any, 'getHandlerForActionVerb').mockResolvedValue({
                type: 'plugin',
                handler: mockWeatherPluginManifest
            });

            const mockReq = {
                body: {
                    step: {
                        actionVerb: 'WEATHER',
                        inputs: mockInputs
                    }
                }
            } as any;

            const mockRes = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            } as any;

            await (capabilitiesManager as any).executeActionVerb(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith({
                success: false,
                error: 'Plugin execution failed: Memory limit exceeded'
            });
        });
    });
});

// Helper function to create a generic plugin manifest for testing
function createGenericPluginManifest(verb: string, id: string = `plugin-${verb}`): PluginManifest {
    return {
        id,
        verb,
        description: `Handles ${verb} operations`,
        explanation: `This plugin handles ${verb} operations`,
        inputGuidance: 'Inputs for this plugin must include required fields.',
        repository: { type: 'github' },
        inputDefinitions: [
            {
                name: 'required_field',
                required: true,
                type: 'string',
                description: 'A required field'
            },
            {
                name: 'optional_field',
                required: false,
                type: 'string',
                description: 'An optional field'
            }
        ],
        outputDefinitions: [
            {
                name: 'result',
                required: true,
                type: 'object',
                description: 'The result of the operation'
            }
        ],
        language: 'python',
        entryPoint: {
            main: 'main.py',
            packageSource: {
                type: 'local',
                path: './',
                requirements: 'requirements.txt'
            }
        },
        security: {
            permissions: ['net.fetch'],
            sandboxOptions: {
                allowEval: false,
                timeout: 15000,
                memory: 67108864,
                allowedModules: ['json', 'sys', 'os', 'typing', 'requests', 'urllib3'],
                allowedAPIs: ['print']
            },
            trust: {
                publisher: 'test-publisher',
                signature: null
            }
        },
        version: '1.0.0',
        metadata: {
            author: 'Test Team',
            tags: ['test', 'plugin'],
            category: 'utility',
            license: 'MIT',
            documentation: 'README.md'
        },
        configuration: [
            {
                name: 'timeout',
                type: 'number',
                description: 'API request timeout in milliseconds',
                defaultValue: 15000,
                required: false
            }
        ],
        createdAt: '2024-12-01T00:00:00Z',
        updatedAt: '2024-12-01T00:00:00Z'
    };
}

// Export helper for use in other test files
export { createGenericPluginManifest };