import { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import {
  formatUsage,
  type SpendPeriod,
  type SpendUsage,
  type UserSpendLimit,
} from '../utils/spendLimits';

/** GET /api/brain/spend-limits/me response (Brain spend-limits route). */
interface SpendLimitsMe {
  limit: UserSpendLimit | null;
  usage: SpendUsage | null;
}

const PERIOD_LABELS: Record<SpendPeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

function parseAmount(raw: string): number | undefined {
  const parsed = Number(raw);
  return raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * "LLM spending limit" card for the Settings page: the estimated-USD cap,
 * its period, current estimated usage, and clear/disable. Saves optimistically
 * through the authenticated API client; a failed save reverts the local value
 * and surfaces the error.
 */
export default function SpendLimitCard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedLimit, setSavedLimit] = useState<UserSpendLimit | null>(null);
  const [usage, setUsage] = useState<SpendUsage | null>(null);

  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<SpendPeriod>('month');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    apiClient.get<SpendLimitsMe>('/api/brain/spend-limits/me')
      .then((res) => {
        if (cancelled) return;
        setSavedLimit(res.limit);
        setUsage(res.usage);
        if (res.limit) {
          setAmount(String(res.limit.limit));
          setPeriod(res.limit.period);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load spending limit');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const saveLimit = async () => {
    const limit = parseAmount(amount);
    if (limit === undefined) {
      setSaveError('Enter a positive USD amount for the spending limit.');
      return;
    }
    const previous = savedLimit;
    // Optimistic: apply locally first, revert if the save fails.
    setSaving(true);
    setSaveError(null);
    setSavedLimit({ limit, period });
    try {
      await apiClient.put<{ limit: UserSpendLimit }>('/api/brain/spend-limits/me', { limit, period });
    } catch (err) {
      setSavedLimit(previous);
      setSaveError(err instanceof Error ? err.message : 'Failed to save the spending limit');
    } finally {
      setSaving(false);
    }
  };

  const clearLimit = async () => {
    const previous = savedLimit;
    setSaving(true);
    setSaveError(null);
    setSavedLimit(null);
    try {
      await apiClient.delete('/api/brain/spend-limits/me');
    } catch (err) {
      setSavedLimit(previous);
      setSaveError(err instanceof Error ? err.message : 'Failed to clear the spending limit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3>LLM Spending Limit</h3>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        Cap the estimated cost of model calls per period. Figures are estimates
        from token usage and per-model pricing. When the cap is reached, LLM
        activity pauses until the period rolls over.
      </p>

      {loadError && (
        <div className="error-banner" role="alert">
          {loadError} — retry by reloading the page.
        </div>
      )}
      {saveError && (
        <div className="error-banner" role="alert">{saveError}</div>
      )}

      {loading ? (
        <p className="loading">Loading spending limit...</p>
      ) : (
        <>
          {savedLimit ? (
            usage && (
              <p data-testid="spend-usage" style={{ color: '#94a3b8', fontSize: 13 }}>
                {formatUsage(usage.spent, savedLimit.limit, savedLimit.period)}
              </p>
            )
          ) : usage && usage.spent > 0 ? (
            <p data-testid="spend-usage" style={{ color: '#94a3b8', fontSize: 13 }}>
              Estimated usage this {usage.period}: ${usage.spent.toFixed(2)} (estimated)
            </p>
          ) : (
            <p className="muted">No spending limit set. Model activity is uncapped.</p>
          )}

          <form className="form" onSubmit={(e) => { e.preventDefault(); void saveLimit(); }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Max Estimated Spend (USD)
              </span>
              <input
                type="number"
                min={0.01}
                // "any" avoids floating-point step-mismatch rejecting values
                // like 30 under native form validation.
                step="any"
                placeholder="e.g. 25.00"
                aria-label="Max estimated spend (USD, estimated)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Period
              </span>
              <select
                aria-label="Spending limit period"
                value={period}
                onChange={(e) => {
                  if ((PERIOD_LABELS as Record<string, string>)[e.target.value]) {
                    setPeriod(e.target.value as SpendPeriod);
                  }
                }}
              >
                {(Object.keys(PERIOD_LABELS) as SpendPeriod[]).map((p) => (
                  <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Limit'}
              </button>
              {savedLimit && (
                <button type="button" disabled={saving} onClick={() => { void clearLimit(); }}>
                  Clear Limit
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
