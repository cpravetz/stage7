import { useEffect, useMemo, useState } from 'react';
import { fetchJSON, postJSON, putJSON } from '../utils/api';
import { SchemaFields } from '../components/SchemaFields';
import OutputTemplate from '../components/OutputTemplate';
import { getInitialInputValues } from '../utils/workspaceHelpers';

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  [key: string]: unknown;
};

type Tool = {
  id: string;
  name: string;
  description: string;
  type: 'code' | 'openapi' | 'mcp' | 'native';
  manifest?: Record<string, unknown>;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  isSkill?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ExecutionResult = {
  status?: string;
  output?: unknown;
  error?: string;
  [key: string]: unknown;
};

type AssistantWithTools = {
  id: string;
  name: string;
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  [key: string]: unknown;
};

const DEFAULT_SCHEMA: JsonSchema = { type: 'object', properties: {} };

const safeParseJson = (text: string): { ok: true; value: JsonSchema } | { ok: false; error: string } => {
  if (!text.trim()) return { ok: true, value: { ...DEFAULT_SCHEMA } };
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'Must be a JSON object' };
    }
    return { ok: true, value: parsed as JsonSchema };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
};

const Tools = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [assistants, setAssistants] = useState<AssistantWithTools[]>([]);
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'code' | 'openapi' | 'mcp' | 'native'>('code');
  const [inputSchemaText, setInputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [outputSchemaText, setOutputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const [executingTool, setExecutingTool] = useState<Tool | null>(null);
  const [executeInputValues, setExecuteInputValues] = useState<Record<string, unknown>>({});
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecutionResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const loadTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJSON<{ tools: Tool[] }>('/api/tool-executor/tools');
      // Filter out skill definitions — the tool-executor registers both general tools and skill definitions.
      const general = (data.tools || []).filter((t) => !t.isSkill);
      setTools(general);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
    const loadAssistants = async () => {
      try {
        const data = await fetchJSON<{ assistants: AssistantWithTools[] }>('/api/workers/assistants');
        setAssistants(data.assistants || []);
      } catch {
        setAssistants([]);
      }
    };
    loadAssistants();
  }, []);

  useEffect(() => {
    if (executingTool) {
      setExecuteInputValues(getInitialInputValues(executingTool.inputSchema || { type: 'object', properties: {} }));
    }
  }, [executingTool]);

  const inputSchemaParse = useMemo(() => safeParseJson(inputSchemaText), [inputSchemaText]);
  const outputSchemaParse = useMemo(() => safeParseJson(outputSchemaText), [outputSchemaText]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    if (!inputSchemaParse.ok) {
      setRegisterError(`Input schema: ${inputSchemaParse.error}`);
      return;
    }
    if (!outputSchemaParse.ok) {
      setRegisterError(`Output schema: ${outputSchemaParse.error}`);
      return;
    }

    setRegistering(true);
    try {
      const payload = {
        id: `tool-${Date.now()}`,
        name,
        description,
        type,
        manifest: {},
        inputSchema: inputSchemaParse.value,
        outputSchema: outputSchemaParse.value,
      };
      await postJSON('/api/tool-executor/tools', payload);
      setName('');
      setDescription('');
      setType('code');
      setInputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
      setOutputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
      await loadTools();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to create tool');
    } finally {
      setRegistering(false);
    }
  };

  const closeExecute = () => {
    setExecutingTool(null);
    setExecuteInputValues({});
    setExecuteResult(null);
    setExecuteError(null);
    setExecuting(false);
  };

  const handleExecute = async () => {
    if (!executingTool) return;

    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const result = await postJSON<ExecutionResult>(
        `/api/tool-executor/tools/${executingTool.id}/execute`,
        { input: executeInputValues }
      );
      setExecuteResult(result);
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="page">
      <h1>Tool Executor</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid two-col">
        <div className="card">
          <h3>Create Tool</h3>
          <form onSubmit={handleRegister} className="form">
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={2} />
            <select value={type} onChange={(e) => setType(e.target.value as Tool['type'])}>
              <option value="code">Code</option>
              <option value="openapi">OpenAPI</option>
              <option value="mcp">MCP</option>
              <option value="native">Native</option>
            </select>

            <label className="field-label">
              Input Schema (JSON)
              <textarea
                rows={6}
                value={inputSchemaText}
                onChange={(e) => setInputSchemaText(e.target.value)}
                spellCheck={false}
                className={inputSchemaParse.ok ? '' : 'invalid'}
              />
              {!inputSchemaParse.ok && <span className="field-error">{inputSchemaParse.error}</span>}
            </label>

            <label className="field-label">
              Output Schema (JSON)
              <textarea
                rows={6}
                value={outputSchemaText}
                onChange={(e) => setOutputSchemaText(e.target.value)}
                spellCheck={false}
                className={outputSchemaParse.ok ? '' : 'invalid'}
              />
              {!outputSchemaParse.ok && <span className="field-error">{outputSchemaParse.error}</span>}
            </label>

            {registerError && <div className="error-banner">{registerError}</div>}

            <button type="submit" disabled={registering || !inputSchemaParse.ok || !outputSchemaParse.ok}>
              {registering ? 'Creating…' : 'Create Tool'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Registered Tools</h3>
          {loading ? <p>Loading tools…</p> : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.id}>
                      <td className="mono truncate">{t.id}</td>
                      <td>
                        <button className="link-button" onClick={() => setSelectedTool(t)}>
                          {t.name}
                        </button>
                      </td>
                      <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                      <td className="truncate" title={t.description}>{t.description}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select
                            value={assignSelection[t.id] || ''}
                            onChange={(e) => setAssignSelection({ ...assignSelection, [t.id]: e.target.value })}
                          >
                            <option value="">Select assistant</option>
                            {assistants.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={async () => {
                              const assistantId = assignSelection[t.id];
                              if (!assistantId) return alert('Select an assistant to assign to');
                              try {
                const full = await fetchJSON<AssistantWithTools>(`/api/workers/assistants/${encodeURIComponent(assistantId)}`);
                full.tools = full.tools || [];
                const exists = full.tools.find((et) => et.name === t.id || et.name === t.name);
                                if (exists) return alert('Assistant already has this tool');
                                full.tools.push({ name: t.id, description: t.description, inputSchema: t.inputSchema || { type: 'object', properties: {} } });
                                await putJSON(`/api/workers/assistants/${encodeURIComponent(assistantId)}`, full);
                                alert('Tool assigned to assistant');
                                const data = await fetchJSON<{ assistants: AssistantWithTools[] }>('/api/workers/assistants');
                                setAssistants(data.assistants || []);
                              } catch (err) {
                                alert(err instanceof Error ? err.message : 'Assignment failed');
                              }
                            }}
                          >Assign</button>
                          <button
                            onClick={async () => {
                              const assistantId = assignSelection[t.id];
                              if (!assistantId) return alert('Select an assistant to remove from');
                              try {
                const full = await fetchJSON<AssistantWithTools>(`/api/workers/assistants/${encodeURIComponent(assistantId)}`);
                full.tools = (full.tools || []).filter((et) => et.name !== t.id && et.name !== t.name);
                                await putJSON(`/api/workers/assistants/${encodeURIComponent(assistantId)}`, full);
                                alert('Tool removed from assistant');
                                const data = await fetchJSON<{ assistants: AssistantWithTools[] }>('/api/workers/assistants');
                                setAssistants(data.assistants || []);
                              } catch (err) {
                                alert(err instanceof Error ? err.message : 'Remove failed');
                              }
                            }}
                          >Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tools.length === 0 && (
                    <tr><td colSpan={5}>No tools registered</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedTool && (
        <div className="card tool-detail-panel">
          <div className="panel-header">
            <h3>{selectedTool.name} <span className={`badge badge-${selectedTool.type}`}>{selectedTool.type}</span></h3>
            <button onClick={() => setSelectedTool(null)} aria-label="Close tool details">Close</button>
          </div>
          <p className="muted">{selectedTool.description || '(no description)'}</p>
          <dl className="kv">
            <dt>ID</dt><dd className="mono">{selectedTool.id}</dd>
            <dt>Created</dt><dd>{selectedTool.createdAt ? new Date(selectedTool.createdAt).toLocaleString() : '—'}</dd>
            <dt>Updated</dt><dd>{selectedTool.updatedAt ? new Date(selectedTool.updatedAt).toLocaleString() : '—'}</dd>
          </dl>
          <h4>Manifest</h4>
          <pre className="code-block">{JSON.stringify(selectedTool.manifest ?? {}, null, 2)}</pre>
          <h4>Input Schema</h4>
          <pre className="code-block">{JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}</pre>
          <h4>Output Schema</h4>
          <pre className="code-block">{JSON.stringify(selectedTool.outputSchema ?? {}, null, 2)}</pre>
        </div>
      )}

      {executingTool && (
        <div className="modal-backdrop" onClick={closeExecute}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h3>Execute: {executingTool.name}</h3>
              <button onClick={closeExecute} aria-label="Close">Close</button>
            </div>
            <p className="muted">{executingTool.description}</p>

            <SchemaFields
              schema={executingTool.inputSchema || { type: 'object', properties: {} }}
              values={executeInputValues}
              onChange={(key, value) => {
                setExecuteInputValues((prev) => ({ ...prev, [key]: value }));
              }}
            />

            <div className="actions">
              <button onClick={handleExecute} disabled={executing}>
                {executing ? 'Executing…' : (typeof executingTool?.manifest?.actionLabel === 'string' && executingTool.manifest.actionLabel.trim()) || 'Run'}
              </button>
              <button onClick={closeExecute} disabled={executing}>Cancel</button>
            </div>

            {executeError && <div className="error-banner">{executeError}</div>}

            {executeResult && (
              <div className="card-inner">
                <h4>Result</h4>
                <OutputTemplate outputSchema={executingTool.outputSchema} result={executeResult.output ?? executeResult} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
