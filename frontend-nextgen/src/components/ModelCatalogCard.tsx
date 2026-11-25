import { useCallback, useEffect, useState } from 'react';
import { fetchJSON, postJSON } from '../utils/api';

export interface ModelDefinitionView {
  id: string;
  provider: string;
  costPer1kTokens: number;
  maxTokens: number;
  capabilities: string[];
}

export interface ModelDraft {
  id: string;
  provider: string;
  costPer1kTokens: string;
  maxTokens: string;
  capabilities: string;
}

export const EMPTY_MODEL_DRAFT: ModelDraft = {
  id: '',
  provider: '',
  costPer1kTokens: '',
  maxTokens: '',
  capabilities: '',
};

/** Comma-separated capabilities field → trimmed, de-duplicated list. */
export function parseCapabilities(raw: string): string[] {
  return [...new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean))];
}

export type ModelPayloadResult =
  | { ok: true; model: { id: string; provider: string; costPer1kTokens: number; maxTokens: number; capabilities: string[] } }
  | { ok: false; error: string };

/**
 * Builds a model-registration payload from the raw form draft. Pure so the
 * validation rules are testable without rendering the component.
 */
export function buildModelPayload(draft: ModelDraft): ModelPayloadResult {
  const id = draft.id.trim();
  const provider = draft.provider.trim();
  if (!id || !provider) {
    return { ok: false, error: 'Model id and provider are required.' };
  }
  const costPer1kTokens = Number(draft.costPer1kTokens);
  if (draft.costPer1kTokens.trim() === '' || !Number.isFinite(costPer1kTokens) || costPer1kTokens < 0) {
    return { ok: false, error: 'Cost per 1k tokens must be a number of 0 or more.' };
  }
  const maxTokens = Number(draft.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    return { ok: false, error: 'Max tokens must be a positive integer.' };
  }
  return {
    ok: true,
    model: {
      id,
      provider,
      costPer1kTokens,
      maxTokens,
      capabilities: parseCapabilities(draft.capabilities),
    },
  };
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
};

const ModelCatalogCard = () => {
  const [models, setModels] = useState<ModelDefinitionView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModelDraft>(EMPTY_MODEL_DRAFT);

  const loadModels = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetchJSON<{ models: ModelDefinitionView[] }>('/api/brain/models');
      setModels(res.models ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load the model catalog');
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const updateDraft = (key: keyof ModelDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    setSuccess(null);
    const payload = buildModelPayload(draft);
    if (!payload.ok) {
      setActionError(payload.error);
      return;
    }
    setSaving(true);
    try {
      await postJSON('/api/brain/models', payload.model);
      setSuccess(`Registered ${payload.model.provider}:${payload.model.id}`);
      setDraft(EMPTY_MODEL_DRAFT);
      await loadModels();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to register the model');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3>Model Catalog</h3>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        Registered models are the routing allow-list: only models here can be selected for completions.
        Registrations live in memory and are re-derived from provider catalogs when the Brain restarts.
      </p>

      {loadError && (
        <div className="error-banner">
          {loadError}
          <button type="button" style={{ marginLeft: 8 }} onClick={() => void loadModels()}>Retry</button>
        </div>
      )}

      {models === null && !loadError && <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading model catalog...</p>}

      {models !== null && models.length === 0 && (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>
          No models are registered yet. Register one below, or check that Brain providers are configured.
        </p>
      )}

      {models !== null && models.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#94a3b8' }}>
              <th style={{ padding: '4px 8px' }}>Model</th>
              <th style={{ padding: '4px 8px' }}>Provider</th>
              <th style={{ padding: '4px 8px' }}>Cost / 1k tokens</th>
              <th style={{ padding: '4px 8px' }}>Max tokens</th>
              <th style={{ padding: '4px 8px' }}>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={`${model.provider}:${model.id}`} style={{ borderTop: '1px solid #1e293b' }}>
                <td style={{ padding: '4px 8px' }}>{model.id}</td>
                <td style={{ padding: '4px 8px' }}>{model.provider}</td>
                <td style={{ padding: '4px 8px' }}>{model.costPer1kTokens}</td>
                <td style={{ padding: '4px 8px' }}>{model.maxTokens}</td>
                <td style={{ padding: '4px 8px' }}>{model.capabilities.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {success && (
        <div style={{ background: '#22c55e33', color: '#22c55e', border: '1px solid #22c55e', borderRadius: 6, padding: '8px 10px', marginBottom: 8, fontSize: 13 }}>
          {success}
        </div>
      )}
      {actionError && <div className="error-banner">{actionError}</div>}

      <form className="form" onSubmit={handleRegister}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Model ID</span>
          <input style={inputStyle} value={draft.id} onChange={(e) => updateDraft('id', e.target.value)} placeholder="e.g. llama3:8b" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provider</span>
          <input style={inputStyle} value={draft.provider} onChange={(e) => updateDraft('provider', e.target.value)} placeholder="e.g. ollama" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cost per 1k tokens</span>
          <input style={inputStyle} type="number" min={0} step="any" value={draft.costPer1kTokens} onChange={(e) => updateDraft('costPer1kTokens', e.target.value)} placeholder="0 for free / self-hosted" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max tokens</span>
          <input style={inputStyle} type="number" min={1} value={draft.maxTokens} onChange={(e) => updateDraft('maxTokens', e.target.value)} placeholder="context window in tokens" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capabilities (comma-separated)</span>
          <input style={inputStyle} value={draft.capabilities} onChange={(e) => updateDraft('capabilities', e.target.value)} placeholder="e.g. reasoning, vision" />
        </label>
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={saving}>
            {saving ? 'Registering...' : 'Register Model'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModelCatalogCard;
