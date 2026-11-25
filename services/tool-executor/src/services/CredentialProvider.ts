import { logger, httpRequest, interServiceTimeoutMs } from '@stage7-nextgen/shared';
import { assertVaultBaseUrl, decryptVaultSecret, listVaultSecretNames, storeVaultSecret } from '../utils/vaultClient';

export interface ToolCredentials {
  [key: string]: string | undefined;
}

export interface CredentialSource {
  vaultSecretId?: string;
  sensitive?: boolean;
  /**
   * @deprecated Env-var credentials are not for Skill settings. Use `configKey`
   * (resolved from the Skill's own configuration) or `vaultSecretId`. Retained
   * only for core stage7 process-level secrets that are not a Skill's to configure.
   */
  envVar?: string;
  /**
   * A dotted path into the Skill's resolved configuration. This used to read
   * `process.env[configKey]`, which made a credential declared as "config" an
   * environment dependency in disguise.
   */
  configKey?: string;
}

export interface NamedCredentialSource extends CredentialSource {
  logicalKey: string;
}

/** Reads a dotted path out of a plain object, e.g. `cms.apiKey`. */
function readDotted(values: Record<string, unknown> | undefined, dotted: string): string | undefined {
  if (!values) return undefined;
  let current: unknown = values;
  for (const part of dotted.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' && current.length > 0 ? current : undefined;
}

export interface ResolveHints {
  /**
   * Extra secret identifiers to try when the declared source does not resolve.
   * Generated tools routinely invent a `vaultSecretId` from the provider name
   * (e.g. `twilio-account-sid`) that does not exist, while the operator has
   * already stored the value under its own name (e.g. `secret:twilio_acct_sid`).
   * These hints carry the declared name, the actual source name, and commonsense
   * aliases so an already-configured secret is found instead of prompting again.
   */
  candidateNames?: string[];
  /** Human description of the credential (label, logical key) used to derive and score hints. */
  descriptors?: string[];
}

/**
 * Lowercase word tokens, with camelCase split so `accountSid` matches `acct_sid`
 * and `Twilio Account SID` matches `twilio-account-sid`.
 */
function credentialTokens(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
}

/** Common credential word abbreviations, both directions, applied to descriptor tokens. */
const CREDENTIAL_ALIASES: Record<string, string[]> = {
  acct: ['account'],
  account: ['acct'],
  sid: ['id'],
  id: ['sid'],
  auth: ['authentication'],
  token: ['key'],
  key: ['token'],
  pass: ['password'],
  user: ['username'],
  url: ['endpoint'],
};

/**
 * Directories that separate a provider secret from its field token, e.g.
 * `secret:twilio_acct_sid` -> provider `twilio`, field tokens `acct sid`.
 */
function namedSecretField(secretName: string): string {
  const normalized = secretName.toLowerCase().replace(/^secret:/, '');
  const [first, ...rest] = normalized.split('_');
  return rest.length > 0 ? rest.join('_') : first;
}

/**
 * Score how well a vault secret name matches the credential being resolved.
 *
 * Exact/alias matches score highest; otherwise the secret must share the
 * distinctive provider tokens (so `twilio_acct_sid` matches a tool asking for
 * `accountSid` when the provider is Twilio) and may not match on generic
 * words alone (so `secret:endpoint` never satisfies `authToken`).
 */
function scoreSecretName(secretName: string, descriptors: string[], candidateNames: string[]): number {
  const normalizedSecret = secretName.toLowerCase().replace(/^secret:/, '')
  // `tool:<id>:<key>` style names describe a tool binding, not a shared secret;
  // the credential token is the last segment.
  const secretSegment = normalizedSecret.split(':').pop() || normalizedSecret
  const secretTokens = credentialTokens(secretSegment)
  if (secretTokens.size === 0) return 0
  for (const candidate of candidateNames) {
    const normalizedCandidate = candidate.toLowerCase().replace(/^secret:/, '')
    if (normalizedSecret === normalizedCandidate) return 100
  }
  // Descriptor tokens expanded with common credential abbreviations, so a
  // generated `accountSid` matches a stored `twilio_acct_sid`.
  const wanted = new Set<string>()
  for (const descriptor of descriptors) {
    for (const token of credentialTokens(descriptor)) {
      wanted.add(token)
      for (const alias of CREDENTIAL_ALIASES[token] ?? []) wanted.add(alias)
    }
  }
  if (wanted.size === 0) return 0
  // The credential's own field words (the part after the provider prefix) must
  // all be present; the provider prefix is what makes the match confident but is
  // not required to be a field token itself.
  const fieldTokens = credentialTokens(namedSecretField(secretSegment))
  const required = fieldTokens.size > 0 ? fieldTokens : secretTokens
  if (![...required].every((token) => wanted.has(token))) return 0
  // Prefer a match that also names the provider over a bare field match.
  const providerNamed = normalizedSecret.split('_')[0] !== namedSecretField(secretSegment)
    && wanted.has(normalizedSecret.split('_')[0])
  return (required.size + (providerNamed ? 1 : 0)) / Math.max(4, wanted.size)
}

export class CredentialProvider {
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000;
  /** Cached list of tenant secret names, used for by-name recovery lookups. */
  private secretNameCache: { names: string[]; expiresAt: number } | undefined;

  async resolve(source: CredentialSource, configuredValues?: Record<string, unknown>, hints?: ResolveHints): Promise<string | undefined> {
    const cacheKey = source.vaultSecretId || source.configKey || source.envVar || '';
    // Config-sourced values are per-Skill and can change without a redeploy, so
    // they are never cached; only vault and env lookups are.
    const cacheable = !source.configKey || source.vaultSecretId != null;
    const cached = cacheable ? this.cache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let value: string | undefined;

    if (source.vaultSecretId) {
      value = await this.fromVault(source.vaultSecretId);
      if (value === undefined && hints) {
        value = await this.fromVaultByName(hints);
      }
    } else if (source.configKey) {
      // Resolve from the Skill's own configuration, not the process environment.
      value = readDotted(configuredValues, source.configKey);
    } else if (source.envVar) {
      value = process.env[source.envVar];
    }
    if (value === undefined && !source.vaultSecretId && hints) {
      // No explicit source resolved (e.g. an un-derived env/config key): fall
      // back to a by-name vault lookup before deciding the value is missing.
      value = await this.fromVaultByName(hints);
    }
    if (value === undefined && source.configKey) {
      // A Skill may still be pointed at a vault secret by configuration.
      const configured = typeof configuredValues?.[source.configKey] === 'string' ? (configuredValues![source.configKey] as string) : undefined;
      if (configured && /^vault:/.test(configured)) value = await this.fromVault(configured.slice('vault:'.length));
    }

    if (value && cacheable) {
      this.cache.set(cacheKey, { value, expiresAt: Date.now() + this.TTL_MS });
    }

    return value;
  }

  async resolveAll(
    sources: NamedCredentialSource[],
    configuredValues?: Record<string, unknown>,
    hintsFor?: (source: NamedCredentialSource) => ResolveHints | undefined,
  ): Promise<ToolCredentials> {
    const creds: ToolCredentials = {};
    for (const source of sources) {
      const value = await this.resolve(source, configuredValues, hintsFor?.(source));
      creds[source.logicalKey] = value;
    }
    return creds;
  }

  /** Tenant secret names, cached briefly because tools resolve credentials on every run. */
  private async listSecretNames(): Promise<string[]> {
    if (this.secretNameCache && this.secretNameCache.expiresAt > Date.now()) {
      return this.secretNameCache.names;
    }
    try {
      const names = await listVaultSecretNames('system');
      this.secretNameCache = { names, expiresAt: Date.now() + 30_000 };
      return names;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Vault secret listing failed');
    }
    return this.secretNameCache?.names ?? [];
  }

  private invalidateSecretNameCache(): void {
    this.secretNameCache = undefined;
  }

  /**
   * Resolve a credential by matching the vault's existing secret *names* against
   * the credential's declared hints. This is what lets a generated tool whose
   * invented `vaultSecretId` points nowhere still use the credentials an
   * operator already stored in the vault.
   */
  private async fromVaultByName(hints: ResolveHints): Promise<string | undefined> {
    const descriptors = hints.descriptors ?? [];
    const candidateNames = hints.candidateNames ?? [];
    if (descriptors.length === 0 && candidateNames.length === 0) return undefined;
    const names = await this.listSecretNames();
    let best: { name: string; score: number } | undefined;
    for (const name of names) {
      const score = scoreSecretName(name, descriptors, candidateNames);
      if (score > 0 && (!best || score > best.score)) best = { name, score };
    }
    if (!best) return undefined;
    const value = await this.fromVaultByNameExact(best.name);
    if (value !== undefined) {
      logger.info({ secretName: best.name, score: best.score }, 'Resolved credential from vault by name match');
    }
    return value;
  }

  private async fromVaultByNameExact(name: string): Promise<string | undefined> {
    const vaultUrl = process.env.VAULT_URL || 'http://vault:4000';
    try {
      const target = new URL(`/api/vault/secrets/name/${encodeURIComponent(name)}/decrypt`, vaultUrl);
      const response = await httpRequest(target.toString(), { headers: { 'X-Tenant-Id': 'system' }, timeoutMs: interServiceTimeoutMs() });
      if (response.ok) {
        const data = await response.json() as { plaintext?: string };
        if (data.plaintext !== undefined) return data.plaintext;
      }
    } catch (err) {
      logger.warn({ name, err: err instanceof Error ? err.message : String(err) }, 'Vault name lookup failed');
    }
    return undefined;
  }

  async storeInVault(plaintext: string, tenantId: string, name: string): Promise<string> {
    const secret = await storeVaultSecret(plaintext, tenantId, name);
    return `vault://${secret.id}`;
  }

  private async fromVault(secretId: string): Promise<string | undefined> {
    try {
      assertVaultBaseUrl();
    } catch (err) {
      logger.warn({ vaultUrl: process.env.VAULT_URL, err: err instanceof Error ? err.message : String(err) }, 'Vault decrypt failed');
      return undefined;
    }

    // Try as secret ID first (UUID format), otherwise try as name
    const isIdFormat = /^[a-zA-Z0-9._-]+$/.test(secretId) && secretId.includes('-'); // rough UUID check
    if (isIdFormat || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(secretId)) {
      try {
        const byId = await decryptVaultSecret({ byId: secretId });
        if (byId.ok && byId.plaintext !== undefined) return byId.plaintext;
      } catch (err) {
        logger.warn({ secretId, err: err instanceof Error ? err.message : String(err) }, 'Vault request failed');
      }
    }

    // Try by name
    try {
      const byName = await decryptVaultSecret({ byName: secretId });
      if (byName.ok && byName.plaintext !== undefined) return byName.plaintext;
    } catch (err) {
      logger.warn({ secretId, err: err instanceof Error ? err.message : String(err) }, 'Vault name lookup failed');
    }

    logger.warn({ secretId }, 'Vault decrypt failed');
    return undefined;
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
    this.invalidateSecretNameCache();
  }
}

export const credentialProvider = new CredentialProvider();
