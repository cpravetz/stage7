import { ContainerManager } from '../src/utils/containerManager';
import Docker from 'dockerode';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ContainerPluginManifest, ContainerInstance, ContainerExecutionRequest, ContainerExecutionResponse, ContainerHealthCheckResult } from '../types/containerTypes';
import { generateStructuredError, GlobalErrorCodes } from '../src/utils/errorReporter';

// Mock external dependencies
jest.mock('dockerode');
jest.mock('axios');
jest.mock('uuid');
jest.mock('fs/promises');
jest.mock('../src/utils/errorReporter', () => ({
    generateStructuredError: jest.fn((error) => new Error(error.message)), // Simplify error generation for tests
    GlobalErrorCodes: jest.requireActual('../src/utils/errorReporter').GlobalErrorCodes,
    ErrorSeverity: jest.requireActual('../src/utils/errorReporter').ErrorSeverity,
}));

// Cast mocked functions/modules
const mockDocker = Docker as jest.MockedClass<typeof Docker>;
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockFsAccess = fs.access as jest.Mock;
const mockFsMkdir = fs.mkdir as jest.Mock;
const mockFsRm = fs.rm as jest.Mock;
const mockGenerateStructuredError = generateStructuredError as jest.Mock;


describe('ContainerManager', () => {
    let manager: ContainerManager;
    let mockContainer: any;
    let mockDockerInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Dockerode instance and its methods
        mockContainer = {
            start: jest.fn().mockResolvedValue(undefined),
            stop: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
            inspect: jest.fn().mockResolvedValue({ State: { Running: true } }),
        };
        mockDockerInstance = {
            buildImage: jest.fn().mockResolvedValue({}), // Mock stream object
            createContainer: jest.fn().mockResolvedValue(mockContainer),
            getContainer: jest.fn().mockReturnValue(mockContainer),
            modem: { followProgress: jest.fn() },
        };
        mockDocker.mockImplementation(() => mockDockerInstance);

        // Default mocks for other dependencies
        mockUuidv4.mockReturnValue('mock-uuid');
        mockFsAccess.mockResolvedValue(undefined); // Dockerfile exists by default
        mockAxios.get.mockResolvedValue({ status: 200, data: { status: 'healthy' } }); // Health check passes by default
        mockAxios.request.mockResolvedValue({ data: { outputs: {} } }); // Plugin execution succeeds by default

        // Suppress console logs for cleaner test output
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        manager = new ContainerManager();
        // Clear the interval set by the constructor to prevent it from interfering with tests
        if ((manager as any).healthCheckInterval) {
            clearInterval((manager as any).healthCheckInterval);
            (manager as any).healthCheckInterval = null;
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize Dockerode and start health check monitoring', () => {
            expect(mockDocker).toHaveBeenCalledTimes(1);
            // Health check monitoring is started, but we clear it in beforeEach
            // so we can't directly assert on setInterval being called here without more complex mocking
        });
    });

    describe('buildPluginImage', () => {
        const mockManifest: ContainerPluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'container',
            container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'test-image', ports: [], resources: {} },
            api: { endpoint: '/', method: 'post' }
        };
        const mockPluginPath = '/mock/plugin/path';
        const MOCK_TRACE_ID = 'build-trace';

        it('should build a Docker image successfully', async () => {
            mockDockerInstance.modem.followProgress.mockImplementationOnce((stream, onFinished) => onFinished(null, {}));

            const result = await manager.buildPluginImage(mockManifest, mockPluginPath, MOCK_TRACE_ID);

            expect(mockFsAccess).toHaveBeenCalledWith(path.join(mockPluginPath, 'Dockerfile'));
            expect(mockDockerInstance.buildImage).toHaveBeenCalledWith(
                { context: mockPluginPath, src: ['.'] },
                { dockerfile: 'Dockerfile', t: 'test-image', buildargs: { PLUGIN_ID: 'test-plugin', PLUGIN_VERSION: undefined } }
            );
            expect(mockDockerInstance.modem.followProgress).toHaveBeenCalledTimes(1);
            expect(result).toBe('test-image');
        });

        it('should throw structured error if Dockerfile does not exist', async () => {
            mockFsAccess.mockRejectedValueOnce(new Error('File not found'));

            await expect(manager.buildPluginImage(mockManifest, mockPluginPath, MOCK_TRACE_ID)).rejects.toThrow('Failed to build container image for plugin test-plugin: File not found');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Failed to build container image'),
            }));
        });

        it('should throw structured error if image build fails', async () => {
            mockDockerInstance.modem.followProgress.mockImplementationOnce((stream, onFinished) => onFinished(new Error('Build failed'), null));

            await expect(manager.buildPluginImage(mockManifest, mockPluginPath, MOCK_TRACE_ID)).rejects.toThrow('Failed to build container image for plugin test-plugin: Build failed');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Failed to build container image'),
            }));
        });
    });

    describe('startPluginContainer', () => {
        const mockManifest: ContainerPluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'container',
            container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'test-image', ports: [{ container: 8080 }], resources: { memory: '100m', cpu: '0.5' } },
            api: { endpoint: '/', method: 'post' }
        };
        const MOCK_TRACE_ID = 'start-trace';

        // Mock waitForContainerReady to resolve immediately for most tests
        let waitForContainerReadySpy: jest.SpyInstance;

        beforeEach(() => {
            waitForContainerReadySpy = jest.spyOn(manager as any, 'waitForContainerReady').mockResolvedValue(undefined);
        });

        afterEach(() => {
            waitForContainerReadySpy.mockRestore();
        });

        it('should start a container successfully', async () => {
            const result = await manager.startPluginContainer(mockManifest, MOCK_TRACE_ID);

            expect(mockDockerInstance.createContainer).toHaveBeenCalledWith(expect.objectContaining({
                Image: 'test-image',
                ExposedPorts: { '8080/tcp': {} },
                HostConfig: expect.objectContaining({
                    PortBindings: { '8080/tcp': expect.any(Number) },
                    Memory: 104857600, // 100m in bytes
                    CpuShares: 512, // 0.5 CPU shares
                }),
                Env: expect.any(Array),
                name: expect.stringContaining('stage7-plugin-test-plugin-mock-uuid'),
            }));
            expect(mockContainer.start).toHaveBeenCalledTimes(1);
            expect(waitForContainerReadySpy).toHaveBeenCalledTimes(1);
            expect(result).toEqual(expect.objectContaining({
                id: 'mock-uuid',
                containerId: expect.any(String),
                pluginId: 'test-plugin',
                image: 'test-image',
                port: expect.any(Number),
                status: 'running',
            }));
            expect((manager as any).containers.has('mock-uuid')).toBe(true);
            expect((manager as any).usedPorts.has(result.port)).toBe(true);
        });

        it('should throw structured error if container creation fails', async () => {
            mockDockerInstance.createContainer.mockRejectedValueOnce(new Error('Create failed'));

            await expect(manager.startPluginContainer(mockManifest, MOCK_TRACE_ID)).rejects.toThrow('Failed to start container for plugin test-plugin: Create failed');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Failed to start container'),
            }));
        });

        it('should throw structured error if container start fails', async () => {
            mockContainer.start.mockRejectedValueOnce(new Error('Start failed'));

            await expect(manager.startPluginContainer(mockManifest, MOCK_TRACE_ID)).rejects.toThrow('Failed to start container for plugin test-plugin: Start failed');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Failed to start container'),
            }));
        });

        it('should throw error if no ports are available', async () => {
            // Fill all ports in the range
            for (let i = 8080; i <= 8999; i++) {
                (manager as any).usedPorts.add(i);
            }
            await expect(manager.startPluginContainer(mockManifest, MOCK_TRACE_ID)).rejects.toThrow('No available ports in range');
        });
    });

    describe('executePluginInContainer', () => {
        const mockContainerInstance: ContainerInstance = {
            id: 'mock-uuid',
            containerId: 'mock-container-id',
            pluginId: 'test-plugin',
            image: 'test-image',
            port: 8080,
            status: 'running',
            createdAt: new Date()
        };
        const mockManifest: ContainerPluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'container',
            container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'test-image', ports: [{ container: 8080 }], resources: {} },
            api: { endpoint: '/execute', method: 'post' }
        };
        const mockRequest: ContainerExecutionRequest = { inputs: { data: 'test' }, context: { trace_id: 'exec-trace' } };
        const MOCK_TRACE_ID = 'exec-trace';

        it('should execute plugin in container successfully', async () => {
            mockAxios.request.mockResolvedValueOnce({ data: { outputs: { result: 'success' } } });

            const result = await manager.executePluginInContainer(mockContainerInstance, mockManifest, mockRequest, MOCK_TRACE_ID);

            expect(mockAxios.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'post',
                url: 'http://localhost:8080/execute',
                data: mockRequest,
            }));
            expect(result).toEqual(expect.objectContaining({
                success: true,
                outputs: { result: 'success' },
                executionTime: expect.any(Number),
            }));
        });

        it('should return success: false on execution failure', async () => {
            mockAxios.request.mockRejectedValueOnce(new Error('Execution failed'));

            const result = await manager.executePluginInContainer(mockContainerInstance, mockManifest, mockRequest, MOCK_TRACE_ID);

            expect(result).toEqual(expect.objectContaining({
                success: false,
                error: 'Execution failed',
                executionTime: expect.any(Number),
            }));
        });
    });

    describe('stopPluginContainer', () => {
        const mockContainerInstance: ContainerInstance = {
            id: 'mock-uuid',
            containerId: 'mock-container-id',
            pluginId: 'test-plugin',
            image: 'test-image',
            port: 8080,
            status: 'running',
            createdAt: new Date()
        };
        const MOCK_TRACE_ID = 'stop-trace';

        beforeEach(() => {
            (manager as any).containers.set(mockContainerInstance.id, mockContainerInstance);
            (manager as any).usedPorts.add(mockContainerInstance.port);
        });

        it('should stop and remove a container successfully', async () => {
            await manager.stopPluginContainer(mockContainerInstance.id, MOCK_TRACE_ID);

            expect(mockDockerInstance.getContainer).toHaveBeenCalledWith(mockContainerInstance.containerId);
            expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
            expect(mockContainer.remove).toHaveBeenCalledTimes(1);
            expect((manager as any).containers.has(mockContainerInstance.id)).toBe(false);
            expect((manager as any).usedPorts.has(mockContainerInstance.port)).toBe(false);
        });

        it('should throw structured error if container not found', async () => {
            (manager as any).containers.clear(); // Ensure container is not found
            await expect(manager.stopPluginContainer('non-existent-id', MOCK_TRACE_ID)).rejects.toThrow('Container instance non-existent-id not found');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Container instance non-existent-id not found'),
            }));
        });

        it('should throw structured error if stop fails', async () => {
            mockContainer.stop.mockRejectedValueOnce(new Error('Stop failed'));
            await expect(manager.stopPluginContainer(mockContainerInstance.id, MOCK_TRACE_ID)).rejects.toThrow('Failed to stop container mock-uuid: Stop failed');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Failed to stop container'),
            }));
        });

        it('should throw structured error if remove fails', async () => {
            mockContainer.remove.mockRejectedValueOnce(new Error('Remove failed'));
            await expect(manager.stopPluginContainer(mockContainerInstance.id, MOCK_TRACE_ID)).rejects.toThrow('Failed to stop container mock-uuid: Remove failed');
            expect(mockGenerateStructuredError).toHaveBeenCalledWith(expect.objectContaining({
                error_code: GlobalErrorCodes.INTERNAL_ERROR_CM,
                message: expect.stringContaining('Failed to stop container'),
            }));
        });
    });

    describe('performHealthCheck', () => {
        const mockContainerInstance: ContainerInstance = {
            id: 'mock-uuid',
            containerId: 'mock-container-id',
            pluginId: 'test-plugin',
            image: 'test-image',
            port: 8080,
            status: 'running',
            createdAt: new Date()
        };
        const mockManifest: ContainerPluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'container',
            container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'test-image', ports: [{ container: 8080 }], resources: {}, healthCheck: { path: '/health', timeout: '10s' } },
            api: { endpoint: '/', method: 'post' }
        };
        const MOCK_TRACE_ID = 'health-trace';

        it('should return healthy if health check passes', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 200, data: { status: 'healthy' } });

            const result = await manager.performHealthCheck(mockContainerInstance, mockManifest, MOCK_TRACE_ID);

            expect(mockAxios.get).toHaveBeenCalledWith('http://localhost:8080/health', expect.objectContaining({ timeout: 10000 }));
            expect(result).toEqual(expect.objectContaining({
                status: 'healthy',
                timestamp: expect.any(Date),
                responseTime: expect.any(Number),
            }));
        });

        it('should return unhealthy if health check returns non-200 status', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 500, data: { status: 'unhealthy' } });

            const result = await manager.performHealthCheck(mockContainerInstance, mockManifest, MOCK_TRACE_ID);

            expect(result).toEqual(expect.objectContaining({
                status: 'unhealthy',
                message: 'Unexpected response: 500',
            }));
        });

        it('should return unhealthy if health check returns unhealthy status in data', async () => {
            mockAxios.get.mockResolvedValueOnce({ status: 200, data: { status: 'unhealthy' } });

            const result = await manager.performHealthCheck(mockContainerInstance, mockManifest, MOCK_TRACE_ID);

            expect(result).toEqual(expect.objectContaining({
                status: 'unhealthy',
                message: 'Unexpected response: 200',
            }));
        });

        it('should return unhealthy if health check fails (network error)', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

            const result = await manager.performHealthCheck(mockContainerInstance, mockManifest, MOCK_TRACE_ID);

            expect(result).toEqual(expect.objectContaining({
                status: 'unhealthy',
                message: 'Network error',
            }));
        });
    });

    describe('getActiveContainers', () => {
        it('should return all active containers', () => {
            const container1: ContainerInstance = { id: 'c1', containerId: 'dc1', pluginId: 'p1', image: 'i1', port: 8080, status: 'running', createdAt: new Date() };
            const container2: ContainerInstance = { id: 'c2', containerId: 'dc2', pluginId: 'p2', image: 'i2', port: 8081, status: 'running', createdAt: new Date() };
            (manager as any).containers.set(container1.id, container1);
            (manager as any).containers.set(container2.id, container2);

            const active = manager.getActiveContainers();
            expect(active).toEqual([container1, container2]);
        });

        it('should return an empty array if no containers are active', () => {
            expect(manager.getActiveContainers()).toEqual([]);
        });
    });

    describe('cleanup', () => {
        const MOCK_TRACE_ID = 'cleanup-trace';
        let stopPluginContainerSpy: jest.SpyInstance;

        beforeEach(() => {
            stopPluginContainerSpy = jest.spyOn(manager, 'stopPluginContainer').mockResolvedValue(undefined);
            const container1: ContainerInstance = { id: 'c1', containerId: 'dc1', pluginId: 'p1', image: 'i1', port: 8080, status: 'running', createdAt: new Date() };
            const container2: ContainerInstance = { id: 'c2', containerId: 'dc2', pluginId: 'p2', image: 'i2', port: 8081, status: 'running', createdAt: new Date() };
            (manager as any).containers.set(container1.id, container1);
            (manager as any).containers.set(container2.id, container2);
        });

        afterEach(() => {
            stopPluginContainerSpy.mockRestore();
        });

        it('should stop all active containers and clear interval', async () => {
            await manager.cleanup(MOCK_TRACE_ID);

            expect(stopPluginContainerSpy).toHaveBeenCalledTimes(2);
            expect(stopPluginContainerSpy).toHaveBeenCalledWith('c1', MOCK_TRACE_ID);
            expect(stopPluginContainerSpy).toHaveBeenCalledWith('c2', MOCK_TRACE_ID);
            expect((manager as any).containers.size).toBe(0);
            expect((manager as any).healthCheckInterval).toBeNull();
        });

        it('should log error if stopping a container fails during cleanup', async () => {
            stopPluginContainerSpy.mockImplementationOnce((id) => {
                if (id === 'c1') return Promise.reject(new Error('Failed to stop c1'));
                return Promise.resolve(undefined);
            });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await manager.cleanup(MOCK_TRACE_ID);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to stop c1'));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('Private Helper Methods', () => {
        describe('allocatePort', () => {
            it('should allocate a new port', () => {
                const port = (manager as any).allocatePort();
                expect(port).toBeGreaterThanOrEqual(8080);
                expect(port).toBeLessThanOrEqual(8999);
                expect((manager as any).usedPorts.has(port)).toBe(true);
            });

            it('should throw error if no ports available', () => {
                for (let i = 8080; i <= 8999; i++) {
                    (manager as any).usedPorts.add(i);
                }
                expect(() => (manager as any).allocatePort()).toThrow('No available ports in range');
            });
        });

        describe('parseMemoryLimit', () => {
            it('should parse memory with k unit', () => {
                expect((manager as any).parseMemoryLimit('100k')).toBe(100 * 1024);
            });

            it('should parse memory with m unit', () => {
                expect((manager as any).parseMemoryLimit('100m')).toBe(100 * 1024 * 1024);
            });

            it('should parse memory with g unit', () => {
                expect((manager as any).parseMemoryLimit('1g')).toBe(1 * 1024 * 1024 * 1024);
            });

            it('should parse memory without unit', () => {
                expect((manager as any).parseMemoryLimit('1000')).toBe(1000);
            });

            it('should return undefined for invalid format', () => {
                expect((manager as any).parseMemoryLimit('abc')).toBeUndefined();
            });

            it('should return undefined for undefined input', () => {
                expect((manager as any).parseMemoryLimit(undefined)).toBeUndefined();
            });
        });

        describe('parseCpuShares', () => {
            it('should parse cpu shares correctly', () => {
                expect((manager as any).parseCpuShares('0.5')).toBe(512); // 0.5 * 1024
                expect((manager as any).parseCpuShares('1')).toBe(1024);
            });

            it('should return undefined for undefined input', () => {
                expect((manager as any).parseCpuShares(undefined)).toBeUndefined();
            });
        });

        describe('waitForContainerReady', () => {
            const mockContainerInstance: ContainerInstance = {
                id: 'mock-uuid',
                containerId: 'mock-container-id',
                pluginId: 'test-plugin',
                image: 'test-image',
                port: 8080,
                status: 'starting',
                createdAt: new Date()
            };
            const mockManifest: ContainerPluginManifest = {
                id: 'test-plugin',
                verb: 'TEST_VERB',
                language: 'container',
                container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'test-image', ports: [{ container: 8080 }], resources: {}, healthCheck: { path: '/health', timeout: '1s' } },
                api: { endpoint: '/', method: 'post' }
            };
            const MOCK_TRACE_ID = 'wait-trace';

            let performHealthCheckSpy: jest.SpyInstance;

            beforeEach(() => {
                performHealthCheckSpy = jest.spyOn(manager, 'performHealthCheck');
                jest.useFakeTimers(); // Use fake timers for setTimeout
            });

            afterEach(() => {
                performHealthCheckSpy.mockRestore();
                jest.useRealTimers(); // Restore real timers
            });

            it('should resolve when container becomes healthy', async () => {
                performHealthCheckSpy.mockResolvedValueOnce({ status: 'unhealthy' });
                performHealthCheckSpy.mockResolvedValueOnce({ status: 'healthy' });

                const promise = (manager as any).waitForContainerReady(mockContainerInstance, mockManifest, MOCK_TRACE_ID);

                jest.advanceTimersByTime(1000); // Advance for first retry
                await Promise.resolve(); // Allow promise to resolve
                jest.advanceTimersByTime(1000); // Advance for second retry
                await Promise.resolve(); // Allow promise to resolve

                await promise;

                expect(mockContainerInstance.status).toBe('running');
                expect(mockContainerInstance.healthStatus).toBe('healthy');
                expect(mockContainerInstance.lastHealthCheck).toBeInstanceOf(Date);
                expect(performHealthCheckSpy).toHaveBeenCalledTimes(2);
            });

            it('should throw error if container does not become ready within max attempts', async () => {
                performHealthCheckSpy.mockResolvedValue({ status: 'unhealthy' });

                const promise = (manager as any).waitForContainerReady(mockContainerInstance, mockManifest, MOCK_TRACE_ID);

                jest.advanceTimersByTime(30 * 1000); // Advance past max attempts (30 attempts * 1s delay)
                await Promise.resolve(); // Allow promise to resolve

                await expect(promise).rejects.toThrow('Container failed to become ready after 30 attempts');
                expect(mockContainerInstance.status).toBe('error');
                expect(performHealthCheckSpy).toHaveBeenCalledTimes(30);
            });
        });
    });
});
