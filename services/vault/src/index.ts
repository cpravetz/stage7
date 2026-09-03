import express from 'express';
import vaultRoutes from './routes/vault';
import { secretStore } from './routes/vault';
import { SecretStore } from './services/SecretStore';
import { logger } from './utils/logger';

const app: ReturnType<typeof express> = express();
app.use(express.json());

app.use('/api/vault', vaultRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Vault service listening');
});

export { secretStore };
export { SecretStore };
export default app;
