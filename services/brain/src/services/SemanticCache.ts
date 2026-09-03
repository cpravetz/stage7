import Redis from 'ioredis';
import { logger } from '../utils/logger';

interface CacheEntry {
  data: unknown;
  createdAt: number;
  expiresAt: number;
}

export class SemanticCache {
  private redis: Redis | null = null;
  private static instance: SemanticCache;
  private hits = 0;
  private misses = 0;
  private memoryStore: Map<string, CacheEntry> = new Map();
  private useMemory: boolean = false;
  private memoryHits = 0;
  private memoryMisses = 0;
  private connectTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    try {
      this.redis = new Redis({
        host,
        port,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      });
      this.redis.on('error', (err) => {
        if (!this.useMemory) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Redis unavailable, falling back to in-memory cache');
          this.useMemory = true;
          this.redis?.disconnect();
        }
      });
      this.connectTimeout = setTimeout(() => {
        if (this.redis && this.redis.status !== 'ready' && this.redis.status !== 'connect') {
          logger.warn({ host, port }, 'Redis connection timed out, using in-memory cache');
          this.useMemory = true;
          this.redis.disconnect();
        }
      }, 1500);
      if (this.connectTimeout.unref) this.connectTimeout.unref();
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to create Redis client, using in-memory cache');
      this.useMemory = true;
      this.redis = null;
    }
  }

  static getInstance(): SemanticCache {
    if (!SemanticCache.instance) {
      SemanticCache.instance = new SemanticCache();
    }
    return SemanticCache.instance;
  }

  async get(key: string): Promise<unknown | null> {
    if (this.useMemory || !this.redis) {
      const entry = this.memoryStore.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        this.memoryHits++;
        return entry.data;
      }
      if (entry) this.memoryStore.delete(key);
      this.memoryMisses++;
      return null;
    }
    try {
      const raw = await this.redis.get(key);
      if (raw) {
        this.hits++;
        const entry = JSON.parse(raw) as CacheEntry;
        return entry.data;
      }
      this.misses++;
      return null;
    } catch {
      this.useMemory = true;
      this.redis.disconnect();
      return this.get(key);
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
    if (this.useMemory || !this.redis) {
      this.memoryStore.set(key, {
        data: value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return;
    }
    try {
      const entry: CacheEntry = {
        data: value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlSeconds * 1000,
      };
      await this.redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
    } catch {
      this.useMemory = true;
      this.redis.disconnect();
      await this.set(key, value, ttlSeconds);
    }
  }

  async invalidate(key: string): Promise<void> {
    if (this.useMemory || !this.redis) {
      this.memoryStore.delete(key);
      return;
    }
    try {
      await this.redis.del(key);
    } catch {
      this.useMemory = true;
      this.redis.disconnect();
      this.memoryStore.delete(key);
    }
  }

  stats() {
    return {
      hits: this.hits + this.memoryHits,
      misses: this.misses + this.memoryMisses,
      hitRate: (this.hits + this.memoryHits + this.misses + this.memoryMisses) === 0
        ? 0
        : (this.hits + this.memoryHits) / (this.hits + this.memoryHits + this.misses + this.memoryMisses),
      mode: this.useMemory ? 'memory' : 'redis',
    };
  }

  async reset() {
    this.hits = 0;
    this.misses = 0;
    this.memoryHits = 0;
    this.memoryMisses = 0;
  }

  disconnect() {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
  }
}
