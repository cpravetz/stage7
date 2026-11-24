import { Plan } from '@stage7-nextgen/shared'
import { runMissionDirect } from '../src/activities/missionActivity'
import { MissionOrchestrator } from '../src/planner/MissionOrchestrator'
import { WorkflowInput } from '../src/types/workflow'

describe('runMissionDirect', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps the in-process fallback outside Temporal activity context', async () => {
    const plan: Plan = {
      summary: 'Clarify the requested outcome',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: true,
      clarificationQuestions: ['Which environment should be targeted?'],
      clarificationAnswers: [],
      phases: [],
    }
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run').mockResolvedValue({
      plan,
      outputs: { status: 'awaiting_clarification' },
      compensations: [],
    })
    const input: WorkflowInput = {
      missionId: 'mission-local',
      tenantId: 'tenant-1',
      assistantId: 'assistant-1',
      prompt: 'Deploy the application',
    }

    await expect(runMissionDirect(input)).resolves.toEqual({
      plan,
      outputs: { status: 'awaiting_clarification' },
      compensations: [],
    })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      missionId: input.missionId,
    }))
    expect(run.mock.calls[0]?.[0].resumePlan).toBeUndefined()
  })

  it('restores user messages in order on direct mission resume', async () => {
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run').mockResolvedValue({
      plan: { summary: '', estimatedDuration: '', estimatedCost: '', requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [], phases: [] },
      outputs: {}, compensations: [],
    })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ events: [
        { type: 'user', data: { role: 'user', content: 'Use secret:provider_key.' } },
        { type: 'agent_response', data: { role: 'assistant', content: 'Please provide credentials.' } },
        { type: 'user', data: { role: 'user', content: 'They are already in the vault.' } },
      ] }),
    } as Response)
    await runMissionDirect({
      missionId: 'mission-context', tenantId: 'tenant-1', assistantId: 'assistant-1',
      prompt: 'Complete the work', interactionResponse: 'They are already in the vault.',
    }, { version: 1 })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Complete the work',
      userMessages: ['Use secret:provider_key.', 'They are already in the vault.'],
    }))
  })

  it('does not resume without the persisted conversation when Artifacts fails', async () => {
    const run = jest.spyOn(MissionOrchestrator.prototype, 'run')
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(runMissionDirect({
      missionId: 'mission-context', tenantId: 'tenant-1', assistantId: 'assistant-1',
      prompt: 'Complete the work',
    }, { version: 1 })).rejects.toThrow('Failed to load mission user messages')
    expect(run).not.toHaveBeenCalled()
  })
})