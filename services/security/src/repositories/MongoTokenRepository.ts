import { MongoClient, Collection } from 'mongodb';
import { Token } from '../models/Token';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Token repository for interacting with MongoDB directly
 */
export class MongoTokenRepository {
    private client: MongoClient;
    private collection: Collection<Token>;
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
        dbName: string = 'librarianDB',
        collectionName: string = 'tokens'
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
            console.log('MongoTokenRepository connected to MongoDB');
            
            const db = this.client.db(this.dbName);
            this.collection = db.collection<Token>(this.collectionName);
            this.connected = true;
            
            console.log(`MongoTokenRepository initialized with collection: ${this.collectionName}`);
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
     * Save a token
     * @param token Token
     * @returns Token
     */
    async save(token: Token): Promise<Token> {
        try {
            await this.ensureConnected();
            console.log(`Saving token: ${token.id}`);
            
            // Update or insert the token
            await this.collection.updateOne(
                { id: token.id },
                { $set: token },
                { upsert: true }
            );
            
            console.log(`Token saved: ${token.id}`);
            return token;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error saving token: ${token.id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to save token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Find a token by ID
     * @param id Token ID
     * @returns Token or null
     */
    async findById(id: string): Promise<Token | null> {
        try {
            await this.ensureConnected();
            console.log(`Finding token by ID: ${id}`);
            
            const token = await this.collection.findOne({ id });
            
            if (token) {
                console.log(`Token found: ${id}`);
                return token;
            } else {
                console.log(`Token not found: ${id}`);
                return null;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error finding token by ID: ${id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to find token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Find tokens by user ID
     * @param userId User ID
     * @returns Array of tokens
     */
    async findByUserId(userId: string): Promise<Token[]> {
        try {
            await this.ensureConnected();
            console.log(`Finding tokens by user ID: ${userId}`);
            
            const tokens = await this.collection.find({ userId }).toArray();
            
            console.log(`Found ${tokens.length} tokens for user: ${userId}`);
            return tokens;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error finding tokens by user ID: ${userId}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to find tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete a token by ID
     * @param id Token ID
     * @returns True if deleted, false if not found
     */
    async deleteById(id: string): Promise<boolean> {
        try {
            await this.ensureConnected();
            console.log(`Deleting token: ${id}`);
            
            const result = await this.collection.deleteOne({ id });
            
            if (result.deletedCount > 0) {
                console.log(`Token deleted: ${id}`);
                return true;
            } else {
                console.log(`Token not found for deletion: ${id}`);
                return false;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting token: ${id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to delete token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete all tokens for a user
     * @param userId User ID
     * @returns Number of tokens deleted
     */
    async deleteByUserId(userId: string): Promise<number> {
        try {
            await this.ensureConnected();
            console.log(`Deleting all tokens for user: ${userId}`);
            
            const result = await this.collection.deleteMany({ userId });
            
            console.log(`Deleted ${result.deletedCount} tokens for user: ${userId}`);
            return result.deletedCount;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error deleting tokens for user: ${userId}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to delete tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update token revocation status
     * @param id Token ID
     * @param isRevoked Revocation status
     * @returns True if updated, false if not found
     */
    async updateRevocationStatus(id: string, isRevoked: boolean): Promise<boolean> {
        try {
            await this.ensureConnected();
            console.log(`Updating token revocation status: ${id} -> ${isRevoked}`);
            
            const result = await this.collection.updateOne(
                { id },
                { $set: { isRevoked, updatedAt: new Date() } }
            );
            
            if (result.modifiedCount > 0) {
                console.log(`Token revocation status updated: ${id}`);
                return true;
            } else {
                console.log(`Token not found for revocation update: ${id}`);
                return false;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error updating token revocation: ${id}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to update token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Find expired tokens
     * @returns Array of expired tokens
     */
    async findExpiredTokens(): Promise<Token[]> {
        try {
            await this.ensureConnected();
            console.log('Finding expired tokens');
            
            const now = new Date();
            const tokens = await this.collection.find({ 
                expiresAt: { $lt: now },
                isRevoked: false 
            }).toArray();
            
            console.log(`Found ${tokens.length} expired tokens`);
            return tokens;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error finding expired tokens', error instanceof Error ? error.message : '');
            throw new Error(`Failed to find expired tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clean up expired tokens
     * @returns Number of tokens cleaned up
     */
    async cleanupExpiredTokens(): Promise<number> {
        try {
            await this.ensureConnected();
            console.log('Cleaning up expired tokens');
            
            const now = new Date();
            const result = await this.collection.deleteMany({ 
                expiresAt: { $lt: now }
            });
            
            console.log(`Cleaned up ${result.deletedCount} expired tokens`);
            return result.deletedCount;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error cleaning up expired tokens', error instanceof Error ? error.message : '');
            throw new Error(`Failed to cleanup tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
