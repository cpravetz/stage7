import { MongoClient, Collection } from 'mongodb';
import { analyzeError } from '@cktmcs/shared';

/**
 * Interface for blacklisted token entries
 */
interface BlacklistedToken {
    id: string;
    token: string;
    tokenId: string;
    userId: string;
    reason: string;
    blacklistedAt: Date;
    expiresAt: Date;
}

/**
 * Token blacklist repository for interacting with MongoDB directly
 */
export class MongoTokenBlacklistRepository {
    private client: MongoClient;
    private collection: Collection<BlacklistedToken>;
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
        collectionName: string = 'token_blacklist'
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
            console.log('MongoTokenBlacklistRepository connected to MongoDB');
            
            const db = this.client.db(this.dbName);
            this.collection = db.collection<BlacklistedToken>(this.collectionName);
            this.connected = true;
            
            // Create indexes for better performance
            await this.collection.createIndex({ token: 1 }, { unique: true });
            await this.collection.createIndex({ tokenId: 1 });
            await this.collection.createIndex({ userId: 1 });
            await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
            
            console.log(`MongoTokenBlacklistRepository initialized with collection: ${this.collectionName}`);
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
     * Add a token to the blacklist
     * @param token Token string
     * @param tokenId Token ID
     * @param userId User ID
     * @param reason Reason for blacklisting
     * @param expiresAt When the token expires
     * @returns BlacklistedToken
     */
    async add(token: string, tokenId: string, userId: string, reason: string, expiresAt: Date): Promise<BlacklistedToken> {
        try {
            await this.ensureConnected();
            console.log(`Adding token to blacklist: ${tokenId}`);
            
            const blacklistedToken: BlacklistedToken = {
                id: `bl_${tokenId}`,
                token,
                tokenId,
                userId,
                reason,
                blacklistedAt: new Date(),
                expiresAt
            };
            
            // Insert the blacklisted token
            await this.collection.insertOne(blacklistedToken);
            
            console.log(`Token blacklisted: ${tokenId}`);
            return blacklistedToken;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error blacklisting token: ${tokenId}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to blacklist token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Check if a token exists in the blacklist
     * @param token Token string
     * @returns True if blacklisted, false otherwise
     */
    async exists(token: string): Promise<boolean> {
        try {
            await this.ensureConnected();
            
            const blacklistedToken = await this.collection.findOne({ token });
            
            const isBlacklisted = blacklistedToken !== null;
            if (isBlacklisted) {
                console.log(`Token is blacklisted: ${blacklistedToken.tokenId}`);
            }
            
            return isBlacklisted;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error checking token blacklist', error instanceof Error ? error.message : '');
            // In case of error, assume token is not blacklisted to avoid blocking valid tokens
            return false;
        }
    }

    /**
     * Check if a token ID exists in the blacklist
     * @param tokenId Token ID
     * @returns True if blacklisted, false otherwise
     */
    async existsByTokenId(tokenId: string): Promise<boolean> {
        try {
            await this.ensureConnected();
            
            const blacklistedToken = await this.collection.findOne({ tokenId });
            
            const isBlacklisted = blacklistedToken !== null;
            if (isBlacklisted) {
                console.log(`Token ID is blacklisted: ${tokenId}`);
            }
            
            return isBlacklisted;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error checking token ID blacklist: ${tokenId}`, error instanceof Error ? error.message : '');
            // In case of error, assume token is not blacklisted to avoid blocking valid tokens
            return false;
        }
    }

    /**
     * Remove a token from the blacklist
     * @param token Token string
     * @returns True if removed, false if not found
     */
    async remove(token: string): Promise<boolean> {
        try {
            await this.ensureConnected();
            console.log('Removing token from blacklist');
            
            const result = await this.collection.deleteOne({ token });
            
            if (result.deletedCount > 0) {
                console.log('Token removed from blacklist');
                return true;
            } else {
                console.log('Token not found in blacklist');
                return false;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error removing token from blacklist', error instanceof Error ? error.message : '');
            throw new Error(`Failed to remove token from blacklist: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Remove a token from the blacklist by token ID
     * @param tokenId Token ID
     * @returns True if removed, false if not found
     */
    async removeByTokenId(tokenId: string): Promise<boolean> {
        try {
            await this.ensureConnected();
            console.log(`Removing token from blacklist by ID: ${tokenId}`);
            
            const result = await this.collection.deleteOne({ tokenId });
            
            if (result.deletedCount > 0) {
                console.log(`Token removed from blacklist: ${tokenId}`);
                return true;
            } else {
                console.log(`Token not found in blacklist: ${tokenId}`);
                return false;
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error removing token from blacklist: ${tokenId}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to remove token from blacklist: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get all blacklisted tokens for a user
     * @param userId User ID
     * @returns Array of blacklisted tokens
     */
    async findByUserId(userId: string): Promise<BlacklistedToken[]> {
        try {
            await this.ensureConnected();
            console.log(`Finding blacklisted tokens for user: ${userId}`);
            
            const tokens = await this.collection.find({ userId }).toArray();
            
            console.log(`Found ${tokens.length} blacklisted tokens for user: ${userId}`);
            return tokens;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error finding blacklisted tokens for user: ${userId}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to find blacklisted tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Remove all blacklisted tokens for a user
     * @param userId User ID
     * @returns Number of tokens removed
     */
    async removeByUserId(userId: string): Promise<number> {
        try {
            await this.ensureConnected();
            console.log(`Removing all blacklisted tokens for user: ${userId}`);
            
            const result = await this.collection.deleteMany({ userId });
            
            console.log(`Removed ${result.deletedCount} blacklisted tokens for user: ${userId}`);
            return result.deletedCount;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error removing blacklisted tokens for user: ${userId}`, error instanceof Error ? error.message : '');
            throw new Error(`Failed to remove blacklisted tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clean up expired blacklisted tokens
     * @returns Number of tokens cleaned up
     */
    async cleanupExpiredTokens(): Promise<number> {
        try {
            await this.ensureConnected();
            console.log('Cleaning up expired blacklisted tokens');
            
            const now = new Date();
            const result = await this.collection.deleteMany({ 
                expiresAt: { $lt: now }
            });
            
            console.log(`Cleaned up ${result.deletedCount} expired blacklisted tokens`);
            return result.deletedCount;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error cleaning up expired blacklisted tokens', error instanceof Error ? error.message : '');
            throw new Error(`Failed to cleanup blacklisted tokens: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
