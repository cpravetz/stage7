import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  logger,
} from '@stage7-nextgen/shared'
import type { AgentDefinition } from '../../types'
import {
  BRAIN_RESPONSE_GRACE_MS,
  DEFAULT_BRAIN_COMPLETION_DEADLINE_MS,
  DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  MAX_BRAIN_REQUEST_BYTES,
} from './constants'
import { renderBrainTranscript } from './prompt'
import type { BrainErrorResponse, BrainResponse, ChatMessage } from './types'

export function brainRequestTimeoutFromEnvironment(): number {
  const configuredDeadline = Number(process.env.BRAIN_COMPLETION_DEADLINE_MS)
  const configuredAttemptTimeout = Number(process.env.BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS)
  const attemptTimeout = Number.isFinite(configuredAttemptTimeout) && configuredAttemptTimeout > 0
    ? configuredAttemptTimeout
    : DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS
  const completionDeadline = Number.isFinite(configuredDeadline) && configuredDeadline > 0
    ? configuredDeadline
    : Math.max(attemptTimeout, Math.min(attemptTimeout * 3, DEFAULT_BRAIN_COMPLETION_DEADLINE_MS))
  return completionDeadline + BRAIN_RESPONSE_GRACE_MS
}

/** HTTP client for the Brain service: completions and response-quality complaints. */
export class BrainClient {
  constructor(
    private readonly brainUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly requestTimeoutMs: number,
  ) {}

  async complete(
    definition: AgentDefinition,
    missionId: string,
    systemPrompt: string,
    history: ChatMessage[],
    maxTokens: number,
    routingSessionId?: string,
  ): Promise<BrainResponse> {
    const buildRequestBody = (candidateHistory: ChatMessage[]) =>
      JSON.stringify({
        prompt: renderBrainTranscript(candidateHistory),
        systemPrompt,
        options: { optimizeFor: 'accuracy' },
        maxTokens,
        temperature: 0.3,
        missionId,
        entityId: typeof definition.metadata?.entityId === 'string'
          ? definition.metadata.entityId
          : missionId,
        assistantId: typeof definition.metadata?.assistantId === 'string'
          ? definition.metadata.assistantId
          : undefined,
        tenantId: definition.tenantId,
        ...(routingSessionId ? { routingSessionId } : {}),
      })
    // Compact the conversation history until the serialized Brain request fits the
    // service limit. Keep the first user prompt and the most recent turns; drop the
    // oldest middle turns first so the Agent always retains its latest context.
    let compactedHistory = history
    let requestBody = buildRequestBody(compactedHistory)
    while (Buffer.byteLength(requestBody) > MAX_BRAIN_REQUEST_BYTES && compactedHistory.length > 2) {
      const latestHistoryCount = Math.max(1, Math.floor((compactedHistory.length - 1) / 2))
      const nextHistory = [compactedHistory[0]!, ...compactedHistory.slice(-latestHistoryCount)]
      if (nextHistory.length >= compactedHistory.length) break
      compactedHistory = nextHistory
      requestBody = buildRequestBody(compactedHistory)
    }
    const requestBytes = Buffer.byteLength(requestBody)
    if (requestBytes > MAX_BRAIN_REQUEST_BYTES) {
      throw new Error(
        `Brain request for Agent ${definition.id} remains ${requestBytes} bytes after history compaction, exceeding the ${MAX_BRAIN_REQUEST_BYTES}-byte service limit; reduce the task context or tool output.`,
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)
    let response: Response
    try {
      response = await this.fetcher(`${this.brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        const cause = error instanceof Error ? `: ${error.message}` : '';
        throw new Error(`Brain request timed out after ${this.requestTimeoutMs}ms${cause}`, { cause: error })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      const text = await response.text()
      try {
        const body = JSON.parse(text) as BrainErrorResponse
        const code = body.details?.code
        if (code === BRAIN_MODEL_SELECTION_RETRY || code === BRAIN_MODEL_SELECTION_EXHAUSTED) {
          throw new Error(`${code}: ${body.error || 'Brain model selection did not complete the request'}`)
        }
      } catch (error) {
        if (error instanceof Error && (
          error.message.startsWith(`${BRAIN_MODEL_SELECTION_RETRY}:`)
          || error.message.startsWith(`${BRAIN_MODEL_SELECTION_EXHAUSTED}:`)
        )) {
          throw error
        }
      }
      throw new Error(`Brain request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const result = await response.json() as BrainResponse
    if (typeof result.content !== 'string') {
      throw new Error('Brain returned a completion without content')
    }
    return result
  }

  /** Tells the Brain that one of its responses failed validation, so routing can learn from it. */
  async reportComplaint(
    requestId: string | undefined,
    reason: string,
    missionId: string,
  ): Promise<void> {
    if (!requestId) {
      logger.warn({ missionId, reason }, 'Cannot report Brain response validation failure without a request ID')
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await this.fetcher(`${this.brainUrl}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason, missionId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const details = await response.text()
        logger.error(
          { requestId, missionId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected an Agent response quality complaint',
        )
        return
      }
      logger.info({ requestId, missionId, reason }, 'Agent reported a Brain response quality complaint')
    } catch (error) {
      logger.error(
        { requestId, missionId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report an Agent response quality complaint',
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}
