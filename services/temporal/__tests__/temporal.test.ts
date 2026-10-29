import { WorkflowInput, WorkflowResult, WorkflowState, ActivityResult } from '../src/types/workflow';
import request from 'supertest';
import express from 'express';
import missionsRoutes from '../src/routes/missions';
import { TemporalClient } from '../src/client/TemporalClient';

jest.mock('../src/client/TemporalClient', () => {
  const mocks = {
    startMission: jest.fn(),
    getMissionResult: jest.fn(),
    terminateMission: jest.fn(),
    listMissions: jest.fn(),
    isConnected: jest.fn(),
  };
  return {
    TemporalClient: jest.fn().mockImplementation(() => mocks),
    ...mocks,
  };
});

jest.mock('../src/schedules/missionScheduler', () => ({
  createMissionSchedule: jest.fn(),
  disableMissionSchedule: jest.fn(),
  listMissionSchedules: jest.fn(),
  recordScheduleMission: jest.fn(),
  stopMissionSchedule: jest.fn(),
}));

describe('Temporal Routes', () => {
  let app: express.Application;
  let startMission: jest.Mock;
  let getMissionResult: jest.Mock;
  let listMissions: jest.Mock;
  let isConnected: jest.Mock;
  let createMissionSchedule: jest.Mock;
  let recordScheduleMission: jest.Mock;
  let listMissionSchedules: jest.Mock;
  let stopMissionSchedule: jest.Mock;

  beforeEach(() => {
    const temporalMocks = require('../src/client/TemporalClient') as any;
    startMission = temporalMocks.startMission;
    getMissionResult = temporalMocks.getMissionResult;
    listMissions = temporalMocks.listMissions;
    isConnected = temporalMocks.isConnected;
    const scheduleMocks = require('../src/schedules/missionScheduler');
    createMissionSchedule = scheduleMocks.createMissionSchedule;
    recordScheduleMission = scheduleMocks.recordScheduleMission;
    listMissionSchedules = scheduleMocks.listMissionSchedules;
    stopMissionSchedule = scheduleMocks.stopMissionSchedule;

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

  it('should translate friendly recurrence options before starting a mission', async () => {
    startMission.mockResolvedValue('wf-recurring' as any);
    createMissionSchedule.mockResolvedValue({
      scheduleId: 'schedule-1',
      nextRunAt: '2026-10-29T09:30:00.000Z',
    });
    const res = await request(app)
      .post('/api/temporal/missions')
      .send({
        missionId: 'm-recurring',
        prompt: 'Check the inbox',
        tenantId: 't1',
        recurrence: { frequency: 'weekly', time: '09:30', dayOfWeek: 1 },
      });

    expect(res.status).toBe(202);
    expect(startMission).toHaveBeenCalledWith(expect.objectContaining({
      missionId: 'm-recurring',
    }));
    expect(createMissionSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'm-recurring' }),
      { frequency: 'weekly', time: '09:30', dayOfWeek: 1 },
    );
    expect(recordScheduleMission).toHaveBeenCalledWith('schedule-1', 'm-recurring');
    expect(res.body.scheduleId).toBe('schedule-1');
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

  it('should list and stop persisted recurring schedules', async () => {
    listMissionSchedules.mockResolvedValue([
      { scheduleId: 'schedule-1', missionId: 'm1', enabled: true },
    ]);
    stopMissionSchedule.mockResolvedValue(true);

    const listed = await request(app).get('/api/temporal/missions/recurring');
    const stopped = await request(app)
      .post('/api/temporal/missions/recurring/schedule-1/stop')
      .send({});

    expect(listed.status).toBe(200);
    expect(listed.body.schedules).toHaveLength(1);
    expect(stopped.status).toBe(200);
    expect(stopMissionSchedule).toHaveBeenCalledWith('schedule-1');
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
