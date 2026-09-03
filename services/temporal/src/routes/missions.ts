import { Router, Request, Response } from 'express';
import { TemporalClient } from '../client/TemporalClient';
import { WorkflowInput } from '../types/workflow';
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared';

const client = new TemporalClient();

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
