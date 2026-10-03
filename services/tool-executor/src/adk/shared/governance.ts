import { Tool } from '../../types';

export interface GovernanceOptions {
  confirmBeforeSend?: boolean;
  tier?: 'advise' | 'aid' | 'represent';
}

/**
 * Wraps a Tool / Skill with standardized governance fields.
 * Enforces confirmBeforeSend across both top-level tool properties and the tool manifest,
 * avoiding mismatch issues between tool classification tests and runtime execution.
 */
export function withGovernance(skill: Tool, opts: GovernanceOptions = {}): Tool {
  const tier = opts.tier ?? skill.tier;
  const needsConfirmation = tier === 'represent' || opts.confirmBeforeSend === true || skill.confirmBeforeSend === true;

  const updatedManifest = {
    ...(skill.manifest || {}),
    ...(needsConfirmation ? { confirmBeforeSend: true } : {}),
  };

  return {
    ...skill,
    confirmBeforeSend: needsConfirmation ? true : skill.confirmBeforeSend,
    tier,
    manifest: updatedManifest,
  };
}
