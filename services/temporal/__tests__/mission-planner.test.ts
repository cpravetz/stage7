import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  Plan,
  Task,
} from '@stage7-nextgen/shared'
import {
  generateValidPlan,
  missionTaskActionIssues,
  missionTaskDependencyIssues,
  PLANNER_SYSTEM_PROMPT,
  PlannerCompletionRequest,
} from '../src/planner/MissionPlanner'

function validPlan(phaseCount = 3): Plan {
  return {
    summary: 'A goal-specific execution plan',
    estimatedDuration: 'One week',
    estimatedCost: 'Low',
    requiresClarification: false,
    clarificationQuestions: [],
    clarificationAnswers: [],
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
        requiredActions: [],
        status: 'pending',
        artifacts: [],
      }],
    })),
  }
}

describe('generateValidPlan', () => {
  it('plans outcomes separately from actions without assuming a specific implementation capability', () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain('Never choose, name, create, configure, or prescribe tools')
    expect(PLANNER_SYSTEM_PROMPT).toContain('separate those tasks and make the action depend on the output task')
    expect(PLANNER_SYSTEM_PROMPT).toContain('create an artifact containing that output')
    expect(PLANNER_SYSTEM_PROMPT).toContain('Always leave requiredActions=[]')
  })

  it('folds intermediate capability setup into the operational task when the user requested an action', async () => {
    const plan = validPlan(2)
    plan.summary = 'Plan to create a messaging service then use it to send the requested message'
    plan.phases[0]!.tasks = [{
      id: 'phase-1-task-1',
      title: 'Create a messaging service',
      description: 'Develop a service for sending messages.',
      agentRole: 'Developer',
      systemPrompt: 'Develop a service that sends a message.',
      dependsOnTaskIds: [],
      expectedArtifacts: ['phase-1-task-1-executable'],
      requiredActions: [],
      status: 'pending',
      artifacts: [],
    }]
    plan.phases[1]!.tasks = [{
      id: 'phase-2-task-1',
      title: 'Send the message using the messaging service tool',
      description: 'Use the developed messaging service to send the requested message.',
      agentRole: 'Agent',
      systemPrompt: 'Use the messaging service created in phase-1-task-1 to send the requested message. The tool output should include a receipt.',
      dependsOnTaskIds: ['phase-1-task-1'],
      expectedArtifacts: ['sent-message-receipt'],
      requiredActions: [],
      status: 'pending',
      artifacts: [],
    }]
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan(
      'Send the requested message. You do not have a messaging tool yet, so create one.',
      {},
      'mission-capability-setup',
      complete,
    )

    expect(generated.phases).toHaveLength(1)
    expect(generated.phases[0]?.tasks).toHaveLength(1)
    expect(generated.phases[0]?.tasks[0]).toEqual(expect.objectContaining({
      id: 'phase-2-task-1',
      title: 'Send the message',
      expectedArtifacts: [],
      dependsOnTaskIds: [],
    }))
    expect(generated.phases[0]?.tasks[0]?.systemPrompt).toContain('send the requested message')
    expect(generated.phases[0]?.tasks[0]?.systemPrompt).toContain('the action result')
    expect(generated.phases[0]?.tasks[0]?.systemPrompt).not.toMatch(/\btool\b|\bprovider\b|\bapi\b/i)
    expect(generated.phases[0]?.tasks[0]?.systemPrompt).not.toContain('messaging service created in')
    expect(generated.phases[0]?.tasks[0]?.systemPrompt).not.toContain('tool output')
    expect(generated.summary).toBe('Send the message')
  })

  it('converts preparation and capability-artifact plans into actual action tasks', async () => {
    const plan = validPlan(4)
    const makeTask = (id: string, title: string, expectedArtifacts: string[]) => ({
      id,
      title,
      description: title,
      agentRole: 'Mission Agent',
      systemPrompt: title,
      dependsOnTaskIds: [],
      expectedArtifacts,
      requiredActions: [],
      status: 'pending' as const,
      artifacts: [],
    })
    plan.summary = 'Create text and email services, then send both messages'
    plan.phases[0]!.tasks = [makeTask('text-content-task', 'Generate text content', ['text-content'])]
    plan.phases[1]!.tasks = [makeTask('email-content-task', 'Generate email content', ['email-content'])]
    plan.phases[2]!.tasks = [makeTask('text-service-task', 'Create and configure text tool', ['text_tool_configuration'])]
    plan.phases[3]!.tasks = [makeTask('email-service-task', 'Create and configure email tool', ['email_tool_configuration'])]
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan(
      'Send a text to 347-882-8389 that reads "Watson, come here." You do not have text services or tools yet - you will need to create them. Send the same message as an email to chris@pravetz.net.',
      {},
      'mission-capability-artifact-plan',
      complete,
    )
    const tasks = generated.phases.flatMap((phase) => phase.tasks)

    expect(tasks).toHaveLength(2)
    expect(tasks.map((task) => task.title)).toEqual(['Send text', 'Send email'])
    expect(tasks.every((task) => (task.expectedArtifacts || []).length === 0)).toBe(true)
    expect(tasks.every((task) => (task.dependsOnTaskIds || []).length === 0)).toBe(true)
    expect(tasks.every((task) => !/\btool\b|\bprovider\b|\bapi\b/i.test(task.systemPrompt))).toBe(true)
    expect(tasks.every((task) => task.systemPrompt.includes('Watson, come here.'))).toBe(true)
    expect(tasks.some((task) => /create (?:text|email) service/i.test(task.title))).toBe(false)
  })

  it('converts invented delivery-plan artifacts into the requested external actions', async () => {
    const plan = validPlan(2)
    plan.phases[0]!.tasks[0] = {
      ...plan.phases[0]!.tasks[0]!,
      title: 'Plan text message delivery',
      description: 'Plan text message delivery.',
      systemPrompt: 'Create a text_message_delivery_plan.md artifact.',
      expectedArtifacts: ['text_message_delivery_plan.md'],
    }
    plan.phases[1]!.tasks[0] = {
      ...plan.phases[1]!.tasks[0]!,
      title: 'Plan email delivery',
      description: 'Plan email delivery.',
      systemPrompt: 'Create an email_delivery_plan.md artifact.',
      expectedArtifacts: ['email_delivery_plan.md'],
    }
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))
    const missionGoal =
      'Send a text to 347-772-8389 that reads "Watson, come here." You do not have text services or tools yet - you will need to create them. Send the same message as an email to chris@pravetz.net.'

    const generated = await generateValidPlan(missionGoal, {}, 'mission-delivery-plan-artifacts', complete)
    const tasks = generated.phases.flatMap((phase) => phase.tasks)

    expect(tasks.map((task) => task.title)).toEqual(['Send text message', 'Send email'])
    expect(tasks.every((task) => (task.expectedArtifacts || []).length === 0)).toBe(true)
    expect(tasks.map((task) => task.requiredActions)).toEqual([[], []])
    expect(tasks.every((task) => task.systemPrompt.includes('347-772-8389'))).toBe(true)
    expect(tasks.every((task) => task.systemPrompt.includes('chris@pravetz.net'))).toBe(true)
    expect(tasks.every((task) => !/\btool\b|\bprovider\b|\bapi\b/i.test(task.systemPrompt))).toBe(true)
  })

  it('does not require incidental message IDs for action-only tasks', async () => {
    const plan = validPlan(1)
    plan.phases[0]!.tasks[0]!.title = 'Send the SMS'
    plan.phases[0]!.tasks[0]!.expectedArtifacts = ['sms_message_id', 'sms_message_status']
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan(
      'Send a text message to 347-772-8389.',
      {},
      'mission-incidental-sms-evidence',
      complete,
    )

    expect(generated.phases[0]?.tasks[0]?.expectedArtifacts).toEqual([])
    expect(generated.phases[0]?.tasks[0]?.requiredActions).toEqual([])
  })

  it('converts service design plans without artifact declarations into outcome tasks', async () => {
    const plan = validPlan(4)
    const makeTask = (id: string, title: string) => ({
      id,
      title,
      description: title,
      agentRole: 'System',
      systemPrompt: title,
      dependsOnTaskIds: [],
      expectedArtifacts: [],
      requiredActions: [],
      status: 'pending' as const,
      artifacts: [],
    })
    plan.summary = 'Create text and email services'
    plan.phases[0]!.tasks = [makeTask('text-design', 'Design Text Service')]
    plan.phases[1]!.tasks = [makeTask('text-create', 'Create Text Service')]
    plan.phases[2]!.tasks = [makeTask('email-design', 'Design Email Service')]
    plan.phases[3]!.tasks = [makeTask('email-create', 'Create Email Service')]
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan(
      'Send a text to 347-882-8389 that reads "Watson, come here." You do not have text services or tools yet - you will need to create them. Send the same message as an email to chris@pravetz.net.',
      {},
      'mission-capability-setup-no-artifacts',
      complete,
    )
    const tasks = generated.phases.flatMap((phase) => phase.tasks)

    expect(tasks.map((task) => task.title)).toEqual(['Send Text', 'Send Email'])
    expect(tasks.every((task) => (task.requiredActions || []).length === 0)).toBe(true)
    expect(tasks.every((task) => (task.expectedArtifacts || []).length === 0)).toBe(true)
  })

  it('preserves a capability setup task when the user explicitly requests a reusable deliverable', async () => {
    const plan = validPlan(2)
    plan.phases[0]!.tasks[0] = {
      ...plan.phases[0]!.tasks[0]!,
      title: 'Create a messaging service',
      description: 'Develop a reusable service for sending messages.',
      systemPrompt: 'Develop a reusable messaging service.',
      expectedArtifacts: ['messaging-service'],
    }
    plan.phases[1]!.tasks[0] = {
      ...plan.phases[1]!.tasks[0]!,
      title: 'Send the message',
      description: 'Use the developed messaging service to send the requested message.',
      systemPrompt: 'Use the messaging service created in task-1 to send the requested message.',
      dependsOnTaskIds: ['task-1'],
    }
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan(
      'Create a reusable messaging service as a deliverable, then send the requested message.',
      {},
      'mission-reusable-capability',
      complete,
    )

    expect(generated.phases).toHaveLength(2)
    expect(generated.phases[0]?.tasks[0]?.expectedArtifacts).toEqual(['messaging-service'])
    expect(generated.phases[1]?.tasks[0]?.dependsOnTaskIds).toEqual(['task-1'])
  })

  it('fills only unambiguous initial planning defaults locally', async () => {
    const plan = validPlan(1)
    delete (plan.phases[0] as any).requiresApproval
    delete (plan.phases[0]!.tasks[0] as any).status
    delete (plan.phases[0]!.tasks[0] as any).dependsOnTaskIds
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan('Create a business plan', {}, 'mission-planner-defaults', complete)

    expect(generated.phases[0]?.requiresApproval).toBe(false)
    expect(generated.phases[0]?.tasks[0]?.status).toBe('pending')
    expect(generated.phases[0]?.tasks[0]?.dependsOnTaskIds).toEqual([])
    expect(complete).toHaveBeenCalledTimes(1)
  })

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
    const reportValidation = jest.fn(async (_reason: string) => {})

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-1', complete, reportValidation)

    expect(plan.summary).toBe('A goal-specific execution plan')
    expect(reportValidation).toHaveBeenCalledTimes(1)
    expect(reportValidation).toHaveBeenCalledWith(expect.stringContaining('Phases are required'))
    expect(requests).toHaveLength(2)
    expect(requests[0]?.maxTokens).toBe(8192)
    expect(requests[1]?.prompt).toContain('Make only these')
    expect(requests[1]?.prompt).toContain('correction(s) to the plan below')
    expect(requests[1]?.prompt).toContain('Phases are required')
    expect(requests[1]?.prompt).toContain('Plan:')
    expect(requests[1]?.prompt).toContain('incomplete')
    expect(requests[1]?.prompt).not.toContain('Create a plan to achieve this goal')
    expect(requests[1]?.systemPrompt).toContain('editing an existing mission plan')
  })

  it('repairs malformed deliverable values and ignores action metadata', async () => {
    const invalidPlan = validPlan(1)
    const task = invalidPlan.phases[0]!.tasks[0]!
    task.expectedArtifacts = [{ name: 'sent-message.txt' }] as any
    task.requiredActions = ['textMessageSentConfirmation'] as any
    task.systemPrompt = 'Call textMessageSentConfirmation to send the requested message.'
    const requests: PlannerCompletionRequest[] = []
    const responses = [JSON.stringify(invalidPlan), JSON.stringify('sent-message.txt')]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[request.attempt - 1]!
    }

    const plan = await generateValidPlan('Send the requested message', {}, 'mission-focused-value-repair', complete)

    expect(plan.phases[0]?.tasks[0]?.expectedArtifacts).toEqual(['sent-message.txt'])
    expect(plan.phases[0]?.tasks[0]?.requiredActions).toEqual([])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.prompt).toContain('phases[0].tasks[0].expectedArtifacts[0]')
    expect(requests[1]?.prompt).toContain('Return only the replacement value as valid JSON')
    expect(requests[1]?.prompt).not.toContain('Plan:')
    expect(requests[1]?.prompt).not.toContain('"phases"')
  })

  it('discards required action metadata from the plan', async () => {
    const invalidPlan = validPlan(1)
    const task = invalidPlan.phases[0]!.tasks[0]!
    task.systemPrompt = 'Call sendMessage to send the requested message.'
    task.requiredActions = [{ toolId: 'sendMessage' }] as any
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(invalidPlan))
    const plan = await generateValidPlan('Send the requested message', {}, 'mission-missing-action-outcome', complete)

    expect(plan.phases[0]?.tasks[0]?.requiredActions).toEqual([])
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed required action outcome values without replacing the plan', async () => {
    const invalidPlan = validPlan(1)
    const task = invalidPlan.phases[0]!.tasks[0]!
    task.systemPrompt = 'Call sendMessage to send the requested message.'
    task.requiredActions = [{ toolId: 'sendMessage', outcome: 'completed' }] as any
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(invalidPlan))
    const plan = await generateValidPlan('Send the requested message', {}, 'mission-invalid-action-outcome', complete)

    expect(plan.phases[0]?.tasks[0]?.requiredActions).toEqual([])
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('stops after repeated failed plan repairs', async () => {
    const invalidPlan = validPlan(1)
    invalidPlan.phases[0]!.tasks[0]!.expectedArtifacts = [{ name: 'result.md' }] as any
    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return request.attempt === 1
        ? JSON.stringify(invalidPlan)
        : 'not valid JSON'
    }

    await expect(generateValidPlan('Send the requested message', {}, 'mission-bounded-repair', complete))
      .rejects.toThrow('could not produce a valid plan after 5 repair attempts')

    expect(requests).toHaveLength(6)
    expect(requests.slice(1).every((request) => !request.prompt.includes('"phases"'))).toBe(true)
  })

  it('repairs plans that assign executable work to a human role', async () => {
    const humanRolePlan = validPlan()
    humanRolePlan.phases[0]!.tasks[0]!.agentRole = 'Human'
    const requests: PlannerCompletionRequest[] = []
    const responses = [JSON.stringify(humanRolePlan), JSON.stringify(validPlan())]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[request.attempt - 1]!
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-human-role', complete)

    expect(plan.phases[0]?.tasks[0]?.agentRole).toBe('analyst')
    expect(requests[1]?.prompt).toContain('agentRole "Human" is not executable')
    expect(requests[1]?.systemPrompt).toContain('editing an existing mission plan')
  })

  it('does not make the planner specify tools or delegation for an outcome task', async () => {
    const invalidPlan = validPlan(1)
    const task = invalidPlan.phases[0]!.tasks[0]!
    task.description = 'Delegate a child Agent to compute 29 multiplied by 41.'
    task.systemPrompt =
      'Use the calculate tool to compute 31 multiplied by 37. Also delegate a child Agent to compute 29 multiplied by 41 using the calculate tool.'
    task.requiredActions = []
    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return JSON.stringify(invalidPlan)
    }

    const plan = await generateValidPlan('Delegate and calculate', {}, 'mission-action-contract', complete)

    expect(plan.phases[0]?.tasks[0]?.requiredActions).toEqual([])
    expect(requests).toHaveLength(1)
  })

  it('removes tool receipts from plans even when the goal mentions a generated tool', async () => {
    const invalidPlan = validPlan(1)
    invalidPlan.phases[0]!.tasks[0]!.requiredActions = [
      { toolId: '__list_tools', outcome: 'success' },
    ]
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(invalidPlan))

    const plan = await generateValidPlan('Create and verify a generated tool', {}, 'mission-tool-instruction-repair', complete)

    expect(plan.phases[0]?.tasks[0]?.requiredActions).toEqual([])
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('keeps task planning outcome-focused for work that may need a tool', async () => {
    const planResponse = validPlan(1)
    const task = planResponse.phases[0]!.tasks[0]!
    task.title = 'Deliver SMS notifications'
    task.description = 'Send the requested notification through the approved channel.'
    task.systemPrompt = 'Ensure the recipient receives the exact approved message and report the delivery result.'
    const complete = jest.fn(async () => JSON.stringify(planResponse))

    const plan = await generateValidPlan('Send an SMS notification', {}, 'mission-outcome-focused', complete)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(plan.phases[0]?.tasks[0]?.systemPrompt).toBe(task.systemPrompt)
    expect(plan.phases[0]?.tasks[0]?.requiredActions).toEqual([])
  })

  it('distinguishes direct tool calls from child instructions, receipt labels, policy prose, and prohibited retries', () => {
    const actionCases: Array<Pick<Task, 'systemPrompt' | 'requiredActions'>> = [
      {
        systemPrompt:
          'Use the __delegate tool to instruct a child agent to calculate 29*41 using the calculate tool. Consume and preserve the returned result from the child agent.',
        requiredActions: [{ toolId: '__delegate', outcome: 'success' }],
      },
      {
        systemPrompt:
          "Actually invoke the 'search_web' tool exactly once. The Agent tool policy allows only 'calculate'. Record the denied receipt; do not retry search_web or work around the policy.",
        requiredActions: [{ toolId: 'search_web', outcome: 'denied' }],
      },
      {
        systemPrompt:
          "Invoke the registered 'calculate' tool with invalid input and record the failure receipt as artifact 'calculate-2star-failure-receipt'. Then recover by invoking calculate with '2+2' and record the success receipt as artifact 'calculate-2plus2-success-receipt'.",
        requiredActions: [
          { toolId: 'calculate', outcome: 'failure' },
          { toolId: 'calculate', outcome: 'success' },
        ],
      },
      {
        systemPrompt:
          'Call the exact tool stage7_mission_calculator_20261102_01 with left=19 and right=23. If the tool call succeeds, report its result; if the tool call fails, stop and report the exact failure.',
        requiredActions: [{ toolId: 'stage7_mission_calculator_20261102_01', outcome: 'success' }],
      },
      {
        systemPrompt:
          "If evidence is missing, repair the gap by re-executing the specific deficient task and then re-validate the persisted receipts.",
        requiredActions: [],
      },
    ]

    for (const actionCase of actionCases) {
      expect(missionTaskActionIssues(actionCase, 'phase-task', new Set(['phase-5-task-1']))).toEqual([])
    }
  })

  it('does not treat articles and demonstratives as explicit tool IDs', () => {
    for (const systemPrompt of [
      'Use the tool to create the requested plugin.',
      'Use a tool to create the requested plugin.',
      'Use this tool to create the requested plugin.',
      'Use that tool to create the requested plugin.',
    ]) {
      expect(missionTaskActionIssues({ systemPrompt, requiredActions: [] })).toEqual([])
    }
  })

  it('repairs dependencies that do not identify the task output they consume', async () => {
    const invalidPlan = validPlan(1)
    const producer = invalidPlan.phases[0]!.tasks[0]!
    producer.id = 'phase-1-task-1'
    producer.systemPrompt = 'Use the calculate tool to produce the initial product.'
    producer.requiredActions = [{ toolId: 'calculate', outcome: 'success' }]

    const consumer = {
      ...producer,
      id: 'phase-1-task-2',
      title: 'Calculate final difference',
      description: 'Compute the difference between the initial and final calculated values.',
      systemPrompt: 'Use the calculate tool to calculate the difference between initial and final calculated values.',
      dependsOnTaskIds: ['phase-1-task-1'],
      requiredActions: [{ toolId: 'calculate', outcome: 'success' as const }],
    }
    invalidPlan.phases[0]!.tasks.push(consumer)

    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return JSON.stringify(invalidPlan)
    }

    const plan = await generateValidPlan('Use an initial product to calculate a final difference', {}, 'mission-output-lineage', complete)

    expect(plan.phases[0]?.tasks[1]?.dependsOnTaskIds).toEqual(['phase-1-task-1'])
    expect(plan.phases[0]?.tasks[1]?.systemPrompt).toContain('phase-1-task-1')
    expect(plan.phases[0]?.tasks[1]?.systemPrompt).toContain('deliverable-1.md')
    expect(requests).toHaveLength(1)
  })

  it('repairs multiple declared dependency instructions locally without another Brain call', async () => {
    const plan = validPlan(5)
    const dependencies: string[][] = [[], ['phase-1-task-1'], ['phase-2-task-1', 'phase-1-task-1'], ['phase-3-task-1'], ['phase-3-task-1', 'phase-2-task-1', 'phase-1-task-1']]
    for (const [phaseIndex, phase] of plan.phases.entries()) {
      const task = phase.tasks[0]!
      task.id = `phase-${phaseIndex + 1}-task-1`
      task.title = `Produce phase ${phaseIndex + 1} result`
      task.expectedArtifacts = [`phase-${phaseIndex + 1}-result.md`]
      task.dependsOnTaskIds = dependencies[phaseIndex]!
    }
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan('Create a multi-phase plan', {}, 'mission-incremental-dependencies', complete)

    expect(complete).toHaveBeenCalledTimes(1)
    for (const [phaseIndex, phase] of generated.phases.entries()) {
      const systemPrompt = phase.tasks[0]!.systemPrompt
      for (const dependencyId of dependencies[phaseIndex]!) {
        expect(systemPrompt).toContain(`task ${dependencyId}`)
        const producerPhase = Number(dependencyId.match(/^phase-(\d+)-/)![1])
        expect(systemPrompt).toContain(`phase-${producerPhase}-result.md`)
      }
    }
  })

  it('adds a dependency locally when a task explicitly consumes a known producer output', async () => {
    const plan = validPlan(1)
    const producer = plan.phases[0]!.tasks[0]!
    producer.id = 'phase-1-task-1'
    producer.expectedArtifacts = ['Research findings']
    const consumer = {
      ...producer,
      id: 'phase-1-task-2',
      title: 'Summarize research',
      systemPrompt: 'Use the output from task phase-1-task-1 (Research findings) to write the summary.',
      dependsOnTaskIds: [],
    }
    plan.phases[0]!.tasks.push(consumer)
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan('Summarize the research', {}, 'mission-inferred-dependency', complete)

    expect(generated.phases[0]?.tasks[1]?.dependsOnTaskIds).toEqual(['phase-1-task-1'])
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('asks Brain to correct only a small batch of remaining issues at a time', async () => {
    const invalidPlan = validPlan(4)
    for (const phase of invalidPlan.phases) phase.tasks[0]!.agentRole = 'Human'
    const partiallyCorrectedPlan = JSON.parse(JSON.stringify(invalidPlan)) as Plan
    for (const phase of partiallyCorrectedPlan.phases.slice(0, 3)) phase.tasks[0]!.agentRole = 'analyst'
    const requests: PlannerCompletionRequest[] = []
    const responses = [
      JSON.stringify(invalidPlan),
      JSON.stringify(partiallyCorrectedPlan),
      JSON.stringify(validPlan(4)),
    ]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[request.attempt - 1]!
    }

    const generated = await generateValidPlan('Create a business plan', {}, 'mission-focused-refinement', complete)

    expect(generated.phases[3]?.tasks[0]?.agentRole).toBe('analyst')
    expect(requests).toHaveLength(3)
    expect(requests[1]?.prompt).toContain('Make only these 3 correction(s)')
    expect(requests[1]?.prompt).toContain('task "task-3" (phase 3, task 1).agentRole "Human" is not executable')
    expect(requests[1]?.prompt).not.toContain('task "task-4" (phase 4, task 1).agentRole "Human" is not executable')
    expect(requests[2]?.prompt).toContain('Make only these 1 correction(s)')
    expect(requests[2]?.prompt).toContain('task "task-4" (phase 4, task 1).agentRole "Human" is not executable')
  })

  it('tracks consumed producer outputs without treating downstream or excluded task references as dependencies', () => {
    const allTaskIds = new Set(['phase-1-task-1', 'phase-2-task-1', 'phase-4-task-1', 'phase-5-task-1'])
    const producer = {
      id: 'phase-1-task-1',
      systemPrompt: 'Calculate 31*37 and preserve the result. This artifact will be consumed by phase-5-task-1.',
      dependsOnTaskIds: [],
    }
    const consumer = {
      id: 'phase-5-task-1',
      systemPrompt:
        'Consume two producer artifacts: the output of task phase-1-task-1 and the output of task phase-2-task-1. Do not use the recovery value from task phase-4-task-1 as an operand.',
      dependsOnTaskIds: ['phase-1-task-1', 'phase-2-task-1'],
    }

    expect(missionTaskDependencyIssues(producer as any, allTaskIds)).toEqual([])
    expect(missionTaskDependencyIssues(consumer as any, allTaskIds)).toEqual([])
    expect(missionTaskDependencyIssues({
      ...consumer as any,
      systemPrompt:
        'Synthesize the results from phase-1-task-1, phase-2-task-1, and phase-4-task-1 into a final answer.',
      dependsOnTaskIds: ['phase-1-task-1', 'phase-2-task-1', 'phase-4-task-1'],
    }, allTaskIds)).toEqual([])
    expect(missionTaskDependencyIssues({
      ...consumer as any,
      dependsOnTaskIds: [],
    }, allTaskIds)).toEqual(expect.arrayContaining([
      expect.stringContaining('consumes output or evidence from task "phase-1-task-1" but does not declare it'),
    ]))
  })

  it('accepts recovery split across dependent failure and success tasks', async () => {
    const plan = validPlan(1)
    const failedTask = plan.phases[0]!.tasks[0]!
    failedTask.id = 'phase-1-task-1'
    failedTask.title = 'Record calculator failure'
    failedTask.systemPrompt = "Call the calculate tool with invalid expression '2*' and record the failure receipt."
    failedTask.requiredActions = [{ toolId: 'calculate', outcome: 'failure' }]

    const recoveryTask = {
      ...failedTask,
      id: 'phase-1-task-2',
      title: 'Recover from calculator failure',
      description: 'Retry the calculation successfully after the prior tool failure.',
      systemPrompt:
        "Following the failure in phase-1-task-1, recover by calling the calculate tool with '2+2' and record the successful receipt.",
      dependsOnTaskIds: ['phase-1-task-1'],
      requiredActions: [{ toolId: 'calculate', outcome: 'success' as const }],
      expectedArtifacts: ['recovered-calculation.txt'],
    }
    plan.phases[0]!.tasks.push(recoveryTask)
    const invalidPlan = JSON.parse(JSON.stringify(plan)) as Plan
    invalidPlan.phases[0]!.tasks[1]!.dependsOnTaskIds = []
    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return JSON.stringify(invalidPlan)
    }

    const generated = await generateValidPlan(
      'Recover from an invalid calculation and report the valid result',
      {},
      'mission-split-recovery',
      complete,
    )

    expect(generated.phases[0]?.tasks[1]?.requiredActions).toEqual([])
    expect(generated.phases[0]?.tasks[1]?.dependsOnTaskIds).toEqual(['phase-1-task-1'])
    expect(requests).toHaveLength(1)
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
        systemPrompt: `Use output from task ${previousTaskId} to produce part ${index}.`,
        dependsOnTaskIds: [previousTaskId],
        expectedArtifacts: [`deliverable-part-${index}.md`],
        requiredActions: [],
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
    firstTask.systemPrompt = `Use output from task ${secondTask.id}.`
    secondTask.dependsOnTaskIds = [firstTask.id]
    secondTask.systemPrompt = `Use output from task ${firstTask.id}.`
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
    expect(requests[1]?.prompt).toContain('task "task-1" (phase 2, task 1) duplicates');
  })

  it('keeps requesting corrected plans until one passes validation', async () => {
    let calls = 0
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      calls++
      expect(request.attempt).toBe(calls)
      if (calls === 4) return JSON.stringify(validPlan())
      return '{"summary":"still invalid"}'
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-3', complete)

    expect(plan.summary).toBe('A goal-specific execution plan')
    expect(calls).toBe(4)
  })

  it('requests a focused JSON repair without asking for a full replan', async () => {
    const requests: PlannerCompletionRequest[] = []
    const responses = [
      `${JSON.stringify(validPlan())}\n${JSON.stringify(validPlan())}`,
      JSON.stringify(validPlan()),
    ]
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      return responses[request.attempt - 1]!
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-json-repair', complete)

    expect(plan.summary).toBe('A goal-specific execution plan')
    expect(requests).toHaveLength(2)
    expect(requests[1]?.prompt).toContain('Fix only the JSON syntax')
    expect(requests[1]?.prompt).toContain('Problematic planner response')
    expect(requests[1]?.prompt).not.toContain('Your previous plan was rejected')
    expect(requests[1]?.prompt).not.toContain('GOAL: Create a business plan')
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

  it('does not restart planning when Agent Runtime reports that model routing made no progress', async () => {
    const complete = jest.fn(async (): Promise<string> => {
      throw new Error(
        `Brain model routing made no progress after 2 retry request(s): ${BRAIN_MODEL_SELECTION_RETRY}; 2 eligible model(s) remain untried`,
      )
    })

    await expect(generateValidPlan('Create a business plan', {}, 'mission-routing-stalled', complete))
      .rejects.toThrow('Brain routing did not complete within the current planner task')
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('does not retry unrelated Planner or control-plane errors indefinitely', async () => {
    const complete = jest.fn(async (): Promise<string> => {
      throw new Error('Agent Runtime unavailable')
    })

    await expect(generateValidPlan('Create a business plan', {}, 'mission-5', complete))
      .rejects.toThrow('Planner Agent request failed on attempt 1: Agent Runtime unavailable')
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('retries a transient Brain failure instead of failing the mission', async () => {
    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      if (request.attempt === 1) {
        throw new Error('Brain request failed (504): {"success":false,"error":"Brain completion deadline did not leave enough time for the next eligible model attempt"}')
      }
      return JSON.stringify(validPlan())
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-transient', complete)

    expect(plan.phases).toHaveLength(3)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.prompt).toContain('Create a plan to achieve this goal: Create a business plan')
    expect(requests[1]?.prompt).not.toContain('Make only these')
  })

  it('retries a Brain completion with no content using the same repair request', async () => {
    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      if (request.attempt === 1) return '{"summary":"incomplete"}'
      if (request.attempt === 2) {
        throw new Error('Agent Runtime API /missions/mission-1/agents/agent-planner/tasks/attempt-2/execute failed (500): {"error":"Brain returned a completion without content"}')
      }
      return JSON.stringify(validPlan())
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-empty-completion', complete)

    expect(plan.phases).toHaveLength(3)
    expect(requests).toHaveLength(3)
    expect(requests[1]?.prompt).toContain('Make only these')
    expect(requests[2]?.prompt).toContain('Make only these')
  })

  it('retries transient Brain failures while eligible models remain', async () => {
    const requests: PlannerCompletionRequest[] = []
    const complete = async (request: PlannerCompletionRequest): Promise<string> => {
      requests.push(request)
      if (request.attempt <= 2) {
        throw new Error('Brain request failed (504): provider timed out')
      }
      if (request.attempt === 3) return '{"summary":"still invalid"}'
      return JSON.stringify(validPlan())
    }

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-transient-budget', complete)

    expect(plan.phases).toHaveLength(3)
    expect(requests).toHaveLength(4)
  })

  it('bounds repeated transient Brain failures with a specific error', async () => {
    const complete = jest.fn(async (): Promise<string> => {
      throw new Error('Brain request failed (504): provider timed out')
    })

    await expect(generateValidPlan('Create a business plan', {}, 'mission-transient-limit', complete))
      .rejects.toThrow('after 3 transient Brain retries')
    expect(complete).toHaveBeenCalledTimes(4)
  })

  it('accepts a plan whose phase object was closed twice', async () => {
    const complete = jest.fn(async (): Promise<string> => {
      const plan = validPlan(2)
      const phase = plan.phases[0]!
      const task = phase.tasks[0]!
      return JSON.stringify(plan).replace(
        `"tasks":[${JSON.stringify(task)}]}`,
        `"tasks":[${JSON.stringify(task)}]}}`,
      )
    })

    const plan = await generateValidPlan('Create a business plan', {}, 'mission-repair', complete)

    expect(plan.phases).toHaveLength(2)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('accepts a dependency that names the producer task artifact', async () => {
    const plan = validPlan(1)
    const producer = plan.phases[0]!.tasks[0]!
    producer.id = 'phase-1-task-1'
    producer.expectedArtifacts = ['Business Model Definition']
    const consumer = {
      ...producer,
      id: 'phase-1-task-2',
      title: 'Create the budget',
      description: 'Create a budget from the business model definition.',
      systemPrompt: 'Based on the Business Model Definition from phase-1-task-1, create the budget.',
      dependsOnTaskIds: ['phase-1-task-1'],
      expectedArtifacts: ['Budget'],
    }
    plan.phases[0]!.tasks.push(consumer)
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan))

    const generated = await generateValidPlan('Create a budget from a business model', {}, 'mission-artifact-lineage', complete)

    expect(generated.phases[0]?.tasks[1]?.dependsOnTaskIds).toEqual(['phase-1-task-1'])
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
