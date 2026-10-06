interface MissionHistoryEntry {
  missionId: string;
  status: string;
  timestamp: string;
  output?: string;
}

interface MissionsPanelProps {
  missionHistory: MissionHistoryEntry[];
}

function getMissionStatusLabel(status: string): string {
  switch (status) {
    case 'running': return 'Running';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'canceled': return 'Canceled';
    case 'awaiting_review': return 'Needs Review';
    case 'incomplete': return 'Incomplete';
    case 'pending': return 'Pending';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export const MissionsPanel = ({ missionHistory }: MissionsPanelProps) => {
  return (
    <div className="card">
      <h3>Mission Execution History</h3>
      {missionHistory.length === 0 ? (
        <p>No missions yet. Run a mission from the Overview tab.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Mission ID</th>
              <th>Status</th>
              <th>Timestamp</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            {missionHistory.map((m) => (
              <tr key={m.missionId}>
                <td>{m.missionId}</td>
                 <td><span className={`badge ${m.status}`}>{getMissionStatusLabel(m.status)}</span></td>
                <td>{new Date(m.timestamp).toLocaleString()}</td>
                <td className="truncate">{m.output || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};