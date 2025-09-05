import request from 'supertest';
import express from 'express';
import { PluginManager } from '../src/pluginManager';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('express');
jest.mock('@cktmcs/errorhandler');

describe('PluginManager', () => {
    let manager: PluginManager;
    let mockAuthenticatedApi: any;
    let mockGetComponentUrl: jest.Mock;
    let mockApp: jest.Mocked<express.Application>;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock authenticatedApi and getComponentUrl
        mockAuthenticatedApi = {
            post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            put: jest.fn().mockResolvedValue({ status: 200, data: {} }),
            delete: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        };
        mockGetComponentUrl = jest.fn().mockImplementation((type: string) => {
            if (type === 'CapabilitiesManager') return 'mock-capabilities-manager:5060';
            return undefined;
        });

        // Mock Express app
        mockApp = {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
        } as unknown as jest.Mocked<express.Application>;

        // Suppress console errors
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        manager = new PluginManager(mockAuthenticatedApi, mockGetComponentUrl);
        manager.setupRoutes(mockApp);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should initialize with authenticatedApi and getComponentUrl', () => {
        expect((manager as any).authenticatedApi).toBe(mockAuthenticatedApi);
        expect((manager as any).getComponentUrl).toBe(mockGetComponentUrl);
    });

    it('should set up all plugin management routes', () => {
        expect(mockApp.get).toHaveBeenCalledWith('/plugins', expect.any(Function));
        expect(mockApp.get).toHaveBeenCalledWith('/plugins/:id', expect.any(Function));
        expect(mockApp.post).toHaveBeenCalledWith('/plugins', expect.any(Function));
        expect(mockApp.put).toHaveBeenCalledWith('/plugins/:id', expect.any(Function));
        expect(mockApp.delete).toHaveBeenCalledWith('/plugins/:id', expect.any(Function));
    });

    describe('getPlugins (GET /plugins)', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/plugins')[1];
        });

        it('should retrieve all plugins successfully', async () => {
            const mockPlugins = { plugins: [{ id: 'p1' }, { id: 'p2' }] };
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: mockPlugins });

            const mockReq = { query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockGetComponentUrl).toHaveBeenCalledWith('CapabilitiesManager');
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith('http://mock-capabilities-manager:5060/plugins');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(mockPlugins);
        });

        it('should retrieve plugins from a specific repository', async () => {
            const mockPlugins = { plugins: [{ id: 'p3' }] };
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: mockPlugins });

            const mockReq = { query: { repository: 'github' } } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith('http://mock-capabilities-manager:5060/plugins?repository=github');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(mockPlugins);
        });

        it('should return 500 if CapabilitiesManager is not available', async () => {
            mockGetComponentUrl.mockReturnValueOnce(undefined);
            const mockReq = { query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'CapabilitiesManager service not available' });
        });

        it('should handle errors from CapabilitiesManager', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce(new Error('CM error'));
            const mockReq = { query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting plugins'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get plugins' });
        });
    });

    describe('getPlugin (GET /plugins/:id)', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.get.mock.calls.find(call => call[0] === '/plugins/:id')[1];
        });

        it('should retrieve a specific plugin successfully', async () => {
            const mockPlugin = { plugin: { id: 'p1' } };
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: mockPlugin });

            const mockReq = { params: { id: 'p1' }, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith('http://mock-capabilities-manager:5060/plugins/p1');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(mockPlugin);
        });

        it('should return 404 if plugin not found in CapabilitiesManager', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce({ response: { status: 404 } });

            const mockReq = { params: { id: 'non-existent' }, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Plugin not found' });
        });

        it('should handle other errors from CapabilitiesManager', async () => {
            mockAuthenticatedApi.get.mockRejectedValueOnce(new Error('CM error'));

            const mockReq = { params: { id: 'p1' }, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error getting plugin p1'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to get plugin' });
        });
    });

    describe('createPlugin (POST /plugins)', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.post.mock.calls.find(call => call[0] === '/plugins')[1];
        });

        it('should create a new plugin successfully', async () => {
            const newPluginData = { id: 'new-plugin', name: 'New Plugin' };
            mockAuthenticatedApi.post.mockResolvedValueOnce({ status: 201, data: { success: true } });

            const mockReq = { body: newPluginData, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith('http://mock-capabilities-manager:5060/plugins', newPluginData);
            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
        });

        it('should return 400 if invalid plugin data from CapabilitiesManager', async () => {
            mockAuthenticatedApi.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Invalid data' } } });

            const mockReq = { body: {}, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid plugin data', details: 'Invalid data' });
        });

        it('should handle other errors from CapabilitiesManager', async () => {
            mockAuthenticatedApi.post.mockRejectedValueOnce(new Error('CM error'));

            const mockReq = { body: {}, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error creating plugin'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to create plugin' });
        });
    });

    describe('updatePlugin (PUT /plugins/:id)', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.put.mock.calls.find(call => call[0] === '/plugins/:id')[1];
        });

        it('should update a plugin successfully', async () => {
            const updatedPluginData = { id: 'p1', name: 'Updated Plugin' };
            mockAuthenticatedApi.put.mockResolvedValueOnce({ status: 200, data: { success: true } });

            const mockReq = { params: { id: 'p1' }, body: updatedPluginData, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAuthenticatedApi.put).toHaveBeenCalledWith('http://mock-capabilities-manager:5060/plugins/p1', updatedPluginData);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ success: true });
        });

        it('should return 404 if plugin not found in CapabilitiesManager', async () => {
            mockAuthenticatedApi.put.mockRejectedValueOnce({ response: { status: 404 } });

            const mockReq = { params: { id: 'non-existent' }, body: {}, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Plugin not found' });
        });

        it('should return 400 if invalid plugin data from CapabilitiesManager', async () => {
            mockAuthenticatedApi.put.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Invalid data' } } });

            const mockReq = { params: { id: 'p1' }, body: {}, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid plugin data', details: 'Invalid data' });
        });

        it('should handle other errors from CapabilitiesManager', async () => {
            mockAuthenticatedApi.put.mockRejectedValueOnce(new Error('CM error'));

            const mockReq = { params: { id: 'p1' }, body: {}, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error updating plugin p1'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to update plugin' });
        });
    });

    describe('deletePlugin (DELETE /plugins/:id)', () => {
        let handler: Function;

        beforeEach(() => {
            handler = mockApp.delete.mock.calls.find(call => call[0] === '/plugins/:id')[1];
        });

        it('should delete a plugin successfully', async () => {
            mockAuthenticatedApi.delete.mockResolvedValueOnce({ status: 200, data: { success: true } });

            const mockReq = { params: { id: 'p1' }, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAuthenticatedApi.delete).toHaveBeenCalledWith('http://mock-capabilities-manager:5060/plugins/p1');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'Plugin deleted successfully' });
        });

        it('should return 404 if plugin not found in CapabilitiesManager', async () => {
            mockAuthenticatedApi.delete.mockRejectedValueOnce({ response: { status: 404 } });

            const mockReq = { params: { id: 'non-existent' }, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Plugin not found' });
        });

        it('should handle other errors from CapabilitiesManager', async () => {
            mockAuthenticatedApi.delete.mockRejectedValueOnce(new Error('CM error'));

            const mockReq = { params: { id: 'p1' }, query: {} } as any;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

            await handler(mockReq, mockRes);

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error deleting plugin p1'), expect.any(Error));
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to delete plugin' });
        });
    });
});
