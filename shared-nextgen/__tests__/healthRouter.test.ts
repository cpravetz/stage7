import request from 'supertest';
import express from 'express';
import { healthRouter } from '../src/middleware/healthRouter';

describe('healthRouter', () => {
  const appWith = (options: Parameters<typeof healthRouter>[0]) => {
    const app = express();
    app.use('/api/svc', healthRouter(options));
    // Mirror the services' terminal error middleware for rethrown errors.
    app.use((err: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
    return app;
  };

  it('returns the bare contract when no check is given', async () => {
    const res = await request(appWith({ service: 'gateway' })).get('/api/svc/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'gateway' });
  });

  it('merges fields after status and service', async () => {
    const res = await request(appWith({
      service: 'agent-runtime',
      check: { fields: () => ({ agents: 3 }) },
    })).get('/api/svc/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'agent-runtime', agents: 3 });
  });

  it('awaits async fields', async () => {
    const res = await request(appWith({
      service: 'brain',
      check: { fields: async () => ({ providers: ['echo'], models: 1 }) },
    })).get('/api/svc/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'brain', providers: ['echo'], models: 1 });
  });

  it('responds 503 with a degraded status from check.status', async () => {
    const res = await request(appWith({
      service: 'artifacts',
      check: {
        fields: () => ({ durable: false }),
        status: () => 'degraded',
      },
    })).get('/api/svc/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', service: 'artifacts', durable: false });
  });

  it('propagates a thrown fields error to the error middleware', async () => {
    const res = await request(appWith({
      service: 'artifacts',
      check: {
        fields: () => { throw new Error('Mongo unavailable'); },
      },
    })).get('/api/svc/health');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Mongo unavailable');
  });

  it('does not handle non-health paths', async () => {
    const app = appWith({ service: 'worker-pool' });
    const res = await request(app).get('/api/svc/other');
    expect(res.status).toBe(404);
  });
});
