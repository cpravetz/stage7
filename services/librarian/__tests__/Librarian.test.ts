import request from 'supertest';
import express from 'express';
import { Librarian } from '../src/Librarian';
import { storeInRedis, loadFromRedis, deleteFromRedis } from 'utils/redisUtils';
import { storeInMongo, loadFromMongo, loadManyFromMongo, aggregateInMongo, deleteManyFromMongo } from '../src/utils/mongoUtils';
import { BaseEntity } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('express');
jest.mock('../src/utils/redisUtils');
jest.mock('../src/utils/mongoUtils');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    BaseEntity: jest.fn().mockImplementation(() => ({
        id: 'mock-librarian-id',
        componentType: 'Librarian',
        url: 'http://mock-librarian:5040',
        port: '5040',
        postOfficeUrl: 'http://mock-postoffice:5020',
        authenticatedApi: {
            post: jest.fn().mockResolvedValue({ status: 200 }),
            get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
        },
        verifyToken: jest.fn((req, res, next) => next()), // Mock verifyToken to just call next
        initializeMessageQueue: jest.fn().mockResolvedValue(undefined),
        initializeServiceDiscovery: jest.fn().mockResolvedValue(undefined),
        registerWithPostOffice: jest.fn().mockResolvedValue(undefined),
    })),
}));
jest.mock('@cktmcs/errorhandler');
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('path');
jest.mock('uuid');

// Cast mocked functions
const mockExpress = express as jest.MockedFunction<typeof express>;
const mockStoreInRedis = storeInRedis as jest.Mock;
const mockLoadFromRedis = loadFromRedis as jest.Mock;
const mockDeleteFromRedis = deleteFromRedis as jest.Mock;
const mockStoreInMongo = storeInMongo as jest.Mock;
const mockLoadFromMongo = loadFromMongo as jest.Mock;
const mockLoadManyFromMongo = loadManyFromMongo as jest.Mock;
const mockAggregateInMongo = aggregateInMongo as jest.Mock;
const mockDeleteManyFromMongo = deleteManyFromMongo as jest.Mock;
const mockAnalyzeError = analyzeError as jest.Mock;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;
const mockPath = path as jest.Mocked<typeof path>;
const mockUuidv4 = uuidv4 as jest.Mock;

