import Redis from 'ioredis';
import { WorkerTask, DEFAULT_POOL_CONFIG } from '../types/worker';
import { logger } from '../utils/logger';

export class TaskQueue {
  private redis: Redis;
  private readonly queueKey = 'worker-pool:queue';
  private readonly processingKey = 'worker-pool:processing';

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.redis.on('connect', () => logger.info('TaskQueue connected to Redis'));
    this.redis.on('error', (err) => logger.error({ err }, 'TaskQueue Redis error'));
  }

  async enqueue(task: WorkerTask): Promise<void> {
    const queueLength = await this.redis.llen(this.queueKey);
    if (queueLength >= DEFAULT_POOL_CONFIG.queueSize) {
      throw new Error('Queue is full');
    }
    await this.redis.lpush(this.queueKey, JSON.stringify(task));
    logger.debug({ taskId: task.id }, 'Task enqueued');
  }

  async dequeue(): Promise<WorkerTask | null> {
    const raw = await this.redis.rpop(this.queueKey);
    if (!raw) return null;
    return JSON.parse(raw) as WorkerTask;
  }

  async markProcessing(task: WorkerTask): Promise<void> {
    await this.redis.hset(this.processingKey, task.id, JSON.stringify(task));
  }

  async complete(taskId: string): Promise<void> {
    await this.redis.hdel(this.processingKey, taskId);
  }

  async fail(taskId: string): Promise<void> {
    await this.redis.hdel(this.processingKey, taskId);
  }

  async size(): Promise<number> {
    return this.redis.llen(this.queueKey);
  }

  async processingCount(): Promise<number> {
    return this.redis.hlen(this.processingKey);
  }
}
