import { Router } from 'express';
import { artifactsService as service } from '../services/ArtifactsService';
import multer from 'multer';
import Storage from '../services/Storage';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { z } from 'zod';
import { MissionState } from '../types';
import path from 'path';

const router: Router = Router();
router.use(asyncHandler(async (_req, _res, next) => {
  await service.ready();
  if (!service.isPersistenceAvailable()) {
    throw new NextGenError('Artifacts persistence is unavailable; refusing volatile storage', 503);
  }
  next();
}));

const MissionStateSchema = z.object({
  missionId: z.string(),
  tenantId: z.string(),
  assistantId: z.string(),
  status: z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'canceled', 'awaiting_review', 'incomplete']),
  controlState: z.enum(['running', 'pause_requested', 'paused', 'terminate_requested', 'terminated']).optional(),
  pendingDeletion: z.boolean().optional(),
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
  if (!parsed.tenantId) {
    throw NextGenError.badRequest('tenantId is required');
  }
  await service.saveMissionState(parsed as MissionState);
  res.status(201).json(parsed);
}));

router.get('/', asyncHandler(async (req, res) => {
  const tenantId = (req.query.tenantId as string) || undefined;
  const states = await service.listMissionStates(tenantId);
  res.json({ missions: states });
}));

router.get('/approvals', asyncHandler(async (_req, res) => {
  const approvals = await service.listPendingApprovals();
  res.json({ approvals });
}));

router.get('/:missionId', asyncHandler(async (req, res) => {
  const state = await service.getMissionState(req.params.missionId as string);
  if (!state) {
    throw NextGenError.notFound('Mission not found');
  }
  res.json(state);
}));

const RecoveryLeaseRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('claim'),
    ownerId: z.string().min(1).max(128),
    leaseDurationMs: z.number().int().min(10_000).max(300_000),
  }),
  z.object({
    action: z.literal('renew'),
    ownerId: z.string().min(1).max(128),
    leaseDurationMs: z.number().int().min(10_000).max(300_000),
  }),
  z.object({
    action: z.literal('release'),
    ownerId: z.string().min(1).max(128),
  }),
]);

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

