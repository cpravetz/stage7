import { createExternalActionSkill, createCodeSkill } from '../data/skills/code-skill-factory'

describe('createCodeSkill', () => {
  it('creates a code skill with minimal manifest', () => {
    const skill = createCodeSkill({
      id: 'test-1',
      name: 'Test Skill',
      description: 'A test skill',
      manifest: {
        sourceCode: 'console.log("hello")',
      },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    })

    expect(skill.id).toBe('test-1')
    expect(skill.type).toBe('code')
    expect(skill.manifest.language).toBe('javascript')
    expect(skill.manifest.entrypoint).toBe('index.js')
    expect(skill.manifest.sourceCode).toBe('console.log("hello")')
  })

  it('preserves custom language and entrypoint', () => {
    const skill = createCodeSkill({
      id: 'test-2',
      name: 'Test Skill',
      description: 'A test skill',
      manifest: {
        language: 'typescript',
        entrypoint: 'main.ts',
        sourceCode: 'console.log("hello")',
      },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    })

    expect(skill.manifest.language).toBe('typescript')
    expect(skill.manifest.entrypoint).toBe('main.ts')
  })

  it('includes configSchema and credentialSource in manifest', () => {
    const skill = createCodeSkill({
      id: 'test-3',
      name: 'Test Skill',
      description: 'A test skill',
      manifest: {
        sourceCode: 'console.log("hello")',
        configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } },
        credentialSource: { apiKey: { envVar: 'MY_API_KEY' } },
      },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    })

    expect(skill.manifest.configSchema).toEqual({ type: 'object', properties: { apiKey: { type: 'string' } } })
    expect(skill.manifest.credentialSource).toEqual({ apiKey: { envVar: 'MY_API_KEY' } })
  })

  it('copies extra manifest properties', () => {
    const skill = createCodeSkill({
      id: 'test-4',
      name: 'Test Skill',
      description: 'A test skill',
      manifest: {
        sourceCode: 'console.log("hello")',
        customField: 'custom-value',
        anotherField: 123,
      },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    })

    expect(skill.manifest.customField).toBe('custom-value')
    expect(skill.manifest.anotherField).toBe(123)
  })
})

