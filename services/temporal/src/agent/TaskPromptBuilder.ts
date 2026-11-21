import { Phase, Plan, Task } from '@stage7-nextgen/shared';
import type { CompletedTaskSummary } from '../types/workflow';

const MAX_DEPENDENCY_SUMMARIES = 12;
const INTERNAL_ACTION_REQUIREMENT = '__external_action__';

function visibleRequiredActions(task: Task): NonNullable<Task['requiredActions']> {
  return (task.requiredActions || []).filter((action) => action.toolId !== INTERNAL_ACTION_REQUIREMENT);
}

function visibleTaskText(value: string): string {
  return value.replaceAll(INTERNAL_ACTION_REQUIREMENT, 'an actual registered tool');
}

export function recoveryDeliverableInstructions(tasks: Task[], expectedArtifacts: string[]): string {
  const names = new Set(expectedArtifacts.map((name) => name.trim().toLocaleLowerCase()));
  const sources = tasks.filter((task) =>
    !/-amendment-\d+|-mission-recovery-\d+/i.test(task.id)
    && (task.expectedArtifacts || []).some((name) => names.has(name.trim().toLocaleLowerCase())),
  );
  return sources.length
    ? `Original deliverable requirements:\n${sources.map((task) =>
      `Task ${task.id}: ${task.description}\n${task.systemPrompt}`,
    ).join('\n\n')}`
    : '';
}

function taskInstructions(task: Task, plan: Plan): string {
  const taskIds = new Set(plan.phases.flatMap((phase) => phase.tasks.map((candidate) => candidate.id)));
  return task.systemPrompt.replace(
    /\b(?:consume|use)\s+(?:the\s+)?output\s+from\s+task\s+([a-z0-9_-]+)\s*\([^)]*(?:service|tool|plugin|connector|integration)[^)]*\)[^.!?\n]*[.!?]?/gi,
    (sentence, taskId: string) => taskIds.has(taskId) ? sentence : '',
  ).trim();
}

function compactDependencySummaries(
  task: Task,
  summaries: CompletedTaskSummary[],
): Array<Record<string, unknown>> {
  const referencedTaskIds = new Set(
    summaries
      .filter((summary) => !/-mission-recovery-\d+/i.test(summary.taskId))
      .filter((summary) =>
        task.dependsOnTaskIds?.includes(summary.taskId)
        || task.systemPrompt.includes(summary.taskId),
      )
      .map((summary) => summary.taskId),
  );
  const primary = summaries
    .filter((summary) => referencedTaskIds.has(summary.taskId))
    .slice(0, MAX_DEPENDENCY_SUMMARIES / 2);
  const recent = summaries
    .filter((summary) => !primary.some((candidate) => candidate.taskId === summary.taskId))
    .slice(-MAX_DEPENDENCY_SUMMARIES / 2);
  const selected = [...primary, ...recent];
  return selected.map((summary) => ({
    taskId: summary.taskId,
    output: summary.output.slice(0, 500),
    artifactNames: summary.artifactNames.slice(0, 10),
    artifacts: (summary.artifacts || []).slice(0, 3).map((artifact) => ({
      name: artifact.name,
      type: artifact.type,
      content: typeof artifact.content === 'string'
        ? artifact.content.slice(0, artifact.name.toLocaleLowerCase() === 'system-action-receipts.json' ? 2_000 : 500)
        : undefined,
    })),
    requiredActions: (summary.requiredActions || [])
      .filter((action) => action.toolId !== INTERNAL_ACTION_REQUIREMENT),
    requiresExternalAction: summary.requiresExternalAction
      || (summary.requiredActions || []).some((action) => action.toolId === INTERNAL_ACTION_REQUIREMENT),
  }));
}

