import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler';
import { triggerScheduler } from '../utils/sharedInstance';

/**
 * The schedule and event surface for users.
 *
 * Two things live here that did not exist before: the list of schedules the
 * platform actually honours, and the adaptations a user creates by asking for
 * one ("run this every Monday at 9"). Reading this list is the answer to "why
 * did my Skill not run on time" — a declared cron with no entry here is a
 * declaration nothing is honouring, which used to be invisible.
 */

const router: Router = Router();

const CreateScheduleSchema = z.object({
  skillId: z.string().min(1),
  assistantId: z.string().min(1),
  cron: z.string().min(1),
  input: z.record(z.unknown()).optional(),
  origin: z.string().optional(),
});

const UpdateScheduleSchema = z.object({
  enabled: z.boolean(),
});

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const { schedules, issues } = triggerScheduler.list();
    res.json({ schedules, issues, count: schedules.length });
  }),
);

router.get(
  '/runs',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 50;
    res.json({ runs: triggerScheduler.recentRuns(limit) });
  }),
);

router.get(
  '/records',
  asyncHandler(async (_req: Request, res: Response) => {
    const records = await triggerScheduler.listRecords();
    res.json({ records, count: records.length });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreateScheduleSchema.parse(req.body || {});
    const record = await triggerScheduler.scheduleSkill({
      skillId: parsed.skillId,
      assistantId: parsed.assistantId,
      cron: parsed.cron,
      ...(parsed.input ? { skillInput: parsed.input } : {}),
      ...(parsed.origin ? { origin: parsed.origin } : {}),
    });
    res.status(201).json({ record });
  }),
);

router.patch(
  '/records/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = UpdateScheduleSchema.parse(req.body || {});
    const record = await triggerScheduler.setRecordEnabled(req.params.id, parsed.enabled);
    if (!record) {
      res.status(404).json({ error: 'Trigger record not found' });
      return;
    }
    res.json({ record });
  }),
);

router.delete(
  '/records/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const removed = await triggerScheduler.deleteRecord(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Trigger record not found' });
      return;
    }
    res.status(204).send();
  }),
);

/**
 * Force a tick instead of waiting for the interval.
 *
 * Exposed because "did my schedule fire?" is otherwise unanswerable until the
 * next period, and because a schedule that is already overdue should not wait a
 * full period to be noticed.
 */
router.post(
  '/tick',
  asyncHandler(async (_req: Request, res: Response) => {
    const results = await triggerScheduler.tick();
    res.json({ ran: results.length, results });
  }),
);

router.post(
  '/pause',
  asyncHandler(async (_req: Request, res: Response) => {
    triggerScheduler.stop();
    res.json({ running: triggerScheduler.isRunning() });
  }),
);

router.post(
  '/resume',
  asyncHandler(async (_req: Request, res: Response) => {
    triggerScheduler.start();
    res.json({ running: triggerScheduler.isRunning() });
  }),
);

export default router;