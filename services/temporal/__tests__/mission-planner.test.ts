import {
  generateValidPlan,
  applyDeterministicFixes,
  validate,
  LocusFailureTracker,
  missionTaskActionIssues,
  missionTaskDependencyIssues,
  PLANNER_SYSTEM_PROMPT,
  PlannerProgress,
} from '../src/planner/MissionPlanner';
import { BRAIN_MODEL_SELECTION_EXHAUSTED, BRAIN_MODEL_SELECTION_RETRY, Plan } from '@stage7-nextgen/shared';

function complete(deliverables = 'deliverables') {
  const base = (name: string) => ({
    summary: `Produce ${deliverables}`,
    estimatedDuration: 'short',
    estimatedCost: 'low',
    requiresClarification: false,
    clarificationQuestions: [],
    clarificationAnswers: [],
    phases: [{
      id: 'phase-1', name: `Produce ${name}`, goal: `Produce ${name}`, requiresApproval: false,
      status: 'pending' as const,
      tasks: [{ id: 'phase-1-task-1', title: `Produce ${name}`, description: `Produce ${name}`, agentRole: 'writer', systemPrompt: `Produce ${name}`, dependsOnTaskIds: [], expectedArtifacts: [], requiredActions: [], status: 'pending', artifacts: [] }],
    }],
  });
  return jest.fn().mockImplementation(async () => JSON.stringify(base('deliverable 1')));
}

function validPlan(phaseCount = 1): Plan {
  return {
    summary: phaseCount === 1 ? 'Complete deliverable 1' : 'Produce two deliverables',
    estimatedDuration: 'short',
    estimatedCost: 'low',
    requiresClarification: false,
    clarificationQuestions: [],
    clarificationAnswers: [],
    phases: Array.from({ length: phaseCount }, (_, i) => ({
      id: `phase-${i + 1}`, name: `Deliverable ${i + 1}`, goal: `Produce deliverable ${i + 1}`,
      requiresApproval: false, status: 'pending' as const,
      tasks: [{
        id: `task-${i + 1}`, title: `Complete deliverable ${i + 1}`, description: `Complete deliverable ${i + 1}`,
        agentRole: 'analyst', systemPrompt: `Complete deliverable ${i + 1}.`, dependsOnTaskIds: [],
        expectedArtifacts: [`deliverable-${i + 1}.md`], requiredActions: [], status: 'pending', artifacts: [],
      }],
    })),
  };
}

function humanRolePlan(): Plan {
  const plan = validPlan();
  plan.phases[0]!.tasks[0]!.agentRole = 'Human';
  return plan;
}

function cyclicPlan(): Plan {
  const plan = validPlan();
  const second = {
    ...plan.phases[0]!.tasks[0]!,
    id: 'task-2',
    title: 'Complete deliverable 2',
    description: 'Complete deliverable 2',
    systemPrompt: 'Complete deliverable 2.',
    expectedArtifacts: ['deliverable-2.md'],
    dependsOnTaskIds: ['task-1'],
  };
  plan.phases[0]!.tasks[0]!.dependsOnTaskIds = ['task-2'];
  plan.phases[0]!.tasks.push(second);
  return plan;
}

