import { credentialProvider, ToolCredentials } from '../services/CredentialProvider';

/**
 * Supported auth shapes for portal/external-service config.
 *
 *   { type: 'bearer',  token: '...' | { envVar: 'X' } | { vaultSecretId: '...' } }
 *   { type: 'basic',   username: '...', password: '...' }
 *   { type: 'api_key', header: 'X-API-Key', value: '...' }
 *   { type: 'custom',  headers: { 'X-Foo': 'bar' } }
 *
 * String values may reference secrets via ${ENV_VAR} syntax or via
 * { envVar / vaultSecretId } objects. The credential provider resolves
 * vault references and caches results.
 */

export type AuthType = 'bearer' | 'basic' | 'api_key' | 'custom' | 'none';

export interface AuthConfig {
  type?: AuthType;
  token?: string;
  accessToken?: string;
  username?: string;
  password?: string;
  header?: string;
  value?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  envVar?: string;
  vaultSecretId?: string;
}

export interface ResolvedAuth {
  headers: Record<string, string>;
  type: AuthType;
}

function looksLikeEnvRef(val: string): boolean {
  return typeof val === 'string' && val.startsWith('${') && val.endsWith('}');
}

function envRefName(val: string): string {
  return val.slice(2, -1);
}

async function resolveValue(val: any): Promise<string> {
  if (val == null) return '';
  if (typeof val === 'object') {
    if (val.vaultSecretId) {
      const v = await credentialProvider.resolve({ vaultSecretId: val.vaultSecretId });
      return v || '';
    }
    if (val.envVar) {
      const v = await credentialProvider.resolve({ envVar: val.envVar });
      return v || '';
    }
    if (val.configKey) {
      const v = await credentialProvider.resolve({ configKey: val.configKey });
      return v || '';
    }
    return '';
  }
  if (typeof val === 'string') {
    if (looksLikeEnvRef(val)) {
      return process.env[envRefName(val)] || '';
    }
    return val;
  }
  return String(val);
}

/**
 * Resolve an AuthConfig into request headers. Returns `{ headers, type }`.
 * Safe to call from any sandboxed code-type tool.
 */
export async function resolveAuthHeaders(auth: AuthConfig | null | undefined): Promise<ResolvedAuth> {
  const type = (auth?.type as AuthType) || 'none';
  const headers: Record<string, string> = {};

  switch (type) {
    case 'bearer': {
      const token = await resolveValue(auth?.token ?? auth?.accessToken);
      if (token) headers['Authorization'] = 'Bearer ' + token;
      break;
    }
    case 'basic': {
      const username = await resolveValue(auth?.username);
      const password = await resolveValue(auth?.password);
      if (username || password) {
        const raw = username + ':' + password;
        headers['Authorization'] = 'Basic ' + Buffer.from(raw).toString('base64');
      }
      break;
    }
    case 'api_key': {
      const headerName = auth?.header || 'X-API-Key';
      const value = await resolveValue(auth?.value ?? auth?.apiKey);
      if (value) headers[headerName] = value;
      break;
    }
    case 'custom': {
      if (auth?.headers) {
        for (const [k, v] of Object.entries(auth.headers)) {
          if (v != null) headers[k] = String(v);
        }
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  return { headers, type };
}

export default resolveAuthHeaders;