router.post('/:missionId/recovery-lease', asyncHandler(async (req, res) => {
  const missionId = req.params.missionId as string;
  const request = RecoveryLeaseRequestSchema.parse(req.body);

  if (request.action === 'claim') {
    const now = new Date();
    const claimed = await service.claimMissionRecoveryLease(
      missionId,
      request.ownerId,
      new Date(now.getTime() + request.leaseDurationMs),
      now,
    );
    res.json({ claimed });
    return;
  }

  if (request.action === 'renew') {
    const renewed = await service.renewMissionRecoveryLease(
      missionId,
      request.ownerId,
      new Date(Date.now() + request.leaseDurationMs),
    );
    res.json({ renewed });
    return;
  }

  const released = await service.releaseMissionRecoveryLease(missionId, request.ownerId);
  res.json({ released });
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
  const seen = new Map<string, number>();
  const addArtifact = (
    artifact: Record<string, unknown>,
    context: {
      phaseId?: string;
      phaseName?: string;
      taskId?: string;
      taskTitle?: string;
      taskStatus?: string;
      expectedArtifacts?: string[];
      phaseStatus?: string;
      createdAt?: string;
    } = {},
  ) => {
    const name = typeof artifact.name === 'string'
      ? artifact.name
      : typeof artifact.id === 'string' ? artifact.id : 'artifact';
    const expected = context.expectedArtifacts?.some(
      (expectedName) => expectedName.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    ) || false;
    const isBlocker = typeof artifact.content === 'string'
      && /^\s*(?:\*\*)?Blocker(?:\*\*)?\s*:/i.test(artifact.content);
    const phaseId = typeof artifact.phaseId === 'string' ? artifact.phaseId : context.phaseId;
    const artifactLineageId = expected && phaseId && !isBlocker
      ? `mission:${encodeURIComponent(missionId)}:phase:${encodeURIComponent(phaseId)}:deliverable:${encodeURIComponent(name.trim().toLocaleLowerCase())}`
      : undefined;
    const legacyLineageId = `mission:${encodeURIComponent(missionId)}:${encodeURIComponent(name.trim().toLocaleLowerCase())}`;
    const needsCanonicalLineage = artifactLineageId
      && (artifact.artifactId === undefined || artifact.artifactId === legacyLineageId);
    const enriched: Record<string, unknown> = {
      ...artifact,
      ...context.phaseId && typeof artifact.phaseId !== 'string' ? { phaseId: context.phaseId } : {},
      ...context.phaseName && typeof artifact.phaseName !== 'string' ? { phaseName: context.phaseName } : {},
      ...context.taskId && typeof artifact.taskId !== 'string' ? { taskId: context.taskId } : {},
      ...context.taskTitle && typeof artifact.taskTitle !== 'string' ? { taskTitle: context.taskTitle } : {},
      ...context.taskStatus && typeof artifact.taskStatus !== 'string' ? { taskStatus: context.taskStatus } : {},
      ...context.createdAt && typeof artifact.createdAt !== 'string' ? { createdAt: context.createdAt } : {},
      ...isBlocker
        ? { purpose: 'execution-outcome' }
        : artifact.purpose === undefined
        ? {
            purpose: artifact.isDeliverable === true || expected ? 'deliverable' : 'workproduct',
          }
        : {},
      ...needsCanonicalLineage
        ? { artifactId: artifactLineageId, lineageId: artifactLineageId }
        : {},
      ...isBlocker || artifact.purpose === 'execution-outcome'
        ? {
            isDeliverable: false,
            ...isBlocker ? { status: 'blocked' } : {},
          }
        : {
            ...artifact.isDeliverable === undefined && expected && artifact.purpose !== 'workproduct'
              ? { isDeliverable: true }
              : {},
            ...artifact.status === undefined && expected
              ? {
                  status: context.phaseStatus === 'approved'
                    ? 'approved'
                    : context.phaseStatus === 'completed'
                      ? 'completed'
                    : context.phaseStatus === 'awaiting_approval' || context.phaseStatus === 'awaiting_review'
                      ? 'in_review'
                      : 'draft',
                }
              : {},
          },
    };
    if (
      enriched.visibility === 'internal'
      || name.toLocaleLowerCase() === 'system-action-receipts.json'
    ) return;
    const key = typeof enriched.id === 'string' && enriched.id
      ? JSON.stringify(['id', enriched.id, enriched.version ?? '', enriched.content ?? ''])
      : JSON.stringify([
          enriched.phaseId || '',
          enriched.taskId || '',
          name.toLocaleLowerCase(),
          enriched.version ?? '',
          enriched.versionOf ?? '',
          enriched.url ?? '',
          enriched.content ?? '',
        ]);
    const previousIndex = seen.get(key);
    if (previousIndex === undefined) {
      seen.set(key, artifacts.push(enriched) - 1);
      return;
    }
    artifacts[previousIndex] = { ...artifacts[previousIndex], ...enriched };
  };
  const addArtifactValue = (
    value: unknown,
    context: {
      phaseId?: string;
      phaseName?: string;
      taskId?: string;
      taskTitle?: string;
      taskStatus?: string;
      expectedArtifacts?: string[];
      phaseStatus?: string;
      createdAt?: string;
    } = {},
  ) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      addArtifact(value as Record<string, unknown>, context);
    } else if (typeof value === 'string') {
      addArtifact({ id: value, name: value }, context);
    }
  };

  if (plan) {
    for (const artifact of (plan as { artifacts?: unknown[] }).artifacts || []) {
      addArtifactValue(artifact);
    }
    const phases = (plan as { phases?: Array<{
      id: string;
      name?: string;
      status?: string;
      artifacts?: unknown[];
      tasks?: Array<{
        id: string;
        title?: string;
        status?: string;
        completedAt?: number | string;
        expectedArtifacts?: string[];
        artifacts?: unknown[];
      }>;
    }> }).phases || [];
    for (const phase of phases) {
      for (const artifact of phase.artifacts || []) {
        addArtifactValue(artifact, { phaseId: phase.id, phaseName: phase.name, phaseStatus: phase.status });
      }
      for (const task of phase.tasks || []) {
        const taskContext = {
          phaseId: phase.id,
          phaseName: phase.name,
          taskId: task.id,
          taskTitle: task.title,
          taskStatus: task.status,
          expectedArtifacts: task.expectedArtifacts,
          phaseStatus: phase.status,
          createdAt: isoDate(task.completedAt),
        };
        for (const artifact of task.artifacts || []) {
          addArtifactValue(artifact, taskContext);
        }

        if (!task.artifacts?.length) {
          const storedTask = await service.getMissionTask(missionId, task.id);
          for (const artifact of storedTask?.artifacts || []) {
            addArtifactValue(artifact, {
              ...taskContext,
              taskStatus: typeof storedTask?.status === 'string' ? storedTask.status : task.status,
              createdAt: isoDate(storedTask?.completedAt)
                ? isoDate(storedTask?.completedAt)
                : taskContext.createdAt,
            });
          }
        }
      }
    }
  }

  const outputAny = state?.output as Record<string, unknown> | undefined;
  if (outputAny?.outputs && typeof outputAny.outputs === 'object') {
    const phases = (outputAny.outputs as { phases?: Array<{
      phaseId: string;
      name?: string;
      status?: string;
      tasks?: Array<{ taskId: string; status: string; title?: string; completedAt?: number | string; artifacts?: unknown[] }>;
    }> }).phases || [];
    for (const phase of phases) {
      for (const task of phase.tasks || []) {
        for (const artifact of task.artifacts || []) {
          const plannedTask = (plan as { phases?: Array<{ id: string; tasks?: Array<{ id: string; expectedArtifacts?: string[] }> }> } | undefined)
            ?.phases?.find((candidate) => candidate.id === phase.phaseId)
            ?.tasks?.find((candidate) => candidate.id === task.taskId);
          const plannedPhase = (plan as { phases?: Array<{ id: string; status?: string }> } | undefined)
            ?.phases?.find((candidate) => candidate.id === phase.phaseId);
          addArtifactValue(artifact, {
            phaseId: phase.phaseId,
            phaseName: phase.name,
            taskId: task.taskId,
            taskTitle: task.title,
            taskStatus: task.status,
            phaseStatus: plannedPhase?.status || phase.status,
            createdAt: isoDate(task.completedAt),
            expectedArtifacts: plannedTask?.expectedArtifacts,
          });
        }
      }
    }
  }

  const phases = (plan as {
    phases?: Array<{ id: string; name?: string; status?: string; tasks?: Array<{ id: string; title?: string; expectedArtifacts?: string[] }> }>;
  } | undefined)?.phases || [];
  const missionEvents = await service.listMissionEvents(missionId);
  for (const event of missionEvents) {
    if (event.type !== 'task_completed' || !Array.isArray(event.data?.artifacts)) continue;
    const phaseId = typeof event.data.phaseId === 'string' ? event.data.phaseId : undefined;
    const taskId = typeof event.data.taskId === 'string' ? event.data.taskId : undefined;
    const phase = phases.find((candidate) => candidate.id === phaseId);
    const task = phase?.tasks?.find((candidate) => candidate.id === taskId);
    for (const artifact of event.data.artifacts) {
      addArtifactValue(artifact, {
        phaseId,
        phaseName: phase?.name,
        taskId,
        taskTitle: typeof event.data.taskTitle === 'string' ? event.data.taskTitle : task?.title,
        taskStatus: 'completed',
        expectedArtifacts: task?.expectedArtifacts,
        phaseStatus: phase?.status,
        createdAt: isoDate(event.timestamp),
      });
    }
  }

  const versionGroups = new Map<string, number[]>();
  artifacts.forEach((artifact, index) => {
    if (typeof artifact.artifactId !== 'string') return;
    const group = versionGroups.get(artifact.artifactId) || [];
    group.push(index);
    versionGroups.set(artifact.artifactId, group);
  });
  for (const [lineageId, indexes] of versionGroups) {
    const orderedIndexes = indexes.slice().sort((left, right) => {
      const leftCreated = typeof artifacts[left].createdAt === 'string'
        ? Date.parse(artifacts[left].createdAt as string)
        : Number.NaN;
      const rightCreated = typeof artifacts[right].createdAt === 'string'
        ? Date.parse(artifacts[right].createdAt as string)
        : Number.NaN;
      if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
      }
      return left - right;
    });
    const assignedVersions = new Set(
      indexes.map((index) => Number(artifacts[index].version)).filter((version) => Number.isFinite(version) && version > 0),
    );
    let nextVersion = 1;
    for (const index of orderedIndexes) {
      if (artifacts[index].version === undefined) {
        while (assignedVersions.has(nextVersion)) nextVersion += 1;
        artifacts[index].version = nextVersion;
        assignedVersions.add(nextVersion);
        nextVersion += 1;
      } else {
        nextVersion = Math.max(nextVersion, (Number(artifacts[index].version) || 0) + 1);
      }
      artifacts[index].isLatest = false;
    }
    const latestIndex = indexes.reduce((latest, candidate) =>
      Number(artifacts[candidate].version) > Number(artifacts[latest].version) ? candidate : latest,
    indexes[0]);
    artifacts[latestIndex].isLatest = true;
    artifacts[latestIndex].lineageId = lineageId;
  }

  res.json({ artifacts });
}));

