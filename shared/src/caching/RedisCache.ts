import Redis from 'ioredis';

function reportError(error: Error): void {
  console.error('Error details:');
  console.error(`- Message: ${error.message}`);
  console.error(`- Name: ${error.name}`);
  
  if (error.stack) {
    console.error(`- Stack trace: ${error.stack}`);
  }
  
  // Additional error properties that might be available
  const anyError = error as any;
  if (anyError.code) {
    console.error(`- Error code: ${anyError.code}`);
  }
  
  if (anyError.statusCode) {
    console.error(`- Status code: ${anyError.statusCode}`);
  }
  
  if (anyError.response) {
    console.error('- Response data:', anyError.response.data);
    console.error(`- Response status: ${anyError.response.status}`);
  }
}

class RedisCache {
    private client: Redis;
    private static instance: RedisCache;
    private connectionPromise: Promise<void> | null = null;

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

            // Auto-connect immediately in the background (non-blocking)
            this.connectionPromise = this._autoConnect();

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

    private async _autoConnect(): Promise<void> {
        try {
            console.log('[RedisCache] Auto-connecting to Redis...');
            await this.client.connect();
            console.log('[RedisCache] Auto-connect completed.');
        } catch (error) {
            console.error('[RedisCache] Auto-connect failed:', error);
            // Don't throw - let operations handle the disconnected state
        }
    }

    public static getInstance(): RedisCache {
        if (!RedisCache.instance) {
            RedisCache.instance = new RedisCache();
        }
        return RedisCache.instance;
    }

    public async get<T>(key: string): Promise<T | null> {
        // Wait for auto-connect to complete if in progress
        if (this.connectionPromise && (this.client.status as string) === 'wait') {
            await this.connectionPromise;
        }

        if ((this.client.status as string) !== 'ready') {
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
        // Wait for auto-connect to complete if in progress
        if (this.connectionPromise && (this.client.status as string) === 'wait') {
            await this.connectionPromise;
        }

        if ((this.client.status as string) !== 'ready') {
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
        // Wait for auto-connect to complete if in progress
        if (this.connectionPromise && (this.client.status as string) === 'wait') {
            await this.connectionPromise;
        }

        if ((this.client.status as string) !== 'ready') {
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
        if ((this.client.status as string) === 'ready') {
            console.log('[RedisCache] Already connected to Redis.');
            return;
        }

        // If auto-connect is in progress, wait for it
        if (this.connectionPromise) {
            try {
                await this.connectionPromise;
                if ((this.client.status as string) === 'ready') {
                    console.log('[RedisCache] Connected via auto-connect.');
                    return;
                }
            } catch (error) {
                console.warn('[RedisCache] Auto-connect promise failed:', error);
            }
        }

        try {
            console.log('[RedisCache] Manually connecting to Redis...');
            await this.client.connect();
            console.log('[RedisCache] Manual connection attempt completed.');
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
