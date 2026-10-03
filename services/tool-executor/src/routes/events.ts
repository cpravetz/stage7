import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { eventLog } from '../utils/sharedInstance';

/**
 * The event log, readable.
 *
 * Events are emitted by the executor on every successful run and reach their
 * in-process subscribers synchronously. This endpoint is the other half: the
 * durable record of what changed, for an audit trail and for answering "which
 * Skill touched this object" without reconstructing it from execution history.
 */
const router: Router = Router();

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const events = await eventLog.recent(limit);
    res.json({ events, count: events.length });
  }),
);

router.get(
  '/by-skill/:skillId',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const events = await eventLog.bySkill(req.params.skillId, limit);
    res.json({ events, count: events.length });
  }),
);

export default router;