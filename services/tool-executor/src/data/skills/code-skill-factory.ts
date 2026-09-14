import { Tool, SchemaRecord, SchemaProperty } from '../../types'

export interface CodeSkillManifest {
  language: 'javascript' | 'typescript' | 'python'
  entrypoint: string
  sourceCode: string
  configSchema?: SchemaRecord
  credentialSource?: Record<string, { vaultSecretId?: string; envVar?: string; configKey?: string }>
  [key: string]: unknown
}

export interface CreateCodeSkillOptions {
  id: string
  name: string
  description: string
  manifest: Omit<CodeSkillManifest, 'language' | 'entrypoint'> & Partial<Pick<CodeSkillManifest, 'language' | 'entrypoint'>>
  inputSchema: SchemaRecord
  outputSchema: SchemaRecord
}

export function createCodeSkill(options: CreateCodeSkillOptions): Tool {
  const now = new Date()
  const manifest: Record<string, unknown> = {
    language: options.manifest.language ?? 'javascript',
    entrypoint: options.manifest.entrypoint ?? 'index.js',
    sourceCode: options.manifest.sourceCode,
  }

  if (options.manifest.configSchema !== undefined) {
    manifest.configSchema = options.manifest.configSchema
  }

  if (options.manifest.credentialSource !== undefined) {
    manifest.credentialSource = options.manifest.credentialSource
  }

  for (const [key, value] of Object.entries(options.manifest)) {
    if (
      key !== 'language' &&
      key !== 'entrypoint' &&
      key !== 'sourceCode' &&
      key !== 'configSchema' &&
      key !== 'credentialSource'
    ) {
      manifest[key] = value
    }
  }

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    type: 'code',
    manifest,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    createdAt: now,
    updatedAt: now,
  }
}

export interface CredentialSourceEntry {
  envVar?: string
  configKey?: string
  vaultSecretId?: string
}

export type CredentialEnvKeyMapValue = string | CredentialSourceEntry

export interface ExternalActionSkillOptions {
  id: string
  name: string
  description: string
  system: string
  action: string
  endpoint?: {
    url?: string
    path?: string
    method?: string
    envVar?: string
  }
  auth?: {
    type?: 'bearer' | 'basic' | 'api_key' | 'custom' | 'none'
    token?: string
    accessToken?: string
    username?: string
    password?: string
    header?: string
    value?: string
    apiKey?: string
    headers?: Record<string, string>
    credentialEnvKeyMap?: {
      token?: CredentialEnvKeyMapValue
      accessToken?: CredentialEnvKeyMapValue
      username?: CredentialEnvKeyMapValue
      password?: CredentialEnvKeyMapValue
      apiKey?: CredentialEnvKeyMapValue
    }
  }
  inputSchema?: SchemaRecord
  outputSchema?: SchemaRecord
  configSchema?: SchemaRecord
  credentialSource?: Record<string, CredentialSourceEntry>
  bodyField?: 'body' | 'payload' | 'record' | string
  timeoutMs?: number
}

type CredentialEnvKeyMap = NonNullable<ExternalActionSkillOptions['auth']>['credentialEnvKeyMap']

function getEnvVarName(value: CredentialEnvKeyMapValue | undefined, defaultName: string): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && value.envVar) return value.envVar
  return defaultName
}

function getCredentialSourceEntry(value: CredentialEnvKeyMapValue | undefined, defaultEnvVar: string): CredentialSourceEntry {
  const entry: CredentialSourceEntry = {}
  if (typeof value === 'string') {
    entry.envVar = value
  } else if (value && typeof value === 'object') {
    if (value.envVar) entry.envVar = value.envVar
    if (value.configKey) entry.configKey = value.configKey
    if (value.vaultSecretId) entry.vaultSecretId = value.vaultSecretId
  } else {
    entry.envVar = defaultEnvVar
  }
  return entry
}

function buildAuthConfig(auth: ExternalActionSkillOptions['auth'], envKeyMap?: CredentialEnvKeyMap): Record<string, unknown> {
  const authType = auth?.type || 'none'
  const config: Record<string, unknown> = { type: authType }

  switch (authType) {
    case 'bearer': {
      const tokenEnv = getEnvVarName(envKeyMap?.token, 'AUTH_TOKEN')
      const accessTokenEnv = getEnvVarName(envKeyMap?.accessToken, 'AUTH_TOKEN')
      if (auth?.token) {
        config.token = '${' + tokenEnv + '}'
      } else if (auth?.accessToken) {
        config.accessToken = '${' + accessTokenEnv + '}'
      } else {
        config.token = '${' + tokenEnv + '}'
      }
      break
    }
    case 'basic': {
      config.username = '${' + getEnvVarName(envKeyMap?.username, 'AUTH_USERNAME') + '}'
      config.password = '${' + getEnvVarName(envKeyMap?.password, 'AUTH_PASSWORD') + '}'
      break
    }
    case 'api_key': {
      config.header = auth?.header || 'X-API-Key'
      config.value = '${' + getEnvVarName(envKeyMap?.apiKey, 'AUTH_API_KEY') + '}'
      break
    }
    case 'custom': {
      if (auth?.headers) {
        config.headers = { ...auth.headers }
      }
      break
    }
  }

  return config
}

