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
  missionGoal?: string,
): string {
  const expectedArtifacts = task.expectedArtifacts || [];
  const artifactOutputContract = expectedArtifacts.length > 0
    ? `Report verified results for each expected deliverable (${expectedArtifacts.join(', ')}). Include each deliverable's actual result under a clear heading using its exact name. If the work cannot be completed with available tools or context, explain the specific blocker instead — do not fabricate results or claim actions that were not completed.`
    : 'Return only the verified result for this task. Unless the user requested a formatted document, use plain text without Markdown headings, lists, or code fences. For email and text-message tasks, report the exact requested message and verified delivery status; do not invent samples or placeholders.';
  return (
    `Task: ${visibleTaskText(task.title)}\n\n` +
    `Description: ${visibleTaskText(task.description)}\n\n` +
    `Task Instructions: ${visibleTaskText(task.systemPrompt)}\n\n` +
    (missionGoal ? `Original mission goal: ${missionGoal}\n\n` : '') +
    (completedDependencies.length > 0
    ? `Completed dependency results (authoritative persisted outputs and artifacts; do not infer results from task IDs): ${JSON.stringify(compactDependencySummaries(task, completedDependencies))}\n\n`
      : '') +
    `Phase: ${phase.name} (${phase.goal})\n` +
    `Plan Summary: ${plan.summary}\n` +
  `Expected deliverables: ${expectedArtifacts.join(', ')}\n` +

    `Required Actions: ${JSON.stringify(visibleRequiredActions(task))}\n` +
    (task.requiresExternalAction
      ? 'This task requires completing a real action outside the system. Check the live tool catalog, then invoke an actual registered tool that performs the requested operation and verify its result. If no suitable tool exists, use capability resolution to find or create one when permitted. Do not stop after listing tools, creating a tool, handing work off, drafting, or proposing an action. If required credentials or configuration are missing, ask the user to provide them through the secure tool configuration form and wait.\n'
      : '') +
    'Mission task outputs, artifacts, receipts, and logs are internal execution data: never ask the user to retrieve or provide them. Use the completed dependency results supplied here. If a required result from another task is missing, name its task ID as an internal blocker in your task result so the mission orchestrator can retrieve or rerun that task; continue any safe independent work. Ask the user only for information, credentials, or authorization that only the user can provide. Never fabricate missing input or treat a recoverable missing input as mission failure.\n' +
    'If you must ask the user to choose a tool, service, or configuration, include the concrete options/values in the question; never ask the user to select from a list that is not shown.\n' +
    `Output contract: ${artifactOutputContract} Use only actual system-tool results and completed dependency results; do not infer values or include results from future mission steps. Keep the final response in clear, concise language. Do not expose internal JSON, action receipts, validation errors, or implementation jargon unless the user specifically requested them.\n\n` +
    'Complete this task now and report the results for its expected deliverables. Do not return a plan, future-tense promises, or placeholders. If the work cannot be completed with the available tools or information, explain the specific blocker.'

  );
}