router.get('/:missionId/artifacts/:artifactId', asyncHandler(async (req, res) => {
  const { missionId, artifactId } = req.params;
  const state = await service.getMissionState(missionId);
  // search in plan
  let found: Record<string, unknown> | undefined;
  const plan = await service.getMissionPlan(missionId);
  if (plan) {
    const phases = (plan as any).phases || [];
    for (const phase of phases) {
      for (const artifact of phase.artifacts || []) {
        if (artifact && typeof artifact === 'object' && String((artifact as any).id) === artifactId) {
          found = { phaseId: phase.id, ...(artifact as Record<string, unknown>) };
          break;
        }
      }
      if (found) break;
      for (const task of phase.tasks || []) {
        for (const artifact of task.artifacts || []) {
          if (artifact && typeof artifact === 'object' && String((artifact as any).id) === artifactId) {
            found = { phaseId: phase.id, taskId: task.id, ...(artifact as Record<string, unknown>) };
            break;
          }
        }
        if (!found) {
          const storedTask = await service.getMissionTask(missionId, task.id);
          for (const artifact of storedTask?.artifacts || []) {
            if (artifact && typeof artifact === 'object' && String((artifact as any).id) === artifactId) {
              found = { phaseId: phase.id, taskId: task.id, ...(artifact as Record<string, unknown>) };
              break;
            }
          }
        }
        if (found) break;
      }
      if (found) break;
    }
  }
  if (!found && state) {
    const outputAny = state.output as Record<string, unknown> | undefined;
    const phases = (outputAny?.outputs as any)?.phases || [];
    for (const phase of phases) {
      for (const task of phase.tasks || []) {
        for (const artifact of task.artifacts || []) {
          if (artifact && typeof artifact === 'object' && String((artifact as any).id) === artifactId) {
            found = { phaseId: phase.phaseId, taskId: task.taskId, ...(artifact as Record<string, unknown>) };
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
  }
  if (!found) throw NextGenError.notFound('Artifact not found');
  res.json({ artifact: found });
}));

// Attach an artifact to a mission (phase-level or task-level)
const upload = multer();
const MissionArtifactUploadSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  content: z.unknown().optional(),
  type: z.string().optional(),
  mediaType: z.string().optional(),
  contentEncoding: z.string().optional(),
  phaseId: z.string().optional(),
  taskId: z.string().optional(),
  purpose: z.enum(['workproduct', 'deliverable', 'execution-outcome']).optional(),
  isDeliverable: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  artifactId: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional(),
  versionOf: z.string().optional(),
  status: z.enum(['draft']).optional(),
}).passthrough();

router.post('/:missionId/artifacts', upload.single('file'), asyncHandler(async (req, res) => {
  const missionId = req.params.missionId as string;
  const {
    id,
    name,
    content,
    type,
    mediaType,
    contentEncoding,
    phaseId,
    taskId,
    purpose,
    isDeliverable,
    artifactId,
    version,
    versionOf,
    status,
  } = MissionArtifactUploadSchema.parse(req.body);

  let artifactContent: unknown = content;
  let mimeType: string | undefined = mediaType || type;
  let encoding: string | undefined = contentEncoding;
  let filename: string | undefined = name;

  if ((req as any).file) {
    const file = (req as any).file as Express.Multer.File;
    artifactContent = file.buffer.toString('base64');
    encoding = 'base64';
    mimeType = file.mimetype || mimeType;
    filename = file.originalname || filename;
    const storageFilename = path.basename(filename || 'artifact').replace(/[\\/]/g, '_');
    const key = `missions/${missionId}/${Date.now()}-${storageFilename}`;
    const uploadResult = await Storage.uploadBufferToStorage(key, file.buffer, file.mimetype);
    if (uploadResult.url) {
      const artifactRef = {
        id: id || `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: filename || 'artifact',
        type: mimeType,
        mediaType: mimeType,
        purpose,
        isDeliverable: isDeliverable === true || isDeliverable === 'true',
        artifactId,
        version,
        versionOf,
        status,
        url: uploadResult.url,
      };
      if (taskId) {
        const existing = await service.getMissionTask(missionId, taskId);
        const artifacts = Array.isArray(existing?.artifacts) ? [...(existing!.artifacts as any[]), artifactRef] : [artifactRef];
        const updated = await service.updateMissionTask(missionId, taskId, { artifacts });
        res.status(201).json({ artifact: artifactRef, task: updated });
        return;
      }
      if (phaseId) {
        const existing = await service.getMissionPhase(missionId, phaseId);
        const artifacts = Array.isArray(existing?.artifacts) ? [...(existing!.artifacts as any[]), artifactRef] : [artifactRef];
        const updated = await service.updateMissionPhase(missionId, phaseId, { artifacts });
        res.status(201).json({ artifact: artifactRef, phase: updated });
        return;
      }
      const plan = (await service.getMissionPlan(missionId)) || {};
      const metaArtifacts = Array.isArray((plan as any).artifacts) ? [...(plan as any).artifacts, artifactRef] : [artifactRef];
      await service.saveMissionPlan(missionId, { ...(plan as any), artifacts: metaArtifacts });
      res.status(201).json({ artifact: artifactRef, plan: { ...(plan as any), artifacts: metaArtifacts } });
      return;
    }
  }

  const artifact = {
    id: id || `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: filename || 'artifact',
    type: mimeType,
    mediaType: mimeType,
    content: artifactContent,
    contentEncoding: encoding,
    purpose,
    isDeliverable: isDeliverable === true || isDeliverable === 'true',
    artifactId,
    version,
    versionOf,
    status,
  } as any;

  if (taskId) {
    const existing = await service.getMissionTask(missionId, taskId);
    const artifacts = Array.isArray(existing?.artifacts) ? [...(existing!.artifacts as any[]), artifact] : [artifact];
    const updated = await service.updateMissionTask(missionId, taskId, { artifacts });
    res.status(201).json({ artifact, task: updated });
    return;
  }

  if (phaseId) {
    const existing = await service.getMissionPhase(missionId, phaseId);
    const artifacts = Array.isArray(existing?.artifacts) ? [...(existing!.artifacts as any[]), artifact] : [artifact];
    const updated = await service.updateMissionPhase(missionId, phaseId, { artifacts });
    res.status(201).json({ artifact, phase: updated });
    return;
  }

  // fallback: append as a mission-level artifact in mission plan storage
  const plan = (await service.getMissionPlan(missionId)) || {};
  const metaArtifacts = Array.isArray((plan as any).artifacts) ? [...(plan as any).artifacts, artifact] : [artifact];
  await service.saveMissionPlan(missionId, { ...(plan as any), artifacts: metaArtifacts });
  res.status(201).json({ artifact, plan: { ...(plan as any), artifacts: metaArtifacts } });
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
  } else if (state.status === 'incomplete') {
    cursor += 1000;
    events.push({ type: 'mission_incomplete', timestamp: cursor, data: { error: state.error, reason: state.output?.outputs?.status || 'Outputs did not satisfy the mission goal' } });
  } else if (state.status === 'awaiting_review') {
    cursor += 1000;
    events.push({ type: 'mission_needs_review', timestamp: cursor, data: { reason: state.output?.outputs?.reason || 'Awaiting user review' } });
  }
  return events;
}

router.post('/:missionId/events', asyncHandler(async (req, res) => {
  const event = await service.appendMissionEvent(req.params.missionId as string, req.body);
  res.status(201).json(event);
}));

router.post('/:missionId/phases/:phaseId/approve', asyncHandler(async (req, res) => {
  const missionId = req.params.missionId as string;
  const phaseId = req.params.phaseId as string;
  const { approvedBy } = req.body as { approvedBy?: string };
  const plan = await service.getMissionPlan(missionId);
  const planPhase = (plan as { phases?: Array<Record<string, any>> } | undefined)?.phases
    ?.find((candidate) => candidate.id === phaseId);
  if (!planPhase) throw NextGenError.notFound('Phase plan not found');

  const persistedPhase = await service.getMissionPhase(missionId, phaseId);
  if ((persistedPhase?.status || planPhase.status) !== 'awaiting_approval') {
    throw new NextGenError('Phase is not awaiting approval', 409, { phaseId });
  }

  const tasks = Array.isArray(planPhase.tasks) ? planPhase.tasks : [];
  if (tasks.length === 0) {
    throw new NextGenError('Cannot approve a phase without completed tasks', 409, { phaseId });
  }
  const incompleteTasks: string[] = [];
  const missingArtifactTasks: string[] = [];
  for (const task of tasks) {
    const taskId = typeof task.id === 'string' ? task.id : '';
    if (!taskId) throw NextGenError.badRequest('Phase contains a task without an id', { phaseId });
    const persistedTask = await service.getMissionTask(missionId, taskId);
    if ((persistedTask?.status || task.status) !== 'completed') {
      incompleteTasks.push(taskId);
    }
    const expectedArtifacts = Array.isArray(task.expectedArtifacts) ? task.expectedArtifacts : [];
    const persistedArtifacts = Array.isArray(persistedTask?.artifacts) && persistedTask.artifacts.length > 0
      ? persistedTask.artifacts
      : Array.isArray(task.artifacts) ? task.artifacts : [];
    if (expectedArtifacts.length > 0 && persistedArtifacts.length === 0) {
      missingArtifactTasks.push(taskId);
    }
  }
  if (incompleteTasks.length > 0 || missingArtifactTasks.length > 0) {
    throw new NextGenError(
      'Cannot approve phase until all tasks are complete and expected deliverables are published',
      409,
      { phaseId, incompleteTasks, missingArtifactTasks },
    );
  }

  const phase = await service.updateMissionPhase(missionId, phaseId, {
    status: 'approved',
    approvedAt: Date.now(),
    approvedBy: approvedBy || 'user',
  });
  await service.appendMissionEvent(missionId, {
    type: 'phase_approved',
    timestamp: Date.now(),
    data: { phaseId, approvedBy: approvedBy || 'user' },
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
