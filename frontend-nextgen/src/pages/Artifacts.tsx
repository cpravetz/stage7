import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { postJSON, postFormData, deleteResource, fetchJSON } from '../utils/api';
import MissionArtifactContent from '../components/MissionArtifactContent';
import {
  groupMissionArtifactVersions,
  getArtifactMediaCategory,
  getArtifactLabel,
  getArtifactLineageId,
  getArtifactMimeType,
  getArtifactPurpose,
  MissionArtifact,
  MissionArtifactVersionGroup,
} from '../types/missionArtifact';

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

type ArtifactTypeFilter = 'all' | 'document' | 'image' | 'audio' | 'video' | 'pdf' | 'other';
type ArtifactPurposeFilter = 'all' | 'deliverable' | 'workproduct' | 'execution-outcome';

function groupMatchesSearch(group: MissionArtifactVersionGroup, query: string): boolean {
  if (!query) return true;
  return group.artifacts.some((artifact) =>
    [
      artifact.name,
      artifact.id,
      artifact.taskId,
      artifact.phaseId,
      artifact.status,
      getArtifactMimeType(artifact),
    ].some((value) => value?.toLowerCase().includes(query)),
  );
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

function truncateJSON(obj: Record<string, unknown>, max = 60): string {
  let str = JSON.stringify(obj);
  if (str.length > max) {
    str = str.slice(0, max) + '…';
  }
  return str;
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
  const [artifactLoadErrors, setArtifactLoadErrors] = useState<Record<string, string>>({});
  const [missionsLoadError, setMissionsLoadError] = useState<string | null>(null);
  const [uploadPurposes, setUploadPurposes] = useState<Record<string, 'workproduct' | 'deliverable'>>({});
  const [artifactSearch, setArtifactSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState<ArtifactPurposeFilter>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<ArtifactTypeFilter>('all');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});

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
    setMissionsLoadError(null);
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
            return [m.workflowId, (res.artifacts || []).filter((artifact) =>
              String(artifact?.name || artifact?.id || '').toLowerCase() !== 'system-action-receipts.json',
            ), null] as const;
          } catch (error) {
            return [
              m.workflowId,
              [] as MissionArtifact[],
              error instanceof Error ? error.message : 'Failed to load mission artifacts',
            ] as const;
          }
        })
      );
      const map: Record<string, MissionArtifact[]> = {};
      const errors: Record<string, string> = {};
      for (const [key, artifacts, error] of results) {
        map[key] = artifacts;
        if (error) errors[key] = error;
      }
      setMissionArtifacts(map);
      setArtifactLoadErrors(errors);
    } catch (error) {
      setMissionsLoadError(error instanceof Error ? error.message : 'Failed to load missions');
      setMissions([]);
      setMissionArtifacts({});
      setArtifactLoadErrors({});
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

  const uploadArtifactVersion = async (missionId: string, artifact: MissionArtifact) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const body = new FormData();
        body.append('file', file);
        body.append('purpose', getArtifactPurpose(artifact));
        body.append('isDeliverable', String(getArtifactPurpose(artifact) === 'deliverable'));
        body.append('status', 'draft');
        const artifactId = getArtifactLineageId(artifact) || artifact.id;
        if (artifactId) body.append('artifactId', artifactId);
        if (artifact.id) body.append('versionOf', artifact.id);
        if (artifact.version !== undefined && Number.isFinite(Number(artifact.version))) {
          body.append('version', String(Number(artifact.version) + 1));
        }
        if (artifact.phaseId) body.append('phaseId', artifact.phaseId);
        if (artifact.taskId) body.append('taskId', artifact.taskId);
        await postFormData(`/api/artifacts/missions/${encodeURIComponent(missionId)}/artifacts`, body);
        await loadMissionsWithArtifacts();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Upload failed');
      }
    };
    fileInput.click();
  };

  const allArtifactGroups = useMemo(
    () => Object.values(missionArtifacts).flatMap((artifacts) => groupMissionArtifactVersions(artifacts)),
    [missionArtifacts],
  );
  const totalArtifacts = allArtifactGroups.length;
  const deliverableCount = allArtifactGroups.filter((group) => getArtifactPurpose(group.latest) === 'deliverable').length;
  const workproductCount = allArtifactGroups.filter((group) => getArtifactPurpose(group.latest) === 'workproduct').length;
  const executionOutcomeCount = allArtifactGroups.filter((group) => getArtifactPurpose(group.latest) === 'execution-outcome').length;

  const q = artifactSearch.trim().toLowerCase();
  const hasArtifactFilters = purposeFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all';
  const filteredArtifactsByMission = useMemo(() => {
    const result: Record<string, MissionArtifactVersionGroup[]> = {};
    for (const mission of missions) {
      result[mission.workflowId] = groupMissionArtifactVersions(missionArtifacts[mission.workflowId] || [])
        .filter((group) => {
          const visibleVersions = showVersionHistory ? group.artifacts : [group.latest];
          return visibleVersions.some((artifact) =>
            (purposeFilter === 'all' || getArtifactPurpose(artifact) === purposeFilter)
            && (statusFilter === 'all' || artifact.status === statusFilter)
            && (typeFilter === 'all' || getArtifactMediaCategory(artifact) === typeFilter),
          ) && groupMatchesSearch(group, q);
        });
    }
    return result;
  }, [missions, missionArtifacts, purposeFilter, q, showVersionHistory, statusFilter, typeFilter]);
  const filteredMissions = useMemo(() => missions.filter((mission) => {
    const missionMatches = mission.missionId.toLowerCase().includes(q)
      || mission.workflowId.toLowerCase().includes(q)
      || (mission.prompt || '').toLowerCase().includes(q);
    const hasVisibleArtifacts = (filteredArtifactsByMission[mission.workflowId] || []).length > 0;
    const hasArtifacts = (missionArtifacts[mission.workflowId] || []).length > 0;
    return (!q || missionMatches || hasVisibleArtifacts)
      && (hasVisibleArtifacts || (!hasArtifactFilters && !hasArtifacts) || Boolean(artifactLoadErrors[mission.workflowId]));
  }), [artifactLoadErrors, filteredArtifactsByMission, hasArtifactFilters, missionArtifacts, missions, q]);

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
          {missionsLoadError && <div className="error-banner">Could not load missions: {missionsLoadError}</div>}
          <div className="mission-summary" style={{ marginTop: 16 }}>
            <span><strong>{missions.length}</strong> missions</span>
            <span><strong>{totalArtifacts}</strong> logical artifacts</span>
            <span>{deliverableCount} deliverables</span>
            <span>{workproductCount} workproducts</span>
            <span>{executionOutcomeCount} execution outcomes</span>
            <span className="muted">Revisions of the same planned deliverable are grouped automatically.</span>
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
          <div className="mission-start-collapsed" style={{ marginBottom: 16 }}>
            <label>
              Purpose
              <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value as ArtifactPurposeFilter)}>
                <option value="all">All</option>
                <option value="deliverable">Deliverables</option>
                <option value="workproduct">Workproducts</option>
                <option value="execution-outcome">Execution outcomes</option>
              </select>
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="in_review">Ready for review</option>
                <option value="approved">Approved</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label>
              File type
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ArtifactTypeFilter)}>
                <option value="all">All file types</option>
                <option value="document">Documents & structured data</option>
                <option value="pdf">PDF</option>
                <option value="image">Images</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="other">Other files</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={showVersionHistory}
                onChange={(event) => setShowVersionHistory(event.target.checked)}
              />
              Include version history
            </label>
          </div>

          {missionsLoading && missions.length === 0 ? (
            <div className="loading">Loading missions and artifacts...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredMissions.map((m) => {
                const artifacts = missionArtifacts[m.workflowId] || [];
                const artifactGroups = filteredArtifactsByMission[m.workflowId] || [];
                return (
                  <div key={m.workflowId} className="card">
                    <div className="mission-start-collapsed">
                      <div>
                        <Link to={`/missions/${encodeURIComponent(m.workflowId)}`}>
                          <strong>{m.missionId}</strong>
                        </Link>
                        <span className={`badge ${m.status}`} style={{ marginLeft: 8 }}>
                          {getMissionStatusLabel(m.status)}
                        </span>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {m.prompt ? m.prompt.slice(0, 120) + (m.prompt.length > 120 ? '…' : '') : '—'}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        <strong style={{ color: '#f1f5f9' }}>{groupMissionArtifactVersions(artifacts).length}</strong> logical artifacts
                      </div>
                    </div>
                    {artifacts.length === 0 ? (
                      <div className="empty-state" style={{ padding: 16 }}>
                        {artifactLoadErrors[m.workflowId]
                          ? `Could not load artifacts: ${artifactLoadErrors[m.workflowId]}`
                          : artifacts.length && hasArtifactFilters
                            ? 'No artifacts match these filters.'
                            : 'No artifacts produced for this mission.'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                        {artifactGroups.map((group) => {
                          const oldVersions = group.artifacts.filter((artifact) => artifact !== group.latest);
                          const historyOpen = expandedVersions[group.key] || showVersionHistory;
                          return (
                          <section key={group.key} className="artifact-item produced">
                            <article>
                                <div className="artifact-header">
                                  <strong>{group.latest.name || group.latest.id || 'Untitled artifact'}</strong>
                                  <span className={`badge ${getArtifactPurpose(group.latest)}`}>
                                    {getArtifactPurpose(group.latest) === 'execution-outcome'
                                      ? 'Execution outcome'
                                      : getArtifactPurpose(group.latest)}
                                  </span>
                                  <span className="badge">{group.latest.version !== undefined ? `Version ${group.latest.version}` : 'Current'}</span>
                                  {group.latest.status && <span className={`badge ${group.latest.status}`}>{group.latest.status.replace('_', ' ')}</span>}
                                  <span className="muted">{getArtifactMimeType(group.latest)}</span>
                                  {group.latest.phaseName && <span className="muted">Phase: {group.latest.phaseName}</span>}
                                  {group.latest.taskTitle && <span className="muted">Task: {group.latest.taskTitle}</span>}
                                  {group.latest.createdAt && <time className="muted">{new Date(group.latest.createdAt).toLocaleString()}</time>}
                                  {getArtifactPurpose(group.latest) !== 'execution-outcome' && (
                                    <button type="button" onClick={() => uploadArtifactVersion(m.missionId, group.latest)}>
                                      Upload new version
                                    </button>
                                  )}
                                </div>
                                <MissionArtifactContent artifact={group.latest} />
                                {group.artifacts.length > 1 && (
                                  <details
                                    open={historyOpen}
                                    onToggle={(event) => setExpandedVersions((current) => ({
                                      ...current,
                                      [group.key]: (event.currentTarget as HTMLDetailsElement).open,
                                    }))}
                                    style={{ marginTop: 8 }}
                                  >
                                    <summary style={{ cursor: 'pointer' }}>
                                      {group.artifacts.length - 1} previous version{group.artifacts.length === 2 ? '' : 's'}
                                    </summary>
                                    {historyOpen && oldVersions.map((artifact, index) => (
                                      <article key={artifact.id || `${artifact.name}-${index}`} style={{ padding: '8px 0', borderTop: '1px solid #334155' }}>
                                        <div className="artifact-header">
                                          <strong>{artifact.name || artifact.id || 'Untitled artifact'}</strong>
                                          <span className="badge">{getArtifactLabel(artifact, index, group.artifacts.length)}</span>
                                          {artifact.status && <span className={`badge ${artifact.status}`}>{artifact.status.replace('_', ' ')}</span>}
                                          {artifact.createdAt && <time className="muted">{new Date(artifact.createdAt).toLocaleString()}</time>}
                                        </div>
                                        <MissionArtifactContent artifact={artifact} />
                                      </article>
                                    ))}
                                  </details>
                                )}
                              </article>
                          </section>
                          );
                        })}
                      </div>
                    )}
                            <div style={{ marginTop: 8 }}>
                              <label style={{ fontSize: 13 }}>
                                Upload artifact:
                                <select
                                  value={uploadPurposes[m.workflowId] || 'workproduct'}
                                  onChange={(event) => setUploadPurposes((current) => ({
                                    ...current,
                                    [m.workflowId]: event.target.value as 'workproduct' | 'deliverable',
                                  }))}
                                >
                                  <option value="workproduct">Workproduct</option>
                                  <option value="deliverable">Deliverable</option>
                                </select>
                                <input type="file" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const body = new FormData();
                                  body.append('file', file);
                                  const purpose = uploadPurposes[m.workflowId] || 'workproduct';
                                  body.append('purpose', purpose);
                                  body.append('isDeliverable', String(purpose === 'deliverable'));
                                  body.append('status', 'draft');
                                  try {
                                    await postFormData(`/api/artifacts/missions/${encodeURIComponent(m.missionId)}/artifacts`, body);
                                    await loadMissionsWithArtifacts();
                                  } catch (err) {
                                    window.alert(err instanceof Error ? err.message : 'Upload failed');
                                  }
                                }} /></label>
                            </div>
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
                               {truncateJSON(d.data)}
                             </pre>
                           </td>
                           <td>
                             <button className="danger small" onClick={() => handleDelete(d.id)} aria-label={`Delete document ${d.id}`}>
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