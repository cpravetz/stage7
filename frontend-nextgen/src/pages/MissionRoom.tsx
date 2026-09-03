import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFeedStore, FeedEvent } from '../stores/feedStore';
import { fetchJSON, postJSON } from '../utils/api';

interface MissionDetail {
  missionId: string;
  status: string;
  output?: {
    plan?: Plan;
    outputs?: { phases?: PhaseOutput[]; status?: string; phaseId?: string; reason?: string };
  };
  error?: string;
  startedAt?: number | string;
  completedAt?: number | string;
}

interface Plan {
  summary?: string;
  estimatedDuration?: string;
  estimatedCost?: string;
  requiresClarification?: boolean;
  clarificationQuestions?: string[];
  phases: PlanPhase[];
}

interface PlanPhase {
  id: string;
  name: string;
  goal?: string;
  requiresApproval?: boolean;
  tasks: PlanTask[];
}

interface PlanTask {
  id: string;
  title: string;
  description?: string;
  agentRole?: string;
  expectedArtifacts?: string[];
  artifacts?: unknown[];
}

interface PhaseOutput {
  phaseId: string;
  name?: string;
  status?: string;
  tasks?: Array<{
    taskId: string;
    status: string;
    output?: string;
    artifacts?: unknown[];
  }>;
}

type Tab = 'conversation' | 'timeline' | 'plan' | 'artifacts';

const STATUS_BADGE: Record<string, string> = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
  pending: 'pending',
  started: 'running',
};

function iconForType(type: string): string {
  if (type.startsWith('task_')) return type === 'task_failed' ? '❌' : '✅';
  if (type.startsWith('phase_')) return '📦';
  if (type.startsWith('plan_') || type.startsWith('planner_')) return '🧭';
  if (type === 'tool') return '🔧';
  if (type === 'monologue') return '💭';
  if (type === 'user' || type === 'user_message') return '🧑';
  if (type === 'mission_completed') return '🏁';
  if (type === 'mission_failed') return '💥';
  if (type === 'mission_started') return '🚀';
  return '📋';
}

