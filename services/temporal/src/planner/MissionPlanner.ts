import {
  AgentExecutionPolicy,
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  DEFAULT_AGENT_EXECUTION_POLICY,
  Plan,
  PlanSchema,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';
import { randomUUID } from 'crypto';

const MAX_PRIOR_RESPONSE_CHARS = 12_000;
const MAX_PLANNER_ATTEMPTS = 3;

export const PLANNER_SYSTEM_PROMPT = `You are a mission planner for an AI agent platform. Given a user's goal, produce a complete structured plan tailored to that goal.

Requirements:
1. If the goal is ambiguous, set requiresClarification=true and ask 2-4 focused questions. Otherwise set requiresClarification=false and clarificationQuestions=[].
2. For a goal that does not need clarification, create as many phases and specific tasks as needed to fully accomplish it. Keep every phase meaningful and include at least one task in each phase.
3. Each phase must include id, name, goal, tasks, requiresApproval, and status. Use "pending" for the initial status.
4. Each task must include id, title, description, agentRole, systemPrompt, dependsOnTaskIds, expectedArtifacts, status, and artifacts. Use "pending" for the initial status and [] when there are no artifacts yet. dependsOnTaskIds lists task IDs that must complete first; use [] only when the task is genuinely independent.
5. Give every phase a unique, stable id. Task ids must be globally unique across the entire plan, not merely unique within each phase. Use ids such as "phase-2-task-1"; never reuse "task-1" in another phase. Dependencies may refer only to tasks in the same or an earlier phase, and must not form a cycle. Select agent roles based on the actual work.
6. Mark requiresApproval=true only where a human decision is needed before work continues.

Return one complete JSON object matching this structure:
{"summary":"...","estimatedDuration":"...","estimatedCost":"...","requiresClarification":false,"clarificationQuestions":[],"phases":[{"id":"phase-1","name":"...","goal":"...","requiresApproval":false,"status":"pending","tasks":[{"id":"phase-1-task-1","title":"...","description":"...","agentRole":"...","systemPrompt":"...","dependsOnTaskIds":[],"expectedArtifacts":[],"status":"pending","artifacts":[]}]}]}
Do not include prose, markdown fences, or any text outside the JSON object.`;

export const PLANNER_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxBrainCalls: 1,
  maxActions: 0,
  maxCompletionTokens: 4_096,
  maxCompletionTokensPerCall: 4_096,
  maxDelegations: 0,
};

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

function parsePlanJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error(`Planner response did not contain a JSON plan: ${directError instanceof Error ? directError.message : String(directError)}`);
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (error) {
      throw new Error(`Planner response did not contain valid plan JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function planStandardIssues(plan: Plan): string[] {
  const issues: string[] = [];
  if (plan.requiresClarification) {
    if (plan.clarificationQuestions.length < 2 || plan.clarificationQuestions.length > 4) {
      issues.push('clarificationQuestions must contain 2-4 focused questions when requiresClarification is true');
    }
    return issues;
  }

  if (plan.phases.length === 0) {
    issues.push('phases must contain at least one phase when clarification is not required');
  }

  const phaseIds = new Set<string>();
  const taskIds = new Map<string, string>();
  const taskPhaseIndices = new Map<string, number>();
  for (const [phaseIndex, phase] of plan.phases.entries()) {
    if (phaseIds.has(phase.id)) issues.push(`phases[${phaseIndex}].id duplicates "${phase.id}"`);
    phaseIds.add(phase.id);
    if (phase.tasks.length === 0) {
      issues.push(`phases[${phaseIndex}].tasks must contain at least one task`);
    }
    for (const [taskIndex, task] of phase.tasks.entries()) {
      const taskPath = `phases[${phaseIndex}].tasks[${taskIndex}].id`;
      if (!Array.isArray(task.dependsOnTaskIds)) {
        issues.push(`phases[${phaseIndex}].tasks[${taskIndex}].dependsOnTaskIds must be provided; use [] for independent tasks`);
      }
      if (task.id.startsWith(`${phase.id}-amendment-`)) {
        issues.push(`phases[${phaseIndex}].tasks[${taskIndex}].id uses the reserved amendment prefix`);
      }
      const firstTaskPath = taskIds.get(task.id);
      if (firstTaskPath) {
        issues.push(
          `${taskPath} duplicates "${task.id}" from ${firstTaskPath}; task ids must be globally unique across all phases`,
        );
      } else {
        taskIds.set(task.id, taskPath);
        taskPhaseIndices.set(task.id, phaseIndex);
      }
    }
  }

  for (const [phaseIndex, phase] of plan.phases.entries()) {
    const phaseTaskIds = new Set(phase.tasks.map((task) => task.id));
    const dependenciesByTask = new Map<string, string[]>();
    for (const [taskIndex, task] of phase.tasks.entries()) {
      const dependencies = task.dependsOnTaskIds || [];
      dependenciesByTask.set(task.id, dependencies.filter((dependencyId) => phaseTaskIds.has(dependencyId)));
      for (const dependencyId of dependencies) {
        const dependencyPhaseIndex = taskPhaseIndices.get(dependencyId);
        if (dependencyId === task.id) {
          issues.push(`phases[${phaseIndex}].tasks[${taskIndex}] cannot depend on itself`);
        } else if (dependencyPhaseIndex === undefined) {
          issues.push(`phases[${phaseIndex}].tasks[${taskIndex}] depends on unknown task "${dependencyId}"`);
        } else if (dependencyPhaseIndex > phaseIndex) {
          issues.push(`phases[${phaseIndex}].tasks[${taskIndex}] depends on a task in a later phase`);
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
      issues.push(`phases[${phaseIndex}].tasks dependencies contain a cycle`);
    }
  }
  return issues;
}

function formatSchemaIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string[] {
  return issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '<root>'}: ${issue.message}`);
}

