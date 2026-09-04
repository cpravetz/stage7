import { WorkerPool } from '../pool/WorkerPool';
import { WorkerStatus, WorkerTask } from '../types/worker';
import { ArtifactsService } from '../shared/artifacts';
import { logger } from '../utils/logger';

export class PersistentWorkerPool {
  private pool: WorkerPool;
  private persistence: ArtifactsService;

  constructor(persistence: ArtifactsService, config?: any, queue?: any) {
    this.persistence = persistence;
    this.pool = new WorkerPool(config, queue);
  }

  start(): void {
    this.pool.start();
  }

  stop(): void {
    this.pool.stop();
  }

  async registerWorker(id: string, type: string): Promise<WorkerStatus> {
    const worker = this.pool.registerWorker(id, type);
    await this.persistence.saveAgentState({
      agentId: id,
      tenantId: 'system',
      missionId: 'worker-pool',
      status: 'idle',
      context: { workerType: type, pool: true },
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).catch(() => {});
    return worker;
  }

  async submit(task: Omit<WorkerTask, 'id' | 'status' | 'createdAt' | 'retryCount'>): Promise<string> {
    return this.pool.submit(task);
  }

  async processNext(workerId: string): Promise<WorkerTask | null> {
    return this.pool.processNext(workerId);
  }

  async completeTask(workerId: string, taskId: string): Promise<void> {
    await this.pool.completeTask(workerId, taskId);
  }

  async failTask(workerId: string, taskId: string, error: string): Promise<void> {
    await this.pool.failTask(workerId, taskId, error);
  }

  getWorker(id: string): WorkerStatus | undefined {
    return this.pool.getWorker(id);
  }

  getWorkers(): WorkerStatus[] {
    return this.pool.getWorkers();
  }

  async getQueueSize(): Promise<number> {
    return this.pool.getQueueSize();
  }

  getConfig() {
    return this.pool.getConfig();
  }

  isRunning(): boolean {
    return this.pool.isRunning();
  }
}
