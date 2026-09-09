import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postJSON } from '../utils/api';
import { useMissionsStore } from '../stores/missionsStore';

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
  const missions = useMissionsStore((s) => s.missions);
  const missionsLoading = useMissionsStore((s) => s.missionsLoading);
  const missionsError = useMissionsStore((s) => s.missionsError);
  const missionsLoaded = useMissionsStore((s) => s.missionsLoaded);
  const pendingApprovals = useMissionsStore((s) => s.pendingApprovals);
  const pendingApprovalsLoading = useMissionsStore((s) => s.pendingApprovalsLoading);
  const fetchMissions = useMissionsStore((s) => s.fetchMissions);
  const fetchPendingApprovals = useMissionsStore((s) => s.fetchPendingApprovals);
  const addMission = useMissionsStore((s) => s.addMission);
  const deleteMission = useMissionsStore((s) => s.deleteMission);

  const [showCreate, setShowCreate] = useState(false);
  const [missionId, setMissionId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [filter, setFilter] = useState<'all' | MissionRow['status']>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  useEffect(() => {
    if (pendingApprovals.length === 0) {
      fetchPendingApprovals();
    }
  }, [pendingApprovals.length, fetchPendingApprovals]);

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
    setStartError(null);
    try {
      const data = await postJSON<{ workflowId: string; status: string }>(
        '/api/temporal/missions',
        {
          missionId: missionId || `mission-${Date.now()}`,
          prompt,
          tenantId: 'tenant-1',
          contextChunks: [],
          metadata: {},
        }
      );
      const newMission: MissionRow = {
        workflowId: data.workflowId,
        status: data.status,
        missionId: missionId || `mission-${Date.now()}`,
      };
      addMission(newMission);
      setMissionId('');
      setPrompt('');
      setShowCreate(false);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start mission');
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async (workflowId: string) => {
    if (!window.confirm(`Delete mission ${workflowId}?`)) return;
    await deleteMission(workflowId);
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

  const showLoading = !missionsLoaded && missionsLoading;

  return (
    <div className="page">
      <h1>Missions</h1>
      {startError && <div className="error-banner">{startError}</div>}
      {missionsError && <div className="error-banner">{missionsError}</div>}

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
            {!pendingApprovalsLoading && pendingApprovals.length > 0 && (() => {
              const missionIds = new Set(pendingApprovals.map((p) => p.missionId));
              return (
                <span style={{ color: '#ef4444' }}><strong>{missionIds.size}</strong> missions with ⏳ pending approval</span>
              );
            })()}
          </div>
          <button onClick={() => setShowCreate(true)}>+ Create Mission</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 0 }}>
        <div className="mission-start-collapsed">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="search"
              placeholder="Search missions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map((sf) => (
                <button
                  key={sf.value}
                  className={filter === sf.value ? '' : 'secondary'}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  onClick={() => setFilter(sf.value)}
                >
                  {sf.label}
                </button>
              ))}
            </div>
            <button className="secondary" onClick={fetchMissions} disabled={missionsLoading}>
              {missionsLoading ? '🔄' : 'Refresh'}
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
                {showLoading ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="loading">Loading missions...</div>
                    </td>
                  </tr>
                ) : (
                  <>
                     {filtered.map((m) => (
                       <tr key={m.workflowId} style={(m.status === 'awaiting_review' || pendingApprovals.some((p) => p.missionId === m.missionId)) ? { backgroundColor: '#fefce8', borderLeft: '3px solid #f59e0b' } : undefined}>
                         <td className="truncate">
                           <Link to={`/missions/${encodeURIComponent(m.workflowId)}`}>
                             {(m.status === 'awaiting_review' || pendingApprovals.some((p) => p.missionId === m.missionId)) && (
                               <span style={{ marginRight: '6px' }} title="Needs attention">🔔</span>
                             )}
                             {m.missionId}
                           </Link>
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
                          <div className="empty-state">
                            {search.trim() || filter !== 'all'
                              ? 'No missions match the current filter.'
                              : 'No missions yet. Click "+ Create Mission" to get started.'}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
