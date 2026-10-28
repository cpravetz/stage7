import { BrainService } from '../src/services/BrainService';
import { SemanticCache } from '../src/services/SemanticCache';
import { LLMProvider, CompletionRequest, CompletionResponse, ProviderInfo } from '../src/providers/Provider';
import { BRAIN_MODEL_SELECTION_EXHAUSTED, BRAIN_MODEL_SELECTION_RETRY } from '@stage7-nextgen/shared';

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
  modelFailures = new Map<string, Error>();
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
      { id: 'mock-model', capabilities: ['chat', 'code', 'reasoning', 'creative'], maxTokens: 128000, costPer1kTokens: 0.1, inputFormat: 'image', outputFormat: 'text' },
      { id: 'mock-expensive', capabilities: ['chat'], maxTokens: 8192, costPer1kTokens: 5 },
    ];
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls += 1;
    this.lastRequest = req;
    const modelFailure = this.modelFailures.get(req.model);
    if (modelFailure) throw modelFailure;
    if (this.failure) throw this.failure;
    return this.response;
  }
}

const mockProviderInstance = new MockProvider();
const mockProviderInstances: LLMProvider[] = [mockProviderInstance];

jest.mock('../src/providers/registry', () => ({
  buildProviderRegistry: () => mockProviderInstances,
}));

