type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function taskId(task: RecordValue): string | undefined {
  const id = task.id ?? task.taskId;
  return typeof id === 'string' ? id : undefined;
}

export function preserveCompletedMissionTaskResults(
  existingPlan: unknown,
  nextPlan: unknown,
  storedTasks: readonly unknown[] = [],
): unknown {
  const nextPlanRecord = asRecord(nextPlan);
  if (!nextPlanRecord || !Array.isArray(nextPlanRecord.phases)) return nextPlan;

  const completed = new Map<string, RecordValue>();
  const remember = (value: unknown) => {
    const task = asRecord(value);
    if (!task || task.status !== 'completed') return;
    const id = taskId(task);
    if (id) completed.set(id, task);
  };

  const addPlanTasks = (plan: unknown) => {
    const planRecord = asRecord(plan);
    if (!planRecord || !Array.isArray(planRecord.phases)) return;
    for (const phaseValue of planRecord.phases) {
      const phase = asRecord(phaseValue);
      if (phase && Array.isArray(phase.tasks)) phase.tasks.forEach(remember);
    }
  };

  addPlanTasks(existingPlan);
  storedTasks.forEach(remember);

  const phases = nextPlanRecord.phases.map((phaseValue) => {
    const phase = asRecord(phaseValue);
    if (!phase || !Array.isArray(phase.tasks)) return phaseValue;
    return {
      ...phase,
      tasks: phase.tasks.map((taskValue) => {
        const task = asRecord(taskValue);
        const id = task && taskId(task);
        const priorResult = id ? completed.get(id) : undefined;
        if (!task || !priorResult) return taskValue;
        const preserved = { ...task };
        for (const field of ['status', 'output', 'artifacts', 'startedAt', 'completedAt']) {
          if (priorResult[field] !== undefined) preserved[field] = priorResult[field];
        }
        return preserved;
      }),
    };
  });

  return { ...nextPlanRecord, phases };
}
