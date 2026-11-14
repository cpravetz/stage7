import { createHash } from 'node:crypto'
import { extractReceiptBinding, logger } from '@stage7-nextgen/shared'
import type { AgentDefinition } from '../../types'
import type { BrainClient } from './BrainClient'
import { ASK_USER_MARKER } from './constants'
import { isToolFailurePayload } from './toolFailures'
import type {
  AgentAction,
  AgentExecutionContext,
  ToolDescriptor,
  ToolExecutionResponse,
  ToolResult,
} from './types'
import { asRecord } from './util'

/** Reconciliation details and whether the outcome is known, read from a response and/or its output payload. */
function readReconciliation(
  response: { reconciliation?: unknown; outcomeKnown?: unknown },
  output: unknown,
): { reconciliation?: Record<string, unknown>; outcomeKnown?: boolean } {
  const outputRecord = asRecord(output)
  const reconciliation = asRecord(response.reconciliation) ?? asRecord(outputRecord?.reconciliation)
  const outcomeKnown = typeof response.outcomeKnown === 'boolean'
    ? response.outcomeKnown
    : typeof outputRecord?.outcomeKnown === 'boolean'
      ? outputRecord.outcomeKnown
      : typeof reconciliation?.outcomeKnown === 'boolean'
        ? reconciliation.outcomeKnown as boolean
        : undefined
  return { reconciliation, outcomeKnown }
}

/** The `operation` / `providerRequestId` / `binding` fields of a ToolResult, present only when known. */
function bindingFields(binding: any): Partial<ToolResult> {
  return {
    ...(binding.operation ? { operation: binding.operation } : {}),
    ...(binding.providerRequestId ? { providerRequestId: binding.providerRequestId } : {}),
    ...(Object.keys(binding).length > 0 ? { binding } : {}),
  }
}

/** A tool call that completed: success, or a failure reported inside the payload. */
function completedResult(
  output: unknown,
  executionId: string,
  outcomeKnown: boolean | undefined,
  reconciliation: Record<string, unknown> | undefined,
  binding: any,
  semanticFailure: boolean,
): ToolResult {
  return {
    isError: semanticFailure,
    content: JSON.stringify(output),
    executionId,
    ...(typeof outcomeKnown === 'boolean' ? { outcomeKnown } : {}),
    ...(reconciliation ? { reconciliation } : {}),
    ...bindingFields(binding),
    ...(semanticFailure ? { outcome: 'failure' as const } : {}),
  }
}

/** Runs a registered tool through the Tool Executor service. */
export class SystemToolClient {
  constructor(
    private readonly toolExecutorUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly brain: BrainClient,
  ) {}

  async run(
    tool: ToolDescriptor,
    action: AgentAction,
    definition: AgentDefinition,
    context: AgentExecutionContext,
    requestId?: string,
  ): Promise<ToolResult> {
    const executionId = (action as { executionId?: string }).executionId || `${context.missionId}:${definition.id}:${createHash('sha256').update(`${action.tool}:${JSON.stringify(action.args)}`).digest('hex').slice(0, 16)}-${Date.now()}`
    try {
      return await this.invoke(tool, action, definition, context, executionId, requestId)
    } catch (error) {
      return this.recoverAfterLostResponse(tool, executionId, definition, error)
    }
  }

