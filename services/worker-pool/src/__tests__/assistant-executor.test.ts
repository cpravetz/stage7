import { AssistantExecutor } from '../services/AssistantExecutor';
import { KnowledgeService } from '../services/KnowledgeService';
import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { AssistantDefinition, MCPToolCall } from '@stage7-nextgen/shared';
import { validateCatalogIntegrity } from '../routes/assistants';

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
          model: body.options?.model || 'gpt-4o-mini',
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
  let artifacts: ArtifactsService;
  let knowledgeService: KnowledgeService;

  beforeEach(async () => {
    artifacts = new ArtifactsService();
    await artifacts.ready();
    knowledgeService = new KnowledgeService(artifacts);
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

      (global.fetch as jest.Mock)
        .mockImplementationOnce(async (_url: any, _init: any) => ({
          ok: true,
          status: 200,
          json: async () => ({ content: brain1Content, model: 'gpt-4o-mini' }),
          text: async () => '',
        }) as any)
        .mockImplementationOnce(async (_url: any, init: any) => {
          const body = JSON.parse(init.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'completed', toolId: body.id, output: { message: `Executed ${body.name}`, args: body.input } }),
            text: async () => '',
          } as any;
        })
        .mockImplementationOnce(async (_url: any, _init: any) => ({
          ok: true,
          status: 200,
          json: async () => ({ content: brain2Content, model: 'gpt-4o-mini' }),
          text: async () => '',
        }) as any);

      const result = await executor.execute(definition, 'What is the weather in NYC?');

      expect(result.success).toBe(true);
      expect(result.output).toContain('72 degrees');
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

      (global.fetch as jest.Mock)
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
              model: body.options?.model || 'gpt-4o-mini',
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
