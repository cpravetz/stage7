import { Tool, SchemaRecord, SchemaProperty, SkillTrigger } from '../types'
import { DEFAULT_SCHEMA_VERSION, resolveSchemaVersion } from './schema-version'
import { withDerivedGate } from './gates'

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
  configSchema?: SchemaRecord
  triggers?: SkillTrigger[]
  tier?: 'advise' | 'aid' | 'represent'
  domainKnowledge?: string
  isSkill?: boolean
  timeoutMs?: number
  /** Record-shape version; defaults to the original shape (1). */
  schemaVersion?: number
  /** Event id announced when this skill completes. */
  emitEvent?: string | string[]
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

  const tool: Tool = {
    id: options.id,
    name: options.name,
    description: options.description,
    type: 'code',
    manifest,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    ...(options.configSchema ? { configSchema: options.configSchema } : {}),
    createdAt: now,
    updatedAt: now,
    triggers: options.triggers,
    tier: options.tier,
    domainKnowledge: options.domainKnowledge,
    isSkill: options.isSkill,
    schemaVersion: resolveSchemaVersion(options.schemaVersion),
  };

  // Derived last, from the finished Skill: the effective gate can depend on the
  // external action the manifest declares, which is only known once it is built.
  return withDerivedGate(tool);
}

export interface CredentialSourceEntry {
  envVar?: string
  configKey?: string
  vaultSecretId?: string
  /**
   * Operator-facing name for this credential, shown when it is missing. Defaults
   * to the logical key; set it when the bare key would not tell an operator where
   * the value is supposed to come from.
   */
  label?: string
  /**
   * Whether the executor refuses to run the Skill when this credential is
   * missing. Defaults to true.
   *
   * Set false for a credential the Skill can genuinely work without, such as one
   * only needed for a live external write: gating there would block the honest
   * "not connected" or dry-run path that the Skill exists to report, and would
   * replace a truthful explanation with a refusal.
   */
  required?: boolean
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
    /**
     * Config field holding the base URL. Which upstream a Skill talks to is an
     * operator setting, not a deployment fact, so it is read from the Skill's
     * own configuration rather than the process environment.
     */
    configKey?: string
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
    credentialEnvKeyMap?: Record<string, CredentialEnvKeyMapValue>
  }
  inputSchema?: SchemaRecord
  outputSchema?: SchemaRecord
  configSchema?: SchemaRecord
  credentialSource?: Record<string, CredentialSourceEntry>
  bodyField?: 'body' | 'payload' | 'record' | string
  triggers?: SkillTrigger[]
  timeoutMs?: number
  manifest?: Record<string, unknown>
  tier?: 'advise' | 'aid' | 'represent'
  domainKnowledge?: string
  isSkill?: boolean
  emitEvent?: string | string[]
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
    tier,
    domainKnowledge,
    isSkill,
    emitEvent,
  } = options
  const triggers = options.triggers

  const httpMethod = (endpoint?.method || 'POST').toUpperCase()
  const fixedEndpoint = endpoint?.url || endpoint?.path || ''
  const hasFixedEndpoint = Boolean(fixedEndpoint)
  const endpointConfigKey = endpoint?.configKey ?? null
  const authConfig = buildAuthConfig(auth, auth?.credentialEnvKeyMap)
  const authConfigStr = JSON.stringify(authConfig)
  const resolvedCredentialSource = credentialSource || buildCredentialSource(auth, auth?.credentialEnvKeyMap)

  const timeoutMsValue = timeoutMs !== undefined ? timeoutMs : undefined
  const timeoutCode = timeoutMsValue !== undefined
    ? `controller = new AbortController(); timeoutId = setTimeout(() => controller.abort(), ${timeoutMsValue});`
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
    const endpointConfigKey = ${JSON.stringify(endpointConfigKey)};
    let resolvedEndpoint = endpoint;

    // Endpoint precedence: a fixed URL baked into the Skill, then this Skill's
    // own configuration, then a per-run override.
    if (!resolvedEndpoint && endpointConfigKey) {
      const fromConfig = (typeof __skill_config !== 'undefined' && __skill_config) ? __skill_config[endpointConfigKey] : undefined;
      if (typeof fromConfig === 'string' && fromConfig) resolvedEndpoint = fromConfig;
    }
    if (!resolvedEndpoint && input.endpointUrl) {
      resolvedEndpoint = input.endpointUrl;
    }

    ${bodySelectionCode}

    const result = {
      success: false,
      system: ${JSON.stringify(system)},
      action: ${JSON.stringify(action)},
      request: null,
      response: null,
      error: null
    };

    // Declared outside the try so the catch handler can clear the timer. As a
    // const inside the try it was out of scope there, and referencing it turned
    // every real external failure into a misleading timeout error.
    let controller = null;
    let timeoutId = null;

    try {
      let headers = { "Content-Type": "application/json" };
      const resolved = await __resolveAuth(${authConfigStr});
      if (resolved && resolved.headers) {
        Object.assign(headers, resolved.headers);
      }

      const redactedHeaders = { ...headers };
      if (redactedHeaders.Authorization) redactedHeaders.Authorization = "[REDACTED]";
      if (redactedHeaders["api-key"]) redactedHeaders["api-key"] = "[REDACTED]";

      // Cross-Cutting Principle #2: When endpoint is unconfigured, return honest not-connected contract
      if (!resolvedEndpoint) {
        result.success = false;
        result.request = { input: input, endpoint: resolvedEndpoint, method: ${JSON.stringify(httpMethod)}, headers: redactedHeaders };
        result.response = null;
        result.error = "Not connected: required endpoint is not configured";
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
        result.request = { input: input, endpoint: resolvedEndpoint, method: ${JSON.stringify(httpMethod)}, headers: redactedHeaders };
        result.response = { status: res.status, data: responseData };
        result.error = null;

        // Build a minimal, deterministic presentation derived from the external response
        try {
          const present = [];
          const summaryParts = [];
          if (responseData && typeof responseData === 'object') {
            if (responseData.summary) summaryParts.push(String(responseData.summary));
            if (responseData.message) summaryParts.push(String(responseData.message));
          }
          summaryParts.push('Action: ' + ${JSON.stringify(action)});
          summaryParts.push('System: ' + ${JSON.stringify(system)});
          const body = summaryParts.join('\\n');
          present.push({ id: 'external-summary', title: 'External action result', kind: 'text', body });
          result.present = present;
        } catch (e) {
          result.present = [{ id: 'external-summary', title: 'External action result', kind: 'text', body: 'Result available; could not format presentation.' }];
        }

        console.log(JSON.stringify(result));
        return result;
    } catch (err) {
      ${clearTimeoutCode}
      result.success = false;
      result.error = err instanceof Error ? err.message : String(err);
      result.request = { input: input, endpoint: resolvedEndpoint, method: ${JSON.stringify(httpMethod)} };
      result.response = null;
        // Attach an error presentation so the UI can render an honest failure
        try {
          result.present = [{ id: 'external-error', title: 'External action failed', kind: 'text', body: result.error || 'External action failed' }];
        } catch (e) {
          // ignore
        }
        // The sandbox surfaces a Skill's result on stdout, so it has to be
        // printed here or the executor reports "no output".
        console.log(JSON.stringify(result));
        return result;
    }
  })();`

  const manifest: Record<string, unknown> = {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode,
    ...(options.manifest || {}),
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

  if (endpointConfigKey) {
    manifest.endpointConfigKey = endpointConfigKey
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

  if (emitEvent !== undefined) {
    manifest.emitEvent = emitEvent
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
      required: ['success', 'system', 'action', 'request', 'response', 'error'],
    } as SchemaRecord),
    triggers,
    tier,
    domainKnowledge,
    isSkill,
    emitEvent,
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

  // A value that has to be chosen from a source system rather than typed. It
  // renders as a select populated by that source, and stays empty while the
  // source is unconnected. Hand-typing an identifier almost always produces a
  // value the connector cannot resolve, so it is not offered.
  reference: (sourceId: string, options?: Omit<Partial<SchemaProperty>, 'type' | 'format' | 'x-referenceSource'>) =>
    createSchemaProperty('string', { format: 'reference', 'x-referenceSource': sourceId, ...options }),

  referenceArray: (sourceId: string, options?: Omit<Partial<SchemaProperty>, 'type' | 'items' | 'format' | 'x-referenceSource'>) =>
    createSchemaProperty('array', { items: { type: 'string' }, format: 'reference', 'x-referenceSource': sourceId, ...options }),

  stringArray: (options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('array', { items: { type: 'string' }, ...options }),

  objectArray: (items: SchemaProperty, options?: Omit<Partial<SchemaProperty>, 'type' | 'items'>) =>
    createSchemaProperty('array', { items, ...options }),

  object: (properties: Record<string, SchemaProperty>, options?: Omit<Partial<SchemaProperty>, 'type'>) =>
    createSchemaProperty('object', { properties, ...options }),
}

export interface DeclarativeSkillOptions {
  /** Record-shape version; defaults to the original shape (1). */
  schemaVersion?: number

  id: string
  name: string
  description: string
  persistenceEnvVar?: string
  /**
   * Event id announced when this skill completes. Downstream skills subscribe
   * with a matching `{ kind: 'event', eventId }` trigger.
   */
  emitEvent?: string | string[]
  /**
   * Operator-supplied configuration, carried onto the manifest verbatim so the
   * executor can resolve credentials and the endpoint before the skill runs.
   * `configSchema` documents it, `credentialSource` maps logical keys onto
   * vault secrets / env vars / config keys, and `endpointConfigKey` names the
   * config field holding the external endpoint URL.
   */
  configSchema?: SchemaRecord
  credentialSource?: Record<string, CredentialSourceEntry>
  /** Config field holding the external endpoint URL for this Skill. */
  endpointConfigKey?: string
  inputSchema: SchemaRecord
  outputSchema: SchemaRecord
  triggers?: SkillTrigger[]
  tier?: 'advise' | 'aid' | 'represent'
  domainKnowledge?: string
  isSkill?: boolean
  /**
   * Extra manifest fields carried onto the tool verbatim (e.g. `actionLabel`).
   * Spread first when building the manifest so `sourceCode` and
   * `persistenceEnvVar`, which the factory generates, always win.
   */
  manifest?: Record<string, unknown>
  handler: (input: any, ctx: any) => Promise<any> | any
}

/** Placeholder written over every character of a string/template/comment/regex literal. */
const TS_MASK_CHAR = '\u0000'

const TS_IDENT_START = /[A-Za-z_$]/
const TS_IDENT_PART = /[A-Za-z0-9_$]/
const TS_WHITESPACE = /\s/

/** Keywords whose parenthesised head is never a parameter list. */
const TS_NOT_PARAMS = new Set([
  'if',
  'while',
  'switch',
  'do',
  'else',
  'return',
  'typeof',
  'void',
  'delete',
  'await',
  'yield',
  'new',
  'in',
  'of',
  'instanceof',
  'case',
])

/**
 * Type names whose `<...>` argument list can simply be dropped. `Array<any>`
 * becomes `Array`, which is still a real runtime value.
 */
const TS_DROP_TYPE_ARGS = ['Array', 'ReadonlyArray', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet']

/**
 * Type-only utility generics. A surviving `Record<string, any>` is not a runtime
 * value at all, so it collapses to `any`.
 */
const TS_COLLAPSE_REFERENCES = [
  'Record',
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'NonNullable',
  'ReturnType',
  'Parameters',
  'ConstructorParameters',
  'InstanceType',
  'Awaited',
  'ThisType',
  'Uppercase',
  'Lowercase',
  'Capitalize',
  'Uncapitalize',
]

interface TypeStripEdit {
  start: number
  end: number
  text: string
}

function tsIsIdentPart(char: string | undefined): boolean {
  return char !== undefined && TS_IDENT_PART.test(char)
}

/**
 * Overwrites the contents of string, template, comment and regex literals with a
 * placeholder, keeping every offset identical. All later scanning runs on the
 * masked text, so handler data containing `": "` or `" as "` can never be
 * mistaken for TypeScript syntax. Template interpolations stay visible because
 * they are real code that can hold casts.
 *
 * Edits are collected as index ranges and applied to the original string, so
 * every literal survives byte for byte.
 */
function maskTypeScriptLiterals(source: string): string {
  const out = source.split('')
  const len = source.length
  let index = 0
  let previous = ''

  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i += 1) out[i] = TS_MASK_CHAR
  }

  const regexAllowed = () => previous === '' || '(,=:[!&|?{};+-*%<>~^'.includes(previous)

  while (index < len) {
    const char = source[index]

    if (char === '/' && source[index + 1] === '/') {
      let end = index
      while (end < len && source[end] !== '\n') end += 1
      blank(index, end)
      index = end
      continue
    }

    if (char === '/' && source[index + 1] === '*') {
      let end = index + 2
      while (end < len && !(source[end] === '*' && source[end + 1] === '/')) end += 1
      end = Math.min(end + 2, len)
      blank(index, end)
      index = end
      previous = ' '
      continue
    }

    if (char === '`') {
      // Blank the literal text but keep `${ ... }` interpolations scannable.
      blank(index, index + 1)
      let i = index + 1
      while (i < len) {
        if (source[i] === '\\') {
          blank(i, Math.min(i + 2, len))
          i += 2
          continue
        }
        if (source[i] === '`') {
          blank(i, i + 1)
          i += 1
          break
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          blank(i, i + 2)
          i += 2
          let depth = 1
          while (i < len && depth > 0) {
            const inner = source[i]
            if (inner === '\\') {
              i += 2
              continue
            }
            if (inner === '`') {
              // Nested template: skip to its closing backtick, braces and all.
              i += 1
              while (i < len && source[i] !== '`') i += 1
              i += 1
              continue
            }
            if (inner === '{') depth += 1
            else if (inner === '}') {
              depth -= 1
              if (depth === 0) {
                i += 1
                break
              }
            }
            i += 1
          }
          continue
        }
        blank(i, i + 1)
        i += 1
      }
      index = i
      previous = ')'
      continue
    }

    if (char === '"' || char === "'") {
      let end = index + 1
      while (end < len) {
        if (source[end] === '\\') {
          end += 2
          continue
        }
        if (source[end] === char) {
          end += 1
          break
        }
        end += 1
      }
      blank(index, Math.min(end, len))
      index = Math.min(end, len)
      previous = char
      continue
    }

    if (char === '/' && regexAllowed()) {
      let end = index + 1
      let inClass = false
      let closed = false
      while (end < len) {
        const current = source[end]
        if (current === '\\') {
          end += 2
          continue
        }
        if (current === '\n') break
        if (current === '[') inClass = true
        else if (current === ']') inClass = false
        else if (current === '/' && !inClass) {
          closed = true
          end += 1
          while (end < len && TS_IDENT_PART.test(source[end])) end += 1
          break
        }
        end += 1
      }
      // Only consume it when a closing `/` was actually found. Without this a
      // regex carrying flags (`/[a-z]+/g`) leaves the trailing `/` mistaken for
      // division, and a `'` inside its character class then opens a string that
      // swallows the rest of the handler.
      if (closed) {
        blank(index, end)
        index = end
        previous = '/'
        continue
      }
    }

    if (!TS_WHITESPACE.test(char)) previous = char
    index += 1
  }

  return out.join('')
}

