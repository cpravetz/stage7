/**
 * Risk-driven approval (ADK_OVERVIEW.md §2.4, ADK_DEVELOPER_GUIDE.md §2.2).
 *
 * The single rule this module exists to enforce: the tier *is* the gate. There
 * is no `confirmBeforeSend` field for an author to set, no manifest override,
 * and no way to disable the policy for a schedule or event run.
 *
 * `deriveApproval` is therefore a pure function of the tier, and
 * `assertNoManualGate` is what `adk:validate` calls against every definition so
 * a blueprint that reintroduces the old field fails its own test rather than
 * quietly shipping a bypass.
 */

import type { Tool } from '../types';
import type { GovernanceTier } from './types';
import { isGovernanceTier } from './types';

export { isGovernanceTier };
export type { GovernanceTier };

export interface ApprovalGate {
  /** The runtime policy name surfaced in the harness and the approval card. */
  policy: 'confirmBeforeSend';
  requiresConfirmation: boolean;
  /** Whether a dry run is offered as an alternative to approving. */
  dryRunAllowed: boolean;
  tier: GovernanceTier;
}

const TIER_BEHAVIOUR: Record<GovernanceTier, Omit<ApprovalGate, 'tier'>> = {
  // Reads state, produces assessments. Nothing leaves the system, so nothing to
  // gate.
  advise: { policy: 'confirmBeforeSend', requiresConfirmation: false, dryRunAllowed: false },
  // Produces a work product the user reviews and delivers themselves. The
  // handler must never deliver externally, so there is no gate either — the
  // user's own send IS the approval.
  aid: { policy: 'confirmBeforeSend', requiresConfirmation: false, dryRunAllowed: true },
  // Acts on an external system on the user's behalf. Mandatory gate, every run,
  // regardless of trigger kind.
  represent: { policy: 'confirmBeforeSend', requiresConfirmation: true, dryRunAllowed: true },
};

/**
 * Derives the approval gate for a tier. The result is a constant of the tier,
 * which is exactly the point: two Skills with the same tier cannot disagree
 * about whether they are gated.
 */
export function deriveApproval(tier: GovernanceTier): ApprovalGate {
  return { tier, ...TIER_BEHAVIOUR[tier] };
}

/** True when a Skill at this tier is halted before its handler runs. */
export function requiresApproval(tier: unknown): boolean {
  return isGovernanceTier(tier) && TIER_BEHAVIOUR[tier].requiresConfirmation;
}

/**
 * True when a Skill at this tier is allowed to reach an external system.
 *
 * `aid` returns false by policy: it co-creates a work product the user sends,
 * and a handler that delivers from inside an `aid` Skill has mistaken its own
 * tier. `adk:validate` uses this to flag `aid` Skills declaring outbound
 * delivery config.
 */
export function mayDeliverExternally(tier: unknown): boolean {
  return tier === 'represent';
}

/**
 * Action ids that only read. Every other declared action is treated as writing.
 *
 * The set is deliberately small and each entry is a reviewable claim about a
 * named capability, because getting it wrong in the permissive direction removes
 * an approval prompt from a real write. Adding an entry is a product decision.
 */
export const READ_ONLY_EXTERNAL_ACTIONS: ReadonlySet<string> = new Set([
  'market-research',
  'parse_document',
  'audit-seo',
  'search-resources',
]);

/** Whether a Skill declares a named external action at all. */
export function declaresExternalAction(tool: Pick<Tool, 'manifest'>): boolean {
  const manifest = tool.manifest as Record<string, unknown> | undefined;
  const system = manifest?.system;
  const action = manifest?.action;
  return typeof system === 'string' && system !== '' && typeof action === 'string' && action !== '';
}

/**
 * Whether a Skill declares an external action that can change remote state.
 *
 * `analyze*` is read-only by name, as are the individually reviewed ids in
 * {@link READ_ONLY_EXTERNAL_ACTIONS}. Everything else — publish, send-*, manage_*,
 * execute, generate-*, schedule_*, ops — writes, and is assumed to until proven
 * otherwise, because a missing approval prompt is the failure that matters.
 */
export function declaresMutatingExternalAction(tool: Pick<Tool, 'manifest'>): boolean {
  if (!declaresExternalAction(tool)) return false;
  const action = (tool.manifest as Record<string, unknown>).action as string;
  return !action.startsWith('analyze') && !READ_ONLY_EXTERNAL_ACTIONS.has(action);
}

/**
 * The effective gate for a Skill, which is not always its tier.
 *
 * A `represent` Skill is gated. So is anything that declares a mutating external
 * action, whatever tier it claims: an `aid` Skill that writes to an external
 * system has misclassified itself, and the safe reading of that is the strict
 * one. `adk:validate` reports those separately, so the mismatch gets fixed at
 * the definition site rather than being normalised away here.
 */
export function effectiveGate(tool: Pick<Tool, 'tier' | 'manifest'>): { gated: boolean; reason: 'tier' | 'mutating-action' | 'none' } {
  if (isGovernanceTier(tool.tier) && TIER_BEHAVIOUR[tool.tier].requiresConfirmation) {
    return { gated: true, reason: 'tier' };
  }
  if (declaresMutatingExternalAction(tool)) {
    return { gated: true, reason: 'mutating-action' };
  }
  return { gated: false, reason: 'none' };
}

export interface ManualGateFinding {
  path: string;
  message: string;
}

