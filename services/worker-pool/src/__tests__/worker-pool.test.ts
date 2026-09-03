import { WorkerPool } from '../pool/WorkerPool';
import { TaskQueue } from '../queue/TaskQueue';
import { WorkerPoolError } from '../utils/errors';

jest.mock('../queue/TaskQueue');

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool({ minWorkers: 2, maxWorkers: 5 });
  });

  describe('start/stop', () => {
    it('should start and register min workers', () => {
      pool.start();
      const workers = pool.getWorkers();
      expect(workers).toHaveLength(2);
      expect(pool.isRunning()).toBe(true);
    });

    it('should stop and clear workers', () => {
      pool.start();
      pool.stop();
      expect(pool.getWorkers()).toHaveLength(0);
      expect(pool.isRunning()).toBe(false);
    });
  });

  describe('registerWorker', () => {
    it('should register a new worker', () => {
      const worker = pool.registerWorker('worker-1', 'assistant');
      expect(worker.id).toBe('worker-1');
      expect(worker.type).toBe('assistant');
      expect(worker.status).toBe('idle');
    });
  });

  describe('submit', () => {
    it('should submit a task when pool is running', async () => {
      pool.start();
      const taskId = await pool.submit({
        type: 'chat',
        payload: { message: 'hello' },
        priority: 1,
        maxRetries: 2,
      });
      expect(taskId).toMatch(/^task-/);
    });

    it('should throw when pool is not running', async () => {
      await expect(pool.submit({
        type: 'chat',
        payload: {},
        priority: 0,
        maxRetries: 0,
      })).rejects.toThrow('WorkerPool is not running');
    });
  });

  describe('processNext', () => {
    it('should return null when no worker is idle', async () => {
      pool.start();
      pool.registerWorker('worker-1', 'assistant');
      const task = await pool.processNext('worker-1');
      expect(task).toBeNull();
    });
  });

  describe('completeTask/failTask', () => {
    it('should complete a task', async () => {
      pool.start();
      const worker = pool.registerWorker('worker-1', 'assistant');
      const taskId = 'task-123';
      await pool.completeTask('worker-1', taskId);
      const updated = pool.getWorker('worker-1');
      expect(updated?.completedTasks).toBe(1);
      expect(updated?.status).toBe('idle');
    });

    it('should fail a task', async () => {
      pool.start();
      pool.registerWorker('worker-1', 'assistant');
      await pool.failTask('worker-1', 'task-123', 'timeout');
      const worker = pool.getWorker('worker-1');
      expect(worker?.failedTasks).toBe(1);
    });
  });

  describe('config', () => {
    it('should return default config', () => {
      const config = pool.getConfig();
      expect(config.minWorkers).toBe(2);
      expect(config.maxWorkers).toBe(5);
      expect(config.queueSize).toBe(1000);
    });
  });
});

describe('TaskQueue', () => {
  it('should be instantiable', () => {
    const queue = new TaskQueue();
    expect(queue).toBeDefined();
  });
});

describe('WorkerPoolError', () => {
  it('should create error with status code', () => {
    const err = WorkerPoolError.badRequest('Invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid input');
  });

  it('should serialize to JSON', () => {
    const err = WorkerPoolError.poolFull();
    expect(err.toJson()).toEqual({
      statusCode: 429,
      message: 'Worker pool is full',
      details: undefined,
    });
  });
});
