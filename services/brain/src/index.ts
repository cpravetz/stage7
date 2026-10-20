import express, { Application } from 'express';
import brainRoutes from './routes/brain';
import distillationRoutes from './routes/distillation';
import { brainInstance as brain } from './utils/sharedInstance';
import { logger } from './utils/logger';

export { brainInstance } from './utils/sharedInstance';
export { BrainService } from './services/BrainService';
export { DistillationService, createDistillationService } from './services/DistillationService';
export { DistillationOrchestrator, createDistillationOrchestrator } from './services/DistillationOrchestrator';
export * from './services/DistillationService';
export * from './services/DistillationOrchestrator';

const app: Application = express();
app.use(express.json({ limit: "256kb" }));

setTimeout(() => {
  const providers = brain.listProviders();
  logger.info({ providers: providers.map((p) => p.id) }, 'Brain ready with providers');
}, 100);

app.use('/api/brain', brainRoutes);
app.use('/api/brain/distillation', distillationRoutes);

const PORT = process.env.PORT || 3100;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Brain service listening');
});

export default app;
