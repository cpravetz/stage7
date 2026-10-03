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
export function withDerivedGate<T extends Pick<Tool, 'tier'>>(tool: T): T {
  if (!isGovernanceTier(tool.tier)) return tool;
  const gate = TIER_BEHAVIOUR[tool.tier];
  return { ...tool, confirmBeforeSend: gate.requiresConfirmation };
}

/**
 * Reads the gate off a constructed Skill, preferring the tier as the source of
 * truth and treating the fields as a cached projection of it.
 */
export function gateOf(tool: Pick<Tool, 'tier' | 'confirmBeforeSend'>): ApprovalGate {
  if (!isGovernanceTier(tool.tier)) {
    // A Skill with no tier is not "unrestricted"; it is unclassifiable, and the
    // safe reading is the strictest one until it is fixed.
    return { tier: 'represent', ...TIER_BEHAVIOUR.represent };
  }
  return deriveApproval(tool.tier);
}
