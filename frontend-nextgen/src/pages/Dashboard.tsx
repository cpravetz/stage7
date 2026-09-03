import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchJSON, deleteResource } from '../utils/api';
import { useFeedStore } from '../stores/feedStore';

interface ServiceInfo {
  id: string;
  name: string;
  baseUrl: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastChecked: number;
}

interface Mission {
  missionId: string;
  workflowId: string;
  status: string;
  timestamp?: number;
  startedAt?: string;
  completedAt?: string;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
}

const REFRESH_INTERVAL = 20000;

const Dashboard = () => {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const feedEvents = useFeedStore((state) => state.events);
  const feedConnected = useFeedStore((state) => state.connected);

  const loadServices = useCallback(async () => {
    try {
      const data = await fetchJSON<{ services: ServiceInfo[] }>('/api/gateway/services');
      const list = data.services || [];
      const withHealth = await Promise.all(
        list.map(async (svc) => {
          try {
            const res = await fetch(`/api/gateway/services/${svc.id}/health`, { method: 'GET' });
            if (res.ok) {
              const health = await res.json();
              return { ...svc, status: health.status || 'unknown', lastChecked: health.lastChecked || Date.now() };
            }
          } catch {
            // ignore
          }
          return { ...svc, status: 'unknown' as const, lastChecked: Date.now() };
        })
      );
      setServices(withHealth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMissions = useCallback(async () => {
    setMissionsLoading(true);
    try {
      const data = await fetchJSON<{ missions: Mission[] }>('/api/temporal/missions');
      setMissions(data.missions || []);
    } catch {
      // keep existing missions on failure
    } finally {
      setMissionsLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const data = await fetchJSON<{ agents: Agent[] }>('/api/agent-runtime/agents');
      setAgents(data.agents || []);
    } catch {
      // keep existing agents on failure
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const deleteMission = useCallback(async (workflowId: string) => {
    if (!window.confirm(`Delete mission ${workflowId}? This cancels the workflow and removes persisted state.`)) return;
    try {
      await deleteResource(`/api/temporal/missions/${encodeURIComponent(workflowId)}`);
      setMissions((prev) => prev.filter((m) => m.workflowId !== workflowId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mission');
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadMissions();
    loadAgents();
    const interval = setInterval(() => {
      loadServices();
      loadMissions();
      loadAgents();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadServices, loadMissions, loadAgents]);

  const onlineCount = services.filter((s) => s.status === 'healthy').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const unhealthyCount = services.filter((s) => s.status === 'unhealthy' || s.status === 'unknown').length;

  const runningMissions = missions.filter((m) => m.status === 'running').length;
  const completedMissions = missions.filter((m) => m.status === 'completed').length;
  const failedMissions = missions.filter((m) => m.status === 'failed').length;

  const activeAgents = agents.filter((a) => a.status === 'active' || a.status === 'running' || a.status === 'idle').length;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'healthy': return 'Online';
      case 'degraded': return 'Degraded';
      case 'unhealthy': return 'Offline';
      default: return 'No Data';
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleTimeString();
  };

  const formatStarted = (m: Mission) => {
    const raw = m.startedAt || (m.timestamp ? new Date(m.timestamp).toISOString() : undefined);
    if (!raw) return '—';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  const formatDuration = (m: Mission) => {
    if (!m.startedAt || !m.completedAt) return '—';
    const ms = new Date(m.completedAt).getTime() - new Date(m.startedAt).getTime();
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

  const recentEvents = feedEvents.slice(0, 10);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="meta-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="metric" style={{ color: '#22c55e' }}>{onlineCount}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Services Online</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="metric" style={{ color: '#f59e0b' }}>{runningMissions}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Missions Running</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="metric" style={{ color: '#38bdf8' }}>{activeAgents}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Agents Active</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="metric" style={{ color: feedConnected ? '#22c55e' : '#ef4444' }}>{feedConnected ? 'Live' : 'Disconnected'}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Event Feed</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Service Health</h3>
        {loading ? (
          <div className="loading">Loading services...</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
              <span style={{ color: '#22c55e' }}><strong>{onlineCount}</strong> Online</span>
              <span style={{ color: '#f59e0b' }}><strong>{degradedCount}</strong> Degraded</span>
              <span style={{ color: '#ef4444' }}><strong>{unhealthyCount}</strong> Offline</span>
            </div>
            <div className="grid">
              {services.map((svc) => (
                <div key={svc.id} className="card">
                  <h3>{svc.name}</h3>
                  <p className="status-indicator">
                    <span className={`status-dot ${svc.status === 'healthy' ? 'online' : svc.status === 'unknown' ? 'unknown' : 'offline'}`}></span>
                    {getStatusLabel(svc.status)}
                  </p>
                  <p className="url">{svc.baseUrl}</p>
                </div>
              ))}
              {services.length === 0 && (
                <div className="card">
                  <h3>System Status</h3>
                  <p>No services reported</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="grid two-col" style={{ alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Mission Activity</h3>
            <button className="secondary" onClick={loadMissions} disabled={missionsLoading}>
              {missionsLoading ? '...' : 'Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
            <span><strong>{missions.length}</strong> Total</span>
            <span style={{ color: '#22c55e' }}><strong>{runningMissions}</strong> Running</span>
            <span style={{ color: '#38bdf8' }}><strong>{completedMissions}</strong> Completed</span>
            <span style={{ color: '#ef4444' }}><strong>{failedMissions}</strong> Failed</span>
          </div>
          {missionsLoading && missions.length === 0 ? (
            <div className="loading">Loading missions...</div>
          ) : (
            <div className="table-container">
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
                  {missions.slice(0, 8).map((m) => (
                    <tr key={m.workflowId}>
                      <td className="truncate">
                        <Link to={`/missions/${encodeURIComponent(m.workflowId)}`}>{m.missionId}</Link>
                      </td>
                      <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                      <td>{formatStarted(m)}</td>
                      <td>{formatDuration(m)}</td>
                      <td>
                        <button className="danger small" onClick={() => deleteMission(m.workflowId)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {missions.length === 0 && (
                    <tr><td colSpan={5}>No missions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: '12px' }}>
            <Link to="/missions" className="link-button">View All Missions</Link>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Agent Status</h3>
            <button className="secondary" onClick={loadAgents} disabled={agentsLoading}>
              {agentsLoading ? '...' : 'Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
            <span><strong>{agents.length}</strong> Total</span>
            <span style={{ color: '#22c55e' }}><strong>{activeAgents}</strong> Active</span>
          </div>
          {agentsLoading && agents.length === 0 ? (
            <div className="loading">Loading agents...</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td className="truncate">{a.name}</td>
                      <td>{a.type}</td>
                      <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                    </tr>
                  ))}
                  {agents.length === 0 && (
                    <tr><td colSpan={3}>No agents found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: '12px' }}>
            <Link to="/agents" className="link-button">View All Agents</Link>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Recent Events</h3>
          <span className="connection-status">
            <span className={`connection-dot ${feedConnected ? 'online' : 'offline'}`}></span>
            {feedConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
        {feedConnected ? (
          <div className="feed-stream">
            {recentEvents.length === 0 ? (
              <div className="empty-state">Waiting for events...</div>
            ) : (
              recentEvents.map((evt) => (
                <div key={evt.id} className="feed-item">
                  <span className="feed-time">{formatTime(evt.timestamp)}</span>
                  <span className="feed-source">{evt.source}</span>
                  <span className="feed-msg truncate">{evt.message}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="empty-state">
            Event feed not connected. <Link to="/feeds">Connect to live feed</Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
