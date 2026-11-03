import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedEvent, useFeedStore } from '../stores/feedStore';
import { MissionDetail, useMissionsStore } from '../stores/missionsStore';

interface PendingInputAlert {
  key: string;
  missionId: string;
  taskId?: string;
  title: string;
  question: string;
}

function interactionKey(missionId: string, taskId?: string): string {
  return `${missionId}:${taskId || ''}`;
}

function questionFromEvent(event: FeedEvent): PendingInputAlert | undefined {
  if (!event.missionId || (event.type !== 'question_asked' && event.type !== 'permission_required')) {
    return undefined;
  }
  const taskId = typeof event.metadata?.taskId === 'string' ? event.metadata.taskId : undefined;
  const rawQuestion = typeof event.metadata?.question === 'string'
    ? event.metadata.question
    : event.type === 'permission_required'
      ? 'An Agent is waiting for permission to use a tool.'
      : 'An Agent needs information to continue.';
  return {
    key: interactionKey(event.missionId, taskId),
    missionId: event.missionId,
    taskId,
    title: event.type === 'permission_required' ? 'Tool permission requested' : 'Mission needs your input',
    question: rawQuestion.replace(/^\s*\[secret:[a-z0-9_-]+\]\s*/i, ''),
  };
}

function questionFromDetail(workflowId: string, detail: MissionDetail): PendingInputAlert | undefined {
  const pending = detail.output?.outputs?.pendingInteraction;
  if (!pending) return undefined;
  const taskId = pending.taskId;
  const rawQuestion = pending.question
    || pending.permission?.explanation
    || 'An Agent needs information to continue.';
  return {
    key: interactionKey(detail.missionId || workflowId, taskId),
    missionId: detail.missionId || workflowId,
    taskId,
    title: pending.kind === 'mcp_permission' ? 'Tool permission requested' : 'Mission needs your input',
    question: rawQuestion.replace(/^\s*\[secret:[a-z0-9_-]+\]\s*/i, ''),
  };
}

function getPendingInputAlerts(events: FeedEvent[], details: Record<string, MissionDetail>): PendingInputAlert[] {
  const pending = new Map<string, PendingInputAlert>();
  const resolved = new Set<string>();

  for (const event of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
    if (event.type === 'user_input_resolved' && event.missionId) {
      const taskId = typeof event.metadata?.taskId === 'string' ? event.metadata.taskId : undefined;
      if (taskId) resolved.add(interactionKey(event.missionId, taskId));
      else {
        for (const key of pending.keys()) {
          if (key.startsWith(`${event.missionId}:`)) resolved.add(key);
        }
      }
      if (taskId) pending.delete(interactionKey(event.missionId, taskId));
      continue;
    }

    const alert = questionFromEvent(event);
    if (alert) {
      resolved.delete(alert.key);
      pending.set(alert.key, alert);
    }
  }

  for (const [workflowId, detail] of Object.entries(details)) {
    const alert = questionFromDetail(workflowId, detail);
    if (alert && !resolved.has(alert.key)) pending.set(alert.key, alert);
  }

  return [...pending.values()];
}

export default function MissionInputAlert() {
  const events = useFeedStore((state) => state.events);
  const details = useMissionsStore((state) => state.details);
  const alerts = useMemo(() => getPendingInputAlerts(events, details), [events, details]);
  const [dismissed, setDismissed] = useState(false);

  if (alerts.length === 0 || dismissed) return null;

  return (
    <aside className="mission-input-alert" role="alert" aria-live="assertive">
      <button
        className="close-btn"
        aria-label="Close"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
      <strong>{alerts.length === 1 ? alerts[0]!.title : `${alerts.length} missions need your input`}</strong>
      {alerts.map((alert) => {
        const workflowId = alert.missionId.startsWith('mission-')
          ? alert.missionId
          : `mission-${alert.missionId}`;
        return (
          <div className="mission-input-alert-item" key={alert.key}>
            <span>{alert.question}</span>
            <Link to={`/missions/${encodeURIComponent(workflowId)}`}>
              Open mission conversation
            </Link>
          </div>
        );
      })}
    </aside>
  );
}
