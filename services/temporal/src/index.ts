import express from 'express';
import missionRoutes from './routes/missions';
import { TemporalClient } from './client/TemporalClient';
import { startWatchScheduler } from './scheduler';

export { TemporalClient } from './client/TemporalClient';

const app: express.Express = express();

app.use(express.json());

app.get('/api/temporal/health', (_req, res) => {
  res.json({ status: 'ok', service: 'temporal' });
});

app.use('/api/temporal', missionRoutes);

const PORT = process.env.PORT || 4100;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Temporal service listening on port ${PORT}`);
  });

  // Start watch scheduler
  const client = new TemporalClient();
  startWatchScheduler(client);
}

export { app };
