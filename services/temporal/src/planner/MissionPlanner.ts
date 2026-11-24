import {
  AgentExecutionPolicy,
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  DEFAULT_AGENT_EXECUTION_POLICY,
  Plan,
  PlanSchema,
  Task,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { randomUUID } from 'crypto';
import { parsePlanJson } from './planJson';
import { canonicalMissionAgentRole } from '../agent/AgentRuntimeConfig';

const MAX_TRANSIENT_BRAIN_RETRIES = 3;
/** Consecutive empty completions tolerated before the planner gives up. */
const MAX_CONSECUTIVE_EMPTY_PLANNER_COMPLETIONS = 3;
/** Amendment task ids minted by phase recovery; the planner must never mint them. */
const RESERVED_AMENDMENT_PREFIX = '-amendment-';

export type PlannerLocus =
  | { kind: 'task'; taskId: string }
  | { kind: 'phase'; phaseId: string }
  | { kind: 'plan' };

/** A single, structured plan-validation issue tied to the part of the plan that must change. */
export interface PlannerIssue {
  locus: PlannerLocus;
  path: PropertyKey[];
  message: string;
}

interface PlannerFieldRepair {
  path: PropertyKey[];
  expectedType: string;
  receivedType: string;
  currentValue: unknown;
}

/** The deterministic result of classifying a set of schema issues: mechanical coercions that
 *  need no Brain round trip, plus the narrowest single-field repair to ask the Brain for when a
 *  value cannot be coerced locally. */
interface FieldIssueClassification {
  coercions: Array<{ path: PropertyKey[]; replacement: unknown }>;
  fieldRepair?: PlannerFieldRepair;
}

function getValueAtPath(value: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<PropertyKey, unknown>)[key];
  }, value);
}

function setValueAtPath(value: unknown, path: PropertyKey[], replacement: unknown): void {
  if (path.length === 0) throw new Error('Cannot replace the planner response root as a field value');
  let current = value;
  for (const key of path.slice(0, -1)) {
    if (current === null || typeof current !== 'object') {
      throw new Error(`Cannot locate planner field at ${path.map(String).join('.')}`);
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  if (current === null || typeof current !== 'object') {
    throw new Error(`Cannot locate planner field at ${path.map(String).join('.')}`);
  }
  (current as Record<PropertyKey, unknown>)[path[path.length - 1] as PropertyKey] = replacement;
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Zod v4 reports a wrong type as an issue with `code === 'invalid_type'` and an `expected`
 * field (`received` was dropped in v4; the actual value is read from the plan). Returns the
 * expected type string when the issue is a repairable type mismatch, else undefined.
 */
function invalidTypeExpected(issue: { code?: string; expected?: unknown }): string | undefined {
  return issue.code === 'invalid_type' && typeof issue.expected === 'string' ? issue.expected : undefined;
}

const COERCION_FAILED = Symbol('coercion-failed');

/** Mechanical coercion of a single value to the type the schema expected, or COERCION_FAILED. */
function coerceValue(expectedType: string, currentValue: unknown): unknown | typeof COERCION_FAILED {
  const expected = expectedType.toLowerCase();
  if (expected === 'string' && currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
    const obj = currentValue as Record<string, unknown>;
    for (const key of ['name', 'title', 'id', 'value', 'text', 'content', 'summary']) {
      if (typeof obj[key] === 'string' && (obj[key] as string).trim().length > 0) return obj[key];
    }
    return COERCION_FAILED;
  }
  if (expected.startsWith('array') && currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
    return [currentValue];
  }
  if (expected === 'string' && (typeof currentValue === 'number' || typeof currentValue === 'boolean')) {
    return String(currentValue);
  }
  if (expected === 'string' && (currentValue === null || currentValue === undefined)) {
    return '';
  }
  return COERCION_FAILED;
}

/**
 * Single classifier for planner schema issues (replaces the old findPlannerFieldRepair /
 * tryLocalFieldFix pair). It returns every mechanical coercion that can be applied without the
 * Brain, plus the narrowest single-field repair to ask for when a value cannot be coerced.
 *
 * Coercions cover: object -> string (via a common string property), single object -> array,
 * number/boolean -> string, null/undefined -> ''. Nested graded values (a numeric path element
 * such as a deliverable name) are never guessed from an object, except the expectedArtifacts
 * object -> filename extraction, which is safe and avoids a wasteful round trip.
 */
function classifyFieldIssues(
  issues: Array<{ code?: string; expected?: unknown; path: PropertyKey[] }>,
  plan: unknown,
): FieldIssueClassification {
  const coercions: Array<{ path: PropertyKey[]; replacement: unknown }> = [];
  let fieldRepair: PlannerFieldRepair | undefined;
  for (const issue of issues) {
    const expectedType = invalidTypeExpected(issue);
    if (!expectedType || issue.path.length < 2) continue;
    const currentValue = getValueAtPath(plan, issue.path);
    const receivedType = valueType(currentValue);
    const isArtifactElement =
      issue.path.length >= 3 &&
      issue.path[issue.path.length - 2] === 'expectedArtifacts' &&
      typeof issue.path[issue.path.length - 1] === 'number';
    const hasNumericSegment = issue.path.some((part) => typeof part === 'number');

    const replacement = coerceValue(expectedType, currentValue);
    if (replacement !== COERCION_FAILED) {
      // Nested element values are graded deliverables and must not be guessed, except the
      // expectedArtifacts object -> filename extraction which reads an explicit name field.
      if (!hasNumericSegment || isArtifactElement) {
        coercions.push({ path: issue.path, replacement });
        continue;
      }
    }
    // Not coercible here: remember the first one as the narrow Brain field-repair target.
    fieldRepair ??= { path: issue.path, expectedType, receivedType, currentValue };
  }
  return { coercions, fieldRepair };
}

function plannerFieldRepairPrompt(repair: PlannerFieldRepair): string {
  const path = repair.path.map((part, index) =>
    typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
  ).join('');
  const serializedValue = JSON.stringify(repair.currentValue);
  const currentValue = serializedValue === undefined ? 'undefined' : serializedValue.slice(0, 2_000);
  const isArtifactElement = repair.path.length >= 3 && repair.path[repair.path.length - 2] === 'expectedArtifacts' && typeof repair.path[repair.path.length - 1] === 'number';
  const hint = isArtifactElement
    ? ' The value must be a plain filename string (for example "plan_summary.md"), not an object. If the given object has a name/filename/path field, return just that string.'
    : '';
  return `Give me a ${repair.expectedType} for ${path}, but you gave me a ${repair.receivedType}: ${currentValue}.${hint} Return only the replacement value as valid JSON.`;
}

/**
 * Failures that say nothing about the plan and can be retried against another
 * eligible model: a provider that timed out, a completion deadline that
 * expired with models still available, or a transient upstream error.
 */
const TRANSIENT_BRAIN_FAILURE_PATTERNS: RegExp[] = [
  /Brain request failed \(5\d\d\)/i,
  /Brain returned a completion without content/i,
  /Brain request timed out/i,
  /Provider request timed out/i,
  /BRAIN_COMPLETION_DEADLINE/,
  /Brain completion deadline/i,
  /\bfetch failed\b/i,
  /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED/i,
];

function isTransientBrainFailure(message: string): boolean {
  return TRANSIENT_BRAIN_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export const PLANNER_SYSTEM_PROMPT = `You are a mission planner for an AI agent platform. Given a user's goal, produce a complete structured plan tailored to that goal.

Requirements:
1. The planner must not pause for clarification: set requiresClarification=false and clarificationQuestions=[]. Do not invent missing values. Execution Agents may ask one focused question for an exact required value only after authorized alternatives are exhausted.
2. The planner must never ask the user questions or use the __ASK_USER__ marker. The planner's only output is a complete JSON plan. If information is missing, make reasonable assumptions and proceed.
3. For a goal that does not need clarification, create as many phases and specific tasks as needed to fully accomplish it. Keep every phase meaningful and include at least one task in each phase. When a goal requires both producing an output and taking a separate action with it, separate those tasks and make the action depend on the output task. Keep descriptions and systemPrompts concise and operational; do not omit required actions, task IDs, dependencies, or consumed outputs to save space.
4. Each phase must include id, name, goal, tasks, requiresApproval, and status. Use "pending" for the initial status.
5. Each task must include id, title, description, agentRole, systemPrompt, dependsOnTaskIds, expectedArtifacts, requiredActions, status, and artifacts. Use "pending" for the initial status and [] when there are no artifacts or required actions yet. dependsOnTaskIds lists task IDs that must complete first; use [] only when the task is genuinely independent.
6. Give every phase a unique, stable id. Task ids must be globally unique across the entire plan, not merely unique within each phase. Use ids such as "phase-2-task-1"; never reuse "task-1" in another phase. Dependencies may refer only to tasks in the same or an earlier phase, and must not form a cycle. Select agent roles based on the actual work.
7. Every task must be executable by an autonomous software Agent. Never assign agentRole "Human", "User", or another human decision-maker. Represent a needed human decision with requiresApproval or requiresClarification instead.
8. Mark requiresApproval=true only where a human decision is needed before work continues.
9. Describe only WHAT outcome must be achieved, its constraints, dependencies, deliverables, and evidence of completion. Never choose, name, create, configure, or prescribe tools, integrations, providers, APIs, code, or execution methods. Do not create tool/service setup tasks unless the user explicitly requests a reusable tool/service as a deliverable. The Agent and runtime decide HOW to achieve each task, including capability discovery, repair, replacement, or an alternate approach. Always leave requiredActions=[]; action evidence is decided by the runtime, not the plan.
10. Treat expectedArtifacts as user-requested deliverable files only. Do not invent planning documents, design documents, specifications, source-code files, executables, IDs, statuses, receipts, or other artifacts merely to describe work, plan an approach, or prove an action. If the mission goal does not explicitly ask for a document or file, do not create any expectedArtifacts. For action-only or communication tasks (for example sending a message, email, or SMS), use expectedArtifacts=[] and report the exact verified result in task output. Do not claim an action succeeded without evidence. system-action-receipts.json is internal runtime evidence and must never be listed as an expected artifact. Keep expectedArtifacts minimal and phase-appropriate: include only deliverables this task must produce now from its available inputs/dependencies, not a downstream bundle for later phases.
11. When a task produces document artifacts, its systemPrompt must instruct the Agent to begin each artifact with a one-paragraph summary (under 100 words) before the full content, so downstream reviewers can judge the artifact from the summary alone.
12. If a task consumes another task's result or artifact, list that producer's exact task ID in dependsOnTaskIds and in the task's systemPrompt, and say which output is consumed. Do not refer vaguely to "initial", "final", or "previous" values without naming their producing task IDs. Dependencies belong on the consuming task, not on a producer that merely names a future consumer. Do not infer a dependency from a task ID mentioned in a negative instruction or in a statement that the task's output will be consumed downstream. Include only tasks that produce an input the task actually uses. Dependencies impose execution order and make completed producer outputs available to the Agent.
13. Plan only work that is necessary to accomplish the stated mission goal. Do not expand scope with unrelated domains, research, analysis, or capabilities not requested by the user. If a task or action fails, recovery must focus on completing the requested outcome or reporting a concrete blocker; never reframe a failure as a need to produce a design or planning document unless the user explicitly requested that document.

Return one complete JSON object matching this structure:
{"summary":"...","estimatedDuration":"...","estimatedCost":"...","requiresClarification":false,"clarificationQuestions":[],"phases":[{"id":"phase-1","name":"...","goal":"...","requiresApproval":false,"status":"pending","tasks":[{"id":"phase-1-task-1","title":"...","description":"...","agentRole":"...","systemPrompt":"...","dependsOnTaskIds":[],"expectedArtifacts":[],"requiredActions":[],"status":"pending","artifacts":[]}]}]}
Do not include prose, markdown fences, or any text outside the JSON object.`;
const PLANNER_REMEDIATION_SYSTEM_PROMPT = 'You are correcting one part of an existing mission plan. Apply only the listed corrections, preserve everything else, return only the corrected JSON value described, no prose or Markdown fences. Do not ask questions or use the __ASK_USER__ marker.';
export const PLANNER_EXECUTION_POLICY: AgentExecutionPolicy = {
    ...DEFAULT_AGENT_EXECUTION_POLICY,
    maxBrainCalls: 1,
  maxActions: 0,
  maxCompletionTokens: 8192,
  maxCompletionTokensPerCall: 8192,
  maxDelegations: 0,
};
function sanitizePlan(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePlan);
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'outout' && 'outcome' in obj === false) {
      out['outcome'] = v;
      continue;
    }
    out[k] = sanitizePlan(v);
  }
  return out;
}
function applyPlannerDefaults(plan: any): any {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) return plan;
  for (const phase of plan.phases) {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) continue;
    if (phase.requiresApproval === undefined) phase.requiresApproval = false;
    if (!Array.isArray(phase.tasks)) continue;
    for (const task of phase.tasks) {
      if (task && typeof task === 'object' && !Array.isArray(task)) {
        if (task.status === undefined) task.status = 'pending';
        task.requiredActions = [];
        if (typeof task.agentRole === 'string' && task.agentRole.trim()) {
          task.agentRole = canonicalMissionAgentRole(task.agentRole);
        }
      }
    }
  }
  return plan;
}

