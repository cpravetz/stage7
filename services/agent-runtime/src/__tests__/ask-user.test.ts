import { ActionExecutor } from '../services/agent-executor/ActionExecutor'
import { ASK_USER_MARKER } from '../services/agent-executor/constants'
import { isAskUserTool } from '../services/agent-executor/constants'
import {
  asksUserForRawCredential,
  asksUserToChoosePreference,
  asksUserToDiagnoseToolOrChooseAlternative,
  asksUserToRepeatQuestion,
  asksUserToManageTools,
  extractAskUserQuestion,
} from '../services/agent-executor/askUser'

const ctx = { missionId: 'm1' } as any
const def = { id: 'agent-x' } as any
const policy = { mode: 'auto' } as any

function executor() {
  return new ActionExecutor(
    { reportComplaint: jest.fn() } as any,
    { createTool: jest.fn() } as any,
    { run: jest.fn() } as any,
  )
}

describe('ask-user intent handling', () => {
  it('recognizes ask-user regardless of casing/spacing', () => {
    for (const name of ['__ASK_USER__', '__ask_user__', 'ask_user', 'ask-user', 'AskUser']) {
      expect(isAskUserTool(name)).toBe(true)
    }
    for (const name of ['email_sender', 'webhook_dispatcher', '', undefined, null]) {
      expect(isAskUserTool(name as any)).toBe(false)
    }
  })

  it('executes a lowercase __ask_user__ action as a question, not an unknown tool', async () => {
    const result = await executor().execute(
      { tool: '__ask_user__', args: { question: 'Which value should I use?' } } as any,
      [],
      def,
      ctx,
      policy,
    )
    expect(result.outcome).toBe('question_asked')
    expect(result.content).toBe(`${ASK_USER_MARKER}${JSON.stringify({ question: 'Which value should I use?' })}`)
    expect(result.content).not.toContain('absent from the live tool catalog')
  })

  it('still rejects a genuinely unknown tool', async () => {
    const brain = { reportComplaint: jest.fn() } as any
    const result = await new ActionExecutor(brain, { createTool: jest.fn() } as any, { run: jest.fn() } as any)
      .execute({ tool: 'totally_unknown_tool', args: {} } as any, [], def, ctx, policy)
    expect(result.isError).toBe(true)
    expect(result.content).toContain('is not in the live system catalog')
    expect(brain.reportComplaint).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining('absent from the live tool catalog'),
      'm1',
    )
  })

  it('treats "provide the base URL for the X tool" as tool setup, not a user question', () => {
    expect(asksUserToManageTools('Please provide the email platform base URL for the Marketing Email tool.')).toBe(true)
    expect(asksUserToManageTools('Enter the SMTP host and port so I can send the message.')).toBe(true)
  })

  it('does not classify a pure named-secret ask as tool setup', () => {
    expect(asksUserToManageTools('Please provide the SMS service API token.')).toBe(false)
  })

  it('recognizes free-text requests for secrets', () => {
    expect(asksUserForRawCredential('Please provide the API key for the SMS Sender tool.')).toBe(true)
    expect(asksUserForRawCredential('Please provide the service token.')).toBe(true)
    expect(asksUserForRawCredential('Which sender number should I use?')).toBe(false)
  })

  it('recognizes preference questions that ask the agent to make the decision', () => {
    expect(asksUserToChoosePreference(
      'What specific type of automated online service business are you interested in exploring, such as SaaS or digital content?',
    )).toBe(true)
    expect(asksUserToChoosePreference('Which option do you prefer?')).toBe(true)
    expect(asksUserToChoosePreference('What is the recipient email address?')).toBe(false)
  })

  it('recognizes tool-diagnosis and tool-alternative questions the agent should resolve', () => {
    expect(asksUserToDiagnoseToolOrChooseAlternative(
      "What is the issue with the 'healthcare-patient-communication' tool, and do we need to consider a different tool for sending SMS?",
    )).toBe(true)
    expect(asksUserToDiagnoseToolOrChooseAlternative(
      'Should we switch to another integration after this tool failed?',
    )).toBe(true)
    expect(asksUserToDiagnoseToolOrChooseAlternative(
      'Which phone number should receive the SMS?',
    )).toBe(false)
  })

  it('recognizes repeated questions while allowing a focused follow-up', () => {
    const previous = 'What is your startup budget?'
    expect(asksUserToRepeatQuestion('What is your startup budget?', previous)).toBe(true)
    expect(asksUserToRepeatQuestion('Please tell me about your startup budget.', previous)).toBe(true)
    expect(asksUserToRepeatQuestion('Could you clarify your startup budget?', previous)).toBe(false)
    expect(asksUserToRepeatQuestion('What is the recipient email address?', previous)).toBe(false)
    expect(asksUserToRepeatQuestion('What is your startup budget?', undefined)).toBe(false)
  })

  it('strips a trailing </your_previous_reply> transcript tag from an extracted question', () => {
    const content = `${ASK_USER_MARKER}Please provide the SMS service API token for this tool.\n</your_previous_reply>`
    expect(extractAskUserQuestion(content)).toBe(
      `${ASK_USER_MARKER}Please provide the SMS service API token for this tool.`,
    )
  })

  it('drops content that follows an echoed transcript tag', () => {
    const content = `${ASK_USER_MARKER}Please provide the API token.</your_previous_reply>\n<system_feedback>some feedback</system_feedback>`
    expect(extractAskUserQuestion(content)).toBe(`${ASK_USER_MARKER}Please provide the API token.`)
  })
})