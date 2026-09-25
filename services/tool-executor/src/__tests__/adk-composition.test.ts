import {
  InMemoryPersistencePort,
  createApprovalPolicy,
  createAssistant,
  createPersistencePolicy,
  createContextPolicy,
  createSkill,
  createTool,
  createWorkflow,
  createWorkflowLane,
  createWorkflowStage,
  resolveConfiguration,
  resolveContext,
  shouldRequireApproval,
  type AssistantContext,
  type AssistantRuntimeState,
} from '../adk';
import { EVENT_PLANNING_BUDGETING } from '../data/skills/event/event-planning-budgeting';

describe('ADK assistant composition', () => {
  const planningTool = createTool({
    id: 'event_planning_budgeting',
    name: 'Event Planning & Budgeting',
    description: 'Create an event plan and budget.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: 'console.log("plan");' },
    inputSchema: { type: 'object', properties: { eventName: { type: 'string' } }, required: ['eventName'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
  });

  const workflow = createWorkflow({
    assistantId: 'event',
    productObject: 'event / vendor',
    flow: 'plan -> vendors -> day-of',
    stages: [
      createWorkflowStage({
        id: 'plan',
        name: 'Plan',
        description: 'Create the event plan and budget.',
        skillIds: [planningTool.id],
        transitions: ['vendors'],
      }),
      createWorkflowStage({
        id: 'vendors',
        name: 'Vendors',
        description: 'Manage vendor contracts.',
        skillIds: [],
        transitions: ['day-of'],
      }),
      createWorkflowStage({
        id: 'day-of',
        name: 'Day-of',
        description: 'Run event operations.',
        skillIds: [],
      }),
    ],
    lanes: [
      createWorkflowLane({
        id: 'planning',
        name: 'Planning',
        description: 'Plan the event.',
        stageIds: ['plan'],
        modes: ['draft'],
      }),
      createWorkflowLane({
        id: 'execution',
        name: 'Execution',
        description: 'Execute the event.',
        stageIds: ['vendors', 'day-of'],
        modes: ['review', 'live'],
      }),
    ],
  });

  it('composes a parameterized custom Assistant with skills, lanes, policies, and persistence', () => {
    const skill = createSkill({
      tool: planningTool,
      laneId: 'planning',
      stageId: 'plan',
    });
    const port = new InMemoryPersistencePort<AssistantRuntimeState>();
    const assistant = createAssistant({
      identity: { id: 'event', name: 'Event', description: 'Event operations assistant' },
      productObjects: ['event / vendor'],
      workflow,
      skills: [skill],
      configuration: {
        defaults: { region: 'us-east', currency: 'USD' },
        requiredKeys: ['region'],
      },
      contextPolicy: { objectKeys: ['eventId'] },
      approvalPolicy: {
        requiresConfirmation: (request) => request.action === 'book',
        dryRunByDefault: true,
        allowedStates: ['draft'],
      },
      persistence: {
        port,
        namespace: 'event-test',
        revisionLimit: 5,
      },
    });

    expect(assistant.id).toBe('event');
    expect(assistant.workflow.id).toBe('event-workflow');
    expect(assistant.workflow.lanes).toHaveLength(2);
    expect(assistant.skills[0].tool.id).toBe(planningTool.id);
    expect(assistant.tools.map((tool) => tool.id)).toEqual([planningTool.id]);
    expect(assistant.persistence.namespace).toBe('event-test');
    expect(assistant.persistence.revisionLimit).toBe(5);
    expect(resolveConfiguration(assistant.configuration, { region: 'eu-west' })).toMatchObject({
      region: 'eu-west',
      currency: 'USD',
    });
    expect(() => resolveConfiguration(assistant.configuration, { region: '' })).toThrow(/Required configuration/);

    const state: AssistantRuntimeState = {
      assistantId: assistant.id,
      context: { productObject: 'event / vendor', objectId: 'event-1', data: { eventName: 'Launch' }, version: 1 },
      configuration: { region: 'us-east' },
      workflowState: 'draft',
      approvals: [],
      updatedAt: new Date(),
    };
    port.save('event-1', state);
    expect(port.load('event-1')).toBe(state);
    expect(createPersistencePolicy(port, 'event-test').namespace).toBe('event-test');
  });

  it('enforces object context and approval policy decisions', () => {
    const contextPolicy = createContextPolicy<{ eventId: string }>({ objectKeys: ['eventId'] });
    const first = resolveContext(contextPolicy, { eventId: 'event-1', productObject: 'event / vendor' });
    expect(first.valid).toBe(true);
    const current = first.context as AssistantContext<{ eventId: string }>;
    expect(resolveContext(contextPolicy, { eventId: 'event-1', attendeeCount: 2 }, current).valid).toBe(true);
    expect(resolveContext(contextPolicy, { eventId: 'event-2' }, current)).toMatchObject({
      valid: false,
      error: expect.stringContaining('event-1'),
    });

    const approvalPolicy = createApprovalPolicy({
      requiresConfirmation: (request) => request.action === 'book',
      dryRunByDefault: true,
      allowedStates: ['draft'],
    });
    expect(
      shouldRequireApproval(approvalPolicy, {
        assistantId: 'event',
        toolId: planningTool.id,
        action: 'book',
        dryRun: true,
        workflowState: 'draft',
        scope: {},
        input: {},
      }),
    ).toBe(false);
    expect(
      shouldRequireApproval(approvalPolicy, {
        assistantId: 'event',
        toolId: planningTool.id,
        action: 'book',
        workflowState: 'draft',
        scope: {},
        input: {},
      }),
    ).toBe(true);
    expect(
      shouldRequireApproval(approvalPolicy, {
        assistantId: 'event',
        toolId: planningTool.id,
        action: 'book',
        workflowState: 'executed',
        scope: {},
        input: {},
      }),
    ).toBe(false);
  });

  it('keeps the migrated event skill public identity and code-skill behavior', () => {
    expect(EVENT_PLANNING_BUDGETING.id).toBe('event-planning-budgeting');
    expect(EVENT_PLANNING_BUDGETING.name).toBe('Event Planning & Budgeting');
    expect(EVENT_PLANNING_BUDGETING.type).toBe('code');
    expect(EVENT_PLANNING_BUDGETING.manifest.language).toBe('javascript');
    expect(EVENT_PLANNING_BUDGETING.manifest.entrypoint).toBe('index.js');
    expect(typeof EVENT_PLANNING_BUDGETING.manifest.sourceCode).toBe('string');
    expect(EVENT_PLANNING_BUDGETING.inputSchema?.required).toEqual(['task', 'eventName']);
  });

  it('rejects mismatched workflow and skill composition', () => {
    expect(() =>
      createAssistant({
        identity: { id: 'event', name: 'Event', description: 'Event operations assistant' },
        productObjects: ['event'],
        workflow: { ...workflow, assistantId: 'other' },
        skills: [],
      }),
    ).toThrow(/does not match/);

    expect(() =>
      createWorkflow({
        assistantId: 'event',
        productObject: 'event',
        flow: 'plan',
        stages: [
          createWorkflowStage({ id: 'plan', name: 'Plan', description: 'Plan', skillIds: [] }),
        ],
        lanes: [
          createWorkflowLane({ id: 'execution', name: 'Execution', description: 'Execute', stageIds: ['missing'] }),
        ],
      }),
    ).toThrow(/unknown stage/);
  });
});
