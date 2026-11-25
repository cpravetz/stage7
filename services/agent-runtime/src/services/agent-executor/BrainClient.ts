import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  brainSettings,
  reportBrainComplaint,
  resolveBrainSettings,
} from '@stage7-nextgen/shared'
import type { AgentDefinition } from '../../types'
import {
  BRAIN_RESPONSE_GRACE_MS,
  MAX_BRAIN_REQUEST_BYTES,
  MAX_BRAIN_REQUEST_TIMEOUT_MS,
} from './constants'
import { compactBrainRequest } from './requestCompaction'
import type { BrainErrorResponse, BrainResponse, ChatMessage } from './types'

/**
 * Request ceiling for a Brain call: the completion deadline (settings doc
 * first, then environment, then the shared defaults) plus grace for the
 * response hop back. Reads the last polled snapshot synchronously — no I/O on
 * this path — and clamps to the same bounds the executor validates explicit
 * timeouts against.
 */
export function brainRequestTimeout(): number {
  const resolved = resolveBrainSettings(brainSettings.current().overrides, process.env)
  const timeoutMs = resolved.completionDeadlineMs + BRAIN_RESPONSE_GRACE_MS
  return Math.min(Math.max(timeoutMs, 1_000), MAX_BRAIN_REQUEST_TIMEOUT_MS)
}

/** HTTP client for the Brain service: completions and response-quality complaints. */
export class BrainClient {
  constructor(
    private readonly brainUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly requestTimeoutMs?: number,
  ) {}

  /** Explicit timeout wins; otherwise the deadline is resolved per request so runtime settings changes apply. */
  private requestTimeout(): number {
    return this.requestTimeoutMs ?? brainRequestTimeout()
  }

  async complete(
    definition: AgentDefinition,
    missionId: string,
    systemPrompt: string,
    history: ChatMessage[],
    maxTokens: number,
    routingSessionId?: string,
    userId?: string,
  ): Promise<BrainResponse> {
    const base = {
      options: { optimizeFor: 'accuracy' },
      maxTokens,
      temperature: 0.3,
      missionId,
      // Spend attribution: an explicit request userId wins; otherwise the
      // mission creator stamped into the agent's metadata carries it (OD-5).
      userId: userId ?? (typeof definition.metadata?.createdBy === 'string' && definition.metadata.createdBy
        ? definition.metadata.createdBy
        : undefined),
      // Entity-memory slot. Without an explicit entityId, missions learn
      // per-assistant: this must mirror the extraction fallback
      // (MissionStageCompletedListener writes entityId = assistantId).
      // A missionId fallback here read slots nothing wrote.
      entityId: typeof definition.metadata?.entityId === 'string' && definition.metadata.entityId
        ? definition.metadata.entityId
        : typeof definition.metadata?.assistantId === 'string'
          ? definition.metadata.assistantId
          : undefined,
      assistantId: typeof definition.metadata?.assistantId === 'string'
        ? definition.metadata.assistantId
        : undefined,
      tenantId: definition.tenantId,
      ...(routingSessionId ? { routingSessionId } : {}),
    }
    const compacted = compactBrainRequest({
      systemPrompt,
      history,
      base,
      maxBytes: MAX_BRAIN_REQUEST_BYTES,
    })
    const requestBody = compacted.requestBody
    const requestBytes = Buffer.byteLength(requestBody)
    if (requestBytes > MAX_BRAIN_REQUEST_BYTES) {
      throw new Error(`Brain request for Agent ${definition.id} could not be compacted under ${MAX_BRAIN_REQUEST_BYTES} bytes (actual ${requestBytes})`)
    }

    const controller = new AbortController()
    const requestTimeoutMs = this.requestTimeout()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
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
        throw new Error(`Brain request timed out after ${requestTimeoutMs}ms${cause}`, { cause: error })
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
    await reportBrainComplaint({ requestId, reason, missionId });
  }
}
