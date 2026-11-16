import { classifyFailure, FAILURE_CODES, isConfigurationFailure, getMissingRuntimeModule } from '../services/agent-executor/toolFailures'

describe('Failure classification', () => {
  it('classifies request-too-large errors', () => {
    const result = classifyFailure(new Error('Request too large: 2048 tokens exceeds maximum context window'))
    expect(result.code).toBe(FAILURE_CODES.REQUEST_TOO_LARGE)
    expect(result.retryable).toBe(true)
    expect(result.adaptation).toBe('rebuild_context')
    expect(result.needsUserInput).toBe(false)
  })

  it('classifies model exhaustion errors', () => {
    const result = classifyFailure(new Error('Brain exhausted every eligible model'))
    expect(result.code).toBe(FAILURE_CODES.MODEL_EXHAUSTED)
    expect(result.retryable).toBe(false)
    expect(result.adaptation).toBe('stop_with_blocker')
  })

  it('classifies tool missing errors', () => {
    const result = classifyFailure(new Error('Tool not found: twilio-sms is not in the live system catalog'))
    expect(result.code).toBe(FAILURE_CODES.TOOL_MISSING)
    expect(result.retryable).toBe(true)
    expect(result.adaptation).toBe('select_alternative_tool')
    expect(result.needsUserInput).toBe(true)
  })

  it('classifies credential required errors', () => {
    const result = classifyFailure(new Error('Permission denied: access requires API key configuration'))
    expect(result.code).toBe(FAILURE_CODES.CREDENTIAL_REQUIRED)
    expect(result.retryable).toBe(false)
    expect(result.adaptation).toBe('request_user_input')
    expect(result.needsUserInput).toBe(true)
  })

  it('classifies unknown outcome errors', () => {
    const result = classifyFailure(new Error('Action outcome unknown: the request was interrupted before completion'))
    expect(result.code).toBe(FAILURE_CODES.OUTCOME_UNKNOWN)
    expect(result.retryable).toBe(false)
    expect(result.adaptation).toBe('stop_with_blocker')
  })

  it('classifies transient service errors', () => {
    const result = classifyFailure(new Error('Brain request failed (503): Service Unavailable'))
    expect(result.code).toBe(FAILURE_CODES.TRANSIENT_SERVICE_ERROR)
    expect(result.retryable).toBe(true)
    expect(result.adaptation).toBe('retry_with_backoff')
  })

  it('classifies unknown failures as a fallback', () => {
    const result = classifyFailure(new Error('Something unexpected happened'))
    expect(result.code).toBe(FAILURE_CODES.UNKNOWN_FAILURE)
    expect(result.retryable).toBe(false)
    expect(result.adaptation).toBe('stop_with_blocker')
  })

  it('identifies configuration failures', () => {
    expect(isConfigurationFailure('Tool not configured: missing API key')).toBe(true)
    expect(isConfigurationFailure('Requires the API key credential')).toBe(true)
    expect(isConfigurationFailure('Tool succeeded with output')).toBe(false)
  })

  it('extracts missing runtime modules', () => {
    expect(getMissingRuntimeModule("Cannot find module 'twilio'")).toBe('twilio')
    expect(getMissingRuntimeModule("Cannot find package '@sendgrid/mail'")).toBe('@sendgrid/mail')
    expect(getMissingRuntimeModule('No module error here')).toBeUndefined()
  })
})

describe('Failure recovery adaptations', () => {
  it('does not retry unknown-outcome actions', () => {
    const classified = classifyFailure(new Error('Action outcome unknown: interrupted'))
    expect(classified.retryable).toBe(false)
    expect(classified.adaptation).toBe('stop_with_blocker')
  })

  it('requests exact user input for credential failures', () => {
    const classified = classifyFailure(new Error('Requires the API key credential'))
    expect(classified.code).toBe(FAILURE_CODES.CREDENTIAL_REQUIRED)
    expect(classified.needsUserInput).toBe(true)
    expect(classified.adaptation).toBe('request_user_input')
  })

  it('rebuilds smaller context for request-too-large', () => {
    const classified = classifyFailure(new Error('Request too large: exceeds maximum context window'))
    expect(classified.code).toBe(FAILURE_CODES.REQUEST_TOO_LARGE)
    expect(classified.adaptation).toBe('rebuild_context')
  })

  it('selects alternative tool for tool missing', () => {
    const classified = classifyFailure(new Error('Tool not found: twilio-sms'))
    expect(classified.code).toBe(FAILURE_CODES.TOOL_MISSING)
    expect(classified.adaptation).toBe('select_alternative_tool')
  })

  it('retries with backoff for transient errors', () => {
    const classified = classifyFailure(new Error('Brain request failed (503): Service Unavailable'))
    expect(classified.code).toBe(FAILURE_CODES.TRANSIENT_SERVICE_ERROR)
    expect(classified.adaptation).toBe('retry_with_backoff')
  })
})