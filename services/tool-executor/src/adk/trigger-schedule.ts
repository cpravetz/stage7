/**
 * Turns declared triggers into a set of things that fire at a known time.
 *
 * This module is the part of the scheduler that can be reasoned about: given the
 * `schedule` triggers a blueprint declares plus the Dynamic Trigger Records a
 * user has accumulated at runtime, work out what should run, when, and under
 * which governance gate. It holds no timer and reads no clock, so the same
 * input always produces the same plan — which is what makes it testable.
 *
 * `TriggerScheduler` owns the timer and the clock. The split matters because the
 * failure mode this code exists to fix is silent: 48 Skills declared a cron
 * expression that nothing ever read, and nothing complained. A plan that can be
 * computed, inspected and asserted on cannot rot that quietly again.
 */

import { parseCadence, parseCron, type CronSchedule } from './cron';
import { dynamicRunGate, type DynamicTriggerRecord } from './triggers';
import type { GovernanceTier } from './types';

/** A `schedule` trigger declared in a blueprint. */
export interface BlueprintScheduleCandidate {
  skillId: string;
  /** Which Assistant owns the Skill; a scheduled run has to name it. */
  assistantId: string;
  /**
   * Resolved from the registered Skill, not invented here. Governance requires
   * every Skill to declare exactly one tier, so the registry always knows it,
   * and reporting the real tier is what lets the schedule listing say honestly
   * whether the next fire needs a human.
   */
  tier: GovernanceTier;
  cron?: string;
  /**
   * Shorthand some Skills declare instead of a cron. Only the forms with a single
   * interpretation are honoured — see `parseCadence`.
   */
  cadence?: string;
  defaultInput?: Record<string, unknown>;
  /** Overrides the blueprint trigger; the record is the adaptation. */
  enabled?: boolean;
}

export interface ScheduledTrigger {
  /** Stable identity across rebuilds, used to track the last fire. */
  key: string;
  skillId: string;
  assistantId: string;
  tier: GovernanceTier;
  cron: string;
  defaultInput: Record<string, unknown>;
  source: 'blueprint' | 'dynamic';
  /** Present for `dynamic` triggers: the persisted record this came from. */
  recordId?: string;
  schedule: CronSchedule;
}

export interface ScheduleIssue {
  key: string;
  skillId: string;
  message: string;
}

export interface ScheduleSet {
  triggers: ScheduledTrigger[];
  issues: ScheduleIssue[];
}

/**
 * How far back a scheduler that has never fired a trigger will look.
 *
 * On boot the scheduler has no `lastFiredAt` for anything, so without a window
 * it would either fire every trigger whose time has passed this year or wait a
 * full period. A short window means a restart shortly after a due time replays
 * the run that was missed, while a restart three hours later does not fire a
 * backlog of the last three hours.
 */
export const DEFAULT_CATCH_UP_MS = 15 * 60 * 1000;

function blueprintKey(skillId: string): string {
  return `blueprint:${skillId}`;
}

/**
 * Build the plan. Blueprint triggers come first and dynamic records are merged
 * alongside them, matching `effectiveTriggers`: adapting a Skill adds a run and
 * never silently removes the one the blueprint declared.
 */
