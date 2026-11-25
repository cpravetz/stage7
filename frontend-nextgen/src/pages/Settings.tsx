import { useEffect, useState } from 'react';
import api from '../services/api';
import {
  DEFAULT_LLM_SETTINGS,
  LLM_CONFIG_DOC_ID,
  buildSavePayload,
  parseLlmSettingsDoc,
  type LlmSettings,
} from '../utils/llmSettings';

const TOKEN_TTL_NOTE = 'Saved — changes take effect within ~30 seconds.';

type DocumentSummary = { id: string; data?: Record<string, unknown> };

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 12,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const helperTextStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 13,
};

interface NumberFieldProps {
  label: string;
  helper: string;
  value: number;
  minValue?: number;
  onChange: (value: number) => void;
}

const NumberField = ({ label, helper, value, minValue, onChange }: NumberFieldProps) => (
  <label style={labelStyle}>
    <span style={labelTextStyle}>{label}</span>
    <input
      type="number"
      min={minValue}
      value={value}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isFinite(next) && next > 0) onChange(next);
      }}
    />
    <span style={helperTextStyle}>{helper}</span>
  </label>
);

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [preferredText, setPreferredText] = useState('');
  const [forbiddenText, setForbiddenText] = useState('');
  const [loadedData, setLoadedData] = useState<Record<string, unknown> | undefined>(undefined);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ documents: DocumentSummary[] }>('/artifacts/documents/search', {
        collection: 'settings',
      });
      const doc = (res.data.documents || []).find((entry) => entry.id === LLM_CONFIG_DOC_ID);
      const parsed = parseLlmSettingsDoc(doc?.data);
      setSettings(parsed);
      setPreferredText(parsed.preferredModelIds.join(', '));
      setForbiddenText(parsed.forbiddenModelIds.join(', '));
      setLoadedData(doc?.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/artifacts/documents', {
        id: LLM_CONFIG_DOC_ID,
        tenantId: 'system',
        collection: 'settings',
        data: buildSavePayload(loadedData, settings, preferredText, forbiddenText),
      });
      setSuccess(TOKEN_TTL_NOTE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof LlmSettings>(key: K, value: LlmSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="page"><h1>Settings</h1><p className="loading">Loading settings...</p></div>;
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      {error && <div className="error-banner">{error}</div>}
      {success && (
        <div
          style={{
            background: '#22c55e33',
            color: '#22c55e',
            border: '1px solid #22c55e',
            borderRadius: 6,
            padding: '10px 12px',
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {success}
        </div>
      )}

      <form className="grid one-col" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        <div className="card">
          <h3>Models</h3>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Prefer Free / Self-hosted Models</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.freeModelsOnly}
                onChange={(e) => updateSetting('freeModelsOnly', e.target.checked)}
              />
              <span style={helperTextStyle}>
                When enabled, the system will prefer free or self-hosted models where available.
              </span>
            </div>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Preferred Models</span>
            <input
              type="text"
              value={preferredText}
              placeholder="comma-separated model ids, e.g. openai:gpt-4o-mini"
              onChange={(e) => setPreferredText(e.target.value)}
            />
            <span style={helperTextStyle}>Comma-separated model ids ranked ahead of others (never excluded).</span>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Forbidden Models</span>
            <input
              type="text"
              value={forbiddenText}
              placeholder="comma-separated model ids, e.g. provider:model"
              onChange={(e) => setForbiddenText(e.target.value)}
            />
            <span style={helperTextStyle}>Comma-separated model ids never used for routing.</span>
          </label>
        </div>

        <div className="card">
          <h3>Brain</h3>
          <NumberField
            label="Provider Timeout (ms)"
            helper="Lower-level HTTP fetch timeout per provider request (BRAIN_PROVIDER_TIMEOUT_MS fallback)."
            value={settings.providerTimeoutMs}
            onChange={(v) => updateSetting('providerTimeoutMs', v)}
          />
          <NumberField
            label="Provider Attempt Timeout (ms)"
            helper="Per-attempt ceiling for a single provider call (BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS fallback)."
            value={settings.providerAttemptTimeoutMs}
            onChange={(v) => updateSetting('providerAttemptTimeoutMs', v)}
          />
          <NumberField
            label="Completion Deadline (ms)"
            helper="Total time budget for a Brain completion (BRAIN_COMPLETION_DEADLINE_MS fallback)."
            value={settings.completionDeadlineMs}
            onChange={(v) => updateSetting('completionDeadlineMs', v)}
          />
          <NumberField
            label="Circuit Breaker Threshold"
            helper="Consecutive fatal provider errors before a circuit breaker opens (BRAIN_CIRCUIT_THRESHOLD fallback)."
            value={settings.circuitThreshold}
            minValue={1}
            onChange={(v) => updateSetting('circuitThreshold', v)}
          />
          <NumberField
            label="Circuit Breaker Cooldown (ms)"
            helper="How long a tripped circuit breaker stays open (BRAIN_CIRCUIT_COOLDOWN_MS fallback)."
            value={settings.circuitCooldownMs}
            onChange={(v) => updateSetting('circuitCooldownMs', v)}
          />
        </div>

        <div className="card">
          <h3>Missions</h3>
          <NumberField
            label="Approval Timeout (ms)"
            helper="How long a mission waits for human approval (APPROVAL_TIMEOUT_MS fallback)."
            value={settings.approvalTimeoutMs}
            onChange={(v) => updateSetting('approvalTimeoutMs', v)}
          />
          <NumberField
            label="Approval Poll Interval (ms)"
            helper="Approval polling interval (APPROVAL_POLL_INTERVAL_MS fallback)."
            value={settings.approvalPollIntervalMs}
            onChange={(v) => updateSetting('approvalPollIntervalMs', v)}
          />
          <NumberField
            label="Watch Scheduler Poll Interval (ms)"
            helper="Watch-scheduler polling interval (WATCH_SCHEDULER_POLL_MS fallback)."
            value={settings.watchSchedulerPollMs}
            onChange={(v) => updateSetting('watchSchedulerPollMs', v)}
          />
        </div>

        <div className="card">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <p style={{ ...helperTextStyle, marginTop: 8 }}>
            Services pick up changes within ~30 seconds via their settings cache.
          </p>
        </div>
      </form>
    </div>
  );
};

export default Settings;
