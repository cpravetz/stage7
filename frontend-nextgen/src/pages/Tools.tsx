import { useEffect, useMemo, useState } from 'react';
import { fetchJSON, postJSON, putJSON, deleteResource } from '../utils/api';
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
  type: 'code' | 'openapi' | 'mcp' | 'native' | 'reasoning';
  manifest?: Record<string, unknown>;
  inputSchema?: JsonSchema;
  configSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  isSkill?: boolean;
  createdAt?: string;
  updatedAt?: string;
  triggers?: unknown[];
};

type ExecutionResult = {
  status?: string;
  output?: unknown;
  error?: string;
  [key: string]: unknown;
};

type CredentialSource = {
  label?: string;
  envVar?: string;
  vaultSecretId?: string;
  configKey?: string;
};

function getToolCredentialSources(tool: Tool): Array<{ key: string; label: string; source: string }> {
  const rawSources = tool.manifest?.credentialSource;
  if (!rawSources || typeof rawSources !== 'object' || Array.isArray(rawSources)) return [];
  return Object.entries(rawSources).flatMap(([key, rawSource]) => {
    if (!rawSource || typeof rawSource !== 'object') return [];
    const source = rawSource as CredentialSource;
    const sourceLabel = source.envVar
      ? `environment variable ${source.envVar}`
      : source.vaultSecretId
        ? `Vault secret ${source.vaultSecretId}`
        : source.configKey
          ? `tool configuration ${source.configKey}`
          : 'no configured source';
    return [{ key, label: source.label || key, source: sourceLabel }];
  });
}

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

