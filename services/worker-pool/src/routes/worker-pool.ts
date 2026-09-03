import { Router } from 'express';
import { WorkerPool } from '../pool/WorkerPool';
import { asyncHandler } from '../utils/asyncHandler';
import { WorkerPoolError } from '../utils/errors';

const router: Router = Router();
const pool = new WorkerPool();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'worker-pool', running: pool.isRunning() });
});

router.post('/start', asyncHandler(async (req, res) => {
  pool.start();
  res.json({ started: true });
}));

router.post('/stop', asyncHandler(async (req, res) => {
  pool.stop();
  res.json({ stopped: true });
}));

router.get('/workers', asyncHandler(async (req, res) => {
  const workers = pool.getWorkers();
  res.json({ workers });
}));

router.post('/workers', asyncHandler(async (req, res) => {
  const { id, type } = req.body;
  if (!id || !type) {
    throw WorkerPoolError.badRequest('Missing id or type');
  }
  const worker = pool.registerWorker(id, type);
  res.status(201).json(worker);
}));

router.post('/tasks', asyncHandler(async (req, res) => {
  const { type, payload, priority = 0, maxRetries = 3 } = req.body;
  if (!type) {
    throw WorkerPoolError.badRequest('Missing task type');
  }
  const taskId = await pool.submit({ type, payload, priority, maxRetries });
  res.status(202).json({ taskId });
}));

router.get('/tasks/:taskId', asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  res.json({ taskId, status: 'pending' });
}));

router.post('/workers/:workerId/process', asyncHandler(async (req, res) => {
  const workerId = req.params.workerId as string;
  const task = await pool.processNext(workerId);
  if (!task) {
    res.status(204).send();
    return;
  }
  res.status(200).json(task);
}));

router.post('/workers/:workerId/complete', asyncHandler(async (req, res) => {
  const workerId = req.params.workerId as string;
  const { taskId } = req.body;
  if (!taskId) {
    throw WorkerPoolError.badRequest('Missing taskId');
  }
  await pool.completeTask(workerId, taskId);
  res.json({ completed: true });
}));

router.post('/workers/:workerId/fail', asyncHandler(async (req, res) => {
  const workerId = req.params.workerId as string;
  const { taskId, error } = req.body;
  if (!taskId) {
    throw WorkerPoolError.badRequest('Missing taskId');
  }
  await pool.failTask(workerId, taskId, error || 'Unknown error');
  res.json({ failed: true });
}));

router.get('/queue/size', asyncHandler(async (req, res) => {
  const size = await pool.getQueueSize();
  res.json({ size });
}));

router.get('/config', (req, res) => {
  res.json(pool.getConfig());
});

export default router;
