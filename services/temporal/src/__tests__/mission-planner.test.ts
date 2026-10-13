import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  Plan,
} from '@stage7-nextgen/shared'
import { generateValidPlan, PlannerCompletionRequest } from '../planner/MissionPlanner'

function validPlan(phaseCount = 3): Plan {
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
        dependsOnTaskIds: [],
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

  it('accepts one phase with more than five dependency-ordered tasks', async () => {
    const manyTaskPlan = validPlan(1)
    const phase = manyTaskPlan.phases[0]!
    let previousTaskId = phase.tasks[0]!.id
    for (let index = 1; index <= 7; index++) {
      const taskId = `phase-1-task-${index}`
      phase.tasks.push({
        id: taskId,
        title: `Complete deliverable part ${index}`,
        description: `Produce part ${index} for the stated goal`,
        agentRole: 'analyst',
        systemPrompt: 'Complete this task for the stated goal.',
        dependsOnTaskIds: [previousTaskId],
        expectedArtifacts: [`deliverable-part-${index}.md`],
        status: 'pending',
        artifacts: [],
      })
      previousTaskId = taskId
    }
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(manyTaskPlan))

    const plan = await generateValidPlan('Build a research plan', {}, 'mission-many-tasks', complete)

    expect(plan.phases).toHaveLength(1)
    expect(plan.phases[0]?.tasks).toHaveLength(8)
    expect(plan.phases[0]?.tasks[7]?.dependsOnTaskIds).toEqual([plan.phases[0]?.tasks[6]?.id])
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('accepts plans with more than seven phases', async () => {
    const manyPhasePlan = validPlan(9)
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(manyPhasePlan))

    const plan = await generateValidPlan('Build a research plan', {}, 'mission-many-phases', complete)

    expect(plan.phases).toHaveLength(9)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('rejects dependency cycles before the plan can reach task selection', async () => {
    const cyclicPlan = validPlan()
    const firstPhase = cyclicPlan.phases[0]!
    const firstTask = firstPhase.tasks[0]!
    const secondTask = { ...firstTask, id: 'phase-1-task-2', title: 'Dependent task' }
    firstTask.dependsOnTaskIds = [secondTask.id]
    secondTask.dependsOnTaskIds = [firstTask.id]
    firstPhase.tasks.push(secondTask)
    const requests: PlannerCompletionRequest[] = []
    const responses = [JSON.stringify(cyclicPlan), JSON.stringify(validPlan())]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[request.attempt - 1]!
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-dependencies', complete)

    expect(plan.phases[0]?.tasks).toHaveLength(1)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.prompt).toContain('dependencies contain a cycle')
  })

  it('keeps asking for corrections when duplicate task IDs persist', async () => {
    const duplicatePlan = validPlan()
    duplicatePlan.phases[1]!.tasks[0]!.id = duplicatePlan.phases[0]!.tasks[0]!.id
    const requests: PlannerCompletionRequest[] = []
    const responses = [
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
    expect(requests.map((request) => request.attempt)).toEqual([1, 2, 3])
    expect(requests[1]?.prompt).toContain('task ids must be globally unique');
    expect(requests[1]?.prompt).toContain('phases[1].tasks[0].id duplicates');
    expect(requests[1]?.prompt).toContain('Do not reuse task IDs across phases');
  })

  it('stops after the bounded planner repair attempts', async () => {
    let calls = 0
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      calls++
      expect(request.attempt).toBe(calls)
      return '{"summary":"still invalid"}'
    }

    await expect(generateValidPlan('Create a business plan', {}, 'mission-3', complete))
      .rejects.toThrow('Unable to generate a valid mission plan after 3 attempts')

    expect(calls).toBe(3)
  })

  it('fails only when Brain reports that every eligible model is exhausted', async () => {
    let calls = 0
    const complete = async (): Promise<string> => {
      calls++
      if (calls === 1) return '{"summary":"still invalid"}'
      throw new Error(`${BRAIN_MODEL_SELECTION_EXHAUSTED}: all eligible models tried`)
    }

    await expect(generateValidPlan('Create a business plan', {}, 'mission-4', complete))
      .rejects.toThrow('Brain exhausted every eligible model')
    expect(calls).toBe(2)
  })

  it('does not retry unrelated Planner or control-plane errors indefinitely', async () => {
    const complete = jest.fn(async (): Promise<string> => {
      throw new Error('Agent Runtime unavailable')
    })

    await expect(generateValidPlan('Create a business plan', {}, 'mission-5', complete))
      .rejects.toThrow('Planner Agent request failed on attempt 1: Agent Runtime unavailable')
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
