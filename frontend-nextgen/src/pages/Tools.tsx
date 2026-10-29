import { useEffect, useMemo, useState } from 'react';
import { fetchJSON, postJSON } from '../utils/api';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [addMode, setAddMode] = useState(false);

  const [executingTool, setExecutingTool] = useState<Tool | null>(null);
  const [executeInputValues, setExecuteInputValues] = useState<Record<string, unknown>>({});
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecutionResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Add tool form state
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addType, setAddType] = useState<'code' | 'openapi' | 'mcp' | 'native'>('code');
  const [addInputSchemaText, setAddInputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [addOutputSchemaText, setAddOutputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [addManifestText, setAddManifestText] = useState('{}');
  const [addSourceCode, setAddSourceCode] = useState('');
  const [addLanguage, setAddLanguage] = useState('javascript');
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    if (executingTool) {
      setExecuteInputValues(getInitialInputValues(executingTool.inputSchema || { type: 'object', properties: {} }));
    }
  }, [executingTool]);

  const addInputSchemaParse = useMemo(() => safeParseJson(addInputSchemaText), [addInputSchemaText]);
  const addOutputSchemaParse = useMemo(() => safeParseJson(addOutputSchemaText), [addOutputSchemaText]);
  const addManifestParse = useMemo(() => safeParseJson(addManifestText), [addManifestText]);

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!addInputSchemaParse.ok) {
      setAddError(`Input schema: ${addInputSchemaParse.error}`);
      return;
    }
    if (!addOutputSchemaParse.ok) {
      setAddError(`Output schema: ${addOutputSchemaParse.error}`);
      return;
    }
    if (!addManifestParse.ok) {
      setAddError(`Manifest: ${addManifestParse.error}`);
      return;
    }

    setAdding(true);
    try {
      const manifest: Record<string, unknown> = { ...(addManifestParse.value as Record<string, unknown>) };
      if (addType === 'code') {
        if (addLanguage) manifest.language = addLanguage;
        if (addSourceCode) manifest.sourceCode = addSourceCode;
        if (addFiles.length > 0) {
          manifest.files = addFiles.map((f) => ({ name: f.name, size: f.size }));
        }
      }

      const payload = {
        id: `tool-${Date.now()}`,
        name: addName,
        description: addDescription,
        type: addType,
        manifest,
        inputSchema: addInputSchemaParse.value,
        outputSchema: addOutputSchemaParse.value,
      };
      await postJSON('/api/tool-executor/tools', payload);
      setAddName('');
      setAddDescription('');
      setAddType('code');
      setAddInputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
      setAddOutputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
      setAddManifestText('{}');
      setAddSourceCode('');
      setAddLanguage('javascript');
      setAddFiles([]);
      setAddMode(false);
      setSelectedTool(null);
      await loadTools();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add tool');
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    if (addMode && addType === 'code' && addSourceCode === '' && addFiles.length === 0) {
      // keep as is
    }
  }, [addMode, addType]);

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

      <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', alignItems: 'start' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Registered Tools</h3>
            <button
              onClick={() => {
                setAddMode(true);
                setSelectedTool(null);
              }}
            >
              Add Tool
            </button>
          </div>
          {loading ? <p>Loading tools…</p> : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr
                      key={t.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedTool(t);
                        setAddMode(false);
                      }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: selectedTool?.id === t.id && !addMode ? 600 : 400 }}>{t.name}</span>
                          <span className={`badge badge-${t.type}`}>{t.type}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tools.length === 0 && (
                    <tr><td>No tools registered</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ borderLeft: '1px solid #334155' }}>
          {addMode ? (
            <div>
              <div className="panel-header" style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Add Tool</h3>
                <button onClick={() => setAddMode(false)}>Cancel</button>
              </div>
              <form onSubmit={handleAddTool} className="form">
                <input type="text" placeholder="Name" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                <textarea placeholder="Description" value={addDescription} onChange={(e) => setAddDescription(e.target.value)} required rows={2} />
                <select value={addType} onChange={(e) => setAddType(e.target.value as Tool['type'])}>
                  <option value="code">Code</option>
                  <option value="openapi">OpenAPI</option>
                  <option value="mcp">MCP</option>
                  <option value="native">Native</option>
                </select>

                {addType === 'code' && (
                  <>
                    <label className="field-label">
                      Language
                      <input type="text" value={addLanguage} onChange={(e) => setAddLanguage(e.target.value)} />
                    </label>
                    <label className="field-label">
                      Source Code
                      <textarea
                        rows={8}
                        value={addSourceCode}
                        onChange={(e) => setAddSourceCode(e.target.value)}
                        spellCheck={false}
                        placeholder="Paste or write tool code here"
                      />
                    </label>
                    <label className="field-label">
                      Upload Files (optional)
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = e.target.files ? Array.from(e.target.files) : [];
                          setAddFiles(files);
                        }}
                      />
                      {addFiles.length > 0 && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>
                          {addFiles.map((f) => f.name).join(', ')}
                        </div>
                      )}
                    </label>
                  </>
                )}

                <label className="field-label">
                  Manifest (JSON)
                  <textarea
                    rows={4}
                    value={addManifestText}
                    onChange={(e) => setAddManifestText(e.target.value)}
                    spellCheck={false}
                    className={addManifestParse.ok ? '' : 'invalid'}
                  />
                  {!addManifestParse.ok && <span className="field-error">{addManifestParse.error}</span>}
                </label>

                <label className="field-label">
                  Input Schema (JSON)
                  <textarea
                    rows={6}
                    value={addInputSchemaText}
                    onChange={(e) => setAddInputSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addInputSchemaParse.ok ? '' : 'invalid'}
                  />
                  {!addInputSchemaParse.ok && <span className="field-error">{addInputSchemaParse.error}</span>}
                </label>

                <label className="field-label">
                  Output Schema (JSON)
                  <textarea
                    rows={6}
                    value={addOutputSchemaText}
                    onChange={(e) => setAddOutputSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addOutputSchemaParse.ok ? '' : 'invalid'}
                  />
                  {!addOutputSchemaParse.ok && <span className="field-error">{addOutputSchemaParse.error}</span>}
                </label>

                {addError && <div className="error-banner">{addError}</div>}

                <button type="submit" disabled={adding || !addInputSchemaParse.ok || !addOutputSchemaParse.ok || !addManifestParse.ok}>
                  {adding ? 'Adding…' : 'Add Tool'}
                </button>
              </form>
            </div>
          ) : selectedTool ? (
            <div>
              <div className="panel-header" style={{ marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>{selectedTool.name} <span className={`badge badge-${selectedTool.type}`}>{selectedTool.type}</span></h3>
                <button onClick={() => setSelectedTool(null)} aria-label="Close tool details">Close</button>
              </div>
              <p className="muted" style={{ marginBottom: 12 }}>{selectedTool.description || '(no description)'}</p>
              <dl className="kv" style={{ marginBottom: 16 }}>
                <dt>ID</dt><dd className="mono">{selectedTool.id}</dd>
                <dt>Created</dt><dd>{selectedTool.createdAt ? new Date(selectedTool.createdAt).toLocaleString() : '—'}</dd>
                <dt>Updated</dt><dd>{selectedTool.updatedAt ? new Date(selectedTool.updatedAt).toLocaleString() : '—'}</dd>
              </dl>
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginBottom: 12 }}>
                <h4 style={{ marginBottom: 8 }}>Manifest</h4>
                <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.manifest ?? {}, null, 2)}</pre>
              </div>
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginBottom: 12 }}>
                <h4 style={{ marginBottom: 8 }}>Input Schema</h4>
                <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}</pre>
              </div>
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12 }}>
                <h4 style={{ marginBottom: 8 }}>Output Schema</h4>
                <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.outputSchema ?? {}, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>
              Select a tool from the list or click Add Tool to create one
            </div>
          )}
        </div>
      </div>

      {selectedTool && !addMode && (
        <div className="card tool-detail-panel" style={{ marginTop: 16 }}>
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
          <div style={{ marginTop: 12 }}>
            <h4>Manifest</h4>
            <pre className="code-block">{JSON.stringify(selectedTool.manifest ?? {}, null, 2)}</pre>
          </div>
          <div style={{ marginTop: 12 }}>
            <h4>Input Schema</h4>
            <pre className="code-block">{JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}</pre>
          </div>
          <div style={{ marginTop: 12 }}>
            <h4>Output Schema</h4>
            <pre className="code-block">{JSON.stringify(selectedTool.outputSchema ?? {}, null, 2)}</pre>
          </div>
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
