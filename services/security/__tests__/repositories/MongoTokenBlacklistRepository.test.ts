import { MongoClient, Db, Collection, InsertOneResult, DeleteResult, FindCursor } from 'mongodb';
import { MongoTokenBlacklistRepository } from '../src/repositories/MongoTokenBlacklistRepository';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('mongodb');
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions/classes
const MockedMongoClient = MongoClient as jest.MockedClass<typeof MongoClient>;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('MongoTokenBlacklistRepository', () => {
    let repository: MongoTokenBlacklistRepository;
    let mockDb: jest.Mocked<Db>;
    let mockCollection: jest.Mocked<Collection>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_MONGO_URL = 'mongodb://mock-mongo:27017';
    const MOCK_DB_NAME = 'mockAuthDB';
    const MOCK_COLLECTION_NAME = 'mock_token_blacklist';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now()

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock Collection methods
        mockCollection = {
            insertOne: jest.fn(),
            findOne: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
            createIndex: jest.fn().mockResolvedValue(undefined),
            find: jest.fn(),
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
        repository = new MongoTokenBlacklistRepository(MOCK_MONGO_URL, MOCK_DB_NAME, MOCK_COLLECTION_NAME);

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
        it('should connect to MongoDB and create indexes', async () => {
            // Reset connected state for this test to re-run connect
            (repository as any).connected = false;
            await (repository as any).connect();

            expect(MockedMongoClient.prototype.connect).toHaveBeenCalledTimes(2); // Once in constructor, once here
            expect(mockDb.collection).toHaveBeenCalledWith(MOCK_COLLECTION_NAME);
            expect(mockCollection.createIndex).toHaveBeenCalledWith({ token: 1 }, { unique: true });
            expect(mockCollection.createIndex).toHaveBeenCalledWith({ tokenId: 1 });
            expect(mockCollection.createIndex).toHaveBeenCalledWith({ userId: 1 });
            expect(mockCollection.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
            expect(consoleLogSpy).toHaveBeenCalledWith('MongoTokenBlacklistRepository connected to MongoDB');
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

    describe('add', () => {
        const MOCK_TOKEN = 'jwt-token-string';
        const MOCK_TOKEN_ID = 'jti-123';
        const MOCK_USER_ID = 'user-abc';
        const MOCK_REASON = 'logout';
        const MOCK_EXPIRES_AT = new Date(Date.now() + 3600000);

        it('should add a token to the blacklist', async () => {
            const mockResult: InsertOneResult = { acknowledged: true, insertedId: 'mock-inserted-id' };
            mockCollection.insertOne.mockResolvedValueOnce(mockResult);

            const blacklistedToken = await repository.add(MOCK_TOKEN, MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_REASON, MOCK_EXPIRES_AT);

            expect(mockCollection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
                id: `bl_${MOCK_TOKEN_ID}`,
                token: MOCK_TOKEN,
                tokenId: MOCK_TOKEN_ID,
                userId: MOCK_USER_ID,
                reason: MOCK_REASON,
                blacklistedAt: expect.any(Date),
                expiresAt: MOCK_EXPIRES_AT,
            }));
            expect(blacklistedToken.tokenId).toBe(MOCK_TOKEN_ID);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Adding token to blacklist: ${MOCK_TOKEN_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token blacklisted: ${MOCK_TOKEN_ID}`));
        });

        it('should call analyzeError and re-throw if add operation fails', async () => {
            mockCollection.insertOne.mockRejectedValueOnce(new Error('DB write error'));
            await expect(repository.add(MOCK_TOKEN, MOCK_TOKEN_ID, MOCK_USER_ID, MOCK_REASON, MOCK_EXPIRES_AT)).rejects.toThrow('Failed to blacklist token: DB write error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error blacklisting token: ${MOCK_TOKEN_ID}`), expect.any(Error));
        });
    });

    describe('exists', () => {
        const MOCK_TOKEN = 'jwt-token-string';

        it('should return true if token exists in blacklist', async () => {
            mockCollection.findOne.mockResolvedValueOnce({ token: MOCK_TOKEN, tokenId: 'jti-123' });
            const exists = await repository.exists(MOCK_TOKEN);
            expect(mockCollection.findOne).toHaveBeenCalledWith({ token: MOCK_TOKEN });
            expect(exists).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Token is blacklisted'));
        });

        it('should return false if token does not exist in blacklist', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);
            const exists = await repository.exists(MOCK_TOKEN);
            expect(exists).toBe(false);
        });

        it('should return false and log error if exists operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            const exists = await repository.exists(MOCK_TOKEN);
            expect(exists).toBe(false);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error checking token blacklist'), expect.any(Error));
        });
    });

    describe('existsByTokenId', () => {
        const MOCK_TOKEN_ID = 'jti-123';

        it('should return true if token ID exists in blacklist', async () => {
            mockCollection.findOne.mockResolvedValueOnce({ tokenId: MOCK_TOKEN_ID });
            const exists = await repository.existsByTokenId(MOCK_TOKEN_ID);
            expect(mockCollection.findOne).toHaveBeenCalledWith({ tokenId: MOCK_TOKEN_ID });
            expect(exists).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token ID is blacklisted: ${MOCK_TOKEN_ID}`));
        });

        it('should return false if token ID does not exist in blacklist', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);
            const exists = await repository.existsByTokenId(MOCK_TOKEN_ID);
            expect(exists).toBe(false);
        });

        it('should return false and log error if existsByTokenId operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            const exists = await repository.existsByTokenId(MOCK_TOKEN_ID);
            expect(exists).toBe(false);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error checking token ID blacklist: ${MOCK_TOKEN_ID}`), expect.any(Error));
        });
    });

    describe('remove', () => {
        const MOCK_TOKEN = 'jwt-token-string';

        it('should remove a token from the blacklist', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 1 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            const removed = await repository.remove(MOCK_TOKEN);

            expect(mockCollection.deleteOne).toHaveBeenCalledWith({ token: MOCK_TOKEN });
            expect(removed).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith('Removing token from blacklist');
            expect(consoleLogSpy).toHaveBeenCalledWith('Token removed from blacklist');
        });

        it('should return false if token not found', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            const removed = await repository.remove(MOCK_TOKEN);
            expect(removed).toBe(false);
            expect(consoleLogSpy).toHaveBeenCalledWith('Token not found in blacklist');
        });

        it('should call analyzeError and re-throw if remove operation fails', async () => {
            mockCollection.deleteOne.mockRejectedValueOnce(new Error('DB delete error'));
            await expect(repository.remove(MOCK_TOKEN)).rejects.toThrow('Failed to remove token from blacklist: DB delete error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error removing token from blacklist'), expect.any(Error));
        });
    });

    describe('removeByTokenId', () => {
        const MOCK_TOKEN_ID = 'jti-123';

        it('should remove a token by ID from the blacklist', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 1 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            const removed = await repository.removeByTokenId(MOCK_TOKEN_ID);

            expect(mockCollection.deleteOne).toHaveBeenCalledWith({ tokenId: MOCK_TOKEN_ID });
            expect(removed).toBe(true);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Removing token from blacklist by ID: ${MOCK_TOKEN_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token removed from blacklist: ${MOCK_TOKEN_ID}`));
        });

        it('should return false if token ID not found', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            const removed = await repository.removeByTokenId(MOCK_TOKEN_ID);
            expect(removed).toBe(false);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Token not found in blacklist: ${MOCK_TOKEN_ID}`));
        });

        it('should call analyzeError and re-throw if removeByTokenId operation fails', async () => {
            mockCollection.deleteOne.mockRejectedValueOnce(new Error('DB delete error'));
            await expect(repository.removeByTokenId(MOCK_TOKEN_ID)).rejects.toThrow('Failed to remove token from blacklist: DB delete error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error removing token from blacklist: ${MOCK_TOKEN_ID}`), expect.any(Error));
        });
    });

    describe('findByUserId', () => {
        const MOCK_USER_ID = 'user-abc';
        const mockTokens = [{ id: 'bl_1', userId: MOCK_USER_ID }, { id: 'bl_2', userId: MOCK_USER_ID }];

        it('should find blacklisted tokens by user ID', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValueOnce(mockTokens) } as any);

            const tokens = await repository.findByUserId(MOCK_USER_ID);

            expect(mockCollection.find).toHaveBeenCalledWith({ userId: MOCK_USER_ID });
            expect(tokens).toEqual(mockTokens);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Finding blacklisted tokens for user: ${MOCK_USER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Found 2 blacklisted tokens for user: ${MOCK_USER_ID}`));
        });

        it('should return empty array if no tokens found', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValueOnce([]) } as any);
            const tokens = await repository.findByUserId(MOCK_USER_ID);
            expect(tokens).toEqual([]);
        });

        it('should call analyzeError and re-throw if findByUserId operation fails', async () => {
            mockCollection.find.mockReturnValue({ toArray: jest.fn().mockRejectedValueOnce(new Error('DB find error')) } as any);
            await expect(repository.findByUserId(MOCK_USER_ID)).rejects.toThrow('Failed to find blacklisted tokens: DB find error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error finding blacklisted tokens for user: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });

    describe('removeByUserId', () => {
        const MOCK_USER_ID = 'user-abc';

        it('should remove all blacklisted tokens for a user', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 3 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const deletedCount = await repository.removeByUserId(MOCK_USER_ID);

            expect(mockCollection.deleteMany).toHaveBeenCalledWith({ userId: MOCK_USER_ID });
            expect(deletedCount).toBe(3);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Removing all blacklisted tokens for user: ${MOCK_USER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Removed 3 blacklisted tokens for user: ${MOCK_USER_ID}`));
        });

        it('should return 0 if no tokens removed', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const deletedCount = await repository.removeByUserId(MOCK_USER_ID);
            expect(deletedCount).toBe(0);
        });

        it('should call analyzeError and re-throw if removeByUserId operation fails', async () => {
            mockCollection.deleteMany.mockRejectedValueOnce(new Error('DB delete many error'));
            await expect(repository.removeByUserId(MOCK_USER_ID)).rejects.toThrow('Failed to remove blacklisted tokens: DB delete many error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error removing blacklisted tokens for user: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });

    describe('cleanupExpiredTokens', () => {
        it('should clean up expired blacklisted tokens', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 5 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const cleanedUpCount = await repository.cleanupExpiredTokens();

            expect(mockCollection.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
                expiresAt: { $lt: expect.any(Date) }
            }));
            expect(cleanedUpCount).toBe(5);
            expect(consoleLogSpy).toHaveBeenCalledWith('Cleaning up expired blacklisted tokens');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Cleaned up 5 expired blacklisted tokens`));
        });

        it('should return 0 if no tokens cleaned up', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 0 };
            mockCollection.deleteMany.mockResolvedValueOnce(mockResult);

            const cleanedUpCount = await repository.cleanupExpiredTokens();
            expect(cleanedUpCount).toBe(0);
        });

        it('should call analyzeError and re-throw if cleanupExpiredTokens operation fails', async () => {
            mockCollection.deleteMany.mockRejectedValueOnce(new Error('DB cleanup error'));
            await expect(repository.cleanupExpiredTokens()).rejects.toThrow('Failed to cleanup blacklisted tokens: DB cleanup error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error cleaning up expired blacklisted tokens'), expect.any(Error));
        });
    });
});