/** Returns the index of the first non-whitespace character at or after `from`. */
function tsSkipWhitespace(masked: string, from: number): number {
  let index = from
  while (index < masked.length && TS_WHITESPACE.test(masked[index])) index += 1
  return index
}

/**
 * Returns the index just past the balanced bracket group starting at `open`,
 * mixing `<>`, `()`, `{}` and `[]` so a single counter covers object types,
 * tuple types and function types alike.
 */
function tsConsumeBalanced(masked: string, open: number): number {
  const openers: Record<string, string> = { '<': '>', '(': ')', '{': '}', '[': ']' }
  const closers = Object.values(openers)
  let depth = 0
  let index = open
  while (index < masked.length) {
    const char = masked[index]
    if (char in openers) depth += 1
    else if (closers.includes(char)) {
      depth -= 1
      if (depth === 0) return index + 1
    }
    index += 1
  }
  return index
}

/**
 * Counts the `(` still open at `index`, so the caller can tell a function body
 * `{` from an object-type `{`. Only reached on annotation-sized inputs, so the
 * single pre-pass is cheap enough.
 */
let tsOpenParenMap: Map<number, number> | null = null

function tsOpenParens(masked: string, index: number): number {
  if (tsOpenParenMap === null || tsOpenParenMap.size !== masked.length) {
    const map = new Map<number, number>()
    let depth = 0
    for (let i = 0; i < masked.length; i += 1) {
      map.set(i, depth)
      if (masked[i] === '(') depth += 1
      else if (masked[i] === ')') depth -= 1
    }
    tsOpenParenMap = map
  }
  return tsOpenParenMap.get(index) ?? 0
}