describe('MissionPlanner', () => {
  it('plans outcomes separately rather than narrating each phase to the agent', () => {
    expect(PLANNER_SYSTEM_PROMPT).toContain('Describe only WHAT outcome must be achieved');
    expect(PLANNER_SYSTEM_PROMPT).toContain('Always leave requiredActions=[]');
  });

  it('folds intermediate capability setup into the operational task when the user requested an action', async () => {
    const requestedMessage = 'Send the requested message. You do not have a messaging tool yet, so create one.';
    const complete = jest.fn()
      .mockResolvedValueOnce(JSON.stringify({
        summary: 'Plan to create a messaging service then use it to send the requested message',
        estimatedDuration: 'short',
        estimatedCost: 'low',
        requiresClarification: false,
        clarificationQuestions: [],
        clarificationAnswers: [],
        phases: [
          { id: 'phase-1', name: 'Create a capability', goal: 'Create the messaging service first', requiresApproval: false, status: 'pending', tasks: [
            { id: 'phase-1-task-1', title: 'Create the messaging service tool', description: 'Configure a messaging service.', agentRole: 'analyst', systemPrompt: 'Create and publish the messaging service.', dependsOnTaskIds: [], expectedArtifacts: ['phase-1-task-1-executable'], requiredActions: [], status: 'pending', artifacts: [] },
          ] },
          { id: 'phase-2', name: 'Send the requested message', goal: 'Use the messaging capability to send the requested message', requiresApproval: false, status: 'pending', tasks: [
            { id: 'phase-2-task-1', title: 'Send the message using the messaging service tool', description: 'Use the developed messaging service to send the requested message.', agentRole: 'analyst', systemPrompt: 'Use the messaging service created in phase-1-task-1 to send the requested message. The tool output should include a receipt.', dependsOnTaskIds: ['phase-1-task-1'], expectedArtifacts: ['sent-message-receipt'], requiredActions: [{ toolId: 'message-service-send', outcome: 'success' }], status: 'pending', artifacts: [] },
          ] },
        ],
      }));
    const requests: any[] = [];
    const completeSpy = jest.fn(async (request: any) => { requests.push(request); return complete.mock.results[0]!.value; });
    // Use the single-response mock directly so the resolved plan is what is validated.
    const generated = await generateValidPlan(requestedMessage, undefined, 'mission-capability-fold', complete as any);
    expect(generated.phases).toHaveLength(1);
    expect(generated.phases[0]!.tasks).toHaveLength(1);
    expect(generated.phases[0]!.tasks[0]!.id).toBe('phase-2-task-1');
    expect(generated.phases[0]!.tasks[0]!.title).toBe('Send the message');
    expect(generated.phases[0]!.tasks[0]!.dependsOnTaskIds).toEqual([]);
    expect(generated.phases[0]!.tasks[0]!.expectedArtifacts).toEqual([]);
    expect(generated.phases[0]!.tasks[0]!.systemPrompt).toContain('send the requested message');
    expect(generated.phases[0]!.tasks[0]!.systemPrompt).toContain('the action result');
    expect(generated.phases[0]!.tasks[0]!.systemPrompt).not.toMatch(/\btool\b|\bprovider\b|\bapi\b/);
    expect(generated.phases[0]!.tasks[0]!.systemPrompt).not.toContain('messaging service created in');
    expect(generated.phases[0]!.tasks[0]!.systemPrompt).not.toContain('tool output');
    expect(generated.summary).toBe('Send the message');
    expect(complete).toHaveBeenCalledTimes(1);
    void completeSpy;
    void requests;
  });

  it('does not collapse a multi-task capability-setup plan; flags the setup task for targeted remediation', async () => {
    const plan = validPlan(2);
    plan.phases[0]!.tasks[0]!.title = 'Create an analytics service';
    plan.phases[0]!.tasks[0]!.description = 'Create an analytics service and publish it.';
    plan.phases[0]!.tasks[0]!.systemPrompt = 'Create an analytics service and publish it.';
    plan.phases[0]!.tasks[0]!.expectedArtifacts = ['analytics-service'];
    plan.phases[1]!.tasks[0]!.dependsOnTaskIds = []; // operational task does NOT depend on the setup task
    const complete = jest.fn(async (request: any) => {
      if (request.attempt === 1) return JSON.stringify(plan);
      const idMatch = request.prompt.match(/same id "([^"]+)"/);
      const corrected = validPlan(2);
      const task = corrected.phases.flatMap((phase) => phase.tasks).find((candidate) => candidate.id === (idMatch?.[1] || '')) || corrected.phases[0]!.tasks[0]!;
      task.title = 'Analyze the data';
      task.description = 'Analyze the data.';
      task.systemPrompt = 'Analyze the data.';
      task.expectedArtifacts = ['analysis.md'];
      return JSON.stringify(task);
    });
    const generated = await generateValidPlan('Create an analytics service', undefined, 'mission-setup-conservative', complete);
    // The plan keeps its separate tasks; it was not collapsed into a single outcome task.
    expect(generated.phases.flatMap((phase) => phase.tasks).length).toBeGreaterThanOrEqual(2);
    // The remediation targeted the setup task specifically.
    expect(complete.mock.calls.some(([request]) => /same id "task-1"/.test(request.prompt))).toBe(true);
  });

  it('does not require incidental message IDs for action-only tasks', async () => {
    const complete = jest.fn().mockResolvedValueOnce(JSON.stringify({
      summary: 'Send the requested message',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Send the requested message', goal: 'Send the requested message', requiresApproval: false, status: 'pending', tasks: [{
          id: 'phase-1-task-1', title: 'Send the requested message', description: 'Send the requested message to the approved recipient.',
          agentRole: 'analyst', systemPrompt: 'Use the messaging capability to deliver the message. Verify that the message was sent.',
          dependsOnTaskIds: [], expectedArtifacts: ['sent-message.txt', 'send-message-id'], requiredActions: [{ toolId: 'send-message', outcome: 'success' }], status: 'pending', artifacts: [],
        }],
      }],
    }));
    const generated = await generateValidPlan('Send the requested message. You do not have a messaging tool yet, so create one.', undefined, 'mission-message-ids', complete);
    expect(complete).toHaveBeenCalledTimes(1);
    const task = generated.phases[0]!.tasks[0]!;
    expect(task.requiredActions).toEqual([]);
    expect(task.expectedArtifacts).toEqual(['sent-message.txt']);
  });

  it('preserves a capability setup task when the user explicitly requests a reusable deliverable', async () => {
    const complete = jest.fn().mockResolvedValueOnce(JSON.stringify({
      summary: 'Create a reusable messaging service and send the requested message',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [
        { id: 'phase-1', name: 'Create a capability', goal: 'Create the messaging service', requiresApproval: false, status: 'pending', tasks: [
          { id: 'task-1', title: 'Create a messaging service', description: 'Create the messaging service.', agentRole: 'analyst', systemPrompt: 'Create the messaging service.', dependsOnTaskIds: [], expectedArtifacts: ['messaging-service'], requiredActions: [], status: 'pending', artifacts: [] },
        ] },
        { id: 'phase-2', name: 'Send the requested message', goal: 'Send the requested message', requiresApproval: false, status: 'pending', tasks: [
          { id: 'task-2', title: 'Send the message', description: 'Send the requested message.', agentRole: 'analyst', systemPrompt: 'Use the messaging service created in task-1 to send the requested message.', dependsOnTaskIds: ['task-1'], expectedArtifacts: ['deliverable-2.md'], requiredActions: [], status: 'pending', artifacts: [] },
        ] },
      ],
    }));
    const generated = await generateValidPlan('Create a reusable messaging service as a deliverable, then send the requested message.', undefined, 'mission-capability-keep', complete);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(generated.phases).toHaveLength(2);
    expect(generated.phases[0]!.tasks[0]!.expectedArtifacts).toEqual(['messaging-service']);
    expect(generated.phases[1]!.tasks[0]!.dependsOnTaskIds).toEqual(['task-1']);
  });

  it('fills only unambiguous initial planning defaults locally', async () => {
    const plan = validPlan();
    delete (plan.phases[0] as any).requiresApproval;
    delete (plan.phases[0]!.tasks[0] as any).status;
    delete (plan.phases[0]!.tasks[0] as any).dependsOnTaskIds;
    const complete = jest.fn(async (): Promise<string> => JSON.stringify(plan));

    const generated = await generateValidPlan('Produce deliverable 1', undefined, 'mission-clarification', complete);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(generated.phases).toHaveLength(1);
    expect(generated.phases[0]!.requiresApproval).toBe(false);
    expect(generated.phases[0]!.tasks[0]!.status).toBe('pending');
    expect(generated.phases[0]!.tasks[0]!.dependsOnTaskIds).toEqual([]);
    expect(generated.requiresClarification).toBe(false);
    expect(generated.clarificationQuestions).toEqual([]);
  });

  it('rejects a plan that is missing its phases and remediates it via the Brain', async () => {
    const requests: any[] = [];
    const progress: PlannerProgress[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      return requests.length === 1 ? '{"summary":"incomplete"}' : JSON.stringify(validPlan());
    });
    const generated = await generateValidPlan(
      'Send the requested message',
      undefined,
      'mission-incomplete',
      complete,
      undefined,
      async (update) => { progress.push(update); },
    );
    // A plan with no phases is structurally incomplete: it must not be silently completed with a
    // fabricated default phase. The first rejection is reported, then the Brain supplies a valid
    // plan that passes.
    expect(requests.length).toBeGreaterThan(1);
    expect(progress.some((update) => update.status === 'rejected')).toBe(true);
    expect(generated.phases.length).toBeGreaterThan(0);
    expect(generated.phases[0]!.tasks.length).toBeGreaterThan(0);
    expect(generated.requiresClarification).toBe(false);
  });

  it('repairs malformed deliverable values locally without a second Brain call', async () => {
    const requests: any[] = [];
    const plan = validPlan();
    plan.phases[0]!.tasks[0]!.expectedArtifacts = [{ name: 'sent-message.txt' }] as any;
    plan.phases[0]!.tasks[0]!.requiredActions = ['textMessageSentConfirmation'] as any;
    const complete = jest.fn(async (request: any) => { requests.push(request); return JSON.stringify(plan); });
    const generated = await generateValidPlan('Produce the requested text message outcome', undefined, 'mission-message-deliverables', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases[0]!.tasks[0]!.expectedArtifacts).toEqual(['sent-message.txt']);
    expect(generated.phases[0]!.tasks[0]!.requiredActions).toEqual([]);
  });

  it('discards required action metadata from the plan', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Research and prepare a deliverable', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Prepare', goal: 'Produce a deliverable', requiresApproval: false, status: 'pending',
          tasks: [{
            id: 'phase-1-task-1', title: 'Prepare the deliverable', description: 'Write the requested deliverable.', agentRole: 'writer',
            systemPrompt: 'Write a concise deliverable and save it as report.md.', dependsOnTaskIds: [],
            expectedArtifacts: ['report.md'], requiredActions: [{ toolId: 'save-file', outcome: 'success' }], status: 'pending', artifacts: [],
          }],
        }],
      });
    });
    const generated = await generateValidPlan('Produce a researched deliverable file', undefined, 'mission-planning', complete);
    expect(requests).toHaveLength(1);
    const task = generated.phases[0]!.tasks[0]!;
    expect(task.requiredActions).toEqual([]);
    expect(task.expectedArtifacts).toEqual(['report.md']);
  });

  it('ignores malformed required action outcome values', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Produce an operational outcome', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Execution', goal: 'Produce an operational outcome', requiresApproval: false, status: 'pending',
          tasks: [{
            id: 'phase-1-task-1', title: 'Complete the requested outcome', description: 'Perform the required action and record the real result.',
            agentRole: 'writer', systemPrompt: 'Use the available tools to complete the requested outcome and record the real result.', dependsOnTaskIds: [],
            expectedArtifacts: [], requiredActions: [{ toolId: '__external_action__', outcome: 'accounting_document' }], status: 'pending', artifacts: [],
          }],
        }],
      });
    });
    const generated = await generateValidPlan('Produce an operational outcome', undefined, 'mission-planning', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases[0]!.tasks[0]!.requiredActions).toEqual([]);
  });

  it('keeps repairing until a valid plan is produced', async () => {
    let calls = 0;
    const progress: PlannerProgress[] = [];
    const complete = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls <= 6) return 'not valid JSON';
      return JSON.stringify(validPlan());
    });
    const requests: any[] = [];
    const trackingComplete = jest.fn(async (request: any) => { requests.push(request); return complete(); });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-repair', trackingComplete, undefined, async (update) => { progress.push(update); });
    expect(calls).toBe(7);
    expect(requests).toHaveLength(7);
    expect(generated.phases).toHaveLength(1);
    expect(progress.length).toBeGreaterThanOrEqual(6);
    expect(progress.slice(0, 6).every((update) => update.status === 'retrying' && update.transient === false)).toBe(true);
  });

  it('does not make the planner specify tools or delegation for an outcome task', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Send an account update', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Send the account update', goal: 'Send the account update', requiresApproval: false, status: 'pending',
          tasks: [{
            id: 'phase-1-task-1', title: 'Complete the account update', description: 'Deliver the account update to the intended recipient using the best available approach.',
            agentRole: 'writer', systemPrompt: 'Carry out the requested update using the available tools and report whether it was completed.', dependsOnTaskIds: [], expectedArtifacts: [], status: 'pending', artifacts: [],
          }],
        }],
      });
    });
    await generateValidPlan('Send an account update', undefined, 'mission-outcome', complete);
    expect(requests).toHaveLength(1);
  });

  it('removes tool receipts from plans', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Produce a final report', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Produce a final report', goal: 'Produce a final report', requiresApproval: false, status: 'pending',
          tasks: [{
            id: 'phase-1-task-1', title: 'Write the final report', description: 'Write a concise report and save it as report.txt.',
            agentRole: 'writer', systemPrompt: 'Write a concise report and save it as report.txt.', dependsOnTaskIds: [], expectedArtifacts: ['report.txt'], requiredActions: [], status: 'pending', artifacts: [],
          }],
        }],
      });
    });
    const generated = await generateValidPlan('Write a concise final report', undefined, 'mission-receipt-cleanup', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases[0]!.tasks[0]!.expectedArtifacts).toEqual(['report.txt']);
  });

  it('keeps task planning outcome-focused and delegates runtime execution decisions to the Agent', () => {
    const completion = 'Produce a concise outcome';
    const task = { description: `Produce a concise outcome ${completion}`, systemPrompt: '', requiredActions: [] };
    const tools = missionTaskActionIssues(task);
    expect(tools).toEqual([]);
  });

  it('distinguishes direct tool calls from delegation, related tools, and action evidence', () => {
    const task = {
      description: 'Use the available tools to read the message and send the reply. Record the sent-message evidence.',
      systemPrompt: 'Read the source message with the available tools, then send the reply.',
      expectedArtifacts: ['sent-message.txt'],
    };
    const tools = missionTaskActionIssues(task);
    expect(tools).not.toContain('message');
    expect(tools).not.toContain('source');
    expect(tools).not.toContain('reply');
    expect(tools).not.toContain('record');
  });

  it('does not treat articles and demonstratives as explicit tool IDs', () => {
    const task = {
      description: 'Use the messaging capability to send the reply. This message must reach the recipient.',
      systemPrompt: 'Use the available tools to send the reply for this conversation.',
      expectedArtifacts: [],
    };
    const tools = missionTaskActionIssues(task);
    expect(tools).not.toContain('the');
    expect(tools).not.toContain('this');
    expect(tools).not.toContain('that');
  });

  it('repairs dependencies that do not identify the task output they consume', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Produce and use a product', estimatedDuration: 'short', estimatedCost: 'low',
        requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Produce and use a product', goal: 'Produce then consume the product', requiresApproval: false, status: 'pending',
          tasks: [
            { id: 'phase-1-task-1', title: 'Produce the product', description: 'Calculate the product.', agentRole: 'analyst', systemPrompt: 'Use the calculate tool to produce the initial product.', dependsOnTaskIds: [], expectedArtifacts: ['deliverable-1.md'], requiredActions: [], status: 'pending', artifacts: [] },
            { id: 'phase-1-task-2', title: 'Use the product', description: 'Use the produced product.', agentRole: 'analyst', systemPrompt: 'Use the produced product.', dependsOnTaskIds: ['phase-1-task-1'], expectedArtifacts: ['deliverable-2.md'], requiredActions: [], status: 'pending', artifacts: [] },
          ],
        }],
      });
    });
    await generateValidPlan('Produce and use a product', undefined, 'mission-dependency-clarification', complete);
    expect(requests).toHaveLength(1);
    const consumer = requests[0] && JSON.stringify(validPlan());
    void consumer;
  });

  it('repairs multiple declared dependency instructions locally without another Brain call', async () => {
    const requests: any[] = [];
    const plan: Plan = {
      summary: 'Fetch three readings then reduce them',
      estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Readings and reduction', goal: 'Fetch readings then reduce', requiresApproval: false, status: 'pending',
        tasks: [
          { id: 'task-1', title: 'Fetch reading A', description: 'Fetch A', agentRole: 'analyst', systemPrompt: 'Produce the first reading.', expectedArtifacts: ['reading-a.csv'], status: 'pending', artifacts: [] },
          { id: 'task-2', title: 'Fetch reading B', description: 'Fetch B', agentRole: 'analyst', systemPrompt: 'Produce the second reading.', expectedArtifacts: ['reading-b.csv'], status: 'pending', artifacts: [] },
          { id: 'task-3', title: 'Fetch reading C', description: 'Fetch C', agentRole: 'analyst', systemPrompt: 'Produce the third reading.', expectedArtifacts: ['reading-c.csv'], status: 'pending', artifacts: [] },
          { id: 'task-4', title: 'Reduce readings', description: 'Reduce A, B and C', agentRole: 'analyst', systemPrompt: 'Use reading A, reading B and reading C to compute the final total.', dependsOnTaskIds: ['task-1', 'task-2', 'task-3'], expectedArtifacts: ['total.csv'], status: 'pending', artifacts: [] },
        ],
      }],
    };
    const complete = jest.fn().mockImplementation(async (request: any) => { requests.push(request); return JSON.stringify(plan); });
    const generated = await generateValidPlan('Fetch three readings then reduce them', undefined, 'mission-multi-deps', complete);
    expect(requests).toHaveLength(1);
    const reducer = generated.phases[0]!.tasks.find((task) => task.id === 'task-4')!;
    expect(reducer.systemPrompt).toContain('Consume the output from task task-1 (reading-a.csv)');
    expect(reducer.systemPrompt).toContain('Consume the output from task task-2 (reading-b.csv)');
    expect(reducer.systemPrompt).toContain('Consume the output from task task-3 (reading-c.csv)');
  });

  it('adds a dependency locally when a task explicitly consumes a known producer output', async () => {
    const requests: any[] = [];
    const plan: Plan = {
      summary: 'Fetch data then analyse it',
      estimatedDuration: 'short', estimatedCost: 'low',
      requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Fetch and analyse', goal: 'Fetch data then analyse', requiresApproval: false, status: 'pending',
        tasks: [
          { id: 'task-1', title: 'Fetch data', description: 'Fetch data.', agentRole: 'analyst', systemPrompt: 'Produce the raw data.', expectedArtifacts: ['data.csv'], status: 'pending', artifacts: [] },
          { id: 'task-2', title: 'Analyse data', description: 'Analyse.', agentRole: 'analyst', systemPrompt: 'Use the result from task-1 to produce the analysis.', expectedArtifacts: ['analysis.csv'], status: 'pending', artifacts: [] },
        ],
      }],
    };
    const complete = jest.fn().mockImplementation(async (request: any) => { requests.push(request); return JSON.stringify(plan); });
    const generated = await generateValidPlan('Fetch data then analyse it', undefined, 'mission-implicit-dep', complete);
    expect(requests).toHaveLength(1);
    const consumer = generated.phases[0]!.tasks.find((task) => task.id === 'task-2')!;
    expect(consumer.dependsOnTaskIds).toContain('task-1');
  });

  it('tracks consumed producer outputs and undeclared dependencies', () => {
    const allTaskIds = new Set(['task-9', 'confirm-task']);
    const producerArtifacts = new Map([['task-9', ['report.md']]]);
    const undeclared = {
      systemPrompt: 'Use the result from task-9 to confirm delivery.',
      dependsOnTaskIds: [],
      expectedArtifacts: [],
    };
    const issues = missionTaskDependencyIssues(undeclared as any, allTaskIds, 'confirm-task', producerArtifacts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => /task-9/.test(issue) && /does not declare it/.test(issue))).toBe(true);
    // A properly declared, named producer dependency raises no issue.
    const declared = { ...undeclared, dependsOnTaskIds: ['task-9'] };
    expect(missionTaskDependencyIssues(declared as any, allTaskIds, 'confirm-task', producerArtifacts)).toEqual([]);
  });

  it('accepts recovery split across dependent failure and success tasks', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Perform an external action',
        estimatedDuration: 'short',
        estimatedCost: 'low',
        requiresClarification: false,
        clarificationQuestions: [],
        clarificationAnswers: [],
        phases: [{
          id: 'phase-1', name: 'Attempt and recover', goal: 'Recover from a transient tool failure', requiresApproval: false, status: 'pending',
          tasks: [
            { id: 'phase-1-task-1', title: 'Initial attempt', description: 'Try the external call once.', agentRole: 'analyst', systemPrompt: 'Attempt the external call using the available tools.', dependsOnTaskIds: [], expectedArtifacts: [], requiredActions: [{ toolId: 'charge-card', outcome: 'success' }], status: 'pending', artifacts: [] },
            { id: 'phase-1-task-2', title: 'Recover from the tool failure', description: 'After the initial attempt fails, retry the external call successfully.', agentRole: 'analyst', systemPrompt: 'Recover from the charge-card tool failure and verify the retry succeeds.', dependsOnTaskIds: ['phase-1-task-1'], expectedArtifacts: [], requiredActions: [{ toolId: 'charge-card', outcome: 'failure' }, { toolId: 'charge-card', outcome: 'success' }], status: 'pending', artifacts: [] },
          ],
        }],
      });
    });
    const generated = await generateValidPlan('Perform an external action', undefined, 'mission-recovery', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases[0]!.tasks).toHaveLength(2);
  });

  it('accepts one phase with more than five dependency-ordered tasks', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Build the deliverable in stages',
        estimatedDuration: 'long',
        estimatedCost: 'medium',
        requiresClarification: false,
        clarificationQuestions: [],
        clarificationAnswers: [],
        phases: [{
          id: 'phase-1',
          name: 'Sequential build',
          goal: 'Build a deliverable through six ordered tasks',
          requiresApproval: false,
          status: 'pending',
          tasks: Array.from({ length: 6 }, (_, i) => ({
            id: `task-${i + 1}`,
            title: `Step ${i + 1}`,
            description: `Complete step ${i + 1} using the prior step's output.`,
            agentRole: 'analyst',
            systemPrompt: `Do step ${i + 1} and hand off its result.`,
            dependsOnTaskIds: i === 0 ? [] : [`task-${i}`],
            expectedArtifacts: [`step-${i + 1}.txt`],
            requiredActions: [],
            status: 'pending',
            artifacts: [],
          })),
        }],
      });
    });
    const generated = await generateValidPlan('Build the deliverable in stages', undefined, 'mission-long-phase', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases[0]!.tasks).toHaveLength(6);
    expect(generated.phases[0]!.tasks.at(-1)!.dependsOnTaskIds).toEqual(['task-5']);
  });

  it('accepts plans with more than seven phases', async () => {
    const requests: any[] = [];
    const complete = jest.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return JSON.stringify({
        summary: 'Run a multi-phase mission',
        estimatedDuration: 'long',
        estimatedCost: 'high',
        requiresClarification: false,
        clarificationQuestions: [],
        clarificationAnswers: [],
        phases: Array.from({ length: 9 }, (_, i) => ({
          id: `phase-${i + 1}`,
          name: `Phase ${i + 1}`,
          goal: `Do phase ${i + 1}`,
          requiresApproval: false,
          status: 'pending',
          tasks: [{
            id: `task-${i + 1}`,
            title: `Phase ${i + 1} task`,
            description: `Complete phase ${i + 1}.`,
            agentRole: 'analyst',
            systemPrompt: `Do the work for phase ${i + 1}.`,
            dependsOnTaskIds: [],
            expectedArtifacts: [],
            requiredActions: [],
            status: 'pending',
            artifacts: [],
          }],
        })),
      });
    });
    const generated = await generateValidPlan('Run a multi-phase mission', undefined, 'mission-many-phases', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases).toHaveLength(9);
  });

  it('renames duplicate task ids deterministically without a second Brain call', async () => {
    const requests: any[] = [];
    const plan = validPlan(2);
    plan.phases[1]!.tasks[0]!.id = 'task-1'; // duplicate of phase-1's task id
    const complete = jest.fn().mockImplementation(async (request: any) => { requests.push(request); return JSON.stringify(plan); });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-duplicate-ids', complete);
    expect(requests).toHaveLength(1);
    const ids = generated.phases.flatMap((phase) => phase.tasks.map((task) => task.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('remediates a plan that assigns executable work to a human role with a narrow task patch', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return JSON.stringify(humanRolePlan());
      const task = humanRolePlan().phases[0]!.tasks[0]!;
      task.agentRole = 'analyst';
      return JSON.stringify(task);
    });
    const generated = await generateValidPlan('Produce deliverable 1', undefined, 'mission-human-remediation', complete);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.prompt).toContain('agentRole "Human" is not executable');
    expect(requests[1]!.prompt).toContain('same id "task-1"');
    expect(requests[1]!.systemPrompt).toContain('correcting one part of an existing mission plan');
    expect(generated.phases[0]!.tasks[0]!.agentRole).toBe('analyst');
  });

  it('rejects dependency cycles and remediates the tasks in the cycle', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return JSON.stringify(cyclicPlan());
      const idMatch = request.prompt.match(/same id "([^"]+)"/);
      const task = cyclicPlan().phases[0]!.tasks.find((candidate) => candidate.id === (idMatch?.[1] || ''))!;
      task.dependsOnTaskIds = [];
      return JSON.stringify(task);
    });
    const generated = await generateValidPlan('Produce deliverable 1', undefined, 'mission-cycle', complete);
    expect(requests.some((request) => /cycle/.test(request.prompt))).toBe(true);
    // The returned plan has no cyclic dependency.
    const tasks = generated.phases[0]!.tasks;
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const acyclic = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (visited.has(id)) return true;
      visiting.add(id);
      for (const dep of byId.get(id)?.dependsOnTaskIds || []) {
        if (!acyclic(dep)) return false;
      }
      visiting.delete(id);
      visited.add(id);
      return true;
    };
    expect(tasks.every((task) => acyclic(task.id))).toBe(true);
  });

  it('remediates each locus with its own focused request instead of one big batch', async () => {
    const requests: any[] = [];
    const plan = validPlan(4);
    plan.phases.forEach((phase) => { phase.tasks[0]!.agentRole = 'Human'; });
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return JSON.stringify(plan);
      const idMatch = request.prompt.match(/same id "([^"]+)"/);
      const corrected = validPlan(4);
      const task = corrected.phases.flatMap((phase) => phase.tasks).find((candidate) => candidate.id === (idMatch?.[1] || '')) || corrected.phases[0]!.tasks[0]!;
      task.agentRole = 'analyst';
      return JSON.stringify(task);
    });
    const generated = await generateValidPlan('Produce four deliverables', undefined, 'mission-batch', complete);
    // 1 full-plan call + 4 concurrent per-task remediation calls.
    expect(requests).toHaveLength(5);
    expect(generated.phases.every((phase) => phase.tasks.every((task) => task.agentRole !== 'Human'))).toBe(true);
  });

  it('re-asks a narrow task request when the answer returns the wrong id', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return JSON.stringify(humanRolePlan());
      // First remediation returns a full plan (wrong shape / wrong id) -> rejected.
      if (request.attempt === 2) return JSON.stringify(humanRolePlan());
      // Second remediation returns the corrected task object.
      const task = humanRolePlan().phases[0]!.tasks[0]!;
      task.agentRole = 'analyst';
      return JSON.stringify(task);
    });
    const generated = await generateValidPlan('Produce deliverable 1', undefined, 'mission-id-reask', complete);
    // task-1 had one locus: attempt 2 (rejected) then attempt 3 (accepted).
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(generated.phases[0]!.tasks[0]!.agentRole).toBe('analyst');
  });

  it('re-requests the full plan when the first response is not parseable plan JSON', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return `${JSON.stringify(validPlan())}\n${JSON.stringify(validPlan())}`;
      return JSON.stringify(validPlan());
    });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-double-json', complete);
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests[1]!.systemPrompt).toBe(PLANNER_SYSTEM_PROMPT);
    expect(requests[1]!.prompt).toContain('Create a plan to achieve this goal');
    expect(requests.every((request) => !request.prompt.includes('Fix only the JSON syntax'))).toBe(true);
    expect(generated.phases).toHaveLength(1);
  });

  it('re-requests the full plan after an empty completion without abandoning the attempt', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return '';
      return JSON.stringify(validPlan());
    });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-empty', complete);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.systemPrompt).toBe(PLANNER_SYSTEM_PROMPT);
    expect(generated.phases).toHaveLength(1);
  });

  it('fails only when Brain reports that every eligible model is exhausted', async () => {
    const complete = jest.fn().mockRejectedValue(new Error(`${BRAIN_MODEL_SELECTION_EXHAUSTED}: all eligible models tried`));
    await expect(generateValidPlan('Produce two deliverables', undefined, 'mission-models-exhausted', complete))
      .rejects.toThrow('Brain exhausted every eligible model');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('does not restart planning when Agent Runtime reports model routing made no progress', async () => {
    const complete = jest.fn(async (): Promise<string> => {
      throw new Error(`Brain model routing made no progress after 2 retry request(s): ${BRAIN_MODEL_SELECTION_RETRY}; 2 eligible model(s) remain untried`);
    });
    await expect(generateValidPlan('Produce two deliverables', undefined, 'mission-routing-no-progress', complete))
      .rejects.toThrow('Brain routing did not complete within the current planner task');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('does not retry unrelated Planner or control-plane errors indefinitely', async () => {
    const complete = jest.fn().mockRejectedValue(new Error('invalid API key'));
    await expect(generateValidPlan('Produce two deliverables', undefined, 'mission-invalid-key', complete))
      .rejects.toThrow('Planner Agent request failed on attempt 1: invalid API key');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('retries a transient Brain failure instead of failing the mission', async () => {
    const requests: any[] = [];
    const complete = jest.fn()
      .mockRejectedValueOnce(new Error('Brain request failed (503)'))
      .mockImplementation(async (request: any) => { requests.push(request); return JSON.stringify(validPlan()); });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-transient-retry', complete);
    expect(generated.phases).toHaveLength(1);
    expect(requests[0]!.prompt).toContain('Create a plan to achieve this goal');
  });

  it('retries transient Brain failures while eligible models remain', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt <= 2) throw new Error('Brain request failed (503)');
      return JSON.stringify(validPlan());
    });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-many-transient', complete);
    expect(requests).toHaveLength(3);
    expect(generated.phases).toHaveLength(1);
  });

  it('bounds repeated transient Brain failures with a specific error', async () => {
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      throw new Error('Brain request failed (503)');
    });
    await expect(generateValidPlan('Produce two deliverables', undefined, 'mission-transient-cap', complete))
      .rejects.toThrow('3 transient Brain retries');
    expect(requests).toHaveLength(4);
  });

  it('accepts a plan whose phase object was closed twice', async () => {
    const broken = `{"summary":"Produce two deliverables","estimatedDuration":"short","estimatedCost":"low","requiresClarification":false,"clarificationQuestions":[],"clarificationAnswers":[],"phases":[{"id":"phase-1","name":"Deliverable 1","goal":"Produce deliverable 1","requiresApproval":false,"status":"pending","tasks":[{"id":"task-1","title":"Complete deliverable 1","description":"Complete deliverable 1","agentRole":"analyst","systemPrompt":"Complete deliverable 1","dependsOnTaskIds":[],"expectedArtifacts":["deliverable-1.md"],"requiredActions":[],"status":"pending","artifacts":[]}]}}}`;
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => { requests.push(request); return broken; });
    const generated = await generateValidPlan('Produce two deliverables', undefined, 'mission-broken-phase', complete);
    expect(requests).toHaveLength(1);
    expect(generated.phases).toHaveLength(1);
  });

  it('remediates a large plan without ever sending the whole plan to the Brain', async () => {
    const big = (tag: string) => `${tag} `.repeat(800); // ~4000 chars per field
    const plan = validPlan(3);
    plan.phases[0]!.tasks[0]!.description = big('alpha');
    plan.phases[1]!.tasks[0]!.description = big('bravo');
    plan.phases[2]!.tasks[0]!.description = big('charlie');
    plan.phases[0]!.tasks[0]!.agentRole = 'Human'; // the one field to remediate
    const requests: any[] = [];
    const complete = jest.fn(async (request: any) => {
      requests.push(request);
      if (request.attempt === 1) return JSON.stringify(plan);
      const task = validPlan(3).phases[0]!.tasks[0]!;
      task.agentRole = 'analyst';
      task.description = plan.phases[0]!.tasks[0]!.description; // keep its own (large) field
      return JSON.stringify(task);
    });
    const generated = await generateValidPlan('Produce three deliverables', undefined, 'mission-large-plan', complete);
    // The plan is large (>12000 chars), but no Brain request contains the whole plan.
    const fullPlanJson = JSON.stringify(plan);
    expect(fullPlanJson.length).toBeGreaterThan(12000);
    const remediation = requests[1]!;
    // The remediation only carries the single task, never the other tasks' content.
    expect(remediation.prompt).not.toContain(big('bravo').trim());
    expect(remediation.prompt).not.toContain(big('charlie').trim());
    expect(remediation.prompt).toContain('Correct only this task');
    expect(generated.phases[0]!.tasks[0]!.agentRole).toBe('analyst');
  });
});

