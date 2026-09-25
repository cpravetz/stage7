import { ToolBinding } from '../types/workspace';
import { SchemaFields } from '../components/SchemaFields';
import { FeedSelector, buildFeedOptions, type FeedOption } from '../components/FeedSelector';
import { getToolInputSchema, getToolConfigSchema, getToolDisplayName, getToolDescription, getSchemaProperties } from '../utils/workspaceHelpers';

interface ToolsPanelProps {
  toolBindings: ToolBinding[];
  availableTools: Array<{ id: string; name: string; description: string }>;
  availableSkills: Array<{ id: string; name: string; description: string; configSchema?: Record<string, unknown>; inputSchema?: Record<string, unknown>; manifest?: Record<string, unknown> }>;
  saving: boolean;
  saveError: string | null;
  saveConfiguration: () => void;
  toggleToolBinding: (toolName: string) => void;
  removeCustomTool: (toolName: string) => void;
  scheduleSave: (bindings?: ToolBinding[]) => void;
  entity: { id: string } | null;
}

export const ToolsPanel = ({
  toolBindings,
  availableTools,
  availableSkills,
  saving,
  saveError,
  saveConfiguration,
  toggleToolBinding,
  removeCustomTool,
  scheduleSave,
  entity,
}: ToolsPanelProps) => {
  const getDisplayName = (tool: ToolBinding) => getToolDisplayName(tool, availableSkills);
  const getDescription = (tool: ToolBinding) => getToolDescription(tool, availableSkills);
  const getConfigSchema = (tool: ToolBinding) => getToolConfigSchema(tool, availableSkills);
  const getInputSchema = (tool: ToolBinding) => getToolInputSchema(tool, availableSkills);

  const feedOptions = buildFeedOptions(availableSkills, toolBindings);

  return (
    <div className="grid two-col">
      <div className="card">
        <h3>Bound Skills</h3>
        {toolBindings.length === 0 ? (
          <p>No skills bound to this assistant.</p>
        ) : (
          <ul className="tool-binding-list">
            {toolBindings.map((tool) => {
              const configSchema = getConfigSchema(tool);
              const hasSettings = Object.keys(getSchemaProperties(configSchema)).length > 0;
              const skill = availableSkills.find(s => s.id === tool.name || s.name === tool.name);
              const consumes = (skill?.manifest?.consumes as string[] | undefined) || [];

              return (
                <li key={tool.name} className={tool.enabled ? 'enabled' : 'disabled'}>
                  <div className="tool-info">
                    <strong>{getDisplayName(tool)}</strong>
                    <p>{getDescription(tool)}</p>
                    <div className="skill-settings">
                      {hasSettings ? (
                        <SchemaFields
                          schema={configSchema as Record<string, unknown>}
                          values={tool.config || {}}
                          onChange={(key, value) => {
                            const nb = toolBindings.map((tb) => tb.name === tool.name
                              ? { ...tb, config: { ...(tb.config || {}), [key]: value } }
                              : tb);
                            scheduleSave(nb);
                          }}
                          namePrefix={`settings-${tool.name}`}
                        />
                      ) : (
                        <p className="muted">This Skill has no settings.</p>
                      )}
                    </div>
                    {consumes.length > 0 && (
                      <div className="skill-feeds" style={{ marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 4, fontSize: 12 }}>
                        <span className="muted">Consumes feeds:</span> {consumes.join(', ')}
                      </div>
                    )}
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
                      title={`Remove ${getDisplayName(tool)}`}
                    >
                      &times;
                    </button>
                  </div>
                </li>
              );
            })}
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
  );
};

export default ToolsPanel;