const safeParseJsonAny = (text: string): { ok: true; value: unknown } | { ok: false; error: string } => {
  if (!text.trim()) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(text);
    return { ok: true, value: parsed };
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
  const [search, setSearch] = useState('');

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'test' | 'assign'>('details');

  const [executeInputValues, setExecuteInputValues] = useState<Record<string, unknown>>({});
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecutionResult | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  // Add/Edit tool form state
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addType, setAddType] = useState<'code' | 'openapi' | 'mcp' | 'native' | 'reasoning'>('code');
  const [addInputSchemaText, setAddInputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [addConfigSchemaText, setAddConfigSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [addOutputSchemaText, setAddOutputSchemaText] = useState(JSON.stringify(DEFAULT_SCHEMA, null, 2));
  const [addManifestText, setAddManifestText] = useState('{}');
  const [addSourceCode, setAddSourceCode] = useState('');
  const [addLanguage, setAddLanguage] = useState('javascript');
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // MCP discovery
  const [mcpCapability, setMcpCapability] = useState('');
  const [mcpDiscovering, setMcpDiscovering] = useState(false);
  const [mcpResult, setMcpResult] = useState<{
    satisfied?: boolean;
    tool?: Partial<Tool> & { server?: string };
    message?: string;
    error?: string;
    [key: string]: unknown;
  } | null>(null);

  const loadTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJSON<{ tools: Tool[] }>('/api/tool-executor/tools');
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
    if (!selectedTool) return;
    setExecuteInputValues(getInitialInputValues(selectedTool.inputSchema || { type: 'object', properties: {} }));
    setExecuteResult(null);
    setExecuteError(null);
    setExecuting(false);
  }, [selectedTool]);

  const addInputSchemaParse = useMemo(() => safeParseJson(addInputSchemaText), [addInputSchemaText]);
  const addConfigSchemaParse = useMemo(() => safeParseJson(addConfigSchemaText), [addConfigSchemaText]);
  const addOutputSchemaParse = useMemo(() => safeParseJson(addOutputSchemaText), [addOutputSchemaText]);
  const addManifestParse = useMemo(() => safeParseJsonAny(addManifestText), [addManifestText]);

  const filteredTools = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tools;
    return tools.filter((t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.type.includes(q));
  }, [tools, search]);

  const resetForm = () => {
    setAddName('');
    setAddDescription('');
    setAddType('code');
    setAddInputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
    setAddConfigSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
    setAddOutputSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
    setAddManifestText('{}');
    setAddSourceCode('');
    setAddLanguage('javascript');
    setAddFiles([]);
    setAddError(null);
    setMcpResult(null);
    setMcpCapability('');
  };

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!addInputSchemaParse.ok) {
      setAddError(`Input schema: ${addInputSchemaParse.error}`);
      return;
    }
    if (!addConfigSchemaParse.ok) {
      setAddError(`Config schema: ${addConfigSchemaParse.error}`);
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
        configSchema: addConfigSchemaParse.value,
        outputSchema: addOutputSchemaParse.value,
      };
      await postJSON('/api/tool-executor/tools', payload);
      resetForm();
      setAddMode(false);
      setSelectedTool(null);
      await loadTools();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add tool');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;
    setAddError(null);

    if (!addInputSchemaParse.ok) {
      setAddError(`Input schema: ${addInputSchemaParse.error}`);
      return;
    }
    if (!addConfigSchemaParse.ok) {
      setAddError(`Config schema: ${addConfigSchemaParse.error}`);
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
        ...selectedTool,
        name: addName,
        description: addDescription,
        type: addType,
        manifest,
        inputSchema: addInputSchemaParse.value,
        configSchema: addConfigSchemaParse.value,
        outputSchema: addOutputSchemaParse.value,
        updatedAt: new Date().toISOString(),
      };
      await putJSON(`/api/tool-executor/tools/${encodeURIComponent(selectedTool.id)}`, payload);
      resetForm();
      setEditMode(false);
      setSelectedTool(null);
      await loadTools();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to update tool');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTool = async () => {
    if (!selectedTool) return;
    if (!confirm(`Delete tool "${selectedTool.name}"? This action cannot be undone.`)) return;
    try {
      await deleteResource(`/api/tool-executor/tools/${encodeURIComponent(selectedTool.id)}`);
      setSelectedTool(null);
      setEditMode(false);
      await loadTools();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete tool');
    }
  };

  const startEdit = () => {
    if (!selectedTool) return;
    setAddName(selectedTool.name);
    setAddDescription(selectedTool.description || '');
    setAddType(selectedTool.type);
    setAddInputSchemaText(JSON.stringify(selectedTool.inputSchema || DEFAULT_SCHEMA, null, 2));
    setAddConfigSchemaText(JSON.stringify(selectedTool.configSchema || selectedTool.manifest?.configSchema || DEFAULT_SCHEMA, null, 2));
    setAddOutputSchemaText(JSON.stringify(selectedTool.outputSchema || DEFAULT_SCHEMA, null, 2));
    setAddManifestText(JSON.stringify(selectedTool.manifest || {}, null, 2));
    setAddSourceCode((selectedTool.manifest?.sourceCode as string) || '');
    setAddLanguage((selectedTool.manifest?.language as string) || 'javascript');
    setAddFiles([]);
    setAddError(null);
    setEditMode(true);
    setAddMode(false);
    setActiveTab('details');
  };

  const handleMcpDiscover = async () => {
    if (!mcpCapability.trim()) return;
    setMcpDiscovering(true);
    setMcpResult(null);
    setAddError(null);
    try {
      const res = await postJSON<{
        satisfied?: boolean;
        tool?: Partial<Tool> & { server?: string };
        message?: string;
        error?: string;
      }>('/api/tool-executor/mcp/discover', { capability: mcpCapability.trim() });
      setMcpResult(res);
      if (res?.tool) {
        const t = res.tool;
        setAddName(t.name || '');
        setAddDescription(t.description || '');
        setAddType('mcp');
        setAddInputSchemaText(JSON.stringify(t.inputSchema || DEFAULT_SCHEMA, null, 2));
        setAddConfigSchemaText(JSON.stringify(t.configSchema || DEFAULT_SCHEMA, null, 2));
        setAddOutputSchemaText(JSON.stringify(t.outputSchema || DEFAULT_SCHEMA, null, 2));
        setAddManifestText(JSON.stringify({ ...(t.manifest || {}), server: t.manifest?.server || t.server }, null, 2));
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'MCP discovery failed');
    } finally {
      setMcpDiscovering(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const response = await fetch(`/api/tool-executor/tools/${selectedTool.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: executeInputValues }),
      });
      const result = await response.json() as ExecutionResult & {
        request?: { missingCredentials?: Array<{ key: string; label?: string }> };
      };
      if (response.status === 428) {
        const missing = result.request?.missingCredentials || [];
        const labels = missing.map((credential) => credential.label || credential.key);
        setExecuteError(
          labels.length > 0
            ? `Missing tool credentials: ${labels.join(', ')}. Configure the listed Vault or environment sources; credentials are not tool inputs.`
            : result.error || 'Required tool credentials are not configured.',
        );
        return;
      }
      if (!response.ok) {
        throw new Error(result.error || `API error: ${response.status} ${response.statusText}`);
      }
      setExecuteResult(result);
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const assignToolToAssistant = async (assistantId: string) => {
    if (!selectedTool || !assistantId) return;
    try {
      const full = await fetchJSON<AssistantWithTools>(`/api/workers/assistants/${encodeURIComponent(assistantId)}`);
      full.tools = full.tools || [];
      const exists = full.tools.find((et) => et.name === selectedTool.id || et.name === selectedTool.name);
      if (exists) {
        alert('Assistant already has this tool');
        return;
      }
      full.tools.push({ name: selectedTool.id, description: selectedTool.description, inputSchema: selectedTool.inputSchema || { type: 'object', properties: {} } });
      await putJSON(`/api/workers/assistants/${encodeURIComponent(assistantId)}`, full);
      alert('Tool assigned to assistant');
      const data = await fetchJSON<{ assistants: AssistantWithTools[] }>('/api/workers/assistants');
      setAssistants(data.assistants || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Assignment failed');
    }
  };

  const removeToolFromAssistant = async (assistantId: string) => {
    if (!selectedTool || !assistantId) return;
    try {
      const full = await fetchJSON<AssistantWithTools>(`/api/workers/assistants/${encodeURIComponent(assistantId)}`);
      full.tools = (full.tools || []).filter((et) => et.name !== selectedTool.id && et.name !== selectedTool.name);
      await putJSON(`/api/workers/assistants/${encodeURIComponent(assistantId)}`, full);
      alert('Tool removed from assistant');
      const data = await fetchJSON<{ assistants: AssistantWithTools[] }>('/api/workers/assistants');
      setAssistants(data.assistants || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Remove failed');
    }
  };

  return (
    <div className="page">
      <h1>Tool Executor</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 1fr) 3fr', alignItems: 'start', gap: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Registered Tools</h3>
            <button
              onClick={() => {
                resetForm();
                setAddMode(true);
                setEditMode(false);
                setSelectedTool(null);
                setActiveTab('details');
              }}
            >
              Add Tool
            </button>
          </div>
          <input
            type="text"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
          />
          {loading ? <p>Loading tools…</p> : (
            <div className="table-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map((t) => (
                    <tr
                      key={t.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedTool(t);
                        setAddMode(false);
                        setEditMode(false);
                        setActiveTab('details');
                      }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: selectedTool?.id === t.id && !addMode && !editMode ? 600 : 400 }}>{t.name}</span>
                          <span className={`badge badge-${t.type}`}>{t.type}</span>
                          {t.isSkill && <span className="badge" style={{ background: '#6366f1' }}>skill</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTools.length === 0 && (
                    <tr><td>No tools found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ borderLeft: '1px solid #334155', minHeight: 400 }}>
          {addMode ? (
            <div>
              <div className="panel-header" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Add Tool</h3>
                <button onClick={() => setAddMode(false)} aria-label="Close add tool" style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>×</button>
              </div>
              <div style={{ marginBottom: 12, padding: 10, background: '#0f172a', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Import from MCP</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Capability/task (e.g. send email)"
                    value={mcpCapability}
                    onChange={(e) => setMcpCapability(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button onClick={handleMcpDiscover} disabled={mcpDiscovering || !mcpCapability.trim()}>
                    {mcpDiscovering ? 'Discovering…' : 'Discover'}
                  </button>
                </div>
                {mcpResult && (
                  <div style={{ marginTop: 8, fontSize: 12, color: mcpResult.satisfied ? '#22c55e' : '#f59e0b' }}>
                    {mcpResult.message || (mcpResult.satisfied ? 'Found tool' : 'Discovery result')}
                  </div>
                )}
              </div>
              <form onSubmit={handleAddTool} className="form">
                <input type="text" placeholder="Name" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                <textarea placeholder="Description" value={addDescription} onChange={(e) => setAddDescription(e.target.value)} required rows={2} />
                <select value={addType} onChange={(e) => setAddType(e.target.value as Tool['type'])}>
                  <option value="code">Code</option>
                  <option value="openapi">OpenAPI</option>
                  <option value="mcp">MCP</option>
                  <option value="native">Native</option>
                  <option value="reasoning">Reasoning</option>
                </select>

                {addType === 'code' && (
                  <>
                    <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                      Language
                      <select value={addLanguage} onChange={(e) => setAddLanguage(e.target.value)}>
                        <option value="javascript">javascript</option>
                        <option value="typescript">typescript</option>
                        <option value="python">python</option>
                        <option value="json">json</option>
                      </select>
                    </label>
                    <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                      Source Code
                      <textarea
                        rows={10}
                        value={addSourceCode}
                        onChange={(e) => setAddSourceCode(e.target.value)}
                        spellCheck={false}
                        placeholder="Paste or write tool code here"
                        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                      />
                    </label>
                    <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                      Upload Files (optional)
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = e.target.files ? Array.from(e.target.files) : [];
                          setAddFiles(files);
                        }}
                        style={{ width: '100%' }}
                      />
                      {addFiles.length > 0 && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>
                          {addFiles.map((f) => f.name).join(', ')}
                        </div>
                      )}
                    </label>
                  </>
                )}

                {addType === 'openapi' && (
                  <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    Manifest (OpenAPI/urlTemplate)
                    <textarea
                      rows={4}
                      value={addManifestText}
                      onChange={(e) => setAddManifestText(e.target.value)}
                      spellCheck={false}
                      placeholder='{"urlTemplate": "...", ...}'
                      style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </label>
                )}

                {addType === 'mcp' && (
                  <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    Manifest (MCP server)
                    <textarea
                      rows={4}
                      value={addManifestText}
                      onChange={(e) => setAddManifestText(e.target.value)}
                      spellCheck={false}
                      placeholder='{"server": "...", ...}'
                      style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </label>
                )}

                {addType === 'native' && (
                  <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    Manifest (Native executor)
                    <textarea
                      rows={4}
                      value={addManifestText}
                      onChange={(e) => setAddManifestText(e.target.value)}
                      spellCheck={false}
                      placeholder='{"executor": "...", "vendor": "..."}'
                      style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                  </label>
                )}

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Manifest (JSON)
                  <textarea
                    rows={4}
                    value={addManifestText}
                    onChange={(e) => setAddManifestText(e.target.value)}
                    spellCheck={false}
                    className={addManifestParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addManifestParse.ok && <span className="field-error">{addManifestParse.error}</span>}
                </label>

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Input Schema (JSON)
                  <textarea
                    rows={6}
                    value={addInputSchemaText}
                    onChange={(e) => setAddInputSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addInputSchemaParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addInputSchemaParse.ok && <span className="field-error">{addInputSchemaParse.error}</span>}
                </label>

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Config Schema (JSON)
                  <textarea
                    rows={6}
                    value={addConfigSchemaText}
                    onChange={(e) => setAddConfigSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addConfigSchemaParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addConfigSchemaParse.ok && <span className="field-error">{addConfigSchemaParse.error}</span>}
                </label>

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Output Schema (JSON)
                  <textarea
                    rows={6}
                    value={addOutputSchemaText}
                    onChange={(e) => setAddOutputSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addOutputSchemaParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addOutputSchemaParse.ok && <span className="field-error">{addOutputSchemaParse.error}</span>}
                </label>

                {addError && <div className="error-banner">{addError}</div>}

                <button type="submit" disabled={adding || !addInputSchemaParse.ok || !addConfigSchemaParse.ok || !addOutputSchemaParse.ok || !addManifestParse.ok}>
                  {adding ? 'Adding…' : 'Add Tool'}
                </button>
              </form>
            </div>
          ) : editMode && selectedTool ? (
            <div>
              <div className="panel-header" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>Edit Tool</h3>
                <button onClick={() => setEditMode(false)} aria-label="Close edit" style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>×</button>
              </div>
              <form onSubmit={handleUpdateTool} className="form">
                <input type="text" placeholder="Name" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                <textarea placeholder="Description" value={addDescription} onChange={(e) => setAddDescription(e.target.value)} required rows={2} />
                <select value={addType} onChange={(e) => setAddType(e.target.value as Tool['type'])}>
                  <option value="code">Code</option>
                  <option value="openapi">OpenAPI</option>
                  <option value="mcp">MCP</option>
                  <option value="native">Native</option>
                  <option value="reasoning">Reasoning</option>
                </select>

                {addType === 'code' && (
                  <>
                    <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                      Language
                      <select value={addLanguage} onChange={(e) => setAddLanguage(e.target.value)}>
                        <option value="javascript">javascript</option>
                        <option value="typescript">typescript</option>
                        <option value="python">python</option>
                        <option value="json">json</option>
                      </select>
                    </label>
                    <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                      Source Code
                      <textarea
                        rows={10}
                        value={addSourceCode}
                        onChange={(e) => setAddSourceCode(e.target.value)}
                        spellCheck={false}
                        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                      />
                    </label>
                  </>
                )}

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Manifest (JSON)
                  <textarea
                    rows={4}
                    value={addManifestText}
                    onChange={(e) => setAddManifestText(e.target.value)}
                    spellCheck={false}
                    className={addManifestParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addManifestParse.ok && <span className="field-error">{addManifestParse.error}</span>}
                </label>

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Input Schema (JSON)
                  <textarea
                    rows={6}
                    value={addInputSchemaText}
                    onChange={(e) => setAddInputSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addInputSchemaParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addInputSchemaParse.ok && <span className="field-error">{addInputSchemaParse.error}</span>}
                </label>

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Config Schema (JSON)
                  <textarea
                    rows={6}
                    value={addConfigSchemaText}
                    onChange={(e) => setAddConfigSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addConfigSchemaParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addConfigSchemaParse.ok && <span className="field-error">{addConfigSchemaParse.error}</span>}
                </label>

                <label className="field-label" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  Output Schema (JSON)
                  <textarea
                    rows={6}
                    value={addOutputSchemaText}
                    onChange={(e) => setAddOutputSchemaText(e.target.value)}
                    spellCheck={false}
                    className={addOutputSchemaParse.ok ? '' : 'invalid'}
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                  {!addOutputSchemaParse.ok && <span className="field-error">{addOutputSchemaParse.error}</span>}
                </label>

                {addError && <div className="error-banner">{addError}</div>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" disabled={adding || !addInputSchemaParse.ok || !addConfigSchemaParse.ok || !addOutputSchemaParse.ok || !addManifestParse.ok}>
                    {adding ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button type="button" onClick={() => setEditMode(false)}>Cancel</button>
                </div>
              </form>
            </div>
          ) : selectedTool ? (
            <div>
              <div className="panel-header" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{selectedTool.name} <span className={`badge badge-${selectedTool.type}`}>{selectedTool.type}</span></h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setActiveTab('test')} style={{ background: '#22c55e' }}>Test</button>
                  <button onClick={startEdit}>Edit</button>
                  <button onClick={handleDeleteTool} style={{ background: '#ef4444' }}>Delete</button>
                  <button onClick={() => setSelectedTool(null)} aria-label="Close tool details" style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>×</button>
                </div>
              </div>
              <p className="muted" style={{ marginBottom: 8 }}>{selectedTool.description || '(no description)'}</p>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8', marginBottom: 12, flexWrap: 'wrap' }}>
                <span>ID: <span className="mono">{selectedTool.id}</span> <button onClick={() => copyToClipboard(selectedTool.id)} style={{ fontSize: 11, padding: '2px 6px' }}>Copy</button></span>
                {selectedTool.createdAt && <span>Created {new Date(selectedTool.createdAt).toLocaleString()}</span>}
                {selectedTool.updatedAt && <span>Updated {new Date(selectedTool.updatedAt).toLocaleString()}</span>}
                {selectedTool.isSkill && <span style={{ color: '#a5b4fc' }}>Skill</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #334155' }}>
                <button onClick={() => setActiveTab('details')} style={{ background: 'transparent', border: 'none', color: activeTab === 'details' ? '#f1f5f9' : '#94a3b8', padding: '6px 0', borderBottom: activeTab === 'details' ? '2px solid #0ea5e9' : 'none' }}>Details</button>
                <button onClick={() => setActiveTab('test')} style={{ background: 'transparent', border: 'none', color: activeTab === 'test' ? '#f1f5f9' : '#94a3b8', padding: '6px 0', borderBottom: activeTab === 'test' ? '2px solid #0ea5e9' : 'none' }}>Test</button>
                <button onClick={() => setActiveTab('assign')} style={{ background: 'transparent', border: 'none', color: activeTab === 'assign' ? '#f1f5f9' : '#94a3b8', padding: '6px 0', borderBottom: activeTab === 'assign' ? '2px solid #0ea5e9' : 'none' }}>Assignments</button>
              </div>

              {activeTab === 'details' && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ marginBottom: 8 }}>Manifest</h4>
                    <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.manifest ?? {}, null, 2)}</pre>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ marginBottom: 8 }}>Input Schema</h4>
                    <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}</pre>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ marginBottom: 8 }}>Config Schema</h4>
                    <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.configSchema ?? selectedTool.manifest?.configSchema ?? {}, null, 2)}</pre>
                  </div>
                  <div>
                    <h4 style={{ marginBottom: 8 }}>Output Schema</h4>
                    <pre className="code-block" style={{ maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(selectedTool.outputSchema ?? {}, null, 2)}</pre>
                  </div>
                  {getToolCredentialSources(selectedTool).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <h4 style={{ marginBottom: 8 }}>Runtime credentials (not tool inputs)</h4>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {getToolCredentialSources(selectedTool).map((credential) => (
                          <li key={credential.key}>{credential.label}: {credential.source}</li>
                        ))}
                      </ul>
                      <p className="muted" style={{ marginBottom: 0 }}>
                        The tool executor resolves these values at runtime. They are not exposed to the Agent or entered in the tool input form.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'test' && (
                <div>
                  <p className="muted" style={{ marginBottom: 12 }}>
                    Test this tool with sample inputs. Any required credentials are resolved separately from configured Vault or environment sources.
                  </p>
                  <SchemaFields
                    schema={selectedTool.inputSchema || { type: 'object', properties: {} }}
                    values={executeInputValues}
                    onChange={(key, value) => {
                      setExecuteInputValues((prev) => ({ ...prev, [key]: value }));
                    }}
                  />
                  <div className="actions" style={{ marginTop: 12 }}>
                    <button onClick={handleExecute} disabled={executing}>
                      {executing ? 'Executing…' : (typeof selectedTool.manifest?.actionLabel === 'string' && selectedTool.manifest.actionLabel.trim()) || 'Run'}
                    </button>
                  </div>
                  {executeError && <div className="error-banner" style={{ marginTop: 12 }}>{executeError}</div>}
                  {executeResult && (
                    <div className="card-inner" style={{ marginTop: 12 }}>
                      <h4>Result</h4>
                      <OutputTemplate outputSchema={selectedTool.outputSchema} result={executeResult.output ?? executeResult} />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'assign' && (
                <div>
                  <p className="muted" style={{ marginBottom: 12 }}>Assign this tool to assistants</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <select
                      value={assignSelection[selectedTool.id] || ''}
                      onChange={(e) => setAssignSelection({ ...assignSelection, [selectedTool.id]: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      <option value="">Select assistant</option>
                      {assistants.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <button onClick={() => assignToolToAssistant(assignSelection[selectedTool.id])}>Assign</button>
                    <button onClick={() => removeToolFromAssistant(assignSelection[selectedTool.id])}>Remove</button>
                  </div>
                  <h4 style={{ marginBottom: 8 }}>Assigned To</h4>
                  {assistants.filter(a => (a.tools || []).some(t => t.name === selectedTool.id || t.name === selectedTool.name)).length === 0 ? (
                    <p className="muted">Not assigned to any assistant</p>
                  ) : (
                    <ul style={{ paddingLeft: 20 }}>
                      {assistants.filter(a => (a.tools || []).some(t => t.name === selectedTool.id || t.name === selectedTool.name)).map(a => (
                        <li key={a.id}>{a.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 16, marginBottom: 8 }}>Select a tool from the list or click Add Tool</div>
              <div style={{ fontSize: 13 }}>Manage, test, and assign tools to assistants</div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Tools;
