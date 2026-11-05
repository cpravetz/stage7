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
): string {
  const expectedArtifacts = task.expectedArtifacts || [];
  const artifactOutputContract = expectedArtifacts.length > 0
    ? `Report verified results for each expected deliverable (${expectedArtifacts.join(', ')}). Include each deliverable's actual result under a clear heading using its exact name. If the work cannot be completed with available tools or context, explain the specific blocker instead — do not fabricate results or claim actions that were not completed.`
    : 'Return only the verified result for this task. Unless the user requested a formatted document, use plain text without Markdown headings, lists, or code fences. For email and text-message tasks, report the exact requested message and verified delivery status; do not invent samples or placeholders.';
  return (
    `Task: ${visibleTaskText(task.title)}\n\n` +
    `Description: ${visibleTaskText(task.description)}\n\n` +
    `Task Instructions: ${visibleTaskText(task.systemPrompt)}\n\n` +
    (completedDependencies.length > 0
    ? `Completed dependency results (authoritative persisted outputs and artifacts; do not infer results from task IDs): ${JSON.stringify(compactDependencySummaries(task, completedDependencies))}\n\n`
      : '') +
    `Phase: ${phase.name} (${phase.goal})\n` +
    `Plan Summary: ${plan.summary}\n` +
  `Expected deliverables: ${expectedArtifacts.join(', ')}\n` +

    `Required Actions: ${JSON.stringify(visibleRequiredActions(task))}\n` +
    (task.requiresExternalAction
      ? 'This task requires completing a real action outside the system. Use a registered tool that actually performs that action. Looking up tools, creating tools, handing work off, drafting, or proposing an action does not count as completion.\n'
      : '') +

    `Output contract: ${artifactOutputContract} Use only actual system-tool results and completed dependency results; do not infer values or include results from future mission steps.\n\n` +
    'Complete this task now and report the results for its expected deliverables. Do not return a plan, future promises, or placeholders. If the work cannot be completed with the available tools or information, explain the specific blocker.'

  );
}
