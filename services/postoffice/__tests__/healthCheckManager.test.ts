import { HealthCheckManager } from '../src/healthCheckManager';
import express from 'express';

// Mock external dependencies
jest.mock('express');

describe('HealthCheckManager', () => {
    let manager: HealthCheckManager;
    let mockApp: jest.Mocked<express.Application>;
    let mockMqClient: any;
    let mockServiceDiscovery: any;
    let mockComponents: Map<string, any>;
    let mockComponentsByType: Map<string, Set<string>>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_COMPONENT_TYPE = 'PostOffice';

    beforeEach(() => {
        jest.clearAllMocks();

        mockApp = {
            get: jest.fn(),
        } as unknown as jest.Mocked<express.Application>;

        mockMqClient = {
            isConnected: jest.fn(),
            testConnection: jest.fn(),
        };

        mockServiceDiscovery = {
            isRegistered: jest.fn(),
        };

        mockComponents = new Map();
        mockComponentsByType = new Map();

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        manager = new HealthCheckManager(
            mockApp,
            mockMqClient,
            mockServiceDiscovery,
            mockComponents,
            mockComponentsByType,
            MOCK_COMPONENT_TYPE
        );
        manager.setupHealthCheck();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('GET /healthy', () => {
        it('should always return 200 status with ok status', () => {
            const healthyHandler = mockApp.get.mock.calls.find(call => call[0] === '/healthy')[1];
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            healthyHandler({} as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'ok',
                message: 'PostOffice service is running',
            }));
        });
    });

    describe('GET /ready', () => {
        let readyHandler: Function;

        beforeEach(() => {
            readyHandler = mockApp.get.mock.calls.find(call => call[0] === '/ready')[1];
        });

        it('should return 200 if RabbitMQ is connected and working', async () => {
            mockMqClient.isConnected.mockReturnValue(true);
            mockMqClient.testConnection.mockResolvedValue(true);
            mockServiceDiscovery.isRegistered.mockReturnValue(true);

            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
            await readyHandler({ query: {} } as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: true,
                rabbitMQ: 'connected and working',
                serviceDiscovery: 'registered',
                message: 'PostOffice is fully operational',
            }));
        });

        it('should return 503 if RabbitMQ is disconnected', async () => {
            mockMqClient.isConnected.mockReturnValue(false);
            mockMqClient.testConnection.mockResolvedValue(false);
            mockServiceDiscovery.isRegistered.mockReturnValue(false);

            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
            await readyHandler({ query: {} } as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: false,
                rabbitMQ: 'disconnected',
                serviceDiscovery: 'not registered',
                message: 'PostOffice is not ready - RabbitMQ is disconnected',
            }));
        });

        it('should return 503 if RabbitMQ is connected but not working', async () => {
            mockMqClient.isConnected.mockReturnValue(true);
            mockMqClient.testConnection.mockResolvedValue(false);

            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
            await readyHandler({ query: {} } as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: false,
                rabbitMQ: 'connected but not working',
            }));
        });

        it('should return 200 if ALLOW_READY_WITHOUT_RABBITMQ is true despite MQ issues', async () => {
            process.env.ALLOW_READY_WITHOUT_RABBITMQ = 'true';
            mockMqClient.isConnected.mockReturnValue(false);
            mockMqClient.testConnection.mockResolvedValue(false);

            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
            await readyHandler({ query: {} } as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: true,
                rabbitMQ: 'disconnected',
                message: 'PostOffice is ready in limited mode (RabbitMQ issues detected)',
            }));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('PostOffice reporting ready despite RabbitMQ issues'));
        });

        it('should include full details if detail=full is requested', async () => {
            mockMqClient.isConnected.mockReturnValue(true);
            mockMqClient.testConnection.mockResolvedValue(true);
            mockServiceDiscovery.isRegistered.mockReturnValue(true);

            mockComponents.set('comp1', {});
            mockComponents.set('comp2', {});
            mockComponentsByType.set('Agent', new Set(['comp1']));
            mockComponentsByType.set('Librarian', new Set(['comp2']));

            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
            await readyHandler({ query: { detail: 'full' } } as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: true,
                details: expect.objectContaining({
                    status: 'healthy',
                    registeredComponents: 2,
                    servicesByType: { Agent: 1, Librarian: 1 },
                }),
            }));
        });

        it('should handle errors during readiness check', async () => {
            mockMqClient.isConnected.mockImplementationOnce(() => { throw new Error('MQ check error'); });

            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
            await readyHandler({ query: {} } as express.Request, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: false,
                message: 'PostOffice encountered an error during readiness check',
                error: 'MQ check error',
            }));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in readiness check'), expect.any(Error));
        });
    });

    describe('GET /health', () => {
        it('should redirect to /ready?detail=full', () => {
            const healthHandler = mockApp.get.mock.calls.find(call => call[0] === '/health')[1];
            const mockReq = { headers: { host: 'localhost' } } as express.Request;
            const mockRes = { redirect: jest.fn() } as any;

            healthHandler(mockReq, mockRes);

            expect(mockRes.redirect).toHaveBeenCalledWith(307, 'http://localhost/ready?detail=full');
        });
    });
});