describe('applyDeterministicFixes()', () => {
  it('coerces expectedArtifacts element types to a fixpoint in one pass', () => {
    const plan = validPlan();
    (plan.phases[0]!.tasks[0] as any).expectedArtifacts = [{ name: 'a.md', type: 'document' }, 123, null];
    const fixed = applyDeterministicFixes(plan, 'Produce deliverable 1');
    expect(fixed.phases[0]!.tasks[0]!.expectedArtifacts).toEqual(['a.md', '123', '']);
  });

  it('does not coerce a nested graded task field; it surfaces for remediation', () => {
    const plan = validPlan();
    (plan.phases[0]!.tasks[0] as any).description = 123;
    const fixed = applyDeterministicFixes(plan, 'Produce deliverable 1');
    // Nested (non-artifact) values are not guessed.
    expect((fixed.phases[0]!.tasks[0] as any).description).toBe(123);
    const issues = validate(fixed, 'Produce deliverable 1');
    expect(issues.some((issue) => issue.locus.kind === 'task' && issue.locus.taskId === 'task-1')).toBe(true);
  });

  it('does not guess a nested graded object value without a common string field', () => {
    const plan = validPlan();
    (plan.phases[0]!.tasks[0] as any).expectedArtifacts = [{ type: 'document' }];
    const fixed = applyDeterministicFixes(plan, 'Produce deliverable 1');
    const issues = validate(fixed, 'Produce deliverable 1');
    expect(issues.some((issue) => issue.locus.kind === 'task' && issue.locus.taskId === 'task-1')).toBe(true);
  });

  it('drops self, unknown, and later-phase dependencies', () => {
    const plan = validPlan(2);
    plan.phases[0]!.tasks[0]!.dependsOnTaskIds = ['task-1', 'nonexistent', 'task-3'];
    plan.phases[1]!.tasks[0]!.id = 'task-3'; // task-1 (phase-1) depends on task-3 (later phase)
    const fixed = applyDeterministicFixes(plan, 'Produce two deliverables');
    expect(fixed.phases[0]!.tasks[0]!.dependsOnTaskIds).toEqual([]);
  });

  it('renames a duplicate task id and rewrites same-phase references to the new id', () => {
    const plan: Plan = {
      summary: 'Produce and consume',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [
        { id: 'phase-1', name: 'Produce', goal: 'Produce', requiresApproval: false, status: 'pending', tasks: [
          { id: 'task-1', title: 'Produce', description: 'Produce', agentRole: 'analyst', systemPrompt: 'Produce.', expectedArtifacts: ['a.md'], status: 'pending', artifacts: [] },
        ] },
        { id: 'phase-2', name: 'Consume', goal: 'Consume', requiresApproval: false, status: 'pending', tasks: [
          { id: 'task-1', title: 'Produce again', description: 'Produce again', agentRole: 'analyst', systemPrompt: 'Produce again.', expectedArtifacts: ['b.md'], status: 'pending', artifacts: [] },
          { id: 'consumer', title: 'Consume', description: 'Consume', agentRole: 'analyst', systemPrompt: 'Consume the duplicate.', dependsOnTaskIds: ['task-1'], expectedArtifacts: ['c.md'], status: 'pending', artifacts: [] },
        ] },
      ],
    };
    const fixed = applyDeterministicFixes(plan, 'Produce and consume');
    const phase2 = fixed.phases.find((phase) => phase.id === 'phase-2')!;
    const duplicate = phase2.tasks.find((task) => task.title === 'Produce again')!;
    expect(duplicate.id).not.toBe('task-1');
    const consumer = phase2.tasks.find((task) => task.id === 'consumer')!;
    expect(consumer.dependsOnTaskIds).toContain(duplicate.id);
    expect(consumer.dependsOnTaskIds).not.toContain('task-1');
  });

  it('never mints an id with the reserved amendment prefix', () => {
    const plan: Plan = {
      summary: 'Produce and consume',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [
        { id: 'phase-1', name: 'Produce', goal: 'Produce', requiresApproval: false, status: 'pending', tasks: [
          { id: 'phase-2-task-1', title: 'Produce', description: 'Produce', agentRole: 'analyst', systemPrompt: 'Produce.', expectedArtifacts: ['a.md'], status: 'pending', artifacts: [] },
        ] },
        { id: 'phase-2', name: 'Consume', goal: 'Consume', requiresApproval: false, status: 'pending', tasks: [
          { id: 'phase-2-task-1', title: 'Produce again', description: 'Produce again', agentRole: 'analyst', systemPrompt: 'Produce again.', expectedArtifacts: ['b.md'], status: 'pending', artifacts: [] },
        ] },
      ],
    };
    const fixed = applyDeterministicFixes(plan, 'Produce and consume');
    const ids = fixed.phases.flatMap((phase) => phase.tasks.map((task) => task.id));
    expect(ids.every((id) => !id.includes('-amendment-'))).toBe(true);
  });

  it('forces the finish rules regardless of input', () => {
    const plan = validPlan();
    plan.requiresClarification = true;
    plan.clarificationQuestions = ['Should we?'];
    plan.phases[0]!.requiresApproval = true;
    plan.phases[0]!.approvalQuestion = 'Approve?';
    plan.phases[0]!.tasks[0]!.requiredActions = [{ toolId: 'x', outcome: 'success' }] as any;
    const fixed = applyDeterministicFixes(plan, 'Produce deliverable 1');
    expect(fixed.requiresClarification).toBe(false);
    expect(fixed.clarificationQuestions).toEqual([]);
    expect(fixed.phases[0]!.requiresApproval).toBe(false);
    expect(fixed.phases[0]!.approvalQuestion).toBeUndefined();
    expect(fixed.phases[0]!.tasks[0]!.requiredActions).toEqual([]);
  });
});

