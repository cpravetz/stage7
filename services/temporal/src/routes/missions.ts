import { Router, Request, Response } from 'express';
import { TemporalClient } from '../client/TemporalClient';
import { WorkflowInput, MissionTaskCheckpoint } from '../types/workflow';
import { asyncHandler, NextGenError, PlanSchema, logger } from '@stage7-nextgen/shared';
import { getMissionResumeProgress } from '../recovery/missionProgress';

function validateServiceUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      const parts = hostname.split('.').map(Number);
      if (parts.some((p) => p > 255)) return null;
      if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return null;
      if (parts[0] === 192 && parts[1] === 168) return null;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return null;
      if (parts[0] === 169 && parts[1] === 254) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const temporalClient = new TemporalClient();
const client = temporalClient;
const artifactsBase = validateServiceUrl(process.env.ARTIFACTS_URL);

const router: Router = Router();

router.post(
  '/missions',
  asyncHandler(async (req: Request, res: Response) => {
    const { missionId, prompt, tenantId, assistantId, contextChunks, metadata } = req.body;

    if (!missionId || !prompt) {
      throw NextGenError.badRequest('missionId and prompt are required');
    }

    const input: WorkflowInput = {
      missionId,
      tenantId,
      assistantId,
      prompt,
      contextChunks,
      metadata,
    };

    const workflowId = await client.startMission(input);

    res.status(202).json({ workflowId, status: 'started' });
  }),
);

router.post(
  '/missions/:workflowId/retry',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const { retryPrompt, userGuidance } = req.body as { retryPrompt?: string; userGuidance?: string };

    const original = await client.getMissionResult(workflowId);
    if (!original) {
      throw NextGenError.notFound('Mission not found');
    }
    if (original.status !== 'failed' && original.status !== 'incomplete' && original.status !== 'canceled') {
      throw NextGenError.badRequest(`Cannot retry mission with status: ${original.status}`);
    }

    const originalPrompt = (original.input?.prompt || '')
      .replace(/\n*--- RETRY GUIDANCE ---[\s\S]*?--- END RETRY GUIDANCE ---/g, '')
      .trimEnd();
    const guidance = retryPrompt || userGuidance || '';

    // A retry must know completed work so it does not replay side effects.
    const missionId = original.missionId;
    if (!artifactsBase) {
      throw new NextGenError('Cannot safely retry without the Artifacts persistence service.', 503, { missionId });
    }
    let progress;
    try {
      const planResponse = await fetch(
        `${artifactsBase.origin}/api/artifacts/missions/${encodeURIComponent(missionId)}/plan`,
      );
      if (!planResponse.ok) {
        throw new Error(`Artifacts returned HTTP ${planResponse.status}`);
      }
      progress = getMissionResumeProgress(PlanSchema.parse(await planResponse.json()));
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      logger.error({ missionId, error: details }, 'Cannot load persisted mission progress for retry');
      throw new NextGenError(
        'Cannot safely retry mission because its persisted plan and completed work could not be loaded.',
        503,
        { missionId },
      );
    }
    const completedPhases = progress.checkpoint.completedPhases || [];
    const completedTasks: MissionTaskCheckpoint[] = progress.checkpoint.completedTasks || [];
    const { resumeFromPhaseId, resumeFromTaskId } = progress;

    const retryCount = (original.input?.metadata?.retryCount as number) || 0;

    const input: WorkflowInput = {
      missionId: missionId, // Keep the same mission ID
      tenantId: original.input?.tenantId || '',
      assistantId: original.input?.assistantId || '',
      prompt: originalPrompt,
      contextChunks: original.input?.contextChunks,
      retryGuidance: guidance,
      metadata: {
        ...original.input?.metadata,
        retryCount: retryCount + 1,
        retriedFrom: workflowId,
        retriedAt: Date.now(),
        retryGuidance: guidance,
      },
      completedPhases,
      completedTasks,
      resumeFromPhaseId,
      resumeFromTaskId,
    };

    const newWorkflowId = await client.startMission(input);

    res.status(202).json({ 
      workflowId: newWorkflowId, 
      status: 'started',
      missionId,
      retriedFrom: workflowId,
      retryCount: retryCount + 1,
      resumeFromPhaseId,
      resumeFromTaskId,
      completedPhasesCount: completedPhases.length,
      completedTasksCount: completedTasks.length,
    });
  }),
);

router.post(
  '/watches/:watchId/run',
  asyncHandler(async (req: Request, res: Response) => {
    const watchId = req.params.watchId as string
    if (!watchId) throw NextGenError.badRequest('watchId required')
    const workflowId = await client.startWatch(watchId)
    res.status(202).json({ workflowId, status: 'started' })
  }),
)

router.get(
  '/missions',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await client.listMissions();
    res.json({ missions: result });
  }),
);

router.get(
  '/missions/:workflowId',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;

    const result = await client.getMissionResult(workflowId);

    if (!result) {
      throw NextGenError.notFound('Workflow not found');
    }

    res.json(result);
  }),
);

router.post(
  '/missions/:workflowId/terminate',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;

    const status = await client.terminateMission(workflowId);
    if (status === 'stopping') {
      res.status(202).json({ status });
      return;
    }
    res.status(204).send();
  }),
);

router.post(
  '/missions/:workflowId/start',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const status = await client.resumeMission(workflowId);
    res.status(202).json({ status });
  }),
);

router.post(
  '/missions/:workflowId/pause',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const status = await client.pauseMission(workflowId);
    res.status(status === 'paused' ? 200 : 202).json({ status });
  }),
);

router.post(
  '/missions/:workflowId/stop',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const status = await client.terminateMission(workflowId);
    res.status(status === 'stopping' ? 202 : 200).json({ status });
  }),
);

router.delete(
  '/missions/:workflowId',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;

    const status = await client.terminateMission(workflowId);
    if (status === 'stopping') {
      res.status(202).json({ status });
      return;
    }
    await client.deleteMission(workflowId);

    res.status(204).send();
  }),
);

router.post(
  '/missions/:workflowId/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const { content, role } = req.body as { content?: string; role?: string };
    const missionId = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;

    if (!content || typeof content !== 'string') {
      throw NextGenError.badRequest('content is required');
    }

    const event = {
      type: role === 'user' ? 'user' : 'user_message',
      missionId,
      workflowId,
      timestamp: Date.now(),
      data: { content, role: role || 'user' },
    };

    await client.appendMissionEvent(missionId, {
      type: event.type,
      timestamp: event.timestamp,
      data: event.data,
    });

    await client.broadcastMissionUpdate(event);

    res.status(202).json({ status: 'accepted' });
  }),
);

export default router;
