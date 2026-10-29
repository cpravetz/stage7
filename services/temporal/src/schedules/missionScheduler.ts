import { randomUUID } from 'node:crypto';
import { logger } from '@stage7-nextgen/shared';
import type { TemporalClient } from '../client/TemporalClient';
import type { WorkflowInput } from '../types/workflow';
import {
  missionRecurrenceSchema,
  missionRecurrenceToCron,
  type MissionRecurrence,
} from './missionRecurrence';

const COLLECTION = 'mission_schedules';
const POLL_MS = 15_000;
const MISSED_RUN_GRACE_MS = 30_000;

export function isMissedMissionOccurrence(scheduledFor: Date, now: Date): boolean {
  return now.getTime() - scheduledFor.getTime() > MISSED_RUN_GRACE_MS;
}

export interface MissionSchedule {
  scheduleId: string;
  missionId: string;
  prompt: string;
  tenantId: string;
  assistantId?: string;
  contextChunks?: WorkflowInput['contextChunks'];
  metadata?: WorkflowInput['metadata'];
  recurrence: MissionRecurrence;
  cronSchedule: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastMissionId?: string;
  createdAt: string;
}

interface ScheduleDocument {
  id: string;
  data: MissionSchedule;
}

interface ArtifactResponse {
  documents?: ScheduleDocument[];
}

function artifactsUrl(): string {
  const url = process.env.ARTIFACTS_URL;
  if (!url) throw new Error('Recurring missions require ARTIFACTS_URL for durable schedule storage.');
  return url.replace(/\/+$/, '');
}