const MissionRoom = () => {
  const { workflowId = '' } = useParams<{ workflowId: string }>();
  const missionId = useMemo(() => workflowId.replace(/^mission-/, ''), [workflowId]);

  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);

  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('conversation');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    (async () => {
      try {
        const data = await fetchJSON<MissionDetail>(
          `/api/temporal/missions/${encodeURIComponent(workflowId)}`,
        );
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'Mission not found');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  const missionEvents = useMemo<FeedEvent[]>(() => {
    const fromOutput: FeedEvent[] = [];
    const startedAt = detail?.startedAt
      ? new Date(detail.startedAt).getTime()
      : Date.now();
    fromOutput.push({
      id: `derived-mission-started-${startedAt}`,
      type: 'mission_started',
      source: 'orchestrator',
      message: 'Mission started',
      timestamp: startedAt,
      missionId,
    });
    const plan = detail?.output?.plan;
    if (plan) {
      fromOutput.push({
        id: `derived-planner-started-${startedAt + 1}`,
        type: 'planner_started',
        source: 'orchestrator',
        message: `Planning: ${plan.summary || 'mission plan'}`,
        timestamp: startedAt + 1,
        missionId,
        metadata: { phases: plan.phases.length },
      });
      fromOutput.push({
        id: `derived-plan-generated-${startedAt + 2}`,
        type: 'plan_generated',
        source: 'orchestrator',
        message: `Plan generated (${plan.phases.length} phases)`,
        timestamp: startedAt + 2,
        missionId,
      });
    }
    let cursor = startedAt + 3;
    let phases: PhaseOutput[] = detail?.output?.outputs?.phases || [];
    if (phases.length === 0 && plan?.phases) {
      phases = plan.phases.map((p) => ({
        phaseId: p.id,
        name: p.name,
        status: detail?.status === 'completed' ? 'completed' : detail?.status === 'failed' ? 'failed' : 'planned',
        tasks: p.tasks.map((t) => ({ taskId: t.id, status: 'planned' })),
      }));
    }
    for (const phase of phases) {
      fromOutput.push({
        id: `derived-phase-started-${phase.phaseId}`,
        type: 'phase_started',
        source: 'orchestrator',
        message: `Phase started: ${phase.name || phase.phaseId}`,
        timestamp: cursor,
        missionId,
        metadata: { phaseId: phase.phaseId, phaseName: phase.name },
      });
      cursor += 1;
      for (const task of phase.tasks || []) {
        fromOutput.push({
          id: `derived-task-${phase.phaseId}-${task.taskId}`,
          type: task.status === 'failed' ? 'task_failed' : 'task_completed',
          source: 'orchestrator',
          message: `${task.status === 'failed' ? 'Task failed' : 'Task completed'}: ${task.taskId}`,
          timestamp: cursor,
          missionId,
          metadata: { phaseId: phase.phaseId, taskId: task.taskId, output: task.output },
        });
        cursor += 1;
      }
      fromOutput.push({
        id: `derived-phase-completed-${phase.phaseId}`,
        type: 'phase_completed',
        source: 'orchestrator',
        message: `Phase completed: ${phase.name || phase.phaseId}`,
        timestamp: cursor,
        missionId,
        metadata: { phaseId: phase.phaseId, phaseName: phase.name },
      });
      cursor += 1;
    }
    if (detail?.status === 'completed') {
      fromOutput.push({
        id: `derived-mission-completed-${cursor}`,
        type: 'mission_completed',
        source: 'orchestrator',
        message: 'Mission completed',
        timestamp: cursor,
        missionId,
      });
    } else if (detail?.status === 'failed' || detail?.status === 'canceled') {
      fromOutput.push({
        id: `derived-mission-failed-${cursor}`,
        type: 'mission_failed',
        source: 'orchestrator',
        message: `Mission ${detail.status}: ${detail.error || ''}`.trim(),
        timestamp: cursor,
        missionId,
        metadata: { error: detail.error },
      });
    }
    const live = events.filter((e) => e.missionId === missionId);
    const map = new Map<string, FeedEvent>();
    for (const e of fromOutput) map.set(e.id, e);
    for (const e of live) {
      const key = `${e.type}-${e.timestamp}-${e.id}`;
      if (!map.has(key)) map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [events, detail, missionId]);

  const transcript = useMemo(() => buildTranscript(missionEvents), [missionEvents]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [transcript.length]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await postJSON<{ status: string }>(
        `/api/temporal/missions/${encodeURIComponent(workflowId)}/messages`,
        { missionId, content: text, role: 'user' },
      );
      setInput('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const status = detail?.status || 'unknown';
  const badge = STATUS_BADGE[status] || status;
  const plan = detail?.output?.plan;
  const phaseOutputs = detail?.output?.outputs?.phases || [];
  const taskArtifactCount = phaseOutputs.reduce(
    (sum, p) => sum + (p.tasks || []).reduce((s, t) => s + (t.artifacts?.length || 0), 0),
    0,
  );
  const expectedArtifactCount = plan?.phases.reduce(
    (sum, ph) => sum + ph.tasks.reduce((s, t) => s + (t.expectedArtifacts?.length || 0) + (t.artifacts?.length || 0), 0),
    0,
  ) || 0;
  const wallClockMs =
    detail?.startedAt && detail?.completedAt
      ? new Date(detail.completedAt).getTime() - new Date(detail.startedAt).getTime()
      : null;
  const wallClockLabel = wallClockMs != null ? formatDuration(wallClockMs) : null;

  return (
    <div className="page mission-room">
      <div className="mission-room-header">
        <div>
          <Link to="/missions" className="link-button" style={{ marginBottom: 4 }}>← All Missions</Link>
          <h1 style={{ margin: 0 }}>Mission Room</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            <code>{workflowId}</code>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`badge ${badge}`}>{status}</span>
          <span className={`connection-status ${connected ? 'online' : 'offline'}`}>
            {connected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {detailError && <div className="error-banner">{detailError}</div>}

      <div className="mission-summary">
        {wallClockLabel && (
          <span><strong>Duration:</strong> {wallClockLabel}</span>
        )}
        {plan && <span><strong>Phases:</strong> {plan.phases.length}</span>}
        {(taskArtifactCount + expectedArtifactCount) > 0 && (
          <span><strong>Artifacts:</strong> {taskArtifactCount + expectedArtifactCount}</span>
        )}
        <span><strong>Events:</strong> {missionEvents.length}</span>
      </div>

      <div className="entity-tabs">
        {(['conversation', 'timeline', 'plan', 'artifacts'] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'artifacts' && (taskArtifactCount + expectedArtifactCount) > 0 ? ` (${taskArtifactCount + expectedArtifactCount})` : ''}
            {t === 'plan' && plan?.phases.length ? ` (${plan.phases.length})` : ''}
            {t === 'timeline' && missionEvents.length ? ` (${missionEvents.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'conversation' && (
        <div className="card mission-conversation">
          <div className="transcript" ref={transcriptRef}>
            {transcript.length === 0 ? (
              <div className="empty-state">
                <p>No conversation yet.</p>
                <p className="muted">Mission events and your messages will appear here.</p>
              </div>
            ) : (
              transcript.map((turn) => (
                <div key={turn.id} className={`turn turn-${turn.role}`}>
                  <div className="turn-meta">
                    <strong>{turn.label}</strong>
                    <span className="muted">{new Date(turn.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="turn-body">
                    {turn.lines.map((line, idx) => (
                      <div key={idx} className={`turn-line ${line.kind}`}>
                        <span className="turn-icon">{iconForType(line.type)}</span>
                        <span>{line.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="composer">
            {sendError && <div className="error-banner">{sendError}</div>}
            <textarea
              placeholder="Talk to your agents..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={3}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Cmd/Ctrl+Enter to send</span>
              <button onClick={sendMessage} disabled={sending || !input.trim()}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card">
          <h3>Live Event Timeline</h3>
          {missionEvents.length === 0 ? (
            <div className="empty-state">No events for this mission yet.</div>
          ) : (
            <ul className="timeline">
              {missionEvents.map((evt) => (
                <li key={evt.id} className={`timeline-item ${evt.type}`}>
                  <span className="timeline-icon">{iconForType(String(evt.type))}</span>
                  <div className="timeline-body">
                    <div className="timeline-meta">
                      <strong>{String(evt.type)}</strong>
                      <span className="muted">
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}
                      </span>
                    </div>
                    <div>{evt.message}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'plan' && (
        <div className="card">
          <h3>Plan</h3>
          {!plan ? (
            <div className="empty-state">No plan recorded for this mission.</div>
          ) : (
            <div className="plan-view">
              {plan.summary && (
                <p className="plan-summary">{plan.summary}</p>
              )}
              <div className="plan-meta">
                {plan.estimatedDuration && <span><strong>Duration:</strong> {plan.estimatedDuration}</span>}
                {plan.estimatedCost && <span><strong>Cost:</strong> {plan.estimatedCost}</span>}
                <span><strong>Phases:</strong> {plan.phases.length}</span>
              </div>
              <ol className="plan-phases">
                {plan.phases.map((phase) => {
                  const output = phaseOutputs.find((p) => p.phaseId === phase.id);
                  return (
                    <li key={phase.id} className={`plan-phase ${output?.status || ''}`}>
                      <div className="plan-phase-header">
                        <strong>{phase.name}</strong>
                        {phase.requiresApproval && <span className="badge">requires approval</span>}
                        {output?.status && <span className={`badge ${output.status}`}>{output.status}</span>}
                      </div>
                      {phase.goal && <p className="muted">{phase.goal}</p>}
                      <ul className="plan-tasks">
                        {phase.tasks.map((task) => {
                          const taskOutput = output?.tasks?.find((t) => t.taskId === task.id);
                          return (
                            <li key={task.id} className={`plan-task ${taskOutput?.status || ''}`}>
                              <div>
                                <strong>{task.title}</strong>
                                {task.description && <p className="muted">{task.description}</p>}
                              </div>
                              <div className="plan-task-meta">
                                {task.agentRole && <span className="badge">🤖 {task.agentRole}</span>}
                                {taskOutput?.status && <span className={`badge ${taskOutput.status}`}>{taskOutput.status}</span>}
                                {taskOutput?.artifacts && taskOutput.artifacts.length > 0 && (
                                  <span className="badge">📎 {taskOutput.artifacts.length}</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}

      {tab === 'artifacts' && (
        <div className="card">
          <h3>Artifacts</h3>
          <ArtifactsView
            plan={plan ?? null}
            phaseOutputs={phaseOutputs}
          />
        </div>
      )}
    </div>
  );
};

interface TranscriptLine {
  kind: 'text' | 'tool' | 'plan' | 'task';
  type: string;
  text: string;
}

interface TranscriptTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  label: string;
  timestamp: number;
  lines: TranscriptLine[];
}

function buildTranscript(events: FeedEvent[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let current: TranscriptTurn | null = null;

  const startTurn = (role: TranscriptTurn['role'], label: string, ts: number, idHint: string): TranscriptTurn => {
    const t: TranscriptTurn = {
      id: `${idHint}-${ts}`,
      role,
      label,
      timestamp: ts,
      lines: [],
    };
    turns.push(t);
    return t;
  };

  for (const evt of events) {
    const type = String(evt.type);
    const ts = evt.timestamp || Date.now();
    if (type === 'user' || type === 'user_message') {
      current = startTurn('user', 'You', ts, evt.id);
      current.lines.push({ kind: 'text', type, text: evt.message });
      continue;
    }
    if (type === 'planner_started' || type === 'plan_generated' || type === 'phase_started' || type === 'phase_completed' || type === 'phase_approved' || type === 'phase_rejected') {
      if (!current || current.role !== 'assistant' || (current.label !== 'Planner' && current.label !== 'Orchestrator')) {
        current = startTurn('assistant', type === 'planner_started' || type === 'plan_generated' ? 'Planner' : 'Orchestrator', ts, evt.id);
      }
      current.lines.push({ kind: 'plan', type, text: evt.message });
      continue;
    }
    if (type.startsWith('task_')) {
      if (!current || current.role !== 'assistant' || current.label !== 'Agent') {
        current = startTurn('assistant', 'Agent', ts, evt.id);
      }
      current.lines.push({ kind: 'task', type, text: evt.message });
      continue;
    }
    if (type === 'tool' || type === 'monologue') {
      if (!current || current.role !== 'assistant') {
        current = startTurn('assistant', 'Agent', ts, evt.id);
      }
      current.lines.push({ kind: type === 'tool' ? 'tool' : 'text', type, text: evt.message });
      continue;
    }
    if (type === 'mission_started' || type === 'mission_completed' || type === 'mission_failed') {
      current = startTurn('system', 'Mission', ts, evt.id);
      current.lines.push({ kind: 'text', type, text: evt.message });
      continue;
    }
    if (!current) current = startTurn('system', 'Mission', ts, evt.id);
    current.lines.push({ kind: 'text', type, text: evt.message });
  }

  return turns;
}

interface ArtifactsViewProps {
  plan: Plan | null;
  phaseOutputs: PhaseOutput[];
}

const ArtifactsView = ({ plan, phaseOutputs }: ArtifactsViewProps) => {
  const items: Array<{ id: string; name: string; phaseId?: string; taskId?: string; kind: 'expected' | 'produced'; text?: string }> = [];

  if (plan) {
    for (const phase of plan.phases) {
      for (const task of phase.tasks) {
        for (const expected of task.expectedArtifacts || []) {
          items.push({
            id: `expected-${phase.id}-${task.id}-${expected}`,
            name: expected,
            phaseId: phase.id,
            taskId: task.id,
            kind: 'expected',
          });
        }
        for (const a of task.artifacts || []) {
          if (typeof a === 'string') {
            items.push({ id: `plan-artifact-${phase.id}-${task.id}-${a}`, name: a, phaseId: phase.id, taskId: task.id, kind: 'produced' });
          } else if (a && typeof a === 'object') {
            const obj = a as Record<string, unknown>;
            items.push({
              id: `plan-artifact-${phase.id}-${task.id}-${String(obj.id || obj.name || JSON.stringify(a))}`,
              name: String(obj.name || obj.id || 'artifact'),
              phaseId: phase.id,
              taskId: task.id,
              kind: 'produced',
              text: typeof obj.content === 'string' ? obj.content : undefined,
            });
          }
        }
      }
    }
  }

  for (const phase of phaseOutputs) {
    for (const task of phase.tasks || []) {
      for (const a of task.artifacts || []) {
        if (typeof a === 'string') {
          items.push({ id: `produced-${phase.phaseId}-${task.taskId}-${a}`, name: a, phaseId: phase.phaseId, taskId: task.taskId, kind: 'produced' });
        } else if (a && typeof a === 'object') {
          const obj = a as Record<string, unknown>;
          items.push({
            id: `produced-${phase.phaseId}-${task.taskId}-${String(obj.id || obj.name || JSON.stringify(a))}`,
            name: String(obj.name || obj.id || 'artifact'),
            phaseId: phase.phaseId,
            taskId: task.taskId,
            kind: 'produced',
            text: typeof obj.content === 'string' ? obj.content : undefined,
          });
        }
      }
    }
  }

  if (items.length === 0) {
    return <div className="empty-state">No artifacts produced or expected for this mission.</div>;
  }

  return (
    <ul className="artifact-list">
      {items.map((a) => (
        <li key={a.id} className={`artifact-item ${a.kind}`}>
          <div className="artifact-header">
            <strong>{a.name}</strong>
            <span className={`badge ${a.kind}`}>{a.kind === 'expected' ? 'Expected' : 'Produced'}</span>
            {a.phaseId && <span className="muted">phase: {a.phaseId}</span>}
            {a.taskId && <span className="muted">task: {a.taskId}</span>}
          </div>
          {a.text && <pre className="code-block">{a.text}</pre>}
        </li>
      ))}
    </ul>
  );
};

export default MissionRoom;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}