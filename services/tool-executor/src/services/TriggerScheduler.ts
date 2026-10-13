/**
 * The shared schedule runner for Assistant Skills and persisted mission jobs.
 * Skill schedules execute through ToolExecutor; mission schedules dispatch to
 * Stage7's built-in Temporal HTTP API. Both use the same cron parser, tick,
 * persistence contract, and status/history surface.
 *
 * Design constraints worth keeping if this is ever changed:
 *
 * - **The scheduler does not confirm anything.** A scheduled run calls the same
 *   executor entry point a user does, without `confirmation: true`. A gated Skill
 *   therefore stops with `confirmation-required` and leaves a `draft` approval
 *   on its workspace, exactly as a user-initiated run would. That is the point
 *   of `createDynamicTriggerRecord` capturing the tier: a cron schedule is not a
 *   standing authorisation, and treating it as one is the failure this design
 *   exists to prevent.
 * - **One timer, not one loop per trigger.** The watch scheduler started an
 *   endless loop per watch, so N watches meant N sleepers and one bad document
 *   could not be cancelled without reaching into the loop. Here the plan is
 *   rebuilt from the registry and re-checked on one interval, so pausing a
 *   Skill takes effect on the next tick.
 * - **A failed tick is a reported tick.** Every run writes a record, and a run
 *   that throws is recorded as failed rather than swallowed, because the previous
 *   behaviour — silence — is what let a whole missing subsystem go unnoticed.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  buildScheduledTriggers,
  dueTriggers,
  scheduleStatus,
  type BlueprintScheduleCandidate,
  type ScheduledTrigger,
  type ScheduleIssue,
  type ScheduleStatus,
} from '../adk/trigger-schedule';
import { parseCron, type CronSchedule } from '../adk/cron';
import {
  createDynamicTriggerRecord,
  type DynamicTriggerRecord,
  type MissionScheduleRecord,
  type PersistedTriggerRecord,
} from '../adk/triggers';
import type { AssistantWorkflow } from '../adk/workflow-common';
import type { Tool, ToolExecution } from '../types';
import logger from '../utils/logger';
import { CredentialRequiredError, ConfirmationRequiredError } from '../types';
import { createInMemoryTriggerRecordStore, type TriggerRecordStore } from './TriggerRecordStore';

/** Default tick. A minute is the finest granularity cron can express here. */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export type ScheduledRunStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'confirmation-required'
  | 'pending-credentials'
  | 'skipped';

export interface ScheduledRunResult {
  key: string;
  target?: 'skill' | 'mission';
  skillId?: string;
  scheduleId?: string;
  missionId?: string;
  assistantId?: string;
  status: ScheduledRunStatus;
  firedAt: string;
  scheduledFor?: string;
  executionId?: string;
  workflowId?: string;
  checkpointError?: string;
  /** Why a run was skipped: the Skill is gone, or the record was disabled. */
  reason?: string;
  error?: string;
}

export interface MissionScheduleDispatch {
  scheduleId: string;
  missionId: string;
  tenantId: string;
  assistantId: string;
  prompt: string;
  scheduledFor: string;
  metadata?: Record<string, unknown>;
  contextChunks?: Array<{ content: string; tokens: number; priority: number }>;
}

export interface TriggerSchedulerOptions {
  /** Registry the blueprint plan is derived from, so a new Skill schedules itself. */
  getTools: () => Tool[];
  /** Workflows that own those Skills, used to name the assistant on each run. */
  getWorkflows: () => AssistantWorkflow[];
  /**
   * The executor. Typed as the real entry point's signature rather than a
   * hand-rolled one, so a stub in a test has to answer the same questions the
   * caller asks of it: what the execution id was, whether it failed, and whether
   * it stopped for credentials.
   */
  execute: (
    tool: Tool,
    input: Record<string, unknown>,
    opts: { assistantId: string; workspaceId?: string; context?: Record<string, unknown> },
  ) => Promise<ToolExecution | CredentialRequiredError>;
  runMission?: (mission: MissionScheduleDispatch) => Promise<{ workflowId: string }>;
  store?: TriggerRecordStore;
  pollIntervalMs?: number;
  catchUpWindowMs?: number;
  /** Injected so tests can advance time instead of waiting for the wall clock. */
  now?: () => Date;
}

