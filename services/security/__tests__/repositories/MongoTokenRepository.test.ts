import { MongoClient, Db, Collection, UpdateResult, DeleteResult, FindCursor } from 'mongodb';
import { MongoTokenRepository } from '../src/repositories/MongoTokenRepository';
import { Token } from '../src/models/Token';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('mongodb');
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions/classes
const MockedMongoClient = MongoClient as jest.MockedClass<typeof MongoClient>;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('MongoTokenRepository', () => {
    let repository: MongoTokenRepository;
    let mockDb: jest.Mocked<Db>;
    let mockCollection: jest.Mocked<Collection>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_MONGO_URL = 'mongodb://mock-mongo:27017';
    const MOCK_DB_NAME = 'mockAuthDB';
    const MOCK_COLLECTION_NAME = 'mock_tokens';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now()

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock Collection methods
        mockCollection = {
            updateOne: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
        } as any;

        // Mock Db methods
        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection),
        } as any;

        // Mock MongoClient methods
        MockedMongoClient.mockImplementation(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            db: jest.fn().mockReturnValue(mockDb),
        } as any));

        // Set process.env variables
        process.env.MONGO_URL = MOCK_MONGO_URL;

        // Instantiate repository (this calls connect() in constructor)
        repository = new MongoTokenRepository(MOCK_MONGO_URL, MOCK_DB_NAME, MOCK_COLLECTION_NAME);

        // Manually set connected to true after initial connect call in constructor
        // This is because the constructor calls connect() which is async, but the test continues sync
        (repository as any).connected = true;
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize MongoClient and call connect', () => {
            expect(MockedMongoClient).toHaveBeenCalledWith(MOCK_MONGO_URL);
            expect(MockedMongoClient.prototype.connect).toHaveBeenCalledTimes(1);
            expect(mockDb.collection).toHaveBeenCalledWith(MOCK_COLLECTION_NAME);
        });
    });

    describe('connect', () => {
        it('should connect to MongoDB', async () => {
            // Reset connected state for this test to re-run connect
            (repository as any).connected = false;
            await (repository as any).connect();

            expect(MockedMongoClient.prototype.connect).toHaveBeenCalledTimes(2); // Once in constructor, once here
            expect(mockDb.collection).toHaveBeenCalledWith(MOCK_COLLECTION_NAME);
            expect(consoleLogSpy).toHaveBeenCalledWith('MongoTokenRepository connected to MongoDB');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('initialized with collection'));
            expect((repository as any).connected).toBe(true);
        });

        it('should log error if connection fails', async () => {
            MockedMongoClient.prototype.connect.mockRejectedValueOnce(new Error('Connection refused'));
            (repository as any).connected = false;

            await (repository as any).connect();

            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to connect to MongoDB'), expect.any(Error));
            expect((repository as any).connected).toBe(false);
        });
    });

    describe('save', () => {
        const MOCK_TOKEN: Token = { id: 'token1', userId: 'user1', token: 'abc', type: 'access', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false };

        it('should save a token successfully', async () => {
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            const savedToken = await repository.save(MOCK_TOKEN);

            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { id: MOCK_TOKEN.id },
                { $set: MOCK_TOKEN },
                { upsert: true }
            );
            expect(savedToken).toEqual(MOCK_TOKEN);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Saving token: ${MOCK_TOKEN.id}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token saved: ${MOCK_TOKEN.id}`));
        });

        it('should call analyzeError and re-throw if save operation fails', async () => {
            mockCollection.updateOne.mockRejectedValueOnce(new Error('DB write error'));
            await expect(repository.save(MOCK_TOKEN)).rejects.toThrow('Failed to save token: DB write error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error saving token: ${MOCK_TOKEN.id}`), expect.any(Error));
        });
    });

    describe('findById', () => {
        const MOCK_TOKEN_ID = 'token1';
        const MOCK_TOKEN: Token = { id: MOCK_TOKEN_ID, userId: 'user1', token: 'abc', type: 'access', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false };

        it('should find a token by ID successfully', async () => {
            mockCollection.findOne.mockResolvedValueOnce(MOCK_TOKEN);

            const foundToken = await repository.findById(MOCK_TOKEN_ID);

            expect(mockCollection.findOne).toHaveBeenCalledWith({ id: MOCK_TOKEN_ID });
            expect(foundToken).toEqual(MOCK_TOKEN);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Finding token by ID: ${MOCK_TOKEN_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token found: ${MOCK_TOKEN_ID}`));
        });

        it('should return null if token not found', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);

            const foundToken = await repository.findById('non-existent');

            expect(foundToken).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token not found: non-existent`));
        });

        it('should call analyzeError and re-throw if find operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            await expect(repository.findById(MOCK_TOKEN_ID)).rejects.toThrow('Failed to find token: DB read error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error finding token by ID: ${MOCK_TOKEN_ID}`), expect.any(Error));
        });
    });

    describe('findByUserId', () => {
        const MOCK_USER_ID = 'user1';
        const MOCK_TOKENS: Token[] = [
            { id: 'token1', userId: MOCK_USER_ID, token: 'abc', type: 'access', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false },
            { id: 'token2', userId: MOCK_USER_ID, token: 'def', type: 'refresh', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), isRevoked: false },
        ];

        it('should find tokens by user ID successfully', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValueOnce(MOCK_TOKENS) } as any);

            const foundTokens = await repository.findByUserId(MOCK_USER_ID);

            expect(mockCollection.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID });
            expect(foundTokens).toEqual(MOCK_TOKENS);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Finding tokens by user ID: ${MOCK_USER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Found 2 tokens for user: ${MOCK_USER_ID}`));
        });

        it('should return empty array if no tokens found for user', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValueOnce([]) } as any);

            const foundTokens = await repository.findByUserId(MOCK_USER_ID);
            expect(foundTokens).toEqual([]);
        });

        it('should call analyzeError and re-throw if find operation fails', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockRejectedValueOnce(new Error('DB find error')) } as any);
            await expect(repository.findByUserId(MOCK_USER_ID)).rejects.toThrow('Failed to find tokens: DB find error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error finding tokens by user ID: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });

    describe('deleteById', () => {
        const MOCK_TOKEN_ID = 'token1';

        it('should delete a token by ID successfully', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 1 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            const deleted = await repository.deleteById(MOCK_TOKEN_ID);

            expect(mockCollection.deleteOne).toHaveBeenCalledWith({ id: MOCK_TOKEN_ID });
            expect(deleted).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Deleting token: ${MOCK_TOKEN_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token deleted: ${MOCK_TOKEN_ID}`));
        });

        it('should return false if token not found for deletion', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            const deleted = await repository.deleteById('non-existent');
            expect(deleted).toBe(false);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token not found for deletion: non-existent`));
        });

        it('should call analyzeError and re-throw if delete operation fails', async () => {
            mockCollection.deleteOne.mockRejectedValueOnce(new Error('DB delete error'));
            await expect(repository.deleteById(MOCK_TOKEN_ID)).rejects.toThrow('Failed to delete token: DB delete error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error deleting token: ${MOCK_TOKEN_ID}`), expect.any(Error));
        });
    });

    describe('deleteByUserId', () => {
        const MOCK_USER_ID = 'user1';

        it('should delete all tokens for a user successfully', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 2 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const deletedCount = await repository.deleteByUserId(MOCK_USER_ID);

            expect(mockCollection.deleteMany).toHaveBeenCalledWith({ userId: MOCK_USER_ID });
            expect(deletedCount).toBe(2);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Deleting all tokens for user: ${MOCK_USER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Deleted 2 tokens for user: ${MOCK_USER_ID}`));
        });

        it('should return 0 if no tokens deleted', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const deletedCount = await repository.deleteByUserId(MOCK_USER_ID);
            expect(deletedCount).toBe(0);
        });

        it('should call analyzeError and re-throw if delete operation fails', async () => {
            mockCollection.deleteMany.mockRejectedValueOnce(new Error('DB delete many error'));
            await expect(repository.deleteByUserId(MOCK_USER_ID)).rejects.toThrow('Failed to delete tokens: DB delete many error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error deleting tokens for user: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });

    describe('updateRevocationStatus', () => {
        const MOCK_TOKEN_ID = 'token1';

        it('should update token revocation status successfully', async () => {
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            const updated = await repository.updateRevocationStatus(MOCK_TOKEN_ID, true);

            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { id: MOCK_TOKEN_ID },
                { $set: { isRevoked: true, updatedAt: expect.any(Date) } }
            );
            expect(updated).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Updating token revocation status: ${MOCK_TOKEN_ID} -> true`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token revocation status updated: ${MOCK_TOKEN_ID}`));
        });

        it('should return false if token not found for update', async () => {
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            const updated = await repository.updateRevocationStatus('non-existent', true);
            expect(updated).toBe(false);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token not found for revocation update: non-existent`));
        });

        it('should call analyzeError and re-throw if update operation fails', async () => {
            mockCollection.updateOne.mockRejectedValueOnce(new Error('DB update error'));
            await expect(repository.updateRevocationStatus(MOCK_TOKEN_ID, true)).rejects.toThrow('Failed to update token: DB update error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error updating token revocation: ${MOCK_TOKEN_ID}`), expect.any(Error));
        });
    });

    describe('findExpiredTokens', () => {
        const MOCK_EXPIRED_TOKENS: Token[] = [
            { id: 'exp1', userId: 'user1', token: 'exp-abc', type: 'access', expiresAt: new Date(Date.now() - 1000), createdAt: new Date(), updatedAt: new Date(), isRevoked: false },
            { id: 'exp2', userId: 'user2', token: 'exp-def', type: 'refresh', expiresAt: new Date(Date.now() - 2000), createdAt: new Date(), updatedAt: new Date(), isRevoked: false },
        ];

        it('should find expired tokens successfully', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValueOnce(MOCK_EXPIRED_TOKENS) } as any);

            const expiredTokens = await repository.findExpiredTokens();

            expect(mockCollection.find).toHaveBeenCalledWith(expect.objectContaining({
                expiresAt: { $lt: expect.any(Date) },
                isRevoked: false,
            }));
            expect(expiredTokens).toEqual(MOCK_EXPIRED_TOKENS);
            expect(consoleLogSpy).toHaveBeenCalledWith('Finding expired tokens');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Found 2 expired tokens`));
        });

        it('should return empty array if no expired tokens found', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValueOnce([]) } as any);
            const expiredTokens = await repository.findExpiredTokens();
            expect(expiredTokens).toEqual([]);
        });

        it('should call analyzeError and re-throw if find operation fails', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockRejectedValueOnce(new Error('DB find error')) } as any);
            await expect(repository.findExpiredTokens()).rejects.toThrow('Failed to find expired tokens: DB find error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error finding expired tokens'), expect.any(Error));
        });
    });

    describe('cleanupExpiredTokens', () => {
        it('should clean up expired tokens successfully', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 5 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const cleanedUpCount = await repository.cleanupExpiredTokens();

            expect(mockCollection.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
                expiresAt: { $lt: expect.any(Date) }
            }));
            expect(cleanedUpCount).toBe(5);
            expect(consoleLogSpy).toHaveBeenCalledWith('Cleaning up expired tokens');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Cleaned up 5 expired tokens`));
        });

        it('should return 0 if no tokens cleaned up', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const cleanedUpCount = await repository.cleanupExpiredTokens();
            expect(cleanedUpCount).toBe(0);
        });

        it('should call analyzeError and re-throw if cleanup operation fails', async () => {
            mockCollection.deleteMany.mockRejectedValueOnce(new Error('DB cleanup error'));
            await expect(repository.cleanupExpiredTokens()).rejects.toThrow('Failed to cleanup tokens: DB cleanup error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error cleaning up expired tokens'), expect.any(Error));
        });
    });
});
