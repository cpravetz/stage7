import { BrainService } from '../services/BrainService';
import { SemanticCache } from '../services/SemanticCache';
import { LLMProvider, CompletionRequest, CompletionResponse, ProviderInfo } from '../providers/Provider';
import { BRAIN_MODEL_SELECTION_EXHAUSTED } from '@stage7-nextgen/shared';

const mockProviderInfo: ProviderInfo = {
  id: 'mock',
  name: 'Mock Provider',
  apiBase: 'http://mock',
  hasApiKey: true,
  openAICompatible: true,
};

class MockProvider implements LLMProvider {
  readonly id = 'mock';
  readonly name = 'Mock Provider';
  readonly info: ProviderInfo = mockProviderInfo;
  lastRequest: CompletionRequest | null = null;
  failure: Error | null = null;
  calls = 0;
  response: CompletionResponse = {
    content: 'mocked response',
    model: 'mock-model',
    provider: 'mock',
    tokensUsed: 10,
  };
  isAvailable(): boolean { return true; }
  async listModels() {
    return [
      { id: 'mock-model', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 128000, costPer1kTokens: 0.1 },
      { id: 'mock-expensive', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 5 },
    ];
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls += 1;
    this.lastRequest = req;
    if (this.failure) throw this.failure;
    return this.response;
  }
}

const mockProviderInstance = new MockProvider();
const mockProviderInstances: LLMProvider[] = [mockProviderInstance];

jest.mock('../providers/registry', () => ({
  buildProviderRegistry: () => mockProviderInstances,
}));

