import { useEffect, useState } from 'react';
import { postJSON } from '../utils/api';
import ModelCatalogCard from '../components/ModelCatalogCard';
import SpendLimitCard from '../components/SpendLimitCard';

type SettingsState = {
  llm: {
    freeModelsOnly?: boolean;
  };
  mission: {
    approvalTimeoutMs?: number;
    approvalPollIntervalMs?: number;
  };
};

const DEFAULT_SETTINGS: SettingsState = {
  llm: { freeModelsOnly: false },
  mission: {},
};

// The mission approval settings document id and the fields it recognizes.
// A blank input means "no override": the environment variable (or built-in
// default) applies.
const MISSION_DOC_ID = 'mission/settings/approval-config';
const MISSION_KNOBS = [
  { key: 'approvalTimeoutMs', label: 'Approval Window (ms)', placeholder: 'default 86400000 (24h)', max: 604800000, envVar: 'APPROVAL_TIMEOUT_MS' },
  { key: 'approvalPollIntervalMs', label: 'Approval Poll Interval (ms)', placeholder: 'default 3000', max: 3600000, envVar: 'APPROVAL_POLL_INTERVAL_MS' },
] as const;

function parseKnob(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

  

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await postJSON<{ documents: Array<{ id: string; data: Record<string, unknown> }> }>(
        '/api/artifacts/documents/search',
        { collection: 'settings' }
      );
      const docs = res.documents || [];
      const next: SettingsState = { ...DEFAULT_SETTINGS };

      for (const doc of docs) {
        if (doc.id === 'llm-config' && doc.data) {
          next.llm = {
            freeModelsOnly: typeof doc.data.freeModelsOnly === 'boolean' ? (doc.data.freeModelsOnly as boolean) : DEFAULT_SETTINGS.llm.freeModelsOnly,
          };
        }
        if (doc.id === MISSION_DOC_ID && doc.data) {
          next.mission = {
            approvalTimeoutMs: parseKnob(doc.data.approvalTimeoutMs),
            approvalPollIntervalMs: parseKnob(doc.data.approvalPollIntervalMs),
          };
        }
      }

      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveDocument = async (id: string, data: Record<string, unknown>) => {
    setSaving(id);
    setError(null);
    setSuccess(null);
    try {
      await postJSON('/api/artifacts/documents', {
        id,
        tenantId: 'system',
        collection: 'settings',
        data,
      });
      setSuccess(`Saved ${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save ${id}`);
    } finally {
      setSaving(null);
    }
  };

  const handleSaveLlm = () => {
    saveDocument('llm-config', {
      freeModelsOnly: !!settings.llm.freeModelsOnly,
    });
  };

  // Numeric-knob save shared by the settings cards. Blank or invalid
  // fields are omitted so an operator clearing an input removes the override
  // instead of saving an invalid value (document replace semantics).
  const saveKnobDocument = (
    docId: string,
    knobs: ReadonlyArray<{ key: string; max: number }>,
    draft: Record<string, string>,
  ) => {
    const data: Record<string, number> = {};
    for (const knob of knobs) {
      const raw = (draft[knob.key] ?? '').trim();
      if (raw === '') continue;
      const parsed = Number(raw);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= knob.max) {
        data[knob.key] = parsed;
      }
    }
    saveDocument(docId, data);
  };

  const [missionDraft, setMissionDraft] = useState<Record<string, string>>({});

  const updateMission = (key: string, value: string) => {
    setMissionDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveMission = () => {
    saveKnobDocument(MISSION_DOC_ID, MISSION_KNOBS, missionDraft);
  };

  

  const updateLlm = (value: boolean) => {
    setSettings((prev) => ({ ...prev, llm: { ...prev.llm, freeModelsOnly: value } }));
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };

  const labelTextStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
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

      <div className="grid one-col">
        <div className="card">
          <h3>Preferences</h3>
          <form className="form" onSubmit={(e) => { e.preventDefault(); handleSaveLlm(); }}>
            <label style={{ ...labelStyle, marginTop: 8 }}>
              <span style={labelTextStyle}>Prefer Free / Self-hosted Models</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!settings.llm.freeModelsOnly}
                  onChange={(e) => updateLlm(e.target.checked)}
                />
                <span style={{ color: '#94a3b8', fontSize: 13 }}>
                  When enabled, the system will prefer free or self-hosted models where available.
                </span>
              </div>
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={saving === 'llm-config'}>
                {saving === 'llm-config' ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Mission Approvals</h3>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            How long a mission phase waits for human approval, and how often the approval
            state is polled. Values here override the environment variables at runtime;
            leave a field blank to keep the environment value. Applies to missions that
            start after the save.
          </p>
          <form className="form" onSubmit={(e) => { e.preventDefault(); handleSaveMission(); }}>
            {MISSION_KNOBS.map((knob) => (
              <label key={knob.key} style={{ ...labelStyle, marginTop: 8 }}>
                <span style={labelTextStyle}>{knob.label}</span>
                <input
                  type="number"
                  min={1}
                  max={knob.max}
                  placeholder={`${knob.placeholder} (${knob.envVar})`}
                  value={missionDraft[knob.key] ?? (settings.mission[knob.key] !== undefined ? String(settings.mission[knob.key]) : '')}
                  onChange={(e) => updateMission(knob.key, e.target.value)}
                />
              </label>
            ))}
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={saving === MISSION_DOC_ID}>
                {saving === MISSION_DOC_ID ? 'Saving...' : 'Save Mission Settings'}
              </button>
            </div>
          </form>
        </div>

        <SpendLimitCard />

        <ModelCatalogCard />
      </div>
    </div>
  );
};

export default Settings;
