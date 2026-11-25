import request from 'supertest';
import express from 'express';
import temporalRoutes from '../../services/temporal/src/routes/missions';
import { MissionClient } from '../../services/temporal/src/client/MissionClient';

jest.mock('../../services/temporal/src/client/MissionClient', () => {
  const mocks = {
    startMission: jest.fn(),
    getMissionResult: jest.fn(),
    terminateMission: jest.fn(),
  };
  return {
    MissionClient: jest.fn().mockImplementation(() => mocks),
    ...mocks,
  };
});

describe('Integration: Temporal Mission Lifecycle', () => {
  let app: express.Application;
  let startMission: jest.Mock;
  let getMissionResult: jest.Mock;

  beforeEach(() => {
    const temporalMocks = require('../../services/temporal/src/client/MissionClient') as any;
    startMission = temporalMocks.startMission;
    getMissionResult = temporalMocks.getMissionResult;

    app = express();
    app.use(express.json());
    app.use('/api/temporal', temporalRoutes);
  });

  describe('Mission lifecycle', () => {
    it('should start mission via Temporal and retrieve result', async () => {
      startMission.mockResolvedValue('wf-123' as any);
      getMissionResult.mockResolvedValue({
        missionId: 'mission-1',
        status: 'completed',
        output: { text: 'done' },
        startedAt: Date.now(),
        completedAt: Date.now(),
      } as any);

      const startRes = await request(app)
        .post('/api/temporal/missions')
        .send({
          missionId: 'mission-1',
          prompt: 'Test mission',
          tenantId: 'tenant-1',
          assistantId: 'asst-1',
          contextChunks: [],
          metadata: {},
        });

      expect(startRes.status).toBe(202);
      expect(startRes.body.workflowId).toBe('wf-123');
      expect(startRes.body.status).toBe('started');

      const resultRes = await request(app).get('/api/temporal/missions/wf-123');
      expect(resultRes.status).toBe(200);
      expect(resultRes.body.status).toBe('completed');
    });
  });
});
