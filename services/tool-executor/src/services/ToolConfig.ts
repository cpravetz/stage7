import { Tool, ToolExecution, CredentialRequest, CredentialRequiredError, SchemaRecord } from '../types';
import logger from '../utils/logger';
import { credentialProvider, NamedCredentialSource } from './CredentialProvider';
import { parseToolOutputJson } from '../utils/schemaValidator';

export function schemaRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isVaultSecretProperty(schema: Record<string, unknown>): boolean {
  return schema['x-stage7-secret'] === true || (schema.sensitive === true && schema.format === 'password');
}

export function redactSecrets(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') {
    return secrets.reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secrets));
  const record = schemaRecord(value);
  return record ? Object.fromEntries(Object.entries(record).map(([key, item]) => [key, redactSecrets(item, secrets)])) : value;
}

/**
 * Resolves everything a tool needs before it can run: required-config validation,
 * credential lookup (vault / env / config), secret-input hydration, secret-output
 * storage, and the merged Skill config handed to code tools.
 *
 * `pendingCredentialOverrides` is shared by reference with the executor, which owns
 * the lifecycle of those entries (set on submit, cleared after a run).
 */
export class ToolConfigResolver {
  constructor(private readonly pendingCredentialOverrides: Map<string, Record<string, string>>) {}