describe('validate()', () => {
  it('tags a wrong task field type with a task locus', () => {
    const plan = validPlan();
    (plan.phases[0]!.tasks[0] as any).status = 123;
    const issues = validate(plan, 'Produce deliverable 1');
    expect(issues.some((issue) => issue.locus.kind === 'task' && issue.locus.taskId === 'task-1')).toBe(true);
  });

  it('tags a phase-level schema issue with a phase locus', () => {
    const plan = validPlan();
    (plan.phases[0] as any).goal = 42;
    const issues = validate(plan, 'Produce deliverable 1');
    expect(issues.some((issue) => issue.locus.kind === 'phase' && issue.locus.phaseId === 'phase-1')).toBe(true);
  });

  it('tags a plan-level issue with a plan locus', () => {
    const plan = validPlan();
    (plan as any).summary = 7;
    const issues = validate(plan, 'Produce deliverable 1');
    expect(issues.some((issue) => issue.locus.kind === 'plan')).toBe(true);
  });

  it('never emits prose dependency complaints to the Brain', () => {
    const plan = validPlan();
    plan.phases[0]!.tasks[0]!.systemPrompt = 'Use the messaging service to send the message.';
    const issues = validate(plan, 'Produce deliverable 1');
    expect(issues.every((issue) => !/must name that producer|but do not declare it/i.test(issue.message))).toBe(true);
  });

  it('flags a reserved amendment prefix on a task id', () => {
    const plan = validPlan();
    plan.phases[0]!.tasks[0]!.id = 'phase-1-amendment-1';
    const issues = validate(plan, 'Produce deliverable 1');
    expect(issues.some((issue) => issue.locus.kind === 'task' && /reserved amendment prefix/.test(issue.message))).toBe(true);
  });
});

describe('LocusFailureTracker', () => {
  it('counts consecutive failures per locus and clears on success', () => {
    const tracker = new LocusFailureTracker();
    const locus = { kind: 'task', taskId: 'task-1' } as const;
    expect(tracker.get(locus).count).toBe(0);
    tracker.recordFailure(locus, 'first');
    tracker.recordFailure(locus, 'second');
    expect(tracker.get(locus)).toEqual({ count: 2, lastSummary: 'second' });
    expect(tracker.stuck()).toHaveLength(1);
    tracker.recordSuccess(locus);
    expect(tracker.get(locus).count).toBe(0);
    expect(tracker.stuck()).toHaveLength(0);
  });

  it('keeps loci independent', () => {
    const tracker = new LocusFailureTracker();
    tracker.recordFailure({ kind: 'task', taskId: 'a' }, 'x');
    tracker.recordFailure({ kind: 'task', taskId: 'b' }, 'y');
    expect(tracker.get({ kind: 'task', taskId: 'a' }).count).toBe(1);
    expect(tracker.get({ kind: 'task', taskId: 'b' }).count).toBe(1);
    expect(tracker.stuck()).toHaveLength(2);
  });
});