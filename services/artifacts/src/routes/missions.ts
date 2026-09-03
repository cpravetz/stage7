import { Router } from 'express';
import { ArtifactsService } from '../services/ArtifactsService';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { z } from 'zod';
import { MissionState } from '../types';

const router: Router = Router();
const service = new ArtifactsService();

const MissionStateSchema = z.object({
  missionId: z.string(),
  tenantId: z.string(),
  assistantId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'canceled']),
  currentStep: z.number(),
  totalSteps: z.number(),
  history: z.array(z.any()),
  input: z.any(),
  output: z.any().optional(),
  error: z.string().optional(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = MissionStateSchema.parse(req.body);
  await service.saveMissionState(parsed as MissionState);
  res.status(201).json(parsed);
}));

router.get('/', asyncHandler(async (_req, res) => {
  const states = await service.listMissionStates();
  res.json({ missions: states });
}));

router.get('/:missionId', asyncHandler(async (req, res) => {
  const state = await service.getMissionState(req.params.missionId as string);
  if (!state) {
    throw NextGenError.notFound('Mission not found');
  }
  res.json(state);
}));

router.put('/:missionId', asyncHandler(async (req, res) => {
  const existing = await service.getMissionState(req.params.missionId as string);
  if (!existing) {
    throw NextGenError.notFound('Mission not found');
  }
  const parsed = MissionStateSchema.partial().parse(req.body);
  const merged = { ...existing, ...parsed, updatedAt: new Date() } as MissionState;
  await service.saveMissionState(merged);
  res.json(merged);
}));

router.delete('/:missionId', asyncHandler(async (req, res) => {
  await service.deleteMissionState(req.params.missionId as string);
  res.status(204).send();
}));



// Plan, phase, task, event routes
router.get('/:missionId/plan', asyncHandler(async (req, res) => {
  const missionId = req.params.missionId as string;
  let plan = await service.getMissionPlan(missionId);
  if (!plan) {
    const state = await service.getMissionState(missionId);
    if (state?.output && typeof state.output === 'object') {
      const outputAny = state.output as Record<string, unknown>;
      if (outputAny.plan) {
        plan = outputAny.plan;
      }
    }
  }
  if (!plan) throw NextGenError.notFound('Plan not found');
  res.json(plan);
}));

router.put('/:missionId/plan', asyncHandler(async (req, res) => {
  const plan = await service.saveMissionPlan(req.params.missionId as string, req.body);
  res.json(plan);
}));

router.get('/:missionId/phases/:phaseId', asyncHandler(async (req, res) => {
  const phase = await service.getMissionPhase(req.params.missionId as string, req.params.phaseId as string);
  if (!phase) throw NextGenError.notFound('Phase not found');
  res.json(phase);
}));

router.put('/:missionId/phases/:phaseId', asyncHandler(async (req, res) => {
  const phase = await service.updateMissionPhase(req.params.missionId as string, req.params.phaseId as string, req.body);
  res.json(phase);
}));

router.get('/:missionId/tasks/:taskId', asyncHandler(async (req, res) => {
  const task = await service.getMissionTask(req.params.missionId as string, req.params.taskId as string);
  if (!task) throw NextGenError.notFound('Task not found');
  res.json(task);
}));

router.put('/:missionId/tasks/:taskId', asyncHandler(async (req, res) => {
  const task = await service.updateMissionTask(req.params.missionId as string, req.params.taskId as string, req.body);
  res.json(task);
}));

router.get('/:missionId/events', asyncHandler(async (req, res) => {
  const missionId = req.params.missionId as string;
  let events = await service.listMissionEvents(missionId);
  if (events.length === 0) {
    const state = await service.getMissionState(missionId);
    events = deriveEventsFromMissionState(state);
  }
  res.json({ events });
}));

router.get('/:missionId/artifacts', asyncHandler(async (req, res) => {
  const missionId = req.params.missionId as string;
  let plan = await service.getMissionPlan(missionId);
  if (!plan) {
    const state = await service.getMissionState(missionId);
    if (state?.output && typeof state.output === 'object') {
      const outputAny = state.output as Record<string, unknown>;
      if (outputAny.plan) plan = outputAny.plan;
    }
  }

  const state = await service.getMissionState(missionId);
  const artifacts: Array<Record<string, unknown>> = [];

  if (plan) {
    const phases = (plan as { phases?: Array<{ id: string; tasks?: Array<{ artifacts?: unknown[] }> }> }).phases || [];
    for (const phase of phases) {
      for (const task of phase.tasks || []) {
        for (const artifact of task.artifacts || []) {
          if (artifact && typeof artifact === 'object') {
            artifacts.push({ phaseId: phase.id, ...(artifact as Record<string, unknown>) });
          } else if (typeof artifact === 'string') {
            artifacts.push({ id: artifact, name: artifact, phaseId: phase.id });
          }
        }
      }
    }
  }

  const outputAny = state?.output as Record<string, unknown> | undefined;
  if (outputAny?.outputs && typeof outputAny.outputs === 'object') {
    const phases = (outputAny.outputs as { phases?: Array<{ phaseId: string; name?: string; tasks?: Array<{ taskId: string; status: string; artifacts?: unknown[] }> }> }).phases || [];
    for (const phase of phases) {
      for (const task of phase.tasks || []) {
        for (const artifact of task.artifacts || []) {
          if (artifact && typeof artifact === 'object') {
            artifacts.push({ phaseId: phase.phaseId, taskId: task.taskId, ...(artifact as Record<string, unknown>) });
          } else if (typeof artifact === 'string') {
            artifacts.push({ id: artifact, name: artifact, phaseId: phase.phaseId, taskId: task.taskId });
          }
        }
      }
    }
  }

  res.json({ artifacts });
}));

