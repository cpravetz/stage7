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

/**
 * Artifact ids are sometimes file-kind labels ("html_file", "css_file") rather than file
 * names. Give the agent the concrete file each deliverable must become.
 */
const DELIVERABLE_FILE_ALIASES: Record<string, string> = {
  html_file: 'index.html',
  html: 'index.html',
  css_file: 'styles.css',
  css: 'styles.css',
  javascript_file: 'script.js',
  js_file: 'script.js',
  javascript: 'script.js',
};

function describeDeliverables(expectedArtifacts: string[]): string {
  return expectedArtifacts.map((name) => {
    const file = DELIVERABLE_FILE_ALIASES[name.trim().toLocaleLowerCase()];
    return file && file !== name ? `${name} (the complete ${file} file)` : name;
  }).join(', ');
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
    .slice(0, MAX_DEPENDENCY_SUMMARIES);
  return primary.map((summary) => ({
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
    ? `Produce each deliverable (${expectedArtifacts.join(', ')}) yourself. Put its complete content under a Markdown heading exactly "## <deliverable name>", not in JSON or a code fence. Write it down at once: do not first plan, research further, or describe what you will produce. The final response must be the deliverable content itself, not a tool action, plan, or progress report.`
    : 'Return only the verified result for this task. Unless the user requested a formatted document, use plain text without Markdown headings, lists, or code fences. For email and text-message tasks, report the exact requested message and verified delivery status; do not invent samples or placeholders.';
  return (
    (missionGoal ? `Original mission goal (authoritative scope): ${missionGoal}\n\nDo only work necessary for this goal. If the task or plan conflicts with it, follow the goal; do not substitute a different operation or medium.\n\n` : '') +
    `Task: ${visibleTaskText(task.title)}\n\n` +
    `Description: ${visibleTaskText(task.description)}\n\n` +
    (recoveryRequirements ? `${visibleTaskText(recoveryRequirements)}\n\n` : '') +
    `Task Instructions: ${visibleTaskText(taskInstructions(task, plan))}\n\n` +
    (completedDependencies.length > 0
    ? `Completed dependency results (authoritative persisted outputs and artifacts; do not infer results from task IDs): ${JSON.stringify(compactDependencySummaries(task, completedDependencies))}\n\n`
      : '') +
    ((task.dependsOnTaskIds || []).length > 0
      ? 'Use the recorded dependency results; never ask the user to retrieve or provide them. If a necessary dependency result is unavailable, recreate it from available context and evidence, or name its task ID as an internal blocker if it cannot be recovered.\n\n'
      : '') +
    `Phase: ${phase.name} (${phase.goal})\n` +
    `Plan Summary: ${plan.summary}\n` +
    `Expected deliverables: ${expectedArtifacts.length > 0 ? describeDeliverables(expectedArtifacts) : 'none'}\n` +

    `Required Actions: ${JSON.stringify(visibleRequiredActions(task))}\n` +
    (task.requiresExternalAction
      ? 'This task requires completing a real action outside the system. Check the live tool catalog, then invoke an actual registered tool that performs the requested operation and verify its result. A tool created earlier in this mission is a normal registered tool: search for it and reuse it rather than creating a duplicate. If no tool exists for the operation, use capability resolution to find or create one when permitted; the catalog search, capability-resolution and capability-creation actions are always available even though they are not listed as tools. Do not stop after listing tools, creating a tool, handing work off, drafting, or proposing an action. Never ask the user for API keys, tokens, or other secrets in a free-text question: execute the registered tool so Tool Executor can present its secure credential request, and let it resolve credentials that are already stored. If explicit authorization is missing, ask the user for that specific permission and wait. Never ask the user to choose, install, or configure tools.\n'
      : '') +
    `Output contract: ${artifactOutputContract} Use only actual system-tool results and completed dependency results; do not infer values or include results from future mission steps. Keep the final response in clear, concise language. Do not expose internal JSON, action receipts, validation errors, or implementation jargon unless the user specifically requested them.\n\n` +
    'Complete this task now and report the verified results. Do not return a plan, future-tense promises, placeholders, or substitute design/specification documents. If the work cannot be completed with the available tools or information, explain the specific blocker accurately.'

  );
}
