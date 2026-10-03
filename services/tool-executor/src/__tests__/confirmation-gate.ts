import { Tool } from '../types';
import { declaresExternalAction, declaresMutatingExternalAction, effectiveGate } from '../adk/gates';

/**
 * Shared predicate for "this skill mutates external state, so the runtime
 * confirmation gate has to fire before it runs".
 *
 * The previous predicate was a prose substring match on `description`
 * ('send', 'publish', 'schedule', 'apply', 'remediate', 'execute', 'mutating',
 * 'action'). Prose is not a behaviour signal: it matched
 * `scriptwriting-scene-beat-dialogue-copilot` because a screenplay contains
 * ACTION lines, and `analytics-adhoc-query-evaluator` because a warehouse
 * query is "executed". This module uses the two signals the runtime actually
 * honours.
 *
 * 1. `tier === 'represent'` — the declared "acts on the user's behalf" tier.
 *    The design rule is that represent-tier skills REQUIRE confirmBeforeSend;
 *    this is asserted separately in skill-classification.test.ts.
 *
 * 2. A declared external-action contract (`manifest.system` + `manifest.action`).
 *    Those identifiers are structured data written by the skill author next to
 *    the endpoint it dispatches to, not prose. The discriminator is the
 *    declared action id, and it is FAIL-CLOSED: an action is treated as
 *    mutating unless it is positively declared read-only, because a
 *    confirmation gate must default to asking rather than to staying quiet.
 *    `analyze*` reports on data; `market-research` and `parse_document` only
 *    read. Everything else (publish, send-*, manage_*, execute, generate-*,
 *    schedule_*, ops, ...) writes to the connected system.
 *
 * No entry in READ_ONLY_EXTERNAL_ACTIONS may be a verb that changes remote
 * state. Adding one is a product decision and must be justified in review.
 */
export const READ_ONLY_EXTERNAL_ACTIONS: ReadonlySet<string> = new Set([
  'market-research',
  'parse_document',
]);

/** True when the skill can change state the user cares about. */
export function isMutatingSkill(skill: Tool): boolean {
  return effectiveGate(skill).gated;
}

export { declaresExternalAction, declaresMutatingExternalAction };

/**
 * The gate is a dual read (src/services/ToolExecutor.ts:514-519): a skill
 * satisfies it if EITHER location is set.
 */
export function enforcesConfirmation(skill: Tool): boolean {
  // Derived, so the Tool field is the single source. The manifest read is kept
  // only for a Skill built by hand outside the factory.
  return skill.confirmBeforeSend === true || skill.manifest?.confirmBeforeSend === true;
}

/**
 * The single question every governance test asks: may this skill run without an
 * approval prompt? A skill is correctly gated when it does not mutate, or when
 * it enforces the gate itself.
 *
 * There used to be a third clause here: a base tool "inherited" the gate from a
 * gated parent that dispatches it, and was therefore allowed to stay ungated.
 * That clause described a real runtime defect, not a governance property.
 * `nestedExecutorCallback` re-derived the callee's confirmation requirement from
 * scratch, AFTER the caller had already cleared its own gate, so a gated parent
 * could never live-execute a gated child and a gated transport (the publishing
 * and job-application executors are exactly that shape) had to be left ungated to
 * keep the approved path working at all. The approval the user gave was
 * discarded and re-demanded at a layer they cannot act on.
 *
 * Approval now propagates: an approved execution carries its approval into the
 * nested call, and an unapproved one is still refused
 * (src/services/ToolExecutor.ts `enforceConfirmation` / `nestedExecutorCallback`;
 * both branches are pinned in nested-execution.test.ts). A gated callee is
 * therefore reachable from an approved gated parent, and gating a transport is
 * both safe and required when the transport can also be invoked directly. The
 * clause is gone deliberately and must not be reintroduced.
 */
export function isCorrectlyGated(skill: Tool, _siblings: Tool[]): boolean {
  if (!isMutatingSkill(skill)) return true;
  return enforcesConfirmation(skill);
}
