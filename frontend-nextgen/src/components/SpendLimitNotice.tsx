import { useState } from 'react';
import { useSpendLimitStore } from '../stores/spendLimitStore';
import { formatResumption, formatUsage } from '../utils/spendLimits';

/**
 * Global notice rendered while the user's LLM spending limit has paused
 * activity. Follows the MissionInputAlert pattern: an alert-style aside with
 * a dismiss button. Layout keys it by pathname, so a dismissed notice
 * reappears on navigation until the flag is cleared by a successful
 * completion after the period rolls over.
 */
export default function SpendLimitNotice() {
  const refusal = useSpendLimitStore((state) => state.refusal);
  const [dismissed, setDismissed] = useState(false);

  if (!refusal || dismissed) return null;

  return (
    <aside className="mission-input-alert" role="alert" aria-live="assertive">
      <button
        className="close-btn"
        aria-label="Close"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
      <strong>LLM spending limit reached</strong>
      <div className="mission-input-alert-item">
        <span>
          Model activity is paused: {formatUsage(refusal.spent, refusal.limit, refusal.period)}.
          Activity resumes {formatResumption(refusal.periodEnd)}.
        </span>
      </div>
    </aside>
  );
}
