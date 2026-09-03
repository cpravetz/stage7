import express, { Application } from 'express';
import brainRoutes from './routes/brain';
import { brainInstance as brain } from './utils/sharedInstance';
import { logger } from './utils/logger';

const app: Application = express();
app.use(express.json());

setTimeout(() => {
  const providers = brain.listProviders();
  logger.info({ providers: providers.map((p) => p.id) }, 'Brain ready with providers');
}, 100);

app.use('/api/brain', brainRoutes);

const PORT = process.env.PORT || 3100;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Brain service listening');
});

export default app;
