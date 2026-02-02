/**
 * Enhanced cache manager with Redis support
 * Provides distributed caching for validation results and generated code
 */

import { redisCache } from '@cktmcs/shared';
import logger from './Logger';
import crypto from 'crypto';

export interface CacheOptions {
    ttl?: number; // Time to live in seconds
    prefix?: string;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    version: number;
}

/**
 * Cache manager with fallback to in-memory
 */
export class CacheManager {
    private inMemoryCache: Map<string, CacheEntry<any>> = new Map();
    private readonly CACHE_VERSION = 1;
    private readonly DEFAULT_TTL = 3600; // 1 hour

    /**
     * Generate cache key from data
     */
    generateKey(prefix: string, data: any): string {
        const hash = crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
        return `${prefix}:${hash}`;
    }

    /**
     * Get value from cache (Redis first, fallback to in-memory)
     */
    async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
        const fullKey = this.prefixKey(key, options?.prefix);

        try {
            // Try Redis first
            const cachedValue = await redisCache.get<CacheEntry<T>>(fullKey);
            if (cachedValue) {
                logger.debug('Cache hit (Redis)', { key: fullKey });
                return cachedValue.data;
            }
        } catch (error) {
            logger.warn('Redis cache read failed, falling back to in-memory', {
                key: fullKey,
                error: (error as Error).message
            });
        }

        // Fallback to in-memory cache
        const inMemoryEntry = this.inMemoryCache.get(fullKey);
        if (inMemoryEntry && !this.isExpired(inMemoryEntry)) {
            logger.debug('Cache hit (in-memory)', { key: fullKey });
            return inMemoryEntry.data;
        }

        if (inMemoryEntry) {
            this.inMemoryCache.delete(fullKey);
        }

        logger.debug('Cache miss', { key: fullKey });
        return null;
    }

    /**
     * Set value in cache
     */
    async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
        const fullKey = this.prefixKey(key, options?.prefix);
        const ttl = options?.ttl || this.DEFAULT_TTL;

        const cacheEntry: CacheEntry<T> = {
            data: value,
            timestamp: Date.now(),
            version: this.CACHE_VERSION
        };

        try {
            // Store in Redis
            await redisCache.set(fullKey, cacheEntry, ttl);
            logger.debug('Cached in Redis', { key: fullKey, ttl });
        } catch (error) {
            logger.warn('Redis cache write failed, using in-memory only', {
                key: fullKey,
                error: (error as Error).message
            });
        }

        // Also store in in-memory cache as backup
        this.inMemoryCache.set(fullKey, cacheEntry);
    }

    /**
     * Check if entry is expired
     */
    private isExpired(entry: CacheEntry<any>): boolean {
        const age = (Date.now() - entry.timestamp) / 1000; // Age in seconds
        return age > this.DEFAULT_TTL;
    }

    /**
     * Delete from cache
     */
    async delete(key: string, prefix?: string): Promise<void> {
        const fullKey = this.prefixKey(key, prefix);

        try {
            // Try to delete from Redis if available
            if (typeof (redisCache as any).delete === 'function') {
                await (redisCache as any).delete(fullKey);
                logger.debug('Deleted from Redis cache', { key: fullKey });
            }
        } catch (error) {
            logger.warn('Redis cache delete failed', {
                key: fullKey,
                error: (error as Error).message
            });
        }

        this.inMemoryCache.delete(fullKey);
    }

    /**
     * Clear all cache entries with a prefix
     */
    async clearPrefix(prefix: string): Promise<void> {
        // Clear in-memory entries with prefix
        for (const key of this.inMemoryCache.keys()) {
            if (key.startsWith(prefix)) {
                this.inMemoryCache.delete(key);
            }
        }

        // Note: Redis pattern delete would need to be implemented with SCAN command
        logger.info('Cleared cache entries with prefix', { prefix });
    }

    /**
     * Get cache statistics
     */
    getStatistics(): { inMemorySize: number } {
        return {
            inMemorySize: this.inMemoryCache.size
        };
    }

    /**
     * Prefix a key
     */
    private prefixKey(key: string, prefix?: string): string {
        return prefix ? `${prefix}:${key}` : key;
    }
}

/**
 * Specialized cache for validation results
 */
export class ValidationCache {
    private cache: CacheManager;
    private readonly PREFIX = 'validation';
    private readonly VALIDATION_TTL = 3600; // 1 hour

    constructor() {
        this.cache = new CacheManager();
    }

    /**
     * Get validation result from cache
     */
    async getValidationResult(pluginOrManifest: any): Promise<{ valid: boolean; issues: string[] } | null> {
        const key = this.cache.generateKey(this.PREFIX, pluginOrManifest);
        return this.cache.get(key, { prefix: this.PREFIX });
    }

    /**
     * Cache validation result
     */
    async cacheValidationResult(
        pluginOrManifest: any,
        result: { valid: boolean; issues: string[] }
    ): Promise<void> {
        const key = this.cache.generateKey(this.PREFIX, pluginOrManifest);
        await this.cache.set(key, result, { prefix: this.PREFIX, ttl: this.VALIDATION_TTL });
        logger.debug('Cached validation result', { valid: result.valid });
    }

    /**
     * Clear all validation cache
     */
    async clearAll(): Promise<void> {
        await this.cache.clearPrefix(this.PREFIX);
        logger.info('Cleared validation cache');
    }
}

/**
 * Specialized cache for generated code
 */
export class GeneratedCodeCache {
    private cache: CacheManager;
    private readonly PREFIX = 'generated_code';
    private readonly CODE_TTL = 7200; // 2 hours

    constructor() {
        this.cache = new CacheManager();
    }

    /**
     * Get generated code from cache
     */
    async getGeneratedCode(verb: string, context: Map<string, any>, language: string): Promise<any | null> {
        const cacheData = { verb, context: Array.from(context.entries()), language };
        const key = this.cache.generateKey(this.PREFIX, cacheData);
        return this.cache.get(key, { prefix: this.PREFIX });
    }

    /**
     * Cache generated code
     */
    async cacheGeneratedCode(
        verb: string,
        context: Map<string, any>,
        language: string,
        code: any
    ): Promise<void> {
        const cacheData = { verb, context: Array.from(context.entries()), language };
        const key = this.cache.generateKey(this.PREFIX, cacheData);
        await this.cache.set(key, code, { prefix: this.PREFIX, ttl: this.CODE_TTL });
        logger.debug('Cached generated code', { verb, language });
    }

    /**
     * Clear cache for a specific verb
     */
    async clearVerbCache(verb: string): Promise<void> {
        const prefix = `${this.PREFIX}:${verb}`;
        await this.cache.clearPrefix(prefix);
        logger.info('Cleared generated code cache for verb', { verb });
    }
}

/**
 * Singleton instances
 */
export const cacheManager = new CacheManager();
export const validationCache = new ValidationCache();
export const generatedCodeCache = new GeneratedCodeCache();
