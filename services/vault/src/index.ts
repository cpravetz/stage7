import express from 'express';
import vaultRoutes from './routes/vault';
import { secretStore } from './routes/vault';
import { SecretStore } from './services/SecretStore';
import { logger } from './utils/logger';

const app: ReturnType<typeof express> = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-Id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});
app.use(express.json({ limit: '50mb' }));

app.use('/api/vault', vaultRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Vault service listening');
});

export { secretStore };
export { SecretStore };
export default app;
