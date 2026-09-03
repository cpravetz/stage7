import { useEffect, useMemo, useState } from 'react';
import { fetchJSON, postJSON, deleteResource } from '../utils/api';

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
  type: 'code' | 'openapi' | 'mcp';
  manifest?: Record<string, unknown>;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  createdAt?: string;
  updatedAt?: string;
};

type ExecutionResult = {
  status?: string;
  output?: unknown;
  error?: string;
  [key: string]: unknown;
};

const DEFAULT_SCHEMA: JsonSchema = { type: 'object', properties: {} };

const truncate = (value: unknown, max = 60): string => {
  const str = typeof value === 'string' ? value : JSON.stringify(value ?? {});
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'code' | 'openapi' | 'mcp'>('code');
  const [inputSchemaText, setInputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [outputSchemaText, setOutputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const [executingTool, setExecutingTool] = useState<Tool | null>(null);
  const [executeInputText, setExecuteInputText] = useState('{}');
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecutionResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const loadTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJSON<{ tools: Tool[] }>('/api/tool-executor/tools');
      setTools(data.tools || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

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
        id: id || `tool-${Date.now()}`,
        name,
        description,
        type,
        manifest: {},
        inputSchema: inputSchemaParse.value,
        outputSchema: outputSchemaParse.value,
      };
      await postJSON('/api/tool-executor/tools', payload);
      setId('');
      setName('');
      setDescription('');
      setType('code');
      setInputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
      setOutputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
      await loadTools();
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to register tool');
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (toolId: string) => {
    try {
      await deleteResource(`/api/tool-executor/tools/${toolId}`);
      setTools((prev) => prev.filter((t) => t.id !== toolId));
      if (selectedTool?.id === toolId) setSelectedTool(null);
      if (executingTool?.id === toolId) closeExecute();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tool');
    }
  };

  const openExecute = (tool: Tool) => {
    setExecutingTool(tool);
    setExecuteResult(null);
    setExecuteError(null);
    const props = tool.inputSchema?.properties || {};
    const example: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(props)) {
      const s = schema as JsonSchema;
      if (s.type === 'string') example[key] = '';
      else if (s.type === 'number' || s.type === 'integer') example[key] = 0;
      else if (s.type === 'boolean') example[key] = false;
      else if (s.type === 'array') example[key] = [];
      else example[key] = {};
    }
    setExecuteInputText(JSON.stringify(Object.keys(example).length ? example : {}, null, 2));
  };

  const closeExecute = () => {
    setExecutingTool(null);
    setExecuteResult(null);
    setExecuteError(null);
    setExecuting(false);
  };

  const handleExecute = async () => {
    if (!executingTool) return;
    let parsed: unknown;
    try {
      parsed = executeInputText.trim() ? JSON.parse(executeInputText) : {};
    } catch (err) {
      setExecuteError(`Invalid JSON input: ${err instanceof Error ? err.message : 'parse error'}`);
      return;
    }

    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const result = await postJSON<ExecutionResult>(
        `/api/tool-executor/tools/${executingTool.id}/execute`,
        { input: parsed }
      );
      setExecuteResult(result);
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const inputFields = useMemo(() => {
    if (!executingTool) return [] as Array<[string, JsonSchema]>;
    const props = executingTool.inputSchema?.properties || {};
    return Object.entries(props);
  }, [executingTool]);

  const fillFieldValue = (schema: JsonSchema): string => {
    if (schema.type === 'string') return JSON.stringify('');
    if (schema.type === 'number' || schema.type === 'integer') return JSON.stringify(0);
    if (schema.type === 'boolean') return JSON.stringify(false);
    if (schema.type === 'array') return JSON.stringify([]);
    return JSON.stringify({});
  };

  const insertFieldIntoInput = (key: string, schema: JsonSchema) => {
    try {
      const current = executeInputText.trim() ? JSON.parse(executeInputText) : {};
      if (typeof current !== 'object' || current === null || Array.isArray(current)) {
        setExecuteError('Input must be a JSON object');
        return;
      }
      current[key] = JSON.parse(fillFieldValue(schema));
      setExecuteInputText(JSON.stringify(current, null, 2));
      setExecuteError(null);
    } catch (err) {
      setExecuteError(`Cannot parse input: ${err instanceof Error ? err.message : 'parse error'}`);
    }
  };

  return (
    <div className="page">
      <h1>Tool Executor</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid two-col">
        <div className="card">
          <h3>Register Tool</h3>
          <form onSubmit={handleRegister} className="form">
            <input type="text" placeholder="ID (optional, auto-generated if blank)" value={id} onChange={(e) => setId(e.target.value)} />
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="text" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} required />
            <select value={type} onChange={(e) => setType(e.target.value as Tool['type'])}>
              <option value="code">Code</option>
              <option value="openapi">OpenAPI</option>
              <option value="mcp">MCP</option>
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
              {registering ? 'Registering...' : 'Register'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Registered Tools</h3>
          {loading ? <p>Loading tools...</p> : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.id}</td>
                      <td>
                        <button className="link-button" onClick={() => setSelectedTool(t)}>
                          {t.name}
                        </button>
                      </td>
                      <td><span className={`badge badge-${t.type}`}>{t.type}</span></td>
                      <td className="truncate" title={t.description}>{t.description}</td>
                      <td className="mono truncate" title={JSON.stringify(t.inputSchema ?? {})}>
                        {truncate(t.inputSchema ?? {})}
                      </td>
                      <td className="mono truncate" title={JSON.stringify(t.outputSchema ?? {})}>
                        {truncate(t.outputSchema ?? {})}
                      </td>
                      <td className="actions">
                        <button onClick={() => openExecute(t)}>Execute</button>
                        <button onClick={() => handleDelete(t.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {tools.length === 0 && (
                    <tr><td colSpan={7}>No tools registered</td></tr>
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
            <button onClick={() => setSelectedTool(null)}>Close</button>
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
              <button onClick={closeExecute}>Close</button>
            </div>
            <p className="muted">{executingTool.description}</p>

            {inputFields.length > 0 && (
              <div className="card-inner">
                <h4>Input Fields</h4>
                <table className="data-table compact">
                  <thead><tr><th>Name</th><th>Type</th><th>Required</th><th></th></tr></thead>
                  <tbody>
                    {inputFields.map(([key, schema]) => (
                      <tr key={key}>
                        <td className="mono">{key}</td>
                        <td>{(schema.type as string) || 'object'}</td>
                        <td>{executingTool.inputSchema?.required?.includes(key) ? 'yes' : 'no'}</td>
                        <td>
                          <button type="button" onClick={() => insertFieldIntoInput(key, schema)}>
                            Insert
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <label className="field-label">
              Input (JSON)
              <textarea
                rows={8}
                value={executeInputText}
                onChange={(e) => setExecuteInputText(e.target.value)}
                spellCheck={false}
              />
            </label>

            <div className="actions">
              <button onClick={handleExecute} disabled={executing}>
                {executing ? 'Executing...' : 'Run'}
              </button>
              <button onClick={closeExecute} disabled={executing}>Cancel</button>
            </div>

            {executeError && <div className="error-banner">{executeError}</div>}

            {executeResult && (
              <div className="card-inner">
                <h4>
                  Result
                  {executeResult.status && (
                    <span className={`badge badge-${executeResult.status === 'failed' ? 'failed' : 'success'}`}>
                      {executeResult.status}
                    </span>
                  )}
                </h4>
                <pre className="code-block">{JSON.stringify(executeResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
