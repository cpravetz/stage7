import { Tool } from '../src/types';
import { ReasoningExecutor } from '../src/executors/ReasoningExecutor';

describe('ReasoningExecutor quality feedback', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reports validated source-output issues to Brain with the original request ID', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url, body });
      if (url.endsWith('/api/brain/complaint')) {
        return {
          ok: true,
          json: async () => ({ recorded: true }),
          text: async () => '',
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          content: JSON.stringify({
            valid: false,
            issues: ['Question 2 has no correct option.'],
          }),
          requestId: 'brain-review-request',
          model: 'review-model',
          provider: 'review-provider',
        }),
        text: async () => '',
      } as Response;
    };
    global.fetch = jest.fn(fetchMock);

    const tool: Tool = {
      id: 'assessment-review',
      name: 'Assessment Review',
      description: 'Verify an assessment',
      type: 'reasoning',
      manifest: {},
      outputSchema: { type: 'object', properties: { valid: { type: 'boolean' } } },
      reasoningConfig: {
        outputFormat: 'json',
        optimizeFor: 'accuracy',
        privateInputFields: ['sourceRequestId'],
        qualityFeedback: {
          sourceRequestIdField: 'sourceRequestId',
          validField: 'valid',
          issuesField: 'issues',
          preValidationIssuesField: 'validationIssues',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await new ReasoningExecutor().execute(tool, {
      assessment: { questions: [] },
      sourceRequestId: 'brain-generation-request',
      validationIssues: ['Question 1 numbering was not contiguous.'],
      routingSessionId: 'assessment-run-1',
    });

    expect(result.valid).toBe(false);
    expect(result._requestId).toBe('brain-review-request');
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body.options).toMatchObject({ routingSessionId: 'assessment-run-1', optimizeFor: 'accuracy' });
    expect(String(requests[0]?.body.prompt)).not.toContain('brain-generation-request');
    expect(requests[1]?.url).toContain('/api/brain/complaint');
    expect(requests[1]?.body).toMatchObject({
      requestId: 'brain-generation-request',
      reason: expect.stringContaining('Question 2 has no correct option.'),
    });
    expect(requests[1]?.body.reason).toContain('Question 1 numbering was not contiguous.');
  });

  it('reports caller-detected invalid output without spending another Brain completion', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return {
        ok: true,
        json: async () => ({ recorded: true }),
        text: async () => '',
      } as Response;
    };
    global.fetch = jest.fn(fetchMock);

    const tool: Tool = {
      id: 'assessment-review',
      name: 'Assessment Review',
      description: 'Verify an assessment',
      type: 'reasoning',
      manifest: {},
      reasoningConfig: {
        qualityFeedback: {
          sourceRequestIdField: 'sourceRequestId',
          validField: 'valid',
          issuesField: 'issues',
          preValidationIssuesField: 'validationIssues',
          shortCircuitOnPreValidationIssues: true,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await new ReasoningExecutor().execute(tool, {
      sourceRequestId: 'brain-generation-request',
      validationIssues: ['Question 1 points must be positive.'],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(['Question 1 points must be positive.']);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toMatch(/\/api\/brain\/complaint$/);
    expect(requests[0]?.body).toMatchObject({
      requestId: 'brain-generation-request',
      reason: expect.stringContaining('Question 1 points must be positive.'),
    });
  });
});
