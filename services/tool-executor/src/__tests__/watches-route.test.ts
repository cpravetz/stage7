import express from 'express';
import request from 'supertest';

/**
 * Regression tests for the watch routes' Artifacts payload shape.
 *
 * The documents API merges under a top-level `data` envelope. The update route used to send the
 * watch fields flat, so every update was silently discarded while still answering 200.
 */

// The router captures ARTIFACTS_URL at module load, so it must be set before the require. A
// top-level `import` would be hoisted above this assignment and the router would see it as empty.
process.env.ARTIFACTS_URL = 'http://artifacts:4200';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const watchesRouter = require('../routes/watches').default;

let artifactsCalls: Array<{ path: string; method: string; body: any }> = [];
let putResponse: Record<string, unknown> = { id: 'watch-1', data: {} };
let postResponse: Record<string, unknown> = { id: 'watch-1', data: {} };

function mockFetch() {
  return (async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    artifactsCalls.push({
      path,
      method: (init.method as string) || 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (path.includes('/documents/') && (init.method || 'GET') === 'PUT') {
      return new Response(JSON.stringify(putResponse), { status: 200 });
    }
    if ((init.method || 'GET') === 'POST') {
      return new Response(JSON.stringify(postResponse), { status: 201 });
    }
    return new Response(JSON.stringify({ data: { enabled: true, cadence: 'daily' } }), { status: 200 });
  }) as unknown as typeof fetch;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tool-executor/watches', watchesRouter);
  return app;
}

describe('PUT /api/tool-executor/watches/:id', () => {
  beforeEach(() => {
    artifactsCalls = [];
    putResponse = { id: 'watch-1', data: { enabled: false } };

    global.fetch = mockFetch();
  });

  it('wraps the update in the data envelope the documents API merges under', async () => {
    const res = await request(makeApp())
      .put('/api/tool-executor/watches/watch-1')
      .send({ data: { enabled: false, skill: 'content-drafting-adaptation' } });

    expect(res.status).toBe(200);
    const put = artifactsCalls.find((c) => c.method === 'PUT');
    expect(put).toBeDefined();
    // The fields must live under `data`, not at the top level.
    expect(put!.body).toEqual({ data: { enabled: false, skill: 'content-drafting-adaptation' } });
  });

  it('still enforces the empty-companies rule inside the envelope', async () => {
    await request(makeApp())
      .put('/api/tool-executor/watches/watch-1')
      .send({ data: { companies: [] } });

    const put = artifactsCalls.find((c) => c.method === 'PUT');
    expect(put!.body.data.allowCompanyProbing).toBe(false);
  });

  it('answers 404 when Artifacts cannot find the watch', async () => {
    global.fetch = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;

    const res = await request(makeApp()).put('/api/tool-executor/watches/missing').send({ data: { enabled: true } });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/tool-executor/watches', () => {
  beforeEach(() => {
    artifactsCalls = [];

    global.fetch = mockFetch();
  });

  it('persists the skill the watch declares so the runner does not fall back to a default', async () => {
    await request(makeApp())
      .post('/api/tool-executor/watches')
      .send({
        ownerUserId: 'user-1',
        name: 'seo watch',
        query: 'local seo',
        skill: 'content-strategy-seo-evaluator',
        assistantId: 'content',
        cadence: 'weekly',
      });

    const post = artifactsCalls.find((c) => c.method === 'POST');
    expect(post!.body.data.skill).toBe('content-strategy-seo-evaluator');
    expect(post!.body.data.assistantId).toBe('content');
    expect(post!.body.data.cadence).toBe('weekly');
  });

  it('allows per-company probing only when companies are present', async () => {
    await request(makeApp())
      .post('/api/tool-executor/watches')
      .send({ ownerUserId: 'u', name: 'n', query: 'q', companies: [] });

    const post = artifactsCalls.find((c) => c.method === 'POST');
    expect(post!.body.data.allowCompanyProbing).toBe(false);
  });
});
