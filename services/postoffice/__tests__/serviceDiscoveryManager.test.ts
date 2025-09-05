import { ServiceDiscoveryManager } from '../src/serviceDiscoveryManager';
import { Component } from '../src/types/Component';

// Mock external dependencies
describe('ServiceDiscoveryManager', () => {
    let manager: ServiceDiscoveryManager;
    let mockComponents: Map<string, Component>;
    let mockComponentsByType: Map<string, Set<string>>;
    let mockServiceDiscovery: any;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        mockComponents = new Map();
        mockComponentsByType = new Map();

        mockServiceDiscovery = {
            discoverService: jest.fn(),
            registerService: jest.fn().mockResolvedValue(undefined),
        };

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        manager = new ServiceDiscoveryManager(
            mockComponents,
            mockComponentsByType,
            mockServiceDiscovery
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided dependencies', () => {
            expect((manager as any).components).toBe(mockComponents);
            expect((manager as any).componentsByType).toBe(mockComponentsByType);
            expect((manager as any).serviceDiscovery).toBe(mockServiceDiscovery);
        });
    });

    describe('discoverService', () => {
        const SERVICE_TYPE = 'TestService';
        const MOCK_CONSUL_URL = 'http://consul-discovered:1234';
        const MOCK_ENV_URL = 'http://env-discovered:5678';
        const MOCK_LOCAL_URL = 'http://local-registered:9012';

        it('should discover service via Consul if available', async () => {
            mockServiceDiscovery.discoverService.mockResolvedValueOnce(MOCK_CONSUL_URL);

            const url = await manager.discoverService(SERVICE_TYPE);

            expect(mockServiceDiscovery.discoverService).toHaveBeenCalledWith(SERVICE_TYPE);
            expect(url).toBe(MOCK_CONSUL_URL);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Service ${SERVICE_TYPE} discovered via Consul`));
        });

        it('should fall back to environment variable if Consul discovery fails', async () => {
            mockServiceDiscovery.discoverService.mockResolvedValueOnce(undefined); // Consul fails to find
            process.env.TESTSERVICE_URL = MOCK_ENV_URL;

            const url = await manager.discoverService(SERVICE_TYPE);

            expect(url).toBe(MOCK_ENV_URL);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Service ${SERVICE_TYPE} found via environment variable`));
        });

        it('should fall back to local registry if env var not found', async () => {
            mockServiceDiscovery.discoverService.mockResolvedValueOnce(undefined);
            delete process.env.TESTSERVICE_URL;

            mockComponents.set('local-id', { id: 'local-id', type: SERVICE_TYPE, url: MOCK_LOCAL_URL });
            mockComponentsByType.set(SERVICE_TYPE, new Set(['local-id']));

            const url = await manager.discoverService(SERVICE_TYPE);

            expect(url).toBe(MOCK_LOCAL_URL);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Service ${SERVICE_TYPE} found in local registry`));
        });

        it('should return undefined if service not found in any registry', async () => {
            mockServiceDiscovery.discoverService.mockResolvedValueOnce(undefined);
            delete process.env.TESTSERVICE_URL;

            const url = await manager.discoverService(SERVICE_TYPE);

            expect(url).toBeUndefined();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Service ${SERVICE_TYPE} not found in any registry`));
        });

        it('should log error if Consul discovery throws an error', async () => {
            mockServiceDiscovery.discoverService.mockRejectedValueOnce(new Error('Consul error'));
            delete process.env.TESTSERVICE_URL;

            const url = await manager.discoverService(SERVICE_TYPE);

            expect(url).toBeUndefined(); // Falls back to undefined after logging error
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error discovering service ${SERVICE_TYPE} via Consul`), expect.any(Error));
        });

        it('should warn if serviceDiscovery is not initialized', async () => {
            (manager as any).serviceDiscovery = null; // Simulate uninitialized
            delete process.env.TESTSERVICE_URL;

            const url = await manager.discoverService(SERVICE_TYPE);

            expect(url).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith('Service discovery not initialized, falling back to environment variables');
        });
    });

    describe('registerComponent', () => {
        const COMPONENT_ID = 'comp-id';
        const COMPONENT_TYPE = 'CompType';
        const COMPONENT_URL = 'http://comp:8080';

        it('should register component in local registry', async () => {
            await manager.registerComponent(COMPONENT_ID, COMPONENT_TYPE, COMPONENT_URL);

            expect(mockComponents.get(COMPONENT_ID)).toEqual({ id: COMPONENT_ID, type: COMPONENT_TYPE, url: COMPONENT_URL });
            expect(mockComponentsByType.get(COMPONENT_TYPE)?.has(COMPONENT_ID)).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Component registered in local registry'));
        });

        it('should also register with Consul if serviceDiscovery is available', async () => {
            await manager.registerComponent(COMPONENT_ID, COMPONENT_TYPE, COMPONENT_URL);

            expect(mockServiceDiscovery.registerService).toHaveBeenCalledWith(
                COMPONENT_ID,
                COMPONENT_TYPE,
                COMPONENT_URL,
                [COMPONENT_TYPE.toLowerCase()],
                8080 // Port extracted from URL
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Component also registered with Consul'));
        });

        it('should handle Consul registration errors gracefully', async () => {
            mockServiceDiscovery.registerService.mockRejectedValueOnce(new Error('Consul registration failed'));

            await manager.registerComponent(COMPONENT_ID, COMPONENT_TYPE, COMPONENT_URL);

            expect(mockComponents.get(COMPONENT_ID)).toBeDefined(); // Still registered locally
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Failed to register component ${COMPONENT_ID} with Consul`), expect.any(Error));
        });

        it('should throw error if local registration fails', async () => {
            // Simulate an error during local registration (e.g., components map throws)
            mockComponents.set = jest.fn(() => { throw new Error('Local map error'); });

            await expect(manager.registerComponent(COMPONENT_ID, COMPONENT_TYPE, COMPONENT_URL)).rejects.toThrow('Local map error');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Failed to register component ${COMPONENT_ID}`), expect.any(Error));
        });
    });

    describe('getComponentUrl', () => {
        const COMPONENT_ID = 'comp-id';
        const COMPONENT_TYPE = 'CompType';
        const COMPONENT_URL = 'http://comp:8080';

        beforeEach(() => {
            mockComponents.set(COMPONENT_ID, { id: COMPONENT_ID, type: COMPONENT_TYPE, url: COMPONENT_URL });
            mockComponentsByType.set(COMPONENT_TYPE, new Set([COMPONENT_ID]));
        });

        it('should return component URL from local registry', () => {
            const url = manager.getComponentUrl(COMPONENT_TYPE);
            expect(url).toBe(COMPONENT_URL);
        });

        it('should return undefined if component type not found', () => {
            const url = manager.getComponentUrl('NonExistentType');
            expect(url).toBeUndefined();
        });

        it('should return undefined if no components of that type', () => {
            mockComponentsByType.set(COMPONENT_TYPE, new Set()); // Empty set
            const url = manager.getComponentUrl(COMPONENT_TYPE);
            expect(url).toBeUndefined();
        });
    });

    describe('getServices', () => {
        const MOCK_CAPABILITIES_URL = 'http://cap:5060';
        const MOCK_BRAIN_URL = 'http://brain:5070';

        beforeEach(() => {
            // Simulate some components registered locally
            mockComponents.set('cap-id', { id: 'cap-id', type: 'CapabilitiesManager', url: MOCK_CAPABILITIES_URL });
            mockComponentsByType.set('CapabilitiesManager', new Set(['cap-id']));

            // Simulate some env vars
            process.env.BRAIN_URL = MOCK_BRAIN_URL;
        });

        it('should return service URLs from local registry, then env, then default', () => {
            const services = manager.getServices();

            expect(services).toEqual({
                capabilitiesManagerUrl: MOCK_CAPABILITIES_URL, // From local registry
                brainUrl: MOCK_BRAIN_URL, // From env
                trafficManagerUrl: 'trafficmanager:5080', // From default
                librarianUrl: 'librarian:5040',
                missionControlUrl: 'missioncontrol:5030',
                engineerUrl: 'engineer:5050',
            });
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Service URLs:'));
        });

        it('should use default URLs if no local or env override', () => {
            mockComponents.clear();
            mockComponentsByType.clear();
            delete process.env.BRAIN_URL;

            const services = manager.getServices();

            expect(services).toEqual({
                capabilitiesManagerUrl: 'capabilitiesmanager:5060',
                brainUrl: 'brain:5070',
                trafficManagerUrl: 'trafficmanager:5080',
                librarianUrl: 'librarian:5040',
                missionControlUrl: 'missioncontrol:5030',
                engineerUrl: 'engineer:5050',
            });
        });
    });
});
