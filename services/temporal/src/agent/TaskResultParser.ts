import { MissionArtifact, MissionArtifactSchema, type Task } from '@stage7-nextgen/shared';
import type { TaskExecutionResult } from './TaskExecutionResult';

const ASK_USER_MARKER = '__ASK_USER__:';
const PERMISSION_MARKER = '__MISSION_PERMISSION__:';
const MAX_ACTION_RECEIPTS = 50;
const INTERNAL_ACTION_RECEIPT_ARTIFACT = 'system-action-receipts.json';

export function isExecutionOutcomeReport(content: string): boolean {
  return /^\s*(?:\*\*)?Blocker(?:\*\*)?\s*:/i.test(content)
    || /^\s*(?:Execution outcome|Artifact status)\b.{0,120}\b(?:blocked|failed|not created)\b/i.test(content);
}

export function parseExpectedArtifacts(value: unknown, taskId: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((name) => typeof name === 'string' && name.trim())) {
    throw new Error(`Agent task ${taskId} returned invalid expected deliverable names`);
  }
  return value.filter((name) => name.toLocaleLowerCase() !== INTERNAL_ACTION_RECEIPT_ARTIFACT);
}

export function parseArtifacts(
  value: unknown,
  output: string,
  expected: string[],
  taskId: string,
): MissionArtifact[] {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return extractArtifacts(output, expected);
  }
  if (!Array.isArray(value)) {
    throw new Error(`Agent task ${taskId} returned invalid artifacts`);
  }
  return value.map((candidate) => {
    if (
      !candidate
      || typeof candidate !== 'object'
      || Array.isArray(candidate)
    ) {
      throw new Error(`Agent task ${taskId} returned an invalid artifact`);
    }
    const parsed = MissionArtifactSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(`Agent task ${taskId} returned an invalid artifact`);
    }
    return parsed.data;
  });
}

export function assertExpectedArtifacts(
  artifacts: MissionArtifact[],
  expected: string[],
  taskId: string,
): void {
  const missing = missingExpectedArtifacts(artifacts, expected);
  if (missing.length === 0) return;

  const blocker = artifacts.find((artifact) =>
    typeof artifact.content === 'string'
    && isExecutionOutcomeReport(artifact.content),
  );
  const reason = typeof blocker?.content === 'string'
    ? ` The task reported: ${blocker.content.trim().slice(0, 500)}`
    : '';
  throw new Error(
    `Task "${taskId}" did not produce the expected deliverable${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.${reason}`,
  );
}

/**
 * The subset of `expected` deliverable names that `artifacts` does NOT satisfy.
 * A name is satisfied only by an artifact that carries real, retrievable content:
 * present, not an internal execution-outcome report, not blocked, and either has
 * non-empty textual content, a URL, or data. This is the single authoritative
 * definition of "did the task produce its declared deliverable", shared by the
 * completion assertion and by dependency/readiness checks.
 */
export function missingExpectedArtifacts(artifacts: MissionArtifact[], expected: string[]): string[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  return expected.filter((name) => {
    const artifact = artifacts.find((candidate) => normalize(candidate.name) === normalize(name));
    if (!artifact || artifact.purpose === 'execution-outcome' || artifact.status === 'blocked') return true;
    if (typeof artifact.content === 'string') {
      return !artifact.content.trim() || isExecutionOutcomeReport(artifact.content);
    }
    return artifact.url === undefined && artifact.data === undefined;
  });
}

/**
 * Determine whether an artifact carries substantive content. An artifact
 * passes when it has non-empty text that is not merely a heading, comment, or
 * placeholder. This is stricter than `missingExpectedArtifacts`, which only
 * checks for non-empty content; it is used to catch deliverables that are
 * structurally present but substantively empty.
 */