describe('BrainService', () => {
  let brain: BrainService;
  let cache: SemanticCache;

  beforeEach(async () => {
    mockProviderInstances.splice(0, mockProviderInstances.length, mockProviderInstance);
    mockProviderInstance.lastRequest = null;
    mockProviderInstance.failure = null;
    mockProviderInstance.calls = 0;
    mockProviderInstance.response = {
      content: 'mocked response',
      model: 'mock-model',
      provider: 'mock',
      tokensUsed: 10,
    };
    cache = SemanticCache.getInstance();
    brain = new BrainService();
  });

  afterAll(() => {
    cache.disconnect();
  });

  it('should complete a prompt and return a result', async () => {
    const result = await brain.complete('Hello, world!');
    expect(result.content).toBe('mocked response');
    expect(result.model).toBe('mock-model');
    expect(result.provider).toBe('mock');
    expect(result.cached).toBe(false);
    expect(result.tokensUsed).toBe(10);
  });

  it('persists quality complaints so later routing can use them after restart', async () => {
    let persistedMetrics: Record<string, Record<string, unknown>> = {};
    let metricsDocumentExists = false;
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return { ok: true, json: async () => ({ data: { freeModelsOnly: false } }) } as Response;
      }
      if (url.endsWith('/api/artifacts/documents/model-performance-metrics')) {
        if (method === 'PUT') {
          if (!metricsDocumentExists) return { ok: false, status: 404, text: async () => 'Document not found' } as Response;
          persistedMetrics = JSON.parse(String(init?.body)).data;
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }
        return metricsDocumentExists
          ? { ok: true, status: 200, json: async () => ({ data: persistedMetrics }) } as Response
          : { ok: false, status: 404, json: async () => ({}) } as Response;
      }
      if (url.endsWith('/api/artifacts/documents') && method === 'POST') {
        const document = JSON.parse(String(init?.body)) as { data: Record<string, Record<string, unknown>> };
        metricsDocumentExists = true;
        persistedMetrics = document.data;
        return { ok: true, status: 201, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    try {
      const result = await brain.complete('Validate this arithmetic answer.');
      expect(await brain.recordComplaint(result.requestId)).toBe(true);
      expect(await brain.recordComplaint(result.requestId)).toBe(true);
      expect(persistedMetrics['mock:mock-model']).toMatchObject({
        complaintCount: 1,
        complaintRate: 1,
        totalRequests: 1,
      });

      await brain.complete('A separate valid request should update the complaint rate.');
      expect(persistedMetrics['mock:mock-model']).toMatchObject({
        complaintCount: 1,
        complaintRate: 0.5,
        totalRequests: 2,
      });

      const reloadedBrain = new BrainService();
      const reloadedMetrics = await reloadedBrain.getPerformanceMetricsForModel('mock-model', 'mock');
      expect(reloadedMetrics).toMatchObject({ complaintCount: 1, complaintRate: 0.5 });
      await expect(brain.recordComplaint('unknown-request')).resolves.toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('logs only completed provider calls with their resolved model and provider', async () => {
    await brain.complete('logging must use resolved provider metadata');

    const completionLogs = brain.getLogs().filter((entry) => entry.type === 'completion');
    expect(completionLogs).toHaveLength(1);
    expect(completionLogs[0]).toMatchObject({
      model: 'mock-model',
      provider: 'mock',
      success: true,
      durationMs: expect.any(Number),
    });
    expect(completionLogs.some((entry) => entry.model === 'auto')).toBe(false);
  });

  it('does not retry a provider after credit exhaustion and records the cause once', async () => {
    mockProviderInstance.failure = new Error(
      '402 {"error":"You have no remaining credits for this provider"}',
    );

    await expect(brain.complete('credit exhaustion should stop provider retries')).rejects.toThrow(
      'no remaining credits',
    );

    expect(mockProviderInstance.calls).toBe(1);
    const errors = brain.getLogs().filter((entry) => entry.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain('no remaining credits');
  });

  it('tries another provider after the selected provider runs out of credits', async () => {
    mockProviderInstance.failure = new Error(
      '402 {"error":"Your organization has no remaining credits"}',
    );
    const fallbackProvider = {
      id: 'backup',
      name: 'Backup Provider',
      info: {
        id: 'backup',
        name: 'Backup Provider',
        apiBase: 'http://backup',
        hasApiKey: true,
        openAICompatible: true,
      },
      isAvailable: () => true,
      listModels: async () => [{
        id: 'mock-model',
        capabilities: ['chat', 'reasoning'],
        maxTokens: 128000,
        costPer1kTokens: 0.2,
      }],
      complete: jest.fn(async () => ({
        content: 'completed through backup',
        model: 'mock-model',
        provider: 'backup',
        tokensUsed: 12,
      })),
    } satisfies LLMProvider;
    mockProviderInstances.push(fallbackProvider);
    brain = new BrainService();

    const result = await brain.complete(
      'Try another provider after the preferred model runs out of credits',
    );

    expect(result).toMatchObject({
      content: 'completed through backup',
      model: 'mock-model',
      provider: 'backup',
    });
    expect(mockProviderInstance.calls).toBe(1);
    expect(fallbackProvider.complete).toHaveBeenCalledTimes(1);
  });

  it('continues to the next model when a provider restricts one model to agentic harnesses', async () => {
    const attemptedModels: string[] = [];
    const openRouterProvider = {
      id: 'openrouter',
      name: 'OpenRouter',
      info: {
        id: 'openrouter',
        name: 'OpenRouter',
        apiBase: 'https://openrouter.ai/api/v1',
        hasApiKey: true,
        openAICompatible: true,
      },
      isAvailable: () => true,
      listModels: async () => [
        { id: 'restricted-free-model:free', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 0 },
        { id: 'available-paid-model', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 10 },
      ],
      complete: async (req: CompletionRequest) => {
        attemptedModels.push(req.model);
        if (req.model === 'restricted-free-model:free') {
          throw new Error(
            '[openrouter] completion failed: 403 {"error":{"message":"restricted-free-model:free is only available on agentic harnesses"}}',
          );
        }
        return {
          content: 'completed through the next OpenRouter model',
          model: req.model,
          provider: 'openrouter',
          tokensUsed: 12,
        };
      },
    } satisfies LLMProvider;
    mockProviderInstances.splice(0, mockProviderInstances.length, openRouterProvider);

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return { ok: true, json: async () => ({ data: { freeModelsOnly: false } }) } as Response;
      }
      if (url.endsWith('/api/artifacts/documents/model-performance-metrics')) {
        return { ok: false, status: 404, json: async () => ({}), text: async () => 'Document not found' } as Response;
      }
      if (url.endsWith('/api/artifacts/documents') && method === 'POST') {
        return { ok: true, status: 201, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    try {
      const routingBrain = new BrainService();
      const options = { routingSessionId: 'mission-openrouter-model-fallback' };
      const result = await routingBrain.complete('Help me with a chat response', options);

      expect(result).toMatchObject({
        content: 'completed through the next OpenRouter model',
        model: 'available-paid-model',
        provider: 'openrouter',
      });

      const followUp = await routingBrain.complete('Continue the chat response', options);
      expect(followUp.model).toBe('available-paid-model');
      expect(attemptedModels).toEqual([
        'restricted-free-model:free',
        'available-paid-model',
        'available-paid-model',
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('should pass systemPrompt to the provider when provided', async () => {
    await brain.complete('hi', { systemPrompt: 'you are a cat' });
    expect(mockProviderInstance.lastRequest).not.toBeNull();
    expect(mockProviderInstance.lastRequest!.messages[0].role).toBe('system');
    expect(mockProviderInstance.lastRequest!.messages[0].content).toBe('you are a cat');
    expect(mockProviderInstance.lastRequest!.messages[1].role).toBe('user');
    expect(mockProviderInstance.lastRequest!.messages[1].content).toBe('hi');
  });

  it('should pass inputFormat and outputFormat to the provider when provided', async () => {
    await brain.complete('chat response', {
      inputFormat: 'image',
      outputFormat: 'text',
    });
    expect(mockProviderInstance.lastRequest).not.toBeNull();
    expect(mockProviderInstance.lastRequest!.inputFormat).toBe('image');
    expect(mockProviderInstance.lastRequest!.outputFormat).toBe('text');
  });

  it('should not pass inputFormat and outputFormat when not provided', async () => {
    await brain.complete('chat response');
    expect(mockProviderInstance.lastRequest).not.toBeNull();
    expect(mockProviderInstance.lastRequest!.inputFormat).toBeUndefined();
    expect(mockProviderInstance.lastRequest!.outputFormat).toBeUndefined();
  });

  it('should cache the result on a second identical call', async () => {
    const r1 = await brain.complete('cache test prompt');
    expect(r1.cached).toBe(false);
    const r2 = await brain.complete('cache test prompt');
    expect(r2.cached).toBe(true);
    expect(r2.content).toBe('mocked response');
  });

  it('should pick the cheapest model that matches required capabilities', async () => {
    const result = await brain.complete('Help me write some code');
    expect(result.model).toBe('mock-model');
  });

  it('reuses a successful model across routing-session calls', async () => {
    const options = { missionId: 'mission-routing', routingSessionId: 'mission-routing:planner' };

    await brain.complete('Help me with a chat response', options);
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-model');

    await brain.complete('Continue the chat response', options);
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-model');

    await brain.complete('Summarize the chat response', options);
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-model');
    expect(mockProviderInstance.calls).toBe(3);
  });

  it('does not select paid models when free-model-only is enabled and no free candidates exist', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({ data: { freeModelsOnly: true } }),
    }) as Response);
    const freeOnlyBrain = new BrainService();

    try {
      await expect(freeOnlyBrain.complete('Help me with a chat response', {
        missionId: 'mission-free-routing',
        routingSessionId: 'mission-free-routing:planner',
      })).rejects.toMatchObject({
        details: {
          code: BRAIN_MODEL_SELECTION_EXHAUSTED,
          eligibleModelCount: 0,
          freeModelsOnly: true,
        },
      });
      expect(mockProviderInstance.calls).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('reloads persisted measured outcomes and uses them in a later Brain instance', async () => {
    const models = {
      'baseline-cheap': {
        id: 'baseline-cheap',
        capabilities: ['chat', 'code'],
        maxTokens: 4096,
        costPer1kTokens: 0.05,
      },
      'measured-model': {
        id: 'measured-model',
        capabilities: ['chat', 'code'],
        maxTokens: 4096,
        costPer1kTokens: 0.09,
      },
    };
    const provider = {
      id: 'outcomes',
      name: 'Outcome Provider',
      info: {
        id: 'outcomes',
        name: 'Outcome Provider',
        apiBase: 'http://outcomes',
        hasApiKey: true,
        openAICompatible: true,
      },
      isAvailable: () => true,
      listModels: async () => Object.values(models),
      complete: async (req: CompletionRequest) => {
        if (req.model === 'baseline-cheap') throw new Error('model baseline-cheap does not exist');
        return {
          content: 'outcome response',
          model: req.model,
          provider: 'outcomes',
          tokensUsed: 10,
        };
      },
    } satisfies LLMProvider;
    mockProviderInstances.push(provider);

    let persistedMetrics: Record<string, Record<string, unknown>> = {};
    let metricsDocumentExists = false;
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return { ok: true, json: async () => ({ data: { freeModelsOnly: false } }) } as Response;
      }
      if (url.endsWith('/api/artifacts/documents/model-performance-metrics')) {
        if (method === 'PUT') {
          if (!metricsDocumentExists) {
            return { ok: false, status: 404, text: async () => 'Document not found' } as Response;
          }
          persistedMetrics = JSON.parse(String(init?.body)).data;
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }
        return metricsDocumentExists
          ? { ok: true, status: 200, json: async () => ({ data: persistedMetrics }) } as Response
          : { ok: false, status: 404, json: async () => ({}) } as Response;
      }
      if (url.endsWith('/api/artifacts/documents') && method === 'POST') {
        const document = JSON.parse(String(init?.body)) as {
          id: string;
          data: Record<string, Record<string, unknown>>;
        };
        expect(document.id).toBe('model-performance-metrics');
        metricsDocumentExists = true;
        persistedMetrics = document.data;
        return { ok: true, status: 201, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    try {
      const firstBrain = new BrainService();
      const measuredResult = await firstBrain.complete('implement code', { optimizeFor: 'balanced' });
      expect(measuredResult.model).toBe('measured-model');
      expect(persistedMetrics['outcomes:baseline-cheap']).toMatchObject({
        failedRequests: 1,
        successRate: 0,
      });
      expect(persistedMetrics['outcomes:measured-model']).toMatchObject({
        successfulRequests: 1,
        successRate: 1,
        avgLatencyMs: expect.any(Number),
        avgCostPerRequest: expect.any(Number),
        costRequests: 1,
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/artifacts/documents'),
        expect.objectContaining({ method: 'POST' }),
      );

      const reloadedBrain = new BrainService();
      const laterResult = await reloadedBrain.complete('chat response after reload');
      expect(laterResult.model).toBe('measured-model');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/artifacts/documents/model-performance-metrics'),
        { method: 'GET' },
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('should list providers', () => {
    const providers = brain.listProviders();
    expect(providers.length).toBe(1);
    expect(providers[0].id).toBe('mock');
  });

  it('should expose available models', () => {
    const models = brain.listAvailableModels();
    expect(Array.isArray(models)).toBe(true);
  });

  it('should validate structured output', () => {
    const schema = require('zod').z.object({ name: require('zod').z.string() });
    const out = brain.validateStructuredOutput(schema, { name: 'alice' });
    expect(out).toEqual({ name: 'alice' });
  });
});
