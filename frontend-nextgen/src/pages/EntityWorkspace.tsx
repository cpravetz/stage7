import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEntityStore, Entity } from '../stores/entityStore';
import { useFeedStore } from '../stores/feedStore';
import { fetchJSON, postJSON } from '../utils/api';

interface ToolBinding {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
}

interface HITLApproval {
  id: string;
  missionId: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
}

const EntityWorkspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { entities, selectedEntity, fetchEntity, selectEntity } = useEntityStore();
  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);
  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'memory' | 'missions' | 'hitl' | 'artifacts' | 'conversation'>('overview');
  const [missionInput, setMissionInput] = useState('');
  const [running, setRunning] = useState(false);
  const [missionHistory, setMissionHistory] = useState<Array<{ missionId: string; status: string; timestamp: string; output?: string }>>([]);
  const [toolBindings, setToolBindings] = useState<ToolBinding[]>([]);
  const [availableTools, setAvailableTools] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [hitlApprovals, setHitlApprovals] = useState<HITLApproval[]>([]);
  const [memoryContext, setMemoryContext] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const found = entities.find((e) => e.id === id);
      if (found) {
        selectEntity(found);
      } else {
        fetchEntity(id);
      }
    }
  }, [id, entities, fetchEntity, selectEntity]);

  useEffect(() => {
    if (selectedEntity) {
      setToolBindings(
        (selectedEntity.tools || []).map((t) => ({
          name: typeof t === 'string' ? t : t.name,
          description: typeof t === 'string' ? '' : t.description || '',
          inputSchema: typeof t === 'string' ? {} : t.inputSchema || {},
          enabled: true,
        }))
      );
      setMemoryContext(selectedEntity.memory || { context: {}, notes: 'No memory persisted yet.' });
      setMissionHistory(selectedEntity.missionHistory || []);
    }
  }, [selectedEntity]);

  useEffect(() => {
    fetchJSON<{ tools: Array<{ id: string; name: string; description: string }> }>('/api/tool-executor/tools')
      .then((data) => setAvailableTools(data.tools || []))
      .catch(() => setAvailableTools([]));
  }, []);

  const entity: Entity | null = selectedEntity || entities.find((e) => e.id === id) || null;

  const runMission = async () => {
    if (!entity || !missionInput.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const missionId = `mission-${Date.now()}`;
      const data = await postJSON<{ status: string; output?: string }>('/api/temporal/missions', {
        missionId,
        prompt: missionInput,
        tenantId: entity.tenantId,
        assistantId: entity.id,
        contextChunks: [],
        metadata: { toolBindings: toolBindings.filter((t) => t.enabled).map((t) => t.name) },
      });
      setMissionHistory((prev) => [
        { missionId, status: data.status || 'running', timestamp: new Date().toISOString(), output: data.output },
        ...prev,
      ]);
      setMissionInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mission failed');
    } finally {
      setRunning(false);
    }
  };

  const toggleToolBinding = (toolName: string) => {
    setToolBindings((prev) =>
      prev.map((t) => (t.name === toolName ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleHITLAction = (approvalId: string, action: 'approved' | 'rejected') => {
    setHitlApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: action } : a))
    );
  };

  const filteredEvents = events.filter((e) => e.source === entity?.id || e.source === 'system');

  if (!entity) {
    return (
      <div className="page">
        <h1>Entity Workspace</h1>
        <div className="loading">Loading entity...</div>
      </div>
    );
  }

  return (
    <div className="page entity-workspace">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="close-btn">&times;</button>
        </div>
      )}

      <div className="entity-header">
        <div>
          <h1>{entity.name}</h1>
          <span className={`badge ${entity.status}`}>{entity.status}</span>
          <span className="badge">{entity.type}</span>
          <span className="badge persisted">persisted</span>
        </div>
        <button className="secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>

      <div className="entity-tabs">
        {(['overview', 'tools', 'memory', 'missions', 'hitl', 'artifacts'] as const).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'hitl' ? 'Human-in-Loop' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="entity-content">
        {activeTab === 'overview' && (
          <div className="grid two-col">
            <div className="card">
              <h3>Persona</h3>
              <p>{entity.description}</p>
              <div className="meta-grid">
                <div><strong>Model:</strong> {entity.model}</div>
                <div><strong>Capabilities:</strong> {(entity.capabilities || []).join(', ') || 'None'}</div>
                <div><strong>Tools Bound:</strong> {toolBindings.filter((t) => t.enabled).length}</div>
                <div><strong>Memory Keys:</strong> {Object.keys(memoryContext).length}</div>
              </div>
            </div>
            <div className="card">
              <h3>Quick Actions</h3>
              <div className="form">
                <textarea
                  placeholder="Run a mission with this entity..."
                  value={missionInput}
                  onChange={(e) => setMissionInput(e.target.value)}
                  rows={3}
                />
                <button onClick={runMission} disabled={running || !missionInput.trim()}>
                  {running ? 'Running...' : 'Run Mission'}
                </button>
                <p className="hint">Mission will use {toolBindings.filter((t) => t.enabled).length} bound tools</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="grid two-col">
            <div className="card">
              <h3>Bound Tools</h3>
              {toolBindings.length === 0 ? (
                <p>No tools bound to this assistant.</p>
              ) : (
                <ul className="tool-binding-list">
                  {toolBindings.map((tool) => (
                    <li key={tool.name} className={tool.enabled ? 'enabled' : 'disabled'}>
                      <div className="tool-info">
                        <strong>{tool.name}</strong>
                        <p>{tool.description}</p>
                      </div>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={tool.enabled}
                          onChange={() => toggleToolBinding(tool.name)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card">
              <h3>Available General Tools</h3>
              <p className="hint">Legacy Stage7 tools registered in the platform</p>
              <ul className="available-tools-list">
                {availableTools.map((tool) => (
                  <li key={tool.id}>
                    <strong>{tool.name}</strong>
                    <p>{tool.description}</p>
                    <button
                      className="link-button"
                      onClick={() => {
                        if (!toolBindings.find((t) => t.name === tool.id)) {
                          setToolBindings((prev) => [
                            ...prev,
                            { name: tool.id, description: tool.description, inputSchema: {}, enabled: true },
                          ]);
                        }
                      }}
                    >
                      Bind
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="card">
            <h3>Memory Context</h3>
            <pre className="code-block">
              {JSON.stringify(memoryContext, null, 2)}
            </pre>
            <div className="button-row">
              <button onClick={() => setMemoryContext({ ...memoryContext, lastInteraction: new Date().toISOString() })}>
                Update Timestamp
              </button>
              <button className="secondary" onClick={() => setMemoryContext({})}>
                Clear Memory
              </button>
            </div>
          </div>
        )}

        {activeTab === 'missions' && (
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
                      <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                      <td>{new Date(m.timestamp).toLocaleString()}</td>
                      <td className="truncate">{m.output || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'hitl' && (
          <div className="card">
            <h3>Human-in-the-Loop Controls</h3>
            <p className="hint">Review and approve assistant actions that require human oversight.</p>
            {hitlApprovals.length === 0 ? (
              <div className="empty-state">
                <p>No pending approvals. HITL gates will appear here when the assistant requests human review.</p>
                <button
                  className="secondary"
                  onClick={() =>
                    setHitlApprovals([
                      {
                        id: 'sample-1',
                        missionId: 'mission-sample',
                        action: 'Execute data modification',
                        status: 'pending',
                        requestedAt: new Date().toISOString(),
                      },
                    ])
                  }
                >
                  Simulate Approval Request
                </button>
              </div>
            ) : (
              <ul className="hitl-list">
                {hitlApprovals.map((approval) => (
                  <li key={approval.id} className={`hitl-item ${approval.status}`}>
                    <div className="hitl-info">
                      <strong>{approval.action}</strong>
                      <p>Mission: {approval.missionId}</p>
                      <p className="timestamp">Requested: {new Date(approval.requestedAt).toLocaleString()}</p>
                    </div>
                    {approval.status === 'pending' ? (
                      <div className="hitl-actions">
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
        )}

        {activeTab === 'artifacts' && (
          <div className="card">
            <h3>Artifacts</h3>
            {(entity.artifacts || []).length === 0 ? (
              <p>No artifacts generated yet.</p>
            ) : (
              <ul>
                {entity.artifacts!.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="live-feed-panel">
        <div className="feed-header">
          <h3>Live Feed</h3>
          <span className={`connection-dot ${connected ? 'online' : 'offline'}`}></span>
        </div>
        <div className="feed-stream">
          {filteredEvents.length === 0 && <p className="muted">No live events for this entity.</p>}
          {filteredEvents.map((evt) => (
            <div key={evt.id} className={`feed-item ${evt.type}`}>
              <span className="feed-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
              <span className="feed-source">{evt.source}</span>
              <span className="feed-msg">{evt.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EntityWorkspace;
