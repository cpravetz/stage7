import { useEffect, useMemo, useState } from 'react';
import { fetchJSON, postJSON } from '../utils/api';
import { useFeedStore } from '../stores/feedStore';

interface BrainLogEntry {
  timestamp: string;
  type: 'completion' | 'cache_hit' | 'error';
  provider?: string;
  model?: string;
  promptPreview?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  tokensUsed?: number;
  missionId?: string;
}

const LOGS_POLL_INTERVAL = 30000;

const Brain = () => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [models, setModels] = useState<
    Array<{ id: string; name: string; provider: string }>
  >([]);
  const [cacheStats, setCacheStats] = useState<{ hits: number; misses: number } | null>(null);
  const [circuitBreakers, setCircuitBreakers] = useState<
    Array<{ provider: string; state: string; failures: number }>
  >([]);
  const [serviceLogs, setServiceLogs] = useState<BrainLogEntry[]>([]);
  const [serviceLogsLoading, setServiceLogsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const feedEvents = useFeedStore((s) => s.events);

  const brainErrorEvents = useMemo(
    () => feedEvents.filter((e) => e.type === 'brain_error'),
    [feedEvents]
  );

  const loadModels = () => {
    fetchJSON<{ models: Array<{ id: string; provider: string }> }>('/api/brain/models')
      .then((data) => {
        const raw = data.models || [];
        const filtered = raw.filter((m) => !m.id.startsWith('~'));
        const list = filtered.map((m) => {
          const provider =
            m.provider === 'openrouter' || m.provider === 'openwebui'
              ? m.provider
              : (m.id.split('/')[0] || m.provider || 'unknown');
          return { id: m.id, name: m.id, provider };
        });
        setModels(list);
      })
      .catch(() => {});
  };

  const loadStats = () => {
    fetchJSON<{ hits: number; misses: number }>('/api/brain/cache/stats')
      .then(setCacheStats)
      .catch(() => {});
    fetchJSON<{ provider: string; state: string; failures: number }[]>('/api/brain/circuit-breakers')
      .then(setCircuitBreakers)
      .catch(() => {});
  };

  const loadServiceLogs = () => {
    setServiceLogsLoading(true);
    fetchJSON<BrainLogEntry[]>('/api/brain/logs')
      .then((data) => setServiceLogs(data || []))
      .catch(() => setServiceLogs([]))
      .finally(() => setServiceLogsLoading(false));
  };

  useEffect(() => {
    loadModels();
    loadStats();
    loadServiceLogs();
    const interval = setInterval(() => {
      loadStats();
      loadServiceLogs();
    }, LOGS_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const data = await postJSON<{ content: string; model: string; cached: boolean }>(
        '/api/brain/complete',
        {
          prompt,
          options: model ? { model } : {},
        }
      );
      setResult(data.content || '');
      loadServiceLogs();
    } catch (err: unknown) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
      loadServiceLogs();
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  };

  const combinedLogs: BrainLogEntry[] = useMemo(() => {
    const fromFeed: BrainLogEntry[] = brainErrorEvents.map((e) => ({
      timestamp: new Date(e.timestamp).toISOString(),
      type: 'error' as const,
      provider: (e.metadata?.provider as string) || undefined,
      model: (e.metadata?.model as string) || undefined,
      promptPreview: (e.metadata?.promptPreview as string) || undefined,
      success: false,
      error: (e.metadata?.error as string) || e.message,
      missionId: e.missionId,
    }));
    return [...fromFeed, ...serviceLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [brainErrorEvents, serviceLogs]);

  const errorCount = combinedLogs.filter((l) => l.type === 'error' && l.error).length;
  const completionCount = combinedLogs.filter(
    (l) => l.type === 'completion'
  ).length;
  const cacheHitCount = combinedLogs.filter((l) => l.type === 'cache_hit').length;

  return (
    <div className="page">
      <h1>Brain / LLM Layer</h1>
      <div className="grid two-col">
        <div className="card">
          <h3>Completion</h3>
          <form onSubmit={handleComplete} className="form">
            <textarea
              placeholder="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={4}
            />
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Auto-select (system optimized)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
            <p className="hint">
              The system auto-selects the best model based on task intent. Select
              a model above to override.
            </p>
            <button type="submit" disabled={loading}>
              {loading ? 'Running...' : 'Complete'}
            </button>
          </form>
          {result && <pre className="result">{result}</pre>}
        </div>

        <div className="card">
          <h3>Cache Stats</h3>
          {cacheStats ? (
            <div className="meta-grid">
              <div>
                <strong>Hits:</strong> {cacheStats.hits}
              </div>
              <div>
                <strong>Misses:</strong> {cacheStats.misses}
              </div>
            </div>
          ) : (
            <p>No cache stats available.</p>
          )}
          <h3 style={{ marginTop: '16px' }}>Circuit Breakers</h3>
          {circuitBreakers.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>State</th>
                  <th>Failures</th>
                </tr>
              </thead>
              <tbody>
                {circuitBreakers.map((cb) => (
                  <tr key={cb.provider}>
                    <td>{cb.provider}</td>
                    <td>
                      <span
                        className={`badge ${
                          cb.state === 'closed'
                            ? 'running'
                            : cb.state === 'open'
                              ? 'failed'
                              : 'idle'
                        }`}
                      >
                        {cb.state}
                      </span>
                    </td>
                    <td>{cb.failures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No circuit breaker data.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h3 style={{ margin: 0 }}>
            Brain Activity Log
            <span className="muted" style={{ fontSize: '13px', marginLeft: '8px' }}>
              ({completionCount} completed, {cacheHitCount} cached, {errorCount} errors)
            </span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className={`connection-status ${
                useFeedStore.getState().connected ? 'online' : 'offline'
              }`}
            >
            </span>
            <button className="secondary" onClick={loadServiceLogs} disabled={serviceLogsLoading}>
              {serviceLogsLoading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
          Real-time brain errors arrive over WebSocket. Service logs are fetched
          periodically as a historical fallback.
        </p>
        {combinedLogs.length === 0 ? (
          <div className="empty-state">No brain activity logged yet.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Mission</th>
                  <th>Duration</th>
                  <th>Tokens</th>
                  <th>Error / Preview</th>
                </tr>
              </thead>
              <tbody>
                {combinedLogs.map((l, i) => (
                  <tr key={`${l.timestamp}-${i}`}>
                    <td style={{ fontSize: '12px' }}>
                      {new Date(l.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          l.type === 'error'
                            ? 'failed'
                            : l.type === 'cache_hit'
                              ? 'idle'
                              : 'completed'
                        }`}
                      >
                        {l.type === 'error'
                          ? 'Error'
                          : l.type === 'cache_hit'
                            ? 'Cache Hit'
                            : 'OK'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>{l.provider || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{l.model || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{l.missionId || (l.type === 'error' ? '—' : '')}</td>
                    <td style={{ fontSize: '12px' }}>{formatDuration(l.durationMs)}</td>
                    <td style={{ fontSize: '12px' }}>{l.tokensUsed || '—'}</td>
                    <td style={{ fontSize: '12px' }}>
                      {l.error ? (
                        <span style={{ color: '#ef4444' }}>{l.error}</span>
                      ) : (
                        <span className="muted">
                          {l.promptPreview ? l.promptPreview.slice(0, 80) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Brain;
