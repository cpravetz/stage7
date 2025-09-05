import { MongoClient, Db, Collection, UpdateResult, DeleteResult } from 'mongodb';
import { MongoUserRepository } from '../src/repositories/MongoUserRepository';
import { User } from '../src/models/User';
import { analyzeError } from '@cktmcs/errorhandler';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('mongodb');
jest.mock('uuid');
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions/classes
const MockedMongoClient = MongoClient as jest.MockedClass<typeof MongoClient>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockAnalyzeError = analyzeError as jest.Mock;

describe('MongoUserRepository', () => {
    let repository: MongoUserRepository;
    let mockDb: jest.Mocked<Db>;
    let mockCollection: jest.Mocked<Collection>;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const MOCK_MONGO_URL = 'mongodb://mock-mongo:27017';
    const MOCK_DB_NAME = 'mockAuthDB';
    const MOCK_COLLECTION_NAME = 'mock_users';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For Date.now()

        // Mock console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock Collection methods
        mockCollection = {
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            findOne: jest.fn(),
            deleteOne: jest.fn(),
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
        repository = new MongoUserRepository(MOCK_MONGO_URL, MOCK_DB_NAME, MOCK_COLLECTION_NAME);

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
            expect(consoleLogSpy).toHaveBeenCalledWith('Connected to MongoDB');
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

    describe('findById', () => {
        const MOCK_USER_ID = 'user-123';
        const MOCK_USER: User = { id: MOCK_USER_ID, username: 'test', email: 'test@example.com' } as User;

        it('should find a user by ID successfully', async () => {
            mockCollection.findOne.mockResolvedValueOnce(MOCK_USER);

            const foundUser = await repository.findById(MOCK_USER_ID);

            expect(mockCollection.findOne).toHaveBeenCalledWith({ id: MOCK_USER_ID });
            expect(foundUser).toEqual(MOCK_USER);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Finding user by ID: ${MOCK_USER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`User found with ID: ${MOCK_USER_ID}`));
        });

        it('should return undefined if user not found', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);

            const foundUser = await repository.findById('non-existent');

            expect(foundUser).toBeUndefined();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`No user found with ID: non-existent`));
        });

        it('should call analyzeError and return undefined if find operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            const foundUser = await repository.findById(MOCK_USER_ID);
            expect(foundUser).toBeUndefined();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error finding user by ID: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });

    describe('findByEmail', () => {
        const MOCK_USER_EMAIL = 'test@example.com';
        const MOCK_USER: User = { id: 'user-123', username: 'test', email: MOCK_USER_EMAIL } as User;

        it('should find a user by email successfully', async () => {
            mockCollection.findOne.mockResolvedValueOnce(MOCK_USER);

            const foundUser = await repository.findByEmail(MOCK_USER_EMAIL);

            expect(mockCollection.findOne).toHaveBeenCalledWith({ email: MOCK_USER_EMAIL });
            expect(foundUser).toEqual(MOCK_USER);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Finding user by email: ${MOCK_USER_EMAIL}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`User found with email: ${MOCK_USER_EMAIL}`));
        });

        it('should return undefined if user not found', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);

            const foundUser = await repository.findByEmail('non-existent@example.com');

            expect(foundUser).toBeUndefined();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`No user found with email: non-existent@example.com`));
        });

        it('should call analyzeError and return undefined if find operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            const foundUser = await repository.findByEmail(MOCK_USER_EMAIL);
            expect(foundUser).toBeUndefined();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error finding user by email: ${MOCK_USER_EMAIL}`), expect.any(Error));
        });
    });

    describe('findByProviderId', () => {
        const MOCK_PROVIDER = 'google';
        const MOCK_PROVIDER_ID = 'google-id-123';
        const MOCK_USER: User = { id: 'user-123', username: 'test', email: 'test@example.com', authProvider: MOCK_PROVIDER, providerUserId: MOCK_PROVIDER_ID } as User;

        it('should find a user by provider ID successfully', async () => {
            mockCollection.findOne.mockResolvedValueOnce(MOCK_USER);

            const foundUser = await repository.findByProviderId(MOCK_PROVIDER, MOCK_PROVIDER_ID);

            expect(mockCollection.findOne).toHaveBeenCalledWith({ authProvider: MOCK_PROVIDER, providerUserId: MOCK_PROVIDER_ID });
            expect(foundUser).toEqual(MOCK_USER);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Finding user by provider: ${MOCK_PROVIDER}, providerId: ${MOCK_PROVIDER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`User found with provider: ${MOCK_PROVIDER}, providerId: ${MOCK_PROVIDER_ID}`));
        });

        it('should return undefined if user not found', async () => {
            mockCollection.findOne.mockResolvedValueOnce(null);

            const foundUser = await repository.findByProviderId(MOCK_PROVIDER, 'non-existent');

            expect(foundUser).toBeUndefined();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`No user found with provider: ${MOCK_PROVIDER}, providerId: non-existent`));
        });

        it('should call analyzeError and return undefined if find operation fails', async () => {
            mockCollection.findOne.mockRejectedValueOnce(new Error('DB read error'));
            const foundUser = await repository.findByProviderId(MOCK_PROVIDER, MOCK_PROVIDER_ID);
            expect(foundUser).toBeUndefined();
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error finding user by provider: ${MOCK_PROVIDER}, providerId: ${MOCK_PROVIDER_ID}`), expect.any(Error));
        });
    });

    describe('save', () => {
        const MOCK_USER: User = { id: 'user-123', username: 'test', email: 'test@example.com' } as User;

        it('should save a user successfully', async () => {
            const mockResult: UpdateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null, upsertedCount: 0 };
            mockCollection.updateOne.mockResolvedValueOnce(mockResult);

            const savedUser = await repository.save(MOCK_USER);

            expect(mockCollection.updateOne).toHaveBeenCalledWith(
                { id: MOCK_USER.id },
                { $set: MOCK_USER },
                { upsert: true }
            );
            expect(savedUser).toEqual(MOCK_USER);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Saving user: ${MOCK_USER.id}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`User saved: ${MOCK_USER.id}`));
        });

        it('should call analyzeError and re-throw if save operation fails', async () => {
            mockCollection.updateOne.mockRejectedValueOnce(new Error('DB write error'));
            await expect(repository.save(MOCK_USER)).rejects.toThrow('Failed to save user: DB write error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error saving user: ${MOCK_USER.id}`), expect.any(Error));
        });
    });

    describe('create', () => {
        const MOCK_USER_DATA: Partial<User> = { username: 'newuser', email: 'new@example.com', password: 'pass' };

        it('should create a new user successfully', async () => {
            mockUuidv4.mockReturnValueOnce('generated-id');
            jest.spyOn(repository, 'save').mockResolvedValueOnce({ ...MOCK_USER_DATA, id: 'generated-id' } as User);

            const createdUser = await repository.create(MOCK_USER_DATA);

            expect(mockUuidv4).toHaveBeenCalledTimes(1);
            expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
                id: 'generated-id',
                username: 'newuser',
                email: 'new@example.com',
                roles: ['user'],
                isActive: true,
                isEmailVerified: false,
                mfaEnabled: false,
                failedLoginAttempts: 0,
            }));
            expect(createdUser.id).toBe('generated-id');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Creating new user with email: ${MOCK_USER_DATA.email}`));
        });

        it('should use provided ID if available', async () => {
            const userDataWithId = { ...MOCK_USER_DATA, id: 'provided-id' };
            jest.spyOn(repository, 'save').mockResolvedValueOnce({ ...userDataWithId } as User);

            const createdUser = await repository.create(userDataWithId);
            expect(mockUuidv4).not.toHaveBeenCalled();
            expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'provided-id' }));
            expect(createdUser.id).toBe('provided-id');
        });

        it('should call analyzeError and re-throw if create operation fails', async () => {
            jest.spyOn(repository, 'save').mockRejectedValueOnce(new Error('Save error'));
            await expect(repository.create(MOCK_USER_DATA)).rejects.toThrow('Failed to create user: Save error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error creating user with email: ${MOCK_USER_DATA.email}`), expect.any(Error));
        });
    });

    describe('update', () => {
        const MOCK_USER_ID = 'user-to-update';
        const MOCK_EXISTING_USER: User = { id: MOCK_USER_ID, username: 'old', email: 'old@example.com' } as User;
        const MOCK_UPDATE_DATA: Partial<User> = { username: 'updated', isActive: true };

        it('should update an existing user successfully', async () => {
            jest.spyOn(repository, 'findById').mockResolvedValueOnce(MOCK_EXISTING_USER);
            jest.spyOn(repository, 'save').mockResolvedValueOnce({ ...MOCK_EXISTING_USER, ...MOCK_UPDATE_DATA } as User);

            const updatedUser = await repository.update(MOCK_USER_ID, MOCK_UPDATE_DATA);

            expect(repository.findById).toHaveBeenCalledWith(MOCK_USER_ID);
            expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
                id: MOCK_USER_ID,
                username: 'updated',
                email: 'old@example.com',
                isActive: true,
                updatedAt: expect.any(Date),
            }));
            expect(updatedUser.username).toBe('updated');
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Updating user: ${MOCK_USER_ID}`));
        });

        it('should throw error if user not found', async () => {
            jest.spyOn(repository, 'findById').mockResolvedValueOnce(undefined);
            await expect(repository.update(MOCK_USER_ID, MOCK_UPDATE_DATA)).rejects.toThrow(`User not found: ${MOCK_USER_ID}`);
        });

        it('should call analyzeError and re-throw if update operation fails', async () => {
            jest.spyOn(repository, 'findById').mockResolvedValueOnce(MOCK_EXISTING_USER);
            jest.spyOn(repository, 'save').mockRejectedValueOnce(new Error('Save error'));
            await expect(repository.update(MOCK_USER_ID, MOCK_UPDATE_DATA)).rejects.toThrow('Failed to update user: Save error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error updating user: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });

    describe('delete', () => {
        const MOCK_USER_ID = 'user-to-delete';

        it('should delete a user successfully', async () => {
            const mockResult: DeleteResult = { acknowledged: true, deletedCount: 1 };
            mockCollection.deleteOne.mockResolvedValueOnce(mockResult);

            await repository.delete(MOCK_USER_ID);

            expect(mockCollection.deleteOne).toHaveBeenCalledWith({ id: MOCK_USER_ID });
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Deleting user: ${MOCK_USER_ID}`));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`User deleted: ${MOCK_USER_ID}`));
        });

        it('should call analyzeError and re-throw if delete operation fails', async () => {
            mockCollection.deleteOne.mockRejectedValueOnce(new Error('DB delete error'));
            await expect(repository.delete(MOCK_USER_ID)).rejects.toThrow('Failed to delete user: DB delete error');
            expect(mockAnalyzeError).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Error deleting user: ${MOCK_USER_ID}`), expect.any(Error));
        });
    });
});