/** True when a type expression, rather than a value, starts at `from`. */
function tsStartsType(masked: string, from: number): boolean {
  const at = tsSkipWhitespace(masked, from)
  const char = masked[at]
  if (char === undefined) return false
  return TS_IDENT_START.test(char) || "([{<|&'".includes(char)
}

/**
 * Reads a type expression starting at `from` and returns the index just past it.
 * Stops at whatever ends an annotation: `=`, `,`, `;`, a closing bracket, or
 * the `{` that opens a function body.
 */
function tsTypeEnd(masked: string, from: number): number {
  let index = from
  // Tracked separately so the whitespace between a type and the value that
  // follows it survives: `const x: number = 1` must become `const x = 1`.
  let lastTypeEnd = from

  while (index < masked.length) {
    index = tsSkipWhitespace(masked, index)
    const char = masked[index]

    if (char === undefined) return lastTypeEnd

    // A `{` here opens the function body that follows the annotation, unless
    // a `(` is still open, in which case it is an object type.
    if (char === '{' && tsOpenParens(masked, index) === 0) return lastTypeEnd

    if (char === '(' || char === '[' || char === '<' || char === '{') {
      index = tsConsumeBalanced(masked, index)
      lastTypeEnd = index
      continue
    }

    if (char === '=' && masked[index + 1] === '>') {
      // A function type's return type follows the arrow. The arrow that closes
      // an arrow function's own return type is not part of the type, so stop
      // once there is no unclosed `(` awaiting a return type.
      if (tsOpenParens(masked, index) === 0) return lastTypeEnd
      index += 2
      lastTypeEnd = index
      continue
    }

    if (char === '.' || char === '|' || char === '&') {
      if (!tsStartsType(masked, index + 1)) return lastTypeEnd
      index += 1
      lastTypeEnd = index
      continue
    }

    if (TS_IDENT_START.test(char)) {
      index += 1
      while (tsIsIdentPart(masked[index])) index += 1
      lastTypeEnd = index
      continue
    }

    return lastTypeEnd
  }

  return lastTypeEnd
}

