import express from 'express';
import path from 'path';
import documentRoutes from './routes/documents';
import missionRoutes from './routes/missions';
import brainPersistenceRoutes from './routes/brainPersistence';
import { artifactsService } from './services/ArtifactsService';
import { asyncHandler, logger } from '@stage7-nextgen/shared';

const app: express.Application = express();
app.use(express.json());

app.get('/api/artifacts/health', asyncHandler(async (_req, res) => {
  await artifactsService.ready();
  const available = artifactsService.isPersistenceAvailable();
  res.status(available ? 200 : 503).json({
    status: available ? 'ok' : 'degraded',
    service: 'artifacts',
    durable: artifactsService.isDurable(),
  });
}));

app.use('/api/artifacts/documents', documentRoutes);
app.use('/api/artifacts/missions', missionRoutes);
app.use('/api/artifacts/brain', brainPersistenceRoutes);

// Serve local artifact files if configured
const localDir = process.env.ARTIFACTS_LOCAL_DIR;
if (localDir) {
  const resolved = path.resolve(localDir);
  app.use('/files', express.static(resolved, { index: false }));
  logger.info({ localDir: resolved }, 'Serving local artifact files at /files');
}

const PORT = process.env.PORT || 4200;

if (require.main === module) {
  artifactsService.ready()
    .then(() => {
      const server = app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Artifacts service listening');
      });
      server.on('error', (err) => {
        logger.fatal({ err, port: PORT }, 'Artifacts service failed to listen');
        process.exitCode = 1;
      });
    })
    .catch((err: unknown) => {
      logger.fatal({ err }, 'Artifacts service startup aborted because MongoDB is unavailable');
      process.exitCode = 1;
    });
}

export { ArtifactsService, artifactsService } from './services/ArtifactsService';
export { MongoStore } from './services/MongoStore';
export * from './types';
export default app;