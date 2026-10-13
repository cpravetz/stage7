import { ModelDefinition, ModelRouter } from '../services/ModelRouter';

const model = (id: string, costPer1kTokens = 0.1): ModelDefinition => ({
  id,
  provider: 'provider',
  costPer1kTokens,
  maxTokens: 4096,
  capabilities: ['chat'],
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
});
