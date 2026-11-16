export interface FeatureClassification {
  code: string
  message: string
  retryable: boolean
  needsUserInput: boolean
  missingFields?: string[]
  adaptation?: 'rebuild_context' | 'select_alternative_tool' | 'request_user_input' | 'stop_with_blocker' | 'retry_with_backoff'
}

export function classifyError(error: unknown): FeatureClassification {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  if (lower.includes('too large') || lower.includes('context window') || lower.includes('token limit') || lower.includes('request too large') || lower.includes('maximum context')) {
    return { code: 'REQUEST_TOO_LARGE', message, retryable: true, needsUserInput: false, adaptation: 'rebuild_context' }
  }
  if (lower.includes('exhausted') || lower.includes('no eligible model') || lower.includes('all models unavailable') || lower.includes('model selection')) {
    return { code: 'MODEL_EXHAUSTED', message, retryable: false, needsUserInput: false, adaptation: 'stop_with_blocker' }
  }
  if (lower.includes('not configured') || lower.includes('missing credential') || lower.includes('requires credential') || lower.includes('credential missing') || lower.includes('not found') || lower.includes('module not found') || lower.includes('cannot find module')) {
    return { code: 'TOOL_MISSING', message, retryable: true, needsUserInput: true, adaptation: 'select_alternative_tool' }
  }
  if (lower.includes('permission') || lower.includes('not authorized') || lower.includes('access denied') || lower.includes('forbidden')) {
    return { code: 'CREDENTIAL_REQUIRED', message, retryable: false, needsUserInput: true, adaptation: 'request_user_input' }
  }
  if (lower.includes('unknown outcome') || lower.includes('outcome unknown') || lower.includes('result unknown') || lower.includes('uncertain')) {
    return { code: 'OUTCOME_UNKNOWN', message, retryable: false, needsUserInput: false, adaptation: 'stop_with_blocker' }
  }
  if (lower.includes('timeout') || lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed') || lower.includes('connection') || lower.includes('unavailable') || lower.includes('503') || lower.includes('504') || lower.includes('service')) {
    return { code: 'TRANSIENT_SERVICE_ERROR', message, retryable: true, needsUserInput: false, adaptation: 'retry_with_backoff' }
  }
  return { code: 'UNKNOWN_FAILURE', message, retryable: false, needsUserInput: false, adaptation: 'stop_with_blocker' }
}