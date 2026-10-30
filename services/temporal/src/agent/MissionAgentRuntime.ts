import { logger } from '@stage7-nextgen/shared';
import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentExecutionPolicy,
  AgentToolPolicy,
  DEFAULT_AGENT_EXECUTION_POLICY,
  MissionArtifact,
  MissionArtifactSchema,
  describeRequestError,
  httpRequest,
} from '@stage7-nextgen/shared';
import { Plan, Phase, Task } from '@stage7-nextgen/shared';
import type { CompletedTaskSummary, MissionCredentialRequest, MissionPendingInteraction } from '../types/workflow';
import {
  PlannerCompletionRequest,
  PlannerProgressReporter,
  PLANNER_EXECUTION_POLICY,
  PLANNER_SYSTEM_PROMPT,
  generateValidPlan,
  missionTaskActionIssues,
  missionTaskDependencyIssues,
} from '../planner/MissionPlanner';

const TASK_SELECTOR_SYSTEM_PROMPT = `You are the mission task selector. Select the single best next task from the supplied ready tasks, using the mission goal, phase goal, and completed task IDs. You may not select a task that is not listed as ready, add tasks, or change task instructions. Return only JSON in the form {"taskId":"<ready-task-id>"}.`;
const TASK_SELECTOR_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxActions: 0,
  maxCompletionTokens: 512,
  maxCompletionTokensPerCall: 256,
  maxDelegations: 0,
};
const PHASE_REVIEW_SYSTEM_PROMPT = `You are a critical phase reviewer. Compare completed task outputs and artifacts with the mission goal and phase goal. Only observed results and artifacts count as evidence; plans, proposed tool actions, and claims that a tool was used are not evidence that it ran. Treat system-action-receipts.json as the record of actual tool results: every required action must have a matching receipt with its required outcome, failed receipts do not support success, and claimed results that contradict receipts are gaps. Do not mark a phase complete just because its tasks ran. If the phase goal is satisfied, return {"satisfied":true,"gaps":[],"followUpTask":null}. Otherwise identify concrete gaps and propose exactly one focused follow-up task that can address a gap, returning {"satisfied":false,"gaps":["..."],"followUpTask":{"title":"...","description":"...","agentRole":"...","systemPrompt":"...","expectedArtifacts":[],"requiredActions":[]}}. Every explicit tool call in systemPrompt must have a requiredActions receipt using the exact tool ID. Child-Agent delegation uses toolId "__delegate", never "delegate"; denial attempts require outcome "denied"; recovery from a tool error requires both "failure" and "success" receipts. Explicitly instruct the Agent to make each required action. Never repeat a successfully completed side-effect action or change a requested identifier; when verification is missing, propose a safe read-only verification task. The follow-up systemPrompt must name each prerequisite task ID and identify the specific output, artifact, or receipt it consumes. Do not propose tasks that repeat completed work. Return exactly one JSON object with this shape; do not include explanations, task metadata, plans, tool actions, or Markdown fences.`;
const PHASE_REVIEW_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxActions: 0,
  maxCompletionTokens: 2_048,
  maxCompletionTokensPerCall: 1_024,
  maxDelegations: 0,
};
const MISSION_COMPLETION_REVIEWER_SYSTEM_PROMPT = `You are an objective mission-completion reviewer. Determine whether the observed task outputs and artifacts satisfy the mission goal. Treat each task's requiredActions as explicit action obligations and system-action-receipts.json as the record of actual tool results: every required action must have a matching receipt with its required outcome, failed receipts do not support success, and claimed results that contradict receipts are gaps. For every unmet requirement, name the exact task ID, state the missing/failed requirement, and cite the observed evidence explaining why it is unmet. Never use generic gaps such as "concrete unmet requirement" or repeat the mission goal as the reason. Return exactly one JSON object with {"satisfied":true,"gaps":[]} or {"satisfied":false,"gaps":["task-specific explanation"]}. Never infer success from a task merely being marked complete. Do not include explanations, Markdown fences, or any text outside the JSON object.`;
const MISSION_COMPLETION_REVIEW_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxActions: 0,
  maxCompletionTokens: 1_024,
  maxCompletionTokensPerCall: 512,
  maxDelegations: 0,
};
const MAX_SAFE_AGENT_TASK_RETRIES = 1;
const MAX_TASK_SELECTION_ATTEMPTS = 10;
const MAX_PHASE_REVIEW_ATTEMPTS = 10;
const MAX_COMPLETION_REVIEW_ATTEMPTS = 3;
const ASK_USER_MARKER = '__ASK_USER__:';
const MAX_ACTION_RECEIPTS = 50;
const INTERNAL_ACTION_RECEIPT_ARTIFACT = 'system-action-receipts.json';

function isExecutionOutcomeReport(content: string): boolean {
  return /^\s*(?:\*\*)?Blocker(?:\*\*)?\s*:/i.test(content)
    || /^\s*(?:Execution outcome|Artifact status)\b.{0,120}\b(?:blocked|failed|not created)\b/i.test(content);
}

function missionAgentRoleLabel(role: string): string {
  return role.trim().replace(/[_-]+/g, ' ').replace(/(?:\s+Agent)+$/i, '').trim() || 'Agent';
}

function missionAgentRoleKey(role: string): string {
  return missionAgentRoleLabel(role)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
}

function extractMissionAgents(value: unknown): AgentDefinition[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      && Array.isArray((value as Record<string, unknown>).agents)
      ? (value as { agents: unknown[] }).agents
      : [];
  return entries.filter((entry): entry is AgentDefinition => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const agent = entry as Record<string, unknown>;
    return typeof agent.id === 'string'
      && typeof agent.tenantId === 'string'
      && typeof agent.name === 'string'
      && typeof agent.description === 'string'
      && typeof agent.type === 'string'
      && typeof agent.systemPrompt === 'string'
      && Array.isArray(agent.tools)
      && agent.tools.every((tool) => typeof tool === 'string')
      && !!agent.metadata
      && typeof agent.metadata === 'object'
      && !Array.isArray(agent.metadata)
      && typeof agent.createdAt === 'string'
      && typeof agent.updatedAt === 'string';
  });
}

export interface MissionPhaseReview {
  satisfied: boolean;
  gaps: string[];
  followUpTask?: {
    title: string;
    description: string;
    agentRole: string;
    systemPrompt: string;
    expectedArtifacts: string[];
    requiredActions?: NonNullable<Task['requiredActions']>;
  };
}

export interface AppliedPhaseReview {
  plan: Plan;
  phase: Phase;
  satisfied: boolean;
  gaps: string[];
  amendment?: Task;
}

