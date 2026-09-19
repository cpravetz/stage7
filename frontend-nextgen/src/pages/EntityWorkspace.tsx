import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEntityStore, Entity, type EntityTool } from '../stores/entityStore';
import { useFeedStore } from '../stores/feedStore';
import { fetchJSON, postJSON, putJSON } from '../utils/api';

interface ToolBinding {
  name: string;
  displayName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  config?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
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

type SchemaRecord = Record<string, unknown>;

type EnumOption = string | number | boolean | { value: unknown; label?: unknown } | Record<string, unknown>;

interface AgentArtifact {
  id?: string;
  name?: string;
  type?: string;
  content?: string;
  url?: string;
}

interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
  isSkill?: boolean;
  inputSchema?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
}

interface EntityToolWithManifest extends EntityTool {
  manifest?: Record<string, unknown>;
}

const formatTextValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const formatNumberValue = (value: unknown): number | '' => (
  typeof value === 'number' ? value : ''
);

// Tool execution can fail before returning JSON (proxy errors, HTML error pages, empty bodies),
// so read the body as text first rather than assuming res.json() will succeed.
const parseToolExecuteResponse = async (res: Response): Promise<string> => {
  const raw = await res.text();
  if (!raw) {
    return `Error: server returned an empty response (status ${res.status})`;
  }
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    const preview = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
    return `Error: server returned a non-JSON response (status ${res.status}):\n${preview}`;
  }
};

const humanizeKey = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const acronyms = new Set(['API', 'URL', 'ID', 'JSON', 'HTML', 'SEO', 'CRM', 'HTTP', 'UUID', 'CSV', 'PDF', 'XML', 'RSS', 'SSL', 'TLS']);
  return words.map((word) => {
    const upper = word.toUpperCase();
    return acronyms.has(upper) ? upper : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

const getSchemaProperties = (schema?: SchemaRecord): Record<string, SchemaRecord> => {
  const properties = schema?.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, SchemaRecord>
    : {};
};


// Internal field to user-facing UI label mapping (recommendation #4).
// Internal fields are retained for API use but displayed with friendly labels.
const FIELD_LABEL_MAP: Record<string, string> = {
  operation: 'Action',
  provider: 'Service Provider',
  endpointUrl: 'Connect Service',
  baseUrl: 'Connect Service',
  apiKey: 'API Key',
  dryRun: 'Preview only',
  confirmation: 'Approve & send',
};

const getSchemaTitle = (key: string, schema?: SchemaRecord): string => (
  String(schema?.title || schema?.label || schema?.['x-label'] || FIELD_LABEL_MAP[key] || humanizeKey(key))
);

const getSchemaDescription = (schema?: SchemaRecord): string => (
  String(schema?.description || schema?.hint || '')
);

const isLongTextSchema = (key: string, schema?: SchemaRecord): boolean => (
  schema?.multiline === true ||
  schema?.format === 'long-text' ||
  schema?.format === 'textarea' ||
  /message|prompt|content|description|instructions|text|body|query|keywords|topic|resume|job/i.test(key) ||
  /prompt|message|content|instructions/i.test(getSchemaDescription(schema))
);

// A file-upload field is an object schema shaped like { name, mimeType, content } —
// content should come from a picked file, not be hand-typed as base64/text.
const isFileUploadSchema = (schema?: SchemaRecord): boolean => {
  if (!schema || schema.type !== 'object') return false;
  const props = getSchemaProperties(schema);
  return Boolean(props.name && props.mimeType && props.content);
};

const readFileAsUploadValue = (file: File): Promise<{ name: string; mimeType: string; content: string }> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const isText = /^text\/|json|xml/.test(file.type) || /\.(md|txt)$/i.test(file.name);
      const content = isText ? result : result.split(',')[1] || '';
      resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', content });
    };
    if (/^text\/|json|xml/.test(file.type) || /\.(md|txt)$/i.test(file.name)) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  })
);

const getInitialInputValues = (schema?: SchemaRecord): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(getSchemaProperties(schema))) {
    const field = raw || {};
    if (field.default !== undefined) {
      values[key] = field.default;
    } else if (field.type === 'boolean') {
      values[key] = false;
    } else if (field.type === 'number' || field.type === 'integer') {
      values[key] = '';
    } else if (field.type === 'array') {
      values[key] = [];
    } else if (field.type === 'object' && getSchemaProperties(field as SchemaRecord)) {
      values[key] = getInitialInputValues(field as SchemaRecord);
    } else {
      values[key] = '';
    }
  }
  return values;
};

