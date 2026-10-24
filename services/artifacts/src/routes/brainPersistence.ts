import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { artifactsService as service } from '../services/ArtifactsService';

const router: Router = Router();

router.use(asyncHandler(async (_req, _res, next) => {
  await service.ready();
  if (!service.isPersistenceAvailable()) {
    throw new NextGenError('Artifacts persistence is unavailable; refusing volatile storage', 503);
  }
  next();
}));

const LogEntrySchema = z.object({ timestamp: z.string() }).catchall(z.unknown());
const PerformanceMetricSchema = z.object({
  model: z.string(),
  provider: z.string(),
}).catchall(z.unknown());

async function migrateLegacyLogs(): Promise<void> {
  const legacy = await service.getDocument('brain-log-history');
  const entries = legacy?.data.entries;
  if (Array.isArray(entries)) {
    const parsedEntries = entries.map((entry) => LogEntrySchema.parse(entry));
    for (const entry of parsedEntries.reverse()) {
      await service.appendBrainLog(entry);
    }
    await service.deleteDocument('brain-log-history');
  }
}

async function migrateLegacyPerformanceMetrics(): Promise<void> {
  const legacy = await service.getDocument('model-performance-metrics');
  const metrics = legacy?.data;
  if (metrics && typeof metrics === 'object' && !Array.isArray(metrics)) {
    const parsedMetrics = Object.values(metrics).map((metric) => PerformanceMetricSchema.parse(metric));
    for (const metric of parsedMetrics) {
      await service.saveBrainPerformanceMetric(metric);
    }
    await service.deleteDocument('model-performance-metrics');
  }
}

router.get('/logs', asyncHandler(async (_req, res) => {
  let entries = await service.listBrainLogs();
  if (entries.length === 0) {
    await migrateLegacyLogs();
    entries = await service.listBrainLogs();
  }
  res.json({ entries });
}));

router.post('/logs', asyncHandler(async (req, res) => {
  const entry = LogEntrySchema.parse(req.body);
  await service.appendBrainLog(entry);
  res.status(201).json({ accepted: true });
}));

router.get('/performance-metrics', asyncHandler(async (_req, res) => {
  let metrics = await service.listBrainPerformanceMetrics();
  if (metrics.length === 0) {
    await migrateLegacyPerformanceMetrics();
    metrics = await service.listBrainPerformanceMetrics();
  }
  res.json({ metrics });
}));

router.put('/performance-metrics', asyncHandler(async (req, res) => {
  const metric = PerformanceMetricSchema.parse(req.body);
  await service.saveBrainPerformanceMetric(metric);
  res.status(204).send();
}));

router.delete('/performance-metrics', asyncHandler(async (_req, res) => {
  await service.clearBrainPerformanceMetrics();
  res.status(204).send();
}));

export default router;