export function applyPhaseReview(
  plan: Plan,
  phaseId: string,
  review: MissionPhaseReview,
): AppliedPhaseReview {
  const phase = plan.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`Cannot amend missing mission phase ${phaseId}`);
  if (review.satisfied) return { plan, phase, satisfied: true, gaps: review.gaps };

  const followUpTask = review.followUpTask;
  if (!followUpTask) {
    return { plan, phase, satisfied: false, gaps: review.gaps };
  }

  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const expectedArtifacts = (artifacts: string[]) => artifacts.map(normalize).sort();
  const repeatedTask = phase.tasks.find((task) =>
    normalize(task.title) === normalize(followUpTask.title)
    && normalize(task.description) === normalize(followUpTask.description)
    && JSON.stringify(expectedArtifacts(task.expectedArtifacts))
      === JSON.stringify(expectedArtifacts(followUpTask.expectedArtifacts))
    && JSON.stringify(task.requiredActions || []) === JSON.stringify(followUpTask.requiredActions || []),
  );
  if (repeatedTask) {
    return {
      plan,
      phase,
      satisfied: false,
      gaps: [...review.gaps, `Reviewer repeated existing task "${repeatedTask.title}"; no new task was added.`],
    };
  }

  const existingTaskIds = new Set(plan.phases.flatMap((entry) => entry.tasks.map((task) => task.id)));
  let amendmentIndex = 1;
  let taskId = `${phase.id}-amendment-${amendmentIndex}`;
  while (existingTaskIds.has(taskId)) {
    amendmentIndex++;
    taskId = `${phase.id}-amendment-${amendmentIndex}`;
  }
  const dependencies = phase.tasks.map((task) => task.id);
  const completedSideEffectActions = new Set(
    phase.tasks
      .filter((task) => task.status === 'completed')
      .flatMap((task) => (task.requiredActions || [])
      .filter((action) => action.outcome === 'success' && action.toolId.toLowerCase() !== '__list_tools')
      .map((action) => action.toolId.toLowerCase())),
  );
  const repeatedSideEffect = followUpTask.requiredActions?.find((action) =>
    action.outcome === 'success'
    && action.toolId.toLowerCase() !== '__list_tools'
    && completedSideEffectActions.has(action.toolId.toLowerCase()),
  );
  if (repeatedSideEffect) {
    return {
      plan,
      phase,
      satisfied: false,
      gaps: [
        ...review.gaps,
        `Reviewer proposed repeating successful side-effect action "${repeatedSideEffect.toolId}"; no new task was added.`,
      ],
    };
  }

  const dependencyInstructions = phase.tasks.map((task) => {
    const evidenceNames = [...new Set([
      ...task.expectedArtifacts,
      ...task.artifacts.map((artifact) => artifact.name),
    ])];
    const evidence = evidenceNames.length > 0 ? `, including ${evidenceNames.join(', ')}` : '';
    return `Use the outputs produced by task ${task.id}${evidence}`;
  });
  const amendment: Task = {
    id: taskId,
    ...followUpTask,
    systemPrompt: `${followUpTask.systemPrompt.trim()}\n\n${dependencyInstructions.join('. ')} as authoritative phase context, and do not repeat completed work.`,
    requiredActions: followUpTask.requiredActions || [],
    dependsOnTaskIds: dependencies,
    status: 'pending',
    artifacts: [],
  };
  const allTaskIds = new Set(
    [...plan.phases.flatMap((entry) => entry.tasks.map((task) => task.id)), taskId]
      .map((existingTaskId) => existingTaskId.toLowerCase()),
  );
  const taskPath = `phase follow-up "${amendment.title}"`;
  const contractIssues = [
    ...missionTaskActionIssues(amendment, taskPath, allTaskIds),
    ...missionTaskDependencyIssues(amendment, allTaskIds, taskPath),
  ];
  if (contractIssues.length > 0) {
    throw new Error(`Phase reviewer proposed an invalid follow-up task: ${contractIssues.join('; ')}`);
  }
  const amendedPhase: Phase = { ...phase, tasks: [...phase.tasks, amendment] };
  const amendedPlan: Plan = {
    ...plan,
    phases: plan.phases.map((entry) => entry.id === phaseId ? amendedPhase : entry),
  };
  return { plan: amendedPlan, phase: amendedPhase, satisfied: false, gaps: review.gaps, amendment };
}

function getAgentRuntimeUrl(): string {
  return process.env.AGENT_RUNTIME_URL || 'http://agent-runtime:3400';
}

/**
 * An agent task runs a full model completion, which can take many minutes.
 * The default must outlast the Brain completion deadline, otherwise the
 * request is aborted while the agent is still working and the mission fails
 * even though the agent eventually succeeds.
 */
function agentRuntimeTimeoutMs(): number {
  const configured = Number(process.env.AGENT_RUNTIME_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const brainDeadline = Number(process.env.BRAIN_COMPLETION_DEADLINE_MS);
  if (Number.isFinite(brainDeadline) && brainDeadline > 0) return brainDeadline + 60_000;
  return 900_000;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ':');
}

export interface MissionAgentConfig {
  missionId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
  broadcast?: (event: { type: string; missionId: string; timestamp: number; data?: any }) => Promise<void>;
  agentRuntimeUrl?: string;
}

interface MissionAgentToolGrant extends AgentToolPolicy {
  tools?: string[];
}

function parseMissionAgentToolPolicies(value: unknown): Map<string, MissionAgentToolGrant> {
  if (value === undefined) return new Map();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('metadata.agentToolPolicies must be an object keyed by Agent role or "*"');
  }

  const policies = new Map<string, MissionAgentToolGrant>();
  for (const [rawRole, rawPolicy] of Object.entries(value)) {
    const role = rawRole.trim().toLowerCase();
    if (role !== '*' && !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(role)) {
      throw new Error(`metadata.agentToolPolicies contains invalid Agent role '${rawRole}'`);
    }
    if (policies.has(role)) {
      throw new Error(`metadata.agentToolPolicies contains duplicate normalized Agent role '${role}'`);
    }
    if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
      throw new Error(`metadata.agentToolPolicies.${rawRole} must be an object`);
    }

    const policy = rawPolicy as Record<string, unknown>;
    const unknownFields = Object.keys(policy).filter((key) => key !== 'mode' && key !== 'tools');
    if (unknownFields.length > 0) {
      throw new Error(`metadata.agentToolPolicies.${rawRole} contains unsupported field '${unknownFields[0]}'`);
    }
    if (policy.mode === 'all') {
      if (policy.tools !== undefined && (!Array.isArray(policy.tools) || policy.tools.length > 0)) {
        throw new Error(`metadata.agentToolPolicies.${rawRole}.tools must be omitted or empty when mode is 'all'`);
      }
      policies.set(role, { mode: 'all' });
      continue;
    }
    if (policy.mode !== 'allowlist' || !Array.isArray(policy.tools) || policy.tools.length > 100) {
      throw new Error(`metadata.agentToolPolicies.${rawRole} must define mode 'all' or an allowlist of at most 100 tool IDs`);
    }
    const tools = policy.tools.map((tool) => typeof tool === 'string' ? tool.trim() : '');
    if (tools.some((tool) => !tool) || new Set(tools).size !== tools.length) {
      throw new Error(`metadata.agentToolPolicies.${rawRole}.tools must contain unique, non-empty tool IDs`);
    }
    policies.set(role, { mode: 'allowlist', tools });
  }
  return policies;
}

export interface TaskExecutionResult {
  output: string;
  artifacts: MissionArtifact[];
  actionReceipts?: Array<{
    toolId: string;
    isError: boolean;
    content: string;
    outcome: 'success' | 'failure' | 'denied' | 'question_asked' | 'permission_required';
    actionKey?: string;
  }>;
  interruption?: Pick<MissionPendingInteraction, 'kind' | 'question' | 'credentialRequest' | 'requestId' | 'permission'>;
  tokensUsed: number;
  model?: string;
  provider?: string;
  requestId?: string;
  reasoning?: string;
}

export interface PromptTaskRequest {
  taskId: string;
  type: string;
  prompt: string;
  phaseId?: string;
  expectedArtifacts?: string[];
  requiredActions?: NonNullable<Task['requiredActions']>;
  context?: Record<string, unknown>;
  requireCompletedReceipt?: boolean;
  executionPolicy?: AgentExecutionPolicy;
  retryGuidance?: string;
}

class MissionAgentRuntimeApiError extends Error {
  constructor(readonly path: string, readonly status: number, details: string) {
    super(`Agent Runtime API ${path} failed (${status}): ${details.slice(0, 200)}`);
    this.name = 'MissionAgentRuntimeApiError';
  }
}

