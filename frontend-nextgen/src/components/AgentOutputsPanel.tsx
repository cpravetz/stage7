import { useEffect, useMemo, useRef, useState } from 'react';
import { useFeedStore } from '../stores/feedStore';

interface AgentInfo {
  id: string;
  name?: string;
  role?: string;
  status?: string;
  lastError?: string;
  activeTaskId?: string;
  progress?: { brainCalls?: number; toolCalls?: number; lastAction?: string };
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
  lastError?: string;
  activeTaskId?: string;
  progress?: { brainCalls?: number; toolCalls?: number; lastAction?: string };
  metadata?: Record<string, unknown>;
};

function displayAgentName(name: string | undefined, fallback = ''): string {
  return (name || fallback).replace(/(?:\s+Agent)+$/i, '').trim();
}

function canonicalRole(role: string): string {
  return role
    .replace(/[_-]+/g, ' ')
    .replace(/(?:\s+Agent)+$/i, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
}

function chooseStatus(left?: string, right?: string): string | undefined {
  const priority: Record<string, number> = {
    running: 5,
    waiting: 4,
    failed: 3,
    idle: 2,
    completed: 1,
    planned: 0,
  };
  if (!left) return right;
  if (!right) return left;
  return (priority[right] ?? 0) > (priority[left] ?? 0) ? right : left;
}

function getOversightRoleIcon(role: string): string {
  const canonical = canonicalRole(role);
  switch (canonical) {
    case 'mission-director':
    case 'director':
      return '🎯';
    case 'planner':
      return '📋';
    case 'phase-reviewer':
    case 'phase-review':
      return '🔍';
    case 'mission-evaluator':
      return '⚖️';
    default:
      return '';
  }
}

function getOversightRoleLabel(role: string): string {
  const canonical = canonicalRole(role);
  switch (canonical) {
    case 'mission-director':
    case 'director':
      return 'Director';
    case 'planner':
      return 'Planner';
    case 'phase-reviewer':
    case 'phase-review':
      return 'Reviewer';
    case 'mission-evaluator':
      return 'Evaluator';
    default:
      return '';
  }
}

function getThought(event: { type: string; message: string; metadata?: Record<string, unknown> }): string | undefined {
  const nested = event.metadata?.data as Record<string, unknown> | undefined;
  const candidates = [
    event.metadata?.thought,
    nested?.thought,
    event.metadata?.reason,
    nested?.reason,
    event.metadata?.text,
    nested?.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (event.type === 'monologue' && typeof event.message === 'string' && event.message.trim()) {
    return event.message.trim();
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
        const agentId = `agent-${missionId}-${canonicalRole(task.agentRole)}`;
        if (!agentMap.has(agentId)) {
          agentMap.set(agentId, {
            id: agentId,
            name: displayAgentName(task.agentRole),
            role: displayAgentName(task.agentRole),
            status: 'planned',
          });
        }
      }
    }
  }
  return Array.from(agentMap.values());
}

function inferAgentRole(event: { type: string; metadata?: Record<string, unknown> }): string | undefined {
  const role = typeof event.metadata?.agentRole === 'string' ? event.metadata.agentRole : undefined;
  if (role && role.trim()) return role;
  if (event.type.startsWith('planner_') || event.type === 'plan_generated') return 'planner';
  if (event.type.startsWith('phase_') || event.type.startsWith('approval_')) return 'mission-director';
  if (event.type === 'mission_started' || event.type === 'mission_completed' || event.type === 'mission_failed' || event.type === 'mission_canceled' || event.type === 'mission_incomplete' || event.type === 'mission_needs_review' || event.type === 'mission_paused' || event.type === 'mission_resumed') return 'mission-director';
  if (event.type === 'agent_delegation' || event.type === 'agent_acknowledgement' || event.type === 'agent_response' || event.type === 'agent_error') return 'mission-director';
  return undefined;
}

function defaultAgentName(role: string): string {
  const r = role.toLowerCase().replace(/[_\s]+/g, '-');
  if (r === 'planner') return 'Mission Planner';
  if (r === 'mission-director' || r === 'director') return 'Mission Director';
  if (r === 'phase-reviewer' || r === 'phase-review') return 'Phase Reviewer';
  if (r === 'mission-evaluator') return 'Mission Evaluator';
  return displayAgentName(role);
}

