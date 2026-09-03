import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJSON, postJSON } from '../utils/api';

type ServiceItem = {
  id: string;
  name: string;
  baseUrl: string;
  healthPath?: string;
};

type HealthResult = {
  id: string;
  name: string;
  status: string;
  lastChecked: number;
  details?: Record<string, unknown>;
};

type SettingsState = {
  llm: {
    defaultProvider: string;
    defaultModelId: string;
    maxTokens: string;
  };
  system: {
    environment: string;
    buildVersion: string;
    wsUrl: string;
    apiPrefix: string;
  };
};

const DEFAULT_SETTINGS: SettingsState = {
  llm: {
    defaultProvider: 'openrouter',
    defaultModelId: '',
    maxTokens: '4096',
  },
  system: {
    environment: 'development',
    buildVersion: 'Stage7 NextGen',
    wsUrl: '/ws',
    apiPrefix: '/api',
  },
};

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<Record<string, HealthResult>>({});
  const [testingHealth, setTestingHealth] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadServices();
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
            defaultProvider: (doc.data.defaultProvider as string) || DEFAULT_SETTINGS.llm.defaultProvider,
            defaultModelId: (doc.data.defaultModelId as string) || DEFAULT_SETTINGS.llm.defaultModelId,
            maxTokens: String(doc.data.maxTokens ?? DEFAULT_SETTINGS.llm.maxTokens),
          };
        }
        if (doc.id === 'system-config' && doc.data) {
          next.system = {
            environment: (doc.data.environment as string) || DEFAULT_SETTINGS.system.environment,
            buildVersion: (doc.data.buildVersion as string) || DEFAULT_SETTINGS.system.buildVersion,
            wsUrl: (doc.data.wsUrl as string) || DEFAULT_SETTINGS.system.wsUrl,
            apiPrefix: (doc.data.apiPrefix as string) || DEFAULT_SETTINGS.system.apiPrefix,
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
      defaultProvider: settings.llm.defaultProvider,
      defaultModelId: settings.llm.defaultModelId,
      maxTokens: Number(settings.llm.maxTokens),
    });
  };

  const handleSaveSystem = () => {
    saveDocument('system-config', {
      environment: settings.system.environment,
      buildVersion: settings.system.buildVersion,
      wsUrl: settings.system.wsUrl,
      apiPrefix: settings.system.apiPrefix,
    });
  };

  const loadServices = async () => {
    setServicesLoading(true);
    try {
      const res = await fetchJSON<{ services: ServiceItem[] }>('/api/gateway/services');
      setServices(res.services || []);
    } catch {
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  };

  const testConnection = async (service: ServiceItem) => {
    setTestingHealth(service.id);
    setError(null);
    try {
      const res = await fetchJSON<HealthResult>(`/api/gateway/services/${encodeURIComponent(service.id)}/health`);
      setHealthStatus((prev) => ({ ...prev, [service.id]: res }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Health check failed for ${service.id}`);
    } finally {
      setTestingHealth(null);
    }
  };

  const updateLlm = (field: keyof SettingsState['llm'], value: string) => {
    setSettings((prev) => ({ ...prev, llm: { ...prev.llm, [field]: value } }));
  };

  const updateSystem = (field: keyof SettingsState['system'], value: string) => {
    setSettings((prev) => ({ ...prev, system: { ...prev.system, [field]: value } }));
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

      <div className="grid two-col">
        <div className="card">
          <h3>LLM Configuration</h3>
          <form className="form" onSubmit={(e) => { e.preventDefault(); handleSaveLlm(); }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Default Model Provider</span>
              <select
                value={settings.llm.defaultProvider}
                onChange={(e) => updateLlm('defaultProvider', e.target.value)}
                style={inputStyle}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
                <option value="openwebui">OpenWebUI</option>
                <option value="local">Local</option>
              </select>
            </label>
            {renderField('Default Model ID', settings.llm.defaultModelId, (v) => updateLlm('defaultModelId', v), { placeholder: 'e.g. gpt-4o-mini' })}
            {renderField('Max Tokens', settings.llm.maxTokens, (v) => updateLlm('maxTokens', v), { type: 'number' })}
            <button type="submit" disabled={saving === 'llm-config'}>
              {saving === 'llm-config' ? 'Saving...' : 'Save LLM Config'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Service Status</h3>
          {servicesLoading ? (
            <p className="loading">Loading services...</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Base URL</th>
                    <th>Health</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => {
                    const health = healthStatus[s.id];
                    return (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>
                          <span className="truncate" title={s.baseUrl}>
                            {s.baseUrl}
                          </span>
                        </td>
                        <td>
                          {health ? (
                            <span
                              className={`badge ${
                                health.status === 'healthy'
                                  ? 'running'
                                  : health.status === 'unhealthy'
                                  ? 'failed'
                                  : 'pending'
                              }`}
                            >
                              {health.status}
                            </span>
                          ) : (
                            <span className="badge idle">unknown</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="secondary"
                            onClick={() => testConnection(s)}
                            disabled={testingHealth === s.id}
                          >
                            {testingHealth === s.id ? 'Testing...' : 'Test Connection'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {services.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: '#94a3b8' }}>
                        No services registered
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Security Settings</h3>
          <div className="form">
            {renderField('Auth Method', 'JWT Bearer', () => {}, { readOnly: true })}
            <p className="hint">
              RSA key pair is managed by the Auth service. Use the Vault page to manage API keys and
              encrypted secrets.
            </p>
            <Link
              to="/vault"
              className="link-button"
              style={{ display: 'inline-block', width: 'fit-content', textAlign: 'center', textDecoration: 'none' }}
            >
              Go to Vault
            </Link>
          </div>
        </div>

        <div className="card">
          <h3>System Configuration</h3>
          <form className="form" onSubmit={(e) => { e.preventDefault(); handleSaveSystem(); }}>
            {renderField('Environment', settings.system.environment, (v) => updateSystem('environment', v), { readOnly: true })}
            {renderField('Build Version', settings.system.buildVersion, (v) => updateSystem('buildVersion', v))}
            {renderField('WebSocket URL', settings.system.wsUrl, (v) => updateSystem('wsUrl', v))}
            {renderField('API Prefix', settings.system.apiPrefix, (v) => updateSystem('apiPrefix', v))}
            <button type="submit" disabled={saving === 'system-config'}>
              {saving === 'system-config' ? 'Saving...' : 'Save System Config'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
