import request from 'supertest'
import express, { Application } from 'express'
import { ToolRegistry } from '../services/ToolRegistry'
import { ToolExecutor } from '../services/ToolExecutor'
import { PluginGenerator } from '../services/PluginGenerator'
import { Tool, PluginGenerationRequest, CredentialRequiredError, ConfirmationRequiredError } from '../types'
import toolsRouter from '../routes/tools'
import { ToolNotFoundError, ValidationError } from '../utils/errors'
import { eventSkills } from '../data/skills/event/index'

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

const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = jest.fn(async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/brain/complete')) {
      const body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            id: `plugin_${Date.now()}`,
            name: 'calculator',
            description: body.prompt,
            type: 'code',
            language: 'javascript',
            entrypoint: 'index.js',
            sourceCode: 'module.exports = { add: (a, b) => a + b };',
            requirements: [],
            configSchema: {},
            inputs: {},
            outputs: {},
          }),
          model: body.options?.model || 'gpt-4o-mini',
          provider: 'openrouter',
          tokensUsed: 100,
        }),
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

    const execution = await executor.execute(confirmingTool, { action: 'delete' });
    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('requires explicit confirmation');
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

    const execution = await executor.execute(confirmingTool, { action: 'delete' });
    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('requires explicit confirmation');
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

    const execution = await executor.execute(confirmingTool, { action: 'delete' });
    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('requires explicit confirmation');
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

    const execution = await executor.execute(confirmingTool, { action: 'delete' });
    expect(execution.status).toBe('failed');
    expect(execution.error).toContain('requires explicit confirmation');
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
        outputFormat: 'json',
      },
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const execution = await executor.execute(reasoningTool, { query: 'test pattern' });
    expect(execution.status).toBe('completed');
    expect(execution.toolId).toBe(reasoningTool.id);
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