describe('createExternalActionSkill', () => {
  const baseOptions = {
    id: 'ext-1',
    name: 'External Action',
    description: 'Calls an external API',
    system: 'test-system',
    action: 'test-action',
  }

  it('resolves endpoint from url, then envVar, then input.endpointUrl', () => {
    const skill = createExternalActionSkill({
      ...baseOptions,
      endpoint: { url: 'https://api.example.com/endpoint', method: 'POST' },
    })

    expect(skill.manifest.endpoint).toEqual({
      url: 'https://api.example.com/endpoint',
      path: undefined,
      method: 'POST',
    })
    expect(skill.manifest.endpointEnvVar).toBeUndefined()
    const source = skill.manifest.sourceCode as string
    expect(source).toContain('const endpoint = "https://api.example.com/endpoint"')
    expect(source).toContain('const endpointEnvVar = null')
  })

  it('uses endpoint.envVar when url/path not provided', () => {
    const skill = createExternalActionSkill({
      ...baseOptions,
      endpoint: { envVar: 'API_ENDPOINT', method: 'POST' },
    })

    expect(skill.manifest.endpointEnvVar).toBe('API_ENDPOINT')
    expect(skill.manifest.endpoint).toBeUndefined()
    const source = skill.manifest.sourceCode as string
    expect(source).toContain('const endpoint = ""')
    expect(source).toContain('const endpointEnvVar = "API_ENDPOINT"')
    expect(source).toContain('globalThis.process.env[endpointEnvVar]')
  })

  it('falls back to input.endpointUrl when no fixed endpoint or envVar', () => {
    const skill = createExternalActionSkill({
      ...baseOptions,
      endpoint: { method: 'POST' },
    })

    expect(skill.manifest.endpoint).toBeUndefined()
    expect(skill.manifest.endpointEnvVar).toBeUndefined()
    const source = skill.manifest.sourceCode as string
    expect(source).toContain('const endpoint = ""')
    expect(source).toContain('const endpointEnvVar = null')
    expect(source).toContain('input.endpointUrl')
  })

  it('sets dry-run mode when no fixed endpoint', () => {
    const skill = createExternalActionSkill({
      ...baseOptions,
      endpoint: { method: 'POST' },
    })

    const source = skill.manifest.sourceCode as string
    expect(source).toContain('mode: "dry-run"')
  })

  it('sets live mode when fixed endpoint provided', () => {
    const skill = createExternalActionSkill({
      ...baseOptions,
      endpoint: { url: 'https://api.example.com/endpoint', method: 'POST' },
    })

    const source = skill.manifest.sourceCode as string
    expect(source).toContain('mode: "live"')
  })

  describe('auth credential mapping', () => {
    it('maps bearer token with credentialEnvKeyMap', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'bearer',
          token: 'secret-token',
          credentialEnvKeyMap: {
            token: { envVar: 'CUSTOM_TOKEN_ENV', configKey: 'tokenConfig', vaultSecretId: 'vault/token' },
          },
        },
      })

      expect(skill.manifest.auth).toEqual({
        type: 'bearer',
        token: '${CUSTOM_TOKEN_ENV}',
      })
      expect(skill.manifest.credentialSource).toEqual({
        token: { envVar: 'CUSTOM_TOKEN_ENV', configKey: 'tokenConfig', vaultSecretId: 'vault/token' },
      })
    })

    it('maps basic auth with credentialEnvKeyMap', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'basic',
          username: 'user',
          password: 'pass',
          credentialEnvKeyMap: {
            username: { envVar: 'BASIC_USER', configKey: 'userConfig' },
            password: { envVar: 'BASIC_PASS', vaultSecretId: 'vault/pass' },
          },
        },
      })

      expect(skill.manifest.auth).toEqual({
        type: 'basic',
        username: '${BASIC_USER}',
        password: '${BASIC_PASS}',
      })
      expect(skill.manifest.credentialSource).toEqual({
        username: { envVar: 'BASIC_USER', configKey: 'userConfig' },
        password: { envVar: 'BASIC_PASS', vaultSecretId: 'vault/pass' },
      })
    })

    it('maps api_key auth with credentialEnvKeyMap', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'api_key',
          apiKey: 'secret-key',
          header: 'X-Custom-Key',
          credentialEnvKeyMap: {
            apiKey: { envVar: 'API_KEY_ENV', configKey: 'apiKeyConfig', vaultSecretId: 'vault/apikey' },
          },
        },
      })

      expect(skill.manifest.auth).toEqual({
        type: 'api_key',
        header: 'X-Custom-Key',
        value: '${API_KEY_ENV}',
      })
      expect(skill.manifest.credentialSource).toEqual({
        apiKey: { envVar: 'API_KEY_ENV', configKey: 'apiKeyConfig', vaultSecretId: 'vault/apikey' },
      })
    })

    it('uses default env var names when credentialEnvKeyMap not provided', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'bearer',
          token: 'secret',
        },
      })

      expect(skill.manifest.auth).toEqual({
        type: 'bearer',
        token: '${AUTH_TOKEN}',
      })
      expect(skill.manifest.credentialSource).toEqual({
        token: { envVar: 'AUTH_TOKEN' },
      })
    })

    it('uses explicit credentialSource over credentialEnvKeyMap', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'bearer',
          token: 'secret',
          credentialEnvKeyMap: {
            token: { envVar: 'FROM_MAP' },
          },
        },
        credentialSource: {
          token: { envVar: 'EXPLICIT_ENV', configKey: 'explicitConfig' },
        },
      })

      expect(skill.manifest.credentialSource).toEqual({
        token: { envVar: 'EXPLICIT_ENV', configKey: 'explicitConfig' },
      })
    })

    it('does not include auth in manifest when type is none', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: { type: 'none' },
      })

      expect(skill.manifest.auth).toBeUndefined()
      expect(skill.manifest.credentialSource).toBeUndefined()
    })
  })

  describe('bodyField handling', () => {
    it('uses bodyField when supplied with fallback to input', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        bodyField: 'body',
      })

      expect(skill.manifest.bodyField).toBe('body')
      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodySource = input["body"] ?? input;')
      expect(source).toContain("const bodyContent = typeof bodySource === 'string' ? bodySource : JSON.stringify(bodySource);")
    })

    it('uses payload as bodyField with fallback', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        bodyField: 'payload',
      })

      expect(skill.manifest.bodyField).toBe('payload')
      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodySource = input["payload"] ?? input;')
      expect(source).toContain("const bodyContent = typeof bodySource === 'string' ? bodySource : JSON.stringify(bodySource);")
    })

    it('uses record as bodyField with fallback', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        bodyField: 'record',
      })

      expect(skill.manifest.bodyField).toBe('record')
      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodySource = input["record"] ?? input;')
      expect(source).toContain("const bodyContent = typeof bodySource === 'string' ? bodySource : JSON.stringify(bodySource);")
    })

    it('uses custom bodyField string with fallback', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        bodyField: 'customField',
      })

      expect(skill.manifest.bodyField).toBe('customField')
      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodySource = input["customField"] ?? input;')
      expect(source).toContain("const bodyContent = typeof bodySource === 'string' ? bodySource : JSON.stringify(bodySource);")
    })

    it('uses entire input when bodyField not supplied', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      expect(skill.manifest.bodyField).toBeUndefined()
      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodyContent = typeof input === "string" ? input : JSON.stringify(input);')
    })

    it('uses undefined body for GET requests', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'GET' },
        bodyField: 'body',
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodySource = input["body"] ?? input;')
      expect(source).toContain('body: undefined')
    })

    it('uses undefined body for HEAD requests', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'HEAD' },
        bodyField: 'body',
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const bodySource = input["body"] ?? input;')
      expect(source).toContain('body: undefined')
    })

    it('avoids double-stringify when bodyField value is already a string', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        bodyField: 'body',
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain("typeof bodySource === 'string'")
    })
  })

  describe('timeoutMs handling', () => {
    it('includes timeoutMs in manifest', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        timeoutMs: 5000,
      })

      expect(skill.manifest.timeoutMs).toBe(5000)
    })

    it('adds timeout code to source when timeoutMs provided', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        timeoutMs: 3000,
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const controller = new AbortController()')
      expect(source).toContain('setTimeout(() => controller.abort(), 3000)')
      expect(source).toContain('signal: controller.signal,')
      expect(source).toContain('clearTimeout(timeoutId)')
    })

    it('does not add timeout code when timeoutMs not provided', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).not.toContain('AbortController')
      expect(source).not.toContain('setTimeout')
      expect(source).not.toContain('signal: controller.signal')
      expect(source).not.toContain('clearTimeout')
    })
  })

  describe('secrets handling', () => {
    it('does not include actual secrets in source code', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'bearer',
          token: 'actual-secret-token',
          credentialEnvKeyMap: {
            token: { envVar: 'TOKEN_ENV' },
          },
        },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).not.toContain('actual-secret-token')
      expect(source).toContain('${TOKEN_ENV}')
    })

    it('does not include actual secrets in manifest', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'basic',
          username: 'actual-user',
          password: 'actual-password',
        },
      })

      expect(skill.manifest.auth).toEqual({
        type: 'basic',
        username: '${AUTH_USERNAME}',
        password: '${AUTH_PASSWORD}',
      })
      expect(JSON.stringify(skill.manifest)).not.toContain('actual-user')
      expect(JSON.stringify(skill.manifest)).not.toContain('actual-password')
    })

    it('redacts Authorization header in request logging', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'bearer',
          token: 'secret',
        },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('redactedHeaders.Authorization = "[REDACTED]"')
    })

    it('redacts api-key header in request logging', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        auth: {
          type: 'api_key',
          apiKey: 'secret',
          header: 'api-key',
        },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('redactedHeaders["api-key"] = "[REDACTED]"')
    })
  })

  describe('response parsing', () => {
    it('handles JSON responses', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('contentType.includes("application/json")')
      expect(source).toContain('responseData = await res.json()')
    })

    it('handles non-JSON responses', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('const text = await res.text()')
      expect(source).toContain('responseData = text ? { text } : null')
    })

    it('handles empty responses', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('responseData = text ? { text } : null')
    })

    it('handles malformed JSON gracefully', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('catch (parseErr)')
      expect(source).toContain('responseData = null')
    })
  })

  describe('structured output', () => {
    it('returns structured result with all required fields', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('success: false')
      expect(source).toContain('mode:')
      expect(source).toContain('system:')
      expect(source).toContain('action:')
      expect(source).toContain('request: null')
      expect(source).toContain('response: null')
      expect(source).toContain('error: null')
    })

    it('includes request details in result', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('result.request = { input: input, endpoint: resolvedEndpoint, method:')
      expect(source).toContain('headers: redactedHeaders')
    })

    it('includes response details in result on success', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('result.response = { status: res.status, data: responseData }')
    })

    it('includes error details in result on failure', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('result.error = err instanceof Error ? err.message : String(err)')
    })
  })

  describe('dry-run behavior', () => {
    it('returns early with dry-run mode when no endpoint resolved', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      expect(source).toContain('if (!resolvedEndpoint) {')
      expect(source).toContain('result.mode = "dry-run"')
      expect(source).toContain('result.success = true')
      expect(source).toContain('return result')
    })

    it('does not make fetch call in dry-run mode', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { method: 'POST' },
      })

      const source = skill.manifest.sourceCode as string
      const dryRunSection = source.split('if (!resolvedEndpoint) {')[1].split('return result;')[0]
      expect(dryRunSection).not.toContain('fetch(')
    })
  })

  describe('configSchema and custom manifest properties', () => {
    it('includes configSchema in manifest', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
        configSchema: { type: 'object', properties: { apiKey: { type: 'string' }, timeout: { type: 'number' } } },
      })

      expect(skill.manifest.configSchema).toEqual({ type: 'object', properties: { apiKey: { type: 'string' }, timeout: { type: 'number' } } })
    })

    it('includes system and action in manifest', () => {
      const skill = createExternalActionSkill({
        ...baseOptions,
        endpoint: { url: 'https://api.example.com', method: 'POST' },
      })

      expect(skill.manifest.system).toBe('test-system')
      expect(skill.manifest.action).toBe('test-action')
    })
  })
})
