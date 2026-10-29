import request from 'supertest'
import express, { Application } from 'express'
import { ToolRegistry } from '../src/services/ToolRegistry'
import { ToolExecutor } from '../src/services/ToolExecutor'
import { PluginGenerator } from '../src/services/PluginGenerator'
import { CodeExecutor } from '../src/executors/CodeExecutor'
import { Tool, PluginGenerationRequest, CredentialRequiredError, ConfirmationRequiredError } from '../src/types'
import toolsRouter from '../src/routes/tools'
import { ToolNotFoundError, ValidationError } from '../src/utils/errors'
import { eventSkills } from '../src/assistants/event/index'
import { pluginGenerator as routePluginGenerator } from '../src/utils/sharedInstance'
import { mcpToolExecutive } from '../src/services/MCPToolExecutive'

const app: Application = express()
app.use(express.json())
app.use('/api', toolsRouter)

// Error handling middleware (same as index.ts)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ToolNotFoundError) {
    return res.status(404).json({ success: false, error: err.message, statusCode: 404 });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ success: false, error: err.message, statusCode: 400 });
  }
  res.status(500).json({ success: false, error: err?.message || 'Internal server error', statusCode: 500 });
});

const registry = new ToolRegistry()
const executor = new ToolExecutor()
const generator = new PluginGenerator()
let generatedSourceCode = `import json
print(json.dumps({ "sum": __tool_input["left"] + __tool_input["right"] }))`
let repairedSourceCode = generatedSourceCode
const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/brain/complete')) {
      const body = JSON.parse(init.body);
      if (typeof body.systemPrompt === 'string' && body.systemPrompt.includes('You independently derive')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: JSON.stringify({
              description: 'Verify the calculator adds two integers.',
              cases: [{
                name: 'adds two integers',
                input: { left: 19, right: 23 },
                expectedOutput: { sum: 42 },
              }],
            }),
            requestId: 'brain-test-contract',
          }),
          text: async () => '',
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            id: `plugin_${Date.now()}`,
            name: 'calculator',
            description: body.prompt,
            type: 'code',
            language: 'python',
            entrypoint: 'main.py',
            sourceCode: body.prompt.includes('The previous generated code was rejected')
              ? repairedSourceCode
              : generatedSourceCode,
            requirements: [],
            configSchema: {},
            inputs: {},
            outputs: {},
          }),
          model: 'brain-selected-model',
          provider: 'openrouter',
          tokensUsed: 100,
        }),
        text: async () => '',
      } as any;
    }
    if (urlStr.includes('/api/brain/complaint')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ recorded: true }),
        text: async () => '',
      } as any;
    }
    return originalFetch(url, init);
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('ToolRegistry', () => {
  const mockTool: Tool = {
    id: 'tool-1',
    name: 'Test Tool',
    description: 'A test tool',
    type: 'mcp',
    manifest: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    registry.register(mockTool)
  })

  afterEach(() => {
    registry.unregister(mockTool.id)
  })

  it('should register a tool', () => {
    const tool = registry.get('tool-1')
    expect(tool).toBeDefined()
    expect(tool?.name).toBe('Test Tool')
  })

  it('should list all tools', () => {
    const tools = registry.list()
    expect(tools.length).toBeGreaterThanOrEqual(1)
  })

  it('should find tools by type', () => {
    const mcpTools = registry.findByType('mcp')
    expect(mcpTools.length).toBeGreaterThanOrEqual(1)
  })

  it('should unregister a tool', () => {
    const result = registry.unregister('tool-1')
    expect(result).toBe(true)
    expect(registry.get('tool-1')).toBeUndefined()
  })
})

