import { AssistantExecutor } from '../services/AssistantExecutor';
import { KnowledgeService } from '../services/KnowledgeService';
import { AssistantDefinition, MCPToolCall, logger } from '@stage7-nextgen/shared';
import { validateCatalogIntegrity } from '../routes/assistants';
import { createTestArtifactsService } from './testArtifactsService';

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
          content: `[Brain says] ${body.prompt}`,
          model: 'brain-selected-model',
          provider: 'openrouter',
          tokensUsed: 42,
        }),
        text: async () => '',
      } as any;
    }
    if (urlStr.includes('/api/tool-executor/tools/execute')) {
      const body = JSON.parse(init.body);
      const toolName = body.name || 'tool';
      if (toolName === 'unknown_tool') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'failed',
            toolId: body.id,
            error: `Unsupported tool type: ${body.type}. Register a real executor for this tool.`,
          }),
          text: async () => '',
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'completed',
          toolId: body.id,
          output: { message: `Executed ${toolName}`, args: body.input },
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

describe('AssistantExecutor', () => {
  let executor: AssistantExecutor;
  let knowledgeService: KnowledgeService;

  beforeEach(async () => {
    knowledgeService = new KnowledgeService(createTestArtifactsService());
    executor = new AssistantExecutor(knowledgeService);
  });

  describe('execute', () => {
    it('should return a valid result', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-1',
        tenantId: 'tenant-1',
        name: 'Test Assistant',
        description: 'A test assistant',
        systemPrompt: 'You are a helpful assistant.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await executor.execute(definition, 'Hello, world!');

      expect(result.assistantId).toBe('assistant-1');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello, world!');
      expect(result.durationMs).toBeDefined();
      expect(typeof result.durationMs).toBe('number');
    });

    it('should include context in execution', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-2',
        tenantId: 'tenant-1',
        name: 'Context Assistant',
        description: 'An assistant with context',
        systemPrompt: 'You are a helpful assistant.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await executor.execute(definition, 'Test', { userId: '123' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Test');
    });

    it('should execute tools when brain requests tool use', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-3',
        tenantId: 'tenant-1',
        name: 'Tool Assistant',
        description: 'An assistant with tools',
        systemPrompt: 'You are a helpful assistant.',
        tools: [{ name: 'get_weather', description: 'Get weather', inputSchema: { type: 'object', properties: { location: { type: 'string' } } } }],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (global.fetch as jest.Mock).mockImplementation(async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/brain/complete')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: '{"tool":"get_weather","args":{"location":"NYC"}}',
              model: 'gpt-4o-mini',
              provider: 'openrouter',
              tokensUsed: 42,
            }),
            text: async () => '',
          } as any;
        }
        if (urlStr.includes('/api/tool-executor/tools/execute')) {
          const body = JSON.parse(init.body);
          const toolName = body.name || 'tool';
          if (toolName === 'unknown_tool') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                status: 'failed',
                toolId: body.id,
                error: `Unsupported tool type: ${body.type}. Register a real executor for this tool.`,
              }),
              text: async () => '',
            } as any;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'completed',
              toolId: body.id,
              output: { message: `Executed ${toolName}`, args: body.input },
            }),
            text: async () => '',
          } as any;
        }
        return originalFetch(url, init);
      });

       const result = await executor.execute(definition, 'What is the weather in NYC?');

       expect(result.success).toBe(true);
       expect(result.output).toContain('Executed get_weather');
       expect(result.output).toContain('NYC');
     });

    it('should reason across turns (tool call then final answer)', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-4',
        tenantId: 'tenant-1',
        name: 'Reasoner',
        description: 'A reasoning assistant',
        systemPrompt: 'You are a reasoning agent that uses tools then answers.',
        tools: [{ name: 'get_weather', description: 'Get weather', inputSchema: { type: 'object', properties: { location: { type: 'string' } } } }],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const brain1Content = '{"tool":"get_weather","args":{"location":"NYC"}}';
      const brain2Content = 'The weather in NYC is 72 degrees and sunny. Final answer.';

      // Scripted by URL, not call order: execute() now issues an embeddings
      // probe before the first brain completion. The default mock is restored
      // afterwards so later tests keep their once-chains.
      const defaultImpl = (global.fetch as jest.Mock).getMockImplementation();
      let completeCalls = 0;
      try {
        (global.fetch as jest.Mock).mockImplementation(async (url: any, init: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/api/brain/embeddings')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ available: false }),
              text: async () => '',
            } as any;
          }
          if (urlStr.includes('/api/brain/complete')) {
            completeCalls += 1;
            const content = completeCalls === 1 ? brain1Content : brain2Content;
            return {
              ok: true,
              status: 200,
              json: async () => ({ content, model: 'gpt-4o-mini' }),
              text: async () => '',
            } as any;
          }
          if (urlStr.includes('/api/tool-executor/tools/execute')) {
            const body = JSON.parse(init.body);
            return {
              ok: true,
              status: 200,
              json: async () => ({ status: 'completed', toolId: body.id, output: { message: `Executed ${body.name}`, args: body.input } }),
              text: async () => '',
            } as any;
          }
          return originalFetch(url, init);
        });

        const result = await executor.execute(definition, 'What is the weather in NYC?');

        expect(result.success).toBe(true);
        expect(result.output).toContain('72 degrees');
      } finally {
        (global.fetch as jest.Mock).mockImplementation(defaultImpl);
      }
    });

    it('should self-extend by executing an auto-generated tool on demand', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-5',
        tenantId: 'tenant-1',
        name: 'SelfExtender',
        description: 'An agent that can request tools it does not yet have',
        systemPrompt: 'You are an agent that requests tools when needed.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // The embeddings probe precedes the first brain completion, so it gets
      // the first Once; the remaining three map onto the original sequence.
      (global.fetch as jest.Mock)
        .mockImplementationOnce(async (_url: any, _init: any) => ({
          ok: true, status: 200,
          json: async () => ({ available: false }),
          text: async () => '',
        }) as any)
        .mockImplementationOnce(async (_url: any, _init: any) => ({
          ok: true, status: 200,
          json: async () => ({ content: '{"tool":"calculate_taxi_fare","args":{"distance":10}}', model: 'gpt-4o-mini' }),
          text: async () => '',
        }) as any)
        .mockImplementationOnce(async (_url: any, init: any) => {
          return {
            ok: true, status: 200,
            json: async () => ({
              status: 'completed',
              toolId: 'tool-xyz',
              output: { output: '$23.00', exitCode: 0, autoGenerated: true, message: 'Auto-generated taxi fare tool' },
            }),
            text: async () => '',
          } as any;
        })
        .mockImplementationOnce(async (_url: any, _init: any) => ({
          ok: true, status: 200,
          json: async () => ({ content: 'The taxi fare is $23.00.', model: 'gpt-4o-mini' }),
          text: async () => '',
        }) as any);

      const result = await executor.execute(definition, 'Calculate the taxi fare for 10 miles.');

      expect(result.success).toBe(true);
      expect(result.output).toContain('$23.00');
    });
  });

  describe('brain spend attribution', () => {
    it('sends the assistant owner as userId on brain completions', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-owner',
        tenantId: 'tenant-1',
        ownerId: 'usr_owner',
        name: 'Owned Assistant',
        description: 'An owned assistant',
        systemPrompt: 'You are a helpful assistant.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const defaultImpl = (global.fetch as jest.Mock).getMockImplementation();
      const brainBodies: Array<Record<string, unknown>> = [];
      try {
        (global.fetch as jest.Mock).mockImplementation(async (url: any, init: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/api/brain/embeddings')) {
            return { ok: true, status: 200, json: async () => ({ available: false }), text: async () => '' } as any;
          }
          if (urlStr.includes('/api/brain/complete')) {
            brainBodies.push(JSON.parse(init.body));
            return {
              ok: true,
              status: 200,
              json: async () => ({ content: 'Final answer.', model: 'gpt-4o-mini' }),
              text: async () => '',
            } as any;
          }
          return originalFetch(url, init);
        });

        const result = await executor.execute(definition, 'Hello');
        expect(result.success).toBe(true);
        expect(brainBodies.length).toBeGreaterThan(0);
        expect(brainBodies[0].userId).toBe('usr_owner');
      } finally {
        (global.fetch as jest.Mock).mockImplementation(defaultImpl);
      }
    });

    it('omits userId when the assistant has no owner, leaving spend to the system bucket', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-orphan',
        tenantId: 'tenant-1',
        name: 'Ownerless Assistant',
        description: 'No owner recorded',
        systemPrompt: 'You are a helpful assistant.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const defaultImpl = (global.fetch as jest.Mock).getMockImplementation();
      const brainBodies: Array<Record<string, unknown>> = [];
      try {
        (global.fetch as jest.Mock).mockImplementation(async (url: any, init: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/api/brain/embeddings')) {
            return { ok: true, status: 200, json: async () => ({ available: false }), text: async () => '' } as any;
          }
          if (urlStr.includes('/api/brain/complete')) {
            brainBodies.push(JSON.parse(init.body));
            return {
              ok: true,
              status: 200,
              json: async () => ({ content: 'Final answer.', model: 'gpt-4o-mini' }),
              text: async () => '',
            } as any;
          }
          return originalFetch(url, init);
        });

        const result = await executor.execute(definition, 'Hello');
        expect(result.success).toBe(true);
        expect(brainBodies.length).toBeGreaterThan(0);
        expect(brainBodies[0].userId).toBeUndefined();
      } finally {
        (global.fetch as jest.Mock).mockImplementation(defaultImpl);
      }
    });
  });

  describe('executeToolCall', () => {
    it('should return result for known tools', async () => {
      const toolCall: MCPToolCall = {
        name: 'get_weather',
        arguments: { location: 'New York' },
      };

      const result = await executor.executeToolCall(toolCall);

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Executed get_weather');
    });

    it('should return error for unknown tools', async () => {
      const toolCall: MCPToolCall = {
        name: 'unknown_tool',
        arguments: {},
      };

      const result = await executor.executeToolCall(toolCall);

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Unsupported tool type');
    });
  });

  describe('context propagation', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockImplementation(async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/brain/complete')) {
          const body = JSON.parse(init.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: `[Brain says] ${body.systemPrompt}\nUser: ${body.prompt}`,
              model: 'brain-selected-model',
              provider: 'openrouter',
              tokensUsed: 42,
            }),
            text: async () => '',
          } as any;
        }
        if (urlStr.includes('/api/tool-executor/tools/execute')) {
          const body = JSON.parse(init.body);
          const toolName = body.name || 'tool';
          if (toolName === 'unknown_tool') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                status: 'failed',
                toolId: body.id,
                error: `Unsupported tool type: ${body.type}. Register a real executor for this tool.`,
              }),
              text: async () => '',
            } as any;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'completed',
              toolId: body.id,
              output: { message: `Executed ${toolName}`, args: body.input },
            }),
            text: async () => '',
          } as any;
        }
        return originalFetch(url, init);
      });
    });

    it('should sanitize sensitive context keys before execution', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-sens',
        tenantId: 'tenant-1',
        name: 'Sensitive Assistant',
        description: 'An assistant that handles sensitive data',
        systemPrompt: 'You are a helpful assistant.',
        tools: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await executor.execute(definition, 'Test', {
        userId: 'user-123',
        password: 'my-secret-password',
        apiKey: 'my-api-key-456',
        safeData: 'hello',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('[REDACTED]');
      expect(result.output).not.toContain('my-secret-password');
      expect(result.output).not.toContain('my-api-key-456');
      expect(result.output).toContain('hello');
    });
  });

  describe('knowledge injection budgeting', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockImplementation(async (_url: any, init: any) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: `[Brain says] ${body.systemPrompt}`,
            model: 'brain-selected-model',
            provider: 'openrouter',
            tokensUsed: 42,
          }),
          text: async () => '',
        } as any;
      });
    });

    afterEach(() => {
      delete process.env.KNOWLEDGE_BUDGET_CHARS;
    });

    const definitionFor = (id: string, name: string): AssistantDefinition => ({
      id,
      tenantId: 'tenant-1',
      name,
      description: 'Knowledge budgeting test assistant',
      systemPrompt: 'You are a helpful assistant.',
      tools: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('injects every entry at today\'s volumes (small set under budget)', async () => {
      await knowledgeService.publish({
        id: 'legal-1',
        title: 'Contract Rules',
        content: 'Always cite the governing law.',
        assistantId: 'legal-advisor',
        scope: 'assistant',
        origin: 'authored',
        tags: ['legal'],
      });
      await knowledgeService.publish({
        id: 'shared-1',
        title: 'Tone Guide',
        content: 'Be concise and precise.',
        assistantId: null,
        scope: 'shared',
        origin: 'authored',
        tags: ['tone'],
      });

      const result = await executor.execute(definitionFor('legal-advisor', 'Legal Advisor'), 'Draft a summary');

      expect(result.success).toBe(true);
      expect(result.output).toContain('### Contract Rules');
      expect(result.output).toContain('Always cite the governing law.');
      expect(result.output).toContain('### Tone Guide');
      expect(result.output).toContain('Be concise and precise.');
    });

    it('ranks tag-matched entries first and drops entries beyond the budget', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
      process.env.KNOWLEDGE_BUDGET_CHARS = '900';
      jest.useFakeTimers();
      try {
        await knowledgeService.publish({
          id: 'kb-tag',
          title: 'Legal Rules',
          content: 'G'.repeat(300),
          assistantId: 'legal-advisor',
          scope: 'assistant',
          origin: 'authored',
          tags: ['legal'],
        });
        jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        await knowledgeService.publish({
          id: 'kb-older',
          title: 'Older Notes',
          content: 'R'.repeat(300),
          assistantId: null,
          scope: 'shared',
          origin: 'acquired',
        });
        jest.setSystemTime(new Date('2026-01-02T00:00:00Z'));
        await knowledgeService.publish({
          id: 'kb-newer',
          title: 'Newer Notes',
          content: 'O'.repeat(300),
          assistantId: null,
          scope: 'shared',
          origin: 'acquired',
        });

        const result = await executor.execute(definitionFor('legal-advisor', 'Legal Advisor'), 'Draft a summary');

        expect(result.success).toBe(true);
        expect(result.output).toContain('### Legal Rules');
        expect(result.output).toContain('### Newer Notes');
        expect(result.output).not.toContain('### Older Notes');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.objectContaining({ droppedCount: 1, dropped: [expect.objectContaining({ id: 'kb-older' })] }),
          'Knowledge injection budget: dropped low-ranked entries',
        );
      } finally {
        warnSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it('still injects the top entry when it alone exceeds the budget', async () => {
      process.env.KNOWLEDGE_BUDGET_CHARS = '100';
      await knowledgeService.publish({
        id: 'kb-huge',
        title: 'Huge Entry',
        content: 'H'.repeat(500),
        assistantId: null,
        scope: 'shared',
        origin: 'authored',
      });

      const result = await executor.execute(definitionFor('any-advisor', 'Any Advisor'), 'Draft a summary');

      expect(result.success).toBe(true);
      expect(result.output).toContain('### Huge Entry');
    });
  });
});