export class MissionAgentRuntime {
  private missionId: string;
  private tenantId: string;
  private agentRuntimeUrl: string;
  private broadcast: MissionAgentConfig['broadcast'];
  private agentToolPolicies: Map<string, MissionAgentToolGrant>;
  private missionRetryCount: number;
  private entityId?: string;
  private assistantId?: string;
  private agentCache: Map<string, string> = new Map(); // agentRole -> agentId
  private taskAgentMap: Map<string, string> = new Map(); // taskId -> agentId

  constructor(config: MissionAgentConfig) {
    this.missionId = config.missionId;
    this.tenantId = config.tenantId;
    this.agentRuntimeUrl = config.agentRuntimeUrl || getAgentRuntimeUrl();
    this.broadcast = config.broadcast || (async () => {});
    this.agentToolPolicies = parseMissionAgentToolPolicies(config.metadata?.agentToolPolicies);
    this.entityId = typeof config.metadata?.entityId === 'string' ? config.metadata.entityId : undefined;
    this.assistantId = typeof config.metadata?.assistantId === 'string' ? config.metadata.assistantId : undefined;
    const retryCount = config.metadata?.retryCount;
    if (
      retryCount !== undefined
      && (typeof retryCount !== 'number' || !Number.isSafeInteger(retryCount) || retryCount < 0)
    ) {
      throw new Error('metadata.retryCount must be a non-negative safe integer');
    }
    this.missionRetryCount = typeof retryCount === 'number' ? retryCount : 0;
  }

