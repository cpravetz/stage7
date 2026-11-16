import { asRecord } from './util'

/** Structured failure codes for classification. */
export const FAILURE_CODES = {
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',
  MODEL_EXHAUSTED: 'MODEL_EXHAUSTED',
  TOOL_MISSING: 'TOOL_MISSING',
  CREDENTIAL_REQUIRED: 'CREDENTIAL_REQUIRED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  TRANSIENT_SERVICE_ERROR: 'TRANSIENT_SERVICE_ERROR',
  UNKNOWN_FAILURE: 'UNKNOWN_FAILURE',
} as const

export type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES]

export interface ClassifiedFailure {
  code: FailureCode
  message: string
  retryable: boolean
  needsUserInput: boolean
  missingFields?: string[]
  adaptation?: 'rebuild_context' | 'select_alternative_tool' | 'request_user_input' | 'stop_with_blocker' | 'retry_with_backoff'
}

/** True when a tool "succeeded" at the transport level but its payload reports failure. */
export function isToolFailurePayload(value: unknown, depth = 0): boolean {
  if (depth > 4) return false
  let payload = asRecord(value)
  if (!payload && typeof value === 'string') {
    try {
      payload = asRecord(JSON.parse(value))
    } catch {
      return false
    }
  }
  if (!payload) return false
  const failed = payload.success === false
    || payload.isError === true
    || payload.status === 'failed'
    || (typeof payload.error === 'string' && payload.error.trim().length > 0)
  if (failed) return true
  return ['output', 'data', 'result'].some((key) => isToolFailurePayload(payload[key], depth + 1))
}

export function isConfigurationFailure(content: string): boolean {
  return /\b(?:not configured|no .{1,80} configured|missing (?:the )?.{1,80}(?:credential|configuration|endpoint)|requires? (?:the )?.{1,80}credential|credential .{1,80} missing)\b/i.test(content)
}

export function getMissingRuntimeModule(content: string): string | undefined {
  return content.match(/Cannot find (?:module|package)\s+['"]?([@a-z0-9._/-]+)['"]?/i)?.[1]
}

/**
 * Classifies an error into a structured failure with a code, adaptation strategy,
 * and whether it requires user input. Used by recovery paths to choose an
 * appropriate response instead of repeating the identical failing call.
 */
export function classifyFailure(error: unknown): ClassifiedFailure {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('too large') || lower.includes('context window') || lower.includes('token limit') || lower.includes('request too large') || lower.includes('maximum context') || lower.includes('request size') || lower.includes('irreducible preserved context')) {
    return { code: FAILURE_CODES.REQUEST_TOO_LARGE, message, retryable: true, needsUserInput: false, adaptation: 'rebuild_context' }
  }
  if (lower.includes('exhausted') || lower.includes('no eligible model') || lower.includes('all models unavailable') || lower.includes('model selection') || lower.includes('model routing')) {
    return { code: FAILURE_CODES.MODEL_EXHAUSTED, message, retryable: false, needsUserInput: false, adaptation: 'stop_with_blocker' }
  }
  if (lower.includes('unknown outcome') || lower.includes('outcome unknown') || lower.includes('result unknown') || lower.includes('uncertain') || /outcome.?unknown/.test(lower)) {
    return { code: FAILURE_CODES.OUTCOME_UNKNOWN, message, retryable: false, needsUserInput: false, adaptation: 'stop_with_blocker' }
  }
  if (lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed') || lower.includes('connection') || lower.includes('unavailable') || lower.includes('503') || lower.includes('504') || lower.includes('service') || lower.includes('transient')) {
    return { code: FAILURE_CODES.TRANSIENT_SERVICE_ERROR, message, retryable: true, needsUserInput: false, adaptation: 'retry_with_backoff' }
  }
  if (lower.includes('permission') || lower.includes('not authorized') || lower.includes('access denied') || lower.includes('forbidden') || lower.includes('approval required') || lower.includes('needs approval') || lower.includes('credential') || lower.includes('api key') || lower.includes('not configured') || lower.includes('requires? (?:the )?.{1,80}credential')) {
    return { code: FAILURE_CODES.CREDENTIAL_REQUIRED, message, retryable: false, needsUserInput: true, adaptation: 'request_user_input' }
  }
  if (lower.includes('not configured') || lower.includes('missing credential') || lower.includes('requires credential') || lower.includes('credential missing') || lower.includes('not found') || lower.includes('module not found') || lower.includes('cannot find module') || lower.includes('tool not found') || lower.includes('not in the live system catalog')) {
    return { code: FAILURE_CODES.TOOL_MISSING, message, retryable: true, needsUserInput: true, adaptation: 'select_alternative_tool' }
  }
  return { code: FAILURE_CODES.UNKNOWN_FAILURE, message, retryable: false, needsUserInput: false, adaptation: 'stop_with_blocker' }
}
