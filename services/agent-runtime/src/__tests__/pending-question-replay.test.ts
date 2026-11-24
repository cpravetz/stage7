import { ASK_USER_MARKER } from '../services/agent-executor/constants'
import { isPendingQuestionResult } from '../services/PersistentAgentRuntime'

describe('isPendingQuestionResult', () => {
  it('treats an ask-user output as a pending question that must not be replayed from a cached receipt', () => {
    expect(isPendingQuestionResult({ output: `${ASK_USER_MARKER}Which recipient should I use?` })).toBe(true)
    expect(isPendingQuestionResult({ output: `  ${ASK_USER_MARKER}Which recipient should I use?` })).toBe(true)
  })

  it('treats a real deliverable as a completed result', () => {
    expect(isPendingQuestionResult({ output: '## sms_report.md\nSummary: the report was sent.' })).toBe(false)
    // A deliverable that merely mentions the marker mid-text is still a real answer.
    expect(isPendingQuestionResult({ output: `Use the ${ASK_USER_MARKER} marker only when blocked.` })).toBe(false)
  })

  it('handles missing or non-string output', () => {
    expect(isPendingQuestionResult(undefined)).toBe(false)
    expect(isPendingQuestionResult({})).toBe(false)
    expect(isPendingQuestionResult({ output: 42 })).toBe(false)
  })
})