import { ToolBinding, AssistantWorkflow, WorkflowStage, Entity } from '../types/workflow';
import { sfGetSchemaProperties as getSchemaProperties, sfIsLongTextSchema as isLongTextSchema, sfIsFileUploadSchema as isFileUploadSchema, sfReadFileAsUploadValue as readFileAsUploadValue, sfFormatTextValue as formatTextValue, sfFormatNumberValue as formatNumberValue, sfHumanizeKey as humanizeKey, sfGetSchemaTitle as getSchemaTitle, sfGetSchemaDescription as getSchemaDescription } from '../components/SchemaFields';

type SchemaRecord = Record<string, unknown>;
type EnumOption = string | number | boolean | { value: unknown; label?: unknown } | Record<string, unknown>;

export const CONFIG_LABEL_MAP: Record<string, string> = {
  maxIterations: 'Max Iterations',
};

export const getAssistantKey = (entity: Entity): string => {
  const fromId = entity.id
    .replace(/-canonical-assistant$/i, '')
    .replace(/_/g, '-')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const fromName = entity.name.replace(/\s+assistant$/i, '').trim();
  return fromName || fromId;
};

export const isEntityWorkflow = (workflow: AssistantWorkflow, entity: Entity): boolean => {
  const assistantKey = getAssistantKey(entity).toLowerCase();
  return workflow.assistant.toLowerCase() === assistantKey ||
    entity.name.toLowerCase().startsWith(workflow.assistant.toLowerCase());
};

const FIELD_LABEL_MAP: Record<string, string> = {
  operation: 'Action',
  provider: 'Service Provider',
  endpointUrl: 'Connect Service',
  baseUrl: 'Connect Service',
  apiKey: 'API Key',
  dryRun: 'Preview only',
  confirmation: 'Approve & send',
};

export const getToolDisplayName = (tool: ToolBinding, availableSkills?: Array<{ id: string; name: string; description: string }>): string => {
  const skills = availableSkills || [];
  const skill = skills.find((s) => s.id === tool.name || s.name === tool.name);
  return tool.displayName || skill?.name || humanizeKey(tool.name);
};

export const getToolDescription = (tool: ToolBinding, availableSkills?: Array<{ id: string; name: string; description: string }>): string => {
  const skills = availableSkills || [];
  const skill = skills.find((s) => s.id === tool.name || s.name === tool.name);
  return tool.description || skill?.description || '';
};

export const getToolConfigSchema = (tool: ToolBinding, availableSkills?: Array<{ id: string; name: string; description: string; configSchema?: Record<string, unknown> }>): SchemaRecord | undefined => {
  const skills = availableSkills || [];
  const skill = skills.find((s) => s.id === tool.name || s.name === tool.name);
  return tool.configSchema || skill?.configSchema;
};

export const getToolInputSchema = (tool: ToolBinding, availableSkills?: Array<{ id: string; name: string; description: string; inputSchema?: Record<string, unknown> }>): SchemaRecord => {
  const skills = availableSkills || [];
  const skill = skills.find((s) => s.id === tool.name || s.name === tool.name);
  const toolSchema = tool.inputSchema && Object.keys(getSchemaProperties(tool.inputSchema)).length > 0 ? tool.inputSchema : undefined;
  const schema = toolSchema || skill?.inputSchema || { type: 'object', properties: {} };
  return Object.keys(getSchemaProperties(schema)).length > 0 ? schema : { type: 'object', properties: {} };
};

export const getInitialInputValues = (schema?: SchemaRecord): Record<string, unknown> => {
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

// Re-export getSchemaProperties for panels that need it
export { sfGetSchemaProperties as getSchemaProperties } from '../components/SchemaFields';

// Tool execution can fail before returning JSON (proxy errors, HTML error pages, empty bodies),
// so read the body as text first rather than assuming res.json() will succeed.
export const parseToolExecuteResponse = async (res: Response): Promise<string> => {
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