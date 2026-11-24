import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { VaultError } from '../utils/errors';
import { EnvelopeEncryption } from '../encryption/envelopeEncryption';
import { SecretStore } from '../services/SecretStore';
import { requireTenantContext, resolveTenantContext, assertTenantMatch, defaultTenantForDiscovery } from '../utils/tenant';

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

router.get('/discovery', asyncHandler(async (req, res) => {
  const context = await resolveTenantContext(req);
  const tenantId = context?.tenantId || defaultTenantForDiscovery();
  const secrets = await secretStore.listSecrets(tenantId);
  res.json({
    tenantId,
    authenticated: Boolean(context),
    secrets,
  });
}));

router.get('/secrets', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const secrets = await secretStore.listSecrets(context.tenantId);
  res.json({ secrets, tenantId: context.tenantId });
}));

router.post('/secrets', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { name, plaintext, tenantId } = req.body;

  if (!name || typeof name !== 'string') {
    throw VaultError.badRequest('Missing or invalid name');
  }
  if (!plaintext || typeof plaintext !== 'string') {
    throw VaultError.badRequest('Missing or invalid plaintext');
  }
  const resolvedTenantId = assertTenantMatch(context, tenantId);

  const existing = await secretStore.getSecretByName(name, resolvedTenantId);
  if (existing) {
    const updated = await secretStore.updateSecret(existing.id, plaintext);
    if (!updated) throw VaultError.notFound('Secret not found');
    res.status(200).json({ ...updated, existed: true, reconciled: true });
    return;
  }

  const ensured = await secretStore.ensureSecret(name, plaintext, resolvedTenantId);
  if (ensured.existed) {
    res.status(200).json({ ...ensured.secret, existed: true, reconciled: true });
    return;
  }
  res.status(201).json({ ...ensured.secret, existed: false });
}));

router.put('/secrets/name/:name', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { name } = req.params;
  const { plaintext, tenantId } = req.body;

  if (!name) throw VaultError.badRequest('Missing or invalid name');
  if (typeof plaintext !== 'string' || !plaintext) {
    throw VaultError.badRequest('Missing or invalid plaintext');
  }
  const resolvedTenantId = assertTenantMatch(context, tenantId);

  const existing = await secretStore.getSecretByName(name, resolvedTenantId);
  if (existing) {
    const updated = await secretStore.updateSecret(existing.id, plaintext);
    if (!updated) throw VaultError.notFound('Secret not found');
    res.json({ ...updated, existed: true, reconciled: true });
    return;
  }

  const ensured = await secretStore.ensureSecret(name, plaintext, resolvedTenantId);
  if (ensured.existed) {
    const updated = await secretStore.updateSecret(ensured.secret.id, plaintext);
    if (updated) {
      res.json({ ...updated, existed: true, reconciled: true });
      return;
    }
  }
  res.status(201).json({ ...ensured.secret, existed: false });
}));

router.get('/secrets/:id', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { id } = req.params;
  const secret = await secretStore.getSecret(id, context.tenantId);

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
  const context = await requireTenantContext(req);
  const { id } = req.params;
  const plaintext = await secretStore.decryptSecret(id, context.tenantId);

  if (plaintext === undefined) {
    throw VaultError.notFound('Secret not found');
  }

  res.json({ plaintext });
}));

router.get('/secrets/name/:name', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { name } = req.params;
  const requestedTenant = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const tenantId = assertTenantMatch(context, requestedTenant);
  const secret = await secretStore.getSecretByName(name, tenantId);

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

router.get('/secrets/name/:name/decrypt', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { name } = req.params;
  const requestedTenant = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
  const tenantId = assertTenantMatch(context, requestedTenant);
  const secret = await secretStore.getSecretByName(name, tenantId);

  if (!secret) {
    throw VaultError.notFound('Secret not found');
  }

  const plaintext = await secretStore.decryptSecret(secret.id, tenantId);

  if (plaintext === undefined) {
    throw VaultError.notFound('Secret not found');
  }

  res.json({ plaintext, id: secret.id });
}));

router.post('/secrets/ensure', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { name, plaintext, tenantId } = req.body;

  if (!name || typeof name !== 'string') {
    throw VaultError.badRequest('Missing or invalid name');
  }
  const resolvedTenantId = assertTenantMatch(context, tenantId);

  const existing = await secretStore.getSecretByName(name, resolvedTenantId);
  if (existing) {
    res.json({
      id: existing.id,
      name: existing.name,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      existed: true,
      reconciled: false,
    });
    return;
  }

  if (typeof plaintext !== 'string') {
    throw VaultError.badRequest('Missing or invalid plaintext');
  }

  const ensured = await secretStore.ensureSecret(name, plaintext, resolvedTenantId);
  if (ensured.existed) {
    res.status(200).json({ ...ensured.secret, existed: true, reconciled: true });
    return;
  }
  res.status(201).json({ ...ensured.secret, existed: false });
}));

router.delete('/secrets/:id', asyncHandler(async (req, res) => {
  const context = await requireTenantContext(req);
  const { id } = req.params;
  const deleted = await secretStore.deleteSecret(id, context.tenantId);

  if (!deleted) {
    throw VaultError.notFound('Secret not found');
  }

  res.status(204).send();
}));

export { secretStore };
export default router;
