import { ConfigManager } from '../src/utils/configManager';
import { createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('@cktmcs/shared', () => ({
    createAuthenticatedAxios: jest.fn(() => ({
        get: jest.fn(),
        post: jest.fn(),
    })),
    // Keep original for types if needed, or mock specific types
    // For now, assuming types are imported and not directly mocked
}));
jest.mock('@cktmcs/errorhandler', () => ({
    analyzeError: jest.fn(),
}));

const mockAuthenticatedApi = {
    get: jest.fn(),
    post: jest.fn(),
};

// Mock the internal implementation of createAuthenticatedAxios to return our mock
(createAuthenticatedAxios as jest.Mock).mockReturnValue(mockAuthenticatedApi);

describe('ConfigManager', () => {
    const MOCK_LIBRARIAN_URL = 'http://mock-librarian:5000';
    let configManager: ConfigManager;

    // Clear all mocks before each test to ensure isolation
    beforeEach(async () => {
        jest.clearAllMocks();
        // Reset the singleton instance before each test
        // This is crucial for testing initialize() and getInstance() properly
        (ConfigManager as any).instance = undefined;

        // Initialize ConfigManager for most tests
        configManager = await ConfigManager.initialize(MOCK_LIBRARIAN_URL);
    });

    describe('initialize', () => {
        it('should initialize the ConfigManager and return an instance', async () => {
            expect(configManager).toBeInstanceOf(ConfigManager);
            expect(createAuthenticatedAxios).toHaveBeenCalledWith(
                'CapabilitiesManagerConfig',
                process.env.SECURITYMANAGER_URL || 'securitymanager:5010',
                process.env.CLIENT_SECRET || 'stage7AuthSecret'
            );
        });

        it('should return the same instance on subsequent calls (singleton)', async () => {
            const secondInstance = await ConfigManager.initialize(MOCK_LIBRARIAN_URL);
            expect(secondInstance).toBe(configManager);
            expect(createAuthenticatedAxios).toHaveBeenCalledTimes(1); // Should only be called once
        });
    });

    describe('getInstance', () => {
        it('should return the initialized instance', () => {
            const instance = ConfigManager.getInstance();
            expect(instance).toBe(configManager);
        });

        it('should throw an error if not initialized', () => {
            (ConfigManager as any).instance = undefined; // Reset instance
            expect(() => ConfigManager.getInstance()).toThrow('ConfigManager not initialized. Call initialize() first.');
        });
    });

    describe('loadConfig (private method, tested via public methods)', () => {
        // Test cases for loadConfig will be covered by testing getEnvironmentVariable, etc.
        // We need to mock the authenticatedApi.get response for these tests.

        it('should load config from Librarian on first access of an environment variable', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({
                data: {
                    data: {
                        environment: { TEST_VAR: 'test_value' },
                        pluginConfigurations: {},
                        pluginMetadata: {}
                    }
                }
            });

            const value = await configManager.getEnvironmentVariable('TEST_VAR');

            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
                `http://${MOCK_LIBRARIAN_URL}/loadData/capabilitiesmanager`,
                expect.objectContaining({
                    params: {
                        storageType: 'mongo',
                        collection: 'configurations'
                    }
                })
            );
            expect(value).toBe('test_value');
        });

        it('should handle 404 response from Librarian gracefully', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce({
                isAxiosError: true,
                response: { status: 404 }
            });
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            const value = await configManager.getEnvironmentVariable('NON_EXISTENT_VAR');

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No existing configuration found'));
            expect(value).toBeUndefined();
            consoleLogSpy.mockRestore();
        });

        it('should call analyzeError and log error for other load failures', async () => {
            const mockError = new Error('Network error');
            mockAuthenticatedApi.get.mockRejectedValueOnce(mockError);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await configManager.getEnvironmentVariable('ANY_VAR');

            expect(analyzeError).toHaveBeenCalledWith(mockError);
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error loading config from Librarian:', mockError.message);
            consoleErrorSpy.mockRestore();
        });
    });

    describe('getPluginConfig and updatePluginConfig', () => {
        it('should return an empty array if no plugin config exists', async () => {
            const config = await configManager.getPluginConfig('non-existent-plugin');
            expect(config).toEqual([]);
        });

        it('should update and retrieve plugin config', async () => {
            const mockConfig = [{ key: 'setting1', value: 'value1' }];
            await configManager.updatePluginConfig('test-plugin', mockConfig as any); // Cast to any for simplified mock type

            const retrievedConfig = await configManager.getPluginConfig('test-plugin');
            expect(retrievedConfig).toEqual(mockConfig);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(1); // saveConfig called
        });
    });

    describe('getPluginMetadata and updatePluginMetadata', () => {
        it('should return undefined if no plugin metadata exists', async () => {
            const metadata = await configManager.getPluginMetadata('non-existent-plugin');
            expect(metadata).toBeUndefined();
        });

        it('should update and retrieve plugin metadata', async () => {
            const mockMetadata = { usageCount: 5, version: '1.0.0' };
            await configManager.updatePluginMetadata('test-plugin', mockMetadata as any);

            const retrievedMetadata = await configManager.getPluginMetadata('test-plugin');
            expect(retrievedMetadata).toEqual(expect.objectContaining(mockMetadata));
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(1); // saveConfig called
        });

        it('should merge partial metadata updates', async () => {
            await configManager.updatePluginMetadata('test-plugin', { version: '1.0.0' } as any);
            await configManager.updatePluginMetadata('test-plugin', { usageCount: 10 } as any);

            const retrievedMetadata = await configManager.getPluginMetadata('test-plugin');
            expect(retrievedMetadata).toEqual(expect.objectContaining({ version: '1.0.0', usageCount: 10 }));
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(2); // saveConfig called twice
        });
    });

    describe('recordPluginUsage', () => {
        it('should increment usageCount and set lastUsed for existing metadata', async () => {
            await configManager.updatePluginMetadata('test-plugin', { usageCount: 0 } as any);
            mockAuthenticatedApi.post.mockClear(); // Clear post calls from initial metadata update

            await configManager.recordPluginUsage('test-plugin');

            const metadata = await configManager.getPluginMetadata('test-plugin');
            expect(metadata?.usageCount).toBe(1);
            expect(metadata?.lastUsed).toBeInstanceOf(Date);
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(1); // saveConfig called
        });

        it('should initialize metadata if not present and record usage', async () => {
            mockAuthenticatedApi.post.mockClear(); // Clear any previous post calls

            await configManager.recordPluginUsage('new-plugin');

            const metadata = await configManager.getPluginMetadata('new-plugin');
            expect(metadata?.usageCount).toBe(1);
            expect(metadata?.lastUsed).toBeInstanceOf(Date);
            expect(metadata?.category).toEqual([]);
            expect(metadata?.tags).toEqual([]);
            expect(metadata?.complexity).toBe(1);
            expect(metadata?.dependencies).toEqual({});
            expect(metadata?.version).toBe('1.0.0');
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(1); // saveConfig called
        });
    });

    describe('setEnvironmentVariable and getEnvironmentVariable', () => {
        it('should set and retrieve an environment variable', async () => {
            await configManager.setEnvironmentVariable('MY_ENV_VAR', 'my_value');
            const value = await configManager.getEnvironmentVariable('MY_ENV_VAR');

            expect(value).toBe('my_value');
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(1); // saveConfig called
        });

        it('should return undefined for a non-existent environment variable', async () => {
            const value = await configManager.getEnvironmentVariable('NON_EXISTENT_ENV_VAR');
            expect(value).toBeUndefined();
        });
    });

    describe('ensurePluginMetadata', () => {
        it('should initialize metadata if not present', async () => {
            mockAuthenticatedApi.post.mockClear(); // Clear any previous post calls

            await configManager.ensurePluginMetadata('another-new-plugin');

            const metadata = await configManager.getPluginMetadata('another-new-plugin');
            expect(metadata).toEqual({
                category: [],
                tags: [],
                complexity: 1,
                dependencies: {},
                version: '1.0.0',
                usageCount: 0
            });
            expect(mockAuthenticatedApi.post).toHaveBeenCalledTimes(1); // saveConfig called
        });

        it('should not modify existing metadata', async () => {
            const existingMetadata = { usageCount: 10, version: '2.0.0', customField: 'abc' };
            await configManager.updatePluginMetadata('existing-plugin', existingMetadata as any);
            mockAuthenticatedApi.post.mockClear(); // Clear post calls from initial update

            await configManager.ensurePluginMetadata('existing-plugin');

            const metadata = await configManager.getPluginMetadata('existing-plugin');
            expect(metadata).toEqual(expect.objectContaining(existingMetadata));
            expect(mockAuthenticatedApi.post).not.toHaveBeenCalled(); // saveConfig not called
        });
    });
});
