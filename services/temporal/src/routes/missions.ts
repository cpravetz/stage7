import { Router, Request, Response } from 'express';
import { TemporalClient } from '../client/TemporalClient';
import { WorkflowInput, MissionTaskCheckpoint } from '../types/workflow';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

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

const client = new TemporalClient();
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

    const originalPrompt = original.input?.prompt || '';
    const guidance = retryPrompt || userGuidance || '';
    
    const enhancedPrompt = guidance
      ? `${originalPrompt}\n\n--- RETRY GUIDANCE ---\n${guidance}\n--- END RETRY GUIDANCE ---`
      : originalPrompt;

    // Fetch mission plan from artifacts to get completed phases/tasks
    const missionId = original.missionId;
    let completedPhases: string[] = [];
    let completedTasks: MissionTaskCheckpoint[] = [];
    let resumeFromPhaseId: string | undefined;
    let resumeFromTaskId: string | undefined;

    if (artifactsBase) {
      try {
        // Get mission plan which contains phases and tasks with their statuses
        const planRes = await fetch(`${artifactsBase.origin}/api/artifacts/missions/${missionId}/plan`);
        if (planRes.ok) {
          const planData = await planRes.json() as { plan?: { phases?: Array<{ id: string; status?: string; tasks?: Array<{ id: string; status?: string }> }> } };
          if (planData.plan?.phases) {
            for (const phase of planData.plan.phases) {
              if (phase.status === 'completed') {
                completedPhases.push(phase.id);
              }
              if (phase.tasks) {
                for (const task of phase.tasks) {
                  if (task.status === 'completed') {
                    completedTasks.push({ phaseId: phase.id, taskId: task.id });
                  } else if (!resumeFromPhaseId && !resumeFromTaskId) {
                    // First incomplete task - resume from here
                    resumeFromPhaseId = phase.id;
                    resumeFromTaskId = task.id;
                  }
                }
              } else if (!resumeFromPhaseId && phase.status !== 'completed') {
                // Phase without tasks or incomplete phase
                resumeFromPhaseId = phase.id;
              }
            }
          }
        }
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err), missionId }, 'Failed to fetch mission plan for retry');
      }
    }

    const retryCount = (original.input?.metadata?.retryCount as number) || 0;

    const input: WorkflowInput = {
      missionId: missionId, // Keep the same mission ID
      tenantId: original.input?.tenantId || '',
      assistantId: original.input?.assistantId || '',
      prompt: enhancedPrompt,
      contextChunks: original.input?.contextChunks,
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

    await client.terminateMission(workflowId);

    res.status(204).send();
  }),
);

router.post(
  '/missions/:workflowId/start',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const missionId = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    // Mark mission as running in persistence so UI reflects state.
    try {
      if (artifactsBase) {
        await fetch(`${artifactsBase.origin}/api/artifacts/missions/${missionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'running', updatedAt: Date.now() }),
        });
      }
    } catch (err) {
      // best-effort; continue
    }
    res.status(202).json({ status: 'started' });
  }),
);

router.post(
  '/missions/:workflowId/pause',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    const missionId = workflowId.startsWith('mission-') ? workflowId.slice(8) : workflowId;
    try {
      if (artifactsBase) {
        await fetch(`${artifactsBase.origin}/api/artifacts/missions/${missionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paused', updatedAt: Date.now() }),
        });
      }
    } catch (err) {
      // ignore
    }
    res.status(200).json({ status: 'paused' });
  }),
);

router.post(
  '/missions/:workflowId/stop',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;
    await client.terminateMission(workflowId);
    res.status(200).json({ status: 'stopped' });
  }),
);

router.delete(
  '/missions/:workflowId',
  asyncHandler(async (req: Request, res: Response) => {
    const workflowId = req.params.workflowId as string;

    await client.terminateMission(workflowId);
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