  private hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
  }

  private async tryResolveFromVault(tool: Tool, field: string, input?: Record<string, unknown>): Promise<unknown> {
    try {
      const tenantId = (tool as any)?.tenantId || (input as any)?.tenantId || 'system';
      const secretName = `tool:${tool.id}:${field}`;
      const vaultUrl = process.env.VAULT_URL || 'http://vault:4000';
      try {
        const res = await fetch(
          `${vaultUrl}/api/vault/secrets/name/${encodeURIComponent(secretName)}/decrypt?tenantId=${encodeURIComponent(tenantId)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { plaintext?: string };
          if (data.plaintext && data.plaintext.trim().length > 0) {
            return data.plaintext;
          }
        } else if (res.status === 404) {
          // Try to ensure/create empty secret
          try {
            await fetch(`${vaultUrl}/api/vault/secrets/ensure`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: secretName, plaintext: '', tenantId }),
            });
          } catch (err) {
            logger.warn({ err, toolId: tool.id, field }, 'Failed to ensure secret for tool');
          }
        }
      } catch (err) {
        logger.warn({ err, toolId: tool.id, field }, 'Failed to resolve tool secret from vault');
      }
    } catch (err) {
      logger.warn({ err, toolId: tool.id, field }, 'Failed to resolve tool secret from vault');
    }
    return undefined;
  }

  private isCredentialField(field: string): boolean {
    return ['token', 'accessToken', 'apiKey', 'api_key', 'username', 'password', 'secret', 'clientSecret'].includes(field);
  }

  private getNestedValue(config: Record<string, unknown> | undefined, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => {
      if (!value || typeof value !== 'object') return undefined;
      return (value as Record<string, unknown>)[key];
    }, config);
  }

  private async isConfigured(tool: Tool, field: string, input: Record<string, unknown>): Promise<boolean> {
    if (field === 'confirmBeforeSend') return true;

    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const externalConfig = tool.externalConfig as Record<string, unknown> | undefined;
    const manifestConfig = manifest?.config as Record<string, unknown> | undefined;
    const directValue = input[field] ?? externalConfig?.[field] ?? manifestConfig?.[field] ?? manifest?.[field];
    if (this.hasValue(directValue)) return true;

    // Try to resolve from vault using tool schema variable name
    const vaultValue = await this.tryResolveFromVault(tool, field, input);
    if (this.hasValue(vaultValue)) {
      (input as any)[field] = vaultValue;
      return true;
    }

    if (field === 'baseUrl' || field === 'endpoint' || field === 'endpointUrl') {
      const endpoint = manifest?.endpoint as Record<string, unknown> | undefined;
      // The endpoint config field is named by the Skill, so it is resolved from
      // configuration rather than guessed from an environment variable name.
      const endpointConfigKey = manifest?.endpointConfigKey;
      const configEndpoint = typeof endpointConfigKey === 'string' ? this.getNestedValue(externalConfig, endpointConfigKey) : undefined;
      const val =
        this.hasValue(endpoint?.url) ||
        this.hasValue(endpoint?.path) ||
        this.hasValue(configEndpoint) ||
        this.hasValue(input.endpointUrl) ||
        this.hasValue(input.baseUrl);
      if (val) return true;
      const vaultValue2 = await this.tryResolveFromVault(tool, field, input);
      if (this.hasValue(vaultValue2)) {
        (input as any)[field] = vaultValue2;
        return true;
      }
      return false;
    }

    if (this.isCredentialField(field)) {
      const credentialSource = manifest?.credentialSource as
        Record<string, { envVar?: string; configKey?: string; vaultSecretId?: string }> | undefined;
      const source = credentialSource?.[field];
      // An `envVar` credential source is a deliberate deployment-level binding and
      // is still honoured; a config field is not backed by a guessed env var name.
      const envValue = source?.envVar ? process.env[source.envVar] : undefined;
      const configValue = source?.configKey ? this.getNestedValue(externalConfig, source.configKey) : undefined;
      if (this.hasValue(envValue) || this.hasValue(configValue)) return true;
      const vaultValue3 = await this.tryResolveFromVault(tool, field, input);
      if (this.hasValue(vaultValue3)) {
        (input as any)[field] = vaultValue3;
        return true;
      }
      return false;
    }

    // No environment fallback: a required config field counts as configured only
    // when it is actually present in input, the Skill's external configuration,
    // or its manifest config. Deriving an env var name from the field name would
    // make a field silently satisfiable by an unrelated deployment variable.
    const vaultValue4 = await this.tryResolveFromVault(tool, field, input);
    if (this.hasValue(vaultValue4)) {
      (input as any)[field] = vaultValue4;
      return true;
    }
    return false;
  }

  private hasEndpoint(tool: Tool, input: Record<string, unknown>): boolean {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const endpoint = manifest?.endpoint as Record<string, unknown> | undefined;
    const externalConfig = tool.externalConfig as Record<string, unknown> | undefined;
    const endpointConfigKey = manifest?.endpointConfigKey;
    // Which config field holds the endpoint is declared by the Skill, so it is
    // looked up by name instead of derived from a process environment variable.
    const configEndpoint = typeof endpointConfigKey === 'string' ? this.getNestedValue(externalConfig, endpointConfigKey) : undefined;
    return (
      this.hasValue(endpoint?.url) ||
      this.hasValue(endpoint?.path) ||
      this.hasValue(configEndpoint) ||
      this.hasValue(input.endpointUrl) ||
      this.hasValue(input.baseUrl) ||
      this.hasValue(externalConfig?.baseUrl)
    );
  }

  async validateConfigSchema(tool: Tool, input: Record<string, unknown>, executionId: string): Promise<ToolExecution | null> {
    const configSchema = tool.configSchema || (tool.manifest?.configSchema as SchemaRecord | undefined);
    const credentialSource = tool.manifest?.credentialSource as Record<string, { configKey?: string; vaultSecretId?: string }> | undefined;
    // A field whose value is supplied through `credentialSource` (configKey or
    // vaultSecretId) is resolved at execution time, so it must not be treated as
    // a missing static config value here. Only fields with no declared credential
    // source are validated against input/externalConfig.
    const credentialBackedFields = new Set(
      Object.entries(credentialSource || {})
        .filter(([, source]) => source && (typeof source.configKey === 'string' || typeof source.vaultSecretId === 'string'))
        .map(([field]) => field),
    );
    const isExternalAction = tool.manifest?.system !== undefined && tool.manifest?.action !== undefined;
    const required = Array.isArray(configSchema?.required)
      ? configSchema.required.filter((field): field is string => typeof field === 'string')
      : [];
    const missing: string[] = [];
    for (const field of required) {
      if (credentialBackedFields.has(field)) continue;
      const ok = await this.isConfigured(tool, field, input);
      if (!ok) missing.push(field);
    }

    if (isExternalAction && !this.hasEndpoint(tool, input) && !missing.includes('endpoint')) {
      missing.push('endpoint');
    }

    if (missing.length === 0) return null;

    // Ensure secrets exist in vault for missing config schema fields
    const tenantId = (input as any)?.tenantId || (tool as any)?.tenantId || 'system';
    const createdSecrets: string[] = [];
    const vaultUrl = process.env.VAULT_URL || 'http://vault:4000';
    for (const field of missing) {
      try {
        const secretName = `tool:${tool.id}:${field}`;
        const ensureRes = await fetch(`${vaultUrl}/api/vault/secrets/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: secretName, plaintext: '', tenantId }),
        });
        if (ensureRes.ok) {
          const data = (await ensureRes.json()) as { existed?: boolean; name?: string };
          if (!data.existed) {
            createdSecrets.push(data.name || secretName);
          }
        }
      } catch (err) {
        logger.warn({ err, toolId: tool.id, field }, 'Failed to ensure secret for tool config');
      }
    }

    const prefix = isExternalAction ? 'Not connected' : 'Missing required configuration';
    let errorMsg = `${prefix}: ${missing.join(', ')} are not configured for tool '${tool.name}' (${tool.id}).`;
    if (createdSecrets.length > 0) {
      errorMsg += ` Empty secret entries were created in the Vault as 'tool:${tool.id}:<field>'. Go to Tools → ${tool.name} → Configure and set values for: ${missing.join(', ')} (or edit the corresponding secrets in the Vault).`;
    } else {
      errorMsg += ` Go to Tools → ${tool.name} → Configure to set values for: ${missing.join(', ')} (stored in Vault).`;
    }
    return {
      executionId,
      toolId: tool.id,
      input,
      error: errorMsg,
      status: 'failed',
      startedAt: new Date(),
      completedAt: new Date(),
    };
  }

  async resolveCredentials(
    tool: Tool,
    _input: Record<string, unknown>,
    executionId?: string,
  ): Promise<{ resolved: Record<string, string | undefined>; sources: NamedCredentialSource[] }> {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    // A credential declared with `configKey` resolves against the Skill's own
    // configuration, so the provider needs the resolved values.
    const configuredValues = this.resolveSkillConfig(tool, _input);
    const credentialSources: Array<{
      logicalKey: string;
      label?: string;
      required: boolean;
      source: { vaultSecretId?: string; envVar?: string; configKey?: string; sensitive?: boolean };
    }> = [];

    if (manifest?.credentialSource && typeof manifest.credentialSource === 'object') {
      const cs = manifest.credentialSource as Record<
        string,
        { vaultSecretId?: string; envVar?: string; configKey?: string; label?: string; required?: boolean; sensitive?: boolean }
      >;
      for (const [logicalKey, source] of Object.entries(cs)) {
        if (source && typeof source === 'object') {
          const s = source as {
            vaultSecretId?: string;
            envVar?: string;
            configKey?: string;
            label?: string;
            required?: boolean;
            sensitive?: boolean;
          };
          // A declared `label` is what the operator sees when a credential is missing, so
          // it should say where the value goes rather than repeating the logical key.
          // `required` defaults to true: declaring a credential has always meant the
          // Skill cannot run without it, and only Skills that can genuinely degrade
          // should opt out.
          credentialSources.push({ logicalKey, label: s.label || logicalKey, required: s.required !== false, source: s });
        }
      }
    }

    const namedSources: NamedCredentialSource[] = credentialSources.map((c) => ({
      logicalKey: c.logicalKey,
      vaultSecretId: c.source.vaultSecretId,
      envVar: c.source.envVar,
      configKey: c.source.configKey,
      sensitive: c.source.sensitive,
    }));
    const resolved = await credentialProvider.resolveAll(namedSources, configuredValues);

    const overrides = this.pendingCredentialOverrides.get(tool.id) || {};
    const merged = { ...resolved, ...overrides };
    const missing = credentialSources
      .filter((c) => c.required && !merged[c.logicalKey])
      .map((c) => ({
        key: c.logicalKey,
        label: c.label || c.logicalKey,
        source: c.source,
      }));

    if (missing.length > 0) {
      const request: CredentialRequest = {
        executionId: executionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        idempotencyKey: executionId,
        toolId: tool.id,
        toolName: tool.name,
        missingCredentials: missing,
        message: `Tool "${tool.name}" requires credentials: ${missing.map((m) => m.label).join(', ')}`,
      };
      throw new CredentialRequiredError(request);
    }

    return { resolved: merged, sources: namedSources };
  }

  async hydrateSecretInputs(tool: Tool, input: Record<string, unknown>, resolvedValues: string[]): Promise<Record<string, unknown>> {
    const hydrate = async (value: unknown, schemaValue: unknown, path: string): Promise<unknown> => {
      const schema = schemaRecord(schemaValue);
      if (!schema) return value;
      if (isVaultSecretProperty(schema)) {
        if (value === undefined || value === null || value === '') return value;
        if (typeof value !== 'string' || !value.startsWith('vault://')) {
          throw new Error(`Secret input "${path}" must contain a Vault reference`);
        }
        const secretId = value.slice('vault://'.length);
        const plaintext = await credentialProvider.resolve({ vaultSecretId: secretId });
        if (plaintext === undefined) {
          throw new Error(`Vault secret for input "${path}" could not be resolved`);
        }
        resolvedValues.push(plaintext);
        return plaintext;
      }

      if (Array.isArray(value) && schema.items) {
        return Promise.all(value.map((item, index) => hydrate(item, schema.items, `${path}[${index}]`)));
      }
      const valueRecord = schemaRecord(value);
      const properties = schemaRecord(schema.properties);
      if (!valueRecord || !properties) return value;
      const hydrated: Record<string, unknown> = { ...valueRecord };
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(valueRecord, key)) {
          hydrated[key] = await hydrate(valueRecord[key], propertySchema, path ? `${path}.${key}` : key);
        }
      }
      return hydrated;
    };

    const schema = schemaRecord(tool.inputSchema);
    const properties = schemaRecord(schema?.properties);
    if (!properties) return input;
    const hydrated: Record<string, unknown> = { ...input };
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        hydrated[key] = await hydrate(input[key], propertySchema, key);
      }
    }
    return hydrated;
  }

  async storeSecretOutputs(tool: Tool, output: unknown, tenantId: unknown, resolvedValues: string[]): Promise<unknown> {
    const store = async (value: unknown, schemaValue: unknown, path: string): Promise<unknown> => {
      const schema = schemaRecord(schemaValue);
      if (!schema) return value;
      if (isVaultSecretProperty(schema)) {
        if (value === undefined || value === null || value === '') return value;
        if (typeof value !== 'string' || typeof tenantId !== 'string' || !tenantId) {
          throw new Error(`Secret output "${path}" must be a string and the execution must include a tenantId`);
        }
        resolvedValues.push(value);
        return credentialProvider.storeInVault(value, tenantId, `tool-${tool.id}-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
      }

      if (Array.isArray(value) && schema.items) {
        return Promise.all(value.map((item, index) => store(item, schema.items, `${path}[${index}]`)));
      }
      const valueRecord = schemaRecord(value);
      const properties = schemaRecord(schema.properties);
      if (!valueRecord || !properties) return value;
      const redacted: Record<string, unknown> = { ...valueRecord };
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(valueRecord, key)) {
          redacted[key] = await store(valueRecord[key], propertySchema, path ? `${path}.${key}` : key);
        }
      }
      return redacted;
    };

    const schema = schemaRecord(tool.outputSchema);
    const execution = schemaRecord(output);
    if (execution && typeof execution.output === 'string') {
      const parsedOutput = parseToolOutputJson(execution.output);
      if (parsedOutput !== undefined) {
        const storedOutput = await store(parsedOutput, schema, '');
        return { ...execution, output: JSON.stringify(storedOutput) };
      }
    }
    return store(output, schema, '');
  }

  /**
   * Resolved Skill configuration, using the same precedence as `isConfigured` so
   * the gate and the value a handler reads can never disagree.
   *
   * configSchema used to be a presence check only: the values were validated for
   * existence and then dropped, so a scheduled Skill could declare a required
   * selector (e.g. which genres to monitor) and have no way to read it. That made
   * configSchema indistinguishable from the "schema demands a value the handler
   * never reads" defect. Values declared per-run in `input` still win, because
   * that is how a one-off override has always been expressed.
   */
  resolveSkillConfig(tool: Tool, input: Record<string, unknown>): Record<string, unknown> {
    const manifest = tool.manifest as Record<string, unknown> | undefined;
    const sources: Array<Record<string, unknown> | undefined> = [
      tool.externalConfig as Record<string, unknown> | undefined,
      manifest?.config as Record<string, unknown> | undefined,
    ];
    const config: Record<string, unknown> = {};
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      for (const [key, value] of Object.entries(source)) config[key] = value;
    }
    // A declared credentialSource maps a logical config key to a nested path.
    const credentialSource = manifest?.credentialSource as { [k: string]: { configKey?: string } } | undefined;
    if (credentialSource && typeof credentialSource === 'object') {
      for (const spec of Object.values(credentialSource)) {
        if (!spec?.configKey) continue;
        const nested = this.getNestedValue(tool.externalConfig as Record<string, unknown> | undefined, spec.configKey);
        if (nested !== undefined && config[spec.configKey.split('.').pop() as string] === undefined) {
          config[spec.configKey.split('.').pop() as string] = nested;
        }
      }
    }
    // Per-run input fills gaps only. A key the operator declared in configSchema
    // stays operator-owned: input is caller-supplied, so letting it win would let
    // any API caller replace the selector or endpoint that scoped the job. This
    // matches the rule the runtime documents for why config is a separate object
    // from input at all.
    const declared = new Set(
      Object.keys((manifest?.configSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}),
    );
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (declared.has(key)) continue;
      config[key] = value;
    }
    return config;
  }
}