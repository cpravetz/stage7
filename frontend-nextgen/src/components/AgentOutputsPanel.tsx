import { useEffect, useMemo, useState } from 'react';
import { useFeedStore } from '../stores/feedStore';

interface AgentInfo {
  id: string;
  name?: string;
  role?: string;
  status?: string;
}

interface AgentOutputsPanelProps {
  missionId: string;
}

type AgentLike = { id: string; name?: string; role?: string; agentRole?: string; status?: string };

function extractAgents(data: unknown): AgentLike[] {
  if (Array.isArray(data)) return data as AgentLike[];
  if (data && typeof data === 'object') {
    const maybe = (data as { agents?: unknown }).agents;
    if (Array.isArray(maybe)) return maybe as AgentLike[];
  }
  return [];
}

function extractAgentsFromEvents(events: Array<{ missionId?: string; source?: string; metadata?: Record<string, unknown> }>, missionId: string): AgentInfo[] {
  const agentMap = new Map<string, AgentInfo>();
  for (const e of events.filter(ev => ev.missionId === missionId)) {
    const agentId = (e.metadata?.agentId as string | undefined) || (e.metadata?.agentRole as string | undefined) || e.source;
    if (agentId && agentId !== 'orchestrator' && agentId !== 'mission' && !agentId.startsWith('mission:')) {
      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          id: agentId,
          name: (e.metadata?.agentName as string) || agentId,
          role: (e.metadata?.agentRole as string) || (e.metadata?.assistantId as string) || undefined,
          status: 'completed',
        });
      }
    }
  }
  return Array.from(agentMap.values());
}

const AgentOutputsPanel = ({ missionId }: AgentOutputsPanelProps) => {
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
        const apiAgents = extractAgents(data).map((a: { id: string; name?: string; role?: string; agentRole?: string; status?: string }) => ({ id: a.id, name: a.name || a.id, role: a.role || a.agentRole, status: a.status }));
        // Also extract agents from feed events as fallback
        const eventAgents = extractAgentsFromEvents(events, missionId);
        // Merge agents, preferring API agents
        const merged = new Map<string, AgentInfo>();
        for (const a of apiAgents) merged.set(a.id, a);
        for (const a of eventAgents) if (!merged.has(a.id)) merged.set(a.id, a);
        setAgents(Array.from(merged.values()));
      } catch (err) {
        if (!mounted) return;
        // Fallback to event-derived agents
        const eventAgents = extractAgentsFromEvents(events, missionId);
        setAgents(eventAgents);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [missionId, events]);

  const eventsByAgent = useMemo(() => {
    const map = new Map<string, Array<{ type: string; source?: string; message: string; timestamp?: number; metadata?: Record<string, unknown> }>>();
    for (const e of events.filter((ev) => ev.missionId === missionId)) {
      const key = (e.metadata?.agentId as string | undefined) || (e.metadata?.agentRole as string | undefined) || e.source || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events, missionId]);

  const refreshAgent = async () => {
    try {
      const res = await fetch(`/api/agent-runtime/missions/${encodeURIComponent(missionId)}/agents`);
      if (!res.ok) return;
      const data = await res.json();
       const apiAgents = extractAgents(data).map((a: { id: string; name?: string; role?: string; agentRole?: string; status?: string }) => ({ id: a.id, name: a.name || a.id, role: a.role || a.agentRole, status: a.status }));
       const eventAgents = extractAgentsFromEvents(events, missionId);
       const merged = new Map<string, AgentInfo>();
       for (const a of apiAgents) merged.set(a.id, a);
       for (const a of eventAgents) if (!merged.has(a.id)) merged.set(a.id, a);
       setAgents(Array.from(merged.values()));
     } catch {
      // ignore
    }
  };

  if (loading && agents.length === 0) return <div className="agent-outputs-panel">Loading agents...</div>;
  if (error && agents.length === 0) return <div className="agent-outputs-panel error">{error}</div>;

  return (
    <div className="agent-outputs-panel">
      <h4 style={{ margin: '6px 0' }}>Agents</h4>
      {agents.length === 0 && <div className="muted">No agents recorded for this mission.</div>}
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
                <button onClick={() => refreshAgent()} style={{ fontSize: 12 }}>Refresh</button>
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
