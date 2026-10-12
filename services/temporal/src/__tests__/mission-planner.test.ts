import { generateValidPlan, PlannerCompletionRequest } from '../planner/MissionPlanner'

function validPlan(phaseCount = 3) {
  return {
    summary: 'A goal-specific execution plan',
    estimatedDuration: 'One week',
    estimatedCost: 'Low',
    requiresClarification: false,
    clarificationQuestions: [],
    phases: Array.from({ length: phaseCount }, (_, phaseIndex) => ({
      id: `phase-${phaseIndex + 1}`,
      name: `Deliverable ${phaseIndex + 1}`,
      goal: `Produce deliverable ${phaseIndex + 1}`,
      requiresApproval: false,
      status: 'pending',
      tasks: [{
        id: `task-${phaseIndex + 1}`,
        title: `Complete deliverable ${phaseIndex + 1}`,
        description: `Produce deliverable ${phaseIndex + 1} for the stated goal`,
        agentRole: 'analyst',
        systemPrompt: 'Complete this task for the stated goal.',
        expectedArtifacts: [`deliverable-${phaseIndex + 1}.md`],
        status: 'pending',
        artifacts: [],
      }],
    })),
  }
}

describe('generateValidPlan', () => {
  it('asks Brain to amend a schema-invalid response and returns only the corrected plan', async () => {
    const requests: PlannerCompletionRequest[] = []
    let responseIndex = 0
    const responses = [
      '{"summary":"incomplete"}',
      JSON.stringify(validPlan()),
    ]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[responseIndex++]!
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-1', complete)

    expect(plan.summary).toBe('A goal-specific execution plan')
    expect(requests).toHaveLength(2)
    expect(requests[0]?.maxTokens).toBe(4096)
    expect(requests[1]?.prompt).toContain('Your previous plan was rejected')
    expect(requests[1]?.prompt).toContain('estimatedDuration')
    expect(requests[1]?.prompt).toContain('Previous response')
    expect(requests[1]?.prompt).toContain('incomplete')
  })

  it('asks Brain to amend a plan that violates phase-count standards', async () => {
    const requests: PlannerCompletionRequest[] = []
    let responseIndex = 0
    const responses = [
      JSON.stringify(validPlan(1)),
      JSON.stringify(validPlan(3)),
    ]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[responseIndex++]!
    }

    const plan = await generateValidPlan('Build a research plan', {}, 'mission-2', complete)

    expect(plan.phases).toHaveLength(3)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.prompt).toContain('phases must contain 3-7 phases')
  })

  it('keeps asking for corrections when duplicate task IDs persist', async () => {
    const duplicatePlan = validPlan()
    duplicatePlan.phases[1]!.tasks[0]!.id = duplicatePlan.phases[0]!.tasks[0]!.id
    const requests: PlannerCompletionRequest[] = []
    const responses = [
      JSON.stringify(duplicatePlan),
      JSON.stringify(duplicatePlan),
      JSON.stringify(duplicatePlan),
      JSON.stringify(validPlan()),
    ]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[request.attempt - 1]!
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-duplicates', complete)

    expect(plan.phases[1]?.tasks[0]?.id).not.toBe(plan.phases[0]?.tasks[0]?.id)
    expect(requests.map((request) => request.attempt)).toEqual([1, 2, 3, 4])
    expect(requests[1]?.prompt).toContain('task ids must be globally unique');
    expect(requests[1]?.prompt).toContain('phases[1].tasks[0].id duplicates');
    expect(requests[1]?.prompt).toContain('Do not reuse task IDs across phases');
  })

  it('fails explicitly after bounded repair attempts instead of returning a generic plan', async () => {
    let calls = 0
    const complete = async (): Promise<string> => {
      calls++
      return '{"summary":"still invalid"}'
    }

    await expect(generateValidPlan('Create a business plan', {}, 'mission-3', complete))
      .rejects.toThrow('Unable to generate a valid mission plan after 6 attempts')
    expect(calls).toBe(6)
  })
})
