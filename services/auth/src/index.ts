import express from 'express';
import authRoutes from './routes/auth';
import { logger } from './utils/logger';

const app: ReturnType<typeof express> = express();
app.use(express.json());

app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 4300;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Auth service listening');
});

export default app;
