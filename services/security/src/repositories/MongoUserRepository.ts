import { MongoClient, Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/User';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * User repository for interacting with MongoDB directly
 */
export class MongoUserRepository {
    private client: MongoClient;
    private collection: Collection<User>;
    private dbName: string;
    private collectionName: string;
    private connected: boolean = false;

    /**
     * Constructor
     * @param mongoUrl MongoDB URL
     * @param dbName Database name
     * @param collectionName Collection name
     */
    constructor(
        mongoUrl: string = process.env.MONGO_URL || 'mongodb://mongo:27017',
        dbName: string = 'stage7',
        collectionName: string = 'users'
    ) {
        this.client = new MongoClient(mongoUrl);
        this.dbName = dbName;
        this.collectionName = collectionName;
        
        // Connect to MongoDB
        this.connect();
    }

    /**
     * Connect to MongoDB
     */
    private async connect() {
        try {
            await this.client.connect();
            console.log('Connected to MongoDB');
            
            const db = this.client.db(this.dbName);
            this.collection = db.collection<User>(this.collectionName);
            this.connected = true;
            
            console.log(`MongoUserRepository initialized with collection: ${this.collectionName}`);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Failed to connect to MongoDB:', error instanceof Error ? error.message : '');
        }
    }

    /**
     * Ensure connection is established
     */
    private async ensureConnected() {
        if (!this.connected) {
            await this.connect();
        }
    }

    /**
     * Find a user by ID
     * @param id User ID
     * @returns User or undefined
     */
    async findById(id: string): Promise<User | undefined> {
        try {
            await this.ensureConnected();
            console.log(`Finding user by ID: ${id}`);
            
            const user = await this.collection.findOne({ id });
            
            if (user) {
                console.log(`User found with ID: ${id}`);
                return user;
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
            await this.ensureConnected();
            console.log(`Finding user by email: ${email}`);
            
            const user = await this.collection.findOne({ email });
            
            if (user) {
                console.log(`User found with email: ${email}`);
                return user;
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
            await this.ensureConnected();
            console.log(`Finding user by provider: ${provider}, providerId: ${providerId}`);
            
            const user = await this.collection.findOne({ 
                authProvider: provider, 
                providerUserId: providerId 
            });
            
            if (user) {
                console.log(`User found with provider: ${provider}, providerId: ${providerId}`);
                return user;
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
            await this.ensureConnected();
            console.log(`Saving user: ${user.id}`);
            
            // Update or insert the user
            await this.collection.updateOne(
                { id: user.id },
                { $set: user },
                { upsert: true }
            );
            
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
            await this.ensureConnected();
            console.log(`Deleting user: ${id}`);
            
            await this.collection.deleteOne({ id });
            
            console.log(`User deleted: ${id}`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting user: ${id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
