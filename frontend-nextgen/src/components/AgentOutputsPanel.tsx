import { useEffect, useMemo, useRef, useState } from 'react';
import { useFeedStore } from '../stores/feedStore';

interface AgentInfo {
  id: string;
  name?: string;
  role?: string;
  status?: string;
}

interface PlanTask {
  id: string;
  title: string;
  agentRole?: string;
}

interface PlanPhase {
  id: string;
  tasks: PlanTask[];
}

interface Plan {
  phases: PlanPhase[];
}

interface AgentOutputsPanelProps {
  missionId: string;
  missionStatus?: string;
  plan?: Plan | null;
}

type AgentLike = {
  id: string;
  name?: string;
  role?: string;
  agentRole?: string;
  type?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

function displayAgentName(name: string | undefined, fallback = ''): string {
  return (name || fallback).replace(/\s+Agent$/i, '').trim();
}

function getThought(event: { type: string; message: string; metadata?: Record<string, unknown> }): string | undefined {
  const nested = event.metadata?.data as Record<string, unknown> | undefined;
  const thought = event.metadata?.thought || nested?.thought;
  if (typeof thought === 'string' && thought.trim()) return thought;
  if (event.type === 'monologue') {
    const text = event.metadata?.text || event.message;
    if (typeof text === 'string' && text.trim()) return text;
  }
  return undefined;
}

function getCompletedTaskTitle(event: { metadata?: Record<string, unknown> }): string | undefined {
  const title = event.metadata?.taskTitle || event.metadata?.taskId;
  if (typeof title !== 'string' || !title.trim()) return undefined;
  const trimmed = title.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function extractAgents(data: unknown): AgentLike[] {
  if (Array.isArray(data)) return data as AgentLike[];
  if (data && typeof data === 'object') {
    const maybe = (data as { agents?: unknown }).agents;
    if (Array.isArray(maybe)) return maybe as AgentLike[];
  }
  return [];
}

function extractAgentsFromPlan(plan: Plan | null | undefined, missionId: string): AgentInfo[] {
  if (!plan) return [];
  const agentMap = new Map<string, AgentInfo>();
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      if (task.agentRole) {
        const agentId = `agent-${missionId}-${task.agentRole.toLowerCase()}`;
        if (!agentMap.has(agentId)) {
          agentMap.set(agentId, {
            id: agentId,
            name: displayAgentName(task.agentRole),
            role: task.agentRole,
            status: 'planned',
          });
        }
      }
    }
  }
  return Array.from(agentMap.values());
}

function extractAgentsFromEvents(events: Array<{ type: string; missionId?: string; source?: string; metadata?: Record<string, unknown> }>, missionId: string): AgentInfo[] {
  const agentMap = new Map<string, AgentInfo>();
  for (const e of events.filter(ev => ev.missionId === missionId).reverse()) {
    const role = e.metadata?.agentRole as string | undefined;
    const isPlannerEvent = e.type === 'planner_started' || e.type === 'plan_generated';
    if (!role && !isPlannerEvent) continue;
    const normalizedRole = role || 'planner';
    const agentId = (e.metadata?.agentId as string | undefined)
      || `agent-${missionId}-${normalizedRole.toLowerCase()}`;
    const status = (e.metadata?.status as string | undefined) || (
      e.type === 'planner_started' || e.type === 'task_started' ? 'running' :
      e.type === 'task_failed' ? 'failed' :
      e.type === 'plan_generated' || e.type === 'task_completed' ? 'completed' :
      'planned'
    );
    agentMap.set(agentId, {
      id: agentId,
      name: displayAgentName(
        e.metadata?.agentName as string | undefined,
        normalizedRole === 'planner' ? 'Mission Planner' : normalizedRole,
      ),
      role: normalizedRole,
      status,
    });
  }
  return Array.from(agentMap.values());
}

// Roles that are architectural elements or system processes, not
// task-executing agents. They should not appear as agent cards.
const SYSTEM_ROLES = new Set(['planner', 'mission-evaluator', 'phase-review', 'brain']);

const LIFECYCLE_EVENT_TYPES = new Set([
  'task_started', 'task_completed', 'task_failed',
  'planner_started', 'plan_generated', 'planner_progress',
  'phase_started', 'phase_completed', 'phase_approved', 'phase_rejected', 'phase_plan_amended',
  'approval_requested', 'approval_approved', 'approval_rejected',
  'mission_started', 'mission_completed', 'mission_failed', 'mission_canceled',
  'mission_paused', 'mission_resumed', 'mission_incomplete', 'mission_needs_review',
  'clarification_needed', 'cost_estimate',
]);

