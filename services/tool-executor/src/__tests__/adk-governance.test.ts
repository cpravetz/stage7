import {
  InMemoryPersistencePort,
  createApprovalPolicy,
  createApprovalRecord,
  createAssistant,
  createContext,
  createContextPolicy,
  createPersistencePolicy,
  createTool,
  resolveConfiguration,
  resolveContext,
  shouldRequireApproval,
  type AssistantContext,
  type AssistantRuntimeState,
} from '../adk';
import { eventSkills } from '../assistants/event';
import { allWorkflows } from '../data/skills';

const planningTool = createTool({
  id: 'event-planning-budgeting',
  name: 'Event Planning & Budgeting',
  description: 'Create an event plan and budget.',
  type: 'code',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: 'console.log("plan");' },
  inputSchema: { type: 'object', properties: { eventName: { type: 'string' } }, required: ['eventName'] },
  outputSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
});

describe('ADK governance', () => {
  describe('createTool', () => {
    it('fills manifest and timestamps, and rejects a blank id or name', () => {
      const tool = createTool({
        id: 'a-tool',
        name: 'A Tool',
        description: 'Does a thing.',
        type: 'code',
      });
      expect(tool.manifest).toEqual({});
      expect(tool.createdAt).toBeInstanceOf(Date);
      expect(() => createTool({ id: '  ', name: 'A Tool', description: 'x', type: 'code' })).toThrow(/tool id/);
      expect(() => createTool({ id: 'a-tool', name: '', description: 'x', type: 'code' })).toThrow(/tool name/);
    });
  });

  describe('createAssistant', () => {
    const build = () =>
      createAssistant({
        identity: { id: 'event', name: 'Event', description: 'Event operations assistant' },
        productObjects: ['event / vendor'],
        skills: [planningTool],
        configuration: { defaults: { region: 'us-east', currency: 'USD' }, requiredKeys: ['region'] },
        contextPolicy: { objectKeys: ['eventId'] },
        approvalPolicy: {
          requiresConfirmation: (request) => request.action === 'book',
          dryRunByDefault: true,
          allowedStates: ['draft'],
        },
        persistence: { namespace: 'event-test', revisionLimit: 5 },
      });

    it('composes an assistant from a flat skill set and its policies', () => {
      const assistant = build();

      expect(assistant.id).toBe('event');
      expect(assistant.skills.map((s) => s.id)).toEqual([planningTool.id]);
      expect(assistant.tools.map((t) => t.id)).toEqual([planningTool.id]);
      expect(assistant.persistence.namespace).toBe('event-test');
      expect(assistant.persistence.revisionLimit).toBe(5);
      expect(assistant.approvalPolicy.allowedStates).toEqual(['draft']);
      expect(assistant.contextPolicy.objectKeys).toEqual(['eventId']);
    });

    it('resolves tools from the skills set and explicit tools without duplication', () => {
      const extra = createTool({ id: 'extra', name: 'Extra', description: 'x', type: 'code' });
      const assistant = createAssistant({
        identity: { id: 'event', name: 'Event', description: 'x' },
        productObjects: ['event / vendor'],
        skills: [planningTool],
        tools: [planningTool, extra],
      });
      expect(assistant.tools.map((t) => t.id)).toEqual([planningTool.id, extra.id]);
    });

    it('rejects duplicate skills, duplicate product objects, and a missing product object', () => {
      const identity = { id: 'event', name: 'Event', description: 'x' };
      expect(() =>
        createAssistant({ identity, productObjects: ['event'], skills: [planningTool, planningTool] }),
      ).toThrow(/Duplicate assistant skill/);
      expect(() =>
        createAssistant({ identity, productObjects: ['event', 'event'], skills: [] }),
      ).toThrow(/Duplicate assistant product object/);
      expect(() => createAssistant({ identity, productObjects: [], skills: [] })).toThrow(
        /At least one product object/,
      );
    });

    it('requires an assistant id and name', () => {
      expect(() =>
        createAssistant({ identity: { id: '', name: 'Event', description: 'x' }, productObjects: ['e'], skills: [] }),
      ).toThrow(/assistant id/);
      expect(() =>
        createAssistant({ identity: { id: 'event', name: ' ', description: 'x' }, productObjects: ['e'], skills: [] }),
      ).toThrow(/assistant name/);
    });
  });

  describe('resolveConfiguration', () => {
    const configuration = { defaults: { region: 'us-east', currency: 'USD' }, requiredKeys: ['region'] };

    it('merges overrides over defaults and enforces required keys', () => {
      expect(resolveConfiguration(configuration, { region: 'eu-west' })).toEqual({
        region: 'eu-west',
        currency: 'USD',
      });
      expect(() => resolveConfiguration(configuration, { region: '' })).toThrow(/Required configuration/);
    });

    it('surfaces a custom validator error', () => {
      const strict = {
        defaults: { region: 'us-east' },
        requiredKeys: [],
        validate: (value: { region: string }) => (value.region === 'us-east' ? 'region must not be us-east' : undefined),
      };
      expect(() => resolveConfiguration(strict, {})).toThrow(/must not be us-east/);
      expect(resolveConfiguration(strict, { region: 'eu-west' })).toEqual({ region: 'eu-west' });
    });
  });

  describe('object context continuity', () => {
    const policy = createContextPolicy<{ eventId: string }>({ objectKeys: ['eventId'] });

    it('accepts the same object and rejects a different one', () => {
      const first = resolveContext(policy, { eventId: 'event-1', productObject: 'event / vendor' });
      expect(first.valid).toBe(true);
      const current = first.context as AssistantContext<{ eventId: string }>;

      const continued = resolveContext(policy, { eventId: 'event-1', attendeeCount: 2 }, current);
      expect(continued.valid).toBe(true);
      // The object key is the context's identity, so it is not carried as payload.
      expect(continued.context?.objectId).toBe('event-1');
      expect(continued.context?.data).toMatchObject({ attendeeCount: 2 });

      expect(resolveContext(policy, { eventId: 'event-2' }, current)).toMatchObject({
        valid: false,
        error: expect.stringContaining('event-1'),
      });
    });

    it('bumps the context version on each resolution that names an object', () => {
      const first = resolveContext(policy, { eventId: 'event-1' });
      const second = resolveContext(policy, { eventId: 'event-1' }, first.context);
      expect(first.context?.version).toBe(1);
      expect(second.context?.version).toBe(2);
    });

    it('passes through input that names no object', () => {
      expect(resolveContext(policy, { attendeeCount: 2 }).valid).toBe(true);
    });

    it('rejects a changed product object', () => {
      const current = resolveContext(policy, { eventId: 'event-1', productObject: 'event / vendor' }).context;
      const result = resolveContext(policy, { eventId: 'event-1', productObject: 'invoice' }, current);
      expect(result).toMatchObject({ valid: false, error: expect.stringContaining('Product context changed') });
    });

    it('permits a cross-object handoff when the policy allows it', () => {
      const lax = createContextPolicy<{ eventId: string }>({
        objectKeys: ['eventId'],
        allowCrossObjectHandoff: true,
      });
      const current = resolveContext(lax, { eventId: 'event-1' }).context;
      expect(resolveContext(lax, { eventId: 'event-2' }, current).valid).toBe(true);
    });

    it('createContext requires a product object', () => {
      expect(() => createContext({ productObject: '', data: {} })).toThrow(/product object/);
      expect(createContext({ productObject: 'event / vendor', data: { a: 1 } })).toMatchObject({
        productObject: 'event / vendor',
        version: 1,
      });
    });
  });

  describe('approval decisions', () => {
    const policy = createApprovalPolicy({
      requiresConfirmation: (request) => request.action === 'book',
      dryRunByDefault: true,
      allowedStates: ['draft'],
    });

    const request = (overrides: Partial<Parameters<typeof shouldRequireApproval>[1]> = {}) => ({
      assistantId: 'event',
      toolId: planningTool.id,
      action: 'book',
      scope: {},
      input: {},
      ...overrides,
    });

    it('skips the gate for a dry run', () => {
      expect(shouldRequireApproval(policy, request({ dryRun: true, workflowState: 'draft' }))).toBe(false);
    });

    it('requires confirmation for a gated action in an allowed state', () => {
      expect(shouldRequireApproval(policy, request({ workflowState: 'draft' }))).toBe(true);
    });

    it('does not apply outside the allowed states', () => {
      expect(shouldRequireApproval(policy, request({ workflowState: 'executed' }))).toBe(false);
    });

    it('defers to the policy for a non-gated action', () => {
      expect(shouldRequireApproval(policy, request({ action: 'plan', workflowState: 'draft' }))).toBe(false);
    });

    it('defaults to no gate, dry run on, and advisory states', () => {
      const defaults = createApprovalPolicy();
      expect(defaults.dryRunByDefault).toBe(true);
      expect(defaults.allowedStates).toEqual(['draft', 'recommendation']);
      expect(shouldRequireApproval(defaults, request({ workflowState: 'draft' }))).toBe(false);
    });

    it('summarizes a request for the UI', () => {
      const summary = policy.summarize(request({ toolName: 'Event Planning', workflowState: 'draft' }));
      expect(summary).toMatchObject({
        toolId: planningTool.id,
        toolName: 'Event Planning',
        action: 'book',
        requiresConfirmation: true,
        dryRun: true,
      });
      expect(policy.summarize(request({ action: 'plan' })).requiresConfirmation).toBe(false);
    });

    it('records an approval decision with a stable id', () => {
      const record = createApprovalRecord(
        { assistantId: 'event', toolId: planningTool.id, action: 'book', scope: {}, input: {} },
        'tester',
      );
      expect(record).toMatchObject({ decision: 'pending', actor: 'tester', toolId: planningTool.id });
      expect(record.requestId).toBe(record.id);
    });
  });

  describe('persistence', () => {
    it('round-trips runtime state and honours the namespace policy', () => {
      const port = new InMemoryPersistencePort<AssistantRuntimeState>();
      const state: AssistantRuntimeState = {
        assistantId: 'event',
        context: { productObject: 'event / vendor', objectId: 'event-1', data: { eventName: 'Launch' }, version: 1 },
        configuration: { region: 'us-east' },
        workflowState: 'draft',
        approvals: [],
        updatedAt: new Date(),
      };
      port.save('event-1', state);
      expect(port.load('event-1')).toBe(state);
      expect(port.list()).toEqual([{ id: 'event-1', state }]);
      expect(port.delete('event-1')).toBe(true);
      expect(port.load('event-1')).toBeUndefined();
      expect(createPersistencePolicy(port, 'event-test').namespace).toBe('event-test');
    });
  });

  describe('shipped assistant catalogs', () => {
    it('exposes every assistant workflow without stages', () => {
      expect(allWorkflows.length).toBeGreaterThan(0);
      for (const workflow of allWorkflows) {
        expect(workflow.assistant).toBeTruthy();
        expect(workflow.productObject).toBeTruthy();
        expect(workflow).not.toHaveProperty('stages');
      }
    });

    it('does not annotate skills with a workflow stage', () => {
      for (const skill of eventSkills) {
        expect(skill.manifest).not.toHaveProperty('workflowStage');
      }
    });

    it('keeps the event skill public identity and code-skill behavior', () => {
      const skill = eventSkills[0];
      expect(skill.id).toBe('event-planning-budgeting');
      expect(skill.name).toBe('Event Planning & Budgeting');
      expect(skill.type).toBe('code');
      expect(skill.manifest.language).toBe('javascript');
      expect(skill.manifest.entrypoint).toBe('index.js');
      expect(typeof skill.manifest.sourceCode).toBe('string');
      expect(skill.inputSchema?.required).toEqual(['task', 'eventName']);
    });
  });
});
