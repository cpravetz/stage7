import { Tool } from '../../types';
import { gateFieldsFor, isGovernanceTier } from '../gates';

/**
 * Wraps a Tool / Skill with standardized governance fields.
 *
 * The gate is derived from the tier and from nothing else. An earlier version of
 * this helper OR-ed in the author's `confirmBeforeSend` and copied it onto the
 * manifest, which meant a blueprint could raise or lower its own gate and the
 * manifest and the top-level field could disagree. Both fields are now written
 * from the tier alone, so `withGovernance` cannot produce a mismatch.
 */
export function withGovernance(skill: Tool, tier?: Tool['tier']): Tool {
  const resolved = isGovernanceTier(tier) ? tier : skill.tier;
  const gate = isGovernanceTier(resolved) ? gateFieldsFor(resolved) : { confirmBeforeSend: false };

  return {
    ...skill,
    ...gate,
    tier: resolved,
  };
}