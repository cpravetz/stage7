import { SkillTrigger, Tool } from '../types';
import { validateTriggers, exportTriggerSummary, TriggerValidationResult } from '../utils/triggerMetadata';
import logger from '../utils/logger';

export interface TriggerConsumer {
  (toolId: string, trigger: SkillTrigger): void | Promise<void>;
}

export interface TriggerDispatchResult {
  toolId: string;
  trigger: SkillTrigger;
  dispatched: boolean;
  validation?: TriggerValidationResult;
}

export interface TriggerKindStatus {
  kind: string;
  declared: number;
  hasConsumer: boolean;
  valid: boolean;
  errorCount: number;
}

/**
 * TriggerExecutionEngine wires declared trigger metadata into a dispatchable runtime.
 *
 * Current state: Trigger metadata is declared across all 21 assistants (see
 * `validateTriggers` / `exportTriggerSummary`), but no scheduler, event bus, or
 * runtime trigger consumer dispatches it at runtime. This engine provides the
 * dispatch infrastructure that a future scheduler/event bus can plug into.
 *
 * Phase 1 (this file): Aggregation, validation, and dispatch registration.
 * Phase 2 (future): Scheduler, event bus, and consumer wiring per the roadmap.
 */
export class TriggerExecutionEngine {
  private tools: Map<string, Tool>;
  private consumers: Map<string, TriggerConsumer[]>;

  constructor(tools: Tool[] | Map<string, Tool>) {
    if (tools instanceof Map) {
      this.tools = tools;
    } else {
      this.tools = new Map(tools.map((t) => [t.id, t]));
    }
    this.consumers = new Map();
    logger.info({ toolCount: this.tools.size }, 'TriggerExecutionEngine initialized');
  }

  /** Register a consumer callback for a specific trigger kind (e.g., 'user', 'schedule', 'event', 'data'). */
  registerConsumer(kind: string, consumer: TriggerConsumer): void {
    if (!this.consumers.has(kind)) {
      this.consumers.set(kind, []);
    }
    this.consumers.get(kind)!.push(consumer);
    logger.info({ kind }, 'Trigger consumer registered');
  }

  /** Get all triggers from all registered tools, keyed by tool ID. */
  getAllTriggers(): Map<string, SkillTrigger[]> {
    const result = new Map<string, SkillTrigger[]>();
    for (const [toolId, tool] of this.tools) {
      if (tool.triggers && tool.triggers.length > 0) {
        result.set(toolId, tool.triggers);
      }
    }
    return result;
  }

  /** Validate all declared triggers across all tools using triggerMetadata utilities. */
  validateAllTriggers(): Map<string, TriggerValidationResult> {
    const results = new Map<string, TriggerValidationResult>();
    for (const [toolId, triggers] of this.getAllTriggers()) {
      results.set(toolId, validateTriggers(triggers));
    }
    return results;
  }

  /** Get a summary of all triggers (human-readable descriptions per kind). */
  getTriggerSummary(): Map<string, { kind: string; summary: string }[]> {
    const summary = new Map<string, { kind: string; summary: string }[]>();
    for (const [toolId, triggers] of this.getAllTriggers()) {
      summary.set(toolId, exportTriggerSummary(triggers));
    }
    return summary;
  }

  /** Get the execution status of each trigger kind (declared count, has consumer, valid). */
  getKindStatus(): TriggerKindStatus[] {
    const allTriggers: SkillTrigger[] = [];
    for (const triggers of this.getAllTriggers().values()) {
      allTriggers.push(...triggers);
    }

    const kindCounts = new Map<string, number>();
    for (const trigger of allTriggers) {
      kindCounts.set(trigger.kind, (kindCounts.get(trigger.kind) || 0) + 1);
    }

    const validation = this.validateAllTriggers();
    let totalValid = 0;
    let totalErrorCount = 0;
    for (const result of validation.values()) {
      if (result.valid) totalValid++;
      totalErrorCount += result.errorCount;
    }

    const kinds = ['user', 'schedule', 'event', 'data'];
    return kinds.map((kind) => ({
      kind,
      declared: kindCounts.get(kind) || 0,
      hasConsumer: (this.consumers.get(kind)?.length ?? 0) > 0,
      valid: totalValid === validation.size && totalErrorCount === 0,
      errorCount: totalErrorCount,
    }));
  }

  /**
   * Dispatch a single trigger for a specific tool.
   * Returns dispatched: false if no consumer is registered for this trigger kind
   * (confirming that triggers are declared but not yet executed at runtime).
   */
  async dispatch(toolId: string, trigger: SkillTrigger): Promise<TriggerDispatchResult> {
    const validation = validateTriggers([trigger]);
    const consumers = this.consumers.get(trigger.kind) || [];

    if (consumers.length === 0) {
      logger.warn({ toolId, triggerKind: trigger.kind }, 'No consumer registered for trigger kind — declared but not executed');
      return { toolId, trigger, dispatched: false, validation };
    }

    for (const consumer of consumers) {
      try {
        await consumer(toolId, trigger);
        logger.info({ toolId, triggerKind: trigger.kind }, 'Trigger dispatched to consumer');
      } catch (err) {
        logger.error({ toolId, triggerKind: trigger.kind, error: String(err) }, 'Trigger dispatch failed');
      }
    }

    return { toolId, trigger, dispatched: true, validation };
  }

  /**
   * Dispatch all triggers for a specific tool.
   * Returns results for each trigger; triggers without consumers are marked as not dispatched.
   */
  async dispatchAll(toolId: string): Promise<TriggerDispatchResult[]> {
    const triggers = this.getAllTriggers().get(toolId) || [];
    return Promise.all(triggers.map((trigger) => this.dispatch(toolId, trigger)));
  }

  /**
   * Dispatch all triggers across all tools that have a registered consumer.
   * Useful as the entry point for a scheduler or event bus to trigger execution.
   */
  async dispatchAllTools(): Promise<TriggerDispatchResult[]> {
    const results: TriggerDispatchResult[] = [];
    for (const toolId of this.tools.keys()) {
      const toolResults = await this.dispatchAll(toolId);
      results.push(...toolResults.filter((r) => r.dispatched));
    }
    return results;
  }
}
