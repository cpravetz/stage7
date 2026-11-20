import type { AgentDefinition, AgentToolPolicy } from '../../types'
import { MAX_TOOL_DESCRIPTION_LENGTH } from './constants'
import type { ToolCatalogResponse, ToolDescriptor, ToolResult } from './types'
import { asRecord } from './util'

// ---------------------------------------------------------------------------
// Describing tools to the Brain
// ---------------------------------------------------------------------------

function boundSchemaDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(boundSchemaDescriptions)
  const record = asRecord(value)
  if (!record) return value
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [
    key,
    key === 'description' && typeof child === 'string'
      ? child.length > 500 ? '[Long schema description omitted.]' : child
      : boundSchemaDescriptions(child),
  ]))
}

export function describeTools(tools: ToolDescriptor[]): Array<{
  id: string;
  name: string;
  description: string;
  type: string;
  capabilities: string[];
  inputs: string;
  inputSchema: unknown;
  configSchema: unknown;
  outputSchema: unknown;
}> {
  return tools.map(({ id, name, description, type, inputSchema, configSchema, outputSchema, manifest }) => {
    const schema = asRecord(inputSchema)
    const properties = asRecord(schema?.properties) || {}
    const required = Array.isArray(schema?.required)
      ? schema.required.filter((field): field is string => typeof field === 'string')
      : []
    const inputs = Object.entries(properties)
      .slice(0, 20)
      .map(([key, value]) => {
        const property = asRecord(value)
        const propertyType = typeof property?.type === 'string' ? property.type : 'object'
        return `${key}:${propertyType}${required.includes(key) ? '!' : ''}`
      })
      .join(', ')
    return {
      id,
      name,
      description: description.slice(0, MAX_TOOL_DESCRIPTION_LENGTH),
      type,
      capabilities: Array.isArray(manifest?.capabilities)
        ? manifest.capabilities.filter((value): value is string => typeof value === 'string').slice(0, 20)
        : [],
      inputs,
      inputSchema: boundSchemaDescriptions(inputSchema || { type: 'object', properties: {} }),
      configSchema: boundSchemaDescriptions(configSchema || asRecord(manifest?.configSchema) || { type: 'object', properties: {} }),
      outputSchema: boundSchemaDescriptions(outputSchema || { type: 'object', properties: {} }),
    }
  })
}

// ---------------------------------------------------------------------------
// `__list_tools`: ranked catalog search
// ---------------------------------------------------------------------------

const ACTION_INTENT_TERMS = new Set([
  'send', 'publish', 'submit', 'deliver', 'dispatch', 'transmit', 'post',
  'notify', 'alert', 'execute', 'invoke', 'trigger', 'run', 'call',
  'create', 'write', 'upload', 'emit', 'broadcast', 'message', 'email',
  'sms', 'reply', 'respond',
])
const PASSIVE_INTENT_TERMS = new Set([
  'sync', 'draft', 'record', 'store', 'save', 'log', 'queue', 'cache',
  'buffer', 'stage', 'index', 'archive', 'persist', 'collect', 'track',
])

/**
 * Keyword search over the visible catalog. When the query sounds like an action
 * (send, publish, ...) tools that look like they perform it are ranked above
 * tools that merely draft, store or sync.
 */
export function searchTools(tools: ToolDescriptor[], rawQuery: unknown): ToolResult {
  const query = typeof rawQuery === 'string'
    ? rawQuery.trim().slice(0, 300).toLocaleLowerCase()
    : ''
  const queryTerms = [...new Set(query.split(/[^a-z0-9]+/).filter((term) => term.length > 1))]
  const queryHasActionIntent = queryTerms.some((term) => ACTION_INTENT_TERMS.has(term))
  const rankedTools = tools.map((tool) => {
    const searchable = [
      tool.id,
      tool.name,
      tool.description,
      JSON.stringify(tool.manifest?.capabilities || ''),
      JSON.stringify(tool.inputSchema || {}),
      JSON.stringify(tool.configSchema || {}),
      JSON.stringify(tool.outputSchema || {}),
    ].join(' ').toLocaleLowerCase()
    const metadataTerms = new Set([
      tool.id,
      tool.name,
      tool.description,
      ...(Array.isArray(tool.manifest?.capabilities) ? tool.manifest.capabilities : []),
    ].join(' ').toLocaleLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 1))
    let score = queryTerms.reduce((total, term) => total + Number(searchable.includes(term)), 0)
    if (queryHasActionIntent && score > 0) {
      let actionSignal = 0
      let passiveSignal = 0
      for (const term of metadataTerms) {
        if (ACTION_INTENT_TERMS.has(term)) actionSignal++
        if (PASSIVE_INTENT_TERMS.has(term)) passiveSignal++
      }
      score += Math.min(actionSignal, 3) * 0.35
      score -= Math.min(passiveSignal, 3) * 0.25
    }
    return { tool, score }
  })
  const matchingTools = queryTerms.length === 0
    ? tools
    : rankedTools
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.tool.id.localeCompare(right.tool.id))
      .map(({ tool }) => tool)
  const content = queryTerms.length === 0
    ? matchingTools.map((tool) => tool.id).join('\n')
    : JSON.stringify(describeTools(matchingTools.slice(0, 8)))
  return {
    isError: false,
    content: content || (query ? 'No visible tools matched the requested query.' : 'No visible tools.'),
  }
}