export class TriggerScheduler {
  private readonly options: Required<Omit<TriggerSchedulerOptions, 'store'>> & {
    store: TriggerRecordStore;
  };
  private records: PersistedTriggerRecord[] = [];
  private readonly lastFiredAt = new Map<string, Date>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly history: ScheduledRunResult[] = [];

  constructor(options: TriggerSchedulerOptions) {
    this.options = {
      getTools: options.getTools,
      getWorkflows: options.getWorkflows,
      execute: options.execute,
      runMission: options.runMission ?? (async () => {
        throw new Error('Mission scheduling is not connected to the Temporal service');
      }),
      store: options.store ?? createInMemoryTriggerRecordStore(),
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      catchUpWindowMs: options.catchUpWindowMs ?? 15 * 60 * 1000,
      now: options.now ?? (() => new Date()),
    };
  }

  /**
   * Map every registered Skill to the assistant that owns it.
   *
   * A scheduled run has to name its assistant, because the executor refuses to
   * run a Skill without assistant context. Skills shared between assistants would
   * be ambiguous, so the first workflow that claims a Skill id wins and the rest
   * are ignored — the alternative, firing the same Skill twice per period, is far
   * worse than picking one owner deterministically.
   */
  private blueprintTriggers(): BlueprintScheduleCandidate[] {
    const owners = new Map<string, string>();
    for (const workflow of this.options.getWorkflows()) {
      const assistantId = (workflow.assistant || '').trim().toLowerCase();
      for (const skill of workflow.skills ?? []) {
        if (!owners.has(skill.id)) owners.set(skill.id, assistantId);
      }
    }

    const candidates: BlueprintScheduleCandidate[] = [];
    for (const tool of this.options.getTools()) {
      const assistantId = owners.get(tool.id);
      if (!assistantId) continue;
      const tier = (tool as { tier?: Tool['tier'] }).tier;
      for (const trigger of tool.triggers ?? []) {
        if (trigger.kind !== 'schedule') continue;
        candidates.push({
          skillId: tool.id,
          assistantId,
          tier: tier === 'advise' || tier === 'aid' || tier === 'represent' ? tier : 'advise',
          cron: trigger.cron,
          ...(trigger.cadence ? { cadence: trigger.cadence } : {}),
          defaultInput: trigger.defaultInput ?? {},
          enabled: true,
        });
      }
    }
    return candidates;
  }

  /** Load persisted adaptations and rebuild the plan. Safe to call repeatedly. */
  async refresh(): Promise<void> {
    this.records = await this.options.store.list();
    this.lastFiredAt.clear();
    for (const record of this.records) {
      if (record.lastFiredAt) {
        const key = record.recordType === 'mission-schedule'
          ? `mission:${record.id}`
          : `dynamic:${record.id}`;
        const lastFiredAt = new Date(record.lastFiredAt);
        if (!Number.isNaN(lastFiredAt.getTime())) this.lastFiredAt.set(key, lastFiredAt);
      }
    }
  }

  private plan(): { triggers: ScheduledTrigger[]; issues: ScheduleIssue[] } {
    const dynamicRecords = this.records.filter(
      (record): record is DynamicTriggerRecord => record.recordType !== 'mission-schedule',
    );
    return buildScheduledTriggers(this.blueprintTriggers(), dynamicRecords);
  }

  /** Every schedule the platform currently honours, with its next and last fire. */
  list(): { schedules: ScheduleStatus[]; issues: ScheduleIssue[] } {
    const { triggers, issues } = this.plan();
    return {
      schedules: scheduleStatus(triggers, this.options.now(), this.lastFiredAt),
      issues,
    };
  }