export async function generateValidPlan(
  prompt: string,
  context: Record<string, unknown> | undefined,
  missionId: string | undefined,
  complete: PlannerCompletion,
): Promise<Plan> {
  let lastError = '';
  let previousResponse = '';
  const routingSessionId = missionId ? `${missionId}:planner` : `planner:${randomUUID()}`;

  for (let attempt = 1; attempt <= MAX_PLANNER_ATTEMPTS; attempt++) {
    const repairPrompt = attempt === 1
      ? ''
      : [
        '',
        `Your previous plan was rejected (attempt ${attempt - 1}). Fix every listed issue and return a complete replacement plan.`,
        'Validation issues:',
        lastError,
        'Do not reuse task IDs across phases. When an ID is duplicated, assign each affected task a distinct stable ID that includes its phase number, such as "phase-3-task-1". Preserve all otherwise-valid plan content and do not omit tasks.',
        'Previous response (possibly truncated):',
        previousResponse.slice(0, MAX_PRIOR_RESPONSE_CHARS),
      ].join('\n');

    let content: string;
    try {
      content = await complete({
        prompt: `GOAL: ${prompt}\n\nCONTEXT: ${JSON.stringify(context || {})}${repairPrompt}`,
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        maxTokens: PLANNER_EXECUTION_POLICY.maxCompletionTokensPerCall,
        temperature: 0.3,
        missionId,
        routingSessionId,
        attempt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
        throw new Error(
          `Unable to generate a valid mission plan because Brain exhausted every eligible model after ${attempt - 1} response(s). Last plan validation issue: ${lastError || 'none; no model produced a plan'}. Brain: ${message}`,
        );
      }
      if (!message.includes(BRAIN_MODEL_SELECTION_RETRY)) {
        throw new Error(`Planner Agent request failed on attempt ${attempt}: ${message}`);
      }
      logger.warn({ missionId, attempt, reason: message }, 'Brain requested another Planner attempt with an untried eligible model');
      continue;
    }
    previousResponse = content;

    try {
      const parsed = PlanSchema.safeParse(parsePlanJson(content));
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

      logger.info({ missionId, missionGoal: prompt.slice(0, 50), phases: plan.phases.length, attempt }, 'Plan generated');
      return plan;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(
        { missionId, attempt, reason: lastError },
        'Planner response rejected; requesting a corrected plan',
      );
    }
  }

  throw new Error(
    `Unable to generate a valid mission plan after ${MAX_PLANNER_ATTEMPTS} attempts. Last validation issue: ${lastError || 'Brain did not return a valid plan'}`,
  );
}

export class MissionPlanner {
  constructor(private readonly complete: PlannerCompletion) {}

  async generatePlan(prompt: string, context?: Record<string, unknown>, missionId?: string): Promise<Plan> {
    return generateValidPlan(prompt, context, missionId, this.complete);
  }
}
