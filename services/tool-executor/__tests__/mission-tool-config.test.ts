import { ToolConfigResolver } from '../src/services/ToolConfig';
import { Tool, CredentialRequiredError } from '../src/types';
import { PluginGenerator } from '../src/services/PluginGenerator';
import { ToolDiscovery } from '../src/services/ToolDiscovery';
import { CodeExecutor } from '../src/executors/CodeExecutor';
import { credentialProvider } from '../src/services/CredentialProvider';
import { requireIsolationRuntime } from './requireIsolationRuntime';

// Vault calls authenticate with a service token minted from the auth service.
// The fetch mocks below answer the mint endpoint; these env credentials make
// the mint happen at all.
const SERVICE_AUTH_ENV: Record<string, string> = {
  TOOL_EXECUTOR_SERVICE_ID: 'tool-executor-test',
  TOOL_EXECUTOR_SERVICE_API_KEY: 'test-api-key',
};

beforeAll(() => {
  for (const [key, value] of Object.entries(SERVICE_AUTH_ENV)) process.env[key] = value;
});

afterAll(() => {
  for (const key of Object.keys(SERVICE_AUTH_ENV)) delete process.env[key];
});

/** Mock answer for the auth service's token mint endpoint. */
const mintResponse = (): Response =>
  ({ ok: true, status: 200, json: async () => ({ success: true, token: 'test-service-token' }) } as Response);