describe('Catalog validation', () => {
  it('should detect orphaned tool bindings in catalog', () => {
    const catalog = [
      {
        id: 'good-assistant',
        tools: [
          { name: 'real-tool', description: 'A real tool', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } },
        ],
      },
      {
        id: 'bad-assistant',
        tools: [
          { name: 'orphan-stub', description: 'Run orphan-stub', inputSchema: { type: 'object', properties: {} } },
        ],
      },
    ];

    const result = validateCatalogIntegrity(catalog as any);
    expect(result.valid).toBe(false);
    expect(result.orphaned).toContain('bad-assistant:orphan-stub');
  });

  it('should pass validation for clean catalog without orphaned bindings', () => {
    const catalog = [
      {
        id: 'clean-assistant',
        tools: [
          { name: 'real-tool', description: 'A real tool with real description', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } },
        ],
      },
    ];

    const result = validateCatalogIntegrity(catalog as any);
    expect(result.valid).toBe(true);
    expect(result.orphaned).toHaveLength(0);
  });
});

describe('brain spend-limit refusal propagation (OD-5 finding B)', () => {
  const definition: AssistantDefinition = {
    id: 'assistant-capped',
    tenantId: 'tenant-1',
    name: 'Capped Assistant',
    description: 'An assistant whose owner is capped',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let executor: AssistantExecutor;

  beforeEach(async () => {
    executor = new AssistantExecutor(new KnowledgeService(createTestArtifactsService()));
  });

  function mockBrain(status: number, body: unknown): () => void {
    const defaultImpl = (global.fetch as jest.Mock).getMockImplementation();
    (global.fetch as jest.Mock).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/brain/embeddings')) {
        return { ok: true, status: 200, json: async () => ({ available: false }), text: async () => '' } as any;
      }
      if (urlStr.includes('/api/brain/complete')) {
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        return { ok: status < 400, status, statusText: 'Too Many Requests', json: async () => body, text: async () => text } as any;
      }
      return originalFetch(url, {});
    });
    return () => (global.fetch as jest.Mock).mockImplementation(defaultImpl);
  }

  it('carries the Brain 429 refusal contract on the failed result', async () => {
    const REFUSAL = {
      error: 'SPEND_LIMIT_REACHED',
      userId: 'usr_owner',
      period: 'month',
      limit: 25,
      spent: 25.03,
      periodEnd: '2026-12-01T00:00:00.000Z',
    };
    const restore = mockBrain(429, REFUSAL);
    try {
      const result = await executor.execute(definition, 'Hello');
      expect(result.success).toBe(false);
      expect(result.spendRefusal).toEqual(REFUSAL);
      expect(result.error).toContain('spending limit');
    } finally {
      restore();
    }
  });

  it('does not fabricate a refusal from a malformed 429 body', async () => {
    const restore = mockBrain(429, { error: 'SPEND_LIMIT_REACHED' });
    try {
      const result = await executor.execute(definition, 'Hello');
      expect(result.success).toBe(false);
      expect(result.spendRefusal).toBeUndefined();
      expect(result.error).toContain('Brain returned 429');
    } finally {
      restore();
    }
  });

  it('leaves non-429 brain failures untouched', async () => {
    const restore = mockBrain(503, { error: 'provider down' });
    try {
      const result = await executor.execute(definition, 'Hello');
      expect(result.success).toBe(false);
      expect(result.spendRefusal).toBeUndefined();
      expect(result.error).toContain('Brain returned 503');
    } finally {
      restore();
    }
  });
});
