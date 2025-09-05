import { initUserService, findUserByEmail, findUserById, findUserByProviderId, createUser, updateUser } from '../src/services/userService';
import { User } from '../src/models/User';
import { BaseEntity } from '@cktmcs/shared';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('uuid');
jest.mock('@cktmcs/shared', () => ({
    ...jest.requireActual('@cktmcs/shared'),
    BaseEntity: jest.fn().mockImplementation(() => ({
        getServiceUrls: jest.fn().mockResolvedValue({ librarianUrl: 'mock-librarian:5040' }),
        authenticatedApi: {
            post: jest.fn(),
        },
    })),
}));

describe('userService', () => {
    let mockSecurityManager: jest.Mocked<BaseEntity>;
    let mockAuthenticatedApiPost: jest.Mock;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_LIBRARIAN_URL = 'mock-librarian:5040';

    beforeEach(() => {
        jest.clearAllMocks();

        // Create a new mock BaseEntity instance for each test
        mockSecurityManager = new (BaseEntity as any)();
        mockAuthenticatedApiPost = mockSecurityManager.authenticatedApi.post as jest.Mock;

        // Initialize the userService with the mock SecurityManager
        initUserService(mockSecurityManager);

        // Mock uuidv4
        (uuidv4 as jest.Mock).mockReturnValue('mock-uuid');

        // Suppress console logs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('initUserService should initialize securityManager', () => {
        // Already initialized in beforeEach
        expect((userService as any).securityManager).toBe(mockSecurityManager);
    });

    describe('findUserByEmail', () => {
        const MOCK_EMAIL = 'test@example.com';
        const MOCK_USER: User = { id: 'user-1', email: MOCK_EMAIL, username: 'test' } as User;

        it('should find a user by email successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [MOCK_USER] } });

            const user = await findUserByEmail(MOCK_EMAIL);

            expect(mockSecurityManager.getServiceUrls).toHaveBeenCalledTimes(1);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `http://${MOCK_LIBRARIAN_URL}/queryData`,
                { collection: 'users', query: { email: MOCK_EMAIL }, limit: 1 }
            );
            expect(user).toEqual(MOCK_USER);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('findUserByEmail called for:'), MOCK_EMAIL);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('User found in database'));
        });

        it('should return null if user not found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });

            const user = await findUserByEmail(MOCK_EMAIL);

            expect(user).toBeNull();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('User not found in database'));
        });

        it('should throw error if securityManager is not initialized', async () => {
            initUserService(null as any); // De-initialize
            await expect(findUserByEmail(MOCK_EMAIL)).rejects.toThrow('UserService not initialized with SecurityManager instance');
        });

        it('should log error and return null if API call fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('API error'));

            const user = await findUserByEmail(MOCK_EMAIL);

            expect(user).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error finding user by email:'), MOCK_EMAIL, expect.any(String));
        });
    });

    describe('findUserById', () => {
        const MOCK_ID = 'user-1';
        const MOCK_USER: User = { id: MOCK_ID, email: 'test@example.com', username: 'test' } as User;

        it('should find a user by ID successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [MOCK_USER] } });

            const user = await findUserById(MOCK_ID);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `http://${MOCK_LIBRARIAN_URL}/queryData`,
                { collection: 'users', query: { id: MOCK_ID }, limit: 1 }
            );
            expect(user).toEqual(MOCK_USER);
        });

        it('should return null if user not found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });

            const user = await findUserById(MOCK_ID);

            expect(user).toBeNull();
        });

        it('should throw error if securityManager is not initialized', async () => {
            initUserService(null as any);
            await expect(findUserById(MOCK_ID)).rejects.toThrow('UserService not initialized with SecurityManager instance');
        });

        it('should log error and return null if API call fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('API error'));

            const user = await findUserById(MOCK_ID);

            expect(user).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error finding user by id:'), MOCK_ID, expect.any(String));
        });
    });

    describe('findUserByProviderId', () => {
        const MOCK_PROVIDER = 'google';
        const MOCK_PROVIDER_ID = 'google-id-123';
        const MOCK_USER: User = { id: 'user-1', email: 'test@example.com', username: 'test', authProvider: MOCK_PROVIDER, providerUserId: MOCK_PROVIDER_ID } as User;

        it('should find a user by provider ID successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [MOCK_USER] } });

            const user = await findUserByProviderId(MOCK_PROVIDER, MOCK_PROVIDER_ID);

            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `http://${MOCK_LIBRARIAN_URL}/queryData`,
                { collection: 'users', query: { provider: MOCK_PROVIDER, providerId: MOCK_PROVIDER_ID }, limit: 1 }
            );
            expect(user).toEqual(MOCK_USER);
        });

        it('should return null if user not found', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: { data: [] } });

            const user = await findUserByProviderId(MOCK_PROVIDER, MOCK_PROVIDER_ID);

            expect(user).toBeNull();
        });

        it('should throw error if securityManager is not initialized', async () => {
            initUserService(null as any);
            await expect(findUserByProviderId(MOCK_PROVIDER, MOCK_PROVIDER_ID)).rejects.toThrow('UserService not initialized with SecurityManager instance');
        });

        it('should log error and return null if API call fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('API error'));

            const user = await findUserByProviderId(MOCK_PROVIDER, MOCK_PROVIDER_ID);

            expect(user).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error finding user by provider:'), MOCK_PROVIDER, MOCK_PROVIDER_ID, expect.any(String));
        });
    });

    describe('createUser', () => {
        const MOCK_USER_DATA: Partial<User> = { email: 'new@example.com', username: 'newuser' };
        const MOCK_CREATED_USER: User = { id: 'mock-uuid', email: 'new@example.com', username: 'newuser' } as User;

        it('should create a user successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: MOCK_CREATED_USER });

            const user = await createUser(MOCK_USER_DATA);

            expect(mockSecurityManager.getServiceUrls).toHaveBeenCalledTimes(1);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `http://${MOCK_LIBRARIAN_URL}/storeData`,
                { id: 'mock-uuid', data: MOCK_USER_DATA, storageType: 'mongo', collection: 'users' }
            );
            expect(user).toEqual(MOCK_CREATED_USER);
        });

        it('should throw error if securityManager is not initialized', async () => {
            initUserService(null as any);
            await expect(createUser(MOCK_USER_DATA)).rejects.toThrow('UserService not initialized with SecurityManager instance');
        });

        it('should throw error if API call fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('API error'));

            await expect(createUser(MOCK_USER_DATA)).rejects.toThrow('API error');
        });
    });

    describe('updateUser', () => {
        const MOCK_ID = 'user-to-update';
        const MOCK_UPDATE_DATA: Partial<User> = { username: 'updateduser' };
        const MOCK_UPDATED_USER: User = { id: MOCK_ID, email: 'test@example.com', username: 'updateduser' } as User;

        it('should update a user successfully', async () => {
            mockAuthenticatedApiPost.mockResolvedValueOnce({ data: MOCK_UPDATED_USER });

            const user = await updateUser(MOCK_ID, MOCK_UPDATE_DATA);

            expect(mockSecurityManager.getServiceUrls).toHaveBeenCalledTimes(1);
            expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
                `http://${MOCK_LIBRARIAN_URL}/storeData`,
                { id: MOCK_ID, data: MOCK_UPDATE_DATA, storageType: 'mongo', collection: 'users' }
            );
            expect(user).toEqual(MOCK_UPDATED_USER);
        });

        it('should throw error if securityManager is not initialized', async () => {
            initUserService(null as any);
            await expect(updateUser(MOCK_ID, MOCK_UPDATE_DATA)).rejects.toThrow('UserService not initialized with SecurityManager instance');
        });

        it('should throw error if API call fails', async () => {
            mockAuthenticatedApiPost.mockRejectedValueOnce(new Error('API error'));

            await expect(updateUser(MOCK_ID, MOCK_UPDATE_DATA)).rejects.toThrow('API error');
        });
    });
});
