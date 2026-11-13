import { ToolConfigResolver } from '../src/services/ToolConfig';
import { Tool } from '../src/types';
import { PluginGenerator } from '../src/services/PluginGenerator';
import { ToolDiscovery } from '../src/services/ToolDiscovery';
import { CodeExecutor } from '../src/executors/CodeExecutor';
import { credentialProvider } from '../src/services/CredentialProvider';

describe('mission tool configuration', () => {
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

  it('requests a mapped required configuration field rather than failing the static gate', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    const config = new ToolConfigResolver(new Map());
    await expect(config.validateConfigSchema(tool, {}, 'exec-1')).resolves.toBeNull();
    await expect(config.resolveCredentials(tool, {}, 'exec-1')).rejects.toMatchObject({
      request: { missingCredentials: [{ key: 'account_id', label: 'Account ID' }] },
    });
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

  it('resolves previously supplied values from the tool-specific vault entry', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ plaintext: 'saved-account' }),
    } as Response);
    const config = new ToolConfigResolver(new Map());
    const result = await config.resolveCredentials(tool, {}, 'exec-2');
    expect(result.resolved.account_id).toBe('saved-account');
    expect(String(fetcher.mock.calls[0][0])).toContain(encodeURIComponent('secret:account_id'));
  });

  it('resolves an explicitly named existing vault secret independently of the logical key', async () => {
    credentialProvider.invalidate();
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ plaintext: 'saved-value' }),
    } as Response);
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