/**
 * Given the `:` that starts a parameter list's return type, finds the token
 * that ends the type: the `=>` of an arrow or the `{` of a function body.
 * Scans rather than reusing tsTypeEnd because a function type's own body must
 * not be swallowed along with the annotation.
 */
function tsReturnTypeTail(masked: string, from: number): string | undefined {
  let index = from
  while (index < masked.length) {
    const char = masked[index]
    if (char === '(' || char === '[' || char === '{' || char === '<') {
      if (char === '{') return '{'
      index = tsConsumeBalanced(masked, index)
      continue
    }
    if (char === '=' && masked[index + 1] === '>') return '=>'
    if (char === ';' || char === ',') return undefined
    index += 1
  }
  return undefined
}

/** Classifies a parenthesised group: does it hold a function's parameters? */
function tsIsParamsGroup(masked: string, open: number, close: number): boolean {
  const wordBefore = masked.slice(0, open).match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*$/)?.[1]
  const afterClose = tsSkipWhitespace(masked, close + 1)
  const afterChar = masked[afterClose]

  // `(input: any, ctx: any) =>` and `(input: any): Promise<void> {`
  if (afterChar === '=>') return true
  if (afterChar === ':') {
    const tail = tsReturnTypeTail(masked, afterClose + 1)
    return tail === '=>' || tail === '{'
  }

  // `catch (e: any)`, `for (let i: number = 0; ...)`, `switch (x: T)`.
  if (wordBefore === 'catch' || wordBefore === 'for' || wordBefore === 'switch' || wordBefore === 'with') {
    return true
  }
  if (wordBefore && TS_NOT_PARAMS.has(wordBefore)) return false

  // `async handler(input: any, ctx: any) {` is a method head, not a control
  // statement, because the preceding word is not a keyword.
  if (afterChar === '{' && wordBefore) return true

  return false
}

