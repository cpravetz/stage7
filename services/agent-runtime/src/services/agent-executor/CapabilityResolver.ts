import { asRecord } from './util'
import type { ToolCatalogClient } from './toolCatalog'
import type { AgentExecutionContext, PluginGenerationResponse, ToolResult } from './types'

/** Asks the Tool Executor to find, discover or generate a tool for a capability, then confirms it registered. */
export class CapabilityResolver {
  constructor(
    private readonly toolExecutorUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly catalog: ToolCatalogClient,
  ) {}

  async createTool(
    args: Record<string, unknown>,
    context: AgentExecutionContext,
    agentId: string,
  ): Promise<ToolResult> {
    const description = typeof args.description === 'string' ? args.description.trim() : ''
    if (!description) return { isError: true, content: 'Tool creation requires a non-empty description.' }
    const capability = typeof args.capability === 'string' ? args.capability.trim() : ''
    const requirements = Array.isArray(args.requirements)
      ? args.requirements.filter((value): value is string => typeof value === 'string')
      : []
    const excludeToolIds = Array.isArray(args.excludeToolIds)
      ? [...new Set(args.excludeToolIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
      : []

    try {
      const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/tools/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(capability ? { capability } : {}),
          description,
          requirements,
          excludeToolIds,
          context: { missionId: context.missionId, agentId },
        }),
      })
      const result = await response.json() as PluginGenerationResponse & {
        permissionRequired?: boolean
        prompt?: string
        request?: unknown
        candidate?: unknown
      }
      if (result.permissionRequired) {
        if (!asRecord(result.request) || !asRecord(result.candidate)) {
          return { isError: true, content: 'Tool Executor returned an invalid MCP permission request.' }
        }
        return {
          isError: false,
          content: `__MISSION_PERMISSION__:${JSON.stringify({ request: result.request, candidate: result.candidate, prompt: result.prompt })}`,
          outcome: 'permission_required',
        }
      }
      if (!response.ok || !result.success || !result.tool) {
        return { isError: true, content: result.error || `Tool generation failed with HTTP ${response.status}` }
      }
      if (result.tool.manifest?.requiresInstallation === true) {
        return { isError: true, content: `Discovered '${result.tool.name}', but it requires installation before use.` }
      }

      const catalog = await this.catalog.list()
      const registered = catalog.find((tool) => tool.id === result.tool?.id)
      if (!registered) {
        return { isError: true, content: `Generated tool '${result.tool.name}' was not registered in the system catalog.` }
      }
      return {
        isError: false,
        content: `Created and registered tool '${registered.name}' (${registered.id}). It is now available in the live tool catalog.`,
        resolvedToolId: registered.id,
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return {
        isError: true,
        outcome: 'failure',
        outcomeKnown: false,
        content: `Tool resolution outcome is uncertain after a lost response: ${detail}. Check the tool catalog and the original operation before retrying.`,
      }
    }
  }
}