/**
 * Reports any attempt to declare the approval gate by hand.
 *
 * Covers the three places it has historically appeared: the factory options
 * object, the top-level Skill field, and `manifest.confirmBeforeSend`.
 */
export function assertNoManualGate(
  candidate: Record<string, any>,
  path: string,
): ManualGateFinding[] {
  const findings: ManualGateFinding[] = [];
  const declared = candidate?.confirmBeforeSend;

  if (declared !== undefined) {
    findings.push({
      path: `${path}.confirmBeforeSend`,
      message:
        'the approval gate is derived from `tier` and cannot be declared; remove this field (a `represent` Skill is gated automatically)',
    });
  }

  if (isPlain(candidate?.manifest) && candidate.manifest.confirmBeforeSend !== undefined) {
    findings.push({
      path: `${path}.manifest.confirmBeforeSend`,
      message: 'the approval gate is derived from `tier` and cannot be declared on the manifest either',
    });
  }

  return findings;
}

/**
 * Reports a gate written by hand in a capability's source.
 *
 * The constructed Skill always carries `confirmBeforeSend`, because the factory
 * stamps the derived value onto it, so inspecting the Tool cannot tell an author
 * declaration from a derived field. The source can: a hand-written gate is a
 * property assignment or a `X.confirmBeforeSend = ...` statement, and nothing
 * the factory emits looks like that in a definition file.
 *
 * Kept alongside {@link assertNoManualGate} rather than replacing it: a caller
 * holding a plain object with no source still needs the object-level check.
 */
export function findManualGateDeclarations(source: string, file: string): ManualGateFinding[] {
  const findings: ManualGateFinding[] = [];
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;

    // `confirmBeforeSend: ...` in an options or manifest object
    if (/^\s*confirmBeforeSend\s*:/.test(line)) {
      findings.push({
        path: at,
        message:
          'declares the approval gate by hand; remove it. The gate is derived from `tier` and from the external action the Skill declares',
      });
      return;
    }

    // `SOME_SKILL.confirmBeforeSend = true` after construction
    const assigned = /^\s*[A-Za-z_$][\w$.]*\.confirmBeforeSend\s*=/.exec(line);
    if (assigned) {
      findings.push({
        path: at,
        message:
          'assigns the approval gate after construction; remove the assignment and set `tier` on the definition instead',
      });
    }
  });

  return findings;
}

/**
 * Config properties that must never live in `configSchema` because they exist
 * to let a user opt out of a policy gate (checklist §4.3).
 */
const OPT_OUT_CONFIG_KEYS = new Set(['confirmBeforeSend', 'skipConfirmation', 'autoApprove', 'bypassApproval']);

export function assertNoGateOptOutConfig(configSchema: unknown, path: string): ManualGateFinding[] {
  if (!isPlain(configSchema) || !isPlain(configSchema.properties)) return [];
  return Object.keys(configSchema.properties)
    .filter((key) => OPT_OUT_CONFIG_KEYS.has(key))
    .map((key) => ({
      path: `${path}.configSchema.properties.${key}`,
      message: 'configuration may not switch off the runtime approval gate',
    }));
}

/**
 * The value stamped onto a Skill after construction.
 *
 * The executor still reads `tool.confirmBeforeSend` and
 * `tool.manifest.confirmBeforeSend` because both are pre-existing runtime
 * contract; the factory is the single place that writes them, and it writes
 * only what the tier implies.
 */
export function gateFieldsFor(tier: GovernanceTier): { confirmBeforeSend: boolean } {
  return { confirmBeforeSend: TIER_BEHAVIOUR[tier].requiresConfirmation };
}

/**
 * The gate fields stamped onto a constructed Skill.
 *
 * Tier is the intended answer; a declared mutating external action is the
 * backstop for a Skill whose tier does not match what its handler does. Taking
 * the stricter of the two can only ever add an approval prompt, never remove one.
 */
export function gateFields(tool: Pick<Tool, 'tier' | 'manifest'>): { confirmBeforeSend: boolean } {
  return { confirmBeforeSend: effectiveGate(tool).gated };
}

function isPlain(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Re-derives the cached gate fields from whatever `tier` a Skill currently has.
 *
 * The factory does this at construction. This exists for the case where a
 * catalog sets a Skill's tier after the factory ran — the gate has to follow the
 * tier regardless, otherwise a Skill that ends up `represent` would ship
 * ungated. Calling it after any tier assignment is what keeps the two in step;
 * it can never loosen the gate, only tighten it to match a stricter tier.
 */
export function withDerivedGate<T extends Pick<Tool, 'tier' | 'manifest'>>(tool: T): T {
  return { ...tool, ...gateFields(tool) };
}

/**
 * Reads the gate off a constructed Skill, preferring the tier as the source of
 * truth and treating the fields as a cached projection of it.
 */
export function gateOf(tool: Pick<Tool, 'tier' | 'manifest' | 'confirmBeforeSend'>): ApprovalGate {
  if (!isGovernanceTier(tool.tier)) {
    // A Skill with no tier is not "unrestricted"; it is unclassifiable, and the
    // safe reading is the strictest one until it is fixed.
    return { tier: 'represent', ...TIER_BEHAVIOUR.represent };
  }
  if (effectiveGate(tool).reason === 'mutating-action') {
    // The tier says ungated but the Skill declares a write. Report the strict
    // policy so the caller gates, and let adk:validate flag the mismatch.
    return { ...TIER_BEHAVIOUR.represent, tier: tool.tier } as ApprovalGate;
  }
  return deriveApproval(tool.tier);
}
