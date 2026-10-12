import express from 'express';
import missionRoutes from './routes/missions';
import { TemporalClient } from './client/TemporalClient';
import { startWatchScheduler } from './scheduler';
import { runTemporalWorker } from './temporalWorker';
import { logger } from '@stage7-nextgen/shared';

export { TemporalClient } from './client/TemporalClient';

const app: express.Express = express();

app.use(express.json());

app.get('/api/temporal/health', (_req, res) => {
  res.json({ status: 'ok', service: 'temporal' });
});

app.use('/api/temporal', missionRoutes);

const PORT = process.env.PORT || 4100;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Temporal service listening on port ${PORT}`);
  });

  // Start watch scheduler
  const client = new TemporalClient();
  const stopWatchScheduler = startWatchScheduler(client);

  if (process.env.TEMPORAL_ADDRESS) {
    runTemporalWorker().catch((error) => {
      logger.fatal(
        { error: error instanceof Error ? error.message : String(error) },
        'Temporal worker stopped unexpectedly',
      );
      stopWatchScheduler();
      server.close();
      server.closeAllConnections();
      process.exitCode = 1;
    });
  }
}

export { app };
