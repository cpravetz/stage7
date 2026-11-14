import type { AgentDefinition, AgentToolPolicy } from '../../types'
import type { BrainClient } from './BrainClient'
import type { CapabilityResolver } from './CapabilityResolver'
import type { SystemToolClient } from './SystemToolClient'
import { ASK_USER_MARKER, ASK_USER_NAME, CREATE_TOOL_ACTION, DELEGATE_ACTION, LIST_TOOLS_ACTION } from './constants'
import { delegateSubtask } from './delegation'
import { findTool, searchTools } from './toolCatalog'
import type { AgentAction, AgentExecutionContext, ToolDescriptor, ToolResult } from './types'

/**
 * Executes one action proposed by the Brain: the built-in pseudo-tools
 * (`__list_tools`, `__create_tool`, `__delegate`, `__ASK_USER__`) or a registered system tool.
 */
export class ActionExecutor {
  constructor(
    private readonly brain: BrainClient,
    private readonly resolver: CapabilityResolver,
    private readonly systemTools: SystemToolClient,
  ) {}

  async execute(
    action: AgentAction,
    tools: ToolDescriptor[],
    definition: AgentDefinition,
    context: AgentExecutionContext,
    toolPolicy: AgentToolPolicy,
    requestId?: string,
  ): Promise<ToolResult> {
    if (action.tool === LIST_TOOLS_ACTION) {
      return searchTools(tools, action.args.query)
    }
    if (action.tool === CREATE_TOOL_ACTION) {
      if (toolPolicy.mode === 'allowlist') {
        await this.brain.reportComplaint(
          requestId,
          'Agent action validation failed: tool creation was requested under a policy that forbids tool creation.',
          context.missionId,
        )
        return {
          isError: true,
          content: 'Tool creation is disabled for Agents with an allowlist policy. Ask the user to authorize an approved provider in Tools configuration.',
          outcome: 'denied',
        }
      }
      return this.resolver.createTool(action.args, context, definition.id)
    }
    if (action.tool === DELEGATE_ACTION) {
      return delegateSubtask(action.args, context)
    }

    if (action.tool === ASK_USER_NAME || action.tool === 'ask_user') {
      const question = typeof action.args?.question === 'string' && action.args.question.trim().length > 0
        ? action.args.question.trim()
        : 'I need more information to continue. Please provide the missing value.'
      return {
        isError: false,
        outcome: 'question_asked',
        content: `${ASK_USER_MARKER}${JSON.stringify({ question })}`,
      }
    }

    const tool = findTool(tools, action.tool)
    if (!tool) return this.handleUnknownTool(action, definition, context, toolPolicy, requestId)
    return this.systemTools.run(tool, action, definition, context, requestId)
  }

  /** The requested tool is not in the visible catalog: deny it, or try to resolve the missing capability. */
  private async handleUnknownTool(
    action: AgentAction,
    definition: AgentDefinition,
    context: AgentExecutionContext,
    toolPolicy: AgentToolPolicy,
    requestId?: string,
  ): Promise<ToolResult> {
    if (toolPolicy.mode === 'allowlist' && !definition.tools.includes(action.tool)) {
      await this.brain.reportComplaint(
        requestId,
        `Agent action validation failed: requested tool '${action.tool}' is outside the Agent allowlist.`,
        context.missionId,
      )
      return {
        isError: true,
        content: `Tool '${action.tool}' is not in this Agent's allowed tool set.`,
        outcome: 'denied',
      }
    }
    await this.brain.reportComplaint(
      requestId,
      `Agent action validation failed: requested tool '${action.tool}' is absent from the live tool catalog.`,
      context.missionId,
    )
    const requestedTool = typeof action.tool === 'string' && action.tool.trim().length > 0 ? action.tool.trim() : 'the requested capability'
    // Missing capabilities must not block the mission: resolve by searching approved/external options or creating a tool.
    // External options (services/codebases) require explicit user permission via the resolver's permission flow.
    if (toolPolicy.mode !== 'allowlist') {
      const capability = requestedTool.replace(/[_-]+/g, ' ').trim() || requestedTool
      return this.resolver.createTool(
        {
          capability,
          description: `Provide the missing capability "${capability}" needed to complete the current task. Search registered tools, approved MCP/public options, or create a reusable tool. If an external service or codebase must be used, request user permission before using it.`,
          requirements: [`Satisfy requested capability: ${requestedTool}`],
        },
        context,
        definition.id,
      )
    }
    return {
      isError: true,
      content: `Tool '${requestedTool}' is not in the live system catalog and cannot be resolved under the current allowlist policy.`,
      outcome: 'failure',
    }
  }
}
