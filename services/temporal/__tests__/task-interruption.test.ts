import { parseInterruption } from '../src/agent/TaskInterruption'

const ASK_USER_MARKER = '__ASK_USER__:'

describe('parseInterruption question sanitization', () => {
  it('strips a trailing </your_previous_reply> transcript tag from a plain-text question', () => {
    const output = `${ASK_USER_MARKER}Please provide the SMS service API token for this tool.\n</your_previous_reply>`
    const interruption = parseInterruption(output)
    expect(interruption?.kind).toBe('user_input')
    expect(interruption?.question).toBe('Please provide the SMS service API token for this tool.')
    expect(interruption?.question).not.toContain('your_previous_reply')
  })

  it('strips transcript scaffolding tags that wrap the question text', () => {
    const output = `${ASK_USER_MARKER}<your_previous_reply>Please provide the API token.</your_previous_reply>`
    const interruption = parseInterruption(output)
    expect(interruption?.question).toBe('Please provide the API token.')
    expect(interruption?.question).not.toMatch(/your_previous_reply|system_feedback|<\/?task>/i)
  })

  it('strips transcript tags from a JSON credential-request question', () => {
    const output = `${ASK_USER_MARKER}${JSON.stringify({
      question: 'Please provide API token for Protected API in the secure form below so I can continue. </your_previous_reply>',
      credentialRequest: {
        executionId: 'exec-1',
        toolId: 'protected-api',
        toolName: 'Protected API',
        missingCredentials: [{ key: 'apiToken', label: 'API token' }],
      },
    })}`
    const interruption = parseInterruption(output)
    expect(interruption?.question).toBe(
      'Please provide API token for Protected API in the secure form below so I can continue.',
    )
    expect(interruption?.credentialRequest?.missingCredentials).toEqual([
      { key: 'apiToken', label: 'API token' },
    ])
  })

  it('still throws for a question that becomes empty after stripping tags', () => {
    const output = `${ASK_USER_MARKER}</your_previous_reply>`
    expect(() => parseInterruption(output)).toThrow(/empty question/i)
  })
})