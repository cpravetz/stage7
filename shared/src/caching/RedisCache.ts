import Redis from 'ioredis';
import { reportError } from '../errorhandler';

class RedisCache {
    private client: Redis;
    private static instance: RedisCache;

    private constructor() {
        try {
            this.client = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
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
                    console.error(`Redis connection error: ${err.message}. Caching will be disabled.`);
                } else {
                    reportError(err);
                }
            });

            this.client.on('connect', () => {
                console.log('Successfully connected to Redis.');
            });

        } catch (error) {
            console.error('Failed to create Redis client:', error);
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
            return null;
        }
        try {
            const data = await this.client.get(key);
            if (data) {
                return JSON.parse(data) as T;
            }
            return null;
        } catch (error) {
            reportError(error as Error);
            return null;
        }
    }

    public async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<boolean> {
        if (this.client.status !== 'ready') {
            return false;
        }
        try {
            const stringValue = JSON.stringify(value);
            await this.client.set(key, stringValue, 'EX', ttlSeconds);
            return true;
        } catch (error) {
            reportError(error as Error);
            return false;
        }
    }

    public async del(key: string): Promise<boolean> {
        if (this.client.status !== 'ready') {
            return false;
        }
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            reportError(error as Error);
            return false;
        }
    }
}

export const redisCache = RedisCache.getInstance();