export function buildTaskPrompt(
  task: Task,
  phase: Phase,
  plan: Plan,
  completedDependencies: CompletedTaskSummary[],
  missionGoal?: string,
): string {
  const expectedArtifacts = task.expectedArtifacts || [];
  const recoveryRequirements = /-amendment-\d+|-mission-recovery-\d+/i.test(task.id)
    ? recoveryDeliverableInstructions(plan.phases.flatMap((candidate) => candidate.tasks), expectedArtifacts)
    : '';
  const artifactOutputContract = expectedArtifacts.length > 0
    ? `Produce each expected deliverable (${expectedArtifacts.join(', ')}) yourself, using available evidence and tools. Put the complete content under a Markdown heading exactly "## <deliverable name>" on its own line, not in JSON or a code fence. Do not ask the user to create or supply a deliverable assigned to an agent. When asked for a recommendation or choice, compare candidates against the mission goals, constraints, and user context, then choose the strongest fit; if preferences are unstated, select a defensible default and state your assumptions. When a tool is named as failing or possibly unsuitable, inspect its live catalog entry, schemas, and recorded action results/errors; diagnose the evidence and try a suitable alternative or capability resolution when permitted. Never ask the user to diagnose a tool or decide whether to switch. Ask only when an essential fact cannot reasonably be inferred or explicit authorization is required. If a genuine blocker remains, explain it specifically; do not fabricate results or claim actions that were not completed.`
    : 'Return only the verified result for this task. Unless the user requested a formatted document, use plain text without Markdown headings, lists, or code fences. For email and text-message tasks, report the exact requested message and verified delivery status; do not invent samples or placeholders.';
  return (
    `Task: ${visibleTaskText(task.title)}\n\n` +
    `Description: ${visibleTaskText(task.description)}\n\n` +
    (recoveryRequirements ? `${visibleTaskText(recoveryRequirements)}\n\n` : '') +
    `Task Instructions: ${visibleTaskText(taskInstructions(task, plan))}\n\n` +
    (missionGoal ? `Original mission goal: ${missionGoal}\n\n` : '') +
    (completedDependencies.length > 0
    ? `Completed dependency results (authoritative persisted outputs and artifacts; do not infer results from task IDs): ${JSON.stringify(compactDependencySummaries(task, completedDependencies))}\n\n`
      : '') +
    ((task.dependsOnTaskIds || []).length > 0
      ? 'Use the recorded dependency results; never ask the user to retrieve or provide them. If a necessary dependency result is unavailable, recreate it from available context and evidence, or name its task ID as an internal blocker if it cannot be recovered.\n\n'
      : '') +
    `Phase: ${phase.name} (${phase.goal})\n` +
    `Plan Summary: ${plan.summary}\n` +
  `Expected deliverables: ${expectedArtifacts.join(', ')}\n` +

    `Required Actions: ${JSON.stringify(visibleRequiredActions(task))}\n` +
    (task.requiresExternalAction
      ? 'This task requires completing a real action outside the system. Check the live tool catalog, then invoke an actual registered tool that performs the requested operation and verify its result. If no suitable tool exists, use capability resolution to find or create one when permitted. Do not stop after listing tools, creating a tool, handing work off, drafting, or proposing an action. If a required secret is missing, execute the registered tool so Tool Executor can present its secure credential request. If explicit authorization is missing, ask the user for that specific permission and wait. Never ask the user to choose, install, or configure tools.\n'
      : '') +
    `Output contract: ${artifactOutputContract} Use only actual system-tool results and completed dependency results; do not infer values or include results from future mission steps. Keep the final response in clear, concise language. Do not expose internal JSON, action receipts, validation errors, or implementation jargon unless the user specifically requested them.\n\n` +
    'Use your judgment on choices the mission delegates to you. Do not ask the user which category, approach, or option they prefer; compare candidates against the mission objective, choose the strongest fit, and explain why. If preferences are unstated, select a defensible default and state your assumptions. When a tool is named as failing or possibly unsuitable, inspect its catalog entry, schemas, and action results/errors, then diagnose the evidence and try a suitable alternative or capability resolution when permitted. Never ask the user to diagnose a tool or decide whether to switch. Ask only for essential facts that cannot be inferred safely or for explicit authorization required to proceed.\n\n' +
    'Complete this task now and report the verified results. Do not return a plan, future-tense promises, placeholders, or substitute design/specification documents. If the work cannot be completed with the available tools or information, explain the specific blocker accurately.'

  );
}
