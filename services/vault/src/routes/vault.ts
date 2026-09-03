import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { VaultError } from '../utils/errors';
import { EnvelopeEncryption } from '../encryption/envelopeEncryption';
import { SecretStore } from '../services/SecretStore';

const router: Router = Router();
const encryption = new EnvelopeEncryption();
const secretStore = new SecretStore(encryption);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vault' });
});

router.post('/encrypt', asyncHandler(async (req, res) => {
  const { plaintext } = req.body;

  if (!plaintext || typeof plaintext !== 'string') {
    throw VaultError.badRequest('Missing or invalid plaintext');
  }

  const encrypted = encryption.encrypt(plaintext);
  res.status(200).json(encrypted);
}));

router.post('/decrypt', asyncHandler(async (req, res) => {
  const { ciphertext, keyId, version } = req.body;

  if (!ciphertext) {
    throw VaultError.badRequest('Missing ciphertext');
  }

  const decrypted = encryption.decrypt({
    ciphertext,
    keyId: keyId || 'master-key',
    version: version || 1,
    createdAt: Date.now(),
  });

  res.status(200).json({ plaintext: decrypted });
}));

router.get('/secrets', asyncHandler(async (req, res) => {
  const secrets = secretStore.listSecrets();
  res.json({ secrets });
}));

router.post('/secrets', asyncHandler(async (req, res) => {
  const { name, plaintext, tenantId } = req.body;

  if (!name || typeof name !== 'string') {
    throw VaultError.badRequest('Missing or invalid name');
  }

  if (!plaintext || typeof plaintext !== 'string') {
    throw VaultError.badRequest('Missing or invalid plaintext');
  }

  if (!tenantId || typeof tenantId !== 'string') {
    throw VaultError.badRequest('Missing or invalid tenantId');
  }

  const secret = secretStore.createSecret(name, plaintext, tenantId);
  res.status(201).json(secret);
}));

router.get('/secrets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const secret = secretStore.getSecret(id);

  if (!secret) {
    throw VaultError.notFound('Secret not found');
  }

  res.json({
    id: secret.id,
    name: secret.name,
    tenantId: secret.tenantId,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  });
}));

router.get('/secrets/:id/decrypt', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const plaintext = secretStore.decryptSecret(id);

  if (plaintext === undefined) {
    throw VaultError.notFound('Secret not found');
  }

  res.json({ plaintext });
}));

router.delete('/secrets/:id', asyncHandler(async (req, res) => {
  const {id} = req.params;
  const deleted = secretStore.deleteSecret(id);

  if (!deleted) {
    throw VaultError.notFound('Secret not found');
  }

  res.status(204).send();
}));

export { secretStore };
export default router;