describe('mission tool configuration', () => {
  beforeAll(() => {
    // This suite validates generated tools through the real bwrap isolation
    // path; fail fast with the missing dependency named instead of opaque
    // result.success=false failures.
    requireIsolationRuntime();
  });

  const tool: Tool = {
    id: 'sms-probe',
    name: 'SMS probe',
    description: 'Send a message',
    type: 'code',
    configSchema: {
      type: 'object',
      properties: { account_id: { type: 'string', configKey: 'account', label: 'Account ID' } },
      required: ['account_id'],
    },
    manifest: {
      configSchema: {
        type: 'object',
        properties: { account_id: { type: 'string', configKey: 'account', label: 'Account ID' } },
        required: ['account_id'],
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  afterEach(() => jest.restoreAllMocks());

  it('defers a mapped required configuration field to runtime resolution rather than failing the static gate', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    const config = new ToolConfigResolver(new Map());
    // Credential-backed fields are resolved dynamically, so the static gate must
    // not reject the run merely because the mapped value is absent.
    await expect(config.validateConfigSchema(tool, {}, 'exec-1')).resolves.toBeNull();
    // But resolveCredentials will throw CredentialRequiredError for missing required credential-backed fields
    try {
      await config.resolveCredentials(tool, {}, 'exec-1');
    } catch (e) {
      expect(e).toBeInstanceOf(CredentialRequiredError);
      if (e instanceof CredentialRequiredError) {
        expect(e.request.missingCredentials).toHaveLength(1);
        expect(e.request.missingCredentials[0].key).toBe('account_id');
        expect(e.request.missingCredentials[0].label).toBe('Account ID');
      }
    }
  });

  it('uses deterministic provider configuration in initial and repair acceptance tests', async () => {
      jest.spyOn(ToolDiscovery.prototype, 'discoverAndRegister').mockResolvedValue(undefined);
      const contract = {
        description: 'Verify SMS submission',
        cases: [{
          name: 'sends SMS',
          input: { to: '5550100', body: 'test' },
          credentials: { endpoint: 'https://sms.example.test', token: 'test-token' },
          expectedOutput: { success: true },
          httpMocks: [{ method: 'POST', urlPattern: 'https://sms.example.test/messages', responseStatus: 200, responseBody: {} }],
        }],
      };
      const plugin = {
        id: 'sms-probe', name: 'SMS probe', description: 'Send SMS', type: 'code',
        language: 'python', entrypoint: 'main.py', sourceCode: 'print("{}")', requirements: [],
        configSchema: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', configKey: 'endpoint' },
            token: { type: 'string', configKey: 'token', sensitive: true },
          },
          required: ['endpoint', 'token'],
        },
        inputs: { type: 'object', properties: {} }, outputs: { type: 'object', properties: {} },
      };
      let brainCall = 0;
      jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, status: 200,
        json: async () => ({ content: JSON.stringify(brainCall++ === 0 ? contract : plugin) }),
      } as Response));
      const execute = jest.spyOn(CodeExecutor.prototype, 'execute')
        .mockResolvedValueOnce({ success: false, error: 'repair required' })
        .mockResolvedValueOnce({ success: true, output: '{"success":true}' });
      try {
        const result = await new PluginGenerator().generate({ description: 'Send SMS', requirements: [] });
        expect(result.success).toBe(true);
        expect(execute).toHaveBeenCalledTimes(2);
        for (const [options, credentials] of execute.mock.calls) {
          expect(options.testCredentials).toEqual({ endpoint: 'https://sms.example.test', token: 'test-token' });
          expect(credentials).toEqual(options.testCredentials);
        }
      } finally {
        jest.restoreAllMocks();
      }
  });

  it('repairs a schema-invalid acceptance contract before generating the plugin', async () => {
    jest.spyOn(ToolDiscovery.prototype, 'discoverAndRegister').mockResolvedValue(undefined);
    const validContract = {
      description: 'Verify SMS submission',
      cases: [{
        name: 'sends SMS',
        input: {},
        expectedOutput: { success: true },
        httpMocks: [{ method: 'POST', urlPattern: 'https://api.example.test/messages', responseStatus: 200, responseBody: {} }],
      }],
    };
    const invalidContract = structuredClone(validContract);
    (invalidContract.cases[0].httpMocks[0] as { responseBody: unknown }).responseBody = 'invalid';
    const plugin = {
      id: 'sms-probe', name: 'SMS probe', description: 'Send SMS', type: 'code',
      language: 'python', entrypoint: 'main.py', sourceCode: 'print("{}")', requirements: [],
      configSchema: { type: 'object', properties: {} },
      inputs: { type: 'object', properties: {} }, outputs: { type: 'object', properties: {} },
    };
    const prompts: string[] = [];
    let brainCall = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { prompt: string };
      prompts.push(body.prompt);
      return {
        ok: true, status: 200,
        json: async () => ({ content: JSON.stringify([invalidContract, validContract, plugin][brainCall++]) }),
      } as Response;
    });

    jest.spyOn(CodeExecutor.prototype, 'execute').mockResolvedValue({ success: true, output: '{"success":true}' });

    const result = await new PluginGenerator().generate({
      description: 'Send SMS', requirements: [],
      context: { missionGoal: 'Send a text message', taskObjective: 'Send the requested text' },
    });
    expect(result.success).toBe(true);
    expect(prompts[0]).toContain('Original mission goal (authoritative scope): Send a text message');
    expect(prompts[1]).toContain('test case 1.HTTP fixture 1.responseBody must be a JSON object');
    expect(prompts[1]).not.toContain(JSON.stringify(invalidContract));
  });

  it('stops without generating a tool when no relevant deterministic tests can be supplied', async () => {
    jest.spyOn(ToolDiscovery.prototype, 'discoverAndRegister').mockResolvedValue(undefined);
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ content: JSON.stringify({ description: 'No suitable tests', cases: [] }) }),
    } as Response);
    const result = await new PluginGenerator().generate({ description: 'Send a message', requirements: [] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('no deterministic test cases');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('validates a generated SMS tool with dummy credentials and an isolated provider fixture', async () => {
      jest.spyOn(ToolDiscovery.prototype, 'discoverAndRegister').mockResolvedValue(undefined);
      const contract = {
        description: 'Verify SMS submission',
        cases: [{
          name: 'sends SMS',
          input: { to: '+15555550100', body: 'Hello' },
          credentials: { account_id: 'ACtest', auth_token: 'dummy-token' },
          expectedOutput: { success: true, messageId: 'message-test' },
          httpMocks: [{
            method: 'POST', urlPattern: 'https://api.twilio.com/2010-04-01/Accounts/*/Messages.json',
            expectedRequestBody: 'To=%2B15555550100&Body=Hello',
            responseStatus: 201, responseBody: { sid: 'message-test' },
          }],
        }],
      };
      const plugin = {
        id: 'sms-probe', name: 'SMS probe', description: 'Send SMS', type: 'code',
        language: 'python', entrypoint: 'main.py', requirements: [],
        sourceCode: `import json
import urllib.request
import urllib.parse
account = __get_credential('account_id')
token = __get_credential('auth_token')
if not account or not token:
      raise ValueError('missing credentials')
data = urllib.parse.urlencode({'To': __tool_input['to'], 'Body': __tool_input['body']}).encode()
request = urllib.request.Request('https://api.twilio.com/2010-04-01/Accounts/' + account + '/Messages.json', data=data, method='POST')
with urllib.request.urlopen(request) as response:
      result = json.loads(response.read().decode())
print(json.dumps({'success': True, 'messageId': result['sid']}))`,
        configSchema: {
          type: 'object',
          properties: {
            account_id: { type: 'string', vaultSecretId: 'account-id' },
            auth_token: { type: 'string', vaultSecretId: 'auth-token', sensitive: true },
          },
          required: ['account_id', 'auth_token'],
        },
        inputs: { type: 'object', properties: {} }, outputs: { type: 'object', properties: {} },
      };
      let brainCall = 0;
      jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, status: 200,
        json: async () => ({ content: JSON.stringify(brainCall++ === 0 ? contract : plugin) }),
      } as Response));

      const result = await new PluginGenerator().generate({ description: 'Send SMS', requirements: [] });
      expect(result.success).toBe(true);
      expect(result.tool?.manifest?.validation).toMatchObject({ passed: true, testCount: 1 });
  });

  it('resolves previously supplied values from the tool-specific vault entry', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/')) return mintResponse();
      return {
        ok: true,
        json: async () => ({ plaintext: 'saved-account' }),
      } as Response;
    });
    const config = new ToolConfigResolver(new Map());
    const result = await config.resolveCredentials(tool, {}, 'exec-2');
    expect(result.resolved.account_id).toBe('saved-account');
    // A by-name recovery lookup may precede the declared lookup; what matters is
    // that the tool-specific `secret:` entry is tried.
    expect(fetcher.mock.calls.map((call) => String(call[0])))
      .toContainEqual(expect.stringContaining(encodeURIComponent('secret:account_id')));
  });

  it('resolves an explicitly named existing vault secret independently of the logical key', async () => {
    credentialProvider.invalidate();
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/')) return mintResponse();
      return {
        ok: true, json: async () => ({ plaintext: 'saved-value' }),
      } as Response;
    });
    const configSchema = {
      type: 'object',
      properties: { account_id: { type: 'string', vaultSecretId: 'secret:provider_account' } },
      required: ['account_id'],
    };
    const mappedTool: Tool = { ...tool, configSchema, manifest: { configSchema } };
    try {
      const result = await new ToolConfigResolver(new Map()).resolveCredentials(mappedTool, {}, 'exec-mapped');
      expect(result.resolved.account_id).toBe('saved-value');
      expect(String(fetcher.mock.calls[0][0])).toContain(encodeURIComponent('secret:provider_account'));
    } finally {
      credentialProvider.invalidate();
    }
  });
});

