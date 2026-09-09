import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJSON, postJSON } from '../utils/api';

type SettingsState = {
  llm: {
    freeModelsOnly?: boolean;
  };
};

const DEFAULT_SETTINGS: SettingsState = {
  llm: { freeModelsOnly: false },
};

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

  

  const updateLlm = (value: boolean) => {
    setSettings((prev) => ({ ...prev, llm: { ...prev.llm, freeModelsOnly: value } }));
  };

  const inputStyle: React.CSSProperties = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 6,
    padding: '8px 10px',
    color: '#e2e8f0',
    fontSize: 14,
  };

  const readonlyInputStyle: React.CSSProperties = {
    ...inputStyle,
    background: '#334155',
    opacity: 0.8,
    cursor: 'not-allowed',
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

  const renderField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options?: { readOnly?: boolean; type?: string; placeholder?: string }
  ) => (
    <label style={labelStyle}>
      <span style={labelTextStyle}>{label}</span>
      <input
        type={options?.type || 'text'}
        value={value}
        readOnly={!!options?.readOnly}
        placeholder={options?.placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={options?.readOnly ? readonlyInputStyle : inputStyle}
      />
    </label>
  );

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
      </div>
    </div>
  );
};

export default Settings;
