import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler';
import { triggerScheduler } from '../utils/sharedInstance';
import { parseCron } from '../adk/cron';

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

const CreateMissionScheduleSchema = z.object({
  id: z.string().regex(/^mission-schedule-[A-Za-z0-9._-]{1,96}$/).optional(),
  tenantId: z.string().min(1),
  assistantId: z.string().min(1),
  prompt: z.string().min(1),
  cron: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  contextChunks: z.array(z.object({
    content: z.string(),
    tokens: z.number(),
    priority: z.number(),
  })).optional(),
  origin: z.string().optional(),
});

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const { schedules, issues } = triggerScheduler.list();
    const missionSchedules = triggerScheduler.listMissionSchedules();
    res.json({
      schedules,
      missionSchedules: missionSchedules.schedules,
      issues: [...issues, ...missionSchedules.issues],
      count: schedules.length + missionSchedules.schedules.length,
    });
  }),
);

router.get(
  '/missions',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = triggerScheduler.listMissionSchedules();
    res.json({ ...result, count: result.schedules.length });
  }),
);

router.post(
  '/missions',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreateMissionScheduleSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    const cron = parseCron(parsed.data.cron);
    if (!cron.valid) {
      res.status(400).json({ error: `Invalid cron expression: ${cron.error ?? parsed.data.cron}` });
      return;
    }
    const record = await triggerScheduler.scheduleMission({
      ...parsed.data,
      cron: cron.expression,
    });
    res.status(201).json({ schedule: record });
  }),
);

router.patch(
  '/missions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = UpdateScheduleSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    const isMissionSchedule = triggerScheduler
      .listMissionSchedules()
      .schedules.some((schedule) => schedule.id === req.params.id);
    if (!isMissionSchedule) {
      res.status(404).json({ error: 'Mission schedule not found' });
      return;
    }
    const schedule = await triggerScheduler.setRecordEnabled(req.params.id, parsed.data.enabled);
    res.json({ schedule });
  }),
);

router.delete(
  '/missions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const isMissionSchedule = triggerScheduler
      .listMissionSchedules()
      .schedules.some((schedule) => schedule.id === req.params.id);
    if (!isMissionSchedule) {
      res.status(404).json({ error: 'Mission schedule not found' });
      return;
    }
    await triggerScheduler.deleteRecord(req.params.id);
    res.status(204).send();
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