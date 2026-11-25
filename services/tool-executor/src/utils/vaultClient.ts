/**
 * Canonical vault client: one place for the vault base URL, the tenant
 * convention, and the ensure-on-missing flow. ToolConfig, CredentialProvider,
 * and PluginGenerator all go through this module instead of hand-building
 * fetch URLs.
 *
 * Tenant convention: every call takes an explicit `tenantId` (default
 * `'system'`) carried in the `X-Tenant-Id` header — the vault's
 * `resolveTenantContext` gives it the same authority the pre-header `?tenantId`
 * query convention had, and the body `tenantId` the ensure/store routes require
 * always matches. Callers previously mixed query-param, header, and body-only
 * conventions; all resolved to the same tenant, which this module preserves.
 */

/** Default vault address, identical to the docker-compose service name. */
export const DEFAULT_VAULT_URL = 'http://vault:4000';

/** Resolve the vault base URL from the environment, once per call. */
export function vaultBaseUrl(): string {
  return process.env.VAULT_URL || DEFAULT_VAULT_URL;
}

/**
 * Validate the vault base URL and return it as a URL. Shared by every caller
 * so a misconfigured VAULT_URL fails the same way everywhere.
 */
export function assertVaultBaseUrl(url: string = vaultBaseUrl()): URL {
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    throw new Error('Invalid VAULT_URL configured');
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('VAULT_URL must use http or https');
  }
  if (base.username || base.password) {
    throw new Error('VAULT_URL must be an HTTP(S) URL without embedded credentials');
  }
  return base;
}

/** The canonical tenant convention: tenant travels in the X-Tenant-Id header. */
export function vaultTenantHeaders(tenantId: string): Record<string, string> {
  return { 'X-Tenant-Id': tenantId };
}

/** Extract secret names from a vault listing payload (array or `{ secrets: [...] }`). */
export function parseVaultSecretNames(data: unknown): string[] {
  const list = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as { secrets?: unknown[] }).secrets)
      ? (data as { secrets: unknown[] }).secrets
      : []);
  return list
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/** List tenant secret names. Throws on network failure and non-OK status. */
export async function listVaultSecretNames(tenantId = 'system', timeoutMs?: number): Promise<string[]> {
  const response = await fetch(`${vaultBaseUrl()}/api/vault/secrets`, {
    headers: vaultTenantHeaders(tenantId),
    ...(timeoutMs !== undefined ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!response.ok) {
    throw new Error(`Vault secret listing failed (${response.status})`);
  }
  return parseVaultSecretNames((await response.json()) as unknown);
}

export interface VaultDecryptResult {
  /** HTTP status of the decrypt request (0 is never used; failures throw). */
  status: number;
  ok: boolean;
  plaintext?: string;
}

/**
 * Decrypt a secret by id or by name. Network failures throw; HTTP outcomes
 * (including 404, which callers may want to pair with `ensureVaultSecret`)
 * are returned so callers can branch on them.
 */
export async function decryptVaultSecret(
  ref: { byId?: string; byName?: string },
  tenantId = 'system',
): Promise<VaultDecryptResult> {
  const base = assertVaultBaseUrl();
  const target = ref.byId !== undefined
    ? new URL(`/api/vault/secrets/${encodeURIComponent(ref.byId)}/decrypt`, base)
    : new URL(`/api/vault/secrets/name/${encodeURIComponent(ref.byName ?? '')}/decrypt`, base);
  if (target.origin !== base.origin) {
    // Unreachable for the fixed paths above; kept as a guard if path building changes.
    throw new Error('Vault URL origin escape attempt');
  }
  const response = await fetch(target.toString(), { headers: vaultTenantHeaders(tenantId) });
  if (!response.ok) {
    return { status: response.status, ok: false };
  }
  const data = (await response.json()) as { plaintext?: string };
  return { status: response.status, ok: true, plaintext: data.plaintext };
}

/**
 * Ensure a secret exists (creating it empty when missing). Returns the vault's
 * `{ existed, name }` payload, or undefined on a non-OK response. Network
 * failures throw.
 */
export async function ensureVaultSecret(
  name: string,
  tenantId: string,
  plaintext = '',
): Promise<{ existed?: boolean; name?: string } | undefined> {
  const response = await fetch(`${vaultBaseUrl()}/api/vault/secrets/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vaultTenantHeaders(tenantId) },
    body: JSON.stringify({ name, plaintext, tenantId }),
  });
  if (!response.ok) return undefined;
  return (await response.json()) as { existed?: boolean; name?: string };
}

/**
 * Store a plaintext secret. Resolves to the vault's secret id. Throws on
 * invalid configuration, non-OK status, or a malformed secret reference.
 */
export async function storeVaultSecret(plaintext: string, tenantId: string, name: string): Promise<{ id: string }> {
  const base = assertVaultBaseUrl();
  const target = new URL('/api/vault/secrets', base);
  const response = await fetch(target.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...vaultTenantHeaders(tenantId) },
    body: JSON.stringify({ name, plaintext, tenantId }),
  });
  if (!response.ok) {
    throw new Error(`Vault secret storage failed (${response.status})`);
  }
  const secret = (await response.json()) as { id?: string };
  if (typeof secret.id !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(secret.id)) {
    throw new Error('Vault returned an invalid secret reference');
  }
  return { id: secret.id };
}
