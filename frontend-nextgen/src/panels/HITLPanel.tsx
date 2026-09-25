import { Link } from 'react-router-dom';
import { HITLApproval } from '../types/workspace';

interface HITLPanelProps {
  hitlApprovals: HITLApproval[];
  loadingApprovals: boolean;
  entity: { id: string } | null;
  handleHITLAction: (approvalId: string, action: 'approved' | 'rejected') => void;
}

export const HITLPanel = ({
  hitlApprovals,
  loadingApprovals,
  entity,
  handleHITLAction,
}: HITLPanelProps) => {
  return (
    <div className="card">
      <h3>Human-in-the-Loop Controls</h3>
      <p className="hint">
        Showing approvals aligned with this assistant (<code>{entity?.id}</code>).
        Mission approval requests are handled on the corresponding Mission Room.
      </p>
      {loadingApprovals ? (
        <p>Loading approvals…</p>
      ) : hitlApprovals.length === 0 ? (
        <p>No pending approvals. HITL gates will appear here when the assistant requests human review.</p>
      ) : (
        <ul className="hitl-list">
          {hitlApprovals.map((approval) => (
            <li key={approval.id} className={`hitl-item ${approval.status}`}>
              <div className="hitl-info">
                <strong>{approval.action}</strong>
                <p>
                  Mission:{' '}
                  <Link to={`/missions/${encodeURIComponent(approval.workflowId || `mission-${approval.missionId}`)}`}>
                    {approval.missionId}
                  </Link>
                  {' · Phase: '} {approval.phaseId}
                </p>
                <p className="timestamp">Requested: {new Date(approval.requestedAt).toLocaleString()}</p>
              </div>
              {approval.status === 'pending' ? (
                <div className="hitl-actions">
                  <Link
                    to={`/missions/${encodeURIComponent(approval.workflowId || `mission-${approval.missionId}`)}`}
                    className="link-button"
                  >
                    Open Mission Room
                  </Link>
                  <button onClick={() => handleHITLAction(approval.id, 'approved')}>Approve</button>
                  <button className="danger" onClick={() => handleHITLAction(approval.id, 'rejected')}>Reject</button>
                </div>
              ) : (
                <span className={`badge ${approval.status}`}>{approval.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};