describe('vault credential resolution by secret name', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    credentialProvider.invalidate();
  });

  const twilioTool: Tool = {
    id: 'sms-twilio',
    name: 'Send SMS via Twilio',
    description: 'Send an SMS text message using the Twilio REST API',
    type: 'code',
    configSchema: {
      type: 'object',
      properties: {
        accountSid: { type: 'string', description: 'Twilio Account SID', vaultSecretId: 'twilio-account-sid' },
        authToken: { type: 'string', description: 'Twilio Auth Token', vaultSecretId: 'twilio-auth-token', sensitive: true },
      },
      required: ['accountSid', 'authToken'],
    },
    manifest: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const secretValues: Record<string, string> = {
    'secret:twilio_acct_sid': 'AC-real-sid',
    'secret:twilio_auth_token': 'real-auth-token',
    'secret:endpoint': 'https://example.invalid',
  };

  // Vault mimic: invented ids 404, real names decrypt, and only GET /api/vault/secrets lists names.
  const mockVault = () => jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/api/auth/')) return mintResponse();
    if (url.endsWith('/api/vault/secrets')) {
      return {
        ok: true,
        json: async () => ({ secrets: Object.keys(secretValues).map((name) => ({ name })) }),
      } as Response;
    }
    const decrypt = url.match(/\/api\/vault\/secrets\/name\/([^/]+)\/decrypt/)
    if (decrypt) {
      const name = decodeURIComponent(decrypt[1])
      const value = secretValues[name]
      return value === undefined
        ? { ok: false, status: 404, json: async () => ({}) } as Response
        : { ok: true, json: async () => ({ plaintext: value }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });

  it('uses configured vault secrets when a generated tool invents non-existent vaultSecretIds', async () => {
    mockVault();
    const resolver = new ToolConfigResolver(new Map());
    const { resolved } = await resolver.resolveCredentials(twilioTool, {}, 'exec-sms');
    expect(resolved.accountSid).toBe('AC-real-sid');
    expect(resolved.authToken).toBe('real-auth-token');
  });

  it('does not bind an unrelated secret to a credential', async () => {
    mockVault();
    const resolver = new ToolConfigResolver(new Map());
    const tool: Tool = {
      ...twilioTool,
      configSchema: {
        type: 'object',
        properties: { apiKey: { type: 'string', description: 'Weather service API key', vaultSecretId: 'made-up-key' } },
        required: ['apiKey'],
      },
    };
    await expect(resolver.resolveCredentials(tool, {}, 'exec-1')).rejects.toBeInstanceOf(CredentialRequiredError);
  });
});