function isReasoningEvent(e: { type: string; metadata?: Record<string, unknown> }): boolean {
  if (e.type === 'monologue') return true;
  if (LIFECYCLE_EVENT_TYPES.has(e.type)) return false;
  return !!(e.metadata && (e.metadata.thought || (e.metadata.data as Record<string, unknown> | undefined)?.thought));
}

const ReasoningBox = ({ events }: { events: Array<{ type: string; message: string; timestamp?: number; metadata?: Record<string, unknown> }> }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events]);
  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ fontSize: 12 }}>Reasoning</strong>
      <div ref={ref} style={{ maxHeight: 160, overflow: 'auto', marginTop: 6 }}>
        {events.map((ev, i) => (
          <div key={i} className="muted" style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            <span style={{ marginRight: 6 }}>[{new Date(ev.timestamp || Date.now()).toLocaleTimeString()}]</span>
            <span>{getThought(ev)}</span>
          </div>
        ))}
        {events.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No reasoning</div>}
      </div>
    </div>
  );
};

const AgentOutputsPanel = ({ missionId, missionStatus, plan }: AgentOutputsPanelProps) => {
  const events = useFeedStore((s) => s.events);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const eventAgents = extractAgentsFromEvents(events, missionId)
        .filter((agent) => !SYSTEM_ROLES.has(String(agent.role || '').toLowerCase()));
      try {
        const res = await fetch(`/api/agent-runtime/missions/${encodeURIComponent(missionId)}/agents`);
        if (!res.ok) throw new Error(`Failed to load agents: ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        const apiAgents = extractAgents(data).map((a) => ({
          id: a.id,
          name: displayAgentName(a.name, a.id),
          role: a.role || a.agentRole || (a.metadata?.agentRole as string | undefined) || a.type,
          status: a.status,
        }));
        // Extract agents from plan
        const planAgents = extractAgentsFromPlan(plan, missionId);
        // Filter out system/architectural roles that are not task-executing agents
        const filteredApiAgents = apiAgents.filter((a) => !SYSTEM_ROLES.has(String(a.role || '').toLowerCase()));
        const filteredPlanAgents = planAgents.filter((a) => !SYSTEM_ROLES.has(String(a.role || '').toLowerCase()));
        // Merge agents, preferring API agents, then event agents, then plan agents
        const merged = new Map<string, AgentInfo>();
        for (const a of filteredApiAgents) merged.set(a.id, a);
        for (const a of eventAgents) merged.set(a.id, { ...merged.get(a.id), ...a });
        for (const a of filteredPlanAgents) {
          const current = merged.get(a.id);
          merged.set(a.id, { ...a, ...current, status: current?.status || a.status });
        }
        if (missionStatus === 'running' && !merged.has(`agent-${missionId}-planner`)) {
          merged.set(`agent-${missionId}-planner`, {
            id: `agent-${missionId}-planner`,
            name: 'Mission Planner',
            role: 'planner',
            status: 'planning',
          });
        }
        // If mission is complete/finished, override agent statuses to completed/idle
        if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'canceled' || missionStatus === 'incomplete' || missionStatus === 'awaiting_review' || missionStatus === 'needs_review') {
          for (const [id, agent] of merged.entries()) {
            if (agent.role === 'planner') {
              merged.set(id, { ...agent, status: 'completed' });
            } else {
              merged.set(id, { ...agent, status: agent.status === 'failed' ? 'failed' : 'completed' });
            }
          }
        }
        setAgents(Array.from(merged.values()));
      } catch (err) {
        if (!mounted) return;
        // Fallback to event-derived agents + plan agents
        const planAgents = extractAgentsFromPlan(plan, missionId).filter((a) => !SYSTEM_ROLES.has(String(a.role || '').toLowerCase()));
        const merged = new Map<string, AgentInfo>();
        for (const a of eventAgents) merged.set(a.id, a);
        for (const a of planAgents) if (!merged.has(a.id)) merged.set(a.id, { ...a, status: a.status || 'planned' });
        if (missionStatus === 'running' && !merged.has(`agent-${missionId}-planner`)) {
          merged.set(`agent-${missionId}-planner`, {
            id: `agent-${missionId}-planner`,
            name: 'Mission Planner',
            role: 'planner',
            status: 'planning',
          });
        }
        if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'canceled' || missionStatus === 'incomplete' || missionStatus === 'awaiting_review' || missionStatus === 'needs_review') {
          for (const [id, agent] of merged.entries()) {
            if (agent.role === 'planner') {
              merged.set(id, { ...agent, status: 'completed' });
            } else {
              merged.set(id, { ...agent, status: agent.status === 'failed' ? 'failed' : 'completed' });
            }
          }
        }
        setAgents(Array.from(merged.values()));
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [missionId, events, missionStatus, plan]);

  const eventsByAgent = useMemo(() => {
    const map = new Map<string, Array<{ type: string; source?: string; message: string; timestamp?: number; metadata?: Record<string, unknown> }>>();
    for (const e of events.filter((ev) => ev.missionId === missionId)) {
      const key = (e.metadata?.agentId as string | undefined) || (e.metadata?.agentRole as string | undefined) || e.source || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const agentEvents of map.values()) {
      agentEvents.sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
    }
    return map;
  }, [events, missionId]);

  const refreshAgent = async () => {
    try {
      const res = await fetch(`/api/agent-runtime/missions/${encodeURIComponent(missionId)}/agents`);
      if (!res.ok) return;
      const data = await res.json();
       const apiAgents = extractAgents(data).map((a) => ({
          id: a.id,
          name: displayAgentName(a.name, a.id),
          role: a.role || a.agentRole || (a.metadata?.agentRole as string | undefined) || a.type,
          status: a.status,
        }));
       const eventAgents = extractAgentsFromEvents(events, missionId).filter((a) => !SYSTEM_ROLES.has(String(a.role || '').toLowerCase()));
       const planAgents = extractAgentsFromPlan(plan, missionId).filter((a) => !SYSTEM_ROLES.has(String(a.role || '').toLowerCase()));
       const filteredApiAgents = apiAgents.filter((a) => !SYSTEM_ROLES.has(String(a.role || '').toLowerCase()));
       const merged = new Map<string, AgentInfo>();
       for (const a of filteredApiAgents) merged.set(a.id, a);
       for (const a of eventAgents) if (!merged.has(a.id)) merged.set(a.id, a);
       for (const a of planAgents) if (!merged.has(a.id)) merged.set(a.id, { ...a, status: a.status || 'planned' });
       if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'canceled' || missionStatus === 'incomplete' || missionStatus === 'awaiting_review' || missionStatus === 'needs_review') {
         for (const [id, agent] of merged.entries()) {
           if (agent.role === 'planner') {
             merged.set(id, { ...agent, status: 'completed' });
           } else {
             merged.set(id, { ...agent, status: agent.status === 'failed' ? 'failed' : 'completed' });
           }
         }
       }
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
                <strong>{displayAgentName(a.name, a.id)}</strong>
                {a.role && <span className="muted" style={{ marginLeft: 8 }}>({a.role})</span>}
                {a.status && <span className={`badge ${a.status}`} style={{ marginLeft: 8 }}>{a.status}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => refreshAgent()} style={{ fontSize: 12 }}>Refresh</button>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <strong style={{ fontSize: 12 }}>Activity</strong>
              <div style={{ marginTop: 6 }}>
                {(() => {
                  const evs = eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || [];
                  const completedTasks = evs
                    .filter((event) => event.type === 'task_completed')
                    .map((event) => ({ event, title: getCompletedTaskTitle(event) }))
                    .filter((item): item is { event: typeof evs[number]; title: string } => !!item.title)
                    .slice(-4);
                  if (completedTasks.length === 0) {
                    return <div className="muted" style={{ fontSize: 12 }}>No completed activities</div>;
                  }
                  return completedTasks.map(({ event, title }) => (
                    <div key={`${event.timestamp}-${title}`} className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                      <span style={{ marginRight: 6 }}>[{new Date(event.timestamp || Date.now()).toLocaleTimeString()}]</span>
                      <span>Completed: {title}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <strong style={{ fontSize: 12 }}>Recent output</strong>
              <div style={{ marginTop: 6 }}>
                {((eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || [])
                  .filter((ev) => !isReasoningEvent(ev) && !LIFECYCLE_EVENT_TYPES.has(ev.type))
                  .slice(-4)).map((ev, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    <span style={{ marginRight: 6 }}>[{new Date(ev.timestamp || Date.now()).toLocaleTimeString()}]</span>
                    <span>{ev.message}</span>
                  </div>
                ))}
                {((eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || [])
                  .filter((ev) => !isReasoningEvent(ev) && !LIFECYCLE_EVENT_TYPES.has(ev.type)).length === 0) && (
                  <div className="muted" style={{ fontSize: 12 }}>No recent outputs</div>
                )}
              </div>
            </div>
            {(() => {
              const evs = eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || [];
              const reasoning = evs.filter((event) => isReasoningEvent(event) && !!getThought(event));
              return <ReasoningBox events={reasoning} />;
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AgentOutputsPanel;