function buildCredentialSource(
  auth: ExternalActionSkillOptions['auth'],
  envKeyMap?: CredentialEnvKeyMap
): Record<string, CredentialSourceEntry> {
  const source: Record<string, CredentialSourceEntry> = {}

  if (!auth || auth.type === 'none') {
    return source
  }

  switch (auth.type) {
    case 'bearer': {
      if (auth.token) {
        source.token = getCredentialSourceEntry(envKeyMap?.token, 'AUTH_TOKEN')
      } else if (auth.accessToken) {
        source.accessToken = getCredentialSourceEntry(envKeyMap?.accessToken, 'AUTH_TOKEN')
      } else {
        source.token = getCredentialSourceEntry(envKeyMap?.token, 'AUTH_TOKEN')
      }
      break
    }
    case 'basic': {
      source.username = getCredentialSourceEntry(envKeyMap?.username, 'AUTH_USERNAME')
      source.password = getCredentialSourceEntry(envKeyMap?.password, 'AUTH_PASSWORD')
      break
    }
    case 'api_key': {
      source.apiKey = getCredentialSourceEntry(envKeyMap?.apiKey, 'AUTH_API_KEY')
      break
    }
  }

  return source
}

export function createExternalActionSkill(options: ExternalActionSkillOptions): Tool {
  const {
    id,
    name,
    description,
    system,
    action,
    endpoint,
    auth,
    inputSchema,
    outputSchema,
    configSchema,
    credentialSource,
    bodyField,
    timeoutMs,
  } = options

  const httpMethod = (endpoint?.method || 'POST').toUpperCase()
  const fixedEndpoint = endpoint?.url || endpoint?.path || ''
  const hasFixedEndpoint = Boolean(fixedEndpoint)
  const endpointEnvVar = endpoint?.envVar ?? null
  const authConfig = buildAuthConfig(auth, auth?.credentialEnvKeyMap)
  const authConfigStr = JSON.stringify(authConfig)
  const resolvedCredentialSource = credentialSource || buildCredentialSource(auth, auth?.credentialEnvKeyMap)

  const timeoutMsValue = timeoutMs !== undefined ? timeoutMs : undefined
  const timeoutCode = timeoutMsValue !== undefined
    ? `const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), ${timeoutMsValue});`
    : ''
  const fetchSignalProp = timeoutMsValue !== undefined ? 'signal: controller.signal,' : ''
  const clearTimeoutCode = timeoutMsValue !== undefined ? 'clearTimeout(timeoutId);' : ''

  const isGetOrHead = httpMethod === 'GET' || httpMethod === 'HEAD'
  const bodySelectionCode = bodyField !== undefined
    ? `const bodySource = input["${bodyField}"] ?? input;\n    const bodyContent = typeof bodySource === 'string' ? bodySource : JSON.stringify(bodySource);`
    : 'const bodyContent = typeof input === "string" ? input : JSON.stringify(input);'
  const fetchBodyCode = isGetOrHead ? 'undefined' : 'bodyContent'

  const sourceCode = `(async () => {
    const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
    const endpoint = ${JSON.stringify(fixedEndpoint)};
    const endpointEnvVar = ${JSON.stringify(endpointEnvVar)};
    let resolvedEndpoint = endpoint;

    if (!resolvedEndpoint && endpointEnvVar) {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env) {
          resolvedEndpoint = globalThis.process.env[endpointEnvVar] || '';
        }
      } catch (e) {}
    }
    if (!resolvedEndpoint && input.endpointUrl) {
      resolvedEndpoint = input.endpointUrl;
    }

    ${bodySelectionCode}

    const result = {
      success: false,
      mode: "${hasFixedEndpoint ? 'live' : 'dry-run'}",
      system: ${JSON.stringify(system)},
      action: ${JSON.stringify(action)},
      request: null,
      response: null,
      error: null
    };

    try {
      let headers = { "Content-Type": "application/json" };
      const resolved = await __resolveAuth(${authConfigStr});
      if (resolved && resolved.headers) {
        Object.assign(headers, resolved.headers);
      }

      const redactedHeaders = { ...headers };
      if (redactedHeaders.Authorization) redactedHeaders.Authorization = "[REDACTED]";
      if (redactedHeaders["api-key"]) redactedHeaders["api-key"] = "[REDACTED]";

      if (!resolvedEndpoint) {
        result.mode = "dry-run";
        result.success = true;
        result.request = { input: input, endpoint: resolvedEndpoint, method: ${JSON.stringify(httpMethod)}, headers: redactedHeaders };
        result.response = null;
        result.error = null;
        console.log(JSON.stringify(result));
        return result;
      }

      ${timeoutCode}

      const fetchOptions = {
        method: ${JSON.stringify(httpMethod)},
        headers: headers,
        ${fetchSignalProp}
        body: ${fetchBodyCode}
      };

      const res = await fetch(resolvedEndpoint, fetchOptions);

      ${clearTimeoutCode}

      const contentType = res.headers.get("content-type") || "";
      let responseData;
      try {
        if (contentType.includes("application/json")) {
          responseData = await res.json();
        } else {
          const text = await res.text();
          responseData = text ? { text } : null;
        }
      } catch (parseErr) {
        responseData = null;
      }

      result.success = res.ok;
      result.mode = "live";
      result.request = { input: input, endpoint: resolvedEndpoint, method: ${JSON.stringify(httpMethod)}, headers: redactedHeaders };
      result.response = { status: res.status, data: responseData };
      result.error = null;
      console.log(JSON.stringify(result));
      return result;
    } catch (err) {
      ${clearTimeoutCode}
      result.success = false;
      result.mode = "error";
      result.error = err instanceof Error ? err.message : String(err);
      result.request = { input: input, endpoint: resolvedEndpoint, method: ${JSON.stringify(httpMethod)} };
      result.response = null;
      console.log(JSON.stringify(result));
      return result;
    }
  })();`

  const manifest: Record<string, unknown> = {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode,
    system,
    action,
  }

  if (hasFixedEndpoint) {
    manifest.endpoint = {
      url: endpoint?.url,
      path: endpoint?.path,
      method: httpMethod,
    }
  }

  if (endpointEnvVar) {
    manifest.endpointEnvVar = endpointEnvVar
  }

  if (auth && auth.type && auth.type !== 'none') {
    manifest.auth = authConfig
  }

  if (configSchema !== undefined) {
    manifest.configSchema = configSchema
  }

  if (Object.keys(resolvedCredentialSource).length > 0) {
    manifest.credentialSource = resolvedCredentialSource
  }

  if (timeoutMs !== undefined) {
    manifest.timeoutMs = timeoutMs
  }

  if (bodyField !== undefined) {
    manifest.bodyField = bodyField
  }

  return createCodeSkill({
    id,
    name,
    description,
    manifest: manifest as Omit<CodeSkillManifest, 'language' | 'entrypoint'>,
    inputSchema: inputSchema || { type: 'object', properties: {} },
    outputSchema: outputSchema || ({
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: 'object',
          properties: {
            status: { type: 'number' },
            data: { type: 'object' },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    } as SchemaRecord),
  })
}

export function createSchemaProperty(
  type: SchemaProperty['type'],
  options?: Omit<Partial<SchemaProperty>, 'type'>
): SchemaProperty {
  return { type, ...options }
}

export function createSchemaRecord(
  properties: Record<string, SchemaProperty>,
  options?: { required?: string[]; additionalProperties?: boolean | SchemaProperty }
): SchemaRecord {
  const record: SchemaRecord = {
    type: 'object',
    properties,
  }
  if (options?.required) {
    record.required = options.required
  }
  if (options?.additionalProperties !== undefined) {
    record.additionalProperties = options.additionalProperties
  }
  return record
}

export const SchemaProps = {
  text: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('string', options),

  textarea: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('string', { multiline: true, ...options }),

  password: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('string', { sensitive: true, format: 'password', ...options }),

  email: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('string', { format: 'email', ...options }),

  url: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('string', { format: 'uri', ...options }),

  number: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('number', options),

  integer: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('integer', options),

  boolean: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('boolean', options),

  select: (enumValues: unknown[], options?: Omit<Partial<SchemaProperty>, 'type' | 'enum'>) =>
    createSchemaProperty('string', { enum: enumValues, ...options }),

  datetime: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('string', { format: 'date-time', ...options }),

  stringArray: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('array', { items: { type: 'string' }, ...options }),

  objectArray: (items: SchemaProperty, options?: Omit<Partial<SchemaProperty>, 'type' | 'items'>) =>
    createSchemaProperty('array', { items, ...options }),

  object: (properties: Record<string, SchemaProperty>, options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('object', { properties, ...options }),
}