async function saveSchedule(schedule: MissionSchedule): Promise<void> {
  const response = await fetch(`${artifactsUrl()}/api/artifacts/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      id: schedule.scheduleId,
      tenantId: schedule.tenantId || 'tenant-1',
      collection: COLLECTION,
      data: schedule,
    }),
  });
  if (!response.ok) {
    throw new Error(`Artifacts rejected recurring mission schedule (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}

async function searchSchedules(): Promise<MissionSchedule[]> {
  const response = await fetch(`${artifactsUrl()}/api/artifacts/documents/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ collection: COLLECTION, limit: 1000 }),
  });
  if (!response.ok) {
    throw new Error(`Artifacts could not list recurring mission schedules (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const result = await response.json() as ArtifactResponse;
  return (result.documents || [])
    .map((document) => ({ ...document.data, scheduleId: document.data.scheduleId || document.id }))
    .filter((schedule) => missionRecurrenceSchema.safeParse(schedule.recurrence).success);
}

export function nextMissionOccurrence(recurrence: MissionRecurrence, after: Date): Date {
  const [hour, minute] = recurrence.time.split(':').map(Number);
  const candidate = new Date(Date.UTC(
    after.getUTCFullYear(),
    after.getUTCMonth(),
    after.getUTCDate(),
    hour,
    minute,
  ));

  if (recurrence.frequency === 'daily') {
    if (candidate <= after) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }

  if (recurrence.frequency === 'weekly') {
    const daysUntil = (recurrence.dayOfWeek - candidate.getUTCDay() + 7) % 7;
    candidate.setUTCDate(candidate.getUTCDate() + daysUntil);
    if (candidate <= after) candidate.setUTCDate(candidate.getUTCDate() + 7);
    return candidate;
  }

  for (let monthOffset = 0; monthOffset <= 12; monthOffset++) {
    const year = after.getUTCFullYear();
    const month = after.getUTCMonth() + monthOffset;
    const monthlyCandidate = new Date(Date.UTC(year, month, recurrence.dayOfMonth, hour, minute));
    if (
      monthlyCandidate.getUTCDate() === recurrence.dayOfMonth
      && monthlyCandidate > after
    ) return monthlyCandidate;
  }
  throw new Error('Could not calculate the next monthly mission occurrence.');
}

export async function createMissionSchedule(
  input: WorkflowInput,
  recurrence: MissionRecurrence,
): Promise<MissionSchedule> {
  const now = new Date();
  const schedule: MissionSchedule = {
    scheduleId: `mission-schedule-${randomUUID()}`,
    missionId: input.missionId,
    prompt: input.prompt,
    tenantId: input.tenantId || 'tenant-1',
    ...(input.assistantId ? { assistantId: input.assistantId } : {}),
    ...(input.contextChunks ? { contextChunks: input.contextChunks } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    recurrence,
    cronSchedule: missionRecurrenceToCron(recurrence),
    enabled: true,
    nextRunAt: nextMissionOccurrence(recurrence, now).toISOString(),
    createdAt: now.toISOString(),
  };
  await saveSchedule(schedule);
  return schedule;
}

export async function listMissionSchedules(): Promise<MissionSchedule[]> {
  return (await searchSchedules()).filter((schedule) => schedule.enabled);
}

export async function stopMissionSchedule(scheduleId: string): Promise<boolean> {
  const schedule = (await searchSchedules()).find((item) => item.scheduleId === scheduleId);
  if (!schedule) return false;
  await saveSchedule({ ...schedule, enabled: false });
  return true;
}

export async function recordScheduleMission(scheduleId: string, missionId: string): Promise<void> {
  const schedule = (await searchSchedules()).find((item) => item.scheduleId === scheduleId);
  if (!schedule) throw new Error(`Recurring mission schedule '${scheduleId}' was not found.`);
  await saveSchedule({ ...schedule, lastMissionId: missionId });
}

export async function disableMissionSchedule(scheduleId: string): Promise<void> {
  const schedule = (await searchSchedules()).find((item) => item.scheduleId === scheduleId);
  if (schedule) await saveSchedule({ ...schedule, enabled: false });
}

async function updateSchedule(
  schedule: MissionSchedule,
  client: TemporalClient,
  now: Date,
): Promise<void> {
  const scheduledFor = new Date(schedule.nextRunAt);
  const nextRunAt = nextMissionOccurrence(schedule.recurrence, now).toISOString();
  const isMissed = isMissedMissionOccurrence(scheduledFor, now);
  const previousMission = schedule.lastMissionId
    ? await client.getMissionResult(`mission-${schedule.lastMissionId}`)
    : null;
  const previousStatus = previousMission?.status as string | undefined;
  const previousStillRunning = previousStatus === 'running'
    || previousStatus === 'paused'
    || previousStatus === 'pausing'
    || previousStatus === 'canceling';

  const advanced: MissionSchedule = {
    ...schedule,
    nextRunAt,
    ...(!isMissed && !previousStillRunning ? { lastRunAt: scheduledFor.toISOString() } : {}),
  };
  await saveSchedule(advanced);

  if (isMissed) {
    logger.info({ scheduleId: schedule.scheduleId, scheduledFor: scheduledFor.toISOString() }, 'Skipping missed recurring mission occurrence');
    return;
  }
  if (previousStillRunning) {
    logger.info({ scheduleId: schedule.scheduleId, scheduledFor: scheduledFor.toISOString() }, 'Skipping recurring occurrence because the previous mission is still running');
    return;
  }

  const occurrenceMissionId = `${schedule.missionId}-scheduled-${scheduledFor.getTime()}`;
  const input: WorkflowInput = {
    missionId: occurrenceMissionId,
    tenantId: schedule.tenantId,
    assistantId: schedule.assistantId || '',
    prompt: schedule.prompt,
    metadata: {
      ...schedule.metadata,
      entityId: schedule.metadata?.entityId
        || schedule.assistantId
        || schedule.missionId,
      scheduled: true,
      scheduleId: schedule.scheduleId,
      scheduledFor: scheduledFor.toISOString(),
    },
    contextChunks: schedule.contextChunks,
  };
  await client.startMission(input);
  await saveSchedule({ ...advanced, lastRunAt: scheduledFor.toISOString(), lastMissionId: occurrenceMissionId });
  logger.info({ scheduleId: schedule.scheduleId, missionId: occurrenceMissionId }, 'Recurring mission started');
}

export function startMissionScheduler(client: TemporalClient): () => void {
  if (!process.env.ARTIFACTS_URL) {
    logger.warn('ARTIFACTS_URL not set, recurring mission scheduler disabled');
    return () => {};
  }
  let running = true;
  let polling = false;
  const poll = async () => {
    if (!running || polling) return;
    polling = true;
    try {
      const now = new Date();
      const schedules = await searchSchedules();
      for (const schedule of schedules) {
        if (!schedule.enabled || new Date(schedule.nextRunAt) > now) continue;
        try {
          await updateSchedule(schedule, client, now);
        } catch (error) {
          logger.error(
            { scheduleId: schedule.scheduleId, error: error instanceof Error ? error.message : String(error) },
            'Recurring mission schedule poll failed',
          );
        }
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Could not load recurring mission schedules',
      );
    } finally {
      polling = false;
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);
  timer.unref();
  logger.info({ pollMs: POLL_MS, missedRunGraceMs: MISSED_RUN_GRACE_MS }, 'Recurring mission scheduler started');
  return () => {
    running = false;
    clearInterval(timer);
  };
}