  listMissionSchedules(): {
    schedules: Array<Omit<MissionScheduleRecord, 'lastFiredAt'> & {
      key: string;
      nextFireAt: string | null;
      lastFiredAt: string | null;
      overdue: boolean;
    }>;
    issues: ScheduleIssue[];
  } {
    const now = this.options.now();
    const schedules: Array<Omit<MissionScheduleRecord, 'lastFiredAt'> & {
      key: string;
      nextFireAt: string | null;
      lastFiredAt: string | null;
      overdue: boolean;
    }> = [];
    const issues: ScheduleIssue[] = [];

    for (const record of this.records) {
      if (record.recordType !== 'mission-schedule') continue;
      const key = `mission:${record.id}`;
      const schedule = parseCron(record.cron);
      if (!schedule.valid) {
        issues.push({ key, skillId: record.id, message: schedule.error ?? 'invalid mission schedule cron' });
        continue;
      }
      const last = this.lastFiredAt.get(key);
      schedules.push({
        ...record,
        key,
        lastFiredAt: last?.toISOString() ?? record.lastFiredAt ?? null,
        nextFireAt: record.enabled ? schedule.nextFireAfter(last ?? now)?.toISOString() ?? null : null,
        overdue: record.enabled && this.missionFireTime(schedule, now, last) !== null,
      });
    }
    return { schedules, issues };
  }

