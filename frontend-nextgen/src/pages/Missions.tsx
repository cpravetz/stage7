import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postJSON, fetchJSON, deleteResource } from '../utils/api';

interface MissionRow {
  workflowId: string;
  status: string;
  missionId: string;
  prompt?: string;
  startedAt?: string;
  completedAt?: string;
  timestamp?: number;
}

const STATUS_FILTERS: Array<{ value: 'all' | MissionRow['status']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'awaiting_review', label: 'Needs Review' },
  { value: 'incomplete', label: 'Incomplete' },
];

const Missions = () => {
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [missionId, setMissionId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [starting, setStarting] = useState(false);

  const [filter, setFilter] = useState<'all' | MissionRow['status']>('all');
  const [search, setSearch] = useState('');

  const loadMissions = async () => {
    setLoading(true);
    try {
      const data = await fetchJSON<{ missions: MissionRow[] }>('/api/temporal/missions');
      setMissions(data.missions || []);
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMissions();
  }, []);

  const [now, setNow] = useState(Date.now());
  const hasRunning = missions.some((m) => m.status === 'running');
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const data = await postJSON<{ workflowId: string; status: string }>('/api/temporal/missions', {
        missionId: missionId || `mission-${Date.now()}`,
        prompt,
        tenantId: 'tenant-1',
        contextChunks: [],
        metadata: {},
      });
      const newMission: MissionRow = {
        workflowId: data.workflowId,
        status: data.status,
        missionId: missionId || `mission-${Date.now()}`,
      };
      setMissions([newMission, ...missions]);
      setMissionId('');
      setPrompt('');
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start mission');
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async (workflowId: string) => {
    if (!window.confirm(`Delete mission ${workflowId}?`)) return;
    try {
      await deleteResource(`/api/temporal/missions/${encodeURIComponent(workflowId)}`);
      setMissions((prev) => prev.filter((m) => m.workflowId !== workflowId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mission');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return missions.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (!q) return true;
      return (
        m.missionId.toLowerCase().includes(q) ||
        m.workflowId.toLowerCase().includes(q) ||
        (m.prompt || '').toLowerCase().includes(q)
      );
    });
  }, [missions, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: missions.length,
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      awaiting_review: 0,
      incomplete: 0,
    };
    for (const m of missions) {
      c[m.status] = (c[m.status] || 0) + 1;
    }
    return c;
  }, [missions]);

  const formatTime = (ts: number | string | undefined) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const formatDuration = (m: MissionRow) => {
    if (!m.startedAt) return '—';
    const started = new Date(m.startedAt).getTime();
    if (Number.isNaN(started)) return '—';
    const end = m.completedAt ? new Date(m.completedAt).getTime() : now;
    const ms = end - started;
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const min = Math.floor(s / 60);
    const rs = s % 60;
    if (min < 60) return rs ? `${min}m ${rs}s` : `${min}m`;
    const h = Math.floor(min / 60);
    const rm = min % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  };

  return (
    <div className="page">
      <h1>Missions</h1>
      {error && <div className="error-banner">{error}</div>}

      {showCreate ? (
        <div className="card mission-start-expanded">
          <div className="mission-start-collapsed">
            <h3 style={{ margin: 0 }}>Start Mission</h3>
            <button className="secondary" onClick={() => setShowCreate(false)} disabled={starting}>
              Cancel
            </button>
          </div>
          <form onSubmit={handleStart} className="form">
            <input
              type="text"
              placeholder="Mission ID (optional)"
              value={missionId}
              onChange={(e) => setMissionId(e.target.value)}
            />
            <textarea
              placeholder="What should the agents do?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={4}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="hint">Cmd/Ctrl+Enter to submit</span>
              <button type="submit" disabled={starting || !prompt.trim()}>
                {starting ? 'Starting...' : 'Start Mission'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="mission-start-collapsed">
          <div className="mission-summary">
            <span><strong>{counts.all}</strong> total</span>
            <span style={{ color: '#22c55e' }}><strong>{counts.running}</strong> running</span>
            <span style={{ color: '#38bdf8' }}><strong>{counts.completed}</strong> completed</span>
          <span style={{ color: '#ef4444' }}><strong>{counts.failed}</strong> failed</span>
          <span style={{ color: '#f59e0b' }}><strong>{counts.canceled}</strong> canceled</span>
          <span style={{ color: '#eab308' }}><strong>{counts.awaiting_review || 0}</strong> needs review</span>
          <span style={{ color: '#a78bfa' }}><strong>{counts.incomplete || 0}</strong> incomplete</span>
          </div>
          <button onClick={() => setShowCreate(true)}>+ Create Mission</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 0 }}>
        <div className="mission-start-collapsed">
          <div className="entity-tabs">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                className={filter === f.value ? 'tab active' : 'tab'}
                onClick={() => setFilter(f.value)}
              >
                {f.label} ({counts[f.value as keyof typeof counts] ?? 0})
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="search"
              placeholder="Search missions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button className="secondary" onClick={loadMissions} disabled={loading}>
              {loading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mission-table-wrapper" style={{ marginTop: 12 }}>
          <div className="mission-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.workflowId}>
                    <td className="truncate">
                      <Link to={`/missions/${encodeURIComponent(m.workflowId)}`}>{m.missionId}</Link>
                    </td>
                    <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                    <td>{formatTime(m.startedAt || m.timestamp)}</td>
                    <td>{formatDuration(m)}</td>
                    <td>
                      <button className="danger small" onClick={() => handleDelete(m.workflowId)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">No missions match the current filter.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Missions;