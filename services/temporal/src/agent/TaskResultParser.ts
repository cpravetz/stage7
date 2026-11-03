import { MissionArtifact, MissionArtifactSchema } from '@stage7-nextgen/shared';
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
    throw new Error(`Agent task ${taskId} returned invalid expected artifact names`);
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
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const missing = expected.filter((name) => {
    const artifact = artifacts.find((candidate) => normalize(candidate.name) === normalize(name));
    if (!artifact || artifact.purpose === 'execution-outcome' || artifact.status === 'blocked') return true;
    if (typeof artifact.content === 'string') {
      return !artifact.content.trim() || isExecutionOutcomeReport(artifact.content);
    }
    return artifact.url === undefined && artifact.data === undefined;
  });
  if (missing.length === 0) return;

  const blocker = artifacts.find((artifact) =>
    typeof artifact.content === 'string'
    && isExecutionOutcomeReport(artifact.content),
  );
  const reason = typeof blocker?.content === 'string'
    ? ` The task reported: ${blocker.content.trim().slice(0, 500)}`
    : '';
  throw new Error(
    `Task "${taskId}" did not produce expected artifact${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.${reason}`,
  );
}

export function parseActionReceipts(
  value: unknown,
  taskId: string,
): NonNullable<TaskExecutionResult['actionReceipts']> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ACTION_RECEIPTS) {
    throw new Error(`Agent task ${taskId} returned invalid action receipts`);
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
      throw new Error(`Agent task ${taskId} returned an invalid action receipt`);
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
    throw new Error(`Agent task ${taskId} returned a reserved action receipt artifact name`);
  }
  return [
    ...artifacts,
    { name, type: 'evidence', content: JSON.stringify(actionReceipts), purpose: 'execution-outcome', visibility: 'internal' },
  ];
}

export function extractArtifacts(content: string, expected: string[]): MissionArtifact[] {
  if (expected.length === 0) return [];
  const artifacts: MissionArtifact[] = [];
  const headings = [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)];
  const normalize = (name: string) => name.trim().toLocaleLowerCase();
  for (const [index, heading] of headings.entries()) {
    const name = heading[1]?.trim();
    if (!name) continue;
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? content.length;
    const section = content.slice(start, end).trim();
    if (!section) continue;
    const matched = expected.find((artifactName) => normalize(artifactName) === normalize(name));
    if (expected.length > 0 && !matched) continue;
    artifacts.push({
      name: matched || `${name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.md`,
      type: inferType(section),
      content: section,
      purpose: 'deliverable',
      isDeliverable: true,
    });
  }
  return artifacts;
}

export function inferType(content: string): string {
  if (/^\s*\{[\s\S]*\}/m.test(content) && /```json/.test(content)) return 'config';
  if (/^#\s+/m.test(content)) return 'document';
  if (/^\s*[-*]\s+/m.test(content)) return 'list';
  if (/\|.*\|/.test(content)) return 'table';
  return 'document';
}
