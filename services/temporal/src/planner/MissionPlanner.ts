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

const MAX_PRIOR_RESPONSE_CHARS = 12_000;

/**
 * Failures that say nothing about the plan and can be retried against another
 * eligible model: a provider that timed out, a completion deadline that
 * expired with models still available, or a transient upstream error.
 */
const TRANSIENT_BRAIN_FAILURE_PATTERNS: RegExp[] = [
  /Brain request failed \(5\d\d\)/i,
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
1. If the goal is ambiguous, set requiresClarification=true and ask 2-4 focused questions. Otherwise set requiresClarification=false and clarificationQuestions=[].
2. For a goal that does not need clarification, create as many phases and specific tasks as needed to fully accomplish it. Keep every phase meaningful and include at least one task in each phase. Keep descriptions and systemPrompts concise and operational; do not omit required actions, task IDs, dependencies, or consumed outputs to save space.
3. Each phase must include id, name, goal, tasks, requiresApproval, and status. Use "pending" for the initial status.
4. Each task must include id, title, description, agentRole, systemPrompt, dependsOnTaskIds, expectedArtifacts, requiredActions, status, and artifacts. Use "pending" for the initial status and [] when there are no artifacts or required actions yet. dependsOnTaskIds lists task IDs that must complete first; use [] only when the task is genuinely independent.
5. Give every phase a unique, stable id. Task ids must be globally unique across the entire plan, not merely unique within each phase. Use ids such as "phase-2-task-1"; never reuse "task-1" in another phase. Dependencies may refer only to tasks in the same or an earlier phase, and must not form a cycle. Select agent roles based on the actual work.
6. Every task must be executable by an autonomous software Agent. Never assign agentRole "Human", "User", or another human decision-maker. Represent a needed human decision with requiresApproval or requiresClarification instead.
7. Mark requiresApproval=true only where a human decision is needed before work continues.
8. A task's systemPrompt is its operational instruction, not just a question restating the goal. When the goal or task description requires a tool action or delegation, include it in requiredActions as {"toolId":"<exact tool id or __delegate>","outcome":"success"}. The systemPrompt must explicitly name and instruct every required direct tool action using its exact tool ID; for delegation, explicitly instruct the Agent to delegate to a child Agent. A tool mentioned only as an action for that child is not a direct action receipt for the parent. If a task performs a failure and recovery in one task, include both the expected {"outcome":"failure"} and recovery {"outcome":"success"} action receipts. If recovery is split into ordered tasks, the failing task must record its failure receipt and the recovery task must depend on and name that failure task and record its success receipt. When a task must attempt an unavailable or disallowed tool, include {"outcome":"denied"} and instruct the Agent to make the actual action request. Do not require actions for reasoning-only tasks.
9. When a task produces document artifacts, its systemPrompt must instruct the Agent to begin each artifact with a one-paragraph summary (under 100 words) before the full content, so downstream reviewers can judge the artifact from the summary alone.
10. If a task consumes another task's result or artifact, list that producer's exact task ID in dependsOnTaskIds and in the task's systemPrompt, and say which output is consumed. Do not refer vaguely to "initial", "final", or "previous" values without naming their producing task IDs. Dependencies belong on the consuming task, not on a producer that merely names a future consumer. Do not infer a dependency from a task ID mentioned in a negative instruction or in a statement that the task's output will be consumed downstream. Include only tasks that produce an input the task actually uses. Dependencies impose execution order and make completed producer outputs available to the Agent.

Return one complete JSON object matching this structure:
{"summary":"...","estimatedDuration":"...","estimatedCost":"...","requiresClarification":false,"clarificationQuestions":[],"phases":[{"id":"phase-1","name":"...","goal":"...","requiresApproval":false,"status":"pending","tasks":[{"id":"phase-1-task-1","title":"...","description":"...","agentRole":"...","systemPrompt":"...","dependsOnTaskIds":[],"expectedArtifacts":[],"requiredActions":[],"status":"pending","artifacts":[]}]}]}
Do not include prose, markdown fences, or any text outside the JSON object.`;
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
export function missionTaskActionIssues(task: Pick<Task, 'systemPrompt' | 'requiredActions'>, taskPath = 'task', allTaskIds = new Set<string>()) {
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
    for (const toolId of namedToolIds) {
        if (!requiredToolIds.has(toolId)) {
            issues.push(`${taskPath} explicitly instructs use of tool "${toolId}" but requiredActions is missing its receipt`);
        }
    }
    for (const action of (requiredActions as { toolId: string; outcome: string }[])) {
        if (action.toolId !== '__delegate' && !namedToolIds.has(action.toolId.toLowerCase())) {
            issues.push(`${taskPath} requires tool "${action.toolId}" but systemPrompt does not explicitly name and instruct that tool`);
        }
    }
    const denialSegments = instructions.split(/[.!?;\n]+/).filter((segment: string) => /\b(?:denied|denial|disallowed|not permitted|forbidden|blocked|policy rejection)\b/i.test(segment));
    for (const toolId of namedToolIds) {
        if (denialSegments.some((segment: string) => containsIdentifier(segment, toolId))
            && !requiredActions.some((action: { toolId: string; outcome: string }) => action.toolId.toLowerCase() === toolId && action.outcome === 'denied')) {
            issues.push(`${taskPath} expects a policy denial for tool "${toolId}" but has no denied action receipt`);
        }
    }
    return issues;
}
function missionTaskRecoveryIssues(task: any, tasksById: any, taskPath: any): string[] {
    const recoveryIntent = task.systemPrompt
        .split(/[.!?;\n,]+|\b(?:and|but|while|then)\b/i)
        .some((segment: any) => {
        const match = /\b(?:recover|recovery|repair|retry|correct)\b|\b(?:following|after|upon|once|when)\b[^.!?;\n]{0,80}\b(?:failure|error)\b/i.exec(segment);
        return Boolean(match) && !isNegatedActionAt(segment, match ? (match.index ?? 0) : 0);
    });
    if (!recoveryIntent)
        return [];
    const issues = [];
    for (const action of (task.requiredActions || []).filter((candidate: any) => candidate.toolId !== '__delegate')) {
        const toolId = action.toolId.toLowerCase();
        const outcomes = new Set((task.requiredActions || [])
            .filter((candidate: any) => candidate.toolId.toLowerCase() === toolId)
            .map((candidate: any) => candidate.outcome));
        if (outcomes.has('failure') && outcomes.has('success'))
            continue;
        const priorFailureDependency = ((task.dependsOnTaskIds || [])).some((dependencyId: any) => {
            var _a;
            return (((_a = tasksById.get(dependencyId)) === null || _a === void 0 ? void 0 : _a.requiredActions) || []).some((candidate: any) => candidate.toolId.toLowerCase() === toolId && candidate.outcome === 'failure');
        });
        if (outcomes.has('success') && priorFailureDependency)
            continue;
        issues.push(`${taskPath} requires recovery from a tool error for "${action.toolId}" but must include failure and success receipts in the task or depend on a task that records the failure`);
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
function planStandardIssues(plan: any): string[] {
    const issues = [];
    if (plan.requiresClarification) {
        if (plan.clarificationQuestions.length < 2 || plan.clarificationQuestions.length > 4) {
            issues.push('clarificationQuestions must contain 2-4 focused questions when requiresClarification is true');
        }
        return issues;
    }
    if ((plan as any).phases.length === 0) {
        issues.push('phases must contain at least one phase when clarification is not required');
    }
    const phaseIds = new Set();
    const taskIds = new Map();
    const taskPhaseIndices = new Map();
    const allTasks = (plan as any).phases.flatMap((phase: any) => phase.tasks as Task[]);
    const allTaskIds = new Set(allTasks.map((task: Task) => task.id));
    const tasksById = new Map(allTasks.map((task: any) => [task.id, task]));
    const producerArtifactsByTaskId = new Map<string, string[]>(
        allTasks.map((task: any) => [
            (task.id as string).toLowerCase(),
            ((task.expectedArtifacts || []) as string[]).map((artifact: string) => String(artifact)),
        ]),
    );
    const normalizedTaskIds = new Set([...allTaskIds].map((taskId) => (taskId as string).toLowerCase()));
    for (const [phaseIndex, phase] of (plan as any).phases.entries() as [number, any][]) { const ph: any = phase;
        if (phaseIds.has((ph as any).id))
            issues.push(`phases[${phaseIndex}].id duplicates "${ph.id}"`);
        phaseIds.add((ph as any).id);
        if ((ph as any).tasks.length === 0) {
            issues.push(`phases[${phaseIndex}].tasks must contain at least one task`);
        }
        for (const [taskIndex, task] of Array.from((((ph as any).tasks) as any[]).entries()) as [number, any][]) {  
            const taskPath = `task "${task.id}" (phase ${phaseIndex + 1}, task ${taskIndex + 1})`;
            if (!Array.isArray(task.requiredActions)) {
                issues.push(`${taskPath}.requiredActions must be provided; use [] when no action receipt is required`);
            }
            if (isHumanAgentRole(task.agentRole)) {
                issues.push(`${taskPath}.agentRole "${task.agentRole}" is not executable; assign an autonomous software Agent and represent human decisions with requiresApproval or requiresClarification`);
            }
            if (!Array.isArray(task.dependsOnTaskIds)) {
                issues.push(`${taskPath}.dependsOnTaskIds must be provided; use [] for independent tasks`);
            }
            issues.push(...missionTaskActionIssues(task, taskPath, normalizedTaskIds));
            issues.push(...missionTaskRecoveryIssues(task, tasksById, taskPath));
            issues.push(...missionTaskDependencyIssues(task, normalizedTaskIds, taskPath, producerArtifactsByTaskId));
            if (task.id.startsWith(`${ph.id}-amendment-`)) {
                issues.push(`${taskPath}.id uses the reserved amendment prefix`);
            }
            const firstTaskPath = taskIds.get(task.id);
            if (firstTaskPath) {
                issues.push(`${taskPath} duplicates "${task.id}" from ${firstTaskPath}; task ids must be globally unique across all phases`);
            }
            else {
                taskIds.set(task.id, taskPath);
                taskPhaseIndices.set(task.id, phaseIndex);
            }
        }
    }
    for (const [phaseIndex, ph] of Array.from((plan as any).phases.entries()) as [number, any][]) { 
        const phaseTaskIds = new Set((ph as any).tasks.map((task: any) => task.id));
        const dependenciesByTask = new Map<string, string[]>();
        for (const [taskIndex, task] of Array.from((((ph as any).tasks) as any[]).entries()) as [number, any][]) {  
            const dependencies = (task.dependsOnTaskIds || []);
            dependenciesByTask.set(task.id, dependencies.filter((dependencyId: any) => phaseTaskIds.has(dependencyId)));
            for (const dependencyId of dependencies) {
                const dependencyPhaseIndex = taskPhaseIndices.get(dependencyId);
                if (dependencyId === task.id) {
                    issues.push(`phases[${phaseIndex}].tasks[${taskIndex}] cannot depend on itself`);
                }
                else if (dependencyPhaseIndex === undefined) {
                    issues.push(`phases[${phaseIndex}].tasks[${taskIndex}] depends on unknown task "${dependencyId}"`);
                }
                else if (dependencyPhaseIndex > phaseIndex) {
                    issues.push(`phases[${phaseIndex}].tasks[${taskIndex}] depends on a task in a later phase`);
                }
            }
        }
        const completed = new Set();
        let advanced = true;
        while (advanced) {
            advanced = false;
            for (const [taskId, dependencies] of dependenciesByTask) {
                if (!completed.has(taskId) && dependencies.every((dependencyId: any) => completed.has(dependencyId))) {
                    completed.add(taskId);
                    advanced = true;
                }
            }
        }
        if (completed.size < phaseTaskIds.size) {
            issues.push(`phases[${phaseIndex}].tasks dependencies contain a cycle`);
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
            if (s === 'expectedArtifacts') { parts.push('expected artifacts'); continue; }
            if (s === 'status') { parts.push('status'); continue; }
            parts.push(s);
        }
        const desc = parts.join(' ');
        // Clean up for common patterns
        if (issue.message === 'Required') {
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
}

export type PlannerProgressReporter = (progress: PlannerProgress) => Promise<void>;

export async function generateValidPlan(
  prompt: string,
  context: Record<string, unknown> | undefined,
  missionId: string | undefined,
  complete: PlannerCompletion,
  reportValidation?: PlannerValidationReporter,
  reportProgress?: PlannerProgressReporter,
): Promise<Plan> {
    let lastError = '';
    let previousResponse = '';
    let jsonRepairRequested = false;
    const routingSessionId = missionId ? `${missionId}:planner` : `planner:${randomUUID()}`;
    let attempt = 0;
    while (true) {
        attempt++;
        const isJsonRepair = jsonRepairRequested;
        jsonRepairRequested = false;
        const repairPrompt = isJsonRepair
            ? [
                'Fix only the JSON syntax in the planner response below. Do not replan, add, omit, or change any plan content.',
                'Return exactly one corrected JSON object, with no prose or Markdown fences.',
                `JSON parsing issue: ${lastError}`,
                'Problematic planner response:',
                previousResponse.slice(0, MAX_PRIOR_RESPONSE_CHARS),
            ].join('\n')
            : attempt === 1
                ? ''
                : [
                '',
                `Resolve only the specific issues listed below for the plan you just produced. Do not regenerate the entire plan from scratch or request a full replan. For each issue, make the minimal correction or completion needed while preserving all other plan content, task IDs, structure, and valid parts exactly as they are. Return a complete, valid replacement plan that incorporates only those fixes.`,
                'Specific issues to resolve:',
                lastError,
                'Do not reuse task IDs across phases. When an ID is duplicated, assign each affected task a distinct stable ID that includes its phase number, such as "phase-3-task-1". Preserve all otherwise-valid plan content and do not omit tasks. For dependency issues, map each consumed value to the task that actually produces it, name that exact task ID in systemPrompt, and do not use a downstream task as a substitute for its source.',
                'For a missing tool instruction, keep the requiredActions receipt and add an imperative sentence to that task systemPrompt that names the exact tool ID, such as "Call the exact tool __list_tools to verify the registered tool." For a dependency issue, name the producer task ID and identify the specific output consumed in the consumer systemPrompt. For a JSON parsing issue, return exactly one valid JSON object with no prose, Markdown fences, or trailing text.',
                'Previous response (possibly truncated):',
                previousResponse.slice(0, MAX_PRIOR_RESPONSE_CHARS),
            ].join('\n');
        let content;
        try {
            content = await complete({
                prompt: isJsonRepair
                    ? repairPrompt
                    : `Create a plan to achieve this goal: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}${repairPrompt}`,
                systemPrompt: isJsonRepair
                    ? 'You repair JSON syntax. Preserve all values and keys exactly; only correct formatting and syntax. Return one valid JSON object and nothing else.'
                    : PLANNER_SYSTEM_PROMPT,
                maxTokens: PLANNER_EXECUTION_POLICY.maxCompletionTokensPerCall,
                temperature: 0.3,
                missionId,
                routingSessionId,
                attempt,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
                throw new Error(`Unable to generate a valid mission plan because Brain exhausted every eligible model. Last plan validation issue: ${lastError || 'none; no model produced a plan'}. Brain: ${message}`, { cause: error });
            }
            if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) {
                logger.warn({ missionId, attempt, reason: message }, 'Brain requested another Planner attempt with an untried eligible model');
                await reportProgress?.({ attempt, status: 'retrying', reason: message, transient: true });
                continue;
            }
            if (isTransientBrainFailure(message)) {
                logger.warn({ missionId, attempt, reason: message }, 'Planner Brain request failed transiently; retrying with another eligible model');
                await reportProgress?.({ attempt, status: 'retrying', reason: message, transient: true });
                continue;
            }
            throw new Error(`Planner Agent request failed on attempt ${attempt}: ${message}`, { cause: error });
        }
        previousResponse = content;
        try {
            const parsedPlan = parsePlanJson(content);
            if (parsedPlan.repaired) {
                logger.info({ missionId, attempt, repairs: parsedPlan.repairs }, 'Repaired structurally invalid planner JSON');
            }
            const sanitized = sanitizePlan(parsedPlan.value);
            const parsed = PlanSchema.safeParse(sanitized);
            if (!parsed.success) {
                lastError = formatSchemaIssues(parsed.error.issues).join('\n');
                throw new Error(lastError);
            }
            const plan = parsed.data;
            const standardsIssues = planStandardIssues(plan);
            if (standardsIssues.length) {
                lastError = standardsIssues.join('\n');
                throw new Error(lastError);
            }
            logger.info({ missionId, missionGoal: prompt.slice(0, 50), phases: (plan as any).phases.length, attempt }, 'Plan generated');
            return plan;
        }
        catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            await (reportValidation === null || reportValidation === void 0 ? void 0 : reportValidation(lastError));
            if (lastError.startsWith('Planner response did not contain')) {
                jsonRepairRequested = true;
                logger.warn({ missionId, attempt, reason: lastError }, 'Planner JSON is malformed; requesting a JSON-only repair');
                await reportProgress?.({ attempt, status: 'retrying', reason: lastError, transient: false });
                continue;
            }
            logger.warn({ missionId, attempt, reason: lastError }, 'Planner response rejected; requesting a corrected plan');
            await reportProgress?.({ attempt, status: 'rejected', reason: lastError, transient: false });
        }
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
