import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEntityStore, Entity } from '../stores/entityStore';
import { useFeedStore } from '../stores/feedStore';
import { fetchJSON, postJSON, putJSON } from '../utils/api';

interface ToolBinding {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
}

interface HITLApproval {
  id: string;
  missionId: string;
  phaseId: string;
  action: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  assistantId?: string;
  workflowId?: string;
}

const EntityWorkspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { entities, selectedEntity, fetchEntity, selectEntity } = useEntityStore();
  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);
  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'configuration' | 'memory' | 'missions' | 'hitl' | 'artifacts' | 'conversation'>('overview');
  const [missionInput, setMissionInput] = useState('');
  const [running, setRunning] = useState(false);
  const [missionHistory, setMissionHistory] = useState<Array<{ missionId: string; status: string; timestamp: string; output?: string }>>([]);
  const [toolBindings, setToolBindings] = useState<ToolBinding[]>([]);
  const [availableTools, setAvailableTools] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [hitlApprovals, setHitlApprovals] = useState<HITLApproval[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [memoryContext, setMemoryContext] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingSystemPrompt, setEditingSystemPrompt] = useState('');
  const [knowledgeEntries, setKnowledgeEntries] = useState<Array<{ id: string; title: string; content: string; source?: string }>>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeSource, setKnowledgeSource] = useState('');
  const [transactionGuidanceEntries, setTransactionGuidanceEntries] = useState<string[]>([]);
  const [transactionInput, setTransactionInput] = useState('');
  const [metadataConfig, setMetadataConfig] = useState<Record<string, unknown>>({});
  const [customToolName, setCustomToolName] = useState('');
  const [customToolDescription, setCustomToolDescription] = useState('');
  const [customToolSchema, setCustomToolSchema] = useState('');

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
      setEditingSystemPrompt(selectedEntity.systemPrompt || '');
      setKnowledgeEntries(selectedEntity.knowledge || []);
      setTransactionGuidanceEntries(selectedEntity.transactionGuidance || []);
      setMetadataConfig(selectedEntity.metadata || {});
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
        metadata: {
          toolBindings: toolBindings.filter((t) => t.enabled).map((t) => t.name),
          knowledge: knowledgeEntries,
          transactionGuidance: transactionGuidanceEntries,
        },
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

  const addCustomTool = () => {
    if (!customToolName.trim()) return;
    let parsedSchema: Record<string, unknown> = {};
    if (customToolSchema.trim()) {
      try {
        parsedSchema = JSON.parse(customToolSchema);
      } catch {
        setSaveError('Invalid JSON for tool input schema');
        return;
      }
    }
    if (toolBindings.find((t) => t.name === customToolName.trim())) {
      setSaveError(`Tool "${customToolName.trim()}" is already bound`);
      return;
    }
    setToolBindings((prev) => [
      ...prev,
      {
        name: customToolName.trim(),
        description: customToolDescription.trim(),
        inputSchema: parsedSchema,
        enabled: true,
      },
    ]);
    setCustomToolName('');
    setCustomToolDescription('');
    setCustomToolSchema('');
  };

  const removeCustomTool = (toolName: string) => {
    setToolBindings((prev) => prev.filter((t) => t.name !== toolName));
  };

  const addKnowledgeEntry = () => {
    if (!knowledgeTitle.trim() || !knowledgeContent.trim()) return;
    setKnowledgeEntries((prev) => [
      ...prev,
      {
        id: `knowledge-${Date.now()}`,
        title: knowledgeTitle.trim(),
        content: knowledgeContent.trim(),
        source: knowledgeSource.trim() || undefined,
      },
    ]);
    setKnowledgeTitle('');
    setKnowledgeContent('');
    setKnowledgeSource('');
  };

  const removeKnowledgeEntry = (idx: number) => {
    setKnowledgeEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const addTransactionGuidance = () => {
    if (!transactionInput.trim()) return;
    setTransactionGuidanceEntries((prev) => [...prev, transactionInput.trim()]);
    setTransactionInput('');
  };

  const removeTransactionGuidance = (idx: number) => {
    setTransactionGuidanceEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveConfiguration = async () => {
    if (!entity) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updates = {
        systemPrompt: editingSystemPrompt,
        knowledge: knowledgeEntries,
        transactionGuidance: transactionGuidanceEntries,
        tools: toolBindings.filter((t) => t.enabled).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        })),
        metadata: metadataConfig,
      };
      await putJSON(`/api/workers/assistants/${encodeURIComponent(entity.id)}`, updates);
      setSaveError(null);
      await fetchEntity(entity.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleHITLAction = async (approvalId: string, action: 'approved' | 'rejected') => {
    const approval = hitlApprovals.find((a) => a.id === approvalId);
    if (!approval) return;
    try {
      if (action === 'approved') {
        await postJSON(`/api/artifacts/missions/${encodeURIComponent(approval.missionId)}/phases/${encodeURIComponent(approval.phaseId)}/approve`, {
          approvedBy: entity?.id || 'user',
        });
      } else {
        await postJSON(`/api/artifacts/missions/${encodeURIComponent(approval.missionId)}/phases/${encodeURIComponent(approval.phaseId)}/reject`, {
          reason: 'Rejected from assistant workspace',
          rejectedBy: entity?.id || 'user',
        });
      }
      setHitlApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    } catch (err) {
      console.error('Approval action failed', err);
    }
  };

  const loadApprovals = async () => {
    setLoadingApprovals(true);
    try {
      const data = await fetchJSON<{
        approvals: Array<{
          missionId: string;
          phaseId: string;
          question: string;
          phaseName?: string;
          assistantId?: string;
        }>;
      }>('/api/artifacts/missions/approvals');
      const workflowIdMap = (data.approvals || []).reduce<Record<string, string>>((acc, a) => {
        acc[a.missionId] = `mission-${a.missionId}`;
        return acc;
      }, {});
      setHitlApprovals(
        (data.approvals || [])
          .filter((a) => !entity?.id || a.assistantId === entity.id)
          .map((a) => ({
            id: `${a.missionId}:${a.phaseId}`,
            missionId: a.missionId,
            phaseId: a.phaseId,
            action: a.question || a.phaseName || 'Approval required',
            status: 'pending' as const,
            requestedAt: new Date().toISOString(),
            assistantId: a.assistantId,
            workflowId: workflowIdMap[a.missionId],
          })),
      );
    } catch {
      setHitlApprovals([]);
    } finally {
      setLoadingApprovals(false);
    }
  };

 useEffect(() => {
   if (activeTab === 'hitl') loadApprovals();
 }, [activeTab]);

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
          {entity.metadata && typeof (entity.metadata as Record<string, unknown>).legacyPort !== 'undefined' && (
            <span className="badge info">legacy port {String((entity.metadata as Record<string, unknown>).legacyPort)}</span>
          )}
          {entity.metadata && typeof (entity.metadata as Record<string, unknown>).category !== 'undefined' && (
            <span className="badge info">{String((entity.metadata as Record<string, unknown>).category)}</span>
          )}
          <span className="badge persisted">persisted</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </div>

      <div className="entity-tabs">
        {(entity.type === 'assistant'
          ? (['overview', 'tools', 'configuration', 'memory', 'missions', 'hitl', 'artifacts'] as const)
          : (['overview', 'tools', 'memory', 'missions', 'hitl', 'artifacts'] as const)
        ).map((tab) => (
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
                 <div><strong>Model:</strong> {entity.model || '—'}</div>
                 <div><strong>Tools Bound:</strong> {toolBindings.filter((t) => t.enabled).length}</div>
                 <div><strong>Knowledge Entries:</strong> {knowledgeEntries.length}</div>
                 <div><strong>Guidance Rules:</strong> {transactionGuidanceEntries.length}</div>
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
                 <button
                   type="button"
                   className="secondary"
                   onClick={saveConfiguration}
                   disabled={saving}
                   style={{ marginTop: 8 }}
                 >
                   {saving ? 'Saving…' : 'Save Configuration'}
                 </button>
                 <p className="hint">
                   Mission will use {toolBindings.filter((t) => t.enabled).length} bound tools
                   · {knowledgeEntries.length} knowledge entries · {transactionGuidanceEntries.length} guidance rules
                 </p>
                 {saveError && <div className="error-banner">{saveError}</div>}
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
                          {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                            <p className="muted" style={{ fontSize: '11px' }}>
                              Schema: {JSON.stringify(tool.inputSchema).slice(0, 120)}
                              {JSON.stringify(tool.inputSchema).length > 120 ? '…' : ''}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={tool.enabled}
                              onChange={() => toggleToolBinding(tool.name)}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                          <button
                            className="remove-btn"
                            onClick={() => removeCustomTool(tool.name)}
                            title={`Remove ${tool.name}`}
                          >
                            &times;
                          </button>
                        </div>
                      </li>
                   ))}
                 </ul>
               )}
               <div className="button-row" style={{ marginTop: 12 }}>
                 <button onClick={saveConfiguration} disabled={saving}>
                   {saving ? 'Saving…' : 'Save Tool Bindings'}
                 </button>
               </div>
               {saveError && <div className="error-banner">{saveError}</div>}
             </div>
             <div className="card">
               <h3>Add Custom Tool</h3>
               <p className="hint">
                 Define a domain-specific tool for this assistant. The tool will be bound and
                 made available during mission execution.
               </p>
               <div className="form">
                 <input
                   type="text"
                   placeholder="Tool name"
                   value={customToolName}
                   onChange={(e) => setCustomToolName(e.target.value)}
                 />
                 <input
                   type="text"
                   placeholder="Description"
                   value={customToolDescription}
                   onChange={(e) => setCustomToolDescription(e.target.value)}
                 />
                 <textarea
                   placeholder='Input schema (JSON, e.g. {"type":"object","properties":{}})'
                   value={customToolSchema}
                   onChange={(e) => setCustomToolSchema(e.target.value)}
                   rows={3}
                 />
                 <div className="button-row">
                   <button type="button" onClick={addCustomTool} className="secondary">
                     Add Custom Tool
                   </button>
                 </div>
               </div>
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

         {activeTab === 'configuration' && (
           <div>
             <div className="grid two-col">
               <div className="card">
                 <h3>System Prompt</h3>
                 <p className="hint">
                   Edit the base system prompt for this assistant. Domain-specific knowledge
                   and transaction guidance are appended at execution time.
                 </p>
                 <textarea
                   placeholder="System prompt"
                   value={editingSystemPrompt}
                   onChange={(e) => setEditingSystemPrompt(e.target.value)}
                   rows={8}
                 />
               </div>

               <div className="card">
                 <h3>Transaction Guidance</h3>
                 <p className="hint">
                   Rules that are injected into the system prompt at execution time to guide
                   transaction-level behavior (e.g. "always confirm before booking").
                 </p>
                 <div className="input-row">
                   <input
                     type="text"
                     placeholder="Guidance rule"
                     value={transactionInput}
                     onChange={(e) => setTransactionInput(e.target.value)}
                     className="flex-grow"
                   />
                   <button type="button" onClick={addTransactionGuidance}>
                     Add
                   </button>
                 </div>
                 {transactionGuidanceEntries.length > 0 ? (
                   <ul className="tool-list">
                     {transactionGuidanceEntries.map((g, idx) => (
                       <li key={idx}>
                         {g}
                         <button type="button" onClick={() => removeTransactionGuidance(idx)} className="remove-btn">
                           &times;
                         </button>
                       </li>
                     ))}
                   </ul>
                 ) : (
                   <p className="muted">No transaction guidance rules.</p>
                 )}
               </div>
             </div>

             <div className="grid two-col">
               <div className="card">
                 <h3>Knowledge Base</h3>
                 <p className="hint">
                   Add domain-specific knowledge that will be injected into the assistant's
                   context at execution time.
                 </p>
                 <div className="input-row">
                   <input
                     type="text"
                     placeholder="Title"
                     value={knowledgeTitle}
                     onChange={(e) => setKnowledgeTitle(e.target.value)}
                     className="flex-grow"
                   />
                   <input
                     type="text"
                     placeholder="Source (optional)"
                     value={knowledgeSource}
                     onChange={(e) => setKnowledgeSource(e.target.value)}
                     className="flex-grow"
                   />
                 </div>
                 <textarea
                   placeholder="Knowledge content"
                   value={knowledgeContent}
                   onChange={(e) => setKnowledgeContent(e.target.value)}
                   rows={3}
                 />
                 <button type="button" onClick={addKnowledgeEntry} className="secondary">
                   Add Knowledge
                 </button>
                 {knowledgeEntries.length > 0 ? (
                   <ul className="tool-list">
                     {knowledgeEntries.map((k, idx) => (
                       <li key={k.id || idx}>
                         <div>
                           <strong>{k.title}</strong>
                           <p>{k.content.slice(0, 120)}{k.content.length > 120 ? '…' : ''}</p>
                           {k.source && <p className="muted">Source: {k.source}</p>}
                         </div>
                         <button type="button" onClick={() => removeKnowledgeEntry(idx)} className="remove-btn">
                           &times;
                         </button>
                       </li>
                     ))}
                   </ul>
                 ) : (
                   <p className="muted">No knowledge entries.</p>
                 )}
               </div>

               <div className="card">
                 <h3>Assistant Configuration</h3>
                 <p className="hint">
                   Configure execution parameters and metadata for this assistant.
                   These are stored in the assistant definition's metadata.
                 </p>
                 <pre className="code-block" style={{ maxHeight: '200px', overflow: 'auto' }}>
                   {JSON.stringify(metadataConfig, null, 2)}
                 </pre>
                 <div className="input-row">
                   <input
                     type="text"
                     placeholder="Metadata key"
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') {
                         const key = (e.target as HTMLInputElement).value.trim();
                         if (key) {
                           setMetadataConfig({ ...metadataConfig, [key]: '' });
                           e.currentTarget.value = '';
                         }
                       }
                     }}
                   />
                 </div>
                 <button type="button" onClick={() => {
                   const newMeta = { ...metadataConfig };
                   const maxIters = Number(newMeta.maxIterations) || 8;
                   newMeta.maxIterations = maxIters;
                   setMetadataConfig(newMeta);
                 }} className="secondary">
                   Set maxIterations
                 </button>
                 <div className="button-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                   <button onClick={saveConfiguration} disabled={saving}>
                     {saving ? 'Saving…' : 'Save Configuration'}
                   </button>
                 </div>
                 {saveError && <div className="error-banner">{saveError}</div>}
               </div>
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
             <p className="hint">
               Showing approvals aligned with this assistant (<code>{entity.id}</code>).
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
