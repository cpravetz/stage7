import express from 'express';
import request from 'supertest';
import harnessRoutes from '../routes/harness';

const app = express();
app.use(express.json());
app.use('/api/tool-executor', harnessRoutes);

describe('harness routes', () => {
  it('lists the registered probes', async () => {
    const res = await request(app).get('/api/tool-executor/harness/probes');

    expect(res.status).toBe(200);
    expect(res.body.probes.map((probe: { id: string }) => probe.id)).toContain('harness-validity');
  });

  it('runs a registered probe', async () => {
    const res = await request(app).post('/api/tool-executor/harness/probe').send({
      probeId: 'harness-validity',
      files: { 'harness.json': JSON.stringify({ systemPrompt: 'hello' }) },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.structured).toEqual({ ok: true, findings: [] });
  });

  it('refuses a probe that is not registered', async () => {
    const res = await request(app).post('/api/tool-executor/harness/probe').send({
      probeId: 'not-a-probe',
    });

    expect(res.status).toBe(404);
  });

  it('runs the loop for an assistant that opted in', async () => {
    const res = await request(app).post('/api/tool-executor/harness/evolve').send({
      assistantId: 'assistant-1',
      tenantId: 'tenant-a',
      harness: {
        systemPrompt: 'You are a helpful assistant.',
        skills: [{ skillId: 'summarise', name: 'Summarise' }],
      },
      metadata: { learning: { enabled: true } },
      // The tiers are the platform's assertion about the assistant's skills.
      skills: [{ id: 'summarise', tier: 'advise' }],
      candidates: [
        {
          id: 'edit-1',
          kind: 'prompt',
          rationale: 'name the audience',
          probeId: 'harness-validity',
          affectedSkillIds: ['summarise'],
          patch: { systemPrompt: 'You are a helpful assistant for engineers.' },
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.harness.systemPrompt).toBe('You are a helpful assistant for engineers.');
    expect(res.body.evidence[0].ok).toBe(true);
  });

  it('does not run the loop for an assistant that did not opt in', async () => {
    const res = await request(app).post('/api/tool-executor/harness/evolve').send({
      assistantId: 'assistant-1',
      tenantId: 'tenant-a',
      harness: { systemPrompt: 'You are a helpful assistant.' },
      candidates: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);
    expect(res.body.reason).toContain('not enabled');
  });
});
