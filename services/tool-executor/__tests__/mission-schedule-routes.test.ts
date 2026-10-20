import express from 'express';
import request from 'supertest';
import { TriggerScheduler } from '../src/services/TriggerScheduler';
import { createInMemoryTriggerRecordStore } from '../src/services/TriggerRecordStore';

describe('mission schedule routes', () => {
  let app: express.Express;

  beforeEach(() => {
    const scheduler = new TriggerScheduler({
      getTools: () => [],
      getWorkflows: () => [],
      execute: async () => {
        throw new Error('No Skill execution is expected in this route test');
      },
      store: createInMemoryTriggerRecordStore(),
      runMission: async ({ missionId }) => ({ workflowId: `mission-${missionId}` }),
    });
    jest.resetModules();
    jest.doMock('../src/utils/sharedInstance', () => ({ triggerScheduler: scheduler }));
    const routes = require('../src/routes/triggers').default;
    app = express();
    app.use(express.json());
    app.use('/api/tool-executor/triggers', routes);
  });

  afterEach(() => {
    jest.dontMock('../src/utils/sharedInstance');
    jest.resetModules();
  });

  it('creates, lists, pauses, and deletes a persisted mission schedule', async () => {
    const created = await request(app).post('/api/tool-executor/triggers/missions').send({
      tenantId: 'tenant-1',
      assistantId: 'analytics',
      prompt: 'Review weekly metrics',
      cron: '0 9 * * 1',
    }).expect(201);
    const scheduleId = created.body.schedule.id as string;

    expect(scheduleId).toMatch(/^mission-schedule-/);
    await request(app)
      .get('/api/tool-executor/triggers')
      .expect(200)
      .expect((response) => {
        expect(response.body.missionSchedules).toHaveLength(1);
        expect(response.body.count).toBe(1);
      });

    await request(app)
      .patch(`/api/tool-executor/triggers/missions/${scheduleId}`)
      .send({ enabled: false })
      .expect(200)
      .expect((response) => expect(response.body.schedule.enabled).toBe(false));

    await request(app).delete(`/api/tool-executor/triggers/missions/${scheduleId}`).expect(204);
    await request(app).get('/api/tool-executor/triggers/missions').expect(200, {
      schedules: [],
      issues: [],
      count: 0,
    });
  });

  it('rejects an invalid cron expression before persisting it', async () => {
    await request(app).post('/api/tool-executor/triggers/missions').send({
      tenantId: 'tenant-1',
      assistantId: 'analytics',
      prompt: 'Review weekly metrics',
      cron: 'not cron',
    }).expect(400);
  });
});
