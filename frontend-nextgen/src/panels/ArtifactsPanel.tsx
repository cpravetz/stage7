import { AgentArtifact } from '../types/workspace';
import MissionArtifactContent from '../components/MissionArtifactContent';
import { getArtifactPurpose } from '../types/missionArtifact';

interface ArtifactsPanelProps {
  agentArtifacts: AgentArtifact[];
}

export const ArtifactsPanel = ({ agentArtifacts }: ArtifactsPanelProps) => {
  return (
    <div className="card">
      <h3>Artifacts</h3>
      {agentArtifacts.length === 0 ? (
        <div>
          <p>No artifacts generated yet.</p>
        </div>
      ) : (
        <ul className="artifact-list">
          {agentArtifacts.map((a) => (
            <li key={a.id || a.name} className="artifact-item produced">
              <div className="artifact-header">
                <strong>{a.name || a.id}</strong>
                <span className={`badge ${getArtifactPurpose(a)}`}>
                  {getArtifactPurpose(a) === 'execution-outcome'
                    ? 'Execution outcome'
                    : getArtifactPurpose(a)}
                </span>
                {a.status && <span className={`badge ${a.status}`}>{a.status}</span>}
                {a.version !== undefined && <span className="badge">Version {a.version}</span>}
              </div>
              <MissionArtifactContent artifact={a} />
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 8 }}>
        <p className="muted">Artifact upload for entities is handled via Mission UI and the Artifacts page.</p>
      </div>
    </div>
  );
};