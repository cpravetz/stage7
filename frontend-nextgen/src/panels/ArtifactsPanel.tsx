import { AgentArtifact } from '../types/workspace';

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
                {a.type && <span className="badge">{a.type}</span>}
              </div>
              {(a.content || a.url) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => {
                    if (a.url) {
                      window.open(a.url, '_blank');
                    } else {
                      const blob = new Blob([a.content || ''], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                    }
                  }}>Open</button>
                  <button onClick={() => {
                    if (a.url) {
                      const aEl = document.createElement('a');
                      aEl.href = a.url;
                      aEl.target = '_blank';
                      document.body.appendChild(aEl);
                      aEl.click();
                      aEl.remove();
                    } else {
                      const blob = new Blob([a.content || ''], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const aEl = document.createElement('a');
                      aEl.href = url;
                      aEl.download = (a.name || a.id || 'artifact') + '.txt';
                      document.body.appendChild(aEl);
                      aEl.click();
                      aEl.remove();
                      URL.revokeObjectURL(url);
                    }
                  }}>Download</button>
                </div>
              )}
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