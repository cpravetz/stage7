import { ServiceDiscovery } from '../src/discovery/serviceDiscovery';
import { createAuthenticatedAxios } from '../src/http/createAuthenticatedAxios';
import axios from 'axios';

// Mock external dependencies
jest.mock('../src/http/createAuthenticatedAxios');
jest.mock('axios');

// Cast mocked functions
const mockCreateAuthenticatedAxios = createAuthenticatedAxios as jest.Mock;
const mockAxios = axios as jest.MockedFunction<typeof axios>;

describe('ServiceDiscovery', () => {
    let serviceDiscovery: ServiceDiscovery;
    let mockAuthenticatedApi: any;

    const MOCK_CONSUL_URL = 'consul:8500';
    const MOCK_SECURITY_MANAGER_URL = 'securitymanager:5010';
    const MOCK_CLIENT_SECRET = 'stage7AuthSecret';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // Enable fake timers for cache TTL

        // Mock the authenticated API client
        mockAuthenticatedApi = {
            get: jest.fn().mockResolvedValue({ data: [] }),
            put: jest.fn().mockResolvedValue({}),
        };
        mockCreateAuthenticatedAxios.mockReturnValue(mockAuthenticatedApi);

        // Set process.env variables
        process.env.CONSUL_URL = MOCK_CONSUL_URL;
        process.env.SECURITYMANAGER_URL = MOCK_SECURITY_MANAGER_URL;
        process.env.CLIENT_SECRET = MOCK_CLIENT_SECRET;
        process.env.POSTOFFICE_URL = 'postoffice:5020';

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        serviceDiscovery = new ServiceDiscovery();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();

        // Clean up process.env changes
        delete process.env.CONSUL_URL;
        delete process.env.SECURITYMANAGER_URL;
        delete process.env.CLIENT_SECRET;
        delete process.env.POSTOFFICE_URL;
    });

    describe('constructor', () => {
        it('should initialize with provided Consul URL', () => {
            const customConsulUrl = 'myconsul:8080';
            const sd = new ServiceDiscovery(customConsulUrl);
            expect((sd as any).consulUrl).toBe(customConsulUrl);
            expect(mockCreateAuthenticatedAxios).toHaveBeenCalledWith(
                'ServiceDiscovery',
                MOCK_SECURITY_MANAGER_URL,
                MOCK_CLIENT_SECRET
            );
        });

        it('should use process.env.CONSUL_URL if available', () => {
            expect((serviceDiscovery as any).consulUrl).toBe(MOCK_CONSUL_URL);
        });

        it('should use default Consul URL if no env var or provided', () => {
            delete process.env.CONSUL_URL;
            const sd = new ServiceDiscovery();
            expect((sd as any).consulUrl).toBe('consul:8500');
        });
    });

    describe('registerService', () => {
        it('should register a service with Consul', async () => {
            const serviceId = 'test-service';
            const serviceName = 'TestService';
            const serviceUrl = 'http://localhost:3000';
            const tags = ['api', 'v1'];
            const port = 3000;

            await serviceDiscovery.registerService(serviceId, serviceName, serviceUrl, tags, port);

            expect(mockAuthenticatedApi.put).toHaveBeenCalledWith(
                `http://${MOCK_CONSUL_URL}/v1/agent/service/register`,
                {
                    ID: serviceId,
                    Name: serviceName,
                    Tags: tags,
                    Address: 'localhost',
                    Port: port,
                    Check: {
                        HTTP: `http://localhost:3000/health`,
                        Interval: '60s',
                        Timeout: '5s'
                    }
                }
            );
            expect((serviceDiscovery as any).registeredServices.has(serviceId)).toBe(true);
            expect(console.log).toHaveBeenCalledWith(`Service ${serviceId} registered with Consul`);
        });

        it('should handle serviceUrl without http prefix', async () => {
            const serviceId = 'test-service-no-http';
            const serviceUrl = 'localhost:3000';
            await serviceDiscovery.registerService(serviceId, 'TestService', serviceUrl);
            expect(mockAuthenticatedApi.put).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    Check: { HTTP: `http://localhost:3000/health`, Interval: '60s', Timeout: '5s' }
                })
            );
        });

        it('should log error if registration fails', async () => {
            mockAuthenticatedApi.put.mockRejectedValueOnce(new Error('Registration failed'));
            await serviceDiscovery.registerService('fail-service', 'FailService', 'http://localhost:1234');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to register service fail-service with Consul'));
        });
    });

    describe('deregisterService', () => {
        it('should deregister a service from Consul', async () => {
            const serviceId = 'test-service';
            // Register first to add to local tracking
            await serviceDiscovery.registerService(serviceId, 'TestService', 'http://localhost:3000');
            mockAuthenticatedApi.put.mockClear(); // Clear register call

            await serviceDiscovery.deregisterService(serviceId);

            expect(mockAuthenticatedApi.put).toHaveBeenCalledWith(
                `http://${MOCK_CONSUL_URL}/v1/agent/service/deregister/${serviceId}`
            );
            expect((serviceDiscovery as any).registeredServices.has(serviceId)).toBe(false);
            expect(console.log).toHaveBeenCalledWith(`Service ${serviceId} deregistered from Consul`);
        });

        it('should log error if deregistration fails', async () => {
            mockAuthenticatedApi.put.mockRejectedValueOnce(new Error('Deregistration failed'));
            await serviceDiscovery.deregisterService('fail-deregister');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to deregister service from Consul'));
        });
    });

    describe('isRegistered', () => {
        it('should return true if service is registered', async () => {
            await serviceDiscovery.registerService('test-service', 'TestService', 'http://localhost:3000');
            expect(serviceDiscovery.isRegistered('test-service')).toBe(true);
        });

        it('should return false if service is not registered', () => {
            expect(serviceDiscovery.isRegistered('non-existent-service')).toBe(false);
        });
    });

    describe('discoverService', () => {
        const serviceName = 'TestService';
        const mockConsulResponse = {
            data: [
                { Service: { Address: '192.168.1.1', Port: 8080 } },
                { Service: { Address: '192.168.1.2', Port: 8081 } },
            ]
        };

        it('should discover a service and return its URL', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce(mockConsulResponse);
            const url = await serviceDiscovery.discoverService(serviceName);
            expect(url).toMatch(/^192\.168\.1\.\d:\d{4}$/);
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
                `http://${MOCK_CONSUL_URL}/v1/health/service/${serviceName}?passing=true`
            );
        });

        it('should cache discovered service and return from cache on subsequent calls', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce(mockConsulResponse);
            const url1 = await serviceDiscovery.discoverService(serviceName);
            const url2 = await serviceDiscovery.discoverService(serviceName);

            expect(url1).toBe(url2);
            expect(mockAuthenticatedApi.get).toHaveBeenCalledTimes(1); // Only called once due to cache
        });

        it('should return null if service not found', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: [] });
            const url = await serviceDiscovery.discoverService(serviceName);
            expect(url).toBeNull();
        });

        it('should return null and log error if discovery fails', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce(new Error('Discovery failed'));
            const url = await serviceDiscovery.discoverService(serviceName);
            expect(url).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to discover service'), expect.any(Error));
        });

        it('should use cache for PostOffice and not call Consul', async () => {
            const url = await serviceDiscovery.discoverService('PostOffice');
            expect(url).toBe(process.env.POSTOFFICE_URL);
            expect(mockAuthenticatedApi.get).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Using hardcoded PostOffice URL'));
        });

        it('should refresh cache after TTL', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce(mockConsulResponse);
            await serviceDiscovery.discoverService(serviceName);
            expect(mockAuthenticatedApi.get).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(60001); // Advance time past TTL

            mockAuthenticatedApi.get.mockResolvedValueOnce(mockConsulResponse);
            await serviceDiscovery.discoverService(serviceName);
            expect(mockAuthenticatedApi.get).toHaveBeenCalledTimes(2); // Called again after cache expiry
        });
    });

    describe('getAllServiceInstances', () => {
        const serviceName = 'TestService';
        const mockConsulResponse = {
            data: [
                { Service: { Address: '192.168.1.1', Port: 8080 } },
                { Service: { Address: '192.168.1.2', Port: 8081 } },
            ]
        };

        it('should return all service instances', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce(mockConsulResponse);
            const urls = await serviceDiscovery.getAllServiceInstances(serviceName);
            expect(urls).toEqual(['192.168.1.1:8080', '192.168.1.2:8081']);
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
                `http://${MOCK_CONSUL_URL}/v1/health/service/${serviceName}?passing=true`
            );
        });

        it('should return empty array if no instances found', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: [] });
            const urls = await serviceDiscovery.getAllServiceInstances(serviceName);
            expect(urls).toEqual([]);
        });

        it('should return empty array and log error if discovery fails', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce(new Error('Discovery failed'));
            const urls = await serviceDiscovery.getAllServiceInstances(serviceName);
            expect(urls).toEqual([]);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to discover service instances'), expect.any(Error));
        });
    });

    describe('clearCache', () => {
        it('should clear the service cache', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: [{ Service: { Address: '1.1.1.1', Port: 1111 } }] });
            await serviceDiscovery.discoverService('CachedService');
            expect((serviceDiscovery as any).serviceCache.size).toBe(1);

            serviceDiscovery.clearCache();
            expect((serviceDiscovery as any).serviceCache.size).toBe(0);

            // Ensure it fetches again after clear
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: [{ Service: { Address: '2.2.2.2', Port: 2222 } }] });
            await serviceDiscovery.discoverService('CachedService');
            expect(mockAuthenticatedApi.get).toHaveBeenCalledTimes(2);
        });
    });
});
