import { ModelDefinition, ModelRouter } from '../src/services/ModelRouter';

const model = (id: string, costPer1kTokens = 0.1): ModelDefinition => ({
  id,
  provider: 'provider',
  costPer1kTokens,
  maxTokens: 4096,
  capabilities: ['chat'],
});

const modelWithFormats = (
  id: string,
  inputFormat?: string,
  outputFormat?: string,
  costPer1kTokens = 0.1,
): ModelDefinition => ({
  id,
  provider: 'provider',
  costPer1kTokens,
  maxTokens: 4096,
  capabilities: ['chat'],
  inputFormat,
  outputFormat,
});

describe('ModelRouter performance outcomes', () => {
  const router = new ModelRouter();
  const alpha = model('alpha');
  const bravo = model('bravo');

  beforeEach(() => {
    router.registerModels([alpha, bravo]);
    router.setPerformanceMetrics(new Map());
  });

  it.each([
    ['success rate', { successRate: 0, avgLatencyMs: 0, avgCostPerRequest: 0, totalCost: 0, costRequests: 1 }],
    ['latency', { successRate: 0.5, avgLatencyMs: 10000, avgCostPerRequest: 0, totalCost: 0, costRequests: 1 }],
    ['cost', { successRate: 0.5, avgLatencyMs: 0, avgCostPerRequest: 1, totalCost: 1, costRequests: 1 }],
  ])('uses measured %s to change candidate order', (_metric, alphaOutcome) => {
    const baseline = router.getCandidates({ task: 'chat response' }).map(({ model: candidate }) => candidate.id);
    expect(baseline).toEqual(['alpha', 'bravo']);

    router.setPerformanceMetrics(new Map([
      ['provider:alpha', { ...alphaOutcome, totalRequests: 1 }],
      ['provider:bravo', {
        successRate: 0.5,
        avgLatencyMs: 0,
        avgCostPerRequest: 0,
        totalCost: 0,
        costRequests: 1,
        totalRequests: 1,
      }],
    ]));

    const measured = router.getCandidates({ task: 'chat response' }).map(({ model: candidate }) => candidate.id);
    expect(measured[0]).toBe('bravo');
  });

  it('weighs response time alongside quality complaints', () => {
    const outcome = (avgLatencyMs: number, complaintRate: number) => ({
      successRate: 0.5,
      avgLatencyMs,
      avgCostPerRequest: 0,
      totalRequests: 20,
      totalCost: 0,
      costRequests: 20,
      complaintCount: complaintRate * 20,
      complaintRate,
    });

    router.setPerformanceMetrics(new Map([
      ['provider:alpha', outcome(5_000, 0.05)],
      ['provider:bravo', outcome(60_000, 0)],
    ]));
    expect(router.getCandidates({ task: 'chat response' })[0]?.model.id).toBe('alpha');

    router.setPerformanceMetrics(new Map([
      ['provider:alpha', outcome(5_000, 0.3)],
      ['provider:bravo', outcome(60_000, 0)],
    ]));
    expect(router.getCandidates({ task: 'chat response' })[0]?.model.id).toBe('bravo');
  });

  it('does not let performance outcomes bypass free-only or task-capability eligibility', () => {
    router.registerModel(model('paid-best', 0.1));
    router.registerModel({ ...model('free-code', 0), capabilities: ['code'] });
    router.setPerformanceMetrics(new Map([
      ['provider:paid-best', {
        successRate: 1,
        avgLatencyMs: 0,
        avgCostPerRequest: 0,
        totalCost: 0,
        costRequests: 1,
        totalRequests: 1,
      }],
    ]));

    const freeCandidates = router.getCandidates({ task: 'chat response', freeOnly: true });
    expect(freeCandidates.map(({ model: candidate }) => candidate.id)).toEqual([]);
    const codeCandidates = router.getCandidates({ task: 'implement code', freeOnly: true });
    expect(codeCandidates.map(({ model: candidate }) => candidate.id)).toEqual(['free-code']);
  });

  it('does not infer a code requirement from "script" inside "description"', () => {
    router.registerModels([
      { ...model('general-reasoner'), capabilities: ['chat', 'reasoning'] },
      { ...model('code-reasoner'), capabilities: ['chat', 'code', 'reasoning'] },
    ]);

    const candidates = router.getCandidates({
      task: 'Plan the arithmetic task. Description: Calculate 128 * 37.',
    });

    expect(candidates.map(({ model: candidate }) => candidate.id)).toContain('general-reasoner');
  });

  it('routes generic find requests when no model advertises native search', () => {
    const searchlessRouter = new ModelRouter();
    searchlessRouter.registerModel(model('general-chat'));

    const candidates = searchlessRouter.getCandidates({
      task: 'Find the absolute difference between 1147 and 1189.',
    });

    expect(candidates.map(({ model: candidate }) => candidate.id)).toEqual(['general-chat']);
  });

  it('filters models by inputFormat', () => {
    const router = new ModelRouter();
    router.registerModel(modelWithFormats('text-in', 'text', undefined));
    router.registerModel(modelWithFormats('image-in', 'image', undefined));
    router.registerModel(modelWithFormats('any-in', undefined, undefined));

    const candidates = router.getCandidates({ task: 'chat response', inputFormat: 'image' });

    const candidateIds = candidates.map(({ model: candidate }) => candidate.id);
    expect(candidateIds).toContain('image-in');
    expect(candidateIds).toContain('any-in');
    expect(candidateIds).not.toContain('text-in');
  });

  it('filters models by outputFormat', () => {
    const router = new ModelRouter();
    router.registerModel(modelWithFormats('text-out', undefined, 'text'));
    router.registerModel(modelWithFormats('format-out', undefined, 'code'));
    router.registerModel(modelWithFormats('any-out', undefined, undefined));

    const candidates = router.getCandidates({ task: 'chat response', outputFormat: 'code' });

    const candidateIds = candidates.map(({ model: candidate }) => candidate.id);
    expect(candidateIds).toContain('format-out');
    expect(candidateIds).toContain('any-out');
    expect(candidateIds).not.toContain('text-out');
  });

  it('filters models by both inputFormat and outputFormat', () => {
    const router = new ModelRouter();
    router.registerModel(modelWithFormats('img-to-text', 'image', 'text'));
    router.registerModel(modelWithFormats('img-to-code', 'image', 'code'));
    router.registerModel(modelWithFormats('text-to-text', 'text', 'text'));

    const candidates = router.getCandidates({
      task: 'chat response',
      inputFormat: 'image',
      outputFormat: 'code',
    });

    const candidateIds = candidates.map(({ model: candidate }) => candidate.id);
    expect(candidateIds).toContain('img-to-code');
    expect(candidateIds).not.toContain('img-to-text');
    expect(candidateIds).not.toContain('text-to-text');
  });

  it('does not exclude models that do not declare formats when none requested', () => {
    const router = new ModelRouter();
    router.registerModel(modelWithFormats('declared', 'text', 'text'));
    router.registerModel(modelWithFormats('undeclared', undefined, undefined));

    const candidates = router.getCandidates({ task: 'chat response' });

    const candidateIds = candidates.map(({ model: candidate }) => candidate.id);
    expect(candidateIds).toContain('declared');
    expect(candidateIds).toContain('undeclared');
  });

  it('excludes models that declare a different format than requested', () => {
    const router = new ModelRouter();
    router.registerModel(modelWithFormats('text-model', 'text', 'text'));
    router.registerModel(modelWithFormats('image-model', 'image', 'image'));

    const candidates = router.getCandidates({ task: 'chat response', inputFormat: 'image' });

    const candidateIds = candidates.map(({ model: candidate }) => candidate.id);
    expect(candidateIds).toContain('image-model');
    expect(candidateIds).not.toContain('text-model');
  });
});
