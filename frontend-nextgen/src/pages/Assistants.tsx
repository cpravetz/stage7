import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchJSON, postJSON, putJSON, deleteResource } from '../utils/api';

interface AssistantTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  model?: string;
  capabilities: string[];
  systemPrompt: string;
  tools: AssistantTool[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AssistantRuntime {
  assistantId: string;
  workerId: string;
  taskQueue: string;
  maxConcurrency: number;
  timeoutMs: number;
}

const Assistants = () => {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [capabilities, setCapabilities] = useState('chat');
  const [tools, setTools] = useState<AssistantTool[]>([]);
  const [toolName, setToolName] = useState('');
  const [toolDescription, setToolDescription] = useState('');
  const [registering, setRegistering] = useState(false);

  const [execId, setExecId] = useState('');
  const [execPrompt, setExecPrompt] = useState('');
  const [execResult, setExecResult] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name?: string;
    description?: string;
    capabilities?: string;
    systemPrompt?: string;
    tools?: AssistantTool[];
  }>({});
  const [showRuntime, setShowRuntime] = useState<string | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<AssistantRuntime | null>(null);

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

  const addTool = () => {
    if (!toolName.trim()) return;
    setTools([...tools, { name: toolName.trim(), description: toolDescription.trim(), inputSchema: { type: 'object', properties: {} } }]);
    setToolName('');
    setToolDescription('');
  };

  const removeTool = (idx: number) => {
    setTools(tools.filter((_, i) => i !== idx));
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
        capabilities: capabilities.split(',').map((c) => c.trim()).filter(Boolean),
        systemPrompt: systemPrompt || 'You are a helpful assistant.',
        tools,
        metadata: {},
      });
      setAssistants([...assistants, data]);
      setId('');
      setName('');
      setDescription('');
      setSystemPrompt('');
      setCapabilities('chat');
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
      capabilities: assistant.capabilities.join(', '),
      systemPrompt: assistant.systemPrompt,
      tools: assistant.tools,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setError(null);
    try {
      const data = await putJSON<Assistant>(`/api/workers/assistants/${editingId}`, {
        ...editForm,
        capabilities: typeof editForm.capabilities === 'string'
          ? (editForm.capabilities as string).split(',').map((c) => c.trim()).filter(Boolean)
          : editForm.capabilities,
      });
      setAssistants(assistants.map((a) => (a.id === editingId ? data : a)));
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assistant');
    }
  };

  const handleConfigureRuntime = async (assistantId: string) => {
    setError(null);
    try {
      const runtime = await postJSON<AssistantRuntime>(`/api/workers/assistants/${assistantId}/runtime`, {
        workerId: `worker-${assistantId}`,
        taskQueue: `queue-${assistantId}`,
        maxConcurrency: 2,
        timeoutMs: 60000,
      });
      setRuntimeConfig(runtime);
      setShowRuntime(assistantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure runtime');
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
        <div className="card">
          <h3>Register Assistant</h3>
          <form onSubmit={handleRegister} className="form">
            <input type="text" placeholder="ID (optional — auto-generated)" value={id} onChange={(e) => setId(e.target.value)} />
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={2} />
            <p className="hint">Model is optimized at chat time via the Brain router; no model assignment needed at registration.</p>
            <textarea placeholder="System Prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={3} />
            <input type="text" placeholder="Capabilities (comma-separated)" value={capabilities} onChange={(e) => setCapabilities(e.target.value)} />

            <div className="tool-binding-section">
              <h4>Tool Bindings</h4>
              <div className="input-row">
                <input type="text" placeholder="Tool name" value={toolName} onChange={(e) => setToolName(e.target.value)} className="flex-grow" />
                <input type="text" placeholder="Description" value={toolDescription} onChange={(e) => setToolDescription(e.target.value)} className="flex-grow" />
                <button type="button" onClick={addTool}>Add</button>
              </div>
              {tools.length > 0 && (
                <ul className="tool-list">
                  {tools.map((t, idx) => (
                    <li key={idx}>
                      <strong>{t.name}</strong>: {t.description}
                      <button type="button" onClick={() => removeTool(idx)} className="remove-btn">&times;</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="submit" disabled={registering}>{registering ? 'Registering...' : 'Register'}</button>
          </form>
        </div>

        <div className="card">
          <h3>Execute Assistant</h3>
          <form onSubmit={handleExecute} className="form">
            <select value={execId} onChange={(e) => setExecId(e.target.value)} required>
              <option value="">Select assistant</option>
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <textarea placeholder="Prompt" value={execPrompt} onChange={(e) => setExecPrompt(e.target.value)} required rows={3} />
            <button type="submit" disabled={executing}>{executing ? 'Running...' : 'Execute'}</button>
          </form>
          {execResult && <pre className="result">{execResult}</pre>}
        </div>
      </div>

      {editingId && (
        <div className="card edit-card">
          <h3>Edit Assistant: {editingId}</h3>
          <form onSubmit={handleUpdate} className="form">
            <input type="text" placeholder="Name" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <textarea placeholder="Description" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
            <textarea placeholder="System Prompt" value={editForm.systemPrompt || ''} onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })} rows={3} />
            <input type="text" placeholder="Capabilities (comma-separated)" value={editForm.capabilities || ''} onChange={(e) => setEditForm({ ...editForm, capabilities: e.target.value })} />
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
                <th>Capabilities</th>
                <th>Tools</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assistants.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/entity/${a.id}`}>{a.name}</Link></td>
                  <td className="truncate">{a.description}</td>
                  <td>{(a.capabilities || []).join(', ') || 'None'}</td>
                  <td>{a.tools?.length || 0}</td>
                  <td><span className="badge active">persisted</span></td>
                  <td className="actions-cell">
                    <Link to={`/entity/${a.id}`} className="link-button">Workspace</Link>
                    <button onClick={() => handleEdit(a)} className="link-button">Edit</button>
                    <button onClick={() => handleConfigureRuntime(a.id)} className="link-button">Runtime</button>
                    <button onClick={() => handleDelete(a.id)} className="link-button danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showRuntime && runtimeConfig && (
        <div className="card runtime-card">
          <h3>Runtime Configuration</h3>
          <button className="close-btn" onClick={() => setShowRuntime(null)}>&times;</button>
          <pre className="code-block">{JSON.stringify(runtimeConfig, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default Assistants;
