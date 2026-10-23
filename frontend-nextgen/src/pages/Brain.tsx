import { useEffect, useMemo, useState } from 'react';
import { fetchJSON, postJSON } from '../utils/api';
import { useFeedStore } from '../stores/feedStore';

interface BrainLogEntry {
  timestamp: string;
  type: 'completion' | 'cache_hit' | 'error';
  provider?: string;
  model?: string;
  promptPreview?: string;
  prompt?: string;
  content?: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  tokensUsed?: number;
  estimatedCost?: number;
  missionId?: string;
}

const LOGS_POLL_INTERVAL = 30000;
const PAGE_SIZE = 25;

const Brain = () => {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ hits: number; misses: number } | null>(null);
  const [circuitBreakers, setCircuitBreakers] = useState<
    Array<{ provider: string; state: string; failures: number }>
  >([]);
  const [serviceLogs, setServiceLogs] = useState<BrainLogEntry[]>([]);
  const [serviceLogsLoading, setServiceLogsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [modalEntry, setModalEntry] = useState<BrainLogEntry | null>(null);

  const feedEvents = useFeedStore((s) => s.events);

  const brainErrorEvents = useMemo(
    () => feedEvents.filter((e) => e.type === 'brain_error'),
    [feedEvents]
  );

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
        { prompt }
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
      prompt: (e.metadata?.prompt as string) || undefined,
      content: (e.metadata?.content as string) || undefined,
      success: false,
      error: (e.metadata?.error as string) || e.message,
      missionId: e.missionId,
    }));
    return [...fromFeed, ...serviceLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [brainErrorEvents, serviceLogs]);

  const totalPages = Math.max(1, Math.ceil(combinedLogs.length / PAGE_SIZE));
  const pagedLogs = combinedLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const providerCallCounts = useMemo(() => {
    const counts: Record<string, { total: number; failures: number }> = {};
    combinedLogs.forEach((l) => {
      if (!l.provider) return;
      counts[l.provider] = counts[l.provider] || { total: 0, failures: 0 };
      counts[l.provider].total += 1;
      if (l.type === 'error' || l.success === false) counts[l.provider].failures += 1;
    });
    return counts;
  }, [combinedLogs]);

  const errorCount = combinedLogs.filter((l) => l.type === 'error' && l.error).length;
  const completionCount = combinedLogs.filter((l) => l.type === 'completion').length;
  const cacheHitCount = combinedLogs.filter((l) => l.type === 'cache_hit').length;

  return (
    <div className="page">
      <h1>Brain / LLM Layer</h1>
      <div className="grid two-col">
        <div className="card">
          <h3>Test Prompt</h3>
          <form onSubmit={handleComplete} className="form">
            <textarea
              placeholder="Enter a prompt to test"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={6}
            />
            <p className="hint">
              Brain selects the model and provider based on the task and current provider availability.
            </p>
            <button type="submit" disabled={loading}>
              {loading ? 'Testing…' : 'Test Prompt'}
            </button>
          </form>
          {result && <pre className="result">{result}</pre>}
        </div>

        <div className="card">
          <h3>Response Cache</h3>
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
          <h3 style={{ marginTop: '16px' }}>Provider Failures</h3>
          <p className="muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
            Provider-level fatal errors (401/403/auth/quota). A breaker trips only on
            configuration or quota errors and resets on any successful call.
            This is separate from the attempt-error count in the Activity Log below.
          </p>
          {circuitBreakers.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>State</th>
                  <th>Failures</th>
                  <th>Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {circuitBreakers.map((cb) => {
                  const stats = providerCallCounts[cb.provider] || { total: 0, failures: 0 };
                  const rate = stats.total > 0 ? (stats.failures / stats.total) * 100 : 0;
                  return (
                    <tr key={cb.provider}>
                      <td>{cb.provider}</td>
                      <td>
                        <span
                          className={`badge ${
                            cb.state === 'closed'
                              ? 'running'
                              : cb.state === 'open'
                                ? 'failed'
                                : 'pending'
                          }`}
                        >
                          {cb.state === 'closed' ? 'On-line' : cb.state === 'open' ? 'off-line' : cb.state === 'half' ? 'Intermittent' : cb.state}
                        </span>
                      </td>
                      <td>{cb.failures}</td>
                      <td>{rate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p>No provider failure data.</p>
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
            Activity Log
            <span className="muted" style={{ fontSize: '13px', marginLeft: '8px' }}>
              ({completionCount} completed, {cacheHitCount} cached, {errorCount} errors)
            </span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className={`connection-status ${
                useFeedStore.getState().connected ? 'online' : 'offline'
              }`}
              style={{ fontSize: '12px' }}
            >
              {useFeedStore.getState().connected ? 'Live' : 'Offline'}
            </span>
            <button className="secondary" onClick={loadServiceLogs} disabled={serviceLogsLoading}>
              {serviceLogsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
          Real-time errors arrive over the WebSocket feed. Service logs are fetched
          periodically as a historical record.
        </p>
        {combinedLogs.length === 0 ? (
          <div className="empty-state">No activity logged yet.</div>
        ) : (
          <>
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
                  {pagedLogs.map((l, i) => (
                    <tr key={`${l.timestamp}-${i}`} onClick={() => setModalEntry(l)} style={{ cursor: 'pointer' }}>
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
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
              <button className="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
              <span style={{ fontSize: '12px', alignSelf: 'center' }}>Page {page + 1} of {totalPages}</span>
              <button className="secondary" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</button>
            </div>
          </>
        )}
      </div>

      {modalEntry && (
        <div className="modal-overlay" onClick={() => setModalEntry(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', maxWidth: '700px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <h3>LLM Call Details</h3>
            <p><strong>Time:</strong> {new Date(modalEntry.timestamp).toLocaleString()}</p>
            <p><strong>Status:</strong> {modalEntry.type}</p>
            <p><strong>Provider:</strong> {modalEntry.provider || '—'}</p>
            <p><strong>Model:</strong> {modalEntry.model || '—'}</p>
            <p><strong>Duration:</strong> {formatDuration(modalEntry.durationMs)}</p>
            <p><strong>Tokens:</strong> {modalEntry.tokensUsed || '—'}</p>
            <p><strong>Estimated Cost:</strong> {modalEntry.estimatedCost ?? '—'}</p>
            {modalEntry.missionId && <p><strong>Mission:</strong> {modalEntry.missionId}</p>}
            {modalEntry.content && (
              <>
                <h4>Response</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px' }}>{modalEntry.content}</pre>
              </>
            )}
            {modalEntry.prompt && (
              <>
                <h4>Prompt</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px' }}>{modalEntry.prompt}</pre>
              </>
            )}
            {modalEntry.promptPreview && !modalEntry.prompt && (
              <>
                <h4>Prompt Preview</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{modalEntry.promptPreview}</pre>
              </>
            )}
            {modalEntry.error && (
              <>
                <h4>Error</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: '#ef4444' }}>{modalEntry.error}</pre>
              </>
            )}
            <button className="secondary" onClick={() => setModalEntry(null)} style={{ marginTop: '12px' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Brain;
