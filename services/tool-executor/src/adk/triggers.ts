/**
 * Triggers and dynamic trigger adaptation (ADK_OVERVIEW.md §3.2,
 * ADK_DEVELOPER_GUIDE.md §8).
 *
 * A trigger declared in a Skill is part of the immutable blueprint. A trigger
 * a *user* asks for at runtime ("run this competitor search every Monday at 9")
 * is not: adapting a Skill never edits the folder, it writes a Dynamic Trigger
 * Record into instance persistence, which the scheduler and event monitor
 * evaluate alongside the blueprint triggers.
 *
 * The record shape below is the whole contract between that adaptation and the
 * runtime. Nothing here writes to Mongo itself — it is the pure model, so it can
 * be validated and tested without a database.
 */

import type { SkillTrigger } from '../types';
import type { GovernanceTier } from './types';
import { deriveApproval, requiresApproval } from './gates';

export type TriggerKind = SkillTrigger['kind'];

export const TRIGGER_KINDS: TriggerKind[] = ['user', 'schedule', 'event'];

export interface DynamicTriggerRecord {
  /** Stable identifier for the persisted record. */
  id: string;
  /** Skill this record adapts. The blueprint is not modified. */
  skillId: string;
  assistantId: string;
  kind: Extract<SkillTrigger, { kind: 'schedule' } | { kind: 'event' }>;
  /** Tier captured at the moment the record was written. */
  tier: GovernanceTier;
  /** Input the scheduler supplies when the adapted trigger fires. */
  input: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Free-form provenance, e.g. the chat message that requested it. */
  origin?: string;
}

export interface TriggerIssue {
  skillId: string;
  message: string;
}

/**
 * Checks the native triggers declared on a Skill.
 *
 * The `data` kind predates the Overview's three explicit mechanisms and has no
 * runtime behind it, so it is reported rather than silently accepted: a Skill
 * whose only trigger is `data` would appear in the Overview panel and then never
 * fire.
 */
export function validateNativeTriggers(skillId: string, triggers: SkillTrigger[] | undefined): TriggerIssue[] {
  const issues: TriggerIssue[] = [];
  const list = triggers ?? [];

  if (list.length === 0) {
    issues.push({ skillId, message: 'declares no trigger; an unreachable Skill cannot be run' });
    return issues;
  }

  for (const trigger of list) {
    switch (trigger.kind) {
      case 'user':
        if (!Array.isArray(trigger.phrase_examples) || trigger.phrase_examples.length === 0) {
          issues.push({ skillId, message: 'user trigger needs at least one phrase_example' });
        }
        break;
      case 'schedule':
        if (typeof trigger.cadence !== 'string' || trigger.cadence.trim() === '') {
          issues.push({ skillId, message: 'schedule trigger needs a cadence' });
        }
        break;
      case 'event':
        if (typeof trigger.on !== 'string' || trigger.on.trim() === '') {
          issues.push({ skillId, message: 'event trigger needs the event it subscribes to' });
        }
        break;
      case 'data':
        issues.push({
          skillId,
          message:
            '`data` triggers are not one of the native mechanisms (user / schedule / event); express it as an event trigger on the collection change',
        });
        break;
      default:
        issues.push({ skillId, message: `unknown trigger kind "${String((trigger as any).kind)}"` });
    }
  }

  return issues;
}

export interface CreateDynamicTriggerInput {
  id: string;
  skillId: string;
  assistantId: string;
  kind: DynamicTriggerRecord['kind'];
  input?: Record<string, unknown>;
  tier: GovernanceTier;
  origin?: string;
  now?: Date;
}

/**
 * Builds a Dynamic Trigger Record.
 *
 * A user-triggered Skill is the only thing that can be adapted — the Overview
 * starts from a Skill the user pressed, and turns it into a recurring one. An
 * adaptation of a `represent` Skill stays gated on every single run, so the
 * record carries the tier forward instead of letting a schedule look like a
 * standing authorisation.
 */
export function createDynamicTriggerRecord(input: CreateDynamicTriggerInput): DynamicTriggerRecord {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.id,
    skillId: input.skillId,
    assistantId: input.assistantId,
    kind: input.kind,
    tier: input.tier,
    input: input.input ?? {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...(input.origin ? { origin: input.origin } : {}),
  };
}

/** Whether a run of this Skill needs an approval card before its handler runs. */
export function dynamicRunRequiresApproval(record: Pick<DynamicTriggerRecord, 'tier'>): boolean {
  return requiresApproval(record.tier);
}

/** The gate that applies to one run of an adapted trigger. */
export function dynamicRunGate(record: Pick<DynamicTriggerRecord, 'tier'>) {
  return deriveApproval(record.tier);
}

/**
 * Blueprint triggers plus persisted records, evaluated together.
 *
 * Order matters for determinism only: a blueprint trigger is authoritative and
 * a dynamic record for the same Skill and kind is merged onto it rather than
 * replacing it, so adapting a Skill adds a run without silently dropping the
 * one the blueprint declared.
 */
export function effectiveTriggers(
  blueprint: SkillTrigger[],
  records: DynamicTriggerRecord[],
): Array<{ source: 'blueprint' | 'dynamic'; trigger: SkillTrigger; recordId?: string }> {
  const effective: Array<{ source: 'blueprint' | 'dynamic'; trigger: SkillTrigger; recordId?: string }> = blueprint.map(
    (trigger) => ({ source: 'blueprint', trigger }),
  );

  for (const record of records) {
    if (!record.enabled) continue;
    effective.push({ source: 'dynamic', trigger: record.kind, recordId: record.id });
  }

  return effective;
}