function extractAgentsFromEvents(events: Array<{ type: string; missionId?: string; source?: string; timestamp?: number; metadata?: Record<string, unknown> }>, missionId: string): AgentInfo[] {
  const agentMap = new Map<string, AgentInfo>();
  const missionEvents = events
    .filter((event) => event.missionId === missionId)
    .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
  for (const e of missionEvents) {
    const normalizedRoleRaw = inferAgentRole(e);
    if (!normalizedRoleRaw) continue;
    const normalizedRole = canonicalRole(normalizedRoleRaw);
    const agentId = `agent-${missionId}-${normalizedRole}`;
    const status = (e.metadata?.status as string | undefined) || (
      e.type === 'planner_started' || e.type === 'task_started' || e.type === 'planner_progress' ? 'running' :
      e.type === 'task_failed' ? 'failed' :
      e.type === 'task_incomplete' ? 'incomplete' :
      e.type === 'plan_generated' || e.type === 'task_completed' || e.type === 'phase_completed' || e.type === 'phase_approved' ? 'completed' :
      'planned'
    );
    const prev = agentMap.get(agentId);
    agentMap.set(agentId, {
      id: agentId,
      name: displayAgentName((e.metadata?.agentName as string | undefined) || prev?.name, defaultAgentName(normalizedRoleRaw)),
      role: defaultAgentName(normalizedRoleRaw),
      status: chooseStatus(prev?.status, status) || status,
    });
  }
  return Array.from(agentMap.values());
}

// Roles that are architectural elements or system processes, not
// task-executing agents. They should not appear as agent cards.
// Roles that are purely internal/system processes and should not appear as agent cards.
// Oversight roles (mission-director, mission-evaluator, phase-reviewer) are surfaced when active.
const SYSTEM_ROLES = new Set(['brain']);

const LIFECYCLE_EVENT_TYPES = new Set([
  'task_started', 'task_completed', 'task_incomplete', 'task_failed',
  'planner_started', 'plan_generated', 'planner_progress',
  'phase_started', 'phase_completed', 'phase_approved', 'phase_rejected', 'phase_plan_amended',
  'approval_requested', 'approval_approved', 'approval_rejected',
  'mission_started', 'mission_completed', 'mission_failed', 'mission_canceled',
  'mission_paused', 'mission_resumed', 'mission_incomplete', 'mission_needs_review',
  'clarification_needed', 'cost_estimate',
]);

function isReasoningEvent(e: { type: string; message: string; metadata?: Record<string, unknown> }): boolean {
  if (e.type === 'monologue') return true;
  if (e.type === 'planner_progress') return !!getThought(e);
  if (LIFECYCLE_EVENT_TYPES.has(e.type)) return false;
  return !!getThought(e);
}

// Dedupe key for reasoning/decision items to avoid duplicate director traces
function getReasoningDedupeKey(event: { type: string; message: string; timestamp?: number; metadata?: Record<string, unknown>; id?: string }): string {
  const role = typeof event.metadata?.agentRole === 'string' ? event.metadata.agentRole : '';
  const phaseId = typeof event.metadata?.phaseId === 'string' ? event.metadata.phaseId : '';
  const taskId = typeof event.metadata?.taskId === 'string' ? event.metadata.taskId : '';
  const kind = typeof event.metadata?.kind === 'string' ? event.metadata.kind : '';
  const decision = typeof event.metadata?.decision === 'string' ? event.metadata.decision : '';
  const stableId = typeof event.id === 'string' && event.id ? event.id : `${Math.floor((event.timestamp || 0) / 1000)}`;
  const thought = getThought(event) || event.message || '';
  return `${role}|${phaseId}|${taskId}|${kind}|${decision}|${stableId}|${thought.slice(0, 200)}`;
}

