import React, { useEffect, useMemo, useState } from 'react';
import { useFeedStore } from '../stores/feedStore';
import { postJSON } from '../utils/api';

interface AgentInfo {
  id: string;
  name?: string;
  role?: string;
  status?: string;
}

const AgentOutputsPanel: React.FC<{ missionId: string }> = ({ missionId }) => {
  const events = useFeedStore((s) => s.events);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agent-runtime/missions/${encodeURIComponent(missionId)}/agents`);
        if (!res.ok) throw new Error(`Failed to load agents: ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setAgents((data || []).map((a: any) => ({ id: a.id, name: a.name || a.id, role: a.role || a.agentRole, status: a.status })));
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [missionId]);

  const eventsByAgent = useMemo(() => {
    const map = new Map<string, Array<any>>();
    for (const e of events.filter((ev) => ev.missionId === missionId)) {
      const key = e.metadata?.agentId || e.metadata?.agentRole || e.source || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events, missionId]);

  const refreshAgent = async (id: string) => {
    try {
      const res = await fetch(`/api/agent-runtime/missions/${encodeURIComponent(missionId)}/agents`);
      if (!res.ok) return;
      const data = await res.json();
      setAgents((data || []).map((a: any) => ({ id: a.id, name: a.name || a.id, role: a.role || a.agentRole, status: a.status })));
    } catch (err) {
      // ignore
    }
  };

  if (loading) return <div className="agent-outputs-panel">Loading agents...</div>;
  if (error) return <div className="agent-outputs-panel error">{error}</div>;

  return (
    <div className="agent-outputs-panel">
      <h4 style={{ margin: '6px 0' }}>Agents</h4>
      {agents.length === 0 && <div className="muted">No agents for this mission.</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {agents.map((a) => (
          <li key={a.id} style={{ borderBottom: '1px solid #eee', padding: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{a.name}</strong>
                {a.role && <span className="muted" style={{ marginLeft: 8 }}>({a.role})</span>}
                {a.status && <span className={`badge ${a.status}`} style={{ marginLeft: 8 }}>{a.status}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => refreshAgent(a.id)} style={{ fontSize: 12 }}>Refresh</button>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <strong style={{ fontSize: 12 }}>Recent output</strong>
              <div style={{ marginTop: 6 }}>
                {(eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || []).slice(-4).map((ev, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12 }}>
                    <span style={{ marginRight: 6 }}>[{new Date(ev.timestamp || Date.now()).toLocaleTimeString()}]</span>
                    <span>{ev.message}</span>
                  </div>
                ))}
                {((eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || []).length === 0) && (
                  <div className="muted" style={{ fontSize: 12 }}>No recent outputs</div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AgentOutputsPanel;