//const NEGATED_ACTION = /\b(?:do not|don't|never|avoid)\s+(?:use|using|call|calling|invoke|invoking|execute|executing|run|running|attempt|attempting|request|requesting|retry|retrying)\b/i;
const ACTION_TOOL_TARGET = /(?<![a-z0-9_-])(?:use|using|call|calling|invoke|invoking|execute|executing|run|running|attempt|attempting|request|requesting|retry|retrying)\s+(?:(?:the|registered|available|exact|specific|permitted|disallowed|unavailable|new|existing|only|special)\s+)*(?:tool\s+)?(?:[`"']([a-z_][a-z0-9_-]{0,119})[`"']|([a-z_][a-z0-9_-]{0,119}))(?=\s+(?:tool|action|with|on|for|to|once|twice|exactly)\b|[.,;:!?]|$)/gi;
const NAMED_TOOL_ACTION = /\b([a-z_][a-z0-9_-]{0,119})\s+tool\s+(?:to|for)\s+(?:calculate|compute|derive|search|retrieve|fetch|read|write|create|update|delete|analyze|validate|inspect|review|compare|convert|format|summarize|translate|generate|execute|run|send|query|look up)\b/gi;
const GENERIC_TOOL_TOKENS = new Set([
    'a', 'an', 'actual', 'agent', 'allowed', 'answer', 'any', 'artifact', 'available', 'around',
    'child', 'data', 'deficient', 'disallowed', 'error', 'evidence', 'exact', 'exactly', 'failure',
    'failed', 'fails', 'input', 'instruction', 'instructions', 'missing', 'new', 'once', 'only',
    'output', 'outputs', 'parent', 'policy', 'raw', 'receipt', 'receipts', 'registered', 'request',
    'response', 'result', 'results', 'review', 'specific', 'succeeds', 'success', 'successful',
    'task', 'that', 'the', 'this', 'tool', 'twice', 'value', 'work',
]);
const PRIOR_OUTPUT_REFERENCE = /\b(?:previous|prior|earlier|upstream|completed)\b[^.!?;\n]{0,80}\b(?:result|output|artifact|value|answer|calculation|product)\b|\b(?:initial|final)\b[^.!?;\n]{0,80}\b(?:calculated|computed|derived)\s+(?:result|output|artifact|value|answer|calculation|product)s?\b/i;
const TASK_OUTPUT_TERMS = '(?:outputs?|results?|artifacts?|values?|answers?|products?|calculations?|receipts?|evidence|failures?|errors?|outcomes?|statuses?|findings?|conclusions?|recommendations?|reports?|summaries?|records?|observations?)';
const TASK_CONSUMER_VERBS = '(?:use|uses|using|consume|consumes|consumed|consuming|read|reads|reading|retrieve|retrieves|retrieved|retrieving|load|loads|loaded|loading|derive|derives|derived|deriving|calculate|calculates|calculated|calculating|compute|computes|computed|computing|compare|compares|compared|comparing|validate|validates|validated|validating|inspect|inspects|inspected|inspecting|review|reviews|reviewed|reviewing|check|checks|checked|checking|take|takes|taken|taking|synthesize|synthesizes|synthesized|synthesizing|combine|combines|combined|combining|integrate|integrates|integrated|integrating|incorporate|incorporates|incorporated|incorporating|aggregate|aggregates|aggregated|aggregating|based|built|drawing|starting|rooted)';
function isNegatedActionAt(text: string, actionIndex: number) {
    const prefix = text.slice(0, actionIndex);
    const conjunctions = [...prefix.matchAll(/\b(?:and|but|while|then)\b/gi)];
    const lastConjunction = conjunctions.at(-1);
    const localPrefix = prefix.slice(lastConjunction ? lastConjunction.index + lastConjunction[0].length : 0);
    return /\b(?:do not|don't|never|avoid|without)\b[^.!?;\n]{0,60}$/i.test(localPrefix);
}
function taskOutputReferences(instructions: string, taskIds: string[]): Set<string> {
    const referencedTaskIds = new Set<string>();
    const taskIdAlternation = [...taskIds]
        .sort((left, right) => right.length - left.length)
        .map((taskId) => taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    for (const taskId of taskIds) {
        const escapedId = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const taskReference = `(?:task\\s+)?${escapedId}`;
        const patterns = [
            new RegExp(`\\b${TASK_CONSUMER_VERBS}\\b[^.!?;\\n]{0,240}\\b${TASK_OUTPUT_TERMS}\\b[^.!?;\\n]{0,80}\\b(?:from|of|produced by|provided by)\\s+${taskReference}\\b`, 'gi'),
            new RegExp(`\\b${TASK_CONSUMER_VERBS}\\b[^.!?;\\n]{0,120}\\b${taskReference}\\b[^.!?;\\n]{0,60}\\b${TASK_OUTPUT_TERMS}\\b`, 'gi'),
            new RegExp(`\\b(?:verify|review|check|inspect|validate)\\b[^.!?;\\n]{0,80}\\b${taskReference}\\b[^.!?;\\n]{0,80}\\b${TASK_OUTPUT_TERMS}\\b`, 'gi'),
            new RegExp(`\\b(?:following|after|upon|once|when)\\b[^.!?;\\n]{0,80}\\b(?:failure|error|outcome|status)\\b[^.!?;\\n]{0,40}\\b${taskReference}\\b`, 'gi'),
        ];
        for (const pattern of patterns) {
            for (const match of instructions.matchAll(pattern)) {
                if (!isNegatedActionAt(instructions, match.index ?? 0))
                    referencedTaskIds.add(taskId);
            }
        }
    }
    if (taskIdAlternation) {
        const listedTaskOutputs = new RegExp(`\\b${TASK_CONSUMER_VERBS}\\b[^.!?;\\n]{0,240}\\b${TASK_OUTPUT_TERMS}\\b[^.!?;\\n]{0,80}\\b(?:from|of|produced by|provided by|generated by|recorded by|returned by)\\s+(?:(?:tasks?)\\s+)?(?:${taskIdAlternation})(?:(?:\\s*,\\s*(?:(?:and|or)\\s+)?|\\s+(?:and|or)\\s+)(?:(?:tasks?)\\s+)?(?:${taskIdAlternation}))*`, 'gi');
        for (const match of instructions.matchAll(listedTaskOutputs)) {
            if (isNegatedActionAt(instructions, match.index ?? 0))
                continue;
            for (const taskId of taskIds) {
                if (containsIdentifier(match[0], taskId))
                    referencedTaskIds.add(taskId);
            }
        }
    }
    return referencedTaskIds;
}
function hasPositivePriorOutputReference(instructions: string) {
    return instructions
        .split(/[.!?;,\n]+|\b(?:but|while|then)\b/i)
        .some((clause) => {
        const match = PRIOR_OUTPUT_REFERENCE.exec(clause);
        return Boolean(match)
            && !/\b(?:do not|don't|never|avoid|without)\b[^.!?;\n]{0,60}\b(?:use|consume|read|retrieve|load|derive|calculate|compute|compare|validate|inspect|review|check|take)\b/i.test(clause.slice(0, (match?.index ?? 0)));
    });
}
function containsIdentifier(text: string, identifier: string) {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9_-])${escaped}(?=$|[^a-z0-9_-])`, 'i').test(text);
}
function explicitToolIds(instructions: string, taskIds: Set<string>): Set<string> {
    const toolIds = new Set<string>();
    const segments = instructions.split(/[.!?;,\n]+|\b(?:but|while|then)\b/i);
    for (const segment of segments) {
        const candidates: { toolId: string; index: number }[] = [];
        for (const match of segment.matchAll(ACTION_TOOL_TARGET)) {
            candidates.push({ toolId: (match[1] || match[2] || '').toLowerCase(), index: (match.index ?? 0) });
        }
        for (const match of segment.matchAll(NAMED_TOOL_ACTION)) {
            const toolId = match[1].toLowerCase();
            candidates.push({ toolId, index: ((match.index ?? 0)) + match[0].indexOf(match[1]) });
        }
        for (const candidate of candidates) {
            if (!candidate.toolId || isNegatedActionAt(segment, candidate.index))
                continue;
            if (GENERIC_TOOL_TOKENS.has(candidate.toolId) || taskIds.has(candidate.toolId))
                continue;
            const instructionPrefix = segment.slice(0, candidate.index);
            const lastClauseBoundary = Math.max(instructionPrefix.lastIndexOf(':'), instructionPrefix.lastIndexOf(','));
            const recipientContext = instructionPrefix.slice(lastClauseBoundary + 1);
            if (/\b(?:child\s+agent|sub[- ]?agent|subagent)\b/i.test(recipientContext))
                continue;
            toolIds.add(candidate.toolId);
        }
    }
    return toolIds;
}
function explicitlyRequiresDelegation(instructions: string) {
    return instructions.split(/[.!?;\n]+/).some((segment: any) => {
        if (/\b(?:do not|don't|never|avoid|without)\s+(?:delegate|delegating|delegation)\b/i.test(segment)
            || /\b(?:do not|don't|never|avoid|without)\s+(?:use|call|invoke|execute|run)\s+__delegate\b/i.test(segment))
            return false;
        return (/\b(?:delegate|delegating|delegation)\b/i.test(segment) || containsIdentifier(segment, '__delegate'))
            && /\b(?:child\s+agent|sub[- ]?agent|subagent)\b/i.test(segment);
    });
}
export function missionTaskActionIssues(
    task: Pick<Task, 'systemPrompt' | 'requiredActions'>,
    taskPath = 'task',
    allTaskIds = new Set<string>(),
) {
    const issues: string[] = [];
    const instructions = task.systemPrompt;
    const requiredActions = task.requiredActions || [];
    const requiredToolIds = new Set(requiredActions.map((action) => action.toolId.toLowerCase()));
    const namedToolIds = explicitToolIds(instructions, allTaskIds);
    const delegationRequired = explicitlyRequiresDelegation(instructions);
    if (delegationRequired && !requiredToolIds.has('__delegate')) {
        issues.push(`${taskPath} explicitly instructs child-Agent delegation but requiredActions is missing {"toolId":"__delegate","outcome":"success"}`);
    }
    if (requiredToolIds.has('__delegate') && !delegationRequired) {
        issues.push(`${taskPath} requires __delegate but systemPrompt does not explicitly instruct child-Agent delegation`);
    }
    for (const toolId of requiredToolIds) {
        if (toolId === '__delegate' || toolId === '__create_tool' || toolId === '__external_action__' || namedToolIds.has(toolId)) {
            continue;
        }
        issues.push(`${taskPath} needs a record showing that "${toolId}" completed, but the systemPrompt does not tell the Agent to call it directly. Add a direct instruction that names the exact tool ID "${toolId}" and explains how to call it.`);

    }
    return issues;
}
export function missionTaskDependencyIssues(
    task: Task,
    allTaskIds: Set<string>,
    taskPath = `task "${task.id}"`,
    producerArtifactsByTaskId?: Map<string, string[]>,
) {
    const issues: string[] = [];
    const instructions = task.systemPrompt;
    const dependencies = (task.dependsOnTaskIds || []);
    const consumedTaskIds = taskOutputReferences(instructions, [...allTaskIds]);
    if (hasPositivePriorOutputReference(instructions) && dependencies.length === 0 && consumedTaskIds.size === 0) {
        issues.push(`${taskPath} refers to a prior task result or value but has no dependency on its producer task`);
    }
    for (const dependencyId of dependencies) {
        if (!containsIdentifier(instructions, dependencyId)) {
            issues.push(`${taskPath} depends on "${dependencyId}" but systemPrompt must name that producer task ID and its consumed output`);
        }
        else if (!consumedTaskIds.has(dependencyId) && !namesProducerArtifact(instructions, dependencyId, producerArtifactsByTaskId)) {
            issues.push(`${taskPath} depends on "${dependencyId}" but systemPrompt must identify the output or evidence consumed from that producer task`);
        }
    }
    for (const referencedTaskId of consumedTaskIds) {
        if (!dependencies.includes(referencedTaskId)) {
            issues.push(`${taskPath} consumes output or evidence from task "${referencedTaskId}" but does not declare it in dependsOnTaskIds`);
        }
    }
    return issues;
}

function repairDeclaredDependencyInstructions(plan: Plan): number {
    if (!Array.isArray(plan.phases)) return 0;
    const tasks = plan.phases.flatMap((phase) => phase.tasks || []);
    const tasksById = new Map(tasks.map((task) => [task.id.toLowerCase(), task]));
    const allTaskIds = new Set(tasks.map((task) => task.id.toLowerCase()));
    const producerArtifactsByTaskId = new Map(
        tasks.map((task) => [task.id.toLowerCase(), task.expectedArtifacts || []]),
    );
    let repairs = 0;

    for (const task of tasks) {
        task.dependsOnTaskIds ??= [];
        const consumedTaskIds = taskOutputReferences(task.systemPrompt, [...allTaskIds]);
        for (const consumedTaskId of consumedTaskIds) {
            const producer = tasksById.get(consumedTaskId.toLowerCase());
            if (producer && !task.dependsOnTaskIds.some((dependencyId) => dependencyId.toLowerCase() === producer.id.toLowerCase())) {
                task.dependsOnTaskIds.push(producer.id);
                repairs++;
            }
        }
        for (const dependencyId of task.dependsOnTaskIds || []) {
            const producer = tasksById.get(dependencyId.toLowerCase());
            if (!producer) continue;

            const namesProducer = containsIdentifier(task.systemPrompt, producer.id);
            const identifiesOutput = consumedTaskIds.has(producer.id.toLowerCase())
                || namesProducerArtifact(task.systemPrompt, producer.id, producerArtifactsByTaskId);
            if (namesProducer && identifiesOutput) continue;

            const outputDescription = producer.expectedArtifacts?.filter(Boolean).join(', ') || producer.title;
            const instruction = `Consume the output from task ${producer.id} (${outputDescription}) as input for this task.`;
            task.systemPrompt = `${task.systemPrompt.trim()}${task.systemPrompt.trim() ? ' ' : ''}${instruction}`;
            consumedTaskIds.add(producer.id.toLowerCase());
            repairs++;
        }
    }

    return repairs;
}

/**
 * Matches an artifact the producer task declares against the consumer's
 * instructions. A consumer that names the producer's own artifact - for
 * example "Based on the Business Model Definition from phase-2-task-2" - has
 * identified the output it consumes even when the artifact name is not one of
 * the generic output nouns.
 */
function namesProducerArtifact(instructions: string, dependencyId: string, producerArtifactsByTaskId?: Map<string, string[]>) {
    if (!producerArtifactsByTaskId) return false;
    const artifacts = producerArtifactsByTaskId.get(dependencyId.toLowerCase()) || [];
    for (const artifact of artifacts) {
        const pattern = looseArtifactPattern(artifact);
        if (!pattern) continue;
        const match = pattern.exec(instructions);
        if (match && !isNegatedActionAt(instructions, match.index)) return true;
    }
    return false;
}
function looseArtifactPattern(artifactName: string): RegExp | null {
    const parts = artifactName.split(/[^a-z0-9]+/i).filter((part) => part.length > 0);
    if (parts.length === 0) return null;
    if (parts.join('').length < 4) return null;
    const source = parts
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^a-z0-9]{0,3}');
    return new RegExp(source, 'i');
}
function explicitlyRequestsReusableCapability(prompt: string): boolean {
    return /\b(?:reusable|standalone|persistent|installable)\b.{0,60}\b(?:tool|service|plugin|integration|connector|sdk|library)\b/i.test(prompt)
        || /\b(?:tool|service|plugin|integration|connector|sdk|library)\b.{0,60}\b(?:deliverable|artifact|source code|for future use)\b/i.test(prompt);
}
function isCapabilitySetupTask(task: Task): boolean {
    const instructions = [task.title, task.description, task.systemPrompt].join(' ');
    const createsCapability = /\b(?:create|develop|build|implement|acquire|configure|install|set up)\b[^.!?\n]{0,120}(?:service|tool|plugin|connector|integration|sdk|api)\b/i.test(instructions);
    const declaresCapabilityArtifact = (task.expectedArtifacts || []).some((artifact) =>
        /\b(?:service|tool|plugin|connector|integration|instance|executable|binary|source|sdk|api)\b/i.test(
            String(artifact).replace(/[_-]+/g, ' '),
        ),
    );
    return createsCapability && declaresCapabilityArtifact;
}
function removeCapabilityPrerequisite(instructions: string): string {
    const prefix = /^\s*(?:given|use|using)\s+(.+?)\s+(?:to|,)\s+/i.exec(instructions);
    if (prefix && /(?:service|tool|plugin|integration|instance)/i.test(prefix[1] || '')) {
        return instructions.slice(prefix[0].length).trim();
    }
    return instructions
        .replace(/\b(?:consume|use)\s+(?:the\s+)?output\s+from\s+task\s+[a-z0-9_-]+[^.!?\n]*[.!?]?/gi, '')
        .trim();
}
function removeCapabilityReferences(text: string): string {
    return text
        .replace(
            /\buse\s+(?:the\s+)?(?:[\w-]+\s+){0,5}(?:tool|service|plugin|connector|integration)\b/gi,
            'perform the requested operation using available capabilities',
        )
        .replace(
            /\b(using|via|through)\s+(?:the\s+)?(?:[\w-]+\s+){0,5}(?:tool|service|plugin|connector|integration)\b/gi,
            '',
        )
        .replace(
            /\b(?:the\s+)?(?:[\w-]+\s+){0,5}(?:tool|service|plugin|connector|integration)(?:['’]s)?\s+output\b/gi,
            'the action result',
        )
        .replace(/\s{2,}/g, ' ')
        .trim();
}
function isInternalActionArtifact(artifact: string): boolean {
    return /(?:^|[-_ ])(?:action[-_ ]?)?(?:receipt|confirmation|execution[-_ ]?(?:outcome|result)|send[-_ ]status)(?:$|[-_ ])/i.test(artifact);
}
/**
 * Conservatively folds intermediate capability/tool setup tasks into the operational task that
 * depends on them, so the plan describes the requested outcome rather than implementation steps.
 *
 * Only the unambiguous case is mutated: a capability setup task that an operational task depends
 * on is removed and the operational task is rewritten to drop capability/tool references. This
 * never collapses a multi-task plan into a single task. Any other detected setup task (one that
 * no operational task depends on) is left untouched and reported via `unhandledSetupTaskIds` so
 * validate() can raise a task-locus issue for targeted Brain remediation.
 */
function normalizeCapabilitySetupTasks(
  plan: Plan,
  missionGoal: string,
): { removedCount: number; unhandledSetupTaskIds: string[] } {
  if (explicitlyRequestsReusableCapability(missionGoal)) return { removedCount: 0, unhandledSetupTaskIds: [] };
  if (!Array.isArray(plan.phases)) return { removedCount: 0, unhandledSetupTaskIds: [] };

  const tasks = plan.phases.flatMap((phase) => phase.tasks || []);
  const setupTaskIds = new Set(tasks.filter(isCapabilitySetupTask).map((task) => task.id));
  if (setupTaskIds.size === 0) return { removedCount: 0, unhandledSetupTaskIds: [] };

  const outcomeInstruction = 'Complete the requested outcome rather than stopping after planning or preparing it, and verify the actual result.';
  const operationalTasks = tasks.filter((task) =>
    !setupTaskIds.has(task.id)
    && (task.dependsOnTaskIds || []).some((dependencyId) => setupTaskIds.has(dependencyId))
    && /\b(?:send|email|text|sms|publish|submit|post|book|schedule|pay|transfer|notify|upload|deploy|file)\b/i.test(
      `${task.title} ${task.description} ${task.systemPrompt}`,
    ),
  );
  const removedSetupTaskIds = new Set(
    operationalTasks.flatMap((task) => (task.dependsOnTaskIds || []).filter((dependencyId) => setupTaskIds.has(dependencyId))),
  );
  const unhandledSetupTaskIds = [...setupTaskIds].filter((id) => !removedSetupTaskIds.has(id));
  if (removedSetupTaskIds.size === 0) return { removedCount: 0, unhandledSetupTaskIds };

  for (const task of operationalTasks) {
    task.dependsOnTaskIds = (task.dependsOnTaskIds || []).filter((dependencyId) => !removedSetupTaskIds.has(dependencyId));
    task.title = removeCapabilityReferences(removeCapabilityPrerequisite(task.title));
    task.description = removeCapabilityReferences(removeCapabilityPrerequisite(task.description));
    task.systemPrompt = `${removeCapabilityReferences(removeCapabilityPrerequisite(task.systemPrompt))} ${outcomeInstruction}`.trim();
    task.expectedArtifacts = (task.expectedArtifacts || []).filter((artifact) => !isInternalActionArtifact(artifact));
  }

  for (const phase of plan.phases) {
    phase.tasks = phase.tasks.filter((task) => !removedSetupTaskIds.has(task.id));
  }
  plan.phases = plan.phases.filter((phase) => phase.tasks.length > 0);
  for (const phase of plan.phases) {
    phase.name = removeCapabilityReferences(phase.name);
    phase.goal = removeCapabilityReferences(phase.goal);
  }
  if (/\b(?:create|build|develop|acquire|install)\b.{0,100}\b(?:tool|service|plugin|connector|integration)\b/i.test(plan.summary)) {
    plan.summary = plan.phases.flatMap((phase) => phase.tasks.map((task) => task.title)).join('; ');
  }
  logger.info(
    { removedTaskIds: [...removedSetupTaskIds], updatedTaskIds: operationalTasks.map((task) => task.id) },
    'Removed intermediate setup tasks so the plan describes requested outcomes rather than implementation steps',
  );
  return { removedCount: removedSetupTaskIds.size, unhandledSetupTaskIds };
}
/**
 * Structural validation that returns structured, locus-tagged issues. This is the Brain-facing
 * structural set only: duplicate ids, unknown/later-phase dependencies, cycles, human agent
 * roles, the reserved amendment prefix, empty phases/tasks, the internal
 * system-action-receipts.json artifact, and detected-but-unhandled capability setup tasks.
 *
 * The prose dependency complaints (systemPrompt must name the producer, consumes-but-not-declared)
 * are intentionally excluded: the deterministic fixer repairs both directions before validation,
 * and missionTaskDependencyIssues stays exported for other callers (PhaseReview, runtime).
 */
function structuralIssues(plan: any, missionPrompt: string): PlannerIssue[] {
    const issues: PlannerIssue[] = [];
    const phases: any[] = Array.isArray(plan?.phases) ? plan.phases : [];

    const phaseIds = new Set<string>();
    const taskIds = new Map<string, string>();
    const taskPhaseIndices = new Map<string, number>();

    for (const [phaseIndex, phase] of phases.entries()) {
        const phaseId = String((phase as any)?.id ?? '');
        const phaseLocus: PlannerLocus = { kind: 'phase', phaseId };
        if (phaseIds.has(phaseId)) {
            issues.push({ locus: phaseLocus, path: ['phases', phaseIndex, 'id'], message: `phases[${phaseIndex}].id duplicates "${phaseId}"` });
        }
        phaseIds.add(phaseId);
        const phaseTasks: any[] = Array.isArray((phase as any)?.tasks) ? (phase as any).tasks : [];
        if (phaseTasks.length === 0) {
            issues.push({ locus: phaseLocus, path: ['phases', phaseIndex, 'tasks'], message: `phases[${phaseIndex}].tasks must contain at least one task` });
        }
        for (const [taskIndex, task] of phaseTasks.entries()) {
            const taskId = String((task as any)?.id ?? '');
            const taskLocus: PlannerLocus = { kind: 'task', taskId };
            const taskPath = `task "${taskId}" (phase ${phaseIndex + 1}, task ${taskIndex + 1})`;
            if (Array.isArray((task as any).expectedArtifacts) && (task as any).expectedArtifacts.some(
                (artifact: unknown) => typeof artifact === 'string' && artifact.trim().toLocaleLowerCase() === 'system-action-receipts.json',
            )) {
                issues.push({ locus: taskLocus, path: ['phases', phaseIndex, 'tasks', taskIndex, 'expectedArtifacts'], message: `${taskPath}.expectedArtifacts must not include system-action-receipts.json; that file is internal system data` });
            }
            if (isHumanAgentRole(String((task as any).agentRole ?? ''))) {
                issues.push({ locus: taskLocus, path: ['phases', phaseIndex, 'tasks', taskIndex, 'agentRole'], message: `${taskPath}.agentRole "${(task as any).agentRole}" is not executable; assign an autonomous software Agent and represent human decisions with requiresApproval or requiresClarification` });
            }
            if (typeof taskId === 'string' && taskId.startsWith(`${phaseId}${RESERVED_AMENDMENT_PREFIX}`)) {
                issues.push({ locus: taskLocus, path: ['phases', phaseIndex, 'tasks', taskIndex, 'id'], message: `${taskPath}.id uses the reserved amendment prefix` });
            }
            const firstTaskPath = taskIds.get(taskId);
            if (firstTaskPath) {
                issues.push({ locus: taskLocus, path: ['phases', phaseIndex, 'tasks', taskIndex, 'id'], message: `${taskPath} duplicates "${taskId}" from ${firstTaskPath}; task ids must be globally unique across all phases` });
            }
            else {
                taskIds.set(taskId, taskPath);
                taskPhaseIndices.set(taskId, phaseIndex);
            }
        }
    }

    for (const [phaseIndex, phase] of phases.entries()) {
        const phaseTasks: any[] = Array.isArray((phase as any)?.tasks) ? (phase as any).tasks : [];
        const phaseTaskIds = new Set(phaseTasks.map((task: any) => String(task?.id ?? '')));
        const dependenciesByTask = new Map<string, string[]>();
        for (const [taskIndex, task] of phaseTasks.entries()) {
            const taskLocus: PlannerLocus = { kind: 'task', taskId: String((task as any)?.id ?? '') };
            const dependencies: string[] = Array.isArray((task as any).dependsOnTaskIds) ? (task as any).dependsOnTaskIds : [];
            dependenciesByTask.set(String((task as any).id), dependencies.filter((dependencyId) => phaseTaskIds.has(dependencyId)));
            for (const dependencyId of dependencies) {
                const dependencyPhaseIndex = taskPhaseIndices.get(dependencyId);
                if (dependencyPhaseIndex === undefined) {
                    issues.push({ locus: taskLocus, path: ['phases', phaseIndex, 'tasks', taskIndex, 'dependsOnTaskIds'], message: `phases[${phaseIndex}].tasks[${taskIndex}] depends on unknown task "${dependencyId}"` });
                }
                else if (dependencyPhaseIndex > phaseIndex) {
                    issues.push({ locus: taskLocus, path: ['phases', phaseIndex, 'tasks', taskIndex, 'dependsOnTaskIds'], message: `phases[${phaseIndex}].tasks[${taskIndex}] depends on a task in a later phase` });
                }
            }
        }
        const completed = new Set<string>();
        let advanced = true;
        while (advanced) {
            advanced = false;
            for (const [taskId, dependencies] of dependenciesByTask) {
                if (!completed.has(taskId) && dependencies.every((dependencyId) => completed.has(dependencyId))) {
                    completed.add(taskId);
                    advanced = true;
                }
            }
        }
        if (completed.size < phaseTaskIds.size) {
            for (const taskId of phaseTaskIds) {
                if (!completed.has(taskId)) {
                    const taskIndex = phaseTasks.findIndex((task: any) => String(task?.id) === taskId);
                    issues.push({ locus: { kind: 'task', taskId }, path: ['phases', phaseIndex, 'tasks', taskIndex, 'dependsOnTaskIds'], message: `task "${taskId}" participates in a dependency cycle; correct its dependsOnTaskIds to break the cycle` });
                }
            }
        }
    }

    for (const task of phases.flatMap((phase: any) => (Array.isArray(phase?.tasks) ? phase.tasks : []))) {
        if (isCapabilitySetupTask(task) && !explicitlyRequestsReusableCapability(missionPrompt)) {
            const taskIndex = phases.flatMap((phase: any) => phase?.tasks ?? []).indexOf(task);
            issues.push({
                locus: { kind: 'task', taskId: String(task?.id ?? '') },
                path: ['phases', taskIndex, 'id'],
                message: `task "${task?.id}" appears to be an internal tool/service setup task rather than a user-requested deliverable; restate it as the requested outcome or remove it`,
            });
        }
    }

    return issues;
}
function formatSchemaIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string[] {
    return issues.map((issue) => {
        const path = issue.path;
        if (path.length === 0) {
            return `<root>: ${issue.message}`;
        }
        const parts: string[] = [];
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            const s = String(p);
            if (s === 'phases' && i + 1 < path.length && /^\d+$/.test(String(path[i + 1]))) {
                const idx = parseInt(String(path[i + 1]), 10) + 1;
                parts.push(`Phase ${idx}`);
                i++;
                continue;
            }
            if (s === 'tasks' && i + 1 < path.length && /^\d+$/.test(String(path[i + 1]))) {
                const idx = parseInt(String(path[i + 1]), 10) + 1;
                parts.push(`task ${idx}`);
                i++;
                continue;
            }
            if (s === 'goal') { parts.push('goal'); continue; }
            if (s === 'name') { parts.push('name'); continue; }
            if (s === 'summary') { parts.push('summary'); continue; }
            if (s === 'estimatedDuration') { parts.push('estimated duration'); continue; }
            if (s === 'estimatedCost') { parts.push('estimated cost'); continue; }
            if (s === 'phases') { parts.push('phases'); continue; }
            if (s === 'clarificationQuestions') { parts.push('clarification questions'); continue; }
            if (s === 'requiresClarification') { parts.push('clarification requirement'); continue; }
            if (s === 'agentRole') { parts.push('agent role'); continue; }
            if (s === 'systemPrompt') { parts.push('system prompt'); continue; }
            if (s === 'requiredActions') { parts.push('required actions'); continue; }
            if (s === 'dependsOnTaskIds') { parts.push('dependencies'); continue; }
            if (s === 'description') { parts.push('description'); continue; }
            if (s === 'title') { parts.push('title'); continue; }
            if (s === 'id') { parts.push('id'); continue; }
            if (s === 'expectedArtifacts') { parts.push('expected deliverables'); continue; }

            if (s === 'status') { parts.push('status'); continue; }
            parts.push(s);
        }
        const desc = parts.join(' ');
        // Zod reports an absent required value as "Invalid input: expected
        // array, received undefined" (older versions used "Required"); both
        // mean the same thing and should read naturally to the user.
        const isMissingValue = issue.message === 'Required'
            || /received undefined$/i.test(issue.message);
        // Clean up for common patterns
        if (isMissingValue) {
            // Ensure it reads naturally
            if (desc.match(/^Phase \d+ goal$/)) return `${desc} is required`;
            if (desc.match(/^Phase \d+ name$/)) return `${desc} is required`;
            if (desc.match(/^Phase \d+ tasks$/)) return `${desc} are required`;
            if (desc === 'estimated duration') return `Estimated duration is required`;
            if (desc === 'estimated cost') return `Estimated cost is required`;
            if (desc === 'summary') return `Summary is required`;
            if (desc === 'phases') return `Phases are required`;
            return `${desc} is required`.replace('  ', ' ');
        }
        return `${desc}: ${issue.message}`;
    });
}
export function isHumanAgentRole(agentRole: string): boolean {
  const normalizedRole = agentRole.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return /^(human|user|person|requester|customer)(\s+(approver|reviewer|operator|decision maker|in the loop))?$/.test(normalizedRole);
}

/**
 * A progress update the planner shares with the user while it works. A planner
 * run can take a long time when a provider is slow, and without an update the
 * mission looks silent even though it is still making progress.
 */
export interface PlannerProgress {
  attempt: number;
  status: 'retrying' | 'rejected';
  reason: string;
  transient: boolean;
  /** When present, names the part of the plan a remediation attempt is about. */
  locus?: string;
}

export type PlannerProgressReporter = (progress: PlannerProgress) => Promise<void>;

function allTasks(plan: any): Task[] {
  const phases: any[] = Array.isArray(plan?.phases) ? plan.phases : [];
  return phases.flatMap((phase: any) => (Array.isArray(phase?.tasks) ? phase.tasks : []));
}

function mintUniqueId(phaseId: string, usedIds: Set<string>): string {
  let counter = 1;
  let candidate = `${phaseId}-task-${counter}`;
  while (usedIds.has(candidate)) {
    counter += 1;
    candidate = `${phaseId}-task-${counter}`;
  }
  return candidate;
}

/**
 * Renames duplicate task ids to unique ids and rewrites dependsOnTaskIds references to match.
 * The first occurrence of an id is kept; later duplicates get a fresh `<phaseId>-task-<n>` id
 * (never the reserved amendment prefix). References are rewritten only within the duplicate's own
 * phase, and only when the kept occurrence lives in a different phase (so a consumer in the
 * duplicate's phase cannot have meant the kept task); otherwise the reference is genuinely
 * ambiguous and is left for validation to surface.
 */
function renameDuplicateTaskIds(plan: Plan): number {
  const phases: any[] = Array.isArray((plan as any).phases) ? (plan as any).phases : [];
  const firstOccurrence = new Map<string, { phaseIndex: number; taskIndex: number }>();
  const usedIds = new Set<string>();
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const [taskIndex, task] of (phase.tasks || []).entries()) {
      const id = String(task.id);
      if (!firstOccurrence.has(id)) {
        firstOccurrence.set(id, { phaseIndex, taskIndex });
        usedIds.add(id);
      }
    }
  }
  let renamed = 0;
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const [taskIndex, task] of (phase.tasks || []).entries()) {
      const id = String(task.id);
      const first = firstOccurrence.get(id)!;
      if (first.phaseIndex === phaseIndex && first.taskIndex === taskIndex) continue;
      const oldId = task.id;
      const newId = mintUniqueId(String(phase.id), usedIds);
      task.id = newId;
      usedIds.add(newId);
      // Rewrite same-phase references when the kept occurrence is in another phase.
      if (first.phaseIndex !== phaseIndex) {
        for (const sibling of phase.tasks || []) {
          if (sibling.id === newId) continue;
          if (Array.isArray(sibling.dependsOnTaskIds) && sibling.dependsOnTaskIds.includes(oldId)) {
            sibling.dependsOnTaskIds = sibling.dependsOnTaskIds.map((dep: string) => (dep === oldId ? newId : dep));
          }
        }
      }
      logger.info({ missionId: undefined, oldId, newId, phaseId: phase.id }, 'Renamed duplicate planner task id');
      renamed += 1;
    }
  }
  return renamed;
}

/** Drops self-dependencies, dependencies on unknown task ids, and dependencies on later phases. */
function dropInvalidDependencies(plan: Plan): void {
  const phases: any[] = Array.isArray((plan as any).phases) ? (plan as any).phases : [];
  const allIds = new Set<string>();
  const taskPhaseIndex = new Map<string, number>();
  phases.forEach((phase: any, phaseIndex: number) => {
    for (const task of phase.tasks || []) {
      const id = String(task.id);
      allIds.add(id);
      taskPhaseIndex.set(id, phaseIndex);
    }
  });
  phases.forEach((phase: any, phaseIndex: number) => {
    for (const task of phase.tasks || []) {
      const dependencies: string[] = Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : [];
      task.dependsOnTaskIds = dependencies.filter((dependencyId) => {
        if (dependencyId === task.id) return false;
        if (!allIds.has(dependencyId)) return false;
        const dependencyPhaseIndex = taskPhaseIndex.get(dependencyId);
        if (dependencyPhaseIndex !== undefined && dependencyPhaseIndex > phaseIndex) return false;
        return true;
      });
    }
  });
}

const DELIVERY_ARTIFACT_PATTERN = /\b(?:sms|text|email|message|delivery)[-_ ]?(?:message[-_ ]?)?(?:id|status)\b/i;

/** The finish rules: force a plan into the shape the runtime expects before it ships. */
function applyFinishRules(plan: Plan, missionPrompt: string): void {
  plan.requiresClarification = false;
  plan.clarificationQuestions = [];
  // A plan with no phases array at all is missing required structure: leave it for validation
  // (and remediation) rather than inventing a default phase here. Only an empty array triggers
  // the single safe default phase below, once every other phase field is already valid.
  if (!Array.isArray(plan.phases)) return;
  if (plan.phases.length === 0) {
    plan.summary = (typeof plan.summary === 'string' ? plan.summary.trim() : '') || missionPrompt;
    plan.phases = [{
      id: 'phase-1',
      name: 'Complete requested outcome',
      goal: missionPrompt,
      requiresApproval: false,
      status: 'pending',
      tasks: [{
        id: 'phase-1-task-1',
        title: 'Complete the requested outcome',
        description: missionPrompt,
        agentRole: 'mission-executor',
        systemPrompt: `Achieve the requested outcome: ${missionPrompt}. Do not invent missing information. Try authorized alternatives first; if a specific required value is unavailable and no safe alternative can complete the outcome, ask one focused question for that value.`,
        dependsOnTaskIds: [],
        expectedArtifacts: [],
        requiredActions: [],
        status: 'pending',
        artifacts: [],
      }],
    }];
  }
  const filterDeliveryArtifacts = !DELIVERY_ARTIFACT_PATTERN.test(missionPrompt);
  for (const phase of plan.phases) {
    phase.requiresApproval = false;
    phase.approvalQuestion = undefined;
    for (const task of phase.tasks) {
      if (filterDeliveryArtifacts) {
        task.expectedArtifacts = (task.expectedArtifacts || []).filter((artifact) =>
          !DELIVERY_ARTIFACT_PATTERN.test(String(artifact).replace(/[_-]+/g, ' ')),
        );
      }
      task.requiredActions = [];
    }
  }
}

/**
 * Everything that never needs the Brain, run to a fixpoint BEFORE validation so validation sees
 * exactly what will ship: sanitization + defaults, mechanical type coercions, duplicate-id
 * renaming with reference rewriting, dropping invalid dependencies, repairing declared dependency
 * instructions, conservative capability-setup normalization, and the finish rules.
 */
export function applyDeterministicFixes(input: unknown, missionPrompt: string): Plan {
  const sanitized = sanitizePlan(input);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return sanitized as Plan;
  }
  const plan = sanitized as any;
  // Do NOT default a missing phases array to []: a plan with no phases is structurally incomplete
  // and must be rejected and remediated (e.g. the Brain omitted the whole plan), not silently
  // "fixed" into an empty plan. Empty arrays are still handled by the finish rules below.
  applyPlannerDefaults(plan);

  // Coercion fixpoint: apply mechanical type coercions until the schema is satisfied or no
  // further coercion applies. The no-change guard guarantees termination of this pure pass.
  for (let guard = 0; guard < 1000; guard += 1) {
    const parsed = PlanSchema.safeParse(plan);
    if (parsed.success) break;
    const { coercions } = classifyFieldIssues(parsed.error.issues as any, plan);
    if (coercions.length === 0) break;
    const before = JSON.stringify(plan);
    for (const coercion of coercions) {
      try {
        setValueAtPath(plan, coercion.path, coercion.replacement);
      } catch {
        // A coercion whose path no longer resolves is skipped; the next parse re-checks.
      }
    }
    if (JSON.stringify(plan) === before) break;
  }

  // repairDeclaredDependencyInstructions expects string prompts; guarantee that invariant.
  for (const task of allTasks(plan)) {
    if (typeof task.systemPrompt !== 'string') (task as any).systemPrompt = '';
  }

  renameDuplicateTaskIds(plan as Plan);
  dropInvalidDependencies(plan as Plan);
  const dependencyRepairs = repairDeclaredDependencyInstructions(plan as Plan);
  if (dependencyRepairs > 0) {
    logger.info({ dependencyRepairs }, 'Repaired declared task dependencies locally');
  }
  normalizeCapabilitySetupTasks(plan as Plan, missionPrompt);
  applyFinishRules(plan as Plan, missionPrompt);
  return plan as Plan;
}

function locusForPath(plan: any, path: PropertyKey[]): PlannerLocus {
  if (Array.isArray(path) && path[0] === 'phases') {
    const phaseIndex = typeof path[1] === 'number' ? path[1] : undefined;
    const phase = phaseIndex !== undefined ? plan?.phases?.[phaseIndex] : undefined;
    const tasksIndex = path.indexOf('tasks');
    if (tasksIndex >= 0 && typeof path[tasksIndex + 1] === 'number' && phase) {
      const task = phase.tasks?.[path[tasksIndex + 1] as number];
      return { kind: 'task', taskId: String(task?.id ?? '') };
    }
    if (phase) return { kind: 'phase', phaseId: String(phase.id ?? '') };
  }
  return { kind: 'plan' };
}

/**
 * The single pure validation function: PlanSchema issues (formatted with the existing wording)
 * plus the structural checks. Each issue is tagged with the locus that must change.
 */
export function validate(plan: unknown, missionPrompt: string): PlannerIssue[] {
  const issues: PlannerIssue[] = [];
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        locus: locusForPath(plan, issue.path as PropertyKey[]),
        path: issue.path as PropertyKey[],
        message: formatSchemaIssues([issue as any])[0]!,
      });
    }
  }
  issues.push(...structuralIssues(plan, missionPrompt));
  return issues;
}

/**
 * Tracks consecutive remediation failures per locus so a stuck locus (one whose "fix" leaves the
 * same issue in place) changes what we ask the Brain and is visible in progress logs. It never
 * caps, skips, or fails a repair: termination stays Brain exhaustion only.
 */
export class LocusFailureTracker {
  private readonly failures = new Map<string, { count: number; lastSummary: string }>();

  static key(locus: PlannerLocus): string {
    if (locus.kind === 'task') return `task:${locus.taskId}`;
    if (locus.kind === 'phase') return `phase:${locus.phaseId}`;
    return 'plan';
  }

  get(locus: PlannerLocus): { count: number; lastSummary: string } {
    return this.failures.get(LocusFailureTracker.key(locus)) ?? { count: 0, lastSummary: '' };
  }

  recordFailure(locus: PlannerLocus, summary: string): void {
    const key = LocusFailureTracker.key(locus);
    const current = this.failures.get(key);
    this.failures.set(key, { count: (current?.count ?? 0) + 1, lastSummary: summary });
  }

  recordSuccess(locus: PlannerLocus): void {
    this.failures.delete(LocusFailureTracker.key(locus));
  }

  stuck(): Array<{ key: string; count: number; lastSummary: string }> {
    return [...this.failures.entries()]
      .filter(([, value]) => value.count > 0)
      .map(([key, value]) => ({ key, count: value.count, lastSummary: value.lastSummary }));
  }
}

function truncateForLog(value: unknown, max = 240): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Truncates long string fields inside a payload (never the whole JSON) so a huge field cannot
 *  bloat a narrow Brain request. */
function truncateLongStrings(value: unknown, max = 4000): unknown {
  if (typeof value === 'string') return value.length > max ? value.slice(0, max) : value;
  if (Array.isArray(value)) return value.map((entry) => truncateLongStrings(entry, max));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = truncateLongStrings(entry, max);
    }
    return out;
  }
  return value;
}

function locusLabel(locus: PlannerLocus): string {
  if (locus.kind === 'task') return `task ${locus.taskId}`;
  if (locus.kind === 'phase') return `phase ${locus.phaseId}`;
  return 'plan';
}

export async function generateValidPlan(
  prompt: string,
  context: Record<string, unknown> | undefined,
  missionId: string | undefined,
  complete: PlannerCompletion,
  reportValidation?: PlannerValidationReporter,
  reportProgress?: PlannerProgressReporter,
): Promise<Plan> {
  // Repair state: a monotonically increasing Brain-call counter for routing/progress, the
  // transient-failure retry budget, and the consecutive-empty-completion limit. There is
  // deliberately NO repair-attempt ceiling: repair ends only when the Brain signals exhaustion.
  let attempt = 0;
  const nextAttempt = () => {
    attempt += 1;
    return attempt;
  };
  let transientBrainRetries = 0;
  let consecutiveEmptyCompletions = 0;
  let lastError = '';
  const routingSessionId = missionId ? `${missionId}:planner` : `planner:${randomUUID()}`;
  const tracker = new LocusFailureTracker();

  /** Records an empty completion against the shared limit; returns true when it is exceeded. */
  const noteEmptyCompletion = (): boolean => {
    consecutiveEmptyCompletions += 1;
    lastError = 'Planner returned a completion without content';
    return consecutiveEmptyCompletions > MAX_CONSECUTIVE_EMPTY_PLANNER_COMPLETIONS;
  };
  const emptyCompletionError = () =>
    new Error(
      `Unable to generate a valid mission plan: Brain returned ${consecutiveEmptyCompletions} consecutive empty completions. Last plan validation issue: ${lastError}`,
    );

  /**
   * A single Brain completion call with the shared transient-failure handling and the terminal
   * Brain-exhaustion / routing-stalled handling. Returns the raw string content (which may be
   * empty); callers decide whether an empty or malformed reply is re-asked.
   */
  const callBrain = async (requestPrompt: string, systemPrompt: string): Promise<string> => {
    let requestAttempt = 0;
    while (true) {
      requestAttempt = nextAttempt();
      let content: string;
      try {
        content = await complete({
          prompt: requestPrompt,
          systemPrompt,
          maxTokens: PLANNER_EXECUTION_POLICY.maxCompletionTokensPerCall,
          temperature: 0.3,
          missionId,
          routingSessionId,
          attempt: requestAttempt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
          throw new Error(
            `Unable to generate a valid mission plan because Brain exhausted every eligible model. Last plan validation issue: ${lastError || 'none; no model produced a plan'}. Brain: ${message}`,
            { cause: error },
          );
        }
        if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) {
          throw new Error(
            `Unable to generate a valid mission plan because Brain routing did not complete within the current planner task. No new planner task was started, to avoid repeating the same failed routing strategy. Brain: ${message}`,
            { cause: error },
          );
        }
        if (isTransientBrainFailure(message)) {
          transientBrainRetries += 1;
          if (transientBrainRetries > MAX_TRANSIENT_BRAIN_RETRIES) {
            throw new Error(
              `Unable to generate a valid mission plan after ${MAX_TRANSIENT_BRAIN_RETRIES} transient Brain retries. Last error: ${message}`,
              { cause: error },
            );
          }
          logger.warn({ missionId, attempt: requestAttempt, reason: message }, 'Planner Brain request failed transiently; retrying with another eligible model');
          await reportProgress?.({ attempt: requestAttempt, status: 'retrying', reason: message, transient: true });
          continue;
        }
        throw new Error(`Planner Agent request failed on attempt ${requestAttempt}: ${message}`, { cause: error });
      }
      return typeof content === 'string' ? content : '';
    }
  };

  /** The one and only full-plan Brain call (initial generation). */
  const requestFullPlan = async (): Promise<Plan> => {
    const fullPrompt = `Create a plan to achieve this goal: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}`;
    while (true) {
      const content = await callBrain(fullPrompt, PLANNER_SYSTEM_PROMPT);
      if (typeof content !== 'string' || content.trim().length === 0) {
        const exceeded = noteEmptyCompletion();
        await reportValidation?.(lastError);
        if (exceeded) throw emptyCompletionError();
        logger.warn({ missionId, attempt }, 'Planner completion was empty; requesting the plan again');
        await reportProgress?.({ attempt, status: 'retrying', reason: lastError, transient: true });
        continue;
      }
      consecutiveEmptyCompletions = 0;
      let parsed: ReturnType<typeof parsePlanJson>;
      try {
        parsed = parsePlanJson(content);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await reportValidation?.(lastError);
        logger.warn({ missionId, attempt, reason: lastError }, 'Planner response was not parseable plan JSON; requesting the plan again');
        await reportProgress?.({ attempt, status: 'retrying', reason: lastError, transient: false });
        continue;
      }
      if (parsed.repaired) {
        logger.info({ missionId, attempt, repairs: parsed.repairs }, 'Repaired structurally invalid planner JSON');
      }
      if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
        lastError = 'Planner response did not contain a JSON plan object';
        await reportValidation?.(lastError);
        await reportProgress?.({ attempt, status: 'retrying', reason: lastError, transient: false });
        continue;
      }
      return parsed.value as Plan;
    }
  };

  /**
   * One focused remediation round: for each locus (or a single narrow field repair) make one
   * Brain request that returns only the corrected value, validate the reply, and splice it in.
   * Independent task/phase groups run concurrently; results are spliced sequentially by id.
   */
  const remediate = async (plan: Plan, issues: PlannerIssue[]): Promise<{ plan: Plan; summary: string }> => {
    const schema = PlanSchema.safeParse(plan);
    // Narrowest form: exactly one scalar field at fault.
    if (issues.length === 1 && !schema.success) {
      const { fieldRepair } = classifyFieldIssues(schema.error.issues as any, plan);
      if (fieldRepair) {
        const pathLabel = fieldRepair.path.map(String).join('.');
        const failures = tracker.get({ kind: 'plan' });
        const summary = await requestNarrowReplacement(
          () => plannerFieldRepairPrompt(fieldRepair),
          (value) => {
            setValueAtPath(plan, fieldRepair.path, value);
            return plan;
          },
          pathLabel,
          failures,
        );
        return { plan, summary };
      }
    }

    const grouped = new Map<string, { locus: PlannerLocus; issues: PlannerIssue[] }>();
    for (const issue of issues) {
      const key = LocusFailureTracker.key(issue.locus);
      const existing = grouped.get(key);
      if (existing) existing.issues.push(issue);
      else grouped.set(key, { locus: issue.locus, issues: [issue] });
    }

    const buildTaskPrompt = (locus: { kind: 'task'; taskId: string }, locusIssues: PlannerIssue[]) => {
      const task = allTasks(plan).find((candidate) => candidate.id === locus.taskId);
      const others = allTasks(plan)
        .filter((candidate) => candidate.id !== locus.taskId)
        .map((candidate) => `${candidate.id} (phase task) — ${candidate.title}`)
        .join('\n');
      return [
        `Correct only this task so it is valid. Return only the corrected task object as JSON with the same id "${locus.taskId}", no prose or Markdown fences.`,
        `Issues to fix:\n${locusIssues.map((issue) => `- ${issue.message}`).join('\n')}`,
        `Other tasks you may depend on (id — title):\n${others || '(none)'}`,
        `Current task:\n${JSON.stringify(truncateLongStrings(task))}`,
      ].join('\n');
    };

    const buildPhasePrompt = (locus: { kind: 'phase'; phaseId: string }, locusIssues: PlannerIssue[]) => {
      const phase = (plan.phases as any[]).find((candidate) => candidate.id === locus.phaseId);
      const { tasks: _tasks, ...phaseFields } = phase ?? {};
      return [
        `Correct only this phase's own fields (not its tasks). Return only the corrected phase fields as a JSON object, no prose or Markdown fences.`,
        `Issues to fix:\n${locusIssues.map((issue) => `- ${issue.message}`).join('\n')}`,
        `Current phase fields:\n${JSON.stringify(truncateLongStrings(phaseFields))}`,
      ].join('\n');
    };

    // A plan-level locus can mean either a small field fix (summary/duration/cost) or a plan that
    // is missing required structure (e.g. no phases). The narrow field prompt cannot restore
    // structure, so fall back to requesting a complete corrected plan in that case.
    const planLocusNeedsFullPlan = (locusIssues: PlannerIssue[]) =>
      locusIssues.some((issue) => issue.path[0] === 'phases' || issue.path[0] === 'tasks')
      || !Array.isArray((plan as any).phases);

    const buildPlanPrompt = (locusIssues: PlannerIssue[]) =>
      planLocusNeedsFullPlan(locusIssues)
        ? [
            `The plan is missing required structure. Return the complete corrected plan as one JSON object with summary, estimatedDuration, estimatedCost, requiresClarification, clarificationQuestions, and a non-empty phases array, no prose or Markdown fences.`,
            `Issues to fix:\n${locusIssues.map((issue) => `- ${issue.message}`).join('\n')}`,
            `Current plan:\n${JSON.stringify(truncateLongStrings(plan))}`,
          ].join('\n')
        : [
            `Correct only the plan-level fields (summary, estimatedDuration, estimatedCost). Return only a small JSON object with the corrected fields, no prose or Markdown fences.`,
            `Issues to fix:\n${locusIssues.map((issue) => `- ${issue.message}`).join('\n')}`,
            `Current values:\n${JSON.stringify({ summary: (plan as any).summary, estimatedDuration: (plan as any).estimatedDuration, estimatedCost: (plan as any).estimatedCost })}`,
          ].join('\n');

    const groups = [...grouped.values()];
    const results = await Promise.all(groups.map(async (group) => {
      const failures = tracker.get(group.locus);
      if (group.locus.kind === 'task') {
        const summary = await requestNarrowReplacement(
          () => buildTaskPrompt(group.locus as { kind: 'task'; taskId: string }, group.issues),
          (value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
            const candidate = value as Task;
            if (candidate.id !== (group.locus as { kind: 'task'; taskId: string }).taskId) return undefined;
            const targetPhase = (plan.phases as any[]).find((phase) => phase.tasks.some((task: Task) => task.id === candidate.id));
            if (!targetPhase) return undefined;
            targetPhase.tasks = targetPhase.tasks.map((task: Task) => (task.id === candidate.id ? candidate : task));
            return plan;
          },
          locusLabel(group.locus),
          failures,
        );
        return { locus: group.locus, summary };
      }
      if (group.locus.kind === 'phase') {
        const summary = await requestNarrowReplacement(
          () => buildPhasePrompt(group.locus as { kind: 'phase'; phaseId: string }, group.issues),
          (value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
            const phase = (plan.phases as any[]).find((candidate) => candidate.id === (group.locus as { kind: 'phase'; phaseId: string }).phaseId);
            if (!phase) return undefined;
            const { tasks: _ignored, ...fields } = value as any;
            Object.assign(phase, fields);
            return plan;
          },
          locusLabel(group.locus),
          failures,
        );
        return { locus: group.locus, summary };
      }
      const summary = await requestNarrowReplacement(
        () => buildPlanPrompt(group.issues),
        (value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
          Object.assign(plan, value);
          return plan;
        },
        locusLabel(group.locus),
        failures,
      );
      return { locus: group.locus, summary };
    }));

    const summary = results.map((result) => result.summary).join('; ');
    return { plan, summary };
  };

  /**
   * Re-asks one narrow request until the Brain returns a parseable value the apply step accepts,
   * counting empty replies against the shared limit. On a reply that leaves the same issue in
   * place, the next ask for this locus includes the previous failed answer and a demand for a
   * materially different fix. There is no cap.
   */
  const requestNarrowReplacement = async (
    buildPrompt: () => string,
    apply: (value: unknown) => Plan | undefined,
    locusName: string,
    priorFailure: { count: number; lastSummary: string },
  ): Promise<string> => {
    const locus: PlannerLocus = locusName.startsWith('task ')
      ? { kind: 'task', taskId: locusName.slice('task '.length) }
      : locusName.startsWith('phase ')
        ? { kind: 'phase', phaseId: locusName.slice('phase '.length) }
        : { kind: 'plan' };
    let lastAnswerSummary = '';
    while (true) {
      const basePrompt = buildPrompt();
      const variation = priorFailure.count > 0
        ? `\n\nA previous attempt to fix ${locusName} did not resolve the issue. Previous answer summary: ${truncateForLog(priorFailure.lastSummary)}. Produce a materially different fix.`
        : '';
      const content = await callBrain(`${basePrompt}${variation}`, PLANNER_REMEDIATION_SYSTEM_PROMPT);
      if (typeof content !== 'string' || content.trim().length === 0) {
        const exceeded = noteEmptyCompletion();
        await reportValidation?.(lastError);
        if (exceeded) throw emptyCompletionError();
        await reportProgress?.({ attempt, status: 'retrying', reason: lastError, transient: true, locus: locusName });
        continue;
      }
      consecutiveEmptyCompletions = 0;
      let parsed: ReturnType<typeof parsePlanJson>;
      try {
        parsed = parsePlanJson(content);
      } catch (error) {
        lastError = `Planner remediation for ${locusName} did not return JSON: ${error instanceof Error ? error.message : String(error)}`;
        await reportValidation?.(lastError);
        await reportProgress?.({ attempt, status: 'retrying', reason: lastError, transient: false, locus: locusName });
        continue;
      }
      const applied = apply(parsed.value);
      if (applied === undefined) {
        lastError = `Planner remediation for ${locusName} returned an unusable value; re-asking`;
        await reportValidation?.(lastError);
        await reportProgress?.({ attempt, status: 'rejected', reason: lastError, transient: false, locus: locusName });
        continue;
      }
      // Did this answer actually change anything for this locus?
      tracker.recordSuccess(locus);
      lastAnswerSummary = truncateForLog(parsed.value);
      logger.info({ missionId, attempt, locus: locusName }, 'Applied planner remediation');
      return lastAnswerSummary;
    }
  };

  const plan = applyDeterministicFixes(await requestFullPlan(), prompt);
  logger.info({ missionId, missionGoal: prompt.slice(0, 50), phases: Array.isArray((plan as any).phases) ? (plan as any).phases.length : 0, attempt }, 'Plan generated');
  let currentPlan = plan;
  while (true) {
    const fixed = applyDeterministicFixes(currentPlan, prompt);
    currentPlan = fixed;
    const issues = validate(currentPlan, prompt);
    if (issues.length === 0) {
      return PlanSchema.parse(currentPlan);
    }
    await reportValidation?.(issues.map((issue) => issue.message).join('\n'));
    logger.warn({ missionId, attempt, issueCount: issues.length }, 'Planner plan needs remediation');
    await reportProgress?.({ attempt, status: 'rejected', reason: issues.map((issue) => issue.message).join('\n'), transient: false });
    const result = await remediate(currentPlan, issues);
    currentPlan = result.plan;
  }
}
export class MissionPlanner {
  constructor(private readonly complete: PlannerCompletion) {}

  async generatePlan(
    prompt: string,
    context?: Record<string, unknown>,
    missionId?: string,
    reportProgress?: PlannerProgressReporter,
  ): Promise<Plan> {
    return generateValidPlan(prompt, context, missionId, this.complete, undefined, reportProgress);
  }
}

export interface PlannerCompletionRequest {
  prompt: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  missionId?: string;
  routingSessionId?: string;
  attempt: number;
}

export type PlannerCompletion = (request: PlannerCompletionRequest) => Promise<string>;
export type PlannerValidationReporter = (reason: string) => Promise<void>;