describe('Librarian Service', () => {
    let librarian: Librarian;
    let mockApp: jest.Mocked<express.Application>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeAll(() => {
        // Mock express.Router() used internally by setupRoutes for /assets
        (express as any).Router = () => ({
            use: jest.fn(),
            post: jest.fn(),
            get: jest.fn(),
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock the Express app instance
        mockApp = {
            use: jest.fn(),
            post: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            listen: jest.fn((port, host, callback) => callback()), // Immediately call listen callback
        } as unknown as jest.Mocked<express.Application>;

        mockExpress.mockReturnValue(mockApp);

        // Mock path.join for consistent paths
        mockPath.join.mockImplementation((...args) => args.join('/'));

        // Mock uuidv4
        mockUuidv4.mockReturnValue('mock-uuid');

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Instantiate Librarian (this will call its constructor and setup routes)
        librarian = new Librarian();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should initialize BaseEntity and set up routes and start server', () => {
        expect(BaseEntity).toHaveBeenCalledTimes(1);
        expect(BaseEntity).toHaveBeenCalledWith('Librarian', 'Librarian', 'librarian', process.env.PORT || '5040');
        expect(mockApp.use).toHaveBeenCalled(); // For bodyParser and verifyToken middleware
        expect(mockApp.listen).toHaveBeenCalledTimes(1);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Librarian listening'));
    });

    describe('GET /health', () => {
        it('should return health status', () => {
            const mockReq = {} as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as express.Response;

            // Find the health route handler and call it
            const healthHandler = mockApp.get.mock.calls.find(call => call[0] === '/health')[1];
            healthHandler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'healthy',
                message: 'Librarian service is healthy',
            }));
        });
    });

    describe('Large Asset Routes (/assets)', () => {
        const MOCK_COLLECTION = 'test-assets';
        const MOCK_ID = 'asset-id';
        const MOCK_FILE_PATH = `/usr/src/app/shared/librarian-assets/${MOCK_COLLECTION}/${MOCK_ID}`;

        beforeEach(() => {
            process.env.LARGE_ASSET_PATH = '/usr/src/app/shared/librarian-assets';
        });

        describe('POST /assets/:collection/:id', () => {
            it('should store large asset and metadata successfully', async () => {
                const mockReq = { params: { collection: MOCK_COLLECTION, id: MOCK_ID }, headers: { 'content-type': 'image/png' }, pipe: jest.fn() } as unknown as express.Request;
                const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
                const mockWriteStream = { on: jest.fn(), end: jest.fn() };

                mockFs.createWriteStream.mockReturnValue(mockWriteStream as any);
                mockFsPromises.mkdir.mockResolvedValue(undefined);
                mockFsPromises.stat.mockResolvedValue({ size: 12345 });
                mockStoreInMongo.mockResolvedValue({ insertedId: 'mock-mongo-id' });

                // Call the handler
                const storeAssetHandler = (mockApp.use.mock.calls[0][0] as any)._router.stack.find((s: any) => s.route?.path === '/:collection/:id' && s.route?.methods?.post).handle;
                await storeAssetHandler(mockReq, mockRes);

                // Simulate stream finish
                mockWriteStream.on.mock.calls.find(call => call[0] === 'finish')[1]();
                await Promise.resolve(); // Allow promises to resolve

                expect(mockFsPromises.mkdir).toHaveBeenCalledWith(expect.stringContaining(MOCK_COLLECTION), { recursive: true });
                expect(mockFs.createWriteStream).toHaveBeenCalledWith(MOCK_FILE_PATH);
                expect(mockReq.pipe).toHaveBeenCalledWith(mockWriteStream);
                expect(mockStoreInMongo).toHaveBeenCalledWith('asset_metadata', expect.objectContaining({
                    _id: MOCK_ID,
                    assetPath: MOCK_FILE_PATH,
                    collection: MOCK_COLLECTION,
                    size: 12345,
                    mimeType: 'image/png',
                }));
                expect(mockRes.status).toHaveBeenCalledWith(201);
                expect(mockRes.send).toHaveBeenCalledWith({ message: 'Asset stored successfully', id: MOCK_ID, size: 12345 });
            });

            it('should handle write stream error', async () => {
                const mockReq = { params: { collection: MOCK_COLLECTION, id: MOCK_ID }, headers: {}, pipe: jest.fn() } as unknown as express.Request;
                const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
                const mockWriteStream = { on: jest.fn(), end: jest.fn() };

                mockFs.createWriteStream.mockReturnValue(mockWriteStream as any);
                mockFsPromises.mkdir.mockResolvedValue(undefined);

                const storeAssetHandler = (mockApp.use.mock.calls[0][0] as any)._router.stack.find((s: any) => s.route?.path === '/:collection/:id' && s.route?.methods?.post).handle;
                await storeAssetHandler(mockReq, mockRes);

                // Simulate stream error
                mockWriteStream.on.mock.calls.find(call => call[0] === 'error')[1](new Error('Stream write error'));
                await Promise.resolve();

                expect(mockRes.status).toHaveBeenCalledWith(500);
                expect(mockRes.send).toHaveBeenCalledWith({ error: 'Failed to write asset to disk' });
                expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error writing asset stream'), expect.any(Error));
            });

            it('should handle metadata storage error and cleanup file', async () => {
                const mockReq = { params: { collection: MOCK_COLLECTION, id: MOCK_ID }, headers: {}, pipe: jest.fn() } as unknown as express.Request;
                const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;
                const mockWriteStream = { on: jest.fn(), end: jest.fn() };

                mockFs.createWriteStream.mockReturnValue(mockWriteStream as any);
                mockFsPromises.mkdir.mockResolvedValue(undefined);
                mockFsPromises.stat.mockResolvedValue({ size: 123 });
                mockStoreInMongo.mockRejectedValueOnce(new Error('DB error'));
                mockFsPromises.unlink.mockResolvedValue(undefined);

                const storeAssetHandler = (mockApp.use.mock.calls[0][0] as any)._router.stack.find((s: any) => s.route?.path === '/:collection/:id' && s.route?.methods?.post).handle;
                await storeAssetHandler(mockReq, mockRes);

                // Simulate stream finish
                mockWriteStream.on.mock.calls.find(call => call[0] === 'finish')[1]();
                await Promise.resolve();

                expect(mockRes.status).toHaveBeenCalledWith(500);
                expect(mockRes.send).toHaveBeenCalledWith({ error: 'Failed to store asset metadata' });
                expect(mockFsPromises.unlink).toHaveBeenCalledWith(MOCK_FILE_PATH);
                expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to store metadata'), expect.any(Error));
            });
        });

        describe('GET /assets/:collection/:id', () => {
            it('should load large asset and stream it successfully', async () => {
                const mockReq = { params: { collection: MOCK_COLLECTION, id: MOCK_ID } } as unknown as express.Request;
                const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn(), pipe: jest.fn() } as unknown as express.Response;
                const mockReadStream = { on: jest.fn(), pipe: jest.fn() };

                mockFsPromises.access.mockResolvedValue(undefined); // File exists
                mockLoadFromMongo.mockResolvedValue({ mimeType: 'application/json' });
                mockFs.createReadStream.mockReturnValue(mockReadStream as any);

                const loadAssetHandler = (mockApp.use.mock.calls[0][0] as any)._router.stack.find((s: any) => s.route?.path === '/:collection/:id' && s.route?.methods?.get).handle;
                await loadAssetHandler(mockReq, mockRes);

                expect(mockFsPromises.access).toHaveBeenCalledWith(MOCK_FILE_PATH, fs.constants.F_OK);
                expect(mockLoadFromMongo).toHaveBeenCalledWith('asset_metadata', { _id: MOCK_ID });
                expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
                expect(mockFs.createReadStream).toHaveBeenCalledWith(MOCK_FILE_PATH);
                expect(mockReadStream.pipe).toHaveBeenCalledWith(mockRes);
            });

            it('should return 404 if asset not found', async () => {
                const mockReq = { params: { collection: MOCK_COLLECTION, id: MOCK_ID } } as unknown as express.Request;
                const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

                mockFsPromises.access.mockRejectedValueOnce({ code: 'ENOENT' });

                const loadAssetHandler = (mockApp.use.mock.calls[0][0] as any)._router.stack.find((s: any) => s.route?.path === '/:collection/:id' && s.route?.methods?.get).handle;
                await loadAssetHandler(mockReq, mockRes);

                expect(mockRes.status).toHaveBeenCalledWith(404);
                expect(mockRes.send).toHaveBeenCalledWith({ error: 'Asset not found' });
            });

            it('should handle read stream error', async () => {
                const mockReq = { params: { collection: MOCK_COLLECTION, id: MOCK_ID } } as unknown as express.Request;
                const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn(), pipe: jest.fn(), end: jest.fn() } as unknown as express.Response;
                const mockReadStream = { on: jest.fn(), pipe: jest.fn() };

                mockFsPromises.access.mockResolvedValue(undefined);
                mockLoadFromMongo.mockResolvedValue(null);
                mockFs.createReadStream.mockReturnValue(mockReadStream as any);

                const loadAssetHandler = (mockApp.use.mock.calls[0][0] as any)._router.stack.find((s: any) => s.route?.path === '/:collection/:id' && s.route?.methods?.get).handle;
                await loadAssetHandler(mockReq, mockRes);

                // Simulate stream error
                mockReadStream.on.mock.calls.find(call => call[0] === 'error')[1](new Error('Stream read error'));
                await Promise.resolve();

                expect(mockRes.end).toHaveBeenCalledTimes(1);
                expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error streaming asset'), expect.any(Error));
            });
        });
    });

    describe('POST /storeData', () => {
        it('should store data in MongoDB successfully', async () => {
            const mockReq = { body: { id: 'test-id', data: { key: 'value' }, storageType: 'mongo', collection: 'testCollection' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockStoreInMongo.mockResolvedValue({ insertedId: 'mongo-id' });

            await (librarian as any).storeData(mockReq, mockRes);

            expect(mockStoreInMongo).toHaveBeenCalledWith('testCollection', { _id: 'test-id', key: 'value' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ status: 'Data stored successfully', id: 'mongo-id' });
        });

        it('should store data in Redis successfully', async () => {
            const mockReq = { body: { id: 'test-id', data: { key: 'value' }, storageType: 'redis' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockStoreInRedis.mockResolvedValue('OK');

            await (librarian as any).storeData(mockReq, mockRes);

            expect(mockStoreInRedis).toHaveBeenCalledWith('data:test-id', JSON.stringify({ key: 'value' }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ status: 'Data stored successfully', id: 'test-id' });
        });

        it('should generate UUID for Redis if ID is not provided', async () => {
            const mockReq = { body: { data: { key: 'value' }, storageType: 'redis' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockStoreInRedis.mockResolvedValue('OK');
            mockUuidv4.mockReturnValueOnce('generated-uuid');

            await (librarian as any).storeData(mockReq, mockRes);

            expect(mockStoreInRedis).toHaveBeenCalledWith('data:generated-uuid', JSON.stringify({ key: 'value' }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ status: 'Data stored successfully', id: 'generated-uuid' });
        });

        it('should return 400 if data is missing', async () => {
            const mockReq = { body: { id: 'test-id', storageType: 'mongo' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).storeData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Data is required' });
        });

        it('should return 400 for invalid storage type', async () => {
            const mockReq = { body: { id: 'test-id', data: { key: 'value' }, storageType: 'invalid' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).storeData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Invalid storage type' });
        });

        it('should return 500 if storage operation fails', async () => {
            const mockReq = { body: { id: 'test-id', data: { key: 'value' }, storageType: 'mongo' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockStoreInMongo.mockRejectedValueOnce(new Error('Mongo error'));

            await (librarian as any).storeData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to store data' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /loadData/:id', () => {
        it('should load data from MongoDB successfully', async () => {
            const mockReq = { params: { id: 'test-id' }, query: { storageType: 'mongo', collection: 'testCollection' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockData = { _id: 'test-id', key: 'value' };
            mockLoadFromMongo.mockResolvedValueOnce(mockData);

            await (librarian as any).loadData(mockReq, mockRes);

            expect(mockLoadFromMongo).toHaveBeenCalledWith('testCollection', { _id: 'test-id' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ data: mockData });
        });

        it('should load data from Redis successfully', async () => {
            const mockReq = { params: { id: 'test-id' }, query: { storageType: 'redis' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockData = JSON.stringify({ key: 'value' });
            mockLoadFromRedis.mockResolvedValueOnce(mockData);

            await (librarian as any).loadData(mockReq, mockRes);

            expect(mockLoadFromRedis).toHaveBeenCalledWith('data:test-id');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ data: mockData });
        });

        it('should return 400 if ID is missing', async () => {
            const mockReq = { params: {}, query: {} } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'ID is required' });
        });

        it('should return 400 for invalid storage type', async () => {
            const mockReq = { params: { id: 'test-id' }, query: { storageType: 'invalid' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Invalid storage type' });
        });

        it('should return 404 if data not found', async () => {
            const mockReq = { params: { id: 'non-existent' }, query: { storageType: 'mongo' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadFromMongo.mockResolvedValueOnce(null);

            await (librarian as any).loadData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Data not found' });
        });

        it('should return 500 if load operation fails', async () => {
            const mockReq = { params: { id: 'test-id' }, query: { storageType: 'mongo' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadFromMongo.mockRejectedValueOnce(new Error('Mongo error'));

            await (librarian as any).loadData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to load data' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /storeWorkProduct', () => {
        it('should store work product successfully', async () => {
            const mockReq = { body: { agentId: 'agent1', stepId: 'step1', data: { result: 'ok' } } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockStoreInMongo.mockResolvedValueOnce('agent1_step1');

            await (librarian as any).storeWorkProduct(mockReq, mockRes);

            expect(mockStoreInMongo).toHaveBeenCalledWith('workProducts', expect.objectContaining({
                _id: 'agent1_step1',
                agentId: 'agent1',
                stepId: 'step1',
                data: { result: 'ok' },
            }));
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ status: 'Work product stored', id: 'agent1_step1' });
        });

        it('should return 400 if agentId is missing', async () => {
            const mockReq = { body: { stepId: 'step1', data: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).storeWorkProduct(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'AgentId is required' });
        });

        it('should return 400 if stepId is missing', async () => {
            const mockReq = { body: { agentId: 'agent1', data: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).storeWorkProduct(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'StepId is required' });
        });

        it('should return 500 if storage fails', async () => {
            const mockReq = { body: { agentId: 'agent1', stepId: 'step1', data: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockStoreInMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).storeWorkProduct(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to store work product' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /loadWorkProduct/:stepId', () => {
        it('should load work product successfully', async () => {
            const mockReq = { params: { stepId: 'step1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockWorkProduct = { _id: 'agent1_step1', agentId: 'agent1', stepId: 'step1' };
            mockLoadFromMongo.mockResolvedValueOnce(mockWorkProduct);

            await (librarian as any).loadWorkProduct(mockReq, mockRes);

            expect(mockLoadFromMongo).toHaveBeenCalledWith('workProducts', { stepId: 'step1' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ data: mockWorkProduct });
        });

        it('should return 400 if stepId is missing', async () => {
            const mockReq = { params: {} } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadWorkProduct(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'StepId is required' });
        });

        it('should return 404 if work product not found', async () => {
            const mockReq = { params: { stepId: 'non-existent' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadFromMongo.mockResolvedValueOnce(null);

            await (librarian as any).loadWorkProduct(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Work product not found' });
        });

        it('should return 500 if load fails', async () => {
            const mockReq = { params: { stepId: 'step1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).loadWorkProduct(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to load work product' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /queryData', () => {
        it('should query data successfully', async () => {
            const mockReq = { body: { collection: 'users', query: { name: 'test' }, limit: 10 } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockResult = [{ name: 'test' }];
            mockLoadManyFromMongo.mockResolvedValueOnce(mockResult);

            await (librarian as any).queryData(mockReq, mockRes);

            expect(mockLoadManyFromMongo).toHaveBeenCalledWith('users', { name: 'test' }, 10);
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ data: mockResult });
        });

        it('should return 400 if collection is missing', async () => {
            const mockReq = { body: { query: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).queryData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Collection and query are required' });
        });

        it('should return 400 if query is missing', async () => {
            const mockReq = { body: { collection: 'users' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).queryData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Collection and query are required' });
        });

        it('should return 500 if query fails', async () => {
            const mockReq = { body: { collection: 'users', query: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).queryData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to query data' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /getDataHistory/:id', () => {
        it('should get data history successfully', async () => {
            const mockReq = { params: { id: 'data1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockHistory = [{ version: 1, data: {} }];
            mockLoadManyFromMongo.mockResolvedValueOnce(mockHistory);

            await (librarian as any).getDataHistory(mockReq, mockRes);

            expect(mockLoadManyFromMongo).toHaveBeenCalledWith('data_versions', { id: 'data1' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ history: mockHistory });
        });

        it('should return 400 if ID is missing', async () => {
            const mockReq = { params: {} } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).getDataHistory(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'ID is required' });
        });

        it('should return 500 if history retrieval fails', async () => {
            const mockReq = { params: { id: 'data1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).getDataHistory(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to get data history' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /searchData', () => {
        it('should search data successfully', async () => {
            const mockReq = { body: { collection: 'items', query: { name: 'item' }, options: { projection: { _id: '1' } } } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockResult = [{ name: 'item' }];
            mockLoadManyFromMongo.mockResolvedValueOnce(mockResult);

            await (librarian as any).searchData(mockReq, mockRes);

            expect(mockLoadManyFromMongo).toHaveBeenCalledWith('items', { name: 'item' }, { projection: { _id: 1 } });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ data: mockResult });
        });

        it('should return 400 if collection is missing', async () => {
            const mockReq = { body: { query: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).searchData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Collection is required' });
        });

        it('should return 500 if search fails', async () => {
            const mockReq = { body: { collection: 'items', query: {} } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).searchData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to search data' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('DELETE /deleteData/:id', () => {
        it('should delete data successfully', async () => {
            const mockReq = { params: { id: 'data1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockDeleteManyFromMongo.mockResolvedValueOnce({ deletedCount: 1 });
            mockDeleteFromRedis.mockResolvedValueOnce(1);

            await (librarian as any).deleteData(mockReq, mockRes);

            expect(mockDeleteManyFromMongo).toHaveBeenCalledWith('data_versions', { id: 'data1' });
            expect(mockDeleteFromRedis).toHaveBeenCalledWith('data:data1');
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ message: 'Data deleted successfully' });
        });

        it('should return 400 if ID is missing', async () => {
            const mockReq = { params: {} } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).deleteData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'ID is required' });
        });

        it('should return 500 if delete fails', async () => {
            const mockReq = { params: { id: 'data1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockDeleteManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).deleteData(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to delete data' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /loadAllWorkProducts/:agentId', () => {
        it('should load all work products for an agent successfully', async () => {
            const mockReq = { params: { agentId: 'agent1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockWorkProducts = [{ _id: 'wp1' }, { _id: 'wp2' }];
            mockLoadManyFromMongo.mockResolvedValueOnce(mockWorkProducts);

            await (librarian as any).loadAllWorkProducts(mockReq, mockRes);

            expect(mockLoadManyFromMongo).toHaveBeenCalledWith('workProducts', { agentId: 'agent1' });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(mockWorkProducts);
        });

        it('should return empty array if no work products found', async () => {
            const mockReq = { params: { agentId: 'agent1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockResolvedValueOnce([]);

            await (librarian as any).loadAllWorkProducts(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith([]);
        });

        it('should return 400 if agentId is missing', async () => {
            const mockReq = { params: {} } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadAllWorkProducts(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Agent ID is required' });
        });

        it('should return 500 if load fails', async () => {
            const mockReq = { params: { agentId: 'agent1' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).loadAllWorkProducts(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to load work products' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /getSavedMissions', () => {
        it('should get saved missions successfully', async () => {
            const mockReq = { body: { userId: 'user1' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockMissions = [{ id: 'm1', name: 'Mission 1' }];
            mockLoadManyFromMongo.mockResolvedValueOnce(mockMissions);

            await (librarian as any).getSavedMissions(mockReq, mockRes);

            expect(mockLoadManyFromMongo).toHaveBeenCalledWith('missions', { userId: 'user1' }, { projection: { id: 1, name: 1, _id: 0 } });
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(mockMissions);
        });

        it('should return 500 if retrieval fails', async () => {
            const mockReq = { body: { userId: 'user1' } } as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).getSavedMissions(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to get saved missions' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('DELETE /deleteCollection', () => {
        it('should delete collection successfully', async () => {
            const mockReq = { query: { collection: 'tempCollection' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockDeleteManyFromMongo.mockResolvedValueOnce({ deletedCount: 5 });

            await (librarian as any).deleteCollection(mockReq, mockRes);

            expect(mockDeleteManyFromMongo).toHaveBeenCalledWith('tempCollection', {});
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith({ message: 'Collection deleted successfully' });
        });

        it('should return 400 if collection is missing', async () => {
            const mockReq = { query: {} } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).deleteCollection(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Collection is required' });
        });

        it('should return 500 if delete fails', async () => {
            const mockReq = { query: { collection: 'tempCollection' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockDeleteManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).deleteCollection(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to delete collection' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('GET /loadData', () => {
        it('should load all items from specific collections successfully', async () => {
            const mockReq = { query: { storageType: 'mongo', collection: 'domain_knowledge' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            const mockData = [{ name: 'knowledge1' }];
            mockLoadManyFromMongo.mockResolvedValueOnce(mockData);

            await (librarian as any).loadDataByQuery(mockReq, mockRes);

            expect(mockLoadManyFromMongo).toHaveBeenCalledWith('domain_knowledge', {});
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith(mockData);
        });

        it('should return empty array if no data found in specific collections', async () => {
            const mockReq = { query: { storageType: 'mongo', collection: 'domain_knowledge' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockResolvedValueOnce([]);

            await (librarian as any).loadDataByQuery(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.send).toHaveBeenCalledWith([]);
        });

        it('should return 400 for unsupported Redis query', async () => {
            const mockReq = { query: { storageType: 'redis', collection: 'domain_knowledge' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadDataByQuery(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Redis query not supported for this endpoint' });
        });

        it('should return 400 if collection is not a specific type', async () => {
            const mockReq = { query: { storageType: 'mongo', collection: 'some_other_collection' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadDataByQuery(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Please specify an ID or use the queryData endpoint' });
        });

        it('should return 400 for invalid storage type', async () => {
            const mockReq = { query: { storageType: 'invalid', collection: 'domain_knowledge' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            await (librarian as any).loadDataByQuery(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.send).toHaveBeenCalledWith({ error: 'Invalid storage type' });
        });

        it('should return 500 if load fails', async () => {
            const mockReq = { query: { storageType: 'mongo', collection: 'domain_knowledge' } } as unknown as express.Request;
            const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

            mockLoadManyFromMongo.mockRejectedValueOnce(new Error('DB error'));

            await (librarian as any).loadDataByQuery(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to load data' }));
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });
});
