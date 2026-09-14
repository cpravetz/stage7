import express from 'express';
import path from 'path';
import documentRoutes from './routes/documents';
import missionRoutes from './routes/missions';
import { logger } from '@stage7-nextgen/shared';

const app: express.Application = express();
app.use(express.json());

app.get('/api/artifacts/health', (req, res) => {
  res.json({ status: 'ok', service: 'artifacts' });
});

app.use('/api/artifacts/documents', documentRoutes);
app.use('/api/artifacts/missions', missionRoutes);

// Serve local artifact files if configured
const localDir = process.env.ARTIFACTS_LOCAL_DIR;
if (localDir) {
  const resolved = path.resolve(localDir);
  app.use('/files', express.static(resolved, { index: false }));
  logger.info({ localDir: resolved }, 'Serving local artifact files at /files');
}

const PORT = process.env.PORT || 4200;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Artifacts service listening');
  });
}

export { ArtifactsService } from './services/ArtifactsService';
export { InMemoryStore } from './services/InMemoryStore';
export { MongoStore } from './services/MongoStore';
export * from './types';
export default app;