import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  fetchLlmSettingsDoc,
  logger,
} from '@stage7-nextgen/shared'
import type { AgentDefinition } from '../../types'
import {
  BRAIN_RESPONSE_GRACE_MS,
  DEFAULT_BRAIN_COMPLETION_DEADLINE_MS,
  DEFAULT_BRAIN_PROVIDER_ATTEMPT_TIMEOUT_MS,
  MAX_BRAIN_REQUEST_BYTES,
  MAX_BRAIN_REQUEST_TIMEOUT_MS,
} from './constants'
import { compactBrainRequest } from './requestCompaction'
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

/**
 * Settings-driven resolver: the llm-config completion deadline when the
 * document is reachable, the env-derived formula otherwise. Async — production
 * wiring passes this explicitly; tests and offline construction default to the
 * synchronous env function so they never block on a settings fetch.
 */
export async function brainRequestTimeoutFromSettings(): Promise<number> {
  const artifactsUrl = process.env.ARTIFACTS_URL || process.env.PERSISTENCE_URL || 'http://artifacts:4200'
  const settings = await fetchLlmSettingsDoc(artifactsUrl)
  if (settings?.completionDeadlineMs !== undefined) {
    return settings.completionDeadlineMs + BRAIN_RESPONSE_GRACE_MS
  }
  return brainRequestTimeoutFromEnvironment()
}

/** The [1s, MAX] window the executor has always enforced, applied to resolved values too. */
export function validateBrainRequestTimeoutMs(timeoutMs: number): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_BRAIN_REQUEST_TIMEOUT_MS) {
    throw new Error(`Agent brainRequestTimeoutMs must be an integer between 1000 and ${MAX_BRAIN_REQUEST_TIMEOUT_MS}`)
  }
  return timeoutMs
}

/** Resolves a fixed timeout or a per-request resolver, validating the resolved value. */
export async function resolveBrainRequestTimeoutMs(
  timeout: number | (() => Promise<number> | number),
): Promise<number> {
  return validateBrainRequestTimeoutMs(typeof timeout === 'function' ? await timeout() : timeout)
}

/** HTTP client for the Brain service: completions and response-quality complaints. */
export class BrainClient {
  constructor(
    private readonly brainUrl: string,
    private readonly fetcher: typeof fetch,
    private readonly requestTimeoutMs: number | (() => Promise<number> | number),
  ) {}

  async complete(
    definition: AgentDefinition,
    missionId: string,
    systemPrompt: string,
    history: ChatMessage[],
    maxTokens: number,
    routingSessionId?: string,
  ): Promise<BrainResponse> {
    const base = {
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
    // Resolved per request so a saved deadline change reaches the next
    // request without restarting the process.
    const timeoutMs = await resolveBrainRequestTimeoutMs(this.requestTimeoutMs)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
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
        throw new Error(`Brain request timed out after ${timeoutMs}ms${cause}`, { cause: error })
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
