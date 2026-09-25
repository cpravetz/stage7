import { ToolBinding } from '../types/workspace';
import { Entity } from '../stores/entityStore';
import OutputTemplate from '../components/OutputTemplate';
import FeedSelector, { buildFeedOptions, type SkillDef, type ProducedFeedEntry } from '../components/FeedSelector';
import { useAssistantViewStore } from '../stores/assistantViewStore';
import { SchemaFields, sfGetSchemaProperties as getSchemaProperties } from '../components/SchemaFields';
import { getToolInputSchema, getToolConfigSchema, getToolDisplayName } from '../utils/workspaceHelpers';

interface OverviewPanelProps {
  entity: Entity;
  toolBindings: ToolBinding[];
  availableSkills: Array<{ id: string; key?: string; name: string; description: string; configSchema?: Record<string, unknown>; inputSchema?: Record<string, unknown>; manifest?: Record<string, unknown>; triggers?: Array<Record<string, unknown>>; outputSchema?: Record<string, unknown> }>;
  knowledgeEntries: Array<{ id: string; title: string; content: string; source?: string }>;
  transactionGuidanceEntries: string[];
  memoryContext: Record<string, unknown>;
  missionInput: string;
  setMissionInput: (value: string) => void;
  running: boolean;
  runMission: () => void;
  saving: boolean;
  saveError: string | null;
  saveConfiguration: () => void;
}

export const OverviewPanel = ({
  entity,
  toolBindings,
  availableSkills,
  knowledgeEntries,
  transactionGuidanceEntries,
  memoryContext,
  missionInput,
  setMissionInput,
  running,
  runMission,
  saving,
  saveError,
  saveConfiguration,
}: OverviewPanelProps) => {
  const enabledTools = toolBindings.filter((t) => t.enabled);

  const enabledSkills: SkillDef[] = enabledTools.map((tool) => {
    const skill = availableSkills.find((s) => s.id === tool.name || s.name === tool.name);
    return {
      id: skill?.id ?? tool.name,
      key: skill?.key ?? tool.name,
      name: skill?.name ?? tool.displayName ?? tool.name,
      description: skill?.description ?? tool.description,
      produces: (skill?.manifest?.produces as ProducedFeedEntry[]) ?? [],
      outputSchema: skill?.outputSchema ?? tool.inputSchema,
      inputSchema: tool.inputSchema,
      configSchema: tool.configSchema,
      manifest: skill?.manifest,
      triggers: skill?.triggers,
    } as SkillDef;
  });

  const getDisplayName = (tool: ToolBinding) => getToolDisplayName(tool, availableSkills);
  const getConfigSchema = (tool: ToolBinding) => getToolConfigSchema(tool, availableSkills);
  const getInputSchema = (tool: ToolBinding) => getToolInputSchema(tool, availableSkills);

  const view = useAssistantViewStore((s) => s.getOrCreate(entity.id));
  const runInputs = view.runInputs;
  const runResults = view.runResults;
  const runningMap = view.runningMap;
  const setField = useAssistantViewStore((s) => s.setField);

  const isUserTriggered = (tool: ToolBinding): boolean => {
    const skill = availableSkills.find((s) => s.id === tool.name || s.name === tool.name);
    const skillTriggers = skill?.triggers as Array<{ kind: string }> | undefined;
    return Array.isArray(skillTriggers) && skillTriggers.some((t) => t.kind === 'user');
  };

  const feedOptions = buildFeedOptions(availableSkills as SkillDef[], enabledSkills);

  const handleRunTool = async (tool: ToolBinding) => {
    setField(entity.id, 'runningMap', { ...runningMap, [tool.name]: true });
    try {
      const args = runInputs[tool.name] || {};
      const res = await fetch(`/api/workers/assistants/${encodeURIComponent(entity.id)}/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tool.name, arguments: args }),
      });
      const resultText = await res.text();
      setField(entity.id, 'runResults', { ...runResults, [tool.name]: resultText });
    } catch (err) {
      setField(entity.id, 'runResults', { ...runResults, [tool.name]: String(err instanceof Error ? err.message : err) });
    } finally {
      setField(entity.id, 'runningMap', { ...runningMap, [tool.name]: false });
    }
  };

  return (
    <div className="grid two-col">
      <div className="card">
        <h3>Persona</h3>
        <p>{entity.description}</p>
        <div className="meta-grid">
          <div><strong>Skills Bound:</strong> {enabledTools.length}</div>
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
            Mission will use {enabledTools.length} bound tools
            · {knowledgeEntries.length} knowledge entries · {transactionGuidanceEntries.length} guidance rules
          </p>
          {saveError && <div className="error-banner">{saveError}</div>}
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h3>Skills</h3>
        {enabledTools.length === 0 ? (
          <p>No skills bound to this assistant.</p>
        ) : (
          enabledTools
            .map((tool) => {
              const inputSchema = getInputSchema(tool);
              const configSchema = getConfigSchema(tool);
              const skill = availableSkills.find((s) => s.id === tool.name || s.name === tool.name);
              const outputSchema = skill?.outputSchema;
              const hasSettings = Object.keys(getSchemaProperties(configSchema)).length > 0;
              const hasInputs = Object.keys(getSchemaProperties(inputSchema)).length > 0;
              const toolRunInputs = runInputs[tool.name] || {};
              const toolRunResult = runResults[tool.name];
              const toolRunning = runningMap[tool.name];
              const userTriggered = isUserTriggered(tool);
              const shouldShowInputUX = hasInputs && userTriggered;
              const hasOutput = !!toolRunResult;

              // Only show skill if it has user-facing inputs (and is user-triggered), or has output to display
              if (!shouldShowInputUX && !hasOutput) {
                return null;
              }

              return (
                <div key={tool.name} className="card skill-panel">
                  <h4>{getDisplayName(tool)}</h4>
                  <div className="skill-body">
                    {hasSettings && (
                      <div className="skill-settings-summary">
                        <button className="secondary" onClick={() => useAssistantViewStore.getState().setField(entity.id, 'activeTab', 'tools')}>
                          Settings
                        </button>
                      </div>
                    )}
                    <div className="skill-runtime">
                      {shouldShowInputUX && (
                        <div>
                          {hasInputs && (
                            <SchemaFields
                              schema={inputSchema}
                              values={toolRunInputs}
                              onChange={(key, value) => setField(entity.id, 'runInputs', {
                                ...runInputs,
                                [tool.name]: { ...(runInputs[tool.name] || {}), [key]: value },
                              })}
                              namePrefix={`overview-${tool.name}`}
                            />
                          )}
                          {skill?.manifest?.consumes && Array.isArray(skill.manifest.consumes) && skill.manifest.consumes.length > 0 ? (
                            <FeedSelector
                              consumes={(skill.manifest.consumes as string[])}
                              availableFeeds={feedOptions}
                              value={typeof toolRunInputs._feed === 'string' ? toolRunInputs._feed : ''}
                              onChange={(feedKey) => setField(entity.id, 'runInputs', {
                                ...runInputs,
                                [tool.name]: { ...(toolRunInputs as Record<string, unknown>), _feed: feedKey },
                              })}
                              label="Data Feed"
                              placeholder="Select a feed"
                            />
                          ) : null}
                          <div className="skill-run-actions">
                            {userTriggered && (
                              <button
                                type="button"
                                onClick={() => handleRunTool(tool)}
                                disabled={toolRunning}
                              >
                                {toolRunning ? 'Running…' : 'Run'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {hasOutput && (
                        <OutputTemplate outputSchema={outputSchema} result={toolRunResult} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
            .filter(Boolean)
        )}
      </div>
    </div>
  );
};
