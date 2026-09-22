import React from 'react';
import { fetchJSON } from '../utils/api';
import { StateTransitionEvent } from '../types/workflow';
import { WorkflowState } from '../types/workflow';

interface StateStatusProps {
  workspaceId: string;
  onTransition?: (state: WorkflowState) => void;
}

const STATE_COLORS: Record<string, string> = {
  analysis: '#6b7280',
  recommendation: '#3b82f6',
  draft: '#f59e0b',
  approved: '#8b5cf6',
  executed: '#10b981',
  rejected: '#ef4444',
};

const STATE_LABELS: Record<string, string> = {
  analysis: 'Analysis',
  recommendation: 'Recommendation',
  draft: 'Draft',
  approved: 'Approved',
  executed: 'Executed',
  rejected: 'Rejected',
};

export const StateStatus: React.FC<StateStatusProps> = ({ workspaceId, onTransition }) => {
  const [state, setState] = React.useState<WorkflowState>('analysis');
  const [allowed, setAllowed] = React.useState<string[]>([]);
  const [history, setHistory] = React.useState<StateTransitionEvent[]>([]);

  const load = React.useCallback(() => {
    fetchJSON<{ workflowState: WorkflowState; currentStage: string }>(`/api/tool-executor/workspaces/${workspaceId}`)
      .then((data) => setState(data.workflowState))
      .catch(() => {});
    fetchJSON<{ allowedTransitions: string[] }>(`/api/tool-executor/workspaces/${workspaceId}/allowed-transitions`)
      .then((data) => setAllowed(data.allowedTransitions))
      .catch(() => {});
    fetchJSON<{ stateHistory: StateTransitionEvent[] }>(`/api/tool-executor/workspaces/${workspaceId}/state-history`)
      .then((data) => setHistory(data.stateHistory))
      .catch(() => {});
  }, [workspaceId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="state-status" style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
      <h3 style={{ margin: '0 0 12px 0' }}>Workflow State</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{
          display: 'inline-block',
          width: 12, height: 12, borderRadius: '50%',
          backgroundColor: STATE_COLORS[state] || '#6b7280',
        }} />
        <strong>{STATE_LABELS[state] || state}</strong>
      </div>
      {allowed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Allowed transitions:</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {allowed.map((s) => (
              <button
                key={s}
                type="button"
                style={{
                  background: '#f3f4f6', borderRadius: 4, padding: '2px 8px', fontSize: 12,
                  cursor: 'pointer', border: '1px solid #d1d5db',
                }}
                onClick={() => onTransition?.(s as WorkflowState)}
              >
                {STATE_LABELS[s] || s}
              </button>
            ))}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Transition history:</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {history.map((event, i) => (
              <li key={i}>
                {STATE_LABELS[event.from]} → {STATE_LABELS[event.to]}
                {' '}
                <span style={{ color: '#9ca3af' }}>
                  {new Date(event.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default StateStatus;