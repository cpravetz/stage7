import { WorkflowInput, WorkflowResult, WorkflowState, ActivityResult } from '../types/workflow';
import request from 'supertest';
import express from 'express';
import missionsRoutes from '../routes/missions';
import { TemporalClient } from '../client/TemporalClient';

jest.mock('../client/TemporalClient', () => {
  const mocks = {
    startMission: jest.fn(),
    getMissionResult: jest.fn(),
    terminateMission: jest.fn(),
    listMissions: jest.fn(),
  };
  return {
    TemporalClient: jest.fn().mockImplementation(() => mocks),
    ...mocks,
  };
});

describe('Temporal Routes', () => {
  let app: express.Application;
  let startMission: jest.Mock;
  let getMissionResult: jest.Mock;
  let listMissions: jest.Mock;

  beforeEach(() => {
    const temporalMocks = require('../client/TemporalClient') as any;
    startMission = temporalMocks.startMission;
    getMissionResult = temporalMocks.getMissionResult;
    listMissions = temporalMocks.listMissions;

    app = express();
    app.use(express.json());
    app.use('/api/temporal', missionsRoutes);
  });

  it('should start a mission', async () => {
    startMission.mockResolvedValue('wf-1' as any);
    const res = await request(app)
      .post('/api/temporal/missions')
      .send({ missionId: 'm1', prompt: 'test', tenantId: 't1', assistantId: 'a1', contextChunks: [], metadata: {} });
    expect(res.status).toBe(202);
    expect(res.body.workflowId).toBe('wf-1');
    expect(res.body.status).toBe('started');
  });

  it('should list missions', async () => {
    listMissions.mockResolvedValue([
      { workflowId: 'wf-1', status: 'completed', missionId: 'm1' },
    ]);
    const res = await request(app).get('/api/temporal/missions');
    expect(res.status).toBe(200);
    expect(res.body.missions).toHaveLength(1);
    expect(res.body.missions[0].workflowId).toBe('wf-1');
  });

  it('should get mission result', async () => {
    getMissionResult.mockResolvedValue({
      missionId: 'm1',
      status: 'completed',
      output: { text: 'done' },
      startedAt: Date.now(),
      completedAt: Date.now(),
    } as any);
    const res = await request(app).get('/api/temporal/missions/wf-1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('should return 404 for missing mission', async () => {
    getMissionResult.mockResolvedValue(null);
    const res = await request(app).get('/api/temporal/missions/wf-missing');
    expect(res.status).toBe(404);
  });
});

describe('Workflow Types', () => {
  it('should define WorkflowInput structure', () => {
    const input: WorkflowInput = {
      missionId: 'mission-1',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Hello',
      metadata: {},
    };

    expect(input.missionId).toBe('mission-1');
    expect(input.tenantId).toBe('tenant-1');
    expect(input.assistantId).toBe('assistant-1');
  });

  it('should define WorkflowResult structure', () => {
    const result: WorkflowResult = {
      missionId: 'mission-1',
      status: 'completed',
      output: { text: 'done' },
      startedAt: Date.now(),
      completedAt: Date.now(),
    };

    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ text: 'done' });
  });

  it('should define WorkflowState structure', () => {
    const state: WorkflowState = {
      missionId: 'mission-1',
      currentStep: 0,
      totalSteps: 1,
      history: [],
    };

    expect(state.currentStep).toBe(0);
    expect(state.history).toHaveLength(0);
  });

  it('should define ActivityResult structure', () => {
    const success: ActivityResult = {
      success: true,
      data: { message: 'ok' },
    };

    const failure: ActivityResult = {
      success: false,
      error: 'Something went wrong',
    };

    expect(success.success).toBe(true);
    expect(failure.success).toBe(false);
    expect(failure.error).toBe('Something went wrong');
  });
});