function deriveEventsFromMissionState(state: any): Array<{ type: string; timestamp: number; data: Record<string, unknown> }> {
  if (!state) return [];
  const events: Array<{ type: string; timestamp: number; data: Record<string, unknown> }> = [];
  const startedAt = state.startedAt ? new Date(state.startedAt).getTime() : Date.now();
  events.push({ type: 'mission_started', timestamp: startedAt, data: { prompt: state.input?.prompt } });
  const output = state.output;
  if (!output || typeof output !== 'object') return events;
  const phases = (output as { phases?: Array<{ phaseId: string; name?: string; status: string; tasks?: Array<{ taskId: string; status: string; output?: string }> }> }).phases || [];
  let cursor = startedAt;
  if (phases.length > 0) {
    for (const phase of phases) {
      cursor += 1000;
      events.push({ type: 'phase_started', timestamp: cursor, data: { phaseId: phase.phaseId, phaseName: phase.name } });
      for (const task of phase.tasks || []) {
        cursor += 500;
        events.push({
          type: task.status === 'failed' ? 'task_failed' : 'task_completed',
          timestamp: cursor,
          data: { phaseId: phase.phaseId, taskId: task.taskId, output: task.output },
        });
      }
      cursor += 1000;
      events.push({ type: 'phase_completed', timestamp: cursor, data: { phaseId: phase.phaseId, phaseName: phase.name } });
    }
  } else {
    const plan = (output as { plan?: { phases?: Array<{ id: string; name?: string; tasks?: Array<{ id: string; title?: string; agentRole?: string }> }> } }).plan;
    if (plan?.phases) {
      for (const phase of plan.phases) {
        cursor += 1000;
        events.push({ type: 'phase_started', timestamp: cursor, data: { phaseId: phase.id, phaseName: phase.name } });
        for (const task of phase.tasks || []) {
          cursor += 500;
          events.push({
            type: 'task_completed',
            timestamp: cursor,
            data: { phaseId: phase.id, taskId: task.id, taskTitle: task.title, agentRole: task.agentRole },
          });
        }
        cursor += 1000;
        events.push({ type: 'phase_completed', timestamp: cursor, data: { phaseId: phase.id, phaseName: phase.name } });
      }
    }
  }
  if (state.status === 'completed') {
    cursor += 1000;
    events.push({ type: 'mission_completed', timestamp: cursor, data: {} });
  } else if (state.status === 'failed') {
    cursor += 1000;
    events.push({ type: 'mission_failed', timestamp: cursor, data: { error: state.error } });
  } else if (state.status === 'canceled') {
    cursor += 1000;
    events.push({ type: 'mission_failed', timestamp: cursor, data: { error: 'Mission canceled' } });
  }
  return events;
}

router.post('/:missionId/events', asyncHandler(async (req, res) => {
  const event = await service.appendMissionEvent(req.params.missionId as string, req.body);
  res.status(201).json(event);
}));

router.post('/:missionId/phases/:phaseId/approve', asyncHandler(async (req, res) => {
  const { approvedBy } = req.body as { approvedBy?: string };
  const phase = await service.updateMissionPhase(req.params.missionId as string, req.params.phaseId as string, {
    status: 'approved',
    approvedAt: Date.now(),
    approvedBy: approvedBy || 'user',
  });
  await service.appendMissionEvent(req.params.missionId as string, {
    type: 'phase_approved',
    timestamp: Date.now(),
    data: { phaseId: req.params.phaseId, approvedBy: approvedBy || 'user' },
  });
  res.json(phase);
}));

router.post('/:missionId/phases/:phaseId/reject', asyncHandler(async (req, res) => {
  const { reason, rejectedBy } = req.body as { reason?: string; rejectedBy?: string };
  const phase = await service.updateMissionPhase(req.params.missionId as string, req.params.phaseId as string, {
    status: 'rejected',
    rejectionReason: reason,
  });
  await service.appendMissionEvent(req.params.missionId as string, {
    type: 'phase_rejected',
    timestamp: Date.now(),
    data: { phaseId: req.params.phaseId, reason, rejectedBy: rejectedBy || 'user' },
  });
  res.json(phase);
}));

export default router;
