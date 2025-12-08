import Redis from 'ioredis';
import { reportError } from '../errorhandler';

class RedisCache {
    private client: Redis;
    private static instance: RedisCache;

    private constructor() {
        try {
            const redisHost = process.env.REDIS_HOST || 'localhost';
            const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

            console.log(`[RedisCache] Initializing Redis client with host: ${redisHost}, port: ${redisPort}`);

            this.client = new Redis({
                host: redisHost,
                port: redisPort,
                lazyConnect: true,
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    const delay = Math.min(times * 50, 2000); // 50ms, 100ms, 150ms... up to 2s
                    return delay;
                },
            });

            this.client.on('error', (err) => {
                // Prevent error spam by only logging connection errors once
                if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
                    console.error(`[RedisCache] Connection error: ${err.message}. Caching will be disabled.`);
                } else {
                    reportError(err);
                }
            });

            this.client.on('connect', () => {
                console.log('[RedisCache] Successfully connected to Redis.');
            });

            this.client.on('ready', () => {
                console.log('[RedisCache] Redis client is ready.');
            });

        } catch (error) {
            console.error('[RedisCache] Failed to create Redis client:', error);
            // In case of a startup error, we'll use a mock client to prevent crashes
            this.client = {
                get: async () => null,
                set: async () => 'OK',
                del: async () => 1,
                on: () => {},
                status: 'disconnected',
            } as any;
        }
    }

    public static getInstance(): RedisCache {
        if (!RedisCache.instance) {
            RedisCache.instance = new RedisCache();
        }
        return RedisCache.instance;
    }

    public async get<T>(key: string): Promise<T | null> {
        if (this.client.status !== 'ready') {
            console.warn(`[RedisCache] Cannot get key '${key}': Redis client status is '${this.client.status}', not 'ready'`);
            return null;
        }
        try {
            const data = await this.client.get(key);
            if (data) {
                return JSON.parse(data) as T;
            }
            return null;
        } catch (error) {
            console.error(`[RedisCache] Error getting key '${key}':`, error);
            reportError(error as Error);
            return null;
        }
    }

    public async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<boolean> {
        if (this.client.status !== 'ready') {
            console.warn(`[RedisCache] Cannot set key '${key}': Redis client status is '${this.client.status}', not 'ready'`);
            return false;
        }
        try {
            const stringValue = JSON.stringify(value);
            await this.client.set(key, stringValue, 'EX', ttlSeconds);
            return true;
        } catch (error) {
            console.error(`[RedisCache] Error setting key '${key}':`, error);
            reportError(error as Error);
            return false;
        }
    }

    public async del(key: string): Promise<boolean> {
        if (this.client.status !== 'ready') {
            console.warn(`[RedisCache] Cannot delete key '${key}': Redis client status is '${this.client.status}', not 'ready'`);
            return false;
        }
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error(`[RedisCache] Error deleting key '${key}':`, error);
            reportError(error as Error);
            return false;
        }
    }

    public async connect(): Promise<void> {
        if (this.client.status === 'ready') {
            console.log('[RedisCache] Already connected to Redis.');
            return;
        }

        try {
            console.log('[RedisCache] Attempting to connect to Redis...');
            await this.client.connect();
            console.log('[RedisCache] Connection attempt completed.');
        } catch (error) {
            console.error('[RedisCache] Failed to connect to Redis:', error);
            throw error;
        }
    }

    public getStatus(): string {
        return this.client.status;
    }
}

export const redisCache = RedisCache.getInstance();
