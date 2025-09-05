import { MongoRepository } from '../src/repositories/MongoRepository';
import { RepositoryConfig, PluginManifest, PluginLocator, createAuthenticatedAxios, compareVersions } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { AxiosInstance } from 'axios';

// Mock external dependencies
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    createAuthenticatedAxios: jest.fn(() => ({
        post: jest.fn(),
    })),
    compareVersions: jest.fn((v1, v2) => {
        // Simple semver comparison for mocks
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }),
}));
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions
const mockCreateAuthenticatedAxios = createAuthenticatedAxios as jest.Mock;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('MongoRepository', () => {
    let repository: MongoRepository;
    let mockAuthenticatedApiPost: jest.Mock;

    const MOCK_LIBRARIAN_URL = 'http://mock-librarian:5040';
    const MOCK_COLLECTION = 'test-plugins';

    const baseConfig: RepositoryConfig = {
        type: 'mongo',
        url: MOCK_LIBRARIAN_URL,
        options: { collection: MOCK_COLLECTION }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For circuit breaker

        mockAuthenticatedApiPost = jest.fn();
        mockCreateAuthenticatedAxios.mockReturnValue({ post: mockAuthenticatedApiPost });

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        repository = new MongoRepository(baseConfig);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided config', () => {
            expect((repository as any).librarianUrl).toBe(MOCK_LIBRARIAN_URL);
            expect((repository as any).collection).toBe(MOCK_COLLECTION);
            expect(mockCreateAuthenticatedAxios).toHaveBeenCalledWith(expect.objectContaining({
                serviceId: 'MarketplaceMongoRepository',
                securityManagerUrl: MOCK_LIBRARIAN_URL,
            }));
        });

        it('should use default librarianUrl and collection if not provided', () => {
            const defaultRepo = new MongoRepository({ type: 'mongo' });
            expect((defaultRepo as any).librarianUrl).toBe('http://librarian:5040');
            expect((defaultRepo as any).collection).toBe('plugins');
        });

        it('should prepend http:// to librarianUrl if missing', () => {
            const repo = new MongoRepository({ type: 'mongo', url: 'my-librarian:1234' });
            expect((repo as any).librarianUrl).toBe('http://my-librarian:1234');
        });
    });

    describe('makeRequest (circuit breaker)', () => {
        it('should execute request successfully and reset circuit', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: 'success' });
            (repository as any).failureCount = 1; // Simulate previous failure
            (repository as any).circuitState = 'HALF_OPEN';

            const result = await (repository as any).makeRequest(() => mockAuthenticatedApiPost());

            expect(result).toEqual({ data: 'success' });
            expect((repository as any).failureCount).toBe(0);
            expect((repository as any).circuitState).toBe('CLOSED');
        });

        it('should open circuit after failure threshold', async () => {
            mockAuthenticatedApiPost.mockRejectedValue(new Error('API error'));

            for (let i = 0; i < (repository as any).failureThreshold; i++) {
                await expect((repository as any).makeRequest(() => mockAuthenticatedApiPost())).rejects.toThrow('API error');
            }

            expect((repository as any).circuitState).toBe('OPEN');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Circuit is now OPEN'));
        });

        it('should reject immediately if circuit is open and timeout not passed', async () => {
            (repository as any).circuitState = 'OPEN';
            (repository as any).lastFailureTime = Date.now(); // Set last failure to now

            await expect((repository as any).makeRequest(() => mockAuthenticatedApiPost())).rejects.toThrow('Circuit is open. Librarian service is temporarily unavailable.');
            expect(mockAuthenticatedApiPost).not.toHaveBeenCalled();
        });

        it('should transition to HALF_OPEN after openTimeout and retry', async () => {
            (repository as any).circuitState = 'OPEN';
            (repository as any).lastFailureTime = Date.now() - (repository as any).openTimeout - 1000; // Set last failure to be in the past

            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: 'success' }); // This call will be made in HALF_OPEN

            const result = await (repository as any).makeRequest(() => mockAuthenticatedApiPost());

            expect(result).toEqual({ data: 'success' });
            expect((repository as any).circuitState).toBe('CLOSED'); // Should close after success in HALF_OPEN
            expect(mockAuthenticatedApiPost).toHaveBeenCalledTimes(1);
        });

        it('should transition to OPEN if HALF_OPEN request fails', async () => {
            (repository as any).circuitState = 'OPEN';
            (repository as any).lastFailureTime = Date.now() - (repository as any).openTimeout - 1000;

            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('API error in HALF_OPEN'));

            await expect((repository as any).makeRequest(() => mockAuthenticatedApiPost())).rejects.toThrow('API error in HALF_OPEN');

            expect((repository as any).circuitState).toBe('OPEN');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Circuit is now OPEN'));
        });
    });

    describe('store', () => {
        const mockManifest: PluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A test plugin',
            repository: { type: 'mongo' }
        };

        it('should store a plugin manifest successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { success: true } });

            await repository.store(mockManifest);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/storeData`,
                {
                    data: mockManifest,
                    collection: MOCK_COLLECTION,
                    storageType: 'mongo'
                }
            );
        });

        it('should throw error if store fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Store API error'));

            await expect(repository.store(mockManifest)).rejects.toThrow('Failed to publish plugin to MongoDB: Store API error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetch', () => {
        const mockManifest: PluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A test plugin',
            repository: { type: 'mongo' }
        };

        it('should fetch a specific version of a plugin', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [mockManifest] } });

            const result = await repository.fetch('test-plugin', '1.0.0');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/searchData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { id: 'test-plugin', version: '1.0.0' },
                    options: { limit: 1 }
                }
            );
            expect(result).toEqual(mockManifest);
        });

        it('should fetch the latest version if no version specified', async () => {
            const oldManifest = { ...mockManifest, version: '0.9.0' };
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [oldManifest, mockManifest] } });

            const result = await repository.fetch('test-plugin');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/searchData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { id: 'test-plugin' }
                }
            );
            expect(result).toEqual(mockManifest); // Should return 1.0.0 as latest
        });

        it('should return undefined if plugin not found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });
            const result = await repository.fetch('non-existent');
            expect(result).toBeUndefined();
        });

        it('should return undefined if fetch fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Fetch API error'));
            const result = await repository.fetch('test-plugin');
            expect(result).toBeUndefined();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchByVerb', () => {
        const mockManifest: PluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A test plugin',
            repository: { type: 'mongo' }
        };

        it('should fetch a plugin by verb successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [mockManifest] } });

            const result = await repository.fetchByVerb('TEST_VERB');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/searchData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { verb: 'TEST_VERB' },
                    options: {}
                }
            );
            expect(result).toEqual(mockManifest);
        });

        it('should fetch a specific version by verb', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [mockManifest] } });

            const result = await repository.fetchByVerb('TEST_VERB', '1.0.0');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/searchData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { verb: 'TEST_VERB', version: '1.0.0' },
                    options: { limit: 1 }
                }
            );
            expect(result).toEqual(mockManifest);
        });

        it('should return undefined if plugin not found by verb', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });
            const result = await repository.fetchByVerb('NON_EXISTENT_VERB');
            expect(result).toBeUndefined();
        });

        it('should return undefined if fetchByVerb fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('FetchByVerb API error'));
            const result = await repository.fetchByVerb('TEST_VERB');
            expect(result).toBeUndefined();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchAllVersions', () => {
        const mockManifest1: PluginManifest = { id: 'p1', verb: 'V1', language: 'js', version: '1.0.0', repository: { type: 'mongo' } };
        const mockManifest2: PluginManifest = { id: 'p1', verb: 'V1', language: 'js', version: '1.1.0', repository: { type: 'mongo' } };

        it('should fetch all versions of a plugin and sort them', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [mockManifest1, mockManifest2] } });

            const result = await repository.fetchAllVersions('p1');

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/searchData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { id: 'p1' }
                }
            );
            expect(result).toEqual([mockManifest2, mockManifest1]); // Sorted newest first
        });

        it('should return undefined if no versions found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });
            const result = await repository.fetchAllVersions('non-existent');
            expect(result).toBeUndefined();
        });

        it('should return undefined if fetchAllVersions fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('FetchAllVersions API error'));
            const result = await repository.fetchAllVersions('p1');
            expect(result).toBeUndefined();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('delete', () => {
        const mockPluginId = 'plugin-to-delete';
        const mockPluginVersion = '1.0.0';

        it('should delete a specific version of a plugin', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { success: true } });

            await repository.delete(mockPluginId, mockPluginVersion);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/deleteData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { id: mockPluginId, version: mockPluginVersion },
                    storageType: 'mongo',
                    multiple: false
                }
            );
        });

        it('should delete all versions of a plugin if no version specified', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { success: true } });

            await repository.delete(mockPluginId);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/deleteData`,
                {
                    collection: MOCK_COLLECTION,
                    query: { id: mockPluginId },
                    storageType: 'mongo',
                    multiple: true
                }
            );
        });

        it('should throw error if delete fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('Delete API error'));

            await expect(repository.delete(mockPluginId)).rejects.toThrow("Failed to delete plugin ID 'plugin-to-delete' from MongoDB: Delete API error");
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });

    describe('list', () => {
        const mockManifest1: PluginManifest = { id: 'p1', verb: 'V1', language: 'js', version: '1.0.0', repository: { type: 'mongo' } };
        const mockManifest2: PluginManifest = { id: 'p2', verb: 'V2', language: 'py', version: '2.0.0', repository: { type: 'mongo' } };

        it('should list all plugins successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [mockManifest1, mockManifest2] } });

            const result = await repository.list();

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `${MOCK_LIBRARIAN_URL}/searchData`,
                {
                    collection: MOCK_COLLECTION,
                    query: {},
                    options: { projection: { id: 1, verb: 1, version: 1, repositoryType: '$type', name: 1, description: 1 } }
                }
            );
            expect(result).toEqual([
                expect.objectContaining({ id: 'p1', verb: 'V1', version: '1.0.0' }),
                expect.objectContaining({ id: 'p2', verb: 'V2', version: '2.0.0' }),
            ]);
        });

        it('should return empty array if no plugins found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });
            const result = await repository.list();
            expect(result).toEqual([]);
        });

        it('should return empty array if list fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('List API error'));
            const result = await repository.list();
            expect(result).toEqual([]);
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
        });
    });
});