  /**
   * Create the adaptation a user asked for in chat: "run this every Monday at 9".
   *
   * This is the first real caller of `createDynamicTriggerRecord`; until now the
   * type existed with a comment describing exactly this use case and no way to
   * produce a record.
   */
  async scheduleSkill(input: {
    skillId: string;
    assistantId: string;
    cron: string;
    skillInput?: Record<string, unknown>;
    origin?: string;
    id?: string;
  }): Promise<DynamicTriggerRecord> {
    const tools = this.options.getTools();
    const tool = tools.find((candidate) => candidate.id === input.skillId);
    if (!tool) throw new Error(`Unknown skill: ${input.skillId}`);

    const tier = (tool as { tier?: Tool['tier'] }).tier;
    const record = createDynamicTriggerRecord({
      id: input.id ?? `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      skillId: input.skillId,
      assistantId: input.assistantId,
      kind: { kind: 'schedule', cron: input.cron },
      input: input.skillInput ?? {},
      tier: tier === 'advise' || tier === 'aid' || tier === 'represent' ? tier : 'advise',
      ...(input.origin ? { origin: input.origin } : {}),
      now: this.options.now(),
    });

    await this.options.store.save(record);
    await this.refresh();
    return record;
  }

  async scheduleMission(input: {
    id?: string;
    tenantId: string;
    assistantId: string;
    prompt: string;
    cron: string;
    metadata?: Record<string, unknown>;
    contextChunks?: Array<{ content: string; tokens: number; priority: number }>;
    origin?: string;
  }): Promise<MissionScheduleRecord> {
    if (!input.tenantId.trim()) throw new Error('tenantId is required for a mission schedule');
    if (!input.assistantId.trim()) throw new Error('assistantId is required for a mission schedule');
    if (!input.prompt.trim()) throw new Error('prompt is required for a mission schedule');
    const parsed = parseCron(input.cron);
    if (!parsed.valid) throw new Error(`Invalid mission schedule cron: ${parsed.error ?? input.cron}`);

    const now = this.options.now().toISOString();
    const id = input.id ?? `mission-schedule-${randomUUID()}`;
    if (!/^mission-schedule-[A-Za-z0-9._-]{1,96}$/.test(id)) {
      throw new Error('Mission schedule id must use the mission-schedule- prefix and a safe identifier');
    }
    const record: MissionScheduleRecord = {
      recordType: 'mission-schedule',
      id,
      tenantId: input.tenantId,
      assistantId: input.assistantId,
      prompt: input.prompt,
      cron: parsed.expression,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.contextChunks ? { contextChunks: input.contextChunks } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
    };

    await this.options.store.save(record);
    await this.refresh();
    return record;
  }

  async listRecords(): Promise<PersistedTriggerRecord[]> {
    return this.options.store.list();
  }

  /** Pause an adaptation without losing its configuration. */
  async setRecordEnabled(recordId: string, enabled: boolean): Promise<PersistedTriggerRecord | null> {
    const record = await this.options.store.get(recordId);
    if (!record) return null;
    const updated: PersistedTriggerRecord = { ...record, enabled, updatedAt: this.options.now().toISOString() };
    await this.options.store.save(updated);
    await this.refresh();
    return updated;
  }

  async deleteRecord(recordId: string): Promise<boolean> {
    const removed = await this.options.store.remove(recordId);
    if (removed) await this.refresh();
    return removed;
  }

  /** Run every due trigger once. Returns what happened, including what did not. */
  async tick(): Promise<ScheduledRunResult[]> {
    // A tick that outlasts its interval must not overlap the next one: the same
    // trigger firing twice in a row is worse than a late one.
    if (this.ticking) return [];
    this.ticking = true;
    try {
      const now = this.options.now();
      const { triggers, issues } = this.plan();
      for (const issue of issues) {
        logger.warn({ skillId: issue.skillId, key: issue.key }, issue.message);
      }

      const due = dueTriggers(triggers, now, this.lastFiredAt, this.options.catchUpWindowMs);
      const results: ScheduledRunResult[] = [];
      for (const trigger of due) {
        const result = await this.fire(trigger, now);
        results.push(result);
        // Recorded whether or not the run succeeded. A trigger that throws every
        // period must not be retried within the same period, and a trigger that
        // stopped existing should not fire again either.
        this.lastFiredAt.set(trigger.key, now);
        const checkpointError = await this.persistLastFiredAt(trigger.key, now);
        if (checkpointError) result.checkpointError = checkpointError;
      }

      for (const record of this.records) {
        if (record.recordType !== 'mission-schedule' || !record.enabled) continue;
        const schedule = parseCron(record.cron);
        if (!schedule.valid) {
          logger.warn({ scheduleId: record.id, error: schedule.error }, 'Mission schedule cannot be evaluated');
          continue;
        }
        const key = `mission:${record.id}`;
        const scheduledFor = this.missionFireTime(schedule, now, this.lastFiredAt.get(key));
        if (!scheduledFor) continue;

        const result = await this.fireMission(record, scheduledFor, now);
        results.push(result);
        if (result.status !== 'failed') {
          this.lastFiredAt.set(key, scheduledFor);
          const checkpointError = await this.persistLastFiredAt(key, scheduledFor);
          if (checkpointError) result.checkpointError = checkpointError;
        }
      }

      this.recordHistory(results);
      return results;
    } finally {
      this.ticking = false;
    }
  }

  private async fire(trigger: ScheduledTrigger, now: Date): Promise<ScheduledRunResult> {
    const base: Omit<ScheduledRunResult, 'status'> = {
      key: trigger.key,
      target: 'skill',
      skillId: trigger.skillId,
      assistantId: trigger.assistantId,
      firedAt: now.toISOString(),
    };

    const tool = this.options.getTools().find((candidate) => candidate.id === trigger.skillId);
    if (!tool) {
      return { ...base, status: 'skipped', reason: 'skill is no longer registered' };
    }

    try {
      const result = await this.options.execute(tool, trigger.defaultInput, {
        assistantId: trigger.assistantId,
        context: { triggeredBy: 'schedule', triggerKey: trigger.key, cron: trigger.cron },
      });

      if (result instanceof CredentialRequiredError) {
        return {
          ...base,
          status: 'pending-credentials',
          executionId: result.request.executionId,
          error: result.message,
        };
      }

      const executionId = result.executionId;
      if (result.status === 'failed') {
        return { ...base, status: 'failed', executionId, error: result.error ?? 'execution reported failed' };
      }
      return { ...base, status: 'completed', executionId };
    } catch (err) {
      if (err instanceof ConfirmationRequiredError) {
        // The expected outcome for a gated Skill, not a failure: the run stopped
        // and left a `draft` approval on the workspace for a human.
        logger.info(
          { skillId: trigger.skillId, key: trigger.key },
          'Scheduled run needs confirmation; left a draft approval for a human',
        );
        return { ...base, status: 'confirmation-required' };
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ skillId: trigger.skillId, key: trigger.key, err: message }, 'Scheduled run failed');
      return { ...base, status: 'failed', error: message };
    }
  }

  private missionFireTime(schedule: CronSchedule, now: Date, lastFiredAt?: Date): Date | null {
    let occurrence = schedule.nextFireAfter(
      lastFiredAt ?? new Date(now.getTime() - this.options.catchUpWindowMs),
    );
    if (!occurrence || occurrence > now) return null;

    while (true) {
      const next = schedule.nextFireAfter(occurrence);
      if (!next || next > now) return occurrence;
      occurrence = next;
    }
  }

  private async fireMission(
    record: MissionScheduleRecord,
    scheduledFor: Date,
    now: Date,
  ): Promise<ScheduledRunResult> {
    const key = `mission:${record.id}`;
    const scheduledForIso = scheduledFor.toISOString();
    const occurrenceHash = createHash('sha256')
      .update(`${record.id}:${scheduledForIso}`)
      .digest('hex')
      .slice(0, 32);
    const missionId = `scheduled-${occurrenceHash}`;
    const base: Omit<ScheduledRunResult, 'status'> = {
      key,
      target: 'mission',
      scheduleId: record.id,
      missionId,
      assistantId: record.assistantId,
      firedAt: now.toISOString(),
      scheduledFor: scheduledForIso,
    };

    try {
      const { workflowId } = await this.options.runMission({
        scheduleId: record.id,
        missionId,
        tenantId: record.tenantId,
        assistantId: record.assistantId,
        prompt: record.prompt,
        scheduledFor: scheduledForIso,
        ...(record.metadata ? { metadata: record.metadata } : {}),
        ...(record.contextChunks ? { contextChunks: record.contextChunks } : {}),
      });
      return { ...base, status: 'started', workflowId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ scheduleId: record.id, missionId, error: message }, 'Scheduled mission dispatch failed');
      return { ...base, status: 'failed', error: message };
    }
  }

  private async persistLastFiredAt(key: string, firedAt: Date): Promise<string | undefined> {
    const recordId = key.startsWith('dynamic:')
      ? key.slice('dynamic:'.length)
      : key.startsWith('mission:')
        ? key.slice('mission:'.length)
        : undefined;
    if (!recordId) return undefined;
    const index = this.records.findIndex((record) => record.id === recordId);
    if (index < 0) return undefined;

    const record = this.records[index]!;
    const updated: PersistedTriggerRecord = {
      ...record,
      lastFiredAt: firedAt.toISOString(),
      updatedAt: this.options.now().toISOString(),
    };
    try {
      await this.options.store.save(updated);
      this.records[index] = updated;
      return undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ key, error: message }, 'Failed to persist schedule fire checkpoint');
      return message;
    }
  }

  private recordHistory(results: ScheduledRunResult[]): void {
    if (results.length === 0) return;
    this.history.unshift(...results);
    // Bounded so a busy scheduler cannot grow the process heap without limit;
    // the workspace history is the durable record, this is only for diagnostics.
    if (this.history.length > 200) this.history.length = 200;
  }

  /** Recent scheduled runs, newest first. Diagnostics only. */
  recentRuns(limit = 50): ScheduledRunResult[] {
    return this.history.slice(0, limit);
  }

  start(): void {
    if (this.timer) return;
    void this.tick().catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Initial scheduler tick failed');
    });
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Scheduler tick threw');
      });
    }, this.options.pollIntervalMs);
    // Do not hold the event loop open on a graceful shutdown.
    this.timer.unref?.();
    logger.info(
      { pollIntervalMs: this.options.pollIntervalMs },
      'Trigger scheduler started',
    );
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('Trigger scheduler stopped');
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}