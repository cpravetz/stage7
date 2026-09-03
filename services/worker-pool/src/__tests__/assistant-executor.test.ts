import { AssistantExecutor } from '../services/AssistantExecutor';
import { AssistantDefinition, MCPToolCall } from '@stage7-nextgen/shared';

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
    return originalFetch(url, init);
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('AssistantExecutor', () => {
  let executor: AssistantExecutor;

  beforeEach(() => {
    executor = new AssistantExecutor();
  });

  describe('execute', () => {
    it('should return a valid result', async () => {
      const definition: AssistantDefinition = {
        id: 'assistant-1',
        tenantId: 'tenant-1',
        name: 'Test Assistant',
        description: 'A test assistant',
        model: 'gpt-4',
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
        model: 'gpt-4',
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
  });

  describe('executeToolCall', () => {
    it('should return result for known tools', async () => {
      const toolCall: MCPToolCall = {
        name: 'get_weather',
        arguments: { location: 'New York' },
      };

      const result = await executor.executeToolCall(toolCall);

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('get_weather');
    });

    it('should return error for unknown tools', async () => {
      const toolCall: MCPToolCall = {
        name: 'unknown_tool',
        arguments: {},
      };

      const result = await executor.executeToolCall(toolCall);

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('error');
      expect(result.content[0].error).toContain('Unknown tool');
    });
  });
});
