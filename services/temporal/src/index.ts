import express from 'express';
import missionRoutes from './routes/missions';

export { TemporalClient } from './client/TemporalClient';

const app: express.Express = express();

app.use(express.json());

app.get('/api/temporal/health', (_req, res) => {
  res.json({ status: 'ok', service: 'temporal' });
});

app.use('/api/temporal', missionRoutes);

const PORT = process.env.PORT || 4100;

app.listen(PORT, () => {
  console.log(`Temporal service listening on port ${PORT}`);
});

export { app };
