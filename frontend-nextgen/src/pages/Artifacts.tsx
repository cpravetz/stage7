import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postJSON, deleteResource, fetchJSON } from '../utils/api';

interface DocumentRow {
  id: string;
  collection: string;
  data: Record<string, unknown>;
}

interface MissionRow {
  workflowId: string;
  status: string;
  missionId: string;
  prompt?: string;
  startedAt?: string;
  completedAt?: string;
}

interface MissionArtifact {
  id: string;
  name: string;
  phaseId?: string;
  taskId?: string;
  type?: string;
  content?: string;
  data?: Record<string, unknown>;
}

const Persistence = () => {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [collection, setCollection] = useState('default');
  const [data, setData] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'documents' | 'mission-artifacts'>('mission-artifacts');
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [missionArtifacts, setMissionArtifacts] = useState<Record<string, MissionArtifact[]>>({});
  const [artifactSearch, setArtifactSearch] = useState('');

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await postJSON<{ documents: DocumentRow[] }>(
        '/api/artifacts/documents/search',
        { collection }
      );
      setDocuments(res.documents || []);
    } finally {
      setLoading(false);
    }
  };

  const loadMissionsWithArtifacts = async () => {
    setMissionsLoading(true);
    try {
      const data = await fetchJSON<{ missions: MissionRow[] }>('/api/temporal/missions');
      const list = (data.missions || []).slice().sort((a, b) => {
        const aT = a.completedAt || a.startedAt || '';
        const bT = b.completedAt || b.startedAt || '';
        return bT.localeCompare(aT);
      });
      setMissions(list);
      const results = await Promise.all(
        list.map(async (m) => {
          try {
            const res = await fetchJSON<{ artifacts: MissionArtifact[] }>(
              `/api/artifacts/missions/${encodeURIComponent(m.missionId)}/artifacts`,
            );
            return [m.workflowId, (res.artifacts || []) as MissionArtifact[]] as const;
          } catch {
            return [m.workflowId, [] as MissionArtifact[]] as const;
          }
        })
      );
      const map: Record<string, MissionArtifact[]> = {};
      for (const [k, v] of results) map[k] = v;
      setMissionArtifacts(map);
    } finally {
      setMissionsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'documents') loadDocuments();
    if (tab === 'mission-artifacts') loadMissionsWithArtifacts();
  }, [tab, collection]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsed = JSON.parse(data);
      await postJSON('/api/artifacts/documents', {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        tenantId: 'tenant-1',
        collection,
        data: parsed,
      });
      setData('{}');
      loadDocuments();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete document ${id}?`)) return;
    await deleteResource(`/api/artifacts/documents/${id}`);
    setDocuments(documents.filter((d) => d.id !== id));
  };

  const totalArtifacts = useMemo(
    () => Object.values(missionArtifacts).reduce((sum, arr) => sum + arr.length, 0),
    [missionArtifacts]
  );

  const q = artifactSearch.trim().toLowerCase();
  const filteredMissions = useMemo(() => {
    if (!q) return missions;
    return missions.filter((m) => {
      if (
        m.missionId.toLowerCase().includes(q) ||
        m.workflowId.toLowerCase().includes(q) ||
        (m.prompt || '').toLowerCase().includes(q)
      ) {
        return true;
      }
      const arr = missionArtifacts[m.workflowId] || [];
      return arr.some(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.phaseId || '').toLowerCase().includes(q) ||
          (a.taskId || '').toLowerCase().includes(q)
      );
    });
  }, [missions, missionArtifacts, q]);

  return (
    <div className="page">
      <div className="mission-start-collapsed">
        <h1 style={{ margin: 0 }}>Artifacts</h1>
        <div className="entity-tabs">
          <button
            className={tab === 'mission-artifacts' ? 'tab active' : 'tab'}
            onClick={() => setTab('mission-artifacts')}
          >
            Mission Artifacts ({totalArtifacts})
          </button>
          <button
            className={tab === 'documents' ? 'tab active' : 'tab'}
            onClick={() => setTab('documents')}
          >
            Documents
          </button>
        </div>
      </div>

      {tab === 'mission-artifacts' && (
        <>
          <div className="mission-summary" style={{ marginTop: 16 }}>
            <span><strong>{missions.length}</strong> missions</span>
            <span><strong>{totalArtifacts}</strong> artifacts</span>
            <span className="muted">Pulled from completed mission outputs</span>
          </div>

          <div className="mission-start-collapsed" style={{ marginBottom: 12 }}>
            <input
              type="search"
              placeholder="Search missions, phases, tasks, or artifact names..."
              value={artifactSearch}
              onChange={(e) => setArtifactSearch(e.target.value)}
              style={{ flex: 1, minWidth: 280 }}
            />
            <button className="secondary" onClick={loadMissionsWithArtifacts} disabled={missionsLoading}>
              {missionsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {missionsLoading && missions.length === 0 ? (
            <div className="loading">Loading missions and artifacts...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredMissions.map((m) => {
                const artifacts = missionArtifacts[m.workflowId] || [];
                return (
                  <div key={m.workflowId} className="card">
                    <div className="mission-start-collapsed">
                      <div>
                        <Link to={`/missions/${encodeURIComponent(m.workflowId)}`}>
                          <strong>{m.missionId}</strong>
                        </Link>
                        <span className={`badge ${m.status}`} style={{ marginLeft: 8 }}>
                          {m.status}
                        </span>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {m.prompt ? m.prompt.slice(0, 120) + (m.prompt.length > 120 ? '…' : '') : '—'}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        <strong style={{ color: '#f1f5f9' }}>{artifacts.length}</strong> artifact
                        {artifacts.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    {artifacts.length === 0 ? (
                      <div className="empty-state" style={{ padding: 16 }}>
                        No artifacts produced for this mission.
                      </div>
                    ) : (
                      <ul className="artifact-list" style={{ marginTop: 12 }}>
                        {artifacts.map((a) => (
                          <li key={a.id} className="artifact-item produced">
                            <div className="artifact-header">
                              <strong>{a.name}</strong>
                              {a.type && <span className="badge">{a.type}</span>}
                              {a.phaseId && <span className="muted">phase: {a.phaseId}</span>}
                              {a.taskId && <span className="muted">task: {a.taskId}</span>}
                            </div>
                            {a.content && (
                              <pre className="code-block">
                                {a.content.length > 600
                                  ? a.content.slice(0, 600) + '…'
                                  : a.content}
                              </pre>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {filteredMissions.length === 0 && (
                <div className="empty-state">
                  No missions with artifacts match the current search.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div className="card">
            <h3>Save Document</h3>
            <form onSubmit={handleSave} className="form">
              <input
                type="text"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="Collection"
                required
              />
              <textarea
                placeholder='{"key": "value"}'
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                rows={4}
              />
              <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </form>
          </div>
          <div className="card">
            <h3>Documents ({documents.length})</h3>
            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="mission-table-wrapper">
                <div className="mission-table-scroll" style={{ maxHeight: 400 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Collection</th>
                        <th>Data</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((d) => (
                        <tr key={d.id}>
                          <td className="truncate">{d.id}</td>
                          <td>{d.collection}</td>
                          <td>
                            <pre className="inline-code">
                              {JSON.stringify(d.data).slice(0, 60)}
                            </pre>
                          </td>
                          <td>
                            <button className="danger small" onClick={() => handleDelete(d.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {documents.length === 0 && (
                        <tr>
                          <td colSpan={4}>
                            <div className="empty-state">No documents in this collection.</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Persistence;