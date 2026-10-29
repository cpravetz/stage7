import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postJSON } from '../utils/api';
import { useMissionsStore } from '../stores/missionsStore';
import { MissionRecurrenceOptions, type MissionRecurrence } from '../components/MissionRecurrenceOptions';
import { describeMissionSchedule } from '../utils/missionSchedule';

interface MissionRow {
  workflowId: string;
  status: string;
  missionId: string;
  prompt?: string;
  assistantId?: string;
  cronSchedule?: string;
  startedAt?: string;
  completedAt?: string;
  timestamp?: number;
}

const STATUS_FILTERS: Array<{ value: 'all' | MissionRow['status']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
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
  const recurringSchedules = useMissionsStore((s) => s.recurringSchedules);
  const recurringSchedulesError = useMissionsStore((s) => s.recurringSchedulesError);
  const missionsLoaded = useMissionsStore((s) => s.missionsLoaded);
  const pendingApprovals = useMissionsStore((s) => s.pendingApprovals);
  const pendingApprovalsLoading = useMissionsStore((s) => s.pendingApprovalsLoading);
  const fetchMissions = useMissionsStore((s) => s.fetchMissions);
  const fetchRecurringSchedules = useMissionsStore((s) => s.fetchRecurringSchedules);
  const fetchPendingApprovals = useMissionsStore((s) => s.fetchPendingApprovals);
  const addMission = useMissionsStore((s) => s.addMission);
  const deleteMission = useMissionsStore((s) => s.deleteMission);
  const deleteMissions = useMissionsStore((s) => s.deleteMissions);
  const updateMissionStatus = useMissionsStore((s) => s.updateMissionStatus);

  const [showCreate, setShowCreate] = useState(false);
  const [missionId, setMissionId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [recurrence, setRecurrence] = useState<MissionRecurrence | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const [filter, setFilter] = useState<'all' | MissionRow['status']>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchMissions();
    void fetchRecurringSchedules();
  }, [fetchMissions, fetchRecurringSchedules]);

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

  // Drop selections for missions that no longer exist after a refresh or delete.
  useEffect(() => {
    setSelected((prev) => {
      const known = new Set(missions.map((m) => m.workflowId));
      const next = new Set(Array.from(prev).filter((id) => known.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [missions]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setStartError(null);
    try {
      const data = await postJSON<{ workflowId: string; status: string; cronSchedule?: string }>(
        '/api/temporal/missions',
        {
          missionId: missionId || `mission-${Date.now()}`,
          prompt,
          tenantId: 'tenant-1',
          contextChunks: [],
          metadata: {},
          ...(recurrence ? { recurrence } : {}),
        }
      );
      const newMission: MissionRow = {
        workflowId: data.workflowId,
        status: data.status,
        missionId: missionId || `mission-${Date.now()}`,
        ...(data.cronSchedule ? { cronSchedule: data.cronSchedule } : {}),
      };
      addMission(newMission);
      if (recurrence) void fetchRecurringSchedules();
      setMissionId('');
      setPrompt('');
      setRecurrence(null);
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

  const handleMissionAction = async (workflowId: string, action: 'start' | 'pause' | 'stop') => {
    try {
      const result = await postJSON<{ status: string }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/${action}`,
        {},
      );
      updateMissionStatus(workflowId, result.status);
    } catch (err) {
      console.error(`Failed to ${action} mission:`, err);
      alert(`Failed to ${action} mission: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const stopRecurringSchedule = async (scheduleId: string) => {
    try {
      await postJSON(`/api/temporal/missions/recurring/${encodeURIComponent(scheduleId)}/stop`, {});
      await fetchRecurringSchedules();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to stop recurring schedule');
    }
  };

  const getMissionStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return 'Running';
      case 'pausing': return 'Pausing after current task';
      case 'canceling':
      case 'stopping': return 'Stopping after current task';
      case 'resuming': return 'Resuming';
      case 'paused': return 'Paused';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'canceled': return 'Canceled';
      case 'awaiting_review': return 'Needs Review';
      case 'incomplete': return 'Incomplete';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return missions.filter((m) => {
      const isActiveTransition = filter === 'running'
        && ['pausing', 'canceling', 'stopping', 'resuming'].includes(m.status.toLowerCase());
      if (filter !== 'all' && m.status.toLowerCase() !== filter && !isActiveTransition) return false;
      if (!q) return true;
      return (
        m.missionId.toLowerCase().includes(q) ||
        m.workflowId.toLowerCase().includes(q) ||
        (m.prompt || '').toLowerCase().includes(q)
      );
    });
  }, [missions, filter, search]);

  const visibleIds = useMemo(
    () => filtered.map((m) => m.workflowId),
    [filtered]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleSelect = (workflowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) next.delete(workflowId);
      else next.add(workflowId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const label = ids.length === 1 ? 'mission' : 'missions';
    if (
      !window.confirm(
        `Delete ${ids.length} ${label}? Their live feed events and artifacts are removed as well.`
      )
    ) {
      return;
    }
    setBatchDeleting(true);
    try {
      await deleteMissions(ids);
      setSelected(new Set());
    } finally {
      setBatchDeleting(false);
    }
  };

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
      const status = m.status.toLowerCase();
      c[status] = (c[status] || 0) + 1;
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
      {recurringSchedulesError && <div className="error-banner">{recurringSchedulesError}</div>}

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
              className="mission-instructions"
              placeholder="What should the agents do?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={8}
            />
            <MissionRecurrenceOptions value={recurrence} onChange={setRecurrence} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="hint">Cmd/Ctrl+Enter to submit</span>
              <button type="submit" disabled={starting || !prompt.trim()}>
                {starting ? 'Starting...' : recurrence ? 'Schedule Mission' : 'Start Mission'}
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
              const missionIds = new Set(
                pendingApprovals
                  .filter((p) => missions.some((m) => m.missionId === p.missionId))
                  .map((p) => p.missionId)
              );
              if (missionIds.size === 0) return null;
              return (
                <span style={{ color: '#ef4444' }}><strong>{missionIds.size}</strong> missions with ⏳ pending approval</span>
              );
            })()}
          </div>
          <button onClick={() => setShowCreate(true)}>+ Create Mission</button>
        </div>
      )}

      <section className="card">
        <div className="mission-start-collapsed">
          <h2 style={{ margin: 0 }}>Recurring Missions</h2>
          <button className="secondary" onClick={() => void fetchRecurringSchedules()}>Refresh schedules</button>
        </div>
        {recurringSchedules.length === 0 ? (
          <p>No recurring missions are scheduled.</p>
        ) : (
          <div className="mission-schedule-list">
            {recurringSchedules.map((schedule) => (
              <div className="mission-schedule-row" key={schedule.scheduleId}>
                <div>
                  <Link to={`/missions/${encodeURIComponent(`mission-${schedule.missionId}`)}`}>
                    {schedule.missionId}
                  </Link>
                  <div className="hint">
                    {describeMissionSchedule(schedule.cronSchedule)}
                    {schedule.assistantId ? ` · Assistant ${schedule.assistantId}` : ' · General mission'}
                    {` · Next: ${formatTime(schedule.nextRunAt)}`}
                  </div>
                </div>
                <button className="danger small" onClick={() => void stopRecurringSchedule(schedule.scheduleId)}>
                  Stop schedule
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

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
               {missionsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mission-table-wrapper" style={{ marginTop: 12 }}>
          {selected.size > 0 && (
            <div className="mission-batch-bar">
              <span>
                <strong>{selected.size}</strong> mission
                {selected.size === 1 ? '' : 's'} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="secondary small"
                  onClick={() => setSelected(new Set())}
                  disabled={batchDeleting}
                >
                  Clear selection
                </button>
                <button
                  className="danger small"
                  onClick={handleDeleteSelected}
                  disabled={batchDeleting}
                >
                  {batchDeleting ? 'Deleting…' : 'Delete selected'}
                </button>
              </div>
            </div>
          )}
          <div className="mission-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="mission-select-checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      disabled={visibleIds.length === 0}
                      aria-label="Select all missions"
                    />
                  </th>
                  <th>Mission</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {showLoading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="loading">Loading missions...</div>
                    </td>
                  </tr>
                ) : (
                  <>
{filtered.map((m) => (
                        <tr key={m.workflowId} style={(m.status === 'awaiting_review' || pendingApprovals.some((p) => p.missionId === m.missionId)) ? { backgroundColor: '#fefce8', borderLeft: '3px solid #f59e0b' } : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              className="mission-select-checkbox"
                              checked={selected.has(m.workflowId)}
                              onChange={() => toggleSelect(m.workflowId)}
                              aria-label={`Select mission ${m.missionId || m.workflowId}`}
                            />
                          </td>
                          <td className="truncate">
                            <Link to={`/missions/${encodeURIComponent(m.workflowId)}`}>
                              {(m.status === 'awaiting_review' || pendingApprovals.some((p) => p.missionId === m.missionId)) && (
                                <span style={{ marginRight: '6px' }} title="Needs attention">🔔</span>
                              )}
                              {m.missionId}
                            </Link>
                          </td>
                          <td><span className={`badge ${m.status}`}>{getMissionStatusLabel(m.status)}</span></td>
                          <td>{m.cronSchedule ? describeMissionSchedule(m.cronSchedule) : '—'}</td>
                          <td>{formatTime(m.startedAt || m.timestamp)}</td>
                          <td>{formatDuration(m)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {['paused', 'pending'].includes(m.status.toLowerCase()) && (
                                <button className="small" onClick={() => handleMissionAction(m.workflowId, 'start')} title="Start mission">
                                  Start
                                </button>
                              )}
                              {m.status.toLowerCase() === 'running' && (
                                <button className="small" onClick={() => handleMissionAction(m.workflowId, 'pause')} title="Pause mission">
                                  Pause
                                </button>
                              )}
                              {['running', 'pausing', 'paused'].includes(m.status.toLowerCase()) && (
                                <button className="danger small" onClick={() => handleMissionAction(m.workflowId, 'stop')} title="Stop mission">
                                  Stop
                                </button>
                              )}
                              {['failed', 'incomplete', 'canceled'].includes(m.status.toLowerCase()) && (
                                <button className="secondary small" onClick={() => window.location.href = `/missions/${encodeURIComponent(m.workflowId)}`} title="Retry mission with guidance">
                                  Retry
                                </button>
                              )}
                              <button className="danger small" onClick={() => handleDelete(m.workflowId)} aria-label={`Delete mission ${m.missionId || m.workflowId}`}>
                                Delete
                              </button>
                            </div>
                          </td>
                       </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7}>
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