const ReasoningBox = ({ events }: { events: Array<{ type: string; message: string; timestamp?: number; metadata?: Record<string, unknown>; id?: string }> }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events]);

  // Component-level dedupe for reasoning events
  const dedupedEvents = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((ev) => {
      const key = getReasoningDedupeKey(ev);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [events]);

  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ fontSize: 12 }}>Reasoning</strong>
      <div ref={ref} style={{ maxHeight: 160, overflow: 'auto', marginTop: 6 }}>
        {dedupedEvents.map((ev, i) => (
          <div key={i} className="muted" style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            <span style={{ marginRight: 6 }}>[{new Date(ev.timestamp || Date.now()).toLocaleTimeString()}]</span>
            <span>{getThought(ev) || ev.message}</span>
          </div>
        ))}
        {dedupedEvents.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No recorded reasoning</div>}
      </div>
    </div>
  );
};

const AgentOutputsPanel = ({ missionId, missionStatus, plan }: AgentOutputsPanelProps) => {
  const events = useFeedStore((s) => s.events);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    let mounted = true;
    const activeRequests = new Set<AbortController>();
    const load = async () => {
      if (activeRequests.size > 0) return;
      setError(null);
      const eventAgents = extractAgentsFromEvents(eventsRef.current, missionId)
        .filter((agent) => !SYSTEM_ROLES.has(canonicalRole(String(agent.role || ''))));
      const planAgents = extractAgentsFromPlan(plan, missionId)
        .filter((agent) => !SYSTEM_ROLES.has(canonicalRole(String(agent.role || ''))));
      const fallbackAgents = new Map<string, AgentInfo>();
      for (const agent of eventAgents) fallbackAgents.set(agent.id, agent);
      for (const agent of planAgents) {
        if (!fallbackAgents.has(agent.id)) fallbackAgents.set(agent.id, { ...agent, status: agent.status || 'planned' });
      }
      if (missionStatus === 'running') {
        if (!fallbackAgents.has(`agent-${missionId}-planner`)) fallbackAgents.set(`agent-${missionId}-planner`, { id: `agent-${missionId}-planner`, name: 'Mission Planner', role: 'planner', status: 'planning' });
        if (!fallbackAgents.has(`agent-${missionId}-mission-director`)) fallbackAgents.set(`agent-${missionId}-mission-director`, { id: `agent-${missionId}-mission-director`, name: 'Mission Director', role: 'mission-director', status: 'running' });
      }
      setAgents(Array.from(fallbackAgents.values()));
      setLoading(fallbackAgents.size === 0);

      const controller = new AbortController();
      activeRequests.add(controller);
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8_000);
      try {
        const res = await fetch(`/api/agent-runtime/missions/${encodeURIComponent(missionId)}/agents`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed to load agents: ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        const apiAgents = extractAgents(data).map((a) => ({
          id: `agent-${missionId}-${canonicalRole(a.role || a.agentRole || (a.metadata?.agentRole as string | undefined) || a.type || a.name || a.id)}`,
          name: displayAgentName(a.name, a.id),
          role: a.role || a.agentRole || (a.metadata?.agentRole as string | undefined) || a.type,
          status: a.status,
          lastError: a.lastError,
          activeTaskId: a.activeTaskId,
          progress: a.progress,
        }));
        // Extract agents from plan
        const planAgents = extractAgentsFromPlan(plan, missionId);
        // Filter out system/architectural roles that are not task-executing agents
        const filteredApiAgents = apiAgents.filter((a) => !SYSTEM_ROLES.has(canonicalRole(String(a.role || ''))));
        const filteredPlanAgents = planAgents.filter((a) => !SYSTEM_ROLES.has(canonicalRole(String(a.role || ''))));
        // Merge agents, preferring API agents, then event agents, then plan agents
        const merged = new Map<string, AgentInfo>();
        for (const a of filteredApiAgents) {
          const current = merged.get(a.id);
          merged.set(a.id, {
            ...current,
            ...a,
            status: chooseStatus(current?.status, a.status),
            activeTaskId: a.activeTaskId || current?.activeTaskId,
            progress: a.progress || current?.progress,
          });
        }
        for (const a of eventAgents) {
          const current = merged.get(a.id);
          merged.set(a.id, {
            ...a,
            ...current,
            status: current?.status || a.status,
          });
        }
        for (const a of filteredPlanAgents) {
          const current = merged.get(a.id);
          merged.set(a.id, { ...a, ...current, status: current?.status || a.status });
        }
        if (missionStatus === 'running') {
          if (!merged.has(`agent-${missionId}-planner`)) merged.set(`agent-${missionId}-planner`, { id: `agent-${missionId}-planner`, name: 'Mission Planner', role: 'planner', status: 'planning' });
          if (!merged.has(`agent-${missionId}-mission-director`)) merged.set(`agent-${missionId}-mission-director`, { id: `agent-${missionId}-mission-director`, name: 'Mission Director', role: 'mission-director', status: 'running' });
        }
        if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'canceled' || missionStatus === 'incomplete' || missionStatus === 'awaiting_review' || missionStatus === 'needs_review') {
          for (const [id, agent] of merged.entries()) {
            const role = canonicalRole(String(agent.role || ''));
            if (role === 'planner') merged.set(id, { ...agent, status: missionStatus === 'failed' ? (agent.status === 'failed' ? 'failed' : 'completed') : 'completed' });
            else merged.set(id, { ...agent, status: agent.status === 'failed' ? 'failed' : 'completed' });
          }
        }
        setAgents(Array.from(merged.values()));
      } catch (err) {
        if (!mounted) return;
        // Fallback to event-derived agents + plan agents
        const fallbackPlanAgents = extractAgentsFromPlan(plan, missionId).filter((a) => !SYSTEM_ROLES.has(canonicalRole(String(a.role || ''))));
        const merged = new Map<string, AgentInfo>();
        for (const a of eventAgents) merged.set(a.id, a);
        for (const a of fallbackPlanAgents) if (!merged.has(a.id)) merged.set(a.id, { ...a, status: a.status || 'planned' });
        if (missionStatus === 'running') {
          if (!merged.has(`agent-${missionId}-planner`)) merged.set(`agent-${missionId}-planner`, { id: `agent-${missionId}-planner`, name: 'Mission Planner', role: 'planner', status: 'planning' });
          if (!merged.has(`agent-${missionId}-mission-director`)) merged.set(`agent-${missionId}-mission-director`, { id: `agent-${missionId}-mission-director`, name: 'Mission Director', role: 'mission-director', status: 'running' });
        }
        if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'canceled' || missionStatus === 'incomplete' || missionStatus === 'awaiting_review' || missionStatus === 'needs_review') {
          for (const [id, agent] of merged.entries()) {
            const role = canonicalRole(String(agent.role || ''));
            if (role === 'planner') merged.set(id, { ...agent, status: missionStatus === 'failed' ? (agent.status === 'failed' ? 'failed' : 'completed') : 'completed' });
            else merged.set(id, { ...agent, status: agent.status === 'failed' ? 'failed' : 'completed' });
          }
        }
        setAgents(Array.from(merged.values()));
        setError(timedOut
          ? 'Agent status request timed out after 8 seconds; showing agents from the plan and mission events.'
          : err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timeout);
        activeRequests.delete(controller);
        if (mounted) setLoading(false);
      }
    };
    void load();
    const interval = missionStatus === 'running'
      ? setInterval(() => { void load(); }, 5_000)
      : undefined;
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      for (const controller of activeRequests) controller.abort();
    };
  }, [missionId, missionStatus, plan]);

  const eventsByAgent = useMemo(() => {
    const inferRole = (e: { type: string; metadata?: Record<string, unknown> }): string | undefined => {
      const role = typeof e.metadata?.agentRole === 'string' ? e.metadata.agentRole : undefined;
      if (role && role.trim()) return role;
      if (e.type.startsWith('planner_') || e.type === 'plan_generated') return 'planner';
      if (e.type.startsWith('phase_') || e.type.startsWith('approval_')) return 'mission-director';
      if (e.type === 'mission_started' || e.type === 'mission_completed' || e.type === 'mission_failed' || e.type === 'mission_canceled' || e.type === 'mission_incomplete' || e.type === 'mission_needs_review' || e.type === 'mission_paused' || e.type === 'mission_resumed') return 'mission-director';
      if (e.type === 'agent_delegation' || e.type === 'agent_acknowledgement' || e.type === 'agent_response' || e.type === 'agent_error') return 'mission-director';
      return undefined;
    };
    const map = new Map<string, Array<{ type: string; source?: string; message: string; timestamp?: number; metadata?: Record<string, unknown>; id?: string }>>();
    for (const e of events.filter((ev) => ev.missionId === missionId)) {
      const role = inferRole(e);
      const key = role
        ? `agent-${missionId}-${canonicalRole(role)}`
        : (e.metadata?.agentId as string | undefined) || e.source || 'unknown';
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
        id: `agent-${missionId}-${canonicalRole(a.role || a.agentRole || (a.metadata?.agentRole as string | undefined) || a.type || a.name || a.id)}`,
        name: displayAgentName(a.name, a.id),
        role: a.role || a.agentRole || (a.metadata?.agentRole as string | undefined) || a.type,
        status: a.status,
        lastError: a.lastError,
        activeTaskId: a.activeTaskId,
        progress: a.progress,
      }));
      const eventAgents = extractAgentsFromEvents(eventsRef.current, missionId).filter((a) => !SYSTEM_ROLES.has(canonicalRole(String(a.role || ''))));
      const planAgents = extractAgentsFromPlan(plan, missionId).filter((a) => !SYSTEM_ROLES.has(canonicalRole(String(a.role || ''))));
      const filteredApiAgents = apiAgents.filter((a) => !SYSTEM_ROLES.has(canonicalRole(String(a.role || ''))));
      const merged = new Map<string, AgentInfo>();
      for (const a of filteredApiAgents) {
        const current = merged.get(a.id);
        merged.set(a.id, {
          ...current,
          ...a,
          status: chooseStatus(current?.status, a.status),
          activeTaskId: a.activeTaskId || current?.activeTaskId,
          progress: a.progress || current?.progress,
        });
      }
      for (const a of eventAgents) {
        if (!merged.has(a.id)) merged.set(a.id, a);
      }
      for (const a of planAgents) if (!merged.has(a.id)) merged.set(a.id, { ...a, status: a.status || 'planned' });
      if (missionStatus === 'running') {
        if (!merged.has(`agent-${missionId}-planner`)) merged.set(`agent-${missionId}-planner`, { id: `agent-${missionId}-planner`, name: 'Mission Planner', role: 'planner', status: 'planning' });
        if (!merged.has(`agent-${missionId}-mission-director`)) merged.set(`agent-${missionId}-mission-director`, { id: `agent-${missionId}-mission-director`, name: 'Mission Director', role: 'mission-director', status: 'running' });
      }
      if (missionStatus === 'completed' || missionStatus === 'failed' || missionStatus === 'canceled' || missionStatus === 'incomplete' || missionStatus === 'awaiting_review' || missionStatus === 'needs_review') {
        for (const [id, agent] of merged.entries()) {
          const role = canonicalRole(String(agent.role || ''));
          if (role === 'planner') merged.set(id, { ...agent, status: missionStatus === 'failed' ? (agent.status === 'failed' ? 'failed' : 'completed') : 'completed' });
          else merged.set(id, { ...agent, status: agent.status === 'failed' ? 'failed' : 'completed' });
        }
      }
      setAgents(Array.from(merged.values()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading && agents.length === 0) return <div className="agent-outputs-panel">Loading agents...</div>;
  if (error && agents.length === 0) return <div className="agent-outputs-panel error">{error}</div>;

  return (
    <div className="agent-outputs-panel">
      <h4 style={{ margin: '6px 0' }}>Agents</h4>
      {error && <div className="error" role="alert">{error}</div>}
      {agents.length === 0 && <div className="muted">No agents recorded for this mission.</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {agents.map((a) => (
          <li key={a.id} style={{ borderBottom: '1px solid #eee', padding: '6px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{displayAgentName(a.name, a.id)}</strong>
                {(() => {
                  const canonical = canonicalRole(String(a.role || ''));
                  const icon = getOversightRoleIcon(a.role || '');
                  const label = getOversightRoleLabel(a.role || '');
                  if (icon && label) {
                    return (
                      <span className="muted" style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {icon} <span>{label}</span>
                      </span>
                    );
                  }
                  if (a.role) {
                    return <span className="muted" style={{ marginLeft: 8 }}>({a.role})</span>;
                  }
                  return null;
                })()}
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
                    .filter((event) => event.type === 'task_completed' || event.type === 'task_incomplete' || event.type === 'task_failed')
                    .map((event) => ({ event, title: getCompletedTaskTitle(event) }))
                    .filter((item): item is { event: typeof evs[number]; title: string } => !!item.title)
                    .slice(-4);
                  const decisionEvents = evs.filter((event) =>
                    event.type === 'plan_generated' || event.type === 'planner_started' || event.type === 'planner_progress'
                    || event.type === 'phase_plan_amended' || event.type === 'phase_completed' || event.type === 'phase_approved' || event.type === 'phase_rejected'
                    || event.type === 'approval_requested' || event.type === 'approval_approved' || event.type === 'approval_rejected'
                    || event.type === 'task_started' || event.type === 'clarification_needed'
                    || event.type === 'agent_delegation' || event.type === 'agent_acknowledgement' || event.type === 'agent_response' || event.type === 'agent_error'
                  ).slice(-6);
                  if (completedTasks.length === 0 && decisionEvents.length === 0) {
                    return <div className="muted" style={{ fontSize: 12 }}>No recorded activities yet</div>;
                  }
                  return (
                    <>
                      {completedTasks.map(({ event, title }, idx) => (
                        <div key={`task-${event.timestamp}-${idx}-${title}`} className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                          <span style={{ marginRight: 6 }}>[{new Date(event.timestamp || Date.now()).toLocaleTimeString()}]</span>
                          <span>{event.type === 'task_failed' ? 'Failed' : event.type === 'task_incomplete' ? 'Incomplete' : 'Completed'}: {title}</span>
                        </div>
                      ))}
                      {decisionEvents.length > 0 && (
                        <div style={{ marginTop: completedTasks.length > 0 ? 4 : 0 }}>
                          {completedTasks.length > 0 && <div className="muted" style={{ fontSize: 11, marginBottom: 4, fontWeight: 600 }}>Decisions & reasoning</div>}
                          {(() => {
                            // Dedupe decision events at component level
                            const seen = new Set<string>();
                            const deduped = decisionEvents.filter((event) => {
                              const key = getReasoningDedupeKey(event);
                              if (seen.has(key)) return false;
                              seen.add(key);
                              return true;
                            });
                            return deduped.map((event, idx) => (
                              <div key={`decision-${String((event as { id?: string }).id || event.timestamp || idx)}-${idx}`} className="muted" style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                <span style={{ marginRight: 6 }}>[{new Date(event.timestamp || Date.now()).toLocaleTimeString()}]</span>
                                <span>{getThought(event) || event.message}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            {a.activeTaskId && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                <strong>In progress:</strong>{' '}
                {plan?.phases.flatMap((phase) => phase.tasks).find((task) =>
                  a.activeTaskId?.endsWith(`:${task.id}`),
                )?.title || a.activeTaskId}
                {a.progress && (
                  <span>{` — ${a.progress.brainCalls || 0} Brain calls, ${a.progress.toolCalls || 0} tool actions${a.progress.lastAction ? `; last: ${a.progress.lastAction}` : ''}`}</span>
                )}
              </div>
            )}
            {a.lastError && (
              <div className="error" role="status" style={{ fontSize: 12, marginTop: 8 }}>
                Latest task error: {a.lastError}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <strong style={{ fontSize: 12 }}>Recent output</strong>
              <div style={{ marginTop: 6 }}>
                {((eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || [])
                  .filter((ev) => (
                    (!isReasoningEvent(ev) && !LIFECYCLE_EVENT_TYPES.has(ev.type))
                    || ((ev.type === 'task_completed' || ev.type === 'task_incomplete') && typeof ev.metadata?.output === 'string')
                  ))
                  .slice(-4)).map((ev, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    <span style={{ marginRight: 6 }}>[{new Date(ev.timestamp || Date.now()).toLocaleTimeString()}]</span>
                    <span>{typeof ev.metadata?.output === 'string' ? ev.metadata.output : ev.message}</span>
                  </div>
                ))}
                {((eventsByAgent.get(a.id) || eventsByAgent.get(a.role || '') || [])
                  .filter((ev) => (
                    (!isReasoningEvent(ev) && !LIFECYCLE_EVENT_TYPES.has(ev.type))
                    || ((ev.type === 'task_completed' || ev.type === 'task_incomplete') && typeof ev.metadata?.output === 'string')
                  )).length === 0) && (
                  <div className="muted" style={{ fontSize: 12 }}>No recorded outputs</div>
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