export function buildScheduledTriggers(
  blueprint: BlueprintScheduleCandidate[],
  records: DynamicTriggerRecord[],
): ScheduleSet {
  const triggers: ScheduledTrigger[] = [];
  const issues: ScheduleIssue[] = [];
  const seen = new Set<string>();

  for (const candidate of blueprint) {
    const key = blueprintKey(candidate.skillId);
    if (!candidate.cron && !candidate.cadence) continue;

    // A declared cron wins; `cadence` is the shorthand, and only the unambiguous
    // part of it. Anything else becomes an issue rather than a guess.
    const schedule = candidate.cron ? parseCron(candidate.cron) : parseCadence(candidate.cadence as string);
    const expression = candidate.cron ?? (schedule.valid ? schedule.expression : candidate.cadence ?? '');

    if (!schedule.valid) {
      issues.push({
        key,
        skillId: candidate.skillId,
        message: `schedule trigger cannot be scheduled: ${schedule.error ?? 'invalid expression'} (${expression})`,
      });
      continue;
    }
    triggers.push({
      key,
      skillId: candidate.skillId,
      assistantId: candidate.assistantId,
      tier: candidate.tier,
      cron: schedule.expression,
      defaultInput: candidate.defaultInput ?? {},
      source: 'blueprint',
      schedule,
    });
    seen.add(key);
  }

  for (const record of records) {
    const key = `dynamic:${record.id}`;
    if (!record.enabled) continue;
    // A Dynamic Trigger Record is the adaptation of a schedule, so anything that
    // is not one is skipped rather than treated as a schedule with no cron.
    if (record.kind.kind !== 'schedule') {
      issues.push({ key, skillId: record.skillId, message: `dynamic trigger record is a ${record.kind.kind} trigger, not a schedule` });
      continue;
    }
    const cron = record.kind.cron;
    if (!cron) {
      issues.push({ key, skillId: record.skillId, message: 'dynamic trigger record has no cron expression' });
      continue;
    }
    const schedule = parseCron(cron);
    if (!schedule.valid) {
      issues.push({
        key,
        skillId: record.skillId,
        message: `dynamic trigger record cannot be parsed: ${schedule.error ?? 'invalid expression'} (${cron})`,
      });
      continue;
    }
    triggers.push({
      key,
      skillId: record.skillId,
      assistantId: record.assistantId,
      tier: record.tier,
      cron,
      defaultInput: record.input ?? {},
      source: 'dynamic',
      recordId: record.id,
      schedule,
    });
  }

  return { triggers, issues };
}

/**
 * Whether a trigger should run now.
 *
 * `nextFireAfter` returns a time strictly after its argument, so passing the
 * previous fire time means "has another one come round since" — including
 * several missed periods, which each collapse into a single run rather than a
 * burst of catch-up executions.
 */
export function isDue(
  trigger: ScheduledTrigger,
  now: Date,
  lastFiredAt?: Date,
  catchUpWindowMs: number = DEFAULT_CATCH_UP_MS,
): boolean {
  const from = lastFiredAt ?? new Date(now.getTime() - catchUpWindowMs);
  const next = trigger.schedule.nextFireAfter(from);
  if (next === null) return false;
  return next.getTime() <= now.getTime();
}

export function dueTriggers(
  triggers: ScheduledTrigger[],
  now: Date,
  lastFiredAt: Map<string, Date>,
  catchUpWindowMs?: number,
): ScheduledTrigger[] {
  return triggers.filter((trigger) => isDue(trigger, now, lastFiredAt.get(trigger.key), catchUpWindowMs));
}

export interface ScheduleStatus {
  key: string;
  skillId: string;
  assistantId: string;
  tier: GovernanceTier;
  cron: string;
  source: 'blueprint' | 'dynamic';
  recordId?: string;
  /** Whether the next fire needs a human before it can do anything. */
  requiresApproval: boolean;
  /** Next fire time, or null when the expression can never fire. */
  nextFireAt: string | null;
  /** Last fire, or null when the trigger has never run. */
  lastFiredAt: string | null;
  /** Set when the next fire is already in the past, i.e. it is waiting to run. */
  overdue: boolean;
}

/** The listing shape the schedule endpoint returns. */
export function scheduleStatus(
  triggers: ScheduledTrigger[],
  now: Date,
  lastFiredAt: Map<string, Date>,
): ScheduleStatus[] {
  return triggers.map((trigger) => {
    const next = trigger.schedule.nextFireAfter(now);
    const last = lastFiredAt.get(trigger.key);
    return {
      key: trigger.key,
      skillId: trigger.skillId,
      assistantId: trigger.assistantId,
      tier: trigger.tier,
      cron: trigger.cron,
      source: trigger.source,
      ...(trigger.recordId ? { recordId: trigger.recordId } : {}),
      requiresApproval: dynamicRunGate({ tier: trigger.tier }).requiresConfirmation,
      nextFireAt: next ? next.toISOString() : null,
      lastFiredAt: last ? last.toISOString() : null,
      overdue: isDue(trigger, now, last),
    };
  });
}