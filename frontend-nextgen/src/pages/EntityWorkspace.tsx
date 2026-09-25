import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEntityStore, Entity } from '../stores/entityStore';
import { useFeedStore } from '../stores/feedStore';
import { useAssistantViewStore } from '../stores/assistantViewStore';
import { fetchJSON, postJSON, putJSON } from '../utils/api';
import { OverviewPanel } from '../panels/OverviewPanel';
import { ToolsPanel } from '../panels/ToolsPanel';
import { ConfigurationPanel } from '../panels/ConfigurationPanel';
import { MemoryPanel } from '../panels/MemoryPanel';
import { MissionsPanel } from '../panels/MissionsPanel';
import { HITLPanel } from '../panels/HITLPanel';
import { ArtifactsPanel } from '../panels/ArtifactsPanel';
import { LiveFeedPanel } from '../components/LiveFeedPanel';
import { ToolBinding, HITLApproval, AgentArtifact, ToolCatalogEntry, EntityToolWithManifest } from '../types/workspace';
import { getToolInputSchema, getInitialInputValues } from '../utils/workspaceHelpers';

const EntityWorkspace = () => {
  const { id: entityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { entities, selectedEntity, fetchEntity, selectEntity } = useEntityStore();
  const events = useFeedStore((s) => s.events);
  const connected = useFeedStore((s) => s.connected);

  // Global view state store
  const viewModel = useAssistantViewStore((s) => s.getOrCreate(entityId || ''));
  const setViewModelField = useAssistantViewStore((s) => s.setField);

  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'configuration' | 'memory' | 'missions' | 'hitl' | 'artifacts'>('overview');
  const [missionInput, setMissionInput] = useState('');
  const [running, setRunning] = useState(false);
  const [missionHistory, setMissionHistory] = useState<Array<{ missionId: string; status: string; timestamp: string; output?: string }>>([]);
  const [toolBindings, setToolBindings] = useState<ToolBinding[]>([]);
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; name: string; description: string; inputSchema?: Record<string, unknown>; configSchema?: Record<string, unknown>; manifest?: Record<string, unknown> }>>([]);
  const [availableTools, setAvailableTools] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [hitlApprovals, setHitlApprovals] = useState<HITLApproval[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [memoryContext, setMemoryContext] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agentArtifacts] = useState<AgentArtifact[]>([]);

  const [editingSystemPrompt, setEditingSystemPrompt] = useState('');
  const [knowledgeEntries, setKnowledgeEntries] = useState<Array<{ id: string; title: string; content: string; source?: string }>>([]);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeSource, setKnowledgeSource] = useState('');
  const [transactionGuidanceEntries, setTransactionGuidanceEntries] = useState<string[]>([]);
  const [transactionInput, setTransactionInput] = useState('');
  const [metadataConfig, setMetadataConfig] = useState<Record<string, unknown>>({});

  const entity: Entity | null = selectedEntity || entities.find((e) => e.id === entityId) || null;

  const runInputs = viewModel.runInputs || {};
  const setRunInputs = (updater: ((prev: Record<string, Record<string, unknown>>) => Record<string, Record<string, unknown>>) | Record<string, Record<string, unknown>>) => {
    const next = typeof updater === 'function' ? updater(runInputs) : updater;
    setViewModelField(entityId || '', 'runInputs', next);
  };

  useEffect(() => {
    if (entityId) {
      const found = entities.find((e) => e.id === entityId);
      if (found) {
        selectEntity(found);
      } else {
        fetchEntity(entityId);
      }
    }
  }, [entityId, entities, fetchEntity, selectEntity]);

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
        const lowerOrderIds = new Set<string>();
        for (const t of tools) {
          const lower = (t.manifest?.lowerOrderTools as string[] | undefined) || [];
          for (const id of lower) if (id) lowerOrderIds.add(id);
        }
        const isSkillTool = (tool: ToolCatalogEntry): boolean => {
          if (tool.isSkill === true) return true;
          if (tool.isSkill === false) return false;
          const triggers = tool.triggers as Array<{ kind: string }> || [];
          return triggers.some((t) => t.kind === 'user') && !lowerOrderIds.has(tool.id);
        };
        setAvailableSkills(tools.filter((t) => isSkillTool(t)).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          configSchema: (t.manifest?.configSchema || t.configSchema) as Record<string, unknown> | undefined,
          manifest: t.manifest,
          triggers: t.triggers,
        })));
        setAvailableTools(tools.filter((t) => !isSkillTool(t)).map((t) => ({ id: t.id, name: t.name, description: t.description })));
      })
      .catch(() => {
        setAvailableSkills([]);
        setAvailableTools([]);
      });
  }, []);

  useEffect(() => {
    if (availableSkills.length === 0) return;
    setToolBindings((previous) => {
      const normalized: ToolBinding[] = [];
      let changed = false;
      for (const tool of previous) {
        const legacyName = /application\s*&\s*recruiter\s+outreach\s+manager/i.test(tool.displayName || tool.name);
        const lookupName = legacyName ? 'career-governed-application-outreach-manager' : tool.name;
        const skill = availableSkills.find((candidate) => candidate.id === lookupName || candidate.name === lookupName);
        const name = skill?.id || tool.name;
        const displayName = skill?.name || tool.displayName || '';
        const description = tool.description || skill?.description || '';
        const inputSchema = tool.inputSchema && Object.keys(getToolInputSchema(tool, availableSkills)).length > 0
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

  useEffect(() => {
    setRunInputs((prev) => {
      const next = { ...prev };
      toolBindings.forEach((tb) => {
        if (!next[tb.name]) {
          next[tb.name] = getInitialInputValues(getToolInputSchema(tb, availableSkills));
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

  
  if (!entity) {
    return (
      <div className="page">
        <h1>Entity Workspace</h1>
        <div className="loading">Loading entity...</div>
      </div>
    );
  }

  const entityTabs = ['overview', 'tools', 'configuration', 'memory', 'missions', 'hitl', 'artifacts'] as const;

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
            {tab === 'hitl' ? 'Human-in-Loop' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="entity-content">
        {activeTab === 'overview' && (
          <OverviewPanel
            entity={entity}
            toolBindings={toolBindings}
            availableSkills={availableSkills}
            knowledgeEntries={knowledgeEntries}
            transactionGuidanceEntries={transactionGuidanceEntries}
            memoryContext={memoryContext}
            missionInput={missionInput}
            setMissionInput={setMissionInput}
            running={running}
            runMission={runMission}
            saving={saving}
            saveError={saveError}
            saveConfiguration={saveConfiguration}
          />
        )}

        {activeTab === 'tools' && (
          <ToolsPanel
            toolBindings={toolBindings}
            availableTools={availableTools}
            availableSkills={availableSkills}
            saving={saving}
            saveError={saveError}
            saveConfiguration={saveConfiguration}
            toggleToolBinding={toggleToolBinding}
            removeCustomTool={removeCustomTool}
            scheduleSave={scheduleSave}
            entity={entity}
          />
        )}

        {activeTab === 'configuration' && (
          <ConfigurationPanel
            editingSystemPrompt={editingSystemPrompt}
            setEditingSystemPrompt={setEditingSystemPrompt}
            transactionGuidanceEntries={transactionGuidanceEntries}
            transactionInput={transactionInput}
            setTransactionInput={setTransactionInput}
            addTransactionGuidance={addTransactionGuidance}
            removeTransactionGuidance={removeTransactionGuidance}
            knowledgeEntries={knowledgeEntries}
            knowledgeTitle={knowledgeTitle}
            setKnowledgeTitle={setKnowledgeTitle}
            knowledgeContent={knowledgeContent}
            setKnowledgeContent={setKnowledgeContent}
            knowledgeSource={knowledgeSource}
            setKnowledgeSource={setKnowledgeSource}
            addKnowledgeEntry={addKnowledgeEntry}
            removeKnowledgeEntry={removeKnowledgeEntry}
            metadataConfig={metadataConfig}
            setMetadataConfig={setMetadataConfig}
            saving={saving}
            saveError={saveError}
            saveConfiguration={saveConfiguration}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryPanel
            memoryContext={memoryContext}
            setMemoryContext={setMemoryContext}
          />
        )}

        {activeTab === 'missions' && (
          <MissionsPanel
            missionHistory={missionHistory}
          />
        )}

        {activeTab === 'hitl' && (
          <HITLPanel
            hitlApprovals={hitlApprovals}
            loadingApprovals={loadingApprovals}
            entity={entity}
            handleHITLAction={handleHITLAction}
          />
        )}

        {activeTab === 'artifacts' && (
          <ArtifactsPanel
            agentArtifacts={agentArtifacts}
          />
        )}
      </div>

      <LiveFeedPanel
        events={events}
        connected={connected}
        entityId={entity?.id}
      />
    </div>
  );
};

export default EntityWorkspace;