  private async invoke(
    tool: ToolDescriptor,
    action: AgentAction,
    definition: AgentDefinition,
    context: AgentExecutionContext,
    executionId: string,
    requestId?: string,
  ): Promise<ToolResult> {
    const response = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tool.id,
        name: tool.id,
        type: tool.type,
        manifest: {},
        input: action.args,
        agentId: definition.id,
        executionId,
        context: { missionId: context.missionId, agentId: definition.id, tenantId: definition.tenantId, executionId },
      }),
    })
    const result = await response.json() as ToolExecutionResponse

    const credentialQuestion = this.credentialQuestion(response.status, result)
    if (credentialQuestion) return credentialQuestion

    if (!response.ok || result.status !== 'completed') {
      if (response.status === 400 || response.status === 422) {
        await this.brain.reportComplaint(
          requestId,
          `Agent action validation failed for tool '${tool.id}' (HTTP ${response.status}); the Brain-produced arguments were rejected.`,
          context.missionId,
        )
      }
      return {
        isError: true,
        content: result.error || `Tool '${tool.name}' failed with HTTP ${response.status}`,
        ...(response.status === 403 ? { outcome: 'denied' as const } : {}),
      }
    }

    const output = result.output ?? {}
    const { reconciliation, outcomeKnown } = readReconciliation(result, output)
    const semanticFailure = isToolFailurePayload(output)
    const resolvedExecutionId = (typeof result.request?.executionId === 'string' ? result.request.executionId : executionId)
    if (outcomeKnown === false) {
      const binding = extractReceiptBinding({ toolId: tool.id, isError: true, content: JSON.stringify(output), outcome: 'failure', executionId: resolvedExecutionId, binding: reconciliation })
      return {
        isError: true,
        content: JSON.stringify({ outcomeUnknown: true, outcomeKnown: false, executionId: resolvedExecutionId, ...(reconciliation ? { reconciliation } : {}), output }),
        executionId: resolvedExecutionId,
        outcomeKnown: false,
        ...(reconciliation ? { reconciliation } : {}),
        ...bindingFields(binding),
        outcome: 'failure',
      }
    }
    const binding = extractReceiptBinding({
      toolId: tool.id,
      isError: semanticFailure,
      content: JSON.stringify(output),
      outcome: semanticFailure ? 'failure' : 'success',
      executionId: resolvedExecutionId,
      ...(result.request?.operation ? { operation: result.request.operation } : {}),
      ...(result.request?.providerRequestId ? { providerRequestId: result.request.providerRequestId } : {}),
      ...(result.request?.binding ? { binding: result.request.binding } : {}),
    })
    return completedResult(output, resolvedExecutionId, outcomeKnown, reconciliation, binding, semanticFailure)
  }

  /** HTTP 428: the tool needs credentials the user must supply through the secure form. */
  private credentialQuestion(status: number, result: ToolExecutionResponse): ToolResult | undefined {
    const credentialRequest = result.request
    if (
      status !== 428
      || typeof credentialRequest?.executionId !== 'string'
      || typeof credentialRequest.toolId !== 'string'
      || typeof credentialRequest.toolName !== 'string'
      || !Array.isArray(credentialRequest.missingCredentials)
    ) {
      return undefined
    }
    const missingCredentials = credentialRequest.missingCredentials.filter(
      (credential): credential is { key: string; label?: string; source?: { vaultSecretId?: string; envVar?: string; configKey?: string; sensitive?: boolean } } =>
        typeof credential?.key === 'string' && credential.key.trim().length > 0,
    )
    if (missingCredentials.length === 0) return undefined
    const labels = missingCredentials.map(({ key, label }) => label || key).join(', ')
    const question = `Please provide ${labels} for ${credentialRequest.toolName} in the secure form below so I can continue.`;
    return {
      isError: true,
      outcome: 'question_asked',
      content: `${ASK_USER_MARKER}${JSON.stringify({
        question,
        credentialRequest: {
          executionId: credentialRequest.executionId,
          toolId: credentialRequest.toolId,
          toolName: credentialRequest.toolName,
          missingCredentials: missingCredentials.map(({ key, label }) => ({ key, label: label || key })),
        },
      })}`,
    }
  }

  /**
   * Lost response / ambiguous result: attempt to retrieve by stable execution ID.
   * 1A/1B alignment: completed+outcomeKnown may be success; outcomeKnown:false, in_progress,
   * pending_credentials, or missing record are explicit unverifiable/unknown — never success,
   * never blind side-effect retry.
   */
  private async recoverAfterLostResponse(
    tool: ToolDescriptor,
    executionId: string,
    definition: AgentDefinition,
    error: unknown,
  ): Promise<ToolResult> {
    try {
      const retrieveResponse = await this.fetcher(`${this.toolExecutorUrl}/api/tool-executor/executions/${encodeURIComponent(executionId)}`)
      if (retrieveResponse.ok) {
        const retrieved = await retrieveResponse.json() as ToolExecutionResponse & Record<string, unknown>
        const status = typeof retrieved.status === 'string' ? retrieved.status : ''
        const output = retrieved.output ?? {}
        const { reconciliation, outcomeKnown } = readReconciliation(retrieved, output)
        if (status === 'completed' && outcomeKnown !== false) {
          const semanticFailure = isToolFailurePayload(output)
          const binding = extractReceiptBinding({ toolId: tool.id, isError: semanticFailure, content: JSON.stringify(output), outcome: semanticFailure ? 'failure' : 'success', executionId, binding: reconciliation })
          return completedResult(output, executionId, outcomeKnown, reconciliation, binding, semanticFailure)
        }
        if (status === 'failed') {
          return { isError: true, content: JSON.stringify({ executionId, status, error: retrieved.error || 'Execution failed', ...(reconciliation ? { reconciliation } : {}), output }), executionId, outcomeKnown, ...(reconciliation ? { reconciliation } : {}), outcome: 'failure' }
        }
        // completed+outcomeKnown:false, in_progress, pending_credentials, or other non-terminal/ambiguous states
        return {
          isError: true,
          content: JSON.stringify({ outcomeUnknown: true, executionId, status: status || 'unknown', outcomeKnown, ...(reconciliation ? { reconciliation } : {}), note: 'Execution outcome is not verifiably known; do not retry side-effect actions.' }),
          executionId,
          ...(typeof outcomeKnown === 'boolean' ? { outcomeKnown } : {}),
          ...(reconciliation ? { reconciliation } : {}),
          outcome: 'failure',
        }
      }
      if (retrieveResponse.status === 404) {
        return { isError: true, content: JSON.stringify({ outcomeUnknown: true, executionId, status: 'not_found', note: 'No execution record found after lost response; outcome is unknown. Do not retry side-effect actions.' }), executionId, outcome: 'failure' }
      }
    } catch {
      // ignore retrieval errors
    }
    logger.warn(
      { agentId: definition.id, toolId: tool.id, executionId, error: error instanceof Error ? error.message : String(error) },
      'Agent tool call failed with unknowable outcome',
    )
    return {
      isError: true,
      content: JSON.stringify({ outcomeUnknown: true, executionId, note: `Tool '${tool.id}' did not return a readable execution result and outcome could not be retrieved; outcome is unknown. Do not retry side-effect actions.`, error: error instanceof Error ? error.message : String(error) }),
      executionId,
      outcome: 'failure',
    }
  }
}
