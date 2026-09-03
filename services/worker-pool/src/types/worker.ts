export interface WorkerTask {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
  workerId?: string;
}

export interface WorkerOptions {
  id: string;
  type: string;
  maxConcurrency: number;
}

export interface WorkerStatus {
  id: string;
  type: string;
  status: 'idle' | 'busy' | 'offline';
  currentTaskId?: string;
  completedTasks: number;
  failedTasks: number;
}

export interface PoolConfig {
  minWorkers: number;
  maxWorkers: number;
  queueSize: number;
  taskTimeout: number;
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  minWorkers: 2,
  maxWorkers: 50,
  queueSize: 1000,
  taskTimeout: 30000,
};
