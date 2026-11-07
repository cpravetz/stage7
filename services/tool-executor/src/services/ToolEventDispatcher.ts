import type { Tool, SkillTrigger } from '../types';
import logger from '../utils/logger';
import { allWorkflows } from '../data/skills';
import { TriggerExecutionEngine } from './TriggerExecutionEngine';
import {
  announcedEventIds,
  buildCompletionEvents,
  buildOutcomeEvent,
  completionEventId,
  declaredEventIds,
  isDryRun,
  type StoreWrite,
} from '../adk/events';
import type { EventLog } from './EventLog';
import type { NestedExecutor } from './ToolDispatcher';

/**
 * Announces run outcomes (completed / failed / aborted) and fans them out to every
 * Skill subscribed to the resulting event ids. Owns the trigger engine, the event
 * log writes, and the cycle guard.
 *
 * `toolRegistry` is the executor's own mutable Map, shared by reference so tools
 * registered after boot are visible here too.
 */
export class ToolEventDispatcher {
  /**
   * Event-dispatch runtime. Built lazily because the registry is a mutable Map
   * that the constructor may never receive (tools are registered after boot) —
   * sharing the Map by reference keeps the engine's view current either way.
   */
  private triggerEngine: TriggerExecutionEngine | null = null;
  /** Payload of the most recent emit per event id, so an engine-driven dispatch has something to pass downstream. */
  private recentEventPayloads: Map<string, unknown> = new Map();
  /** Guards against an emit loop: A emits e, B listens to e and re-emits e, A listens to e... */
  private eventDispatchChain: Set<string> = new Set();
  /**
   * Where completed runs are recorded.
   *
   * Injected rather than constructed inline so a test can read back what a run
   * announced, and so the append stays best-effort: a log outage must not be able
   * to fail a run that already changed data.
   */
  private readonly eventLog: EventLog;
  /** Skill id to owning assistant, built on first event and reused thereafter. */
  private skillOwners: Map<string, string> | null = null;

  constructor(
    private readonly toolRegistry: Map<string, Tool> | null,
    eventLog: EventLog,
    private readonly nestedExecutor: NestedExecutor,
  ) {
    this.eventLog = eventLog;
    this.getTriggerEngine();
  }

  private getTriggerEngine(): TriggerExecutionEngine {
    if (!this.triggerEngine) {
      // Same Map instance as toolRegistry when present, so tools registered
      // later are visible without rebuilding the engine.
      this.triggerEngine = new TriggerExecutionEngine(this.toolRegistry || new Map<string, Tool>());
      this.triggerEngine.registerConsumer('event', (toolId, trigger) => this.onEventTrigger(toolId, trigger));
    }
    return this.triggerEngine;
  }

  /**
   * Consumer for `kind: 'event'` triggers. Reached via TriggerExecutionEngine so
   * the declared trigger metadata (not the raw emit call) decides what runs, and
   * the engine's validation still applies.
   */
  private async onEventTrigger(toolId: string, trigger: SkillTrigger): Promise<void> {
    const tool = this.toolRegistry?.get(toolId);
    if (!tool) return;
    const eventId = trigger.kind === 'event' ? trigger.eventId : undefined;
    const payload = eventId ? this.recentEventPayloads.get(eventId) : undefined;
    await this.dispatchEventTrigger(tool, payload);
  }

  /** Every event id a tool announces on completion. Never empty: a run with no
   * declared id still announces the derived completion event for its assistant. */
  private getEmitEventIds(tool: Tool, assistantId?: string): string[] {
    const declared = declaredEventIds(tool);
    return declared.length > 0 ? declared : [completionEventId(assistantId ?? '', tool.id)];
  }

  /**
   * Every tool that subscribes to `eventId` with a machine-readable `eventId` on
   * its trigger. Skills that declare `kind: 'event'` with only prose `on:` text
   * are deliberately excluded: there is no way to match prose to an emit.
   */
  findDownstreamEventTriggers(eventId: string, emitterId?: string): Tool[] {
    if (!this.toolRegistry || !eventId) return [];
    const downstream: Tool[] = [];
    for (const tool of this.toolRegistry.values()) {
      // Never route an event back to the Skill that announced it. A self
      // subscription is a real hazard rather than a theoretical one: it makes
      // the Skill run a second time for a single user action, which for a
      // `represent` Skill means sending the message or filing the application
      // twice.
      if (emitterId !== undefined && tool.id === emitterId) continue;
      const triggers = tool.triggers || [];
      const subscribed = triggers.some((trigger) => trigger.kind === 'event' && trigger.eventId === eventId);
      if (subscribed) downstream.push(tool);
    }
    return downstream;
  }

  /**
   * Run a downstream skill with the upstream result as its input. Resolves
   * rather than rejects on failure: a downstream skill that breaks must not
   * fail the upstream one that triggered it.
   */
  async dispatchEventTrigger(tool: Tool, upstreamData: unknown, workspaceId?: string): Promise<void> {
    // Keyed on the tool alone: a nested re-entry of the same Skill is a cycle
    // whatever ids are involved.
    const chainKey = tool.id;
    if (this.eventDispatchChain.has(chainKey)) {
      logger.warn({ toolId: tool.id }, 'Skipping event dispatch: cycle already in progress');
      return;
    }

    this.eventDispatchChain.add(chainKey);
    try {
      const result = await this.nestedExecutor(tool.id, { upstreamData, workspaceId });
      if (result && result.success === false) {
        logger.warn({ toolId: tool.id, error: result.error }, 'Downstream event-triggered skill reported failure');
      }
    } catch (err) {
      logger.error({ toolId: tool.id, err: err instanceof Error ? err.message : String(err) }, 'Downstream event dispatch threw');
    } finally {
      this.eventDispatchChain.delete(chainKey);
    }
  }