  private async api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.agentRuntimeUrl}/api/agent-runtime${path}`;
    let res: Response;
    try {
      // `fetch` aborts a request that has not received response headers
      // within 300 seconds, which kills long running agent tasks and
      // reports them as an opaque "fetch failed".
      res = await httpRequest(url, {
        method: options.method,
        headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> | undefined) },
        body: options.body as string | undefined,
        timeoutMs: agentRuntimeTimeoutMs(),
      });
    } catch (err) {
      const message = describeRequestError(err);
      logger.error({ path, url, err: message }, 'Agent runtime fetch failed');
      throw new MissionAgentRuntimeApiError(path, 500, message);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new MissionAgentRuntimeApiError(path, res.status, text);
    }
    return res.json() as Promise<T>;
  }

  private missionAgentsPath(): string {
    return `/missions/${encodePathSegment(this.missionId)}/agents`;
  }

  private missionAgentPath(agentId: string, ...segments: string[]): string {
    return `${this.missionAgentsPath()}/${encodePathSegment(agentId)}${
      segments.map((segment) => `/${encodePathSegment(segment)}`).join('')
    }`;
  }

  private async reportBrainComplaint(requestId: string | undefined, reason: string): Promise<void> {
    if (!requestId) {
      logger.warn(
        { missionId: this.missionId, reason },
        'Cannot report rejected Agent output to Brain without a request ID',
      );
      return;
    }

    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${brainUrl}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason, missionId: this.missionId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.text();
        logger.error(
          { missionId: this.missionId, requestId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected a mission Agent output complaint',
        );
        return;
      }
      logger.info({ missionId: this.missionId, requestId, reason }, 'Mission Agent reported a Brain output complaint');
    } catch (error) {
      logger.error(
        { missionId: this.missionId, requestId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report a mission Agent output complaint',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async registerPlannerAgent(systemPrompt: string): Promise<string> {
    const retryScope = this.missionRetryCount > 0 ? `-retry-${this.missionRetryCount}` : '';
    const agentId = `agent-${this.missionId}-planner${retryScope}`;
    if (this.agentCache.has('planner')) return this.agentCache.get('planner')!;

    try {
      const existing = await this.api<AgentDefinition>(this.missionAgentPath(agentId));
      if (existing.id) {
        this.assertToolAccess(existing, 'planner');
        await this.api(this.missionAgentPath(agentId, 'start'), { method: 'POST' });
        this.agentCache.set('planner', agentId);
        return agentId;
      }
    } catch (error) {
      if (!(error instanceof MissionAgentRuntimeApiError) || error.status !== 404) {
        throw error;
      }
    }

    const toolAccess = this.resolveToolAccess('planner');
    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: 'Mission Planner',
      description: `Planner agent for mission ${this.missionId}`,
      type: 'planner',
      systemPrompt,
      tools: toolAccess.tools,
      ...(toolAccess.policy ? { toolPolicy: toolAccess.policy } : {}),
      metadata: { missionId: this.missionId, agentRole: 'planner' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.api(this.missionAgentsPath(), { method: 'POST', body: JSON.stringify(definition) });
    await this.api(this.missionAgentPath(agentId, 'start'), { method: 'POST' });
    this.agentCache.set('planner', agentId);
    return agentId;
  }

  async generatePlan(
    prompt: string,
    context?: Record<string, unknown>,
    onProgress?: PlannerProgressReporter,
  ): Promise<Plan> {
    const agentId = await this.registerPlannerAgent(PLANNER_SYSTEM_PROMPT);
    let responseRequestId: string | undefined;
    return generateValidPlan(prompt, context, this.missionId, async (request: PlannerCompletionRequest) => {
      const result = await this.executePromptTask(agentId, {
        taskId: `${this.missionId}:planner${this.missionRetryCount > 0 ? `:retry-${this.missionRetryCount}` : ''}:attempt-${request.attempt}`,
        type: 'planning',
        prompt: request.prompt,
        phaseId: 'planning',
        context: {
          plannerAttempt: request.attempt,
          ...(request.routingSessionId
            ? { [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: request.routingSessionId }
            : {}),
        },
        executionPolicy: PLANNER_EXECUTION_POLICY,
      });
      responseRequestId = result.requestId;
      return result.output;
    }, async (reason) => {
      await this.reportBrainComplaint(
        responseRequestId,
        `Mission planner validation failed: ${reason}`,
      );
    }, onProgress);
  }

  async selectNextTask(
    missionGoal: string,
    plan: Plan,
    phase: Phase,
    completedTaskIds: string[],
    completedTaskSummaries: CompletedTaskSummary[] = [],
  ): Promise<Task> {
    const completed = new Set(completedTaskIds);
    const readyTasks = phase.tasks.filter((task) =>
      !completed.has(task.id)
      && (task.dependsOnTaskIds || []).every((dependencyId) => completed.has(dependencyId)),
    );
    if (readyTasks.length === 0) {
      throw new Error(`Mission task selector found no ready tasks in phase ${phase.id}`);
    }

    const completedInPhase = phase.tasks.filter((task) => completed.has(task.id)).length;
    const selectionIndex = completedInPhase + 1;
    const routingSessionId = `${this.missionId}:task-selection:${phase.id}:${selectionIndex}`;
    const agentId = await this.getOrCreateAgent('mission-director', TASK_SELECTOR_SYSTEM_PROMPT);
    const selectionContext = JSON.stringify({
      missionGoal,
      planSummary: plan.summary,
      phase: { id: phase.id, name: phase.name, goal: phase.goal },
      completedTaskIds,
      completedTaskSummaries: completedTaskSummaries.slice(-10).map((summary) => ({
        taskId: summary.taskId,
        output: summary.output.slice(0, 1_200),
        artifactNames: summary.artifactNames.slice(0, 20),
        artifacts: (summary.artifacts || []).map((a: any) => ({ name: a.name, type: a.type, content: (a.content || '').split(/\n\s*\n/)[0].split(/\s+/).slice(0, 100).join(' ') })),
      })),
      readyTasks: readyTasks.map(({ id, title, description, agentRole }) => ({
        id,
        title,
        description,
        agentRole,
      })),
    });
    let previousResponse = '';
    let validationIssue = '';

    for (let attempt = 1; attempt <= MAX_TASK_SELECTION_ATTEMPTS; attempt++) {
      const repair = attempt === 1
        ? ''
        : `\n\nYour previous response was rejected: ${validationIssue}\nPrevious response: ${previousResponse.slice(0, 2_000)}\nReturn a corrected JSON object selecting one of the currently ready task IDs.`;
      let output: string;
      let responseRequestId: string | undefined;
      try {
        const result = await this.executePromptTask(agentId, {
          taskId: `${this.missionId}:${phase.id}:selector-${selectionIndex}:attempt-${attempt}`,
          type: 'task-selection',
          prompt: `Select the next task for this mission phase.\n\n${selectionContext}${repair}`,
          phaseId: phase.id,
          context: {
            selectionAttempt: attempt,
            [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: routingSessionId,
          },
          executionPolicy: TASK_SELECTOR_EXECUTION_POLICY,
        });
        output = result.output;
        responseRequestId = result.requestId;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
          throw new Error(`Unable to select the next task in phase ${phase.id}: Brain exhausted every eligible model. ${message}`);
        }
        if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) {
          throw new Error(
            `Brain routing did not complete task selection in phase ${phase.id}; the Agent Runtime already exhausted its in-task routing retries. ${message}`,
          );
        }
        throw new Error(`Mission task selection failed in phase ${phase.id}: ${message}`);
      }

      previousResponse = output;
      try {
        const normalized = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const parsed = JSON.parse(normalized) as { taskId?: unknown };
        const selectedTask = typeof parsed.taskId === 'string'
          ? readyTasks.find((task) => task.id === parsed.taskId)
          : undefined;
        if (selectedTask) return selectedTask;
        validationIssue = 'taskId must identify one of the ready tasks provided';
      } catch (error) {
        validationIssue = `response must be valid JSON: ${error instanceof Error ? error.message : String(error)}`;
      }
      await this.reportBrainComplaint(
        responseRequestId,
        `Mission task-selection validation failed: ${validationIssue}`,
      );
    }
    throw new Error(
      `Mission task selection could not return a ready task after ${MAX_TASK_SELECTION_ATTEMPTS} attempts. Last validation issue: ${validationIssue}`,
    );
  }

  async reviewPhase(
    missionGoal: string,
    plan: Plan,
    phase: Phase,
    completedTaskSummaries: CompletedTaskSummary[],
    reviewIndex: number,
  ): Promise<MissionPhaseReview> {
    const retryScope = this.missionRetryCount > 0 ? `:retry-${this.missionRetryCount}` : '';
    const routingSessionId = `${this.missionId}:phase-review:${phase.id}:${reviewIndex}${retryScope}`;
    const agentId = await this.getOrCreateAgent('phase-reviewer', PHASE_REVIEW_SYSTEM_PROMPT);
    const reviewContext = JSON.stringify({
      missionGoal,
      planSummary: plan.summary,
      phase: { id: phase.id, name: phase.name, goal: phase.goal },
      tasks: phase.tasks.map(({ id, title, description, expectedArtifacts, requiredActions }) => ({
        id,
        title,
        description,
        expectedArtifacts,
        requiredActions: requiredActions || [],
      })),
      completedTaskSummaries: completedTaskSummaries.map((summary) => ({
        taskId: summary.taskId,
        output: summary.output.slice(0, 1_200),
        artifactNames: summary.artifactNames,
        artifacts: (summary.artifacts || []).map((a: any) => ({ name: a.name, type: a.type, content: (a.content || '').split(/\n\s*\n/)[0].split(/\s+/).slice(0, 100).join(' ') })),
        requiredActions: summary.requiredActions || [],
      })),
    });
    let previousResponse = '';
    let validationIssue = '';

    for (let attempt = 1; attempt <= MAX_PHASE_REVIEW_ATTEMPTS; attempt++) {
      const repair = attempt === 1
        ? ''
        : `\n\nYour previous review was rejected: ${validationIssue}\nPrevious response: ${previousResponse.slice(0, 2_000)}\nReturn exactly one JSON object with either {"satisfied":true,"gaps":[],"followUpTask":null} or {"satisfied":false,"gaps":["concrete gap"],"followUpTask":{"title":"...","description":"...","agentRole":"...","systemPrompt":"...","expectedArtifacts":[],"requiredActions":[]}}. Never repeat a successfully completed side-effect action or change a requested identifier. For a verification gap, propose a safe read-only verification task. Its systemPrompt must name each prerequisite task ID and identify the specific output, artifact, or receipt it consumes. Do not include a plan, tool action, metadata, explanation, or Markdown fence.`;
      let output: string;
      let responseRequestId: string | undefined;
      try {
        const result = await this.executePromptTask(agentId, {
          taskId: `${this.missionId}:${phase.id}:review-${reviewIndex}${retryScope}:attempt-${attempt}`,
          type: 'phase-review',
          prompt: `Review whether this phase's work satisfies its goal. Judge only actual task outputs and artifacts, not plans or proposed tool actions. Return exactly one JSON object using the required phase-review shape; do not include task metadata, a plan, tool actions, explanations, or Markdown fences.\n\n${reviewContext}${repair}`,
          phaseId: phase.id,
          context: {
            reviewAttempt: attempt,
            [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: routingSessionId,
          },
          executionPolicy: PHASE_REVIEW_EXECUTION_POLICY,
        });
        output = result.output;
        responseRequestId = result.requestId;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
          throw new Error(`Unable to review phase ${phase.id}: Brain exhausted every eligible model. ${message}`);
        }
        if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) {
          throw new Error(
            `Brain routing did not complete phase review for ${phase.id}; the Agent Runtime already exhausted its in-task routing retries. ${message}`,
          );
        }
        throw new Error(`Mission phase review failed for ${phase.id}: ${message}`);
      }

      previousResponse = output;
      let value: unknown;
      try {
        const normalized = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        value = JSON.parse(normalized);
      } catch (error) {
        validationIssue = `response must be valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        validationIssue = 'response must be a JSON object';
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      const review = value as Record<string, unknown>;
      if (
        typeof review.satisfied !== 'boolean'
        || !Array.isArray(review.gaps)
        || !review.gaps.every((gap) => typeof gap === 'string')
      ) {
        validationIssue = 'satisfied must be boolean and gaps must be a string array';
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      if (review.satisfied) {
        if (review.followUpTask !== null && review.followUpTask !== undefined) {
          validationIssue = 'followUpTask must be null when satisfied is true';
          await this.reportBrainComplaint(
            responseRequestId,
            `Mission phase-review validation failed: ${validationIssue}`,
          );
          continue;
        }
        return { satisfied: true, gaps: review.gaps as string[] };
      }

      const followUpTask = review.followUpTask;
      if (!followUpTask || typeof followUpTask !== 'object' || Array.isArray(followUpTask)) {
        validationIssue = 'followUpTask must be supplied when the phase is incomplete';
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      const proposal = followUpTask as Record<string, unknown>;
      if (
        !['title', 'description', 'agentRole', 'systemPrompt'].every((key) =>
          typeof proposal[key] === 'string' && (proposal[key] as string).trim().length > 0,
        )
        || !Array.isArray(proposal.expectedArtifacts)
        || !proposal.expectedArtifacts.every((artifact) =>
          typeof artifact === 'string' && artifact.trim().length > 0 && artifact.length <= 200,
        )
        || !Array.isArray(proposal.requiredActions)
        || !proposal.requiredActions.every((action) =>
          action !== null
          && typeof action === 'object'
          && !Array.isArray(action)
          && typeof (action as Record<string, unknown>).toolId === 'string'
          && ((action as Record<string, unknown>).toolId as string).trim().length > 0
          && ['success', 'failure', 'denied'].includes(String((action as Record<string, unknown>).outcome)),
        )
      ) {
        validationIssue = 'followUpTask must contain non-empty title, description, agentRole, systemPrompt, expectedArtifacts, and valid requiredActions';
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      const proposedActionIssues = missionTaskActionIssues({
        systemPrompt: proposal.systemPrompt as string,
        requiredActions: proposal.requiredActions as NonNullable<Task['requiredActions']>,
      }, `followUpTask "${(proposal.title as string).trim()}"`);
      if (proposedActionIssues.length > 0) {
        validationIssue = `followUpTask action contract is invalid: ${proposedActionIssues.join('; ')}`;
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      const candidateReview: MissionPhaseReview = {
        satisfied: false,
        gaps: review.gaps as string[],
        followUpTask: {
          title: (proposal.title as string).trim(),
          description: (proposal.description as string).trim(),
          agentRole: (proposal.agentRole as string).trim(),
          systemPrompt: (proposal.systemPrompt as string).trim(),
          expectedArtifacts: (proposal.expectedArtifacts as string[]).map((artifact) => artifact.trim()),
          requiredActions: proposal.requiredActions as NonNullable<Task['requiredActions']>,
        },
      };
      try {
        const applied = applyPhaseReview(plan, phase.id, candidateReview);
        if (!applied.amendment) {
          validationIssue = applied.gaps.slice(candidateReview.gaps.length).join('; ')
            || 'followUpTask must add a new, actionable task';
          await this.reportBrainComplaint(
            responseRequestId,
            `Mission phase-review validation failed: ${validationIssue}`,
          );
          continue;
        }
      } catch (error) {
        validationIssue = error instanceof Error ? error.message : String(error);
        await this.reportBrainComplaint(
          responseRequestId,
          `Mission phase-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      return candidateReview;
    }
    throw new Error(
      `Mission phase review for ${phase.id} did not return a valid review after ${MAX_PHASE_REVIEW_ATTEMPTS} attempts. Last validation issue: ${validationIssue}`,
    );
  }

  async reviewMissionCompletion(
    missionGoal: string,
    planSummary: string,
    completedTaskSummaries: CompletedTaskSummary[],
  ): Promise<{ satisfied: boolean; gaps: string[] }> {
    const routingSessionId = `${this.missionId}:completion-review`;
    const agentId = await this.getOrCreateAgent(
      'mission-evaluator',
      MISSION_COMPLETION_REVIEWER_SYSTEM_PROMPT,
    );
    const reviewContext = JSON.stringify({
      missionGoal,
      planSummary,
      completedTaskSummaries,
    });
    let previousResponse = '';
    let validationIssue = '';

    for (let attempt = 1; attempt <= MAX_COMPLETION_REVIEW_ATTEMPTS; attempt++) {
      const repair = attempt === 1
        ? ''
        : `\n\nYour previous response was rejected: ${validationIssue}\nPrevious response: ${previousResponse.slice(0, 2_000)}\nIf incomplete, each gap must name a task ID, the unmet requirement, and the observed evidence explaining why it is unmet. Do not return generic gap text. Return exactly {"satisfied":true,"gaps":[]} or {"satisfied":false,"gaps":["task-specific explanation"]} as one JSON object.`;
      const retryScope = this.missionRetryCount > 0 ? `:retry-${this.missionRetryCount}` : '';
      let result: TaskExecutionResult;
      try {
        result = await this.executePromptTask(agentId, {
          taskId: `${this.missionId}:review:completion${retryScope}:attempt-${attempt}`,
          type: 'mission-completion-review',
          prompt: `Evaluate whether these observed mission results satisfy the mission goal. Check actual results and action receipts; failed receipts are not evidence of successful work, and claims that contradict receipts are unmet requirements. Return exactly one JSON object with the required completion-review shape.\n\n${reviewContext}${repair}`,
          phaseId: 'mission-review',
          context: {
            reviewAttempt: attempt,
            [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: routingSessionId,
          },
          executionPolicy: MISSION_COMPLETION_REVIEW_EXECUTION_POLICY,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
          return { satisfied: false, gaps: [`Unable to review mission completion: Brain exhausted every eligible model. ${message}`] };
        }
        if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) {
          return {
            satisfied: false,
            gaps: [`Brain routing did not complete mission review; the Agent Runtime already exhausted its in-task routing retries. ${message}`],
          };
        }
        return { satisfied: false, gaps: [`Mission completion review failed: ${message}`] };
      }

      previousResponse = result.output;
      let value: unknown;
      try {
        const normalized = result.output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        value = JSON.parse(normalized);
      } catch (error) {
        validationIssue = `response must be valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        await this.reportBrainComplaint(
          result.requestId,
          `Mission completion-review validation failed: ${validationIssue}`,
        );
        continue;
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        validationIssue = 'response must be a JSON object';
        await this.reportBrainComplaint(
          result.requestId,
          `Mission completion-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      const review = value as Record<string, unknown>;
      if (
        typeof review.satisfied !== 'boolean'
        || !Array.isArray(review.gaps)
        || !review.gaps.every((gap) => typeof gap === 'string' && gap.trim())
        || (review.satisfied && review.gaps.length > 0)
        || (!review.satisfied && review.gaps.length === 0)
      ) {
        validationIssue = 'satisfied must be boolean with no gaps when true, or at least one concrete string gap when false';
        await this.reportBrainComplaint(
          result.requestId,
          `Mission completion-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      if (
        !review.satisfied
        && (review.gaps as string[]).some((gap) => !completedTaskSummaries.some((summary) =>
          gap.toLocaleLowerCase().includes(summary.taskId.toLocaleLowerCase()),
        ))
      ) {
        validationIssue = 'each unmet requirement must identify the exact task ID and cite its evidence';
        await this.reportBrainComplaint(
          result.requestId,
          `Mission completion-review validation failed: ${validationIssue}`,
        );
        continue;
      }
      return { satisfied: review.satisfied, gaps: review.gaps as string[] };
    }
    const taskEvidence = completedTaskSummaries
      .map((summary) => `${summary.taskId} (${summary.expectedArtifacts?.join(', ') || summary.artifactNames.join(', ') || 'no named deliverable'})`)
      .join('; ');
    return {
      satisfied: false,
      gaps: [
        `Mission completion could not be verified: the reviewer did not identify a task-specific unmet requirement after ${MAX_COMPLETION_REVIEW_ATTEMPTS} attempts. Check task evidence: ${taskEvidence || 'no completed task evidence was available'}.`,
      ],
    };
  }

  async getOrCreateAgent(agentRole: string, systemPrompt: string): Promise<string> {
    const roleLabel = missionAgentRoleLabel(agentRole);
    const cacheKey = missionAgentRoleKey(agentRole);
    if (this.agentCache.has(cacheKey)) {
      return this.agentCache.get(cacheKey)!;
    }

    const retryScope = cacheKey === 'mission-evaluator' && this.missionRetryCount > 0
      ? `-retry-${this.missionRetryCount}`
      : '';
    const agentId = `agent-${this.missionId}-${cacheKey}${retryScope}`;
    try {
      const existing = await this.api<AgentDefinition>(
        this.missionAgentPath(agentId)
      );
      if (existing.id) {
        this.assertToolAccess(existing, agentRole);
        await this.api(this.missionAgentPath(agentId, 'start'), { method: 'POST' });
        this.agentCache.set(cacheKey, agentId);
        return agentId;
      }
    } catch (error) {
      if (!(error instanceof MissionAgentRuntimeApiError) || error.status !== 404) {
        throw error;
      }
    }

    try {
      const agents = extractMissionAgents(await this.api<unknown>(this.missionAgentsPath()));
      const existingAlias = agents.find((agent) => {
        const roleValues = [
          agent.metadata.agentRole,
          agent.type,
          agent.name,
        ].filter((value): value is string => typeof value === 'string');
        return roleValues.some((role) => missionAgentRoleKey(role) === cacheKey);
      });
      if (existingAlias) {
        this.assertToolAccess(existingAlias, agentRole);
        await this.api(this.missionAgentPath(existingAlias.id, 'start'), { method: 'POST' });
        this.agentCache.set(cacheKey, existingAlias.id);
        return existingAlias.id;
      }
    } catch (error) {
      if (!(error instanceof MissionAgentRuntimeApiError) || error.status !== 404) {
        throw error;
      }
    }

    const toolAccess = this.resolveToolAccess(agentRole);
    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: `${roleLabel} Agent`,
      description: `Dynamic agent for role: ${roleLabel} in mission ${this.missionId}`,
      type: roleLabel,
      systemPrompt,
      tools: toolAccess.tools,
      ...(toolAccess.policy ? { toolPolicy: toolAccess.policy } : {}),
      metadata: {
        missionId: this.missionId,
        agentRole: roleLabel,
        ...(this.entityId ? { entityId: this.entityId } : {}),
        ...(this.assistantId ? { assistantId: this.assistantId } : {}),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.api(this.missionAgentsPath(), { method: 'POST', body: JSON.stringify(definition) });
    await this.api(this.missionAgentPath(agentId, 'start'), { method: 'POST' });
    this.agentCache.set(cacheKey, agentId);
    return agentId;
  }

  getAgentIdForRole(agentRole: string): string {
    const cacheKey = missionAgentRoleKey(agentRole);
    return this.agentCache.get(cacheKey) || `agent-${this.missionId}-${cacheKey}`;
  }

  private resolveToolAccess(agentRole: string): { tools: string[]; policy?: AgentToolPolicy } {
    const key = agentRole.trim().toLowerCase();
    const canonicalKey = missionAgentRoleKey(agentRole);
    const grant = this.agentToolPolicies.get(key)
      || this.agentToolPolicies.get(canonicalKey)
      || this.agentToolPolicies.get('*');
    if (!grant) return { tools: [] };
    return {
      tools: grant.mode === 'allowlist' ? [...(grant.tools || [])] : [],
      policy: { mode: grant.mode },
    };
  }

  private assertToolAccess(agent: AgentDefinition, role: string): void {
    const expected = this.resolveToolAccess(role);
    const existingMode = agent.toolPolicy?.mode || 'all';
    const expectedMode = expected.policy?.mode || 'all';
    const existingTools = [...agent.tools].sort();
    const expectedTools = [...expected.tools].sort();
    if (
      existingMode !== expectedMode
      || existingTools.length !== expectedTools.length
      || existingTools.some((tool, index) => tool !== expectedTools[index])
    ) {
      throw new Error(
        `Persisted mission Agent ${agent.id} has a tool policy that differs from metadata.agentToolPolicies`,
      );
    }
  }

  async executeTask(
    agentId: string,
    task: Task,
    phase: Phase,
    plan: Plan,
    requireCompletedReceipt = false,
    executionPolicy?: AgentExecutionPolicy,
    completedTaskSummaries: CompletedTaskSummary[] = [],
    retryGuidance?: string,
    continuation?: { response: string; pendingInteraction: MissionPendingInteraction },
  ): Promise<TaskExecutionResult> {
    const dependencyIds = task.dependsOnTaskIds || [];
    const completedById = new Map(completedTaskSummaries.map((summary) => [summary.taskId, summary]));
    const completedDependencies: CompletedTaskSummary[] = [];
    const missingDependencies: string[] = [];
    for (const dependencyId of dependencyIds) {
      const summary = completedById.get(dependencyId);
      if (summary) completedDependencies.push(summary);
      else missingDependencies.push(dependencyId);
    }
    if (missingDependencies.length > 0) {
      throw new Error(
        `Cannot execute task "${task.id}": completed dependency results are missing for: ${missingDependencies.join(', ')}`,
      );
    }
    const basePrompt = this.buildTaskPrompt(task, phase, plan, completedDependencies);
    const continuationPrompt = continuation
      ? [
        `This task is resuming after a ${continuation.pendingInteraction.kind === 'user_input' ? 'user question' : 'tool permission'} interruption.`,
        `The user's response or permission decision is: ${continuation.response}`,
        continuation.pendingInteraction.actionReceipts?.length
          ? `Verified action receipts from before the interruption (do not repeat successful or uncertain side effects): ${JSON.stringify(continuation.pendingInteraction.actionReceipts)}`
          : '',
        'Continue the same task from this evidence. Do not repeat completed actions.',
      ].filter(Boolean).join('\n')
      : '';
    const taskPrompt = [
      basePrompt,
      ...(retryGuidance ? [`Retry guidance for remaining work:\n${retryGuidance}`] : []),
      ...(continuationPrompt ? [continuationPrompt] : []),
    ].join('\n\n');
    return this.executePromptTask(agentId, {
      taskId: continuation
        ? `${this.missionId}:${phase.id}:${task.id}:resume-${continuation.pendingInteraction.resumeCount + 1}`
        : `${this.missionId}:${phase.id}:${task.id}`,
      type: task.agentRole,
      prompt: taskPrompt,
      phaseId: phase.id,
      expectedArtifacts: task.expectedArtifacts,
      requiredActions: task.requiredActions || [],
      context: {
        [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: `${this.missionId}:task:${phase.id}:${task.id}`,
        ...(continuation?.pendingInteraction.actionReceipts
          ? { priorActionReceipts: continuation.pendingInteraction.actionReceipts }
          : {}),
      },
      requireCompletedReceipt,
      executionPolicy,
      retryGuidance,
    });
  }

  async executePromptTask(agentId: string, request: PromptTaskRequest): Promise<TaskExecutionResult> {
    const taskData = {
      taskId: request.taskId,
      type: request.type,
      input: {
        prompt: request.prompt,
        context: {
          ...request.context,
          missionId: this.missionId,
          ...(request.phaseId ? { phaseId: request.phaseId } : {}),
          taskId: request.taskId,
          expectedArtifacts: request.expectedArtifacts || [],
          requiredActions: request.requiredActions || [],
          ...(request.executionPolicy ? { executionPolicy: request.executionPolicy } : {}),
        },
      },
      priority: 1,
      status: 'pending',
    };

    const submitted = await this.api<AgentTask>(
      this.missionAgentPath(agentId, 'tasks'),
      { method: 'POST', body: JSON.stringify(taskData) }
    );

    const executePath = this.missionAgentPath(agentId, 'tasks', submitted.taskId, 'execute');
    let completed: AgentTask | undefined;
    let recoveredResult: TaskExecutionResult | undefined;
    for (let retry = 0; retry <= MAX_SAFE_AGENT_TASK_RETRIES; retry++) {
      try {
        completed = await this.api<AgentTask>(executePath, {
          method: 'POST',
          body: JSON.stringify({
            requireCompletedReceipt: request.requireCompletedReceipt || false,
            ...(request.retryGuidance ? { retryGuidance: request.retryGuidance } : {}),
          }),
        });
        break;
      } catch (error) {
        if (
          error instanceof MissionAgentRuntimeApiError
          && error.path === executePath
          && error.status === 500
          && error.message.includes('is already running')
        ) {
          logger.warn(
            { missionId: this.missionId, agentId, taskId: submitted.taskId },
            'Agent task is already running; waiting for its persisted result instead of executing it again',
          );
          recoveredResult = await this.waitForTaskCompletion(agentId, submitted.taskId);
          break;
        }
        if (
          retry >= MAX_SAFE_AGENT_TASK_RETRIES
          || !(error instanceof MissionAgentRuntimeApiError)
          || error.path !== executePath
          || error.status < 500
        ) {
          throw error;
        }
        logger.warn(
          { missionId: this.missionId, agentId, taskId: submitted.taskId, status: error.status },
          'Retrying failed Agent task once from its persisted checkpoint',
        );
      }
    }
    if (recoveredResult) {
      const interruption = this.parseInterruption(recoveredResult.output);
      return interruption ? { ...recoveredResult, interruption } : recoveredResult;
    }
    if (!completed) throw new Error(`Agent task ${submitted.taskId} returned no execution response`);
    if (completed.status !== 'completed') {
      throw new Error(completed.error || `Agent task ${submitted.taskId} returned status '${completed.status}'`);
    }
    const result = completed.result as Partial<TaskExecutionResult> | undefined;
    const output = typeof result?.output === 'string' ? result.output : '';
    const model = result?.model;
    const provider = result?.provider;
    const requestId = result?.requestId;
    const reasoning = typeof result?.reasoning === 'string' && result.reasoning.trim().length > 0
      ? result.reasoning
      : undefined;

    const interruption = this.parseInterruption(output);
    if (interruption) {
      return {
        output,
        artifacts: [],
        actionReceipts: this.parseActionReceipts(result?.actionReceipts, submitted.taskId),
        interruption,
        tokensUsed: 0,
        model,
        provider,
        requestId,
        reasoning,
      }
    }

    const expectedArtifacts = request.expectedArtifacts || [];
    const artifacts = this.parseArtifacts(result?.artifacts, output, expectedArtifacts, submitted.taskId);
    this.assertExpectedArtifacts(artifacts, expectedArtifacts, submitted.taskId);
    const actionReceipts = this.parseActionReceipts(result?.actionReceipts, submitted.taskId);
    const tokensUsed = typeof result?.tokensUsed === 'number' ? result.tokensUsed : 0;
    if (reasoning && this.broadcast) {
      await this.broadcast({
        type: 'monologue',
        missionId: this.missionId,
        timestamp: Date.now(),
        data: { agentId, taskId: submitted.taskId, phaseId: request.phaseId, thought: reasoning, text: reasoning },
      });
    }
    return {
      output,
      artifacts: this.withActionReceiptArtifact(artifacts, actionReceipts, submitted.taskId),
      actionReceipts,
      tokensUsed,
      model,
      provider,
      requestId,
      reasoning,
    };
  }

  private parseInterruption(
    output: string,
  ): TaskExecutionResult['interruption'] | undefined {
    if (output.startsWith(ASK_USER_MARKER)) {
      const payload = output.slice(ASK_USER_MARKER.length);
      let question = payload;
      let credentialRequest: MissionCredentialRequest | undefined;
      try {
        const parsed = JSON.parse(payload) as { question?: unknown; credentialRequest?: unknown };
        if (typeof parsed.question === 'string') question = parsed.question;
        if (parsed.credentialRequest && typeof parsed.credentialRequest === 'object' && !Array.isArray(parsed.credentialRequest)) {
          const candidate = parsed.credentialRequest as Record<string, unknown>;
          const missingCredentials = Array.isArray(candidate.missingCredentials)
            ? candidate.missingCredentials.filter((credential): credential is { key: string; label: string } =>
              Boolean(credential)
              && typeof credential === 'object'
              && !Array.isArray(credential)
              && typeof (credential as Record<string, unknown>).key === 'string'
              && typeof (credential as Record<string, unknown>).label === 'string',
            )
            : [];
          if (
            typeof candidate.executionId === 'string'
            && typeof candidate.toolId === 'string'
            && typeof candidate.toolName === 'string'
            && missingCredentials.length > 0
          ) {
            credentialRequest = {
              executionId: candidate.executionId,
              toolId: candidate.toolId,
              toolName: candidate.toolName,
              missingCredentials,
            };
          }
        }
      } catch {
        // Plain-text question markers remain supported.
      }
      if (!question.trim()) throw new Error('Agent asked the user an empty question');
      return {
        kind: 'user_input',
        question: question.trim(),
        ...(credentialRequest ? { credentialRequest } : {}),
      };
    }

    const permissionMarker = '__MISSION_PERMISSION__:';
    if (!output.startsWith(permissionMarker)) return undefined;
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(output.slice(permissionMarker.length)) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid permission request');
      }
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Agent returned an invalid MCP permission request: ${error instanceof Error ? error.message : String(error)}`);
    }
    const request = payload.request && typeof payload.request === 'object'
      ? payload.request as Record<string, unknown>
      : {};
    const candidate = payload.candidate && typeof payload.candidate === 'object'
      ? payload.candidate as Record<string, unknown>
      : request.candidate && typeof request.candidate === 'object'
        ? request.candidate as Record<string, unknown>
        : {};
    const requestId = typeof request.id === 'string' ? request.id : '';
    const asStrings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    if (!requestId || typeof candidate.name !== 'string') {
      throw new Error('Agent returned an MCP permission request without a request id or tool name');
    }
    const credentials = request.credentials && typeof request.credentials === 'object'
      ? request.credentials as Record<string, unknown>
      : {};
    const expiration = request.expiresAt;
    const expiresAt = typeof expiration === 'string' && Number.isFinite(Date.parse(expiration))
      ? new Date(expiration).toISOString()
      : undefined;
    const permission = {
      toolName: candidate.name,
      ...(typeof candidate.description === 'string' ? { toolDescription: candidate.description } : {}),
      ...(typeof candidate.publisher === 'string' ? { publisher: candidate.publisher } : {}),
      ...(typeof candidate.tier === 'string' ? { trustTier: candidate.tier } : {}),
      ...(typeof request.sideEffectClass === 'string' ? { sideEffectClass: request.sideEffectClass } : {}),
      dataClasses: asStrings(request.dataClasses),
      credentials: {
        needed: credentials.needed === true,
        ...(typeof credentials.source === 'string' ? { source: credentials.source } : {}),
        keys: asStrings(credentials.keys),
      },
      defaultScope: typeof request.defaultScope === 'string' ? request.defaultScope : 'task',
      availableScopes: asStrings(request.availableScopes),
      ...(expiresAt ? { expiresAt } : {}),
      explanation: typeof payload.prompt === 'string' ? payload.prompt : 'This discovered MCP tool requires your permission before it can be used.',
    };
    return { kind: 'mcp_permission', requestId, permission };
  }

  private async markTaskCompleted(taskId: string, result: unknown): Promise<void> {
    try {
      const agentId = this.taskAgentMap.get(taskId);
      if (!agentId) {
        logger.warn({ taskId }, 'No agent found for task, cannot mark completed');
        return;
      }
      await this.api(
        this.missionAgentPath(agentId, 'tasks', taskId, 'complete'),
        { method: 'POST', body: JSON.stringify({ result }) }
      );
    } catch (err) {
      logger.warn({ taskId, err: err instanceof Error ? err.message : String(err) }, 'Failed to mark task completed in agent-runtime');
    }
  }

  private async markTaskFailed(taskId: string, error: string): Promise<void> {
    try {
      const agentId = this.taskAgentMap.get(taskId);
      if (!agentId) {
        logger.warn({ taskId }, 'No agent found for task, cannot mark failed');
        return;
      }
      await this.api(
        this.missionAgentPath(agentId, 'tasks', taskId, 'fail'),
        { method: 'POST', body: JSON.stringify({ error }) }
      );
    } catch (err) {
      logger.warn({ taskId, err: err instanceof Error ? err.message : String(err) }, 'Failed to mark task failed in agent-runtime');
    }
  }

  private buildTaskPrompt(
    task: Task,
    phase: Phase,
    plan: Plan,
    completedDependencies: CompletedTaskSummary[],
  ): string {
    const artifactOutputContract = task.expectedArtifacts.length > 0
      ? `Report verified results for each expected artifact (${task.expectedArtifacts.join(', ')}). Include each artifact's actual result under a clear heading using its exact name. If the work cannot be completed with available tools or context, state the specific blocker instead — do not fabricate results or claim actions that were not executed.`
      : 'Return only the verified result for this task. Unless the user requested a formatted document, use plain text without Markdown headings, lists, or code fences. For email and text-message tasks, report the exact requested message and verified delivery status; do not invent samples or placeholders.';
    return (
      `Task: ${task.title}\n\n` +
      `Description: ${task.description}\n\n` +
      `Task Instructions: ${task.systemPrompt}\n\n` +
      (completedDependencies.length > 0
        ? `Completed dependency results (authoritative persisted outputs and artifacts; do not infer results from task IDs): ${JSON.stringify(completedDependencies)}\n\n`
        : '') +
      `Phase: ${phase.name} (${phase.goal})\n` +
      `Plan Summary: ${plan.summary}\n` +
      `Expected Artifacts: ${task.expectedArtifacts.join(', ')}\n` +
      `Required Actions: ${JSON.stringify(task.requiredActions || [])}\n` +
      `Output contract: ${artifactOutputContract} Use only actual system-tool results and completed dependency results; do not infer values or include results from future mission steps.\n\n` +
      'Execute this task now and return completed results for its expected artifacts. Do not return a plan, future-tense promises, or placeholders. If the work cannot be completed with available tools or context, state the specific blocker instead.'
    );
  }

  private async waitForTaskCompletion(agentId: string, taskId: string, maxWaitMs = 900000): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollInterval));
      let task: AgentTask;
      try {
        task = await this.api<AgentTask>(this.missionAgentPath(agentId, 'tasks', taskId));
      } catch (err) {
        if (!(err instanceof MissionAgentRuntimeApiError) || err.status < 500) throw err;
        logger.warn(
          { missionId: this.missionId, agentId, taskId, status: err.status },
          'Agent task status polling failed; retrying after a transient API error',
        );
        continue;
      }
      if (task.status === 'completed') return this.parseTaskResult(task);
      if (task.status === 'failed') {
        throw new Error(task.error || `Agent task ${taskId} failed`);
      }
    }
    throw new Error(`Task ${taskId} timed out after ${maxWaitMs}ms`);
  }

  private parseTaskResult(task: AgentTask): TaskExecutionResult {
    const result = task.result as { output?: unknown; artifacts?: unknown; actionReceipts?: unknown; tokensUsed?: unknown; model?: unknown; provider?: unknown; requestId?: unknown; reasoning?: unknown } | null;
    const output = String(result?.output || JSON.stringify(result || {}));
    const input = task.input && typeof task.input === 'object' && !Array.isArray(task.input)
      ? task.input as Record<string, unknown>
      : {};
    const context = input.context && typeof input.context === 'object' && !Array.isArray(input.context)
      ? input.context as Record<string, unknown>
      : {};
    const expectedArtifacts = this.parseExpectedArtifacts(context.expectedArtifacts, task.taskId);
    const artifacts = this.parseArtifacts(result?.artifacts, output, expectedArtifacts, task.taskId);
    this.assertExpectedArtifacts(artifacts, expectedArtifacts, task.taskId);
    const actionReceipts = this.parseActionReceipts(result?.actionReceipts, task.taskId);
    const tokensUsed = result?.tokensUsed || 0;
    const model = result?.model;
    const provider = result?.provider;
    const requestId = result?.requestId;
    const reasoning = typeof result?.reasoning === 'string' && result.reasoning.trim().length > 0
      ? result.reasoning
      : undefined;
    if (reasoning && this.broadcast) {
      const agentId = this.taskAgentMap.get(task.taskId);
      const phaseId = typeof context.phaseId === 'string' ? context.phaseId : undefined;
      if (agentId) {
        this.broadcast({
          type: 'monologue',
          missionId: this.missionId,
          timestamp: Date.now(),
          data: { agentId, taskId: task.taskId, phaseId, thought: reasoning, text: reasoning },
        }).catch((e) => logger.warn({ err: e instanceof Error ? e.message : String(e), taskId: task.taskId }, 'Failed to broadcast monologue for recovered task result'));
      }
    }
    return {
      output,
      artifacts: this.withActionReceiptArtifact(artifacts, actionReceipts, task.taskId),
      actionReceipts,
      tokensUsed: Number(tokensUsed) || 0,
      model: model == null ? undefined : String(model),
      provider: provider == null ? undefined : String(provider),
      requestId: requestId == null ? undefined : String(requestId),
      reasoning,
    };
  }

  private parseExpectedArtifacts(value: unknown, taskId: string): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((name) => typeof name === 'string' && name.trim())) {
      throw new Error(`Agent task ${taskId} returned invalid expected artifact names`);
    }
    return value.filter((name) => name.toLocaleLowerCase() !== INTERNAL_ACTION_RECEIPT_ARTIFACT);
  }

  private parseArtifacts(
    value: unknown,
    output: string,
    expected: string[],
    taskId: string,
  ): MissionArtifact[] {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      return this.extractArtifacts(output, expected);
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

  private assertExpectedArtifacts(
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

  private parseActionReceipts(
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

  private withActionReceiptArtifact(
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

  private extractArtifacts(content: string, expected: string[]): MissionArtifact[] {
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
        type: this.inferType(section),
        content: section,
        purpose: 'deliverable',
        isDeliverable: true,
      });
    }
    return artifacts;
  }

  private inferType(content: string): string {
    if (/^\s*\{[\s\S]*\}/m.test(content) && /```json/.test(content)) return 'config';
    if (/^#\s+/m.test(content)) return 'document';
    if (/^\s*[-*]\s+/m.test(content)) return 'list';
    if (/\|.*\|/.test(content)) return 'table';
    return 'document';
  }

  async listAgents(): Promise<AgentDefinition[]> {
    return this.api<{ agents: AgentDefinition[] }>(`/missions/${this.missionId}/agents`).then((r) => r.agents);
  }

  async getAgentState(agentId: string): Promise<AgentState | undefined> {
    try {
      return await this.api<AgentState>(this.missionAgentPath(agentId, 'state'));
    } catch (error) {
      if (error instanceof MissionAgentRuntimeApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    try {
      await this.api(this.missionAgentPath(agentId, 'stop'), { method: 'POST' });
    } catch (error) {
      if (error instanceof MissionAgentRuntimeApiError && error.status === 404) return;
      throw error;
    }
  }

  async stopAllAgents(): Promise<void> {
    try {
      await this.api(`/missions/${this.missionId}/agents/stop-all`, { method: 'POST' });
      return;
    } catch (error) {
      // Fallback to stopping individually
    }
    try {
      const agents = await this.listAgents();
      await Promise.allSettled(agents.map((a) => this.stopAgent(a.id)));
    } catch (error) {
      // Best effort - don't fail mission completion if stopping agents fails
      logger.warn({ missionId: this.missionId, error: error instanceof Error ? error.message : String(error) }, 'Failed to stop agents');
    }
  }
}