describe('BrainService', () => {
  let brain: BrainService;
  let cache: SemanticCache;

  beforeEach(async () => {
    mockProviderInstances.splice(0, mockProviderInstances.length, mockProviderInstance);
    mockProviderInstance.lastRequest = null;
    mockProviderInstance.failure = null;
    mockProviderInstance.modelFailures.clear();
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
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return { ok: true, json: async () => ({ data: { freeModelsOnly: false } }) } as Response;
      }
      if (url.endsWith('/api/artifacts/brain/performance-metrics')) {
        if (method === 'PUT') {
          const metric = JSON.parse(String(init?.body)) as { model: string; provider: string } & Record<string, unknown>;
          persistedMetrics[`${metric.provider}:${metric.model}`] = metric;
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ metrics: Object.values(persistedMetrics) }) } as Response;
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

  it('persists brain log to artifacts so history survives a restart', async () => {
    let brainLogDocument: Record<string, unknown> | null = null;
    let documentExists = false;
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/brain/logs')) {
        if (method === 'POST') {
          documentExists = true;
          const logEntries = (brainLogDocument?.entries as unknown[] | undefined) || [];
          brainLogDocument = { entries: [JSON.parse(String(init?.body)), ...logEntries] };
          return { ok: true, status: 201, json: async () => ({ accepted: true }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ entries: brainLogDocument?.entries || [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    try {
      const firstBrain = new BrainService();
      await firstBrain.complete('a persisted log entry');
      // saveBrainLog is fire-and-forgive; let the microtask flush.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(documentExists).toBe(true);
      const entries = (brainLogDocument as { entries: unknown[] } | null)?.entries;
      expect(Array.isArray(entries) && entries.length).toBeGreaterThan(0);
      expect(((entries as unknown[])[0] as { type: string }).type).toBe('completion');

      const reloadedBrain = new BrainService();
      await reloadedBrain.initialize();
      const reloadedLogs = reloadedBrain.getLogs();
      expect(reloadedLogs.length).toBeGreaterThan(0);
      expect(reloadedLogs[0].type).toBe('completion');
    } finally {
      fetchSpy.mockRestore();
    }
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

  it('keeps the provider usable when a single model is forbidden', async () => {
    // A 403 on one model is a model problem, not a provider problem: the
    // provider's other models must still be tried.
    mockProviderInstance.modelFailures.set(
      'mock-model',
      new Error('[mock] completion failed: 403 {"error":{"message":"This model is only available on agentic harnesses"}}'),
    );

    const result = await brain.complete('Describe the forbidden model case', {
      routingSessionId: 'mission-403-model:planner',
    });

    expect(result.content).toBe('mocked response');
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-expensive');
  });

  it('does not open the provider circuit for model-scoped errors', async () => {
    const previousThreshold = process.env.BRAIN_CIRCUIT_THRESHOLD;
    process.env.BRAIN_CIRCUIT_THRESHOLD = '1';
    mockProviderInstance.modelFailures.set(
      'mock-model',
      new Error('[mock] completion failed: 403 {"error":{"message":"This model is only available on agentic harnesses"}}'),
    );

    try {
      const thresholdBrain = new BrainService();
      const result = await thresholdBrain.complete('Describe the model-scoped circuit case', {
        routingSessionId: 'mission-model-scoped-circuit',
      });

      expect(result.content).toBe('mocked response');
      expect(mockProviderInstance.lastRequest?.model).toBe('mock-expensive');
      expect(thresholdBrain.getCircuitBreakerStats().find((stat) => stat.provider === 'mock')).toMatchObject({
        state: 'closed',
        failures: 0,
      });
    } finally {
      if (previousThreshold === undefined) delete process.env.BRAIN_CIRCUIT_THRESHOLD;
      else process.env.BRAIN_CIRCUIT_THRESHOLD = previousThreshold;
    }
  });

  it('keeps the provider usable when a model is forbidden for the account', async () => {
    mockProviderInstance.modelFailures.set(
      'mock-model',
      new Error('[mock] completion failed: 403 {"error":{"message":"Your API key does not have access to this model"}}'),
    );

    const result = await brain.complete('Describe the account scoped model case', {
      routingSessionId: 'mission-403-account:planner',
    });

    expect(result.content).toBe('mocked response');
    expect(mockProviderInstance.lastRequest?.model).toBe('mock-expensive');
  });

  it('stops using a provider when the account itself is forbidden', async () => {
    // A 403 that names neither a model nor an endpoint denies the account,
    // so the provider is taken out of rotation instead of one model.
    mockProviderInstance.failure = new Error(
      '[mock] completion failed: 403 {"error":{"message":"Your organization is not allowed to use this provider"}}',
    );

    const options = { missionId: 'mission-403-provider', routingSessionId: 'mission-403-provider:planner' };
    await expect(brain.complete('Describe the forbidden provider case', options)).rejects.toBeDefined();

    const stats = brain.getCircuitBreakerStats();
    expect(stats.find((s) => s.provider === 'mock')?.state).toBe('open');

    await expect(brain.complete('Retry while the provider circuit is open', options)).rejects.toMatchObject({
      details: {
        code: BRAIN_MODEL_SELECTION_RETRY,
        remainingModelCount: 1,
      },
    });
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

    const persistedMetrics: Record<string, Record<string, unknown>> = {};
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return { ok: true, json: async () => ({ data: { freeModelsOnly: false } }) } as Response;
      }
      if (url.endsWith('/api/artifacts/brain/performance-metrics')) {
        if (method === 'PUT') {
          const metric = JSON.parse(String(init?.body)) as { model: string; provider: string } & Record<string, unknown>;
          persistedMetrics[`${metric.provider}:${metric.model}`] = metric;
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ metrics: Object.values(persistedMetrics) }) } as Response;
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
      expect.stringContaining('/api/artifacts/brain/performance-metrics'),
      expect.objectContaining({ method: 'PUT' }),
      );

      const reloadedBrain = new BrainService();
      const laterResult = await reloadedBrain.complete('chat response after reload');
      expect(laterResult.model).toBe('measured-model');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/artifacts/brain/performance-metrics'),
        { method: 'GET' },
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('excludes a complained model from its routing session so the next turn tries another model', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.endsWith('/api/artifacts/documents/llm-config')) {
        return { ok: true, json: async () => ({ data: { freeModelsOnly: false } }) } as Response;
      }
      if (url.endsWith('/api/artifacts/brain/performance-metrics')) {
        if (method === 'PUT') {
          return { ok: true, status: 204, json: async () => ({}) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ metrics: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    try {
      const options = { missionId: 'mission-complaint', routingSessionId: 'mission-complaint:planner' };

      const first = await brain.complete('Help me with a chat response', options);
      expect(mockProviderInstance.lastRequest?.model).toBe('mock-model');

      expect(await brain.recordComplaint(first.requestId)).toBe(true);

      await brain.complete('Continue the chat response', options);
      expect(mockProviderInstance.lastRequest?.model).not.toBe('mock-model');
      expect(mockProviderInstance.lastRequest?.model).toBe('mock-expensive');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('reports a retryable routing error while eligible models remain', async () => {
    const previousDeadline = process.env.BRAIN_COMPLETION_DEADLINE_MS;
    const previousAttemptTimeout = process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS;
    process.env.BRAIN_COMPLETION_DEADLINE_MS = '1';
    process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = '1';

    try {
      await expect(brain.complete('Help me with a chat response', {
        missionId: 'mission-deadline',
        routingSessionId: 'mission-deadline:planner',
      })).rejects.toMatchObject({
        statusCode: 503,
        details: {
          code: BRAIN_MODEL_SELECTION_RETRY,
          remainingModelCount: 2,
        },
      });
    } finally {
      if (previousDeadline === undefined) delete process.env.BRAIN_COMPLETION_DEADLINE_MS;
      else process.env.BRAIN_COMPLETION_DEADLINE_MS = previousDeadline;
      if (previousAttemptTimeout === undefined) delete process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS;
      else process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS = previousAttemptTimeout;
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
