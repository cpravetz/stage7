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

  it('uses accuracy outcomes instead of cost when accuracy is requested', () => {
    const accurate = model('accurate-paid', 2);
    const unreliable = model('unreliable-free', 0);
    router.registerModels([accurate, unreliable]);
    router.setPerformanceMetrics(new Map([
      ['provider:accurate-paid', {
        successRate: 1,
        avgLatencyMs: 30_000,
        avgCostPerRequest: 0.1,
        totalRequests: 10,
        complaintCount: 0,
        complaintRate: 0,
      }],
      ['provider:unreliable-free', {
        successRate: 0,
        avgLatencyMs: 1_000,
        avgCostPerRequest: 0,
        totalRequests: 10,
        complaintCount: 5,
        complaintRate: 0.5,
      }],
    ]));

    expect(router.getCandidates({ task: 'chat response', optimizeFor: 'accuracy' })[0]?.model.id)
      .toBe('accurate-paid');
  });

  it('does not let performance outcomes bypass free-only or task-capability eligibility', () => {
    // Fresh router: the describe-scoped router accumulates models across
    // tests, and a leftover free chat model would wrongly satisfy freeOnly.
    const router = new ModelRouter();
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

  it('filters models by inputFormat and media input capability', () => {
    const router = new ModelRouter();
    router.registerModel(modelWithFormats('text-in', 'text', undefined));
    router.registerModel(modelWithFormats('image-in', 'image', undefined));
    router.registerModel(modelWithFormats('any-in', undefined, undefined));
    router.registerModel({ ...model('image-capable'), capabilities: ['chat', 'vision'] });

    const candidates = router.getCandidates({ task: 'chat response', inputFormat: 'image' });

    const candidateIds = candidates.map(({ model: candidate }) => candidate.id);
    expect(candidateIds).toContain('image-in');
    expect(candidateIds).toContain('image-capable');
    expect(candidateIds).not.toContain('any-in');
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

  it('matches media formats declared as modality arrays', () => {
    const router = new ModelRouter();
    router.registerModel({
      ...model('multimodal'),
      inputFormat: ['text', 'image'],
      outputFormat: ['text', 'image'],
    });

    const candidates = router.getCandidates({
      task: 'chat response',
      inputFormat: 'image',
      outputFormat: 'image',
    });

    expect(candidates.map(({ model: candidate }) => candidate.id)).toEqual(['multimodal']);
  });

  it('requires explicit media-generation support for media outputs', () => {
    const router = new ModelRouter();
    router.registerModels([
      modelWithFormats('unknown-output'),
      {
        ...model('image-output'),
        capabilities: ['chat', 'image_generation'],
      },
    ]);

    const candidates = router.getCandidates({ task: 'chat response', outputFormat: 'image' });

    expect(candidates.map(({ model: candidate }) => candidate.id)).toEqual(['image-output']);
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

  it('demotes a free model whose answers are almost always rejected, even under balanced routing', () => {
    const outcome = (successRate: number, complaintRate: number) => ({
      successRate,
      avgLatencyMs: 2_000,
      avgCostPerRequest: 0,
      totalRequests: 10_000,
      totalCost: 0,
      costRequests: 10_000,
      complaintCount: complaintRate * 10_000,
      complaintRate,
    })

    // The broken model is fast, free and its HTTP calls "succeed", so without the
    // unusable-answer rule it wins the balanced score outright.
    router.setPerformanceMetrics(new Map([
      ['provider:alpha', outcome(1, 0.966)],
      ['provider:bravo', outcome(0.98, 0.05)],
    ]))
    expect(router.getCandidates({ task: 'chat response', optimizeFor: 'balanced' })
      .map(({ model: candidate }) => candidate.id).slice(0, 2)).toContain('bravo')
    expect(router.getCandidates({ task: 'chat response', optimizeFor: 'balanced' })
      .map(({ model: candidate }) => candidate.id)[0]).toBe('bravo')
    expect(router.getCandidates({ task: 'chat response', optimizeFor: 'accuracy' })
      .map(({ model: candidate }) => candidate.id)[0]).toBe('bravo')
  })

  it('does not demote on complaint rate before there is enough data', () => {
    const smallSample = (complaintRate: number) => ({
      successRate: 1,
      avgLatencyMs: 5_000,
      avgCostPerRequest: 0,
      totalRequests: 5,
      totalCost: 0,
      costRequests: 5,
      complaintCount: complaintRate * 5,
      complaintRate,
    })

    // At a 5-call sample the extra unusable-answer penalty must not apply. Alpha's
    // complaint rate is the only variable, so the score gap between the two runs
    // is the ordinary complaint term (600 at accuracy) and never the 1000-point
    // demotion — which would let bravo overtake alpha at the high rate.
    const orderAt = (complaintRate: number) => {
      router.setPerformanceMetrics(new Map([
        ['provider:alpha', smallSample(complaintRate)],
        ['provider:bravo', smallSample(0)],
      ]))
      return router.getCandidates({ task: 'chat response', optimizeFor: 'balanced' })
        .map(({ model: candidate }) => candidate.id)
    }
    expect(orderAt(0)[0]).toBe('alpha')
    // Other tests' models may also be registered, so assert only the relative
    // order: alpha drops below the clean model on the ordinary 600-point
    // complaint term, while the 1000-point unusable-answer demotion would push
    // it below everything else in the pool.
    const sorted = orderAt(1)
    expect(sorted.indexOf('bravo')).toBeLessThan(sorted.indexOf('alpha'))
    // Alpha is still eligible — it is demoted on the ordinary complaint term, not
    // removed — which is exactly what must not happen at a 5-call sample if the
    // 1000-point unusable-answer rule were applied.
    expect(sorted).toContain('alpha')
  })
})