describe('ToolExecutor', () => {
  const codeTool: Tool = {
    id: 'tool-code-1',
    name: 'Code Runner',
    description: 'Run code',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: 'console.log("hello");',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('should execute a code tool successfully', async () => {
    const execution = await executor.execute(codeTool, {})
    expect(execution.status).toBe('completed')
    expect(execution.output).toBeDefined()
    expect(execution.toolId).toBe(codeTool.id)
  })

  it('should attempt discovery and generation for unsupported tool type', async () => {
    const unsupportedTool: Tool = {
      id: 'tool-unknown',
      name: 'Unknown Tool',
      description: 'Unknown',
      type: 'mcp',
      manifest: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const execution = await executor.execute(unsupportedTool, {})
    expect(execution.status).toBe('completed')
    expect(execution.output).toBeDefined()
    expect(execution.toolId).toBe('tool-unknown')
  })

  it('should resolve credentials using logical keys from credentialSource', async () => {
    const credentialTool: Tool = {
      id: 'tool-cred-1',
      name: 'Credential Tool',
      description: 'Tool with credentialSource',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("test");',
        credentialSource: {
          apiToken: { envVar: 'TEST_API_TOKEN' },
          apiKey: { envVar: 'TEST_API_KEY' },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Set env vars for test
    process.env.TEST_API_TOKEN = 'test-token-value';
    process.env.TEST_API_KEY = 'test-key-value';

    try {
      const execution = await executor.execute(credentialTool, {})
      expect(execution.status).toBe('completed')
    } finally {
      delete process.env.TEST_API_TOKEN;
      delete process.env.TEST_API_KEY;
    }
  })

  it('should use provided credential overrides over env vars', async () => {
    const credentialTool: Tool = {
      id: 'tool-cred-2',
      name: 'Credential Tool 2',
      description: 'Tool with credentialSource',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("test");',
        credentialSource: {
          apiToken: { envVar: 'OVERRIDE_TEST_TOKEN' },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    process.env.OVERRIDE_TEST_TOKEN = 'env-value';

    try {
      const execution = await executor.executeOrRequestCredentials(credentialTool, {}, { apiToken: 'override-value' })
      expect('status' in execution && execution.status).toBe('completed')
    } finally {
      delete process.env.OVERRIDE_TEST_TOKEN;
    }
  })

  it('should enforce confirmBeforeSend — fails without dryRun or confirmation', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-1',
      name: 'Delete Resource',
      description: 'Delete a resource',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
      },
      confirmBeforeSend: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(executor.execute(confirmingTool, { action: 'delete' }))
      .rejects.toThrow(/requires explicit confirmation/);
  });

  it('should allow confirmBeforeSend when dryRun is explicit', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-2',
      name: 'Delete Resource Dry',
      description: 'Delete a resource with dryRun',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
      },
      confirmBeforeSend: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(confirmingTool, { action: 'delete', dryRun: true });
    expect(execution.status).toBe('completed');
  });

  it('should allow confirmBeforeSend when confirmation is explicit', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-3',
      name: 'Delete Resource Confirm',
      description: 'Delete a resource with confirmation',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
      },
      confirmBeforeSend: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(confirmingTool, { action: 'delete', confirmation: true });
    expect(execution.status).toBe('completed');
  });

  it('should not require confirmation for tools without confirmBeforeSend', async () => {
    const normalTool: Tool = {
      id: 'tool-no-confirm',
      name: 'Normal Tool',
      description: 'A normal tool',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("ok");',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(normalTool, { action: 'delete' });
    expect(execution.status).toBe('completed');
  });

  it('should enforce confirmBeforeSend from manifest metadata', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-manifest',
      name: 'Delete Resource Manifest',
      description: 'Delete a resource via manifest',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
        confirmBeforeSend: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(executor.execute(confirmingTool, { action: 'delete' }))
      .rejects.toThrow(/requires explicit confirmation/);
  });

  it('should prefer tool-level confirmBeforeSend over manifest', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-pref',
      name: 'Delete Resource Pref',
      description: 'Delete a resource',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
        confirmBeforeSend: false,
      },
      confirmBeforeSend: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(executor.execute(confirmingTool, { action: 'delete' }))
      .rejects.toThrow(/requires explicit confirmation/);
  });

  it('should enforce confirmBeforeSend from manifest when tool-level is absent', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-manifest-only',
      name: 'Delete Resource Manifest Only',
      description: 'Delete a resource',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
        confirmBeforeSend: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(executor.execute(confirmingTool, { action: 'delete' }))
      .rejects.toThrow(/requires explicit confirmation/);
  });

  // Regression guard for the DUAL-READ contract.
  // createCodeSkill only propagates options.confirmBeforeSend to the top-level
  // Tool.confirmBeforeSend (src/data/skills/code-skill-factory.ts:66), while
  // enforceConfirmation reads BOTH the top-level flag and manifest.confirmBeforeSend
  // (src/services/ToolExecutor.ts:514-519). Several skills therefore set it in both
  // places. The manifest-only form DOES satisfy the gate; this test pins that so the
  // "manifest.confirmBeforeSend is ignored" claim cannot resurface as a code change.
  it('dual-read contract: confirmBeforeSend is honoured from top-level OR manifest', async () => {
    const baseTool = (id: string): Tool => ({
      id,
      name: 'Delete Resource Dual Read',
      description: 'Delete a resource',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("delete");',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 1. Top-level confirmBeforeSend: true -> gate fires.
    const topLevelOnly = baseTool('tool-dual-top-level');
    topLevelOnly.confirmBeforeSend = true;
    await expect(executor.execute(topLevelOnly, { action: 'delete' }))
      .rejects.toThrow(/requires explicit confirmation/);

    // 2. manifest.confirmBeforeSend: true ONLY (top-level absent) -> gate ALSO fires.
    //    This is the contested case; do not "fix" it by dropping the manifest read.
    const manifestOnly = baseTool('tool-dual-manifest-only');
    manifestOnly.manifest.confirmBeforeSend = true;
    await expect(executor.execute(manifestOnly, { action: 'delete' }))
      .rejects.toThrow(/requires explicit confirmation/);
    expect(executor.previewAction(manifestOnly, { action: 'delete' }).requiresConfirmation).toBe(true);

    // 3. Neither set -> gate does not fire and execution proceeds.
    const neither = baseTool('tool-dual-neither');
    const execution = await executor.execute(neither, { action: 'delete' });
    expect(execution.status).toBe('completed');
  });

  it('should return not-connected result for external action skill with missing required config', async () => {
    const externalTool: Tool = {
      id: 'tool-external-1',
      name: 'External API Tool',
      description: 'Calls external API',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("test");',
        system: 'test-system',
        action: 'test-action',
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            baseUrl: { type: 'string' },
          },
          required: ['apiKey', 'baseUrl'],
        },
      },
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
          baseUrl: { type: 'string' },
        },
        required: ['apiKey', 'baseUrl'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(externalTool, { action: 'test' });
    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('Not connected');
    expect(execution.error).toContain('required config fields missing');
    expect(execution.error).toContain('apiKey');
    expect(execution.error).toContain('baseUrl');
  });

  it('should return failed result for non-external tool with missing required config', async () => {
    const codeTool: Tool = {
      id: 'tool-config-1',
      name: 'Config Tool',
      description: 'Tool with config',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("test");',
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
          },
          required: ['apiKey'],
        },
      },
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
        },
        required: ['apiKey'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(codeTool, { action: 'test' });
    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('Missing required config');
    expect(execution.error).toContain('apiKey');
  });

  it('should execute successfully when required config and endpoint are provided', async () => {
    const externalTool: Tool = {
      id: 'tool-external-2',
      name: 'External API Tool 2',
      description: 'Calls external API',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("test");',
        system: 'test-system',
        action: 'test-action',
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
          },
          required: ['apiKey'],
        },
      },
      configSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
        },
        required: ['apiKey'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(externalTool, {
      apiKey: 'my-key',
      baseUrl: 'https://api.example.com',
      action: 'test',
    });
    expect(execution.status).toBe('completed');
  });

  it('should route reasoning tools through ReasoningExecutor', async () => {
    const reasoningTool: Tool = {
      id: 'tool-reasoning-1',
      name: 'Analyze Pattern',
      description: 'Analyze a pattern',
      type: 'reasoning',
      manifest: {},
      reasoningConfig: {
        systemPrompt: 'You are a reasoning tool.',
        optimizeFor: 'accuracy',
        outputFormat: 'json',
      },
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(reasoningTool, {
      query: 'test pattern',
      routingSessionId: 'assessment-review-1',
    });
    expect(execution.status).toBe('completed');
    expect(execution.toolId).toBe(reasoningTool.id);
    const fetchMock = global.fetch as jest.Mock;
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body)) as {
      prompt: string;
      options: { optimizeFor?: string; routingSessionId?: string };
    };
    expect(body.options).toMatchObject({
      optimizeFor: 'accuracy',
      routingSessionId: 'assessment-review-1',
    });
    expect(body.prompt).not.toContain('assessment-review-1');
  });

  it('should throw ConfirmationRequiredError directly for re-thrown confirmations', async () => {
    const confirmingTool: Tool = {
      id: 'tool-confirm-throw',
      name: 'Confirm Tool',
      description: 'Tool requiring confirmation',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log("ok");',
      },
      confirmBeforeSend: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(executor.executeOrRequestCredentials(confirmingTool, { action: 'delete' }))
      .rejects.toThrow(ConfirmationRequiredError);
  });

  describe('Approval Summary Generation', () => {
    it('should generate an approval summary for a tool with confirmBeforeSend=true', () => {
      const confirmingTool: Tool = {
        id: 'tool-approval-1',
        name: 'Delete Patient Record',
        description: 'Delete a patient record',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("delete");',
          action: 'delete',
        },
        confirmBeforeSend: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const summary = executor.generateApprovalSummary(confirmingTool, { patient: 'P12345', reason: 'cleanup' });

      expect(summary.toolName).toBe('Delete Patient Record');
      expect(summary.toolId).toBe('tool-approval-1');
      expect(summary.action).toBe('delete');
      expect(summary.object).toBe('P12345');
      expect(summary.scope).toEqual({ patient: 'P12345', reason: 'cleanup' });
      expect(summary.confirmBeforeSend).toBe(true);
      expect(summary.requiresConfirmation).toBe(true);
      expect(summary.dryRun).toBe(false);
    });

    it('should extract the first available object key from known list', () => {
      const tool: Tool = {
        id: 'tool-approval-2',
        name: 'Create Campaign',
        description: 'Create a campaign',
        type: 'code',
        manifest: { system: 'marketing', action: 'create' },
        confirmBeforeSend: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const summary = executor.generateApprovalSummary(tool, { campaign: 'C999', lead: 'L1' });

      expect(summary.object).toBe('C999');
      expect(summary.action).toBe('create');
    });

    it('should correctly identify dryRun state from input', () => {
      const tool: Tool = {
        id: 'tool-approval-3',
        name: 'Send Email',
        description: 'Send an email',
        type: 'code',
        manifest: { action: 'send' },
        confirmBeforeSend: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const summary = executor.generateApprovalSummary(tool, { to: 'a@b.com', dryRun: true });

      expect(summary.dryRun).toBe(true);
      expect(summary.requiresConfirmation).toBe(true);
      expect(summary.scope).toEqual({ to: 'a@b.com' });
    });

    it('should include summary in ConfirmationRequiredError when thrown', async () => {
      const confirmingTool: Tool = {
        id: 'tool-approval-4',
        name: 'Delete Ticket',
        description: 'Delete a ticket',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("delete");',
        },
        confirmBeforeSend: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      try {
        await executor.execute(confirmingTool, { ticket: 'T-1' });
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfirmationRequiredError);
        const confirmationError = err as ConfirmationRequiredError;
        expect(confirmationError.summary).toBeDefined();
        expect(confirmationError.summary?.toolName).toBe('Delete Ticket');
        expect(confirmationError.summary?.object).toBe('T-1');
        expect(confirmationError.summary?.requiresConfirmation).toBe(true);
      }
    });
  });
})

