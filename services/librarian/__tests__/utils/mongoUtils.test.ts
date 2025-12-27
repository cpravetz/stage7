import { MongoClient, Db, Collection, InsertOneResult, UpdateResult, DeleteResult, AggregationCursor } from 'mongodb';
import { connectMongo, storeInMongo, loadFromMongo, loadManyFromMongo, deleteManyFromMongo, deleteFromMongo, updateInMongo, updateManyInMongo, aggregateInMongo } from 'utils/mongoUtils';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('mongodb');
jest.mock('dotenv');
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions/classes
const MockedMongoClient = MongoClient as jest.MockedClass<typeof MongoClient>;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('mongoUtils', () => {
    let mockDb: jest.Mocked<Db>;
    let mockCollection: jest.Mocked<Collection>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_MONGO_URI = 'mongodb://mock-mongo:27017';
    const MOCK_DB_NAME = 'mockLibrarianDB';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules(); // Crucial to reset module state for `connected` flag and `db` instance

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock Collection methods
        mockCollection = {
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            deleteMany: jest.fn(),
            deleteOne: jest.fn(),
            updateMany: jest.fn(),
            aggregate: jest.fn(),
        } as any;

        // Mock Db methods
        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection),
            listCollections: jest.fn().mockReturnValue({ hasNext: jest.fn().mockResolvedValue(false) }), // Collections don't exist by default
            createCollection: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock MongoClient methods
        MockedMongoClient.mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            db: jest.fn().mockReturnValue(mockDb),
        } as any));

        // Set process.env variables
        process.env.MONGO_URI = MOCK_MONGO_URI;
        process.env.MONGO_DB = MOCK_DB_NAME;

        // Re-import the module to get a fresh state after mocks are set up
        // This ensures connectMongo() is called with our mocks
        require('../src/utils/mongoUtils');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('connectMongo', () => {
        it('should connect to MongoDB and create collections', async () => {
            // Since connectMongo is called on module import, we just need to check its effects
            expect(MockedMongoClient).toHaveBeenCalledWith(MOCK_MONGO_URI);
            expect(MockedMongoClient.prototype.connect).toHaveBeenCalledTimes(1);
            expect(MockedMongoClient.prototype.db).toHaveBeenCalledWith(MOCK_DB_NAME);
            expect(mockDb.listCollections).toHaveBeenCalledTimes(6); // For each predefined collection
            expect(mockDb.createCollection).toHaveBeenCalledTimes(6); // For each predefined collection
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully connected to MongoDB'));
        });

        it('should not create collections if they already exist', async () => {
            mockDb.listCollections.mockReturnValue({ hasNext: jest.fn().mockResolvedValue(true) }); // All collections exist
            jest.resetModules(); // Re-import to re-run connectMongo
            require('../src/utils/mongoUtils');

            expect(mockDb.createCollection).not.toHaveBeenCalled();
        });

        it('should throw error if MongoDB connection fails', async () => {
            MockedMongoClient.mockImplementationOnce(() => ({
                connect: jest.fn().mockRejectedValueOnce(new Error('Connection refused')),
                db: jest.fn(),
            } as any));
            jest.resetModules(); // Re-import to re-run connectMongo

            await expect(require('../src/utils/mongoUtils').connectMongo()).rejects.toThrow('Connection refused');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error connecting to MongoDB'), expect.any(Error));
        });
    });

    describe('storeInMongo', () => {
        it('should insert a new document if _id is not provided', async () => {
            const document = { key: 'value' };
            const mockResult: InsertOneResult = { acknowledged: true, insertedId: 'new-id' };
            mockCollection.insertOne.mockResolvedValueOnce(mockResult);

            const result = await storeInMongo('testCollection', document);

            expect(mockCollection.insertOne).toHaveBeenCalledWith(document);
            expect(mockCollection.updateOne).not.toHaveBeenCalled();
            expect(result).toBe('new-id');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Storing document in collection testCollection with ID undefined'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Document stored successfully in collection testCollection with ID new-id'));
        });

        it('should update an existing document if _id is provided', async () => {
            const document = { _id: 'existing-id', key: 'updated-value' };
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            const result = await storeInMongo('testCollection', document);

            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { _id: 'existing-id' },
                { $set: { key: 'updated-value' } },
                { upsert: true }
            );
            expect(mockCollection.insertOne).not.toHaveBeenCalled();
            expect(result).toBeNull(); // updateOne returns null for upsertedId if not upserted
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Storing document in collection testCollection with ID existing-id'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Document stored successfully in collection testCollection with ID existing-id'));
        });

        it('should upsert a document if _id is provided and it does not exist', async () => {
            const document = { _id: 'new-upsert-id', key: 'upserted-value' };
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: 'new-upsert-id', upsertedCount: 1 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            const result = await storeInMongo('testCollection', document);

            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { _id: 'new-upsert-id' },
                { $set: { key: 'upserted-value' } },
                { upsert: true }
            );
            expect(result).toBe('new-upsert-id');
        });

        it('should call analyzeError and re-throw if store operation fails', async () => {
            mockCollection.insertOne.mockRejectedValueOnce(new Error('DB write error'));
            await expect(storeInMongo('testCollection', { key: 'value' })).rejects.toThrow('DB write error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error storing document'), expect.any(Error));
        });
    });

    describe('loadFromMongo', () => {
        it('should load a document successfully', async () => {
            const mockDocument = { _id: 'doc1', data: 'value' };
            mockCollection.findOne.mockResolvedValueOnce(mockDocument);

            const result = await loadFromMongo('testCollection', { _id: 'doc1' });

            expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: 'doc1' }, undefined);
            expect(result).toEqual(mockDocument);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Loading document from collection testCollection with query:'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Document found in collection testCollection with ID doc1'));
        });

        it('should return null if document not found', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);

            const result = await loadFromMongo('testCollection', { _id: 'non-existent' });

            expect(result).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No document found in collection testCollection matching query:'));
        });

        it('should call analyzeError and re-throw if load operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            await expect(loadFromMongo('testCollection', { _id: 'doc1' })).rejects.toThrow('DB read error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading document'), expect.any(Error));
        });
    });

    describe('loadManyFromMongo', () => {
        let mockCursor: any;

        beforeEach(() => {
            mockCursor = {
                toArray: jest.fn(),
            };
            mockCollection.find.mockReturnValue(mockCursor);
        });

        it('should load multiple documents successfully', async () => {
            const mockDocuments = [{ _id: 'doc1' }, { _id: 'doc2' }];
            mockCursor.toArray.mockResolvedValueOnce(mockDocuments);

            const result = await loadManyFromMongo('testCollection', { status: 'active' });

            expect(mockCollection.find).toHaveBeenCalledWith({ status: { $eq: 'active' } }, undefined);
            expect(result).toEqual(mockDocuments);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Loading multiple documents from collection testCollection with query:'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 documents in collection testCollection'));
        });

        it('should handle _id query directly without $eq', async () => {
            const mockDocuments = [{ _id: 'doc1' }];
            mockCursor.toArray.mockResolvedValueOnce(mockDocuments);

            const result = await loadManyFromMongo('testCollection', { _id: 'doc1' });

            expect(mockCollection.find).toHaveBeenCalledWith({ _id: 'doc1' }, undefined);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Using direct _id query for doc1'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 documents in collection testCollection with _id query'));
            expect(result).toEqual(mockDocuments);
        });

        it('should load all documents if query is empty', async () => {
            const mockDocuments = [{ _id: 'doc1' }, { _id: 'doc2' }];
            mockCursor.toArray.mockResolvedValueOnce(mockDocuments);

            const result = await loadManyFromMongo('testCollection', {});

            expect(mockCollection.find).toHaveBeenCalledWith({}, undefined);
            expect(result).toEqual(mockDocuments);
        });

        it('should call analyzeError and re-throw if load operation fails', async () => {
            mockCursor.toArray.mockRejectedValueOnce(new Error('DB read many error'));
            await expect(loadManyFromMongo('testCollection', {})).rejects.toThrow('DB read many error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error loading documents'), expect.any(Error));
        });
    });

    describe('deleteManyFromMongo', () => {
        it('should delete multiple documents successfully', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 2 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            await deleteManyFromMongo('testCollection', { status: 'inactive' });

            expect(mockCollection.deleteMany).toHaveBeenCalledWith({ status: 'inactive' });
        });

        it('should call analyzeError and re-throw if delete operation fails', async () => {
            mockCollection.deleteMany.mockRejectedValueOnce(new Error('DB delete error'));
            await expect(deleteManyFromMongo('testCollection', {})).rejects.toThrow('DB delete error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('deleteFromMongo', () => {
        it('should delete a single document successfully', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 1 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            await deleteFromMongo('testCollection', { _id: 'doc1' });

            expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: 'doc1' });
        });

        it('should call analyzeError and re-throw if delete operation fails', async () => {
            mockCollection.deleteOne.mockRejectedValueOnce(new Error('DB delete one error'));
            await expect(deleteFromMongo('testCollection', {})).rejects.toThrow('DB delete one error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('updateInMongo', () => {
        it('should update a single document successfully', async () => {
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            await updateInMongo('testCollection', { _id: 'doc1' }, { $set: { status: 'updated' } });

            expect(mockCollection.updateOne).toHaveBeenCalledWith({ _id: 'doc1' }, { $set: { status: 'updated' } });
        });

        it('should call analyzeError and re-throw if update operation fails', async () => {
            mockCollection.updateOne.mockRejectedValueOnce(new Error('DB update error'));
            await expect(updateInMongo('testCollection', {}, {})).rejects.toThrow('DB update error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('updateManyInMongo', () => {
        it('should update multiple documents successfully', async () => {
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 2, modifiedCount: 2, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateMany.mockResolvedValueOnce(mockResult);

            await updateManyInMongo('testCollection', { status: 'pending' }, { $set: { status: 'processed' } });

            expect(mockCollection.updateMany).toHaveBeenCalledWith({ status: 'pending' }, { $set: { status: 'processed' } });
        });

        it('should call analyzeError and re-throw if update operation fails', async () => {
            mockCollection.updateMany.mockRejectedValueOnce(new Error('DB update many error'));
            await expect(updateManyInMongo('testCollection', {}, {})).rejects.toThrow('DB update many error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('aggregateInMongo', () => {
        let mockAggregationCursor: any;

        beforeEach(() => {
            mockAggregationCursor = {
                toArray: jest.fn(),
            };
            mockCollection.aggregate.mockReturnValue(mockAggregationCursor);
        });

        it('should aggregate documents successfully', async () => {
            const mockResult = [{ _id: 'group1', count: 5 }];
            mockAggregationCursor.toArray.mockResolvedValueOnce(mockResult);
            const pipeline = [{ $group: { _id: '$category', count: { $sum: 1 } } }];

            const result = await aggregateInMongo('testCollection', pipeline);

            expect(mockCollection.aggregate).toHaveBeenCalledWith(pipeline);
            expect(result).toEqual(mockResult);
        });

        it('should call analyzeError and re-throw if aggregate operation fails', async () => {
            mockAggregationCursor.toArray.mockRejectedValueOnce(new Error('DB aggregate error'));
            const pipeline = [{ $group: { _id: '$category', count: { $sum: 1 } } }];

            await expect(aggregateInMongo('testCollection', pipeline)).rejects.toThrow('DB aggregate error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });
});
