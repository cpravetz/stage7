import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/User';
import { analyzeError } from '@cktmcs/errorhandler';
import { ServiceTokenManager } from '@cktmcs/shared';

/**
 * User repository for interacting with the database
 */
export class UserRepository {
    private librarianUrl: string;
    private collection: string;
    private tokenManager: ServiceTokenManager;
    private securityManagerUrl: string;

    /**
     * Constructor
     * @param librarianUrl Librarian URL
     * @param collection Collection name
     */
    constructor(
        librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040',
        collection: string = 'users',
        securityManagerUrl: string = process.env.SECURITY_MANAGER_URL || 'securitymanager:5010'
    ) {
        this.librarianUrl = librarianUrl;
        this.collection = collection;
        this.securityManagerUrl = securityManagerUrl;

        // Initialize token manager
        const serviceId = 'SecurityManager';
        const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
        this.tokenManager = ServiceTokenManager.getInstance(
            `http://${this.securityManagerUrl}`,
            serviceId,
            serviceSecret
        );

        console.log(`UserRepository initialized with Librarian URL: ${this.librarianUrl}`);
    }

    /**
     * Find a user by ID
     * @param id User ID
     * @returns User or undefined
     */
    async findById(id: string): Promise<User | undefined> {
        try {
            console.log(`Finding user by ID: ${id}`);

            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            const response = await axios.post(`http://${this.librarianUrl}/queryData`, {
                collection: this.collection,
                query: { id:id },
                limit: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                console.log(`User found with ID: ${id}`);
                return response.data.data[0];
            }
            console.log(`No user found with ID: ${id}`);
            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error finding user by ID: ${id}`, error instanceof Error ? error.message : '');
            return undefined;
        }
    }

    /**
     * Find a user by email
     * @param email Email
     * @returns User or undefined
     */
    async findByEmail(email: string): Promise<User | undefined> {
        try {
            console.log(`Finding user by email: ${email}`);

            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            const response = await axios.post(`http://${this.librarianUrl}/queryData`, {
                collection: this.collection,
                query: { email },
                limit: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                console.log(`User found with email: ${email}`);
                return response.data.data[0];
            }
            console.log(`No user found with email: ${email}`);
            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error finding user by email: ${email}`, error instanceof Error ? error.message : '');
            return undefined;
        }
    }

    /**
     * Find a user by provider ID
     * @param provider Provider name
     * @param providerId Provider ID
     * @returns User or undefined
     */
    async findByProviderId(provider: string, providerId: string): Promise<User | undefined> {
        try {
            console.log(`Finding user by provider: ${provider}, providerId: ${providerId}`);

            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            const response = await axios.post(`http://${this.librarianUrl}/queryData`, {
                collection: this.collection,
                query: { authProvider: provider, providerUserId: providerId },
                limit: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                console.log(`User found with provider: ${provider}, providerId: ${providerId}`);
                return response.data.data[0];
            }
            console.log(`No user found with provider: ${provider}, providerId: ${providerId}`);
            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error finding user by provider: ${provider}, providerId: ${providerId}`, error instanceof Error ? error.message : '');
            return undefined;
        }
    }

    /**
     * Save a user
     * @param user User
     * @returns User
     */
    async save(user: User): Promise<User> {
        try {
            console.log(`Saving user: ${user.id}`);

            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            const response = await axios.post(`http://${this.librarianUrl}/storeData`, {
                id: user.id,
                data: user,
                storageType: 'mongo',
                collection: this.collection
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log(`User saved: ${user.id}`);
            return user;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving user: ${user.id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to save user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create a new user
     * @param userData User data
     * @returns User
     */
    async create(userData: Partial<User>): Promise<User> {
        try {
            console.log(`Creating new user with email: ${userData.email}`);
            const user: User = {
                id: userData.id || uuidv4(),
                username: userData.username || '',
                email: userData.email || '',
                password: userData.password,
                firstName: userData.firstName,
                lastName: userData.lastName,
                roles: userData.roles || ['user'],
                permissions: userData.permissions || [],
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: userData.isActive !== undefined ? userData.isActive : true,
                isEmailVerified: userData.isEmailVerified !== undefined ? userData.isEmailVerified : false,
                mfaEnabled: userData.mfaEnabled !== undefined ? userData.mfaEnabled : false,
                failedLoginAttempts: userData.failedLoginAttempts !== undefined ? userData.failedLoginAttempts : 0
            };

            return await this.save(user);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error creating user with email: ${userData.email}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to create user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update a user
     * @param id User ID
     * @param userData User data
     * @returns User
     */
    async update(id: string, userData: Partial<User>): Promise<User> {
        try {
            console.log(`Updating user: ${id}`);
            const existingUser = await this.findById(id);
            if (!existingUser) {
                throw new Error(`User not found: ${id}`);
            }

            const updatedUser: User = {
                ...existingUser,
                ...userData,
                id, // Ensure ID doesn't change
                updatedAt: new Date()
            };

            return await this.save(updatedUser);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error updating user: ${id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to update user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete a user
     * @param id User ID
     */
    async delete(id: string): Promise<void> {
        try {
            console.log(`Deleting user: ${id}`);

            // Get a token for authentication
            const token = await this.tokenManager.getToken();

            await axios.post(`http://${this.librarianUrl}/deleteData`, {
                collection: this.collection,
                query: { id }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log(`User deleted: ${id}`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting user: ${id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
