/**
 * The trigger scheduler — the runtime the ADK's `schedule` triggers were
 * written against but never had.
 *
 * `adk/triggers.ts` opens with the claim that "the scheduler and event monitor
 * evaluate" blueprint triggers together with persisted Dynamic Trigger Records.
 * Until now neither existed: the only scheduler in the platform
 * (`services/temporal/src/scheduler.ts`) polls a `watches` collection that
 * predates the blueprint model and cannot parse a cron expression, so the 48
 * Skills declaring `kind: 'schedule'` declared them into the void.
 *
 * Design notes worth keeping if this is ever changed:
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

import {
  buildScheduledTriggers,
  dueTriggers,
  scheduleStatus,
  type BlueprintScheduleCandidate,
  type ScheduledTrigger,
  type ScheduleIssue,
  type ScheduleStatus,
} from '../adk/trigger-schedule';
import { createDynamicTriggerRecord, type DynamicTriggerRecord } from '../adk/triggers';
import type { AssistantWorkflow } from '../adk/workflow-common';
import type { Tool, ToolExecution } from '../types';
import logger from '../utils/logger';
import { CredentialRequiredError, ConfirmationRequiredError } from '../types';
import { createInMemoryTriggerRecordStore, type TriggerRecordStore } from './TriggerRecordStore';

/** Default tick. A minute is the finest granularity cron can express here. */
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export type ScheduledRunStatus =
  | 'completed'
  | 'failed'
  | 'confirmation-required'
  | 'pending-credentials'
  | 'skipped';

export interface ScheduledRunResult {
  key: string;
  skillId: string;
  assistantId: string;
  status: ScheduledRunStatus;
  firedAt: string;
  executionId?: string;
  /** Why a run was skipped: the Skill is gone, or the record was disabled. */
  reason?: string;
  error?: string;
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
  private records: DynamicTriggerRecord[] = [];
  /** Last fire per trigger key. In memory only: losing it costs at most one replay. */
  private readonly lastFiredAt = new Map<string, Date>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private readonly history: ScheduledRunResult[] = [];

  constructor(options: TriggerSchedulerOptions) {
    this.options = {
      getTools: options.getTools,
      getWorkflows: options.getWorkflows,
      execute: options.execute,
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
    try {
      this.records = await this.options.store.list();
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Failed to load dynamic trigger records');
      this.records = [];
    }
  }

  private plan(): { triggers: ScheduledTrigger[]; issues: ScheduleIssue[] } {
    return buildScheduledTriggers(this.blueprintTriggers(), this.records);
  }

  /** Every schedule the platform currently honours, with its next and last fire. */
  list(): { schedules: ScheduleStatus[]; issues: ScheduleIssue[] } {
    const { triggers, issues } = this.plan();
    return {
      schedules: scheduleStatus(triggers, this.options.now(), this.lastFiredAt),
      issues,
    };
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

  async listRecords(): Promise<DynamicTriggerRecord[]> {
    return this.options.store.list();
  }

  /** Pause an adaptation without losing its configuration. */
  async setRecordEnabled(recordId: string, enabled: boolean): Promise<DynamicTriggerRecord | null> {
    const record = await this.options.store.get(recordId);
    if (!record) return null;
    const updated: DynamicTriggerRecord = { ...record, enabled, updatedAt: this.options.now().toISOString() };
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