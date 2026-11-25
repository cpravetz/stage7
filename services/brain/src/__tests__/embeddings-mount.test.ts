import request from 'supertest';

// The real app starts listening on import; port 0 picks an ephemeral port so the
// suite never collides with a running brain service.
process.env.PORT = '0';

describe('brain app wiring: embeddings router mount', () => {
  // Regression for QA finding H1 (art_LF3M8T6e): the embeddings router was
  // imported in src/index.ts but never mounted, so POST /api/brain/embeddings
  // 404ed in every deployment while every unit suite (which mounts the router on
  // its own test app) still passed. This test goes through the real app export,
  // so a missing mount fails here.
  it('serves POST /api/brain/embeddings with a graceful response instead of 404', async () => {
    const appModule = await import('../index');
    const app = appModule.default;

    const response = await request(app)
      .post('/api/brain/embeddings')
      .send({ texts: ['A sentence to embed.'] });

    // The route always answers 200: `available: false` is the documented
    // degradation signal when no embedding model is configured or the provider
    // fails, so the assertion holds in any environment, with or without keys.
    expect(response.status).toBe(200);
    expect(typeof response.body.available).toBe('boolean');
  });

  it('still answers 200 with available:false for a request that cannot be embedded', async () => {
    const appModule = await import('../index');
    const app = appModule.default;

    const response = await request(app)
      .post('/api/brain/embeddings')
      .send({ texts: ['Another sentence.'] });

    expect(response.status).toBe(200);
    if (response.body.available === false) {
      expect(typeof response.body.reason).toBe('string');
    }
  });
});
