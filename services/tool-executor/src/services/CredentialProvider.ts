import { logger } from '@stage7-nextgen/shared';

export interface ToolCredentials {
  [key: string]: string | undefined;
}

export interface CredentialSource {
  vaultSecretId?: string;
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

export class CredentialProvider {
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000;

  async resolve(source: CredentialSource, configuredValues?: Record<string, unknown>): Promise<string | undefined> {
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
    } else if (source.configKey) {
      // Resolve from the Skill's own configuration, not the process environment.
      value = readDotted(configuredValues, source.configKey);
    } else if (source.envVar) {
      value = process.env[source.envVar];
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

  async resolveAll(sources: NamedCredentialSource[], configuredValues?: Record<string, unknown>): Promise<ToolCredentials> {
    const creds: ToolCredentials = {};
    for (const source of sources) {
      const value = await this.resolve(source, configuredValues);
      creds[source.logicalKey] = value;
    }
    return creds;
  }

  private async fromVault(secretId: string): Promise<string | undefined> {
    const vaultUrl = process.env.VAULT_URL || 'http://vault:4000';
    try {
      const res = await fetch(`${vaultUrl}/secrets/${secretId}/decrypt`, {
        method: 'GET',
        headers: {
          'X-Tenant-Id': 'system',
        },
      });
      if (!res.ok) {
        logger.warn({ secretId, status: res.status }, 'Vault decrypt failed');
        return undefined;
      }
      const data = await res.json() as { plaintext?: string };
      return data.plaintext;
    } catch (err) {
      logger.warn({ secretId, err: err instanceof Error ? err.message : String(err) }, 'Vault request failed');
      return undefined;
    }
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const credentialProvider = new CredentialProvider();
