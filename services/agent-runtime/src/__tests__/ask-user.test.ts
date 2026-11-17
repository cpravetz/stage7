import { ActionExecutor } from '../services/agent-executor/ActionExecutor'
import { ASK_USER_MARKER } from '../services/agent-executor/constants'
import { isAskUserTool } from '../services/agent-executor/constants'
import { asksUserToManageTools } from '../services/agent-executor/askUser'

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
})