import express from 'express';
import missionRoutes, { temporalClient } from './routes/missions';
import { startWatchScheduler } from './scheduler';
import { startMissionScheduler } from './schedules/missionScheduler';
import { logger } from '@stage7-nextgen/shared';

export { TemporalClient } from './client/TemporalClient';

const app: express.Express = express();

app.use(express.json({ limit: '50mb' }));

app.get('/api/temporal/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'temporal',
    ...temporalClient.getRuntimeStatus(),
  });
});

app.use('/api/temporal', missionRoutes);

const PORT = process.env.PORT || 4100;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Temporal service listening on port ${PORT}`);
  });

  // Start watch scheduler
  const client = temporalClient;
  const stopWatchScheduler = startWatchScheduler(client);
  const stopMissionScheduler = startMissionScheduler(client);
  server.on('close', () => {
    stopWatchScheduler();
    stopMissionScheduler();
  });

  let recoveryScanInProgress = false;
  const recoverMissions = async () => {
    if (recoveryScanInProgress) return;
    recoveryScanInProgress = true;
    try {
      await client.recoverInFlightMissions();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'In-flight mission recovery scan failed',
      );
    } finally {
      recoveryScanInProgress = false;
    }
  };
  const recoveryScan = setInterval(() => void recoverMissions(), 30_000);
  recoveryScan.unref();
  server.on('close', () => clearInterval(recoveryScan));
  void recoverMissions();
}

export { app };
