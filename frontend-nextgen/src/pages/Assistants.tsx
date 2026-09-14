import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchJSON, postJSON, putJSON, deleteResource } from '../utils/api';

interface AssistantTool {
  name: string;
  displayName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  systemPrompt: string;
  knowledge?: Array<{ id: string; title: string; content: string; source?: string }>;
  transactionGuidance?: string[];
  tools: AssistantTool[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const Assistants = () => {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [knowledge, setKnowledge] = useState<Array<{ id: string; title: string; content: string; source?: string }>>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeSource, setKnowledgeSource] = useState('');
  const [transactionGuidance, setTransactionGuidance] = useState<string[]>([]);
  const [transactionInput, setTransactionInput] = useState('');
  const [tools, setTools] = useState<AssistantTool[]>([]);
  const [registering, setRegistering] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; name: string; description: string; inputSchema?: Record<string, unknown> }>>([]);
  
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [bindTarget, setBindTarget] = useState<'create' | 'edit'>('create');

  const [execId, setExecId] = useState('');
  const [execPrompt, setExecPrompt] = useState('');
  const [execResult, setExecResult] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name?: string;
    description?: string;
    systemPrompt?: string;
    tools?: AssistantTool[];
    knowledge?: Array<{ id: string; title: string; content: string; source?: string }>;
    transactionGuidance?: string[];
  }>({});
  const [editSelectedSkillId, setEditSelectedSkillId] = useState('');
  const [editKnowledgeTitle, setEditKnowledgeTitle] = useState('');
  const [editKnowledgeContent, setEditKnowledgeContent] = useState('');
  const [editKnowledgeSource, setEditKnowledgeSource] = useState('');
  const [editTransactionInput, setEditTransactionInput] = useState('');
  const loadAssistants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const assistantsData = await fetchJSON<{ assistants: Assistant[] }>('/api/workers/assistants');
      setAssistants(assistantsData.assistants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assistants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssistants();
  }, [loadAssistants, retryCount]);

  useEffect(() => {
    fetchJSON<{ tools: Array<{ id: string; name: string; description: string; isSkill?: boolean; inputSchema?: Record<string, unknown> }> }>('/api/tool-executor/tools')
      .then((data) => {
        const tools = data.tools || [];
        setAvailableSkills(tools.filter((t: any) => t.isSkill).map((t: any) => ({ id: t.id, name: t.name, description: t.description, inputSchema: t.inputSchema })));
      })
      .catch(() => setAvailableSkills([]));
  }, []);

  // Tools must be skills bound from the skill catalog; freeform tools are not allowed.

  const removeTool = (idx: number) => {
    setTools(tools.filter((_, i) => i !== idx));
  };

  const addKnowledge = () => {
    if (!knowledgeTitle.trim() || !knowledgeContent.trim()) return;
    setKnowledge([...knowledge, { id: `knowledge-${Date.now()}`, title: knowledgeTitle.trim(), content: knowledgeContent.trim(), source: knowledgeSource.trim() || undefined }]);
    setKnowledgeTitle('');
    setKnowledgeContent('');
    setKnowledgeSource('');
  };

  const removeKnowledge = (idx: number) => {
    setKnowledge(knowledge.filter((_, i) => i !== idx));
  };

  const addTransactionGuidance = () => {
    if (!transactionInput.trim()) return;
    setTransactionGuidance([...transactionGuidance, transactionInput.trim()]);
    setTransactionInput('');
  };

   const removeTransactionGuidance = (idx: number) => {
    setTransactionGuidance(transactionGuidance.filter((_, i) => i !== idx));
  };

  const addEditTool = () => {
    if (!editSelectedSkillId) return;
    const skill = availableSkills.find((s) => s.id === editSelectedSkillId);
    if (!skill) return;
    setEditForm({
      ...editForm,
      tools: [...(editForm.tools || []), { name: skill.id, displayName: skill.name, description: skill.description, inputSchema: skill.inputSchema || { type: 'object', properties: {} } }],
    });
    setEditSelectedSkillId('');
  };

  const removeEditTool = (idx: number) => {
    setEditForm({ ...editForm, tools: (editForm.tools || []).filter((_, i) => i !== idx) });
  };

  const addEditKnowledge = () => {
    if (!editKnowledgeTitle.trim() || !editKnowledgeContent.trim()) return;
    setEditForm({
      ...editForm,
      knowledge: [
        ...(editForm.knowledge || []),
        { id: `knowledge-${Date.now()}`, title: editKnowledgeTitle.trim(), content: editKnowledgeContent.trim(), source: editKnowledgeSource.trim() || undefined },
      ],
    });
    setEditKnowledgeTitle('');
    setEditKnowledgeContent('');
    setEditKnowledgeSource('');
  };

  const removeEditKnowledge = (idx: number) => {
    setEditForm({ ...editForm, knowledge: (editForm.knowledge || []).filter((_, i) => i !== idx) });
  };

  const addEditTransactionGuidance = () => {
    if (!editTransactionInput.trim()) return;
    setEditForm({
      ...editForm,
      transactionGuidance: [...(editForm.transactionGuidance || []), editTransactionInput.trim()],
    });
    setEditTransactionInput('');
  };

  const removeEditTransactionGuidance = (idx: number) => {
    setEditForm({
      ...editForm,
      transactionGuidance: (editForm.transactionGuidance || []).filter((_, i) => i !== idx),
    });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setError(null);
    try {
      const data = await postJSON<Assistant>('/api/workers/assistants', {
        id: id || `assistant-${Date.now()}`,
        tenantId: 'tenant-1',
        name,
        description,
        systemPrompt: systemPrompt || 'You are a helpful assistant.',
        knowledge,
        transactionGuidance,
        tools,
        metadata: {},
      });
      setAssistants([...assistants, data]);
      setId('');
      setName('');
      setDescription('');
      setSystemPrompt('');
      setKnowledge([]);
      setTransactionGuidance([]);
      setTools([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register assistant');
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (assistantId: string) => {
    if (!confirm('Delete this assistant? This action cannot be undone.')) return;
    setError(null);
    try {
      await deleteResource(`/api/workers/assistants/${assistantId}`);
      setAssistants(assistants.filter((a) => a.id !== assistantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assistant');
    }
  };

  const handleEdit = (assistant: Assistant) => {
    setEditingId(assistant.id);
    setEditForm({
      name: assistant.name,
      description: assistant.description,
      systemPrompt: assistant.systemPrompt,
      tools: assistant.tools,
      knowledge: assistant.knowledge,
      transactionGuidance: assistant.transactionGuidance,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setError(null);
    try {
      const data = await putJSON<Assistant>(`/api/workers/assistants/${editingId}`, editForm);
      setAssistants(assistants.map((a) => (a.id === editingId ? data : a)));
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assistant');
    }
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setExecuting(true);
    setExecResult(null);
    setError(null);
    try {
      const data = await postJSON<{ output: unknown }>(`/api/workers/assistants/${execId}/execute`, { prompt: execPrompt });
      setExecResult(typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Assistants</h1>
        <div className="header-actions">
          <span className="badge-count">{assistants.length} assistants</span>
          <button onClick={() => setShowRegisterForm(true)} className="secondary">Register a new assistant</button>
          <button onClick={() => setRetryCount((c) => c + 1)} className="secondary" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="close-btn">&times;</button>
        </div>
      )}

      <div className="grid two-col">
        {showRegisterForm && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Register Assistant</h3>
              <button type="button" className="close-btn" onClick={() => setShowRegisterForm(false)} aria-label="Close registration panel">&times;</button>
            </div>
            <form onSubmit={handleRegister} className="form">
              <input type="text" placeholder="ID (optional — auto-generated)" value={id} onChange={(e) => setId(e.target.value)} />
              <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={2} />
              <p className="hint">Model is optimized at chat time via the Brain router; no model assignment needed at registration.</p>
              <textarea placeholder="System Prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} />

              <div className="tool-binding-section">
                <h4>Skill Bindings</h4>
                <div className="input-row">
                  <button type="button" onClick={() => { setBindTarget('create'); setBindModalOpen(true); }} className="secondary">Bind Skill</button>
                </div>
                {tools.length > 0 && (
                  <ul className="tool-list">
                    {tools.map((t, idx) => (
                      <li key={idx}>
                         <strong>{t.displayName || availableSkills.find((s) => s.id === t.name)?.name || t.name}</strong>: {t.description}
                         <button type="button" onClick={() => removeTool(idx)} className="remove-btn">&times;</button>
                       </li>
                     ))}
                   </ul>
                 )}
               </div>

               <div className="tool-binding-section">
                 <h4>Knowledge Base</h4>
                <div className="input-row">
                  <input type="text" placeholder="Title" value={knowledgeTitle} onChange={(e) => setKnowledgeTitle(e.target.value)} className="flex-grow" />
                  <input type="text" placeholder="Source (optional)" value={knowledgeSource} onChange={(e) => setKnowledgeSource(e.target.value)} className="flex-grow" />
                </div>
                <textarea placeholder="Knowledge content" value={knowledgeContent} onChange={(e) => setKnowledgeContent(e.target.value)} rows={2} />
                <button type="button" onClick={addKnowledge} className="secondary">Add Knowledge</button>
                {knowledge.length > 0 && (
                  <ul className="tool-list">
                    {knowledge.map((k, idx) => (
                      <li key={k.id || idx}>
                        <strong>{k.title}</strong>: {k.content.slice(0, 100)}{k.content.length > 100 ? '...' : ''}
                        <button type="button" onClick={() => removeKnowledge(idx)} className="remove-btn">&times;</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="tool-binding-section">
                <h4>Transaction Guidance</h4>
                <div className="input-row">
                  <input type="text" placeholder="Guidance rule (e.g. Always confirm before booking)" value={transactionInput} onChange={(e) => setTransactionInput(e.target.value)} className="flex-grow" />
                  <button type="button" onClick={addTransactionGuidance}>Add</button>
                </div>
                {transactionGuidance.length > 0 && (
                  <ul className="tool-list">
                    {transactionGuidance.map((g, idx) => (
                      <li key={idx}>
                        {g}
                        <button type="button" onClick={() => removeTransactionGuidance(idx)} className="remove-btn">&times;</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button type="submit" disabled={registering}>{registering ? 'Registering...' : 'Register'}</button>
            </form>
          </div>
        )}

      </div>

      {editingId && (
        <div className="card edit-card">
          <h3>Edit Assistant: {editingId}</h3>
          <form onSubmit={handleUpdate} className="form">
            <input type="text" placeholder="Name" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <textarea placeholder="Description" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
            <textarea placeholder="System Prompt" value={editForm.systemPrompt || ''} onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })} rows={3} />

            <div className="tool-binding-section">
              <h4>Tool Bindings</h4>
              <div className="input-row">
                <button type="button" onClick={() => { setBindTarget('edit'); setBindModalOpen(true); }} className="secondary">Bind Skill</button>
              </div>
              {(editForm.tools || []).length > 0 && (
                <ul className="tool-list">
                  {(editForm.tools || []).map((t, idx) => (
                    <li key={idx}>
                       <strong>{t.displayName || availableSkills.find((s) => s.id === t.name)?.name || t.name}</strong>: {t.description}
                       <button type="button" onClick={() => removeEditTool(idx)} className="remove-btn">&times;</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="tool-binding-section">
              <h4>Knowledge Base</h4>
              <div className="input-row">
                <input type="text" placeholder="Title" value={editKnowledgeTitle} onChange={(e) => setEditKnowledgeTitle(e.target.value)} className="flex-grow" />
                <input type="text" placeholder="Source (optional)" value={editKnowledgeSource} onChange={(e) => setEditKnowledgeSource(e.target.value)} className="flex-grow" />
              </div>
              <textarea placeholder="Knowledge content" value={editKnowledgeContent} onChange={(e) => setEditKnowledgeContent(e.target.value)} rows={2} />
              <button type="button" onClick={addEditKnowledge} className="secondary">Add Knowledge</button>
              {(editForm.knowledge || []).length > 0 && (
                <ul className="tool-list">
                  {(editForm.knowledge || []).map((k, idx) => (
                    <li key={k.id || idx}>
                      <strong>{k.title}</strong>: {k.content.slice(0, 100)}{k.content.length > 100 ? '...' : ''}
                      <button type="button" onClick={() => removeEditKnowledge(idx)} className="remove-btn">&times;</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="tool-binding-section">
              <h4>Transaction Guidance</h4>
              <div className="input-row">
                <input type="text" placeholder="Guidance rule (e.g. Always confirm before booking)" value={editTransactionInput} onChange={(e) => setEditTransactionInput(e.target.value)} className="flex-grow" />
                <button type="button" onClick={addEditTransactionGuidance}>Add</button>
              </div>
              {(editForm.transactionGuidance || []).length > 0 && (
                <ul className="tool-list">
                  {(editForm.transactionGuidance || []).map((g, idx) => (
                    <li key={idx}>
                      {g}
                      <button type="button" onClick={() => removeEditTransactionGuidance(idx)} className="remove-btn">&times;</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="button-row">
              <button type="submit">Save Changes</button>
              <button type="button" className="secondary" onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Registered Assistants</h3>
        {loading ? (
          <div className="loading-state">
            <p>Loading assistants from artifacts...</p>
          </div>
        ) : assistants.length === 0 ? (
          <div className="empty-state">
            <p>No assistants registered. Use the form above to register one, or wait for the catalog to seed on first startup.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Skills</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assistants.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/entity/${a.id}`}>{a.name}</Link></td>
                  <td className="truncate">{a.description}</td>
                  <td>{a.tools?.length || 0}</td>
                  <td><span className="badge active">persisted</span></td>
                  <td className="actions-cell">
                    <Link to={`/entity/${a.id}`} className="link-button">Workspace</Link>
                    <button onClick={() => handleEdit(a)} className="link-button">Edit</button>
                    <button onClick={() => handleDelete(a.id)} className="link-button danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bindModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Bind a Skill</h3>
              <button className="close" onClick={() => setBindModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              {availableSkills.length === 0 ? (
                <p>No skills available.</p>
              ) : (
                <div className="skill-list">
                  {availableSkills.map((s) => {
                    const alreadyCreate = tools.some((t) => t.name === s.id);
                    const alreadyEdit = (editForm.tools || []).some((t) => t.name === s.id);
                    const already = bindTarget === 'create' ? alreadyCreate : alreadyEdit;
                    return (
                      <div key={s.id} className="skill-list-item">
                        <div style={{ flex: 1 }}>
                          <strong>{s.name}</strong>
                          <div className="muted">{s.description}</div>
                        </div>
                        <div>
                          <button disabled={already} onClick={() => {
                            if (already) return;
                            const newBinding = { name: s.id, description: s.description || s.name, enabled: true, config: {}, inputSchema: s.inputSchema } as any;
                            if (bindTarget === 'create') {
                              setTools((prev) => [...prev, { name: s.id, displayName: s.name, description: s.description, inputSchema: s.inputSchema || { type: 'object', properties: {} } }]);
                            } else {
                              setEditForm((prev) => ({ ...prev, tools: [...(prev.tools || []), { name: s.id, displayName: s.name, description: s.description, inputSchema: s.inputSchema || { type: 'object', properties: {} } }] }));
                            }
                            setBindModalOpen(false);
                          }}>{already ? 'Bound' : 'Bind'}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setBindModalOpen(false)} className="secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assistants;
