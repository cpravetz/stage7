import express from 'express';
import documentRoutes from './routes/documents';
import missionRoutes from './routes/missions';
import agentRoutes from './routes/agents';
import { logger } from '@stage7-nextgen/shared';

const app: express.Application = express();
app.use(express.json());

app.get('/api/artifacts/health', (req, res) => {
  res.json({ status: 'ok', service: 'artifacts' });
});

app.use('/api/artifacts/documents', documentRoutes);
app.use('/api/artifacts/missions', missionRoutes);
app.use('/api/artifacts/agents', agentRoutes);

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