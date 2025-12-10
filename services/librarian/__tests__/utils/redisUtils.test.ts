import { storeInRedis, loadFromRedis, deleteFromRedis } from 'utils/redisUtils';
import { createClient, RedisClientType } from 'redis';

// Mock external dependencies
jest.mock('redis');
jest.mock('dotenv');

// Cast mocked functions/classes
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('redisUtils', () => {
    let mockRedisClient: jest.Mocked<RedisClientType>;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_REDIS_HOST = 'mock-redis';
    const MOCK_REDIS_PORT = '6379';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules(); // Reset module to re-import redisUtils and re-run createClient

        // Mock RedisClientType methods
        mockRedisClient = {
            on: jest.fn(),
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
        } as any;

        // Mock createClient to return our mocked client
        mockCreateClient.mockReturnValue(mockRedisClient);

        // Set process.env variables
        process.env.REDIS_HOST = MOCK_REDIS_HOST;
        process.env.REDIS_PORT = MOCK_REDIS_PORT;

        // Suppress console errors for the client.on('error') handler
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Re-import redisUtils after mocks are set up
        // This will trigger the createClient call within the module
        require('../src/utils/redisUtils');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should initialize redis client with correct URL', () => {
        expect(mockCreateClient).toHaveBeenCalledWith({
            url: `redis://${MOCK_REDIS_HOST}:${MOCK_REDIS_PORT}`
        });
        expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should log Redis client errors', () => {
        const errorHandler = mockRedisClient.on.mock.calls[0][1];
        const mockError = new Error('Redis connection lost');
        errorHandler(mockError);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Redis Client Error', mockError);
    });

    describe('storeInRedis', () => {
        it('should store data in Redis as JSON string', async () => {
            mockRedisClient.set.mockResolvedValueOnce('OK');
            const key = 'testKey';
            const value = { data: 'testValue' };
            const result = await storeInRedis(key, value);
            expect(mockRedisClient.set).toHaveBeenCalledWith(key, JSON.stringify(value));
            expect(result).toBe('OK');
        });

        it('should handle errors during store operation', async () => {
            mockRedisClient.set.mockRejectedValueOnce(new Error('Redis set error'));
            const key = 'testKey';
            const value = { data: 'testValue' };
            await expect(storeInRedis(key, value)).rejects.toThrow('Redis set error');
        });
    });

    describe('loadFromRedis', () => {
        it('should load and parse data from Redis', async () => {
            const key = 'testKey';
            const storedValue = JSON.stringify({ data: 'loadedValue' });
            mockRedisClient.get.mockResolvedValueOnce(storedValue);
            const result = await loadFromRedis(key);
            expect(mockRedisClient.get).toHaveBeenCalledWith(key);
            expect(result).toEqual({ data: 'loadedValue' });
        });

        it('should return null if key not found', async () => {
            const key = 'nonExistentKey';
            mockRedisClient.get.mockResolvedValueOnce(null);
            const result = await loadFromRedis(key);
            expect(mockRedisClient.get).toHaveBeenCalledWith(key);
            expect(result).toBeNull();
        });

        it('should handle errors during load operation', async () => {
            mockRedisClient.get.mockRejectedValueOnce(new Error('Redis get error'));
            const key = 'testKey';
            await expect(loadFromRedis(key)).rejects.toThrow('Redis get error');
        });

        it('should handle invalid JSON data', async () => {
            const key = 'invalidJson';
            mockRedisClient.get.mockResolvedValueOnce('not json');
            await expect(loadFromRedis(key)).rejects.toThrow(SyntaxError);
        });
    });

    describe('deleteFromRedis', () => {
        it('should delete data from Redis', async () => {
            mockRedisClient.del.mockResolvedValueOnce(1); // 1 indicates success
            const key = 'testKey';
            const result = await deleteFromRedis(key);
            expect(mockRedisClient.del).toHaveBeenCalledWith(key);
            expect(result).toBe(1);
        });

        it('should handle errors during delete operation', async () => {
            mockRedisClient.del.mockRejectedValueOnce(new Error('Redis del error'));
            const key = 'testKey';
            await expect(deleteFromRedis(key)).rejects.toThrow('Redis del error');
        });
    });
});
