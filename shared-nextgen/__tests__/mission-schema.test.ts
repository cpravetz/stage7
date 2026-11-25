import { PlanSchema, TaskSchema } from '../src/types/mission';

function planWithTask(taskOverrides: Record<string, unknown>) {
  return {
    summary: 'Produce deliverable',
    requiresClarification: false,
    clarificationQuestions: [],
    clarificationAnswers: [],
    phases: [{
      id: 'phase-1',
      name: 'Produce',
      goal: 'Produce the deliverable',
      requiresApproval: false,
      status: 'pending',
      tasks: [{
        id: 'phase-1-task-1',
        title: 'Produce it',
        description: 'Produce the deliverable.',
        agentRole: 'writer',
        systemPrompt: 'Produce the deliverable.',
        dependsOnTaskIds: [],
        expectedArtifacts: [],
        requiredActions: [],
        status: 'pending',
        artifacts: [],
        ...taskOverrides,
      }],
    }],
  };
}

describe('TaskSchema estimatedComplexity/selectionCriteria', () => {
  it('parses a plan that carries both new fields', () => {
    const plan = planWithTask({ estimatedComplexity: 'high', selectionCriteria: 'accuracy' });
    const parsed = PlanSchema.parse(plan);
    const task = parsed.phases[0]!.tasks[0]!;
    expect(task.estimatedComplexity).toBe('high');
    expect(task.selectionCriteria).toBe('accuracy');
  });

  it('parses a legacy plan without the fields (they stay undefined)', () => {
    const parsed = PlanSchema.parse(planWithTask({}));
    const task = parsed.phases[0]!.tasks[0]!;
    expect(task.estimatedComplexity).toBeUndefined();
    expect(task.selectionCriteria).toBeUndefined();
  });

  it('survives the persisted-plan read-back round trip', () => {
    // MissionClient.loadPersistedPlan re-parses JSON.stringify'd plan JSON
    // with PlanSchema.parse; unknown keys would be silently stripped here
    // if the schema lacked the fields.
    const plan = planWithTask({ estimatedComplexity: 'low', selectionCriteria: 'cost' });
    const readBack = PlanSchema.parse(JSON.parse(JSON.stringify(plan)));
    const task = readBack.phases[0]!.tasks[0]!;
    expect(task.estimatedComplexity).toBe('low');
    expect(task.selectionCriteria).toBe('cost');
  });

  it('rejects non-enum values', () => {
    expect(TaskSchema.safeParse({ ...planWithTask({}).phases[0].tasks[0], estimatedComplexity: 'huge', selectionCriteria: 'cheap' }).success).toBe(false);
  });
});
