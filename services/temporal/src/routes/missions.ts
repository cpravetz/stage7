import { Router, Request, Response } from 'express';
import { TemporalClient } from '../client/TemporalClient';
import { WorkflowInput } from '../types/workflow';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';

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
