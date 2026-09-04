import { logger } from '@stage7-nextgen/shared';

export interface ToolCredentials {
  [key: string]: string | undefined;
}

export interface CredentialSource {
  vaultSecretId?: string;
  envVar?: string;
  configKey?: string;
}

export class CredentialProvider {
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000;

  async resolve(source: CredentialSource): Promise<string | undefined> {
    const cacheKey = source.vaultSecretId || source.envVar || source.configKey || '';
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let value: string | undefined;

    if (source.vaultSecretId) {
      value = await this.fromVault(source.vaultSecretId);
    } else if (source.envVar) {
      value = process.env[source.envVar];
    } else if (source.configKey) {
      value = process.env[source.configKey];
    }

    if (value) {
      this.cache.set(cacheKey, { value, expiresAt: Date.now() + this.TTL_MS });
    }

    return value;
  }

  async resolveAll(sources: CredentialSource[]): Promise<ToolCredentials> {
    const creds: ToolCredentials = {};
    for (const source of sources) {
      const key = source.vaultSecretId || source.envVar || source.configKey || '';
      creds[key] = await this.resolve(source);
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