/**
 * Removes TypeScript-only syntax from a handler's source text.
 *
 * `createDeclarativeCodeSkill` embeds `handler.toString()` into the generated
 * `sourceCode`, but the executor runs that text as plain JavaScript in a Node
 * child process. Annotations such as `input: any`, `: Promise<void>`,
 * `value as Record<string, any>` or a postfix `!` are not valid JavaScript, so
 * the sandbox dies with a SyntaxError and the skill reports no output at all.
 *
 * The pass is bracket-aware rather than a blanket regex. Literals are masked so
 * string data is never rewritten, and a `:` counts as a type separator only
 * inside a parameter list or after a declared name, so ternaries, object
 * literals, labels and `switch` cases survive untouched.
 */
export const __mask = maskTypeScriptLiterals;

export function stripTypeScript(source: string): string {
  const masked = maskTypeScriptLiterals(source)
  const len = masked.length
  const edits: TypeStripEdit[] = []
  tsOpenParenMap = null

  // Resolve every bracket pair so each `(` group can be classified.
  const closeOf = new Map<number, number>()
  const opens: number[] = []
  for (let index = 0; index < len; index += 1) {
    const char = masked[index]
    if (char === '(' || char === '[' || char === '{') opens.push(index)
    else if (char === ')' || char === ']' || char === '}') {
      const open = opens.pop()
      if (open !== undefined) closeOf.set(open, index)
    }
  }

  // Parameter annotations, optional markers and return types.
  for (const [open, close] of closeOf) {
    if (masked[open] !== '(' || !tsIsParamsGroup(masked, open, close)) continue

    let depth = 0
    let pendingTernary = 0
    for (let index = open + 1; index < close; index += 1) {
      const char = masked[index]
      if (char === '(' || char === '[' || char === '{') {
        depth += 1
        continue
      }
      if (char === ')' || char === ']' || char === '}') {
        depth -= 1
        continue
      }
      if (depth !== 0) continue

      if (char === '?') {
        const after = tsSkipWhitespace(masked, index + 1)
        if (masked[after] === ':' && tsIsIdentPart(masked[index - 1])) {
          // `input?: string` — the marker and its type go together.
          edits.push({ start: index, end: tsTypeEnd(masked, after + 1), text: '' })
          continue
        }
        if (masked[after] !== '.' && masked[after] !== '?') pendingTernary += 1
        continue
      }

      if (char === ',' || char === ';') {
        pendingTernary = 0
        continue
      }

      if (char !== ':') continue
      if (pendingTernary > 0) {
        pendingTernary -= 1
        continue
      }
      edits.push({ start: index, end: tsTypeEnd(masked, index + 1), text: '' })
    }

    // `function foo(): Promise<void> {` and `(): void =>`. The annotation
    // edit stops on the `{`, so the space in front of it is preserved.
    const afterClose = tsSkipWhitespace(masked, close + 1)
    if (masked[afterClose] === ':') {
      const typeEnd = tsTypeEnd(masked, afterClose + 1)
      if (typeEnd > afterClose + 1) edits.push({ start: afterClose, end: typeEnd, text: '' })
    }
  }

  // Variable annotations: `const total: number = 0`, `let seen: any`.
  const declaration = /\b(?:const|let|var)\s+[$A-Z_a-z][\w$]*\s*:/g
  let declarationMatch: RegExpExecArray | null
  while ((declarationMatch = declaration.exec(masked)) !== null) {
    const colon = masked.indexOf(':', declarationMatch.index)
    edits.push({ start: colon, end: tsTypeEnd(masked, colon + 1), text: '' })
  }

  // Destructured declarations: `const { a, b }: Config = x`.
  const destructured = /\b(?:const|let|var)\s*(?:\{[^}]*\}|\[[^\]]*\])\s*:/g
  let destructuredMatch: RegExpExecArray | null
  while ((destructuredMatch = destructured.exec(masked)) !== null) {
    const colon = destructuredMatch.index + destructuredMatch[0].length - 1
    edits.push({ start: colon, end: tsTypeEnd(masked, colon + 1), text: '' })
  }

  // `as` assertions, including generic and union types.
  const asPattern = /(^|[^\w$.])[ \t]*as[ \t]+/g
  let asMatch: RegExpExecArray | null
  while ((asMatch = asPattern.exec(masked)) !== null) {
    // `as` carries no value, so take the space in front of it too and leave
    // `value;` rather than `value ;`.
    const start = asMatch.index + (TS_WHITESPACE.test(asMatch[1]) ? 0 : asMatch[1].length)
    edits.push({ start, end: tsTypeEnd(masked, asMatch.index + asMatch[0].length), text: '' })
  }

  // Postfix non-null assertions: `value!.field`, `value!`.
  for (let index = 1; index < len; index += 1) {
    if (masked[index] !== '!') continue
    const before = masked[index - 1]
    if (!tsIsIdentPart(before) && before !== ')' && before !== ']') continue
    const after = tsSkipWhitespace(masked, index + 1)
    if (!'.,)]}'.includes(masked[after] ?? '')) continue
    edits.push({ start: index, end: index + 1, text: '' })
  }

  // Generic call arguments: `list.filter<any>(fn)` -> `list.filter(fn)`.
  const genericCall = /([A-Za-z_$][\w$]*)<([^<>;=(){}]*)>\s*\(/g
  let genericMatch: RegExpExecArray | null
  while ((genericMatch = genericCall.exec(masked)) !== null) {
    const before = masked[genericMatch.index - 1] ?? ''
    if (tsIsIdentPart(before) || before === '.' || before === '$') continue
    const angleStart = genericMatch.index + genericMatch[1].length
    edits.push({ start: angleStart, end: angleStart + genericMatch[2].length + 2, text: '' })
  }

  // `Array<any>` keeps its runtime meaning, so only the argument list goes.
  const dropArgs = new RegExp(`(^|[^\\w$.])(${TS_DROP_TYPE_ARGS.join('|')})<[^<>]*>`, 'g')
  let dropArgsMatch: RegExpExecArray | null
  while ((dropArgsMatch = dropArgs.exec(masked)) !== null) {
    const start = dropArgsMatch.index + dropArgsMatch[1].length + dropArgsMatch[2].length
    edits.push({ start, end: dropArgsMatch.index + dropArgsMatch[0].length, text: '' })
  }

  // A surviving `Record<string, any>` is not a runtime value, so it collapses.
  // `T[]` is deliberately untouched: it only ever occurs in a type position,
  // which the rules above have already removed.
  const collapse = new RegExp(`(^|[^\\w$.])(${TS_COLLAPSE_REFERENCES.join('|')})<[^<>]*>`, 'g')
  let collapseMatch: RegExpExecArray | null
  while ((collapseMatch = collapse.exec(masked)) !== null) {
    const start = collapseMatch.index + collapseMatch[1].length
    edits.push({ start, end: collapseMatch.index + collapseMatch[0].length, text: 'any' })
  }

  if (edits.length === 0) return source

  edits.sort((a, b) => a.start - b.start || b.end - a.end)

  let result = ''
  let cursor = 0
  for (const edit of edits) {
    if (edit.start < cursor) continue
    result += source.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return result + source.slice(cursor)
}

/**
 * The label for the Overview Run button.
 *
 * A Skill that does not name one gets its own name, so the button always says
 * what it will do ("Screen Resume for Role Fit") rather than a generic "Run".
 * An explicit label is always respected, so a Skill can use a shorter imperative
 * phrase where its name is too long to read on a button.
 */
export function resolveActionLabel(skillName: string, explicit?: string): { actionLabel: string } {
  const trimmed = typeof explicit === 'string' ? explicit.trim() : '';
  if (trimmed) return { actionLabel: trimmed };
  const name = typeof skillName === 'string' ? skillName.trim() : '';
  return { actionLabel: name || 'Run' };
}

export function createDeclarativeCodeSkill(options: DeclarativeSkillOptions): Tool {
  const persistenceEnvVar = options.persistenceEnvVar || 'STORAGE_DIR'
  let rawFnStr = stripTypeScript(options.handler.toString().trim())
  // Arrow functions first: an arrow source also matches the named-function patterns
  // below (`async (a, b) => {}` looks like an identifier call), and prefixing it with
  // `function` yields `function async (a, b) => {}`, a syntax error.
  if (/^(async\s+)?\([^)]*\)\s*=>/.test(rawFnStr)) {
    const isAsync = /^async\s/.test(rawFnStr)
    const prefix = isAsync ? 'async ' : ''
    const inner = isAsync ? rawFnStr.slice(5).trimStart() : rawFnStr
    const match = inner.match(/^\(([^)]*)\)\s*=>/)
    if (match) {
      rawFnStr = prefix + 'function(' + match[1] + ')' + inner.slice(match[0].length)
    }
  } else if (/^async\s+[a-zA-Z0-9_$]+\s*\(/.test(rawFnStr)) {
    rawFnStr = rawFnStr.replace(/^async\s+[a-zA-Z0-9_$]+/, 'async function')
  } else if (/^[a-zA-Z0-9_$]+\s*\(/.test(rawFnStr) && !rawFnStr.startsWith('function')) {
    rawFnStr = 'function ' + rawFnStr
  }

  const sourceCode = `(async () => {
    let stage7Runtime;
    try {
      stage7Runtime = require('./stage7-runtime');
    } catch (e) {
      // Fallback
    }
    // Config and credentials must be passed in, not read from module-scope
    // globals: stage7-runtime is loaded with require(), so it has its own scope
    // and cannot see __skill_config / __skill_credentials declared above. Relying
    // on the globals silently gave every Skill an empty config and no credentials.
    const ctx = stage7Runtime ? stage7Runtime.context({
      persistenceEnvVar: ${JSON.stringify(persistenceEnvVar)},
      config: typeof __skill_config !== 'undefined' && __skill_config ? __skill_config : {},
      credentials: typeof __skill_credentials !== 'undefined' && __skill_credentials ? __skill_credentials : {},
    }) : (function () {
      // Fallback runtime (tests, or a host without the shared module). Mirrors the
      // stage7-runtime context shape so handlers that touch ctx.store / ctx.delegate
      // / ctx.render keep working: store is an in-memory map, delegate rejects, and
      // render builds the same blocks the real runtime builds.
      var memory = {};
      return {
        input: typeof __tool_input !== 'undefined' ? __tool_input : {},
        // Resolved configuration. Mirrors stage7-runtime so handlers that read
        // ctx.config behave the same whether or not the runtime module loaded.
        config: typeof __skill_config !== 'undefined' && __skill_config ? __skill_config : {},
        credentials: typeof __skill_credentials !== 'undefined' && __skill_credentials ? __skill_credentials : {},
        getCredential: function (logicalKey) {
          var v = this.credentials[logicalKey];
          return typeof v === 'string' && v.length > 0 ? v : undefined;
        },
        store: {
          collection: 'default',
          getFilePath: function (key) { return String(key) + '.json'; },
          load: function (key, defaultValue) {
            return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : (defaultValue === undefined ? [] : defaultValue);
          },
          loadAsync: async function (key, defaultValue) { return this.load(key, defaultValue); },
          save: function (key, data) { memory[key] = data; },
          delete: function (key) { delete memory[key]; },
          list: async function () { return Object.keys(memory); }
        },
        emit: {
          success: (res) => { console.log(JSON.stringify(res)); return res; },
          failure: (err) => { console.log(JSON.stringify({ success: false, error: String(err) })); },
          notConnected: (reason, details) => {
            const out = { success: false, status: 'not-connected', data: null, error: 'Not connected: ' + reason };
            console.log(JSON.stringify(out));
            return out;
          }
        },
        delegate: async function (toolId) { throw new Error('Tool execution environment does not support delegation to ' + toolId); },
        render: {
          text: function (id, title, bodyOrLines) {
            return { id: id, title: title, kind: 'text', body: Array.isArray(bodyOrLines) ? bodyOrLines.join('\\n') : String(bodyOrLines) };
          },
          markdown: function (id, title, bodyOrLines) {
            return { id: id, title: title, kind: 'markdown', body: Array.isArray(bodyOrLines) ? bodyOrLines.join('\\n') : String(bodyOrLines) };
          },
          list: function (id, title, items) {
            return { id: id, title: title, kind: 'text', body: (items || []).map(function (i) { return '- ' + i; }).join('\\n') };
          }
        }
      };
    })();
    // The runtime is a separate require()d module, so the module-scoped
    // __tool_input is not visible to it and ctx.input comes back empty. Hand
    // the real input over explicitly.
    if (typeof __tool_input !== 'undefined') {
      ctx.input = __tool_input;
    }
    // Same for resolved configuration: the runtime is a separate module, so it
    // cannot see this module-scoped global. Hand it over explicitly.
    if (typeof __skill_config !== 'undefined' && __skill_config) {
      ctx.config = __skill_config;
    }
    // Same scoping problem for __execute_tool: the executor defines it on the
    // wrapper script, the runtime module cannot see it, so a handler calling
    // ctx.delegate would always hit the runtime's "no delegation" rejection.
    // Rebind it to the executor's bridge when one is present.
    if (typeof __execute_tool === 'function') {
      var __bridge = __execute_tool;
      ctx.delegate = async function (toolId, toolInput) { return await __bridge(toolId, toolInput); };
    }

    const handler = ${rawFnStr};
    try {
      const result = await handler(ctx.input, ctx);
      if (result) {
        ctx.emit.success(result);
      }
    } catch (err) {
      ctx.emit.failure(err);
    }
  })();`

  // The gate is the tier, full stop (checklist §4.3). An author cannot raise it
  // and cannot switch it off, for any trigger kind.

  return createCodeSkill({
    id: options.id,
    name: options.name,
    description: options.description,
    manifest: {
      ...(options.manifest || {}),
      sourceCode,
      persistenceEnvVar,
      // The Overview Run button reads manifest.actionLabel and falls back to a
      // bare "Run", which told the user nothing about what pressing it would do.
      // Defaulting the label to the Skill's own name means every button is
      // Skill-specific, without each Skill having to remember to set one -- only
      // the 16 career Skills did, and the other 59 user-triggered Skills all read
      // "Run". An explicit actionLabel in options.manifest still wins.
      ...(resolveActionLabel(options.name, (options.manifest as { actionLabel?: string } | undefined)?.actionLabel)),
      ...(options.emitEvent ? { emitEvent: options.emitEvent } : {}),
      ...(options.configSchema ? { configSchema: options.configSchema } : {}),
      ...(options.credentialSource ? { credentialSource: options.credentialSource } : {}),
      ...(options.endpointConfigKey ? { endpointConfigKey: options.endpointConfigKey } : {}),
    },
    configSchema: options.configSchema,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    // No self-subscription is appended for `emitEvent`. An earlier version added
    // one so the event would show up in the Overview trigger graph, but a
    // subscription is also a dispatch edge: the runtime resolves subscribers by
    // id and does not exclude the emitter, so declaring `emitEvent` made the
    // Skill re-run itself. For a `represent` Skill that meant one user action
    // sending the email twice. The event is already visible from the
    // declaration itself, and `GET /triggers` reports it as an emitted event.
    triggers: options.triggers,
    tier: options.tier,
    domainKnowledge: options.domainKnowledge,
    isSkill: options.isSkill,
    schemaVersion: options.schemaVersion,
  })
}
