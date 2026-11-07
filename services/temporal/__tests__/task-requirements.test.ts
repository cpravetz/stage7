import { Phase, Plan, Task } from '@stage7-nextgen/shared'
import { buildTaskPrompt } from '../src/agent/TaskPromptBuilder'
import { applyRuntimeTaskRequirements } from '../src/agent/TaskRequirements'
import {
  CompletedTaskSummary,
  isConfigurationBlocker,
  missionConfigurationQuestion,
  recoveryGapFingerprint,
} from '../src/types/workflow'

const task: Task = {
  id: 'task-1',
  title: 'Send the SMS message',
  description: 'Send the requested text to the provided phone number.',
  agentRole: 'assistant',
  systemPrompt: 'Use an available messaging capability.',
  dependsOnTaskIds: [],
  expectedArtifacts: [],
  requiredActions: [],
  status: 'pending',
  artifacts: [],
}

const phase: Phase = {
  id: 'phase-1',
  name: 'Send text message',
  goal: 'Send the specified SMS message',
  tasks: [task],
  requiresApproval: false,
  status: 'in_progress',
}

const plan: Plan = {
  summary: 'Send the requested message',
  estimatedDuration: 'short',
  estimatedCost: 'low',
  requiresClarification: false,
  clarificationQuestions: [],
  clarificationAnswers: [],
  phases: [phase],
}

describe('runtime task requirements', () => {
  it('recognizes repeated provider/configuration blockers without depending on attempt numbers', () => {
    const first = 'Tool "email_sender" is not in the live system catalog (attempt 1).'
    const second = 'Tool "email_sender" is not in the live system catalog (attempt 4).'

    expect(isConfigurationBlocker([first])).toBe(true)
    expect(recoveryGapFingerprint([first])).toBe(recoveryGapFingerprint([second]))
    expect(isConfigurationBlocker(['The output file has not been produced.'])).toBe(false)
  })

  it('directs the user to configure a service and wait for secure credential prompts', () => {
    const question = missionConfigurationQuestion('Send an SMS and email.')

    expect(question).toContain('Tools configuration')
    expect(question).toContain('secure form')
    expect(question).toContain('continue after you save')
  })

  it('gives task agents a recovery path for missing tools, configuration, and dependency inputs', () => {
    const externalTask = {
      ...task,
      requiresExternalAction: true,
      dependsOnTaskIds: ['source-task'],
    }
    const prompt = buildTaskPrompt(externalTask, phase, plan, [])

    expect(prompt).toContain('Check the live tool catalog')
    expect(prompt).toContain('use capability resolution to find or create one')
    expect(prompt).toContain('secure tool configuration form and wait')
    expect(prompt).toContain("request its Agent to provide the artifact or rerun that task")
    expect(prompt).toContain('Do not expose internal JSON')
  })

  it('requires verified external action evidence for communication delivery tasks', () => {
    const deliveryTask = {
      ...task,
      requiredActions: [{ toolId: 'approved-sender', outcome: 'success' as const }],
    }

    applyRuntimeTaskRequirements(deliveryTask)

    expect(deliveryTask.requiredActions).toEqual([{ toolId: 'approved-sender', outcome: 'success' }])
    expect(deliveryTask.requiresExternalAction).toBe(true)
    applyRuntimeTaskRequirements(deliveryTask)
    expect(deliveryTask.requiredActions).toHaveLength(1)
  })

  it('uses the original mission goal to identify generic communication tasks', () => {
    const plannedTask = {
      ...task,
      title: 'perform the requested operation using available capabilities',
      description: 'Perform the requested operation.',
      agentRole: 'TextMessageSender',
    }

    applyRuntimeTaskRequirements(
      plannedTask,
      'Send a text to 347-772-8389 that reads "Watson, come here."',
    )

    expect(plannedTask.requiresExternalAction).toBe(true)
    expect(buildTaskPrompt(plannedTask, phase, plan, [], 'Send the requested text message.'))
      .toContain('Original mission goal: Send the requested text message.')
  })

  it('migrates the former synthetic tool requirement without exposing it as an action', () => {
    const legacyTask = {
      ...task,
      title: 'Deliver the email',
      description: 'Send the requested email to the recipient.',
      requiredActions: [
        { toolId: '__external_action__', outcome: 'success' as const },
        { toolId: 'email_sender', outcome: 'success' as const },
      ],
    }

    applyRuntimeTaskRequirements(legacyTask)

    expect(legacyTask.requiredActions).toEqual([{ toolId: 'email_sender', outcome: 'success' }])
    expect(legacyTask.requiresExternalAction).toBe(true)
    const prompt = buildTaskPrompt(legacyTask, phase, plan, [])
    expect(prompt).not.toContain('__external_action__')
    expect(prompt).toContain('actual registered tool')
  })

  it('does not require external action evidence for planning-only tasks', () => {
    const planningTask = { ...task, title: 'Verify SMS delivery status', description: 'Confirm that the text was sent.' }

    applyRuntimeTaskRequirements(planningTask)

    expect(planningTask.requiredActions).toEqual([])
    expect(planningTask.requiresExternalAction).toBeUndefined()
  })

  it('keeps bounded recovery context while retaining referenced source evidence', () => {
    const sourceSummary: CompletedTaskSummary = {
      taskId: 'source-task',
      output: 'The source evidence',
      artifactNames: ['source.txt'],
      artifacts: [],
    }
    const recoverySummaries = Array.from({ length: 20 }, (_, index): CompletedTaskSummary => ({
      taskId: `task-mission-recovery-${index}`,
      output: `Recovery output ${index}`,
      artifactNames: [],
      artifacts: [],
    }))
    const dependentTask = {
      ...task,
      systemPrompt: 'Use the source result, and do not repeat actions.',
      dependsOnTaskIds: ['source-task'],
    }

    const prompt = buildTaskPrompt(dependentTask, phase, plan, [sourceSummary, ...recoverySummaries])

    expect(prompt).toContain('"taskId":"source-task"')
    expect(prompt).toContain('"taskId":"task-mission-recovery-19"')
    expect(prompt).not.toContain('"taskId":"task-mission-recovery-0"')
  })
})

describe('progress/no-progress recovery helpers', () => {
  it('no-progress changes approach signal; progress allows continuation', async () => {
    const { recoveryProgressSignature, hasRecoveryProgress } = await import('../src/types/workflow');
    const a = recoveryProgressSignature({ gaps: ['gap'], completedTaskStatuses: ['t:failed'], artifactNames: [] });
    const b = recoveryProgressSignature({ gaps: ['gap'], completedTaskStatuses: ['t:failed'], artifactNames: [] });
    const c = recoveryProgressSignature({ gaps: ['gap'], completedTaskStatuses: ['t:incomplete','t2:completed'], artifactNames: ['x.txt'] });
    expect(hasRecoveryProgress(a, b)).toBe(false);
    expect(hasRecoveryProgress(a, c)).toBe(true);
  });
});