export function validateArtifactContent(artifact: MissionArtifact): boolean {
  if (artifact.url !== undefined && artifact.url.trim().length > 0) return true;
  if (artifact.data !== undefined) return true;
  if (typeof artifact.content !== 'string') return false;
  const content = artifact.content.trim();
  if (content.length === 0) return false;
  // Reject content that is only headings, comments, or placeholder markers.
  const stripped = content
    .replace(/^#{1,6}\s.*$/gm, '') // headings
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments
    .replace(/\/\/.*$/gm, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*>\s.*$/gm, '') // blockquotes
    .replace(/```[\s\S]*?```/g, '') // code fences (keep? code may be substantive)
    .trim();
  if (stripped.length === 0) return false;
  // Reject placeholder-like content.
  if (/^(?:todo|tbd|placeholder|lorem ipsum|coming soon|under construction)$/i.test(stripped)) return false;
  return true;
}

/**
 * Names from `expected` that are present as artifacts but whose content fails
 * `validateArtifactContent`. Used to trigger Brain remediation.
 */
export function invalidExpectedArtifacts(artifacts: MissionArtifact[], expected: string[]): string[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  return expected.filter((name) => {
    const artifact = artifacts.find((candidate) => normalize(candidate.name) === normalize(name));
    if (!artifact) return false;
    return !validateArtifactContent(artifact);
  });
}
export function dependencyArtifactGaps(dependency: Task): string[] {
  return missingExpectedArtifacts(dependency.artifacts || [], dependency.expectedArtifacts || []);
}

/**
 * For a pending task, the completed dependencies that are missing a declared
 * artifact. A non-empty result means the task has a *missing input* and must not
 * start until the deficient dependency produces the artifact.
 */
export function missingDependencyInputs(
  task: Task,
  taskById: Map<string, Task>,
): Array<{ dependencyTaskId: string; missingArtifacts: string[] }> {
  const gaps: Array<{ dependencyTaskId: string; missingArtifacts: string[] }> = [];
  for (const dependencyId of task.dependsOnTaskIds || []) {
    const dependency = taskById.get(dependencyId);
    if (!dependency || dependency.status !== 'completed') continue;
    const missing = dependencyArtifactGaps(dependency);
    if (missing.length > 0) gaps.push({ dependencyTaskId: dependencyId, missingArtifacts: missing });
  }
  return gaps;
}

export function parseActionReceipts(
  value: unknown,
  taskId: string,
): NonNullable<TaskExecutionResult['actionReceipts']> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ACTION_RECEIPTS) {
    throw new Error(`Agent task ${taskId} returned invalid step records`);
  }
  return value.map((candidate) => {
    if (
      !candidate
      || typeof candidate !== 'object'
      || Array.isArray(candidate)
      || typeof candidate.toolId !== 'string'
      || !candidate.toolId.trim()
      || typeof candidate.isError !== 'boolean'
      || typeof candidate.content !== 'string'
      || (candidate.actionKey !== undefined && (typeof candidate.actionKey !== 'string' || !/^[a-f0-9]{64}$/i.test(candidate.actionKey)))
      || (candidate.fallbackForToolId !== undefined && (typeof candidate.fallbackForToolId !== 'string' || !candidate.fallbackForToolId.trim()))
      || (candidate.resolvedToolId !== undefined && (typeof candidate.resolvedToolId !== 'string' || !candidate.resolvedToolId.trim()))
      || (candidate.outcome !== undefined && !['success', 'failure', 'denied', 'question_asked', 'permission_required'].includes(String(candidate.outcome)))
    ) {
      throw new Error(`Agent task ${taskId} returned an invalid step record`);
    }
    return {
      toolId: candidate.toolId,
      isError: candidate.isError,
      content: candidate.content.slice(0, 2_048),
      outcome: (candidate.outcome as NonNullable<TaskExecutionResult['actionReceipts']>[number]['outcome'] | undefined)
        || (candidate.isError ? 'failure' : 'success'),
      ...(typeof candidate.actionKey === 'string' ? { actionKey: candidate.actionKey } : {}),
      ...(typeof candidate.fallbackForToolId === 'string' ? { fallbackForToolId: candidate.fallbackForToolId } : {}),
      ...(typeof candidate.resolvedToolId === 'string' ? { resolvedToolId: candidate.resolvedToolId } : {}),
    };
  });
}

export function withActionReceiptArtifact(
  artifacts: MissionArtifact[],
  actionReceipts: NonNullable<TaskExecutionResult['actionReceipts']>,
  taskId: string,
): MissionArtifact[] {
  if (actionReceipts.length === 0) return artifacts;
  const name = 'system-action-receipts.json';
  if (artifacts.some((artifact) => artifact.name.toLocaleLowerCase() === name)) {
    throw new Error(`Agent task ${taskId} returned a reserved step-record artifact name`);
  }
  return [
    ...artifacts,
    { name, type: 'evidence', content: JSON.stringify(actionReceipts), purpose: 'execution-outcome', visibility: 'internal' },
  ];
}

function generateArtifactId(): string {
  return `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeArtifactName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function inferArtifactType(content: string): string {
  if (/^\s*\{[\s\S]*\}/m.test(content) && /```json/.test(content)) return 'config';
  if (/^#\s+/m.test(content)) return 'document';
  if (/^\s*[-*]\s+/m.test(content)) return 'list';
  if (/\|.*\|/.test(content)) return 'table';
  return 'document';
}

export function extractArtifacts(content: string, expected: string[]): MissionArtifact[] {
  if (expected.length === 0) return [];
  const artifacts: MissionArtifact[] = [];
  const headings = [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)]
    .filter((heading) => expected.some((name) => normalizeArtifactName(name) === normalizeArtifactName(heading[1] || '')));
  for (const [index, heading] of headings.entries()) {
    const name = heading[1]?.trim();
    if (!name) continue;
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? content.length;
    const section = content.slice(start, end).trim();
    if (!section) continue;
    const matched = expected.find((artifactName) => normalizeArtifactName(artifactName) === normalizeArtifactName(name));
    if (expected.length > 0 && !matched) continue;
    artifacts.push({
      id: generateArtifactId(),
      name: matched || `${name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.md`,
      type: inferArtifactType(section),
      content: section,
      purpose: 'deliverable',
      isDeliverable: true,
    });
  }
  return artifacts;
}