describe('PluginGenerator', () => {
  const request: PluginGenerationRequest = {
    description: 'Generate a calculator plugin',
    requirements: ['addition', 'subtraction'],
    context: { environment: 'test' },
  }

  it('should generate a plugin successfully', async () => {
    const result = await generator.generate(request)
    expect(result.success).toBe(true)
    expect(result.tool).toBeDefined()
    expect(result.tool?.type).toBe('code')
    expect(result.tool?.description).toContain('Generate a calculator plugin')
    const manifest = result.tool?.manifest
    const sourceCode = manifest && typeof manifest === 'object' && 'sourceCode' in manifest
      ? manifest.sourceCode
      : undefined
    expect(typeof sourceCode).toBe('string')
    if (typeof sourceCode !== 'string') throw new Error('Generated plugin source was missing')
    expect(manifest).toMatchObject({
      validation: { method: 'isolated-contract-tests', passed: true, testCount: 1 },
      testContract: { cases: [{ name: 'adds two integers', expectedOutput: { sum: 42 } }] },
    })
    const execution = await new CodeExecutor().execute({
      language: 'python',
      code: sourceCode,
      input: { left: 19, right: 23 },
    })
    expect(execution.success).toBe(true)
    expect(JSON.parse(execution.output || 'null')).toEqual({ sum: 42 })
  })

  it('runs isolated JavaScript and Python with no network or inherited secrets', async () => {
    const previousSecret = process.env.STAGE7_PLUGIN_TEST_SECRET
    process.env.STAGE7_PLUGIN_TEST_SECRET = 'must-not-leak'
    try {
      const js = await new CodeExecutor().execute({
        language: 'javascript',
        isolated: true,
        timeoutMs: 5_000,
        code: `fetch('http://1.1.1.1:80', { signal: AbortSignal.timeout(1000) })
  .then(() => console.log(JSON.stringify({ blocked: false, secret: process.env.STAGE7_PLUGIN_TEST_SECRET || null })))
  .catch(() => console.log(JSON.stringify({ blocked: true, secret: process.env.STAGE7_PLUGIN_TEST_SECRET || null })));`,
      })
      expect(js.success).toBe(true)
      expect(JSON.parse(js.output || 'null')).toEqual({ blocked: true, secret: null })

      const python = await new CodeExecutor().execute({
        language: 'python',
        isolated: true,
        timeoutMs: 5_000,
        code: `import json, os, urllib.request
try:
    urllib.request.urlopen('http://1.1.1.1:80', timeout=1)
    blocked = False
except Exception:
    blocked = True
print(json.dumps({"blocked": blocked, "secret": os.environ.get("STAGE7_PLUGIN_TEST_SECRET")}))`,
      })
      expect(python.success).toBe(true)
      expect(JSON.parse(python.output || 'null')).toEqual({ blocked: true, secret: null })
    } finally {
      if (previousSecret === undefined) delete process.env.STAGE7_PLUGIN_TEST_SECRET
      else process.env.STAGE7_PLUGIN_TEST_SECRET = previousSecret
    }
  })

  it('satisfies HTTP integration cases through local fixtures in both languages', async () => {
    const httpMocks = [{
      method: 'POST' as const,
      urlPattern: 'https://api.example.test/messages/*',
      expectedRequestBody: 'to=%2B15551212&body=hello',
      responseStatus: 201,
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: { id: 'message-123', status: 'queued' },
    }]
    const javascript = await new CodeExecutor().execute({
      language: 'javascript',
      isolated: true,
      httpMocks,
      timeoutMs: 5_000,
      code: `fetch('https://api.example.test/messages/send', {
  method: 'POST',
  body: 'to=%2B15551212&body=hello'
}).then(async (response) => {
  const result = await response.json();
  console.log(JSON.stringify({ id: result.id, status: result.status }));
});`,
    })
    expect(javascript.success).toBe(true)
    expect(JSON.parse(javascript.output || 'null')).toEqual({ id: 'message-123', status: 'queued' })

    const python = await new CodeExecutor().execute({
      language: 'python',
      isolated: true,
      httpMocks,
      timeoutMs: 5_000,
      code: `import json
import urllib.request
request = urllib.request.Request(
    'https://api.example.test/messages/send',
    data=b'to=%2B15551212&body=hello',
    method='POST',
)
with urllib.request.urlopen(request) as response:
    result = json.loads(response.read().decode())
print(json.dumps({"id": result["id"], "status": result["status"]}))`,
    })
    expect(python.success).toBe(true)
    expect(JSON.parse(python.output || 'null')).toEqual({ id: 'message-123', status: 'queued' })
  })

  it('repairs generated code that does not satisfy its independent contract', async () => {
    const originalSourceCode = generatedSourceCode
    const originalRepairedSourceCode = repairedSourceCode
    generatedSourceCode = 'print(json.dumps({ sum: 0 }))'
    repairedSourceCode = originalSourceCode
    try {
      const result = await generator.generate(request)
      expect(result.success).toBe(true)
      expect(result.tool?.manifest.validation).toMatchObject({
        method: 'isolated-contract-tests',
        passed: true,
        testCount: 1,
      })
    } finally {
      generatedSourceCode = originalSourceCode
      repairedSourceCode = originalRepairedSourceCode
    }
  })

  it('reports schema-invalid Brain output as a quality complaint', async () => {
    const previousFetch = global.fetch;
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const mockResponse = (body: Record<string, unknown>): Response => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response);
    global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const urlString = String(url);
      const body = typeof init?.body === 'string'
        ? JSON.parse(init.body) as Record<string, unknown>
        : undefined;
      requests.push({ url: urlString, body });

      if (urlString.endsWith('/api/brain/complete')) {
        const promptBody = body;
        if (promptBody?.systemPrompt && String(promptBody.systemPrompt).includes('You independently derive')) {
          return mockResponse({
            requestId: 'brain_valid_test_contract',
            content: JSON.stringify({
              description: 'Verify integer addition.',
              cases: [{ name: 'adds integers', input: { left: 1, right: 2 }, expectedOutput: { sum: 3 } }],
            }),
          });
        }
        return mockResponse({
          requestId: 'brain_invalid_plugin_response',
          content: JSON.stringify({
            id: 'invalid-plugin',
            name: 'Invalid plugin',
            description: 'Missing config schema',
            type: 'code',
            language: 'javascript',
            entrypoint: 'index.js',
            sourceCode: 'console.log(JSON.stringify({ ok: true }));',
            requirements: [],
            inputs: {},
            outputs: {},
          }),
        });
      }
      if (urlString.endsWith('/api/brain/complaint')) {
        return mockResponse({ recorded: true });
      }
      return mockResponse({ objects: [], projects: [], items: [] });
    }) as typeof fetch;

    try {
      const result = await generator.generate({
        ...request,
        context: { ...request.context, missionId: 'mission-plugin-validation' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('configSchema');
      const completionRequests = requests.filter(({ url }) => url.endsWith('/api/brain/complete'));
      expect(completionRequests).toHaveLength(3);
      expect(completionRequests[0]?.body?.systemPrompt)
        .toContain('independently derive a deterministic acceptance contract');
      expect(completionRequests[2]?.body?.prompt)
        .toContain('previous generated code was rejected');
      expect(completionRequests[2]?.body?.prompt)
        .toContain('configSchema Required');
      expect(completionRequests[1]?.body?.systemPrompt)
        .toContain('senior engineer generating production-ready plugins');
      expect(requests.find(({ url }) => url.endsWith('/api/brain/complete'))?.body?.missionId)
        .toBe('mission-plugin-validation');
      expect(requests.find(({ url }) => url.endsWith('/api/brain/complaint'))?.body).toEqual({
        requestId: 'brain_invalid_plugin_response',
        reason: expect.stringContaining('configSchema'),
        missionId: 'mission-plugin-validation',
      });
    } finally {
      global.fetch = previousFetch;
    }
  })

  it('rejects plugin IDs and entrypoints that could escape the deployment directory', async () => {
    const base: Tool = {
      id: '../outside',
      name: 'Unsafe plugin',
      description: 'Invalid generated plugin',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'module.exports = {};',
        requirements: [],
        configSchema: {},
        inputs: {},
        outputs: {},
        testContract: {
          description: 'Verify generated output.',
          cases: [{ name: 'produces JSON', input: {}, expectedOutput: { ok: true } }],
        },
        validation: {
          method: 'isolated-contract-tests',
          passed: true,
          testCount: 1,
          testNames: ['produces JSON'],
          passedAt: new Date().toISOString(),
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const unsafeId = await generator.deploy(base)
    expect(unsafeId.success).toBe(false)
    expect(unsafeId.error).toContain('safe plugin identifier')

    const unsafeEntrypoint = await generator.deploy({
      ...base,
      id: 'safe-plugin',
      manifest: { ...base.manifest, entrypoint: '../outside.js' },
    })
    expect(unsafeEntrypoint.success).toBe(false)
    expect(unsafeEntrypoint.error).toContain('entrypoint')

    const invalidSyntax = await generator.deploy({
      ...base,
      id: 'syntax-invalid-plugin',
      manifest: { ...base.manifest, sourceCode: 'const = ;' },
    })
    expect(invalidSyntax.success).toBe(false)
    expect(invalidSyntax.error).toContain('javascript syntax validation')
  })

  it('refuses to deploy generated plugins without passing isolated contract evidence', async () => {
    const result = await generator.deploy({
      id: 'untested-plugin',
      name: 'Untested Plugin',
      description: 'A generated plugin without validation evidence',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'console.log(JSON.stringify({ ok: true }));',
        requirements: [],
        configSchema: {},
        inputs: {},
        outputs: {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('must pass isolated contract tests')
  })
})

describe('REST endpoints', () => {
  const validTool = {
    id: 'rest-tool-1',
    name: 'REST Tool',
    description: 'Tool via REST',
    type: 'openapi',
    manifest: { endpoint: '/test' },
  }

  it('should register a tool via POST /api/tools', async () => {
    const res = await request(app)
      .post('/api/tools')
      .send(validTool)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('REST Tool')
  })

  it('should list tools via GET /api/tools', async () => {
    const res = await request(app).get('/api/tools')
    expect(res.status).toBe(200)
    expect(res.body.tools).toBeDefined()
    expect(Array.isArray(res.body.tools)).toBe(true)
  })

  it('should get a tool by id via GET /api/tools/:id', async () => {
    await request(app).post('/api/tools').send(validTool)
    const res = await request(app).get(`/api/tools/${validTool.id}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(validTool.id)
  })

  it('should execute a tool via POST /api/tools/:id/execute', async () => {
    await request(app).post('/api/tools').send(validTool)
    const res = await request(app)
      .post(`/api/tools/${validTool.id}/execute`)
      .send({ input: { test: true } })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
  })

  it('should generate a plugin via POST /api/plugins/generate', async () => {
    const res = await request(app)
      .post('/api/plugins/generate')
      .send({ description: 'New plugin' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('resolves an already-registered capability without generating a duplicate tool', async () => {
    const existingTool: Tool = {
      id: 'existing-capability-tool',
      name: 'Existing Capability Tool',
      description: 'Already satisfies the requested capability',
      type: 'code',
      manifest: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const resolve = jest.spyOn(mcpToolExecutive, 'resolveCapability')
      .mockReturnValue({ satisfied: true, tool: existingTool })
    const discover = jest.spyOn(mcpToolExecutive, 'discoverAndRequestPermission')
    const generate = jest.spyOn(routePluginGenerator, 'generate')
    try {
      const res = await request(app)
        .post('/api/tools/resolve')
        .send({ description: 'Need a capability' })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, source: 'registered', tool: { id: existingTool.id } })
      expect(discover).not.toHaveBeenCalled()
      expect(generate).not.toHaveBeenCalled()
    } finally {
      resolve.mockRestore()
      discover.mockRestore()
      generate.mockRestore()
    }
  })

  it('falls back to generating a reusable tool when no registered or MCP tool resolves the capability', async () => {
    const generatedTool: Tool = {
      id: 'generated-capability-tool',
      name: 'Generated Capability Tool',
      description: 'Satisfies the requested capability',
      type: 'code',
      manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: 'console.log("{}")' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const resolve = jest.spyOn(mcpToolExecutive, 'resolveCapability')
      .mockReturnValue({ satisfied: false, error: 'No registered tool matches' })
    const discover = jest.spyOn(mcpToolExecutive, 'discoverAndRequestPermission')
      .mockResolvedValue({ satisfied: false, error: 'No suitable MCP tool found' })
    const generate = jest.spyOn(routePluginGenerator, 'generate')
      .mockResolvedValue({ success: true, tool: generatedTool })
    const deploy = jest.spyOn(routePluginGenerator, 'deploy')
      .mockResolvedValue({ success: true, deployPath: '/tmp/generated-capability-tool' })
    try {
      const res = await request(app)
        .post('/api/tools/resolve')
        .send({ description: 'Need a capability' })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ success: true, source: 'generated', tool: { id: generatedTool.id } })
      expect(discover).toHaveBeenCalled()
      expect(generate).toHaveBeenCalled()
      expect(deploy).toHaveBeenCalledWith(generatedTool)
    } finally {
      resolve.mockRestore()
      discover.mockRestore()
      generate.mockRestore()
      deploy.mockRestore()
    }
  })

  it('reports a failed plugin deployment instead of returning a success response', async () => {
    const generatedTool: Tool = {
      id: 'deployment-failure-test',
      name: 'Generated Tool',
      description: 'A generated tool',
      type: 'code',
      manifest: {
        language: 'javascript',
        entrypoint: 'index.js',
        sourceCode: 'module.exports = {};',
        requirements: [],
        configSchema: {},
        inputs: {},
        outputs: {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const generate = jest.spyOn(routePluginGenerator, 'generate')
      .mockResolvedValue({ success: true, tool: generatedTool })
    const deploy = jest.spyOn(routePluginGenerator, 'deploy')
      .mockResolvedValue({ success: false, error: 'deployment storage unavailable' })
    try {
      const res = await request(app)
        .post('/api/plugins/generate')
        .send({ description: 'Generate a tool' })
      expect(res.status).toBe(500)
      expect(res.body).toEqual({
        success: false,
        error: 'Plugin deployment failed: deployment storage unavailable',
      })
    } finally {
      generate.mockRestore()
      deploy.mockRestore()
    }
  })

  it('should return 428 when tool requires missing credentials', async () => {
    const credentialTool = {
      id: 'cred-tool-1',
      name: 'Jira Tool',
      description: 'Jira integration',
      type: 'mcp',
      manifest: {
        credentialSource: {
          jiraToken: { vaultSecretId: 'jira-token', envVar: 'JIRA_TOKEN' },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await request(app).post('/api/tools').send(credentialTool)
    const res = await request(app)
      .post('/api/tools/cred-tool-1/execute')
      .send({ input: { projectKey: 'TEST' } })

    expect(res.status).toBe(428)
    expect(res.body.error).toContain('requires credentials')
    expect(res.body.request.missingCredentials).toBeDefined()
    expect(res.body.request.missingCredentials.length).toBeGreaterThanOrEqual(1)
  })

  it('should execute tool successfully after providing credentials', async () => {
    const credentialTool = {
      id: 'cred-tool-2',
      name: 'Slack Tool',
      description: 'Slack integration',
      type: 'mcp',
      manifest: {
        credentialSource: {
          slackToken: { vaultSecretId: 'slack-token', envVar: 'SLACK_TOKEN' },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await request(app).post('/api/tools').send(credentialTool)

    const execRes = await request(app)
      .post('/api/tools/cred-tool-2/execute')
      .send({ input: { channel: '#general', text: 'hello' } })

    expect(execRes.status).toBe(428)
    const executionId = execRes.body.request.executionId
    expect(executionId).toBeDefined()

    const credRes = await request(app)
      .post(`/api/executions/${executionId}/credentials`)
      .send({
        credentials: { slackToken: 'xoxb-test' },
        storeInVault: false,
      })

    expect(credRes.status).toBe(200)
    expect(credRes.body.status).toBe('completed')
  })

  describe('POST /api/tools/execute - flat payload support', () => {
    it('should execute with flat payload {id, name, type, manifest, input, credentials, isSkill}', async () => {
      const codeTool = {
        id: 'flat-tool-1',
        name: 'Flat Code Tool',
        description: 'Code tool via flat payload',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("flat payload test");',
        },
        isSkill: false,
      };

      const res = await request(app)
        .post('/api/tools/execute')
        .send({
          ...codeTool,
          input: { test: 'flat' },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.toolId).toBe('flat-tool-1');
    });

    it('passes the assistant binding config to the skill as externalConfig', async () => {
      // The settings tab writes `config` against the assistant's tool binding. Until
      // the route applied it, the executor built the skill with empty configuration
      // and every handler silently read its defaults.
      const skillId = 'config-binding-skill';
      await request(app).post('/api/tools').send({
        id: skillId,
        name: 'Config Binding Skill',
        description: 'Echoes the config the executor resolved',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: `const cfg = typeof __skill_config !== 'undefined' && __skill_config ? __skill_config : {};
console.log(JSON.stringify({ success: true, data: cfg }));`,
        },
        configSchema: {
          type: 'object',
          properties: { dataFeed: { type: 'string' } },
        },
        isSkill: true,
      });

      const res = await request(app)
        .post('/api/tools/execute')
        .set('X-Assistant-Id', 'assistant-1')
        .send({
          name: 'Config Binding Skill',
          type: 'code',
          manifest: {},
          input: {},
          externalConfig: { dataFeed: 'crm-accounts' },
        });

      expect(res.status).toBe(200);
      const output = String(res.body.output?.output ?? res.body.output ?? '');
      expect(JSON.parse(output).data.dataFeed).toBe('crm-accounts');
    });

    it('does not let one assistant config leak into another via the shared registry', async () => {
      const skillId = 'config-isolation-skill';
      await request(app).post('/api/tools').send({
        id: skillId,
        name: 'Config Isolation Skill',
        description: 'Echoes the config the executor resolved',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: `const cfg = typeof __skill_config !== 'undefined' && __skill_config ? __skill_config : {};
console.log(JSON.stringify({ success: true, data: cfg }));`,
        },
        configSchema: { type: 'object', properties: { dataFeed: { type: 'string' } } },
        isSkill: true,
      });

      await request(app)
        .post('/api/tools/execute')
        .set('X-Assistant-Id', 'assistant-a')
        .send({ name: 'Config Isolation Skill', type: 'code', manifest: {}, input: {}, externalConfig: { dataFeed: 'feed-a' } });

      // A second assistant with no settings of its own must not inherit feed-a: the
      // registry holds one shared instance per Skill, so writing onto it directly
      // would hand one assistant's configuration to every other user of that Skill.
      const second = await request(app)
        .post('/api/tools/execute')
        .set('X-Assistant-Id', 'assistant-b')
        .send({ name: 'Config Isolation Skill', type: 'code', manifest: {}, input: {} });

      const output = String(second.body.output?.output ?? second.body.output ?? '');
      expect(JSON.parse(output).data.dataFeed).toBeUndefined();
    });

    it('should reject registered skill by name without assistant context when using flat payload', async () => {
      // First register a skill
      const skillTool = {
        id: 'skill-1',
        name: 'Registered Skill',
        description: 'A registered skill',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("skill registered");',
        },
        isSkill: true,
      };

      await request(app).post('/api/tools').send(skillTool);

      // Now execute using flat payload with just the name
      const res = await request(app)
        .post('/api/tools/execute')
        .send({
          name: 'Registered Skill',
          type: 'code',
          manifest: {}, // empty - should resolve from registry
          input: { test: 'skill' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('assistant context');
    });

    it('should resolve registered skill by name when using flat payload with X-Assistant-Id', async () => {
      const skillTool = {
        id: 'skill-1',
        name: 'Registered Skill',
        description: 'A registered skill',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("skill registered");',
        },
        isSkill: true,
      };

      await request(app).post('/api/tools').send(skillTool);

      const res = await request(app)
        .post('/api/tools/execute')
        .set('X-Assistant-Id', 'assistant-123')
        .send({
          name: 'Registered Skill',
          type: 'code',
          manifest: {},
          input: { test: 'skill' },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.toolId).toBe('skill-1');
    });

    it('should preserve isSkill from flat payload when tool not registered', async () => {
      const res = await request(app)
        .post('/api/tools/execute')
        .send({
          name: 'Unregistered Skill',
          type: 'code',
          manifest: {
            language: 'javascript',
            entrypoint: 'index.js',
            sourceCode: 'console.log("unregistered");',
          },
          input: {},
          isSkill: true,
        });

      // Should fail because isSkill=true but no X-Assistant-Id header
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('assistant context');
    });

    it('should require X-Assistant-Id header for skill execution via flat payload', async () => {
      // Register a skill WITHOUT isSkill (so flat payload isSkill applies)
      const skillTool = {
        id: 'skill-2',
        name: 'Skill With Auth',
        description: 'Skill requiring auth',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("skill auth");',
        },
        // Note: isSkill not set on registered tool
      };

      await request(app).post('/api/tools').send(skillTool);

      // Execute with flat payload setting isSkill=true - should fail without header
      const res = await request(app)
        .post('/api/tools/execute')
        .send({
          name: 'Skill With Auth',
          type: 'code',
          manifest: {},
          input: {},
          isSkill: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('assistant context');
    });

    it('should execute skill with X-Assistant-Id header via flat payload', async () => {
      // Register a skill
      const skillTool = {
        id: 'skill-3',
        name: 'Skill With Header',
        description: 'Skill with header',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("skill with header");',
        },
        isSkill: true,
      };

      await request(app).post('/api/tools').send(skillTool);

      // Execute with header - should succeed
      const res = await request(app)
        .post('/api/tools/execute')
        .set('X-Assistant-Id', 'assistant-123')
        .send({
          name: 'Skill With Header',
          type: 'code',
          manifest: {},
          input: {},
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    });
  });

  describe('Credential propagation to CodeExecutor', () => {
    it('should propagate credentials to CodeExecutor sandbox without logging them', async () => {
      const credentialTool = {
        id: 'cred-propagate-1',
        name: 'Credential Propagate Tool',
        description: 'Tool to test credential propagation',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: `
            // Check that credentials are available via process.env or input
            const token = process.env.TEST_PROPAGATE_TOKEN || '';
            const key = process.env.TEST_PROPAGATE_KEY || '';
            console.log(JSON.stringify({ hasToken: !!token, hasKey: !!key }));
          `,
          credentialSource: {
            token: { envVar: 'TEST_PROPAGATE_TOKEN' },
            key: { envVar: 'TEST_PROPAGATE_KEY' },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      process.env.TEST_PROPAGATE_TOKEN = 'secret-token-value';
      process.env.TEST_PROPAGATE_KEY = 'secret-key-value';

      try {
        await request(app).post('/api/tools').send(credentialTool);

        const res = await request(app)
          .post('/api/tools/cred-propagate-1/execute')
          .send({ input: {} });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('completed');
        expect(res.body.output.output).toContain('hasToken');
      } finally {
        delete process.env.TEST_PROPAGATE_TOKEN;
        delete process.env.TEST_PROPAGATE_KEY;
      }
    });

    it('should support auth placeholder resolution in CodeExecutor', async () => {
      const authTool = {
        id: 'auth-tool-1',
        name: 'Auth Tool',
        description: 'Tool with auth placeholder',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: `
            // The sandbox has __resolveAuth injected
            const auth = { type: 'bearer', token: { envVar: 'AUTH_TEST_TOKEN' } };
            const resolved = await __resolveAuth(auth);
            console.log(JSON.stringify({ hasAuth: !!resolved.headers.Authorization }));
          `,
          credentialSource: {
            token: { envVar: 'AUTH_TEST_TOKEN' },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      process.env.AUTH_TEST_TOKEN = 'auth-test-value';

      try {
        await request(app).post('/api/tools').send(authTool);

        const res = await request(app)
          .post('/api/tools/auth-tool-1/execute')
          .send({ input: {} });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('completed');
      } finally {
        delete process.env.AUTH_TEST_TOKEN;
      }
    });

    it('should handle pending credential overrides for missing credentials', async () => {
      const missingCredTool = {
        id: 'missing-cred-1',
        name: 'Missing Credential Tool',
        description: 'Tool with missing credential',
        type: 'code',
        manifest: {
          language: 'javascript',
          entrypoint: 'index.js',
          sourceCode: 'console.log("test");',
          credentialSource: {
            missingToken: { envVar: 'MISSING_TOKEN_VAR' },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await request(app).post('/api/tools').send(missingCredTool);

      // Execute without credentials - should return 428
      const execRes = await request(app)
        .post('/api/tools/missing-cred-1/execute')
        .send({ input: {} });

      expect(execRes.status).toBe(428);
      const executionId = execRes.body.request.executionId;

      // Submit credentials override
      const credRes = await request(app)
        .post(`/api/executions/${executionId}/credentials`)
        .send({
          credentials: { missingToken: 'override-value' },
          storeInVault: false,
        });

      expect(credRes.status).toBe(200);
      expect(credRes.body.status).toBe('completed');
    });
  });

  describe('Event skill credential alignment', () => {
    it('should have credentialSource envVar matching auth token envVar for event skills', () => {
      // This test validates the event skill definitions
      
      for (const skill of eventSkills) {
        if (skill.manifest?.credentialSource && skill.manifest?.auth) {
          const credSource = skill.manifest.credentialSource as Record<string, { envVar?: string }>;
          const auth = skill.manifest.auth as Record<string, unknown>;
          const authCredentialEnvKeyMap = auth.credentialEnvKeyMap as Record<string, { envVar?: string }> | undefined;
          
          if (authCredentialEnvKeyMap?.token?.envVar) {
            const expectedEnvVar = authCredentialEnvKeyMap.token.envVar;
            const actualEnvVar = credSource.token?.envVar;
            expect(actualEnvVar).toBe(expectedEnvVar);
          }
        }
      }
    });
  });
})