// ---------------------------------------------------------------------------
// Catalog access and per-agent policy
// ---------------------------------------------------------------------------

export function resolveToolPolicy(definition: AgentDefinition): AgentToolPolicy {
  const toolPolicy = definition.toolPolicy
  if (toolPolicy === undefined) return { mode: 'all' }
  if (toolPolicy.mode === 'all') return toolPolicy
  if (toolPolicy.mode === 'allowlist') {
    if (!Array.isArray(definition.tools) || !definition.tools.every((tool) =>
      typeof tool === 'string' && tool.trim().length > 0,
    )) {
      throw new Error(`Agent ${definition.id} allowlist policy requires non-empty tool IDs`)
    }
    return toolPolicy
  }
  throw new Error(`Agent ${definition.id} has an invalid tool policy mode`)
}

/** The tools visible to an agent: the full catalog, or its allowlist. */
export function visibleTools(catalog: ToolDescriptor[], definition: AgentDefinition, toolPolicy: AgentToolPolicy): ToolDescriptor[] {
  return toolPolicy.mode === 'allowlist'
    ? catalog.filter((tool) => definition.tools.includes(tool.id))
    : catalog
}

export function findTool(tools: ToolDescriptor[], toolIdOrName: string): ToolDescriptor | undefined {
  return tools.find((tool) => tool.id === toolIdOrName || tool.name === toolIdOrName)
}

// ---------------------------------------------------------------------------
// Task-aware tool ranking: pre-filters the catalog so the Brain sees only the
// most relevant tools in the prompt, not the entire catalog.
// ---------------------------------------------------------------------------

/** Maximum number of tools to include in the prompt catalog JSON. */
export const MAX_PROMPT_TOOLS = 15;

/**
 * Scores each tool by keyword overlap with the task goal and required actions,
 * with a bonus for action-intent alignment. Returns tools sorted by descending
 * relevance. Tools with zero overlap are still included at the end (stable
 * ordering) so the Brain can discover them via `__list_tools`.
 */
export function rankToolsForTask(
  tools: ToolDescriptor[],
  taskGoal: string | undefined,
  requiredActions: Array<{ toolId: string; outcome: string }>,
): ToolDescriptor[] {
  if (tools.length <= MAX_PROMPT_TOOLS) return tools;

  const goalTerms = new Set(
    (taskGoal || '')
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 1),
  );
  const requiredToolIds = new Set(requiredActions.map((a) => a.toolId.toLocaleLowerCase()));
  const goalHasActionIntent = [...goalTerms].some((term) => ACTION_INTENT_TERMS.has(term));

  const scored = tools.map((tool) => {
    // Exact required-action match gets top priority
    if (requiredToolIds.has(tool.id.toLocaleLowerCase()) || requiredToolIds.has(tool.name.toLocaleLowerCase())) {
      return { tool, score: 1000 };
    }
    const metadataTerms = new Set([
      tool.id,
      tool.name,
      tool.description,
      ...(Array.isArray(tool.manifest?.capabilities) ? tool.manifest.capabilities : []),
    ].join(' ').toLocaleLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 1));
    let score = [...goalTerms].reduce((total, term) => total + (metadataTerms.has(term) ? 1 : 0), 0);
    if (goalHasActionIntent && score > 0) {
      let actionSignal = 0;
      let passiveSignal = 0;
      for (const term of metadataTerms) {
        if (ACTION_INTENT_TERMS.has(term)) actionSignal++;
        if (PASSIVE_INTENT_TERMS.has(term)) passiveSignal++;
      }
      score += Math.min(actionSignal, 3) * 0.35;
      score -= Math.min(passiveSignal, 3) * 0.25;
    }
    return { tool, score };
  });

  scored.sort((a, b) => b.score - a.score || a.tool.id.localeCompare(b.tool.id));
  return scored.map((entry) => entry.tool);
}

export class ToolCatalogClient {
  constructor(
    private readonly toolExecutorUrl: string,
    private readonly fetcher: typeof fetch,
  ) {}

  async list(): Promise<ToolDescriptor[]> {
    const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/tools`)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Tool catalog request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const result = await response.json() as ToolCatalogResponse
    if (!Array.isArray(result.tools)) throw new Error('Tool catalog response did not contain a tools array')
    return result.tools.filter((tool) =>
      tool.isSkill !== true
      && typeof tool.id === 'string'
      && typeof tool.name === 'string'
      && typeof tool.description === 'string'
      && typeof tool.type === 'string',
    )
  }
}