interface SchemaFieldsProps {
  schema: SchemaRecord;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  namePrefix?: string;
}

const SchemaFields = ({ schema, values, onChange, namePrefix = 'skill-field' }: SchemaFieldsProps) => {
  const properties = getSchemaProperties(schema);
  if (Object.keys(properties).length === 0) return null;

  return (
    <div className="skill-fields">
      {Object.entries(properties).map(([key, rawSchema]) => {
        const fieldSchema = (rawSchema || {}) as SchemaRecord;
        const value = values[key];
        const label = getSchemaTitle(key, fieldSchema);
        const description = getSchemaDescription(fieldSchema);
        const fieldId = `${namePrefix}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const required = Array.isArray(schema.required) && (schema.required as unknown[]).includes(key);
        const controlClass = `skill-control${isLongTextSchema(key, fieldSchema) ? ' skill-control-long' : ''}`;

        let control: ReactNode;
        if (fieldSchema.type === 'boolean') {
          control = (
            <input
              id={fieldId}
              className="skill-checkbox"
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(key, e.target.checked)}
            />
          );
        } else if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') {
          control = (
            <input
              id={fieldId}
              className={controlClass}
              type="number"
              value={formatNumberValue(value)}
              onChange={(e) => onChange(key, e.target.value === '' ? '' : Number(e.target.value))}
            />
          );
        } else if (Array.isArray(fieldSchema.enum)) {
          control = (
            <select
              id={fieldId}
              className={controlClass}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(key, e.target.value)}
            >
              <option value="">Select an option</option>
              {(fieldSchema.enum as EnumOption[]).map((option) => {
                const optionValue = typeof option === 'object' && option !== null ? (option as Record<string, unknown>).value : option;
                const optionLabel = typeof option === 'object' && option !== null ? (option as Record<string, unknown>).label ?? option : option;
                return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>;
              })}
            </select>
          );
        } else if (fieldSchema.type === 'array') {
          const arrayValue = Array.isArray(value) ? value : [];
          control = (
            <input
              id={fieldId}
              className={controlClass}
              type="text"
              value={arrayValue.map((item) => formatTextValue(item)).join(', ')}
              onChange={(e) => onChange(key, e.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
            />
          );
        } else if (isFileUploadSchema(fieldSchema)) {
          const fileValue = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
          control = (
            <div className="skill-file-upload">
              <input
                id={fieldId}
                className={controlClass}
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  onChange(key, await readFileAsUploadValue(file));
                }}
              />
              {fileValue?.name ? <span className="skill-file-name">Selected: {String(fileValue.name)}</span> : null}
            </div>
          );
        } else if (fieldSchema.type === 'object' && getSchemaProperties(fieldSchema)) {
          const nestedValues = value && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
          control = (
            <div className="skill-nested-fields">
              <SchemaFields
                schema={fieldSchema}
                values={nestedValues}
                onChange={(nestedKey, nestedValue) => onChange(key, { ...nestedValues, [nestedKey]: nestedValue })}
                namePrefix={`${namePrefix}-${key}`}
              />
            </div>
          );
        } else if (fieldSchema.type === 'string' && isLongTextSchema(key, fieldSchema)) {
          control = (
            <textarea
              id={fieldId}
              className={controlClass}
              rows={3}
              value={formatTextValue(value)}
              onChange={(e) => onChange(key, e.target.value)}
            />
          );
        } else {
          control = (
            <input
              id={fieldId}
              className={controlClass}
              type="text"
              value={formatTextValue(value)}
              onChange={(e) => onChange(key, e.target.value)}
            />
          );
        }

        return (
          <div key={key} className="skill-field">
            <div className="skill-field-heading">
              <label htmlFor={fieldId}>{label}{required ? ' *' : ''}</label>
              {description && <span className="skill-field-description">{description}</span>}
            </div>
            {control}
          </div>
        );
      })}
    </div>
  );
};

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
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; name: string; description: string; inputSchema?: Record<string, unknown>; configSchema?: Record<string, unknown> }>>([]);
  const [availableTools, setAvailableTools] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [hitlApprovals, setHitlApprovals] = useState<HITLApproval[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [memoryContext, setMemoryContext] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agentArtifacts, setAgentArtifacts] = useState<AgentArtifact[]>([]);


  const [editingSystemPrompt, setEditingSystemPrompt] = useState('');
  const [knowledgeEntries, setKnowledgeEntries] = useState<Array<{ id: string; title: string; content: string; source?: string }>>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeSource, setKnowledgeSource] = useState('');
  const [transactionGuidanceEntries, setTransactionGuidanceEntries] = useState<string[]>([]);
  const [transactionInput, setTransactionInput] = useState('');
  const [metadataConfig, setMetadataConfig] = useState<Record<string, unknown>>({});
  const [runTool, setRunTool] = useState<ToolBinding | null>(null);

  const [runResult, setRunResult] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState(false);

  const entity: Entity | null = selectedEntity || entities.find((e) => e.id === id) || null;

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
        (selectedEntity.tools || []).map((t) => {
          const tool = typeof t === 'string'
            ? null
            : (t as EntityToolWithManifest);
          return {
            name: typeof t === 'string' ? t : t.name,
            displayName: tool?.displayName,
            description: typeof t === 'string' ? '' : t.description || '',
            inputSchema: typeof t === 'string' ? {} : t.inputSchema || {},
            configSchema: typeof t === 'string'
              ? undefined
              : (tool?.configSchema || tool?.manifest?.configSchema) as Record<string, unknown> | undefined,
            enabled: true,
            config: typeof t === 'string' ? {} : (t.config || {}),
          };
        })
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
    fetchJSON<{ tools: ToolCatalogEntry[] }>('/api/tool-executor/tools')
      .then((data) => {
        const tools = data.tools || [];
        setAvailableSkills(tools.filter((t) => t.isSkill).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          configSchema: (t.manifest?.configSchema || t.configSchema) as Record<string, unknown> | undefined,
        })));
        setAvailableTools(tools.filter((t) => !t.isSkill).map((t) => ({ id: t.id, name: t.name, description: t.description })));
      })
      .catch(() => {
        setAvailableSkills([]);
        setAvailableTools([]);
      });
  }, []);

  const getSkillByBindingName = (name: string) => availableSkills.find((skill) => skill.id === name || skill.name === name);

  const getToolDisplayName = (tool: ToolBinding): string => (
    tool.displayName || getSkillByBindingName(tool.name)?.name || humanizeKey(tool.name)
  );

  const getToolDescription = (tool: ToolBinding): string => (
    tool.description || getSkillByBindingName(tool.name)?.description || ''
  );

  const getToolConfigSchema = (tool: ToolBinding): SchemaRecord | undefined => (
    tool.configSchema || getSkillByBindingName(tool.name)?.configSchema
  );

  const getToolInputSchema = (tool: ToolBinding): SchemaRecord => {
    const schema = tool.inputSchema || getSkillByBindingName(tool.name)?.inputSchema || { type: 'object', properties: {} };
    return Object.keys(getSchemaProperties(schema)).length > 0 ? schema : { type: 'object', properties: {} };
  };

  useEffect(() => {
    if (availableSkills.length === 0) return;
    setToolBindings((previous) => {
      const normalized: ToolBinding[] = [];
      let changed = false;
      for (const tool of previous) {
        const skill = availableSkills.find((candidate) => candidate.id === tool.name || candidate.name === tool.name);
        const name = skill?.id || tool.name;
        const displayName = skill?.name || tool.displayName || '';
        const description = tool.description || skill?.description || '';
        const inputSchema = tool.inputSchema && Object.keys(getSchemaProperties(tool.inputSchema)).length > 0
          ? tool.inputSchema
          : skill?.inputSchema || tool.inputSchema || { type: 'object', properties: {} };
        const configSchema = tool.configSchema || skill?.configSchema;
        if (name !== tool.name || displayName !== tool.displayName || description !== tool.description || inputSchema !== tool.inputSchema || configSchema !== tool.configSchema) {
          changed = true;
        }
        if (!normalized.some((existing) => existing.name === name)) {
          normalized.push({ ...tool, name, displayName, description, inputSchema, configSchema });
        } else {
          changed = true;
        }
      }
      return changed ? normalized : previous;
    });
  }, [availableSkills, toolBindings]);
  const [runInputs, setRunInputs] = useState<Record<string, Record<string, unknown>>>({});
  const [runResults, setRunResults] = useState<Record<string, string>>({});
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRunInputs((prev) => {
      const next = { ...prev };
      toolBindings.forEach((tb) => {
        if (!next[tb.name]) {
          next[tb.name] = getInitialInputValues(getToolInputSchema(tb));
        }
      });
      return next;
    });
  }, [toolBindings]);

  // Agents are ephemeral and mission-scoped; redirect to Missions if an agent entity is requested.
  useEffect(() => {
    if (entity && entity.type === 'agent') {
      navigate('/missions');
    }
  }, [entity, navigate]);

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
    setToolBindings((prev) => {
      const nb = prev.map((t) => (t.name === toolName ? { ...t, enabled: !t.enabled } : t));
      scheduleSave(nb);
      return nb;
    });
  };

  const removeCustomTool = (toolName: string) => {
    setToolBindings((prev) => {
      const nb = prev.filter((t) => t.name !== toolName);
      scheduleSave(nb);
      return nb;
    });
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
    // DEPRECATED: replaced by saveConfigurationWithBindings(bindings)
    return saveConfigurationWithBindings();
  };

  const saveConfigurationWithBindings = async (bindings?: ToolBinding[]) => {
    if (!entity) return;
    const tbs = bindings || toolBindings;
    setSaving(true);
    setSaveError(null);
    try {
      const updates = {
        systemPrompt: editingSystemPrompt,
        knowledge: knowledgeEntries,
        transactionGuidance: transactionGuidanceEntries,
        tools: tbs.filter((t) => t.enabled).map((t) => ({
          name: t.name,
          displayName: t.displayName,
          description: t.description,
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
          config: t.config || {},
          configSchema: t.configSchema,
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

  // Debounced save helper: schedule save for updated bindings
  const saveTimerRef = useRef<number | null>(null);
  const scheduleSave = (bindings?: ToolBinding[]) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveConfigurationWithBindings(bindings).catch(() => {});
      saveTimerRef.current = null;
    }, 700) as unknown as number;
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

  const entityTabs =
    entity.type === 'assistant'
      ? (['overview', 'tools', 'configuration', 'memory', 'missions', 'hitl', 'artifacts'] as const)
      : (['overview', 'tools', 'memory', 'missions', 'hitl', 'artifacts'] as const);

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
        {entityTabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'hitl' ? 'Human-in-Loop' : tab === 'tools' ? 'Skills' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
               <div><strong>Skills Bound:</strong> {toolBindings.filter((t) => t.enabled).length}</div>
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
            {/* Bound Skills Panels (persistent settings + runtime inputs/results) */}
            <div className="card">
              <h3>Skills</h3>
              {toolBindings.filter((t) => t.enabled).length === 0 ? (
                <p>No skills bound to this assistant.</p>
              ) : (
                toolBindings.filter((t) => t.enabled).map((tool) => {
                  const inputSchema = getToolInputSchema(tool);
                  const configSchema = getToolConfigSchema(tool);
                  const hasSettings = Object.keys(getSchemaProperties(configSchema)).length > 0;
                  const hasInputs = Object.keys(getSchemaProperties(inputSchema)).length > 0;
                  return (
                    <div key={tool.name} className="card skill-panel">
                      <h4>{getToolDisplayName(tool)}</h4>
                      <div className="skill-body">
                        {hasSettings && (
                          <div className="skill-settings-summary">
                            <button className="secondary" onClick={() => setActiveTab('tools')}>⚙️</button>
                          </div>
                        )}
                        <div className="skill-runtime">
                          {hasInputs ? (
                            <div>
                              <SchemaFields
                                schema={inputSchema}
                                values={runInputs[tool.name] || {}}
                                onChange={(key, value) => setRunInputs((prev) => ({
                                  ...prev,
                                  [tool.name]: { ...(prev[tool.name] || {}), [key]: value },
                                }))}
                                namePrefix={`overview-${tool.name}`}
                              />
                              <div className="skill-run-actions">
                                <button onClick={async () => {
                                  setRunningMap((m) => ({ ...m, [tool.name]: true }));
                                  try {
                                    const args = runInputs[tool.name] || {};
                                    const res = await fetch(`/api/workers/assistants/${encodeURIComponent(entity!.id)}/tools/execute`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ name: tool.name, arguments: args }),
                                    });
                                    const resultText = await parseToolExecuteResponse(res);
                                    setRunResults((r) => ({ ...r, [tool.name]: resultText }));
                                  } catch (err) {
                                    setRunResults((r) => ({ ...r, [tool.name]: String(err instanceof Error ? err.message : err) }));
                                  } finally {
                                    setRunningMap((m) => ({ ...m, [tool.name]: false }));
                                  }
                                }} disabled={Boolean(runningMap[tool.name])}>{runningMap[tool.name] ? 'Running…' : 'Run'}</button>
                              </div>
                              {runResults[tool.name] && (
                                <div className="skill-result">
                                  <h6>Last result</h6>
                                  <pre className="code-block">{runResults[tool.name]}</pre>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p className="muted">No inputs are defined for this skill.</p>
                              <div className="skill-run-actions">
                                <button onClick={async () => {
                                  setRunningMap((m) => ({ ...m, [tool.name]: true }));
                                  try {
                                    const res = await fetch(`/api/workers/assistants/${encodeURIComponent(entity!.id)}/tools/execute`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ name: tool.name, arguments: {} }),
                                    });
                                    const resultText = await parseToolExecuteResponse(res);
                                    setRunResults((r) => ({ ...r, [tool.name]: resultText }));
                                  } catch (err) {
                                    setRunResults((r) => ({ ...r, [tool.name]: String(err instanceof Error ? err.message : err) }));
                                  } finally {
                                    setRunningMap((m) => ({ ...m, [tool.name]: false }));
                                  }
                                }} disabled={Boolean(runningMap[tool.name])}>{runningMap[tool.name] ? 'Running…' : 'Run'}</button>
                              </div>
                              {runResults[tool.name] && <pre className="code-block">{runResults[tool.name]}</pre>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {activeTab === 'tools' && (
           <div className="grid two-col">
             <div className="card">
               <h3>Bound Skills</h3>
               {toolBindings.length === 0 ? (
                 <p>No skills bound to this assistant.</p>
               ) : (
                  <ul className="tool-binding-list">
                    {toolBindings.map((tool) => {
                      const configSchema = getToolConfigSchema(tool);
                      const hasSettings = Object.keys(getSchemaProperties(configSchema)).length > 0;
                      return (
                        <li key={tool.name} className={tool.enabled ? 'enabled' : 'disabled'}>
                          <div className="tool-info">
                            <strong>{getToolDisplayName(tool)}</strong>
                            <p>{getToolDescription(tool)}</p>
                            <div className="skill-settings">
                              {hasSettings ? (
                                <SchemaFields
                                  schema={configSchema as SchemaRecord}
                                  values={tool.config || {}}
                                  onChange={(key, value) => setToolBindings((prev) => {
                                    const nb = prev.map((tb) => tb.name === tool.name
                                      ? { ...tb, config: { ...(tb.config || {}), [key]: value } }
                                      : tb);
                                    scheduleSave(nb);
                                    return nb;
                                  })}
                                  namePrefix={`settings-${tool.name}`}
                                />
                              ) : (
                                <p className="muted">This Skill has no settings.</p>
                              )}
                            </div>
                            <div className="skill-run-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  const inputSchema = getToolInputSchema(tool);
                                  setRunInputs((prev) => ({
                                    ...prev,
                                    [tool.name]: prev[tool.name] || getInitialInputValues(inputSchema),
                                  }));
                                  setRunResult(null);
                                  setRunTool(tool);
                                }}
                              >Run Skill</button>
                            </div>
                          </div>
                          <div className="tool-actions">
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
                              title={`Remove ${getToolDisplayName(tool)}`}
                            >
                              &times;
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
               )}

              {runTool && (
                <div className="modal-backdrop" onClick={() => { if (!runningTool) setRunTool(null); }}>
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <div className="panel-header">
                      <h3>Run: {getToolDisplayName(runTool)}</h3>
                      <button onClick={() => { if (!runningTool) setRunTool(null); }}>Close</button>
                    </div>
                    <p className="muted">{getToolDescription(runTool)}</p>

                    <div className="skill-modal-fields">
                      {Object.keys(getSchemaProperties(getToolInputSchema(runTool))).length > 0 ? (
                        <SchemaFields
                          schema={getToolInputSchema(runTool)}
                          values={runInputs[runTool.name] || {}}
                          onChange={(key, value) => setRunInputs((prev) => ({
                            ...prev,
                            [runTool.name]: { ...(prev[runTool.name] || {}), [key]: value },
                          }))}
                          namePrefix={`run-${runTool.name}`}
                        />
                      ) : (
                        <p className="muted">No inputs are defined for this skill.</p>
                      )}
                    </div>

                    <div className="actions">
                      <button
                        onClick={async () => {
                          if (!entity || !runTool) return;
                          const parsed = runInputs[runTool.name] || {};
                          setRunningTool(true);
                          setRunResult(null);
                          try {
                            const res = await fetch(`/api/workers/assistants/${encodeURIComponent(entity.id)}/tools/execute`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: runTool.name, arguments: parsed }),
                            });
                            const data = await parseToolExecuteResponse(res);
                            setRunResult(data);
                          } catch (err) {
                            setRunResult(err instanceof Error ? err.message : String(err));
                          } finally {
                            setRunningTool(false);
                          }
                        }}
                        disabled={runningTool}
                      >{runningTool ? 'Running…' : 'Run'}</button>
                      <button onClick={() => { if (!runningTool) setRunTool(null); }} disabled={runningTool}>Cancel</button>
                    </div>

                    {runResult && (
                      <div className="card-inner" style={{ marginTop: 12 }}>
                        <h4>Result</h4>
                        <pre className="code-block">{runResult}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
               <div className="button-row" style={{ marginTop: 12 }}>
                 <button onClick={saveConfiguration} disabled={saving}>
                   {saving ? 'Saving…' : 'Save Tool Bindings'}
                 </button>
               </div>
               {saveError && <div className="error-banner">{saveError}</div>}
             </div>
              <div className="card">
                <h3>Available General Tools</h3>
                <p className="hint">Legacy Stage7 tools registered in the platform (not bindable to assistants).</p>
                <ul className="available-tools-list">
                  {availableTools.map((tool) => (
                    <li key={tool.id}>
                      <strong>{tool.name}</strong>
                      <p>{tool.description}</p>
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
                 <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                   {Object.entries(metadataConfig).length === 0 ? (
                     <p className="muted">No metadata configured.</p>
                   ) : (
                     <div style={{ display: 'grid', gap: 8 }}>
                       {Object.entries(metadataConfig).map(([k, v]) => (
                         <div key={k} className="input-row">
                           <label style={{ width: 160 }}>{k}</label>
                           <input type="text" value={String(v ?? '')} onChange={(e) => setMetadataConfig((prev) => ({ ...prev, [k]: e.target.value }))} />
                           <button className="remove-btn" onClick={() => { const n = { ...metadataConfig }; delete n[k]; setMetadataConfig(n); }}>&times;</button>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
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
            {Object.keys(memoryContext).length === 0 ? (
              <p className="muted">No memory persisted.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(memoryContext).map(([k, v]) => (
                  <div key={k} className="input-row">
                    <label style={{ width: 160 }}>{k}</label>
                    <div style={{ flex: 1 }}>{String(typeof v === 'object' ? JSON.stringify(v) : v)}</div>
                  </div>
                ))}
              </div>
            )}
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
            {agentArtifacts.length === 0 ? (
              <div>
                <p>No artifacts generated yet.</p>
              </div>
            ) : (
              <ul className="artifact-list">
                {agentArtifacts.map((a) => (
                  <li key={a.id || a.name} className="artifact-item produced">
                    <div className="artifact-header">
                      <strong>{a.name || a.id}</strong>
                      {a.type && <span className="badge">{a.type}</span>}
                    </div>
                    {(a.content || a.url) && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => {
                          if (a.url) {
                            window.open(a.url, '_blank');
                          } else {
                            const blob = new Blob([a.content || ''], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            window.open(url, '_blank');
                          }
                        }}>Open</button>
                        <button onClick={() => {
                          if (a.url) {
                            const aEl = document.createElement('a');
                            aEl.href = a.url;
                            aEl.target = '_blank';
                            document.body.appendChild(aEl);
                            aEl.click();
                            aEl.remove();
                          } else {
                            const blob = new Blob([a.content || ''], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const aEl = document.createElement('a');
                            aEl.href = url;
                            aEl.download = (a.name || a.id || 'artifact') + '.txt';
                            document.body.appendChild(aEl);
                            aEl.click();
                            aEl.remove();
                            URL.revokeObjectURL(url);
                          }
                        }}>Download</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 8 }}>
              <p className="muted">Artifact upload for entities is handled via Mission UI and the Artifacts page.</p>
            </div>
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