  /**
   * Announce a run that did not complete, so a failure is not silent.
   *
   * `failed` means the run was attempted and broke. `aborted` means it never got
   * that far — awaiting confirmation, missing credentials, invalid config. Both
   * are dispatched to subscribers exactly like a completion, so an Assistant can
   * react to a Skill that did not deliver rather than discovering it downstream.
   */
  dispatchOutcomeEvent(
    tool: Tool,
    status: 'failed' | 'aborted',
    error: string,
    workspaceId?: string,
    assistantId?: string,
    executionId?: string,
  ): void {
    const owningAssistant = this.owningAssistantId(tool, assistantId);
    const event = buildOutcomeEvent({
      tool,
      assistantId: owningAssistant,
      status,
      error,
      ...(executionId ? { executionId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      emittedAt: new Date(),
    });

    void this.eventLog.append(event).catch((err) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Outcome event log append failed');
    });

    const downstream = this.findDownstreamEventTriggers(event.id, tool.id);
    if (downstream.length === 0) {
      logger.debug({ toolId: tool.id, status, eventId: event.id }, 'No downstream subscribers for outcome event');
      return;
    }

    logger.info(
      { toolId: tool.id, status, eventId: event.id, downstream: downstream.map((t) => t.id) },
      'Dispatching outcome event to downstream skills',
    );
    for (const target of downstream) {
      void this.dispatchEventTrigger(target, { status, error, skillId: tool.id }, workspaceId);
    }
  }

  /**
   * Announce a completed run and fire every downstream subscriber of each outcome.
   *
   * A run announces one event per declared outcome, not one per run. A Skill that
   * books an appointment and sends a confirmation has two changes, and announcing
   * only the first leaves the second invisible to everything watching for it. All
   * events from one run share an `executionId`, so a consumer can tell they came
   * from a single execution.
   *
   * A dry run announces only the derived completion event. It did finish, but the
   * change its declared ids name did not happen, and announcing that anyway is how
   * `finance.report.published` came to fire for reports that were never delivered.
   *
   * Dispatch is fire-and-forget by design: the upstream result is already resolved
   * and the caller must not wait on (or inherit failures from) the chain it just
   * triggered. The same is true of the log write.
   */
  dispatchUpstreamEvents(
    tool: Tool,
    output: unknown,
    workspaceId?: string,
    assistantId?: string,
    executionId?: string,
    input?: Record<string, unknown>,
    writes?: StoreWrite[],
  ): void {
    const owningAssistant = this.owningAssistantId(tool, assistantId);
    const dryRun = isDryRun(input, output);
    // `writes` is only ever set on a successful run, so a Skill that wrote records
    // and then failed announces nothing. A declared id still wins inside
    // `announcedEventIds`, so curating an event never yields a second, derived one
    // for the same change.
    const { ids, rejected } = announcedEventIds(tool, owningAssistant, output, writes);
    for (const id of rejected) {
      logger.warn(
        { toolId: tool.id, eventId: id },
        'Run reported an emittedEvent the Skill does not declare; dropped so the event graph stays checkable',
      );
    }

    const events = buildCompletionEvents({
      tool,
      assistantId: owningAssistant,
      ...(executionId ? { executionId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      data: output,
      emittedAt: new Date(),
      derivedOnly: dryRun,
      // A dry run announces completion only, so it must not narrow to the ids.
      ...(dryRun ? {} : { ids }),
    });

    const dispatched = new Set<string>();
    for (const event of events) {
      // Kept for the in-process path: a downstream Skill reads its upstream payload
      // synchronously, right after the upstream finishes.
      this.recentEventPayloads.set(event.id, output);

      void this.eventLog.append(event).catch((err) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Event log append failed');
      });

      const downstream = this.findDownstreamEventTriggers(event.id, tool.id);
      if (downstream.length === 0) {
        logger.debug({ toolId: tool.id, eventId: event.id }, 'Event emitted with no downstream subscribers');
        continue;
      }

      logger.info(
        { toolId: tool.id, eventId: event.id, downstream: downstream.map((t) => t.id) },
        'Dispatching event to downstream skills',
      );
      for (const target of downstream) {
        // Two declared ids can share a subscriber; run it once for this execution.
        if (dispatched.has(target.id)) continue;
        dispatched.add(target.id);
        void this.dispatchEventTrigger(target, output, workspaceId);
      }
    }
  }

  /**
   * The assistant a Skill belongs to, used to namespace its derived event id.
   *
   * Ownership, not the assistant that happened to run it: the same Skill can be
   * executed by the watch runner, a scheduled tick, or a user, and a derived event
   * id that changed with the caller would be a different event every time. So the
   * owning workflow is looked up first and the run's assistant id is only a
   * fallback for a Skill that belongs to none.
   */
  private owningAssistantId(tool: Tool, runAssistantId?: string): string {
    if (!this.skillOwners) {
      const owners = new Map<string, string>();
      for (const workflow of allWorkflows) {
        for (const skill of workflow.skills ?? []) {
          if (!owners.has(skill.id)) owners.set(skill.id, workflow.assistant.trim().toLowerCase());
        }
      }
      this.skillOwners = owners;
    }
    return this.skillOwners.get(tool.id) ?? runAssistantId ?? 'unassigned';
  }
}