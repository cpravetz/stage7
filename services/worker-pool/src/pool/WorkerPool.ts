import { WorkerTask, WorkerStatus, PoolConfig, DEFAULT_POOL_CONFIG } from '../types/worker';
import { TaskQueue } from '../queue/TaskQueue';
import { logger } from '../utils/logger';
import { WorkerPoolError } from '../utils/errors';

export class WorkerPool {
  private queue: TaskQueue;
  private config: PoolConfig;
  private workers: Map<string, WorkerStatus> = new Map();
  private running = false;

  constructor(config?: Partial<PoolConfig>, queue?: TaskQueue) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.queue = queue || new TaskQueue();
  }

  start(): void {
    this.running = true;
    logger.info({ minWorkers: this.config.minWorkers }, 'WorkerPool started');
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.registerWorker(`worker-${i}`, 'default');
    }
  }

  stop(): void {
    this.running = false;
    this.workers.clear();
    logger.info('WorkerPool stopped');
  }

  registerWorker(id: string, type: string): WorkerStatus {
    const status: WorkerStatus = {
      id,
      type,
      status: 'idle',
      completedTasks: 0,
      failedTasks: 0,
    };
    this.workers.set(id, status);
    logger.debug({ workerId: id }, 'Worker registered');
    return status;
  }

  async submit(task: Omit<WorkerTask, 'id' | 'status' | 'createdAt' | 'retryCount'>): Promise<string> {
    if (!this.running) {
      throw WorkerPoolError.internalError('WorkerPool is not running');
    }

    const workerTask: WorkerTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
    };

    await this.queue.enqueue(workerTask);
    logger.debug({ taskId: workerTask.id }, 'Task submitted');
    return workerTask.id;
  }

  async processNext(workerId: string): Promise<WorkerTask | null> {
    const worker = this.workers.get(workerId);
    if (!worker || worker.status !== 'idle') return null;

    const task = await this.queue.dequeue();
    if (!task) return null;

    worker.status = 'busy';
    worker.currentTaskId = task.id;
    task.status = 'running';
    task.startedAt = Date.now();
    task.workerId = workerId;

    await this.queue.markProcessing(task);
    logger.info({ taskId: task.id, workerId }, 'Task processing started');

    return task;
  }

  async completeTask(workerId: string, taskId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = 'idle';
      worker.currentTaskId = undefined;
      worker.completedTasks++;
    }
    await this.queue.complete(taskId);
    logger.debug({ taskId, workerId }, 'Task completed');
  }

  async failTask(workerId: string, taskId: string, error: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = 'idle';
      worker.currentTaskId = undefined;
      worker.failedTasks++;
    }
    await this.queue.fail(taskId);
    logger.warn({ taskId, workerId, error }, 'Task failed');
  }

  getWorker(id: string): WorkerStatus | undefined {
    return this.workers.get(id);
  }

  getWorkers(): WorkerStatus[] {
    return Array.from(this.workers.values());
  }

  async getQueueSize(): Promise<number> {
    return this.queue.size();
  }

  getConfig(): Readonly<PoolConfig> {
    return { ...this.config };
  }

  isRunning(): boolean {
    return this.running;
  }
}
