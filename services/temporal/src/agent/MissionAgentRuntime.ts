import { logger } from '@stage7-nextgen/shared';
import {
  BRAIN_MODEL_SELECTION_EXHAUSTED,
  BRAIN_MODEL_SELECTION_RETRY,
  BRAIN_ROUTING_SESSION_CONTEXT_KEY,
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
  AgentExecutionPolicy,
  AgentToolPolicy,
  DEFAULT_AGENT_EXECUTION_POLICY,
} from '@stage7-nextgen/shared';
import { Plan, Phase, Task } from '@stage7-nextgen/shared';
import {
  PlannerCompletionRequest,
  PLANNER_EXECUTION_POLICY,
  PLANNER_SYSTEM_PROMPT,
  generateValidPlan,
} from '../planner/MissionPlanner';

const TASK_SELECTOR_SYSTEM_PROMPT = `You are the mission task selector. Select the single best next task from the supplied ready tasks, using the mission goal, phase goal, and completed task IDs. You may not select a task that is not listed as ready, add tasks, or change task instructions. Return only JSON in the form {"taskId":"<ready-task-id>"}.`;
const TASK_SELECTOR_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxBrainCalls: 1,
  maxActions: 0,
  maxCompletionTokens: 256,
  maxCompletionTokensPerCall: 256,
  maxDelegations: 0,
};
const PHASE_REVIEW_SYSTEM_PROMPT = `You are a critical phase reviewer. Compare completed task outputs and artifacts with the mission goal and phase goal. Do not mark a phase complete just because its tasks ran. If the phase goal is satisfied, return {"satisfied":true,"gaps":[],"followUpTask":null}. Otherwise identify concrete gaps and propose exactly one focused follow-up task that can address a gap, returning {"satisfied":false,"gaps":["..."],"followUpTask":{"title":"...","description":"...","agentRole":"...","systemPrompt":"...","expectedArtifacts":[]}}. Do not propose tasks that repeat completed work. Return only JSON.`;
const PHASE_REVIEW_EXECUTION_POLICY: AgentExecutionPolicy = {
  ...DEFAULT_AGENT_EXECUTION_POLICY,
  maxBrainCalls: 1,
  maxActions: 0,
  maxCompletionTokens: 1_024,
  maxCompletionTokensPerCall: 1_024,
  maxDelegations: 0,
};
const MAX_SAFE_AGENT_TASK_RETRIES = 1;

export interface MissionPhaseReview {
  satisfied: boolean;
  gaps: string[];
  followUpTask?: {
    title: string;
    description: string;
    agentRole: string;
    systemPrompt: string;
    expectedArtifacts: string[];
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
      === JSON.stringify(expectedArtifacts(followUpTask.expectedArtifacts)),
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
  const amendment: Task = {
    id: taskId,
    ...followUpTask,
    dependsOnTaskIds: phase.tasks.map((task) => task.id),
    status: 'pending',
    artifacts: [],
  };
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

export interface MissionAgentConfig {
  missionId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
  broadcast?: (event: any) => Promise<void>;
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
  artifacts: Array<{ name: string; type: string; content: string }>;
  tokensUsed: number;
}

export interface PromptTaskRequest {
  taskId: string;
  type: string;
  prompt: string;
  phaseId?: string;
  expectedArtifacts?: string[];
  context?: Record<string, unknown>;
  requireCompletedReceipt?: boolean;
  executionPolicy?: AgentExecutionPolicy;
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
  private agentCache: Map<string, string> = new Map(); // agentRole -> agentId
  private taskAgentMap: Map<string, string> = new Map(); // taskId -> agentId

  constructor(config: MissionAgentConfig) {
    this.missionId = config.missionId;
    this.tenantId = config.tenantId;
    this.agentRuntimeUrl = config.agentRuntimeUrl || getAgentRuntimeUrl();
    this.broadcast = config.broadcast || (async () => {});
    this.agentToolPolicies = parseMissionAgentToolPolicies(config.metadata?.agentToolPolicies);
  }

  private async api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.agentRuntimeUrl}/api/agent-runtime${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new MissionAgentRuntimeApiError(path, res.status, text);
    }
    return res.json() as Promise<T>;
  }

  async registerPlannerAgent(systemPrompt: string): Promise<string> {
    const agentId = `agent-${this.missionId}-planner`;
    if (this.agentCache.has('planner')) return this.agentCache.get('planner')!;

    try {
      const existing = await this.api<AgentDefinition>(`/missions/${this.missionId}/agents/${agentId}`);
      if (existing.id) {
        this.assertToolAccess(existing, 'planner');
        await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
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
    await this.api(`/missions/${this.missionId}/agents`, { method: 'POST', body: JSON.stringify(definition) });
    await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
    this.agentCache.set('planner', agentId);
    return agentId;
  }

  async generatePlan(prompt: string, context?: Record<string, unknown>): Promise<Plan> {
    const agentId = await this.registerPlannerAgent(PLANNER_SYSTEM_PROMPT);
    return generateValidPlan(prompt, context, this.missionId, async (request: PlannerCompletionRequest) => {
      const result = await this.executePromptTask(agentId, {
        taskId: `${this.missionId}:planner:attempt-${request.attempt}`,
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
      return result.output;
    });
  }

  async selectNextTask(
    missionGoal: string,
    plan: Plan,
    phase: Phase,
    completedTaskIds: string[],
    completedTaskSummaries: Array<{ taskId: string; output: string; artifactNames: string[] }> = [],
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

    for (let attempt = 1; ; attempt++) {
      const repair = attempt === 1
        ? ''
        : `\n\nYour previous response was rejected: ${validationIssue}\nPrevious response: ${previousResponse.slice(0, 2_000)}\nReturn a corrected JSON object selecting one of the currently ready task IDs.`;
      let output: string;
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
          throw new Error(`Unable to select the next task in phase ${phase.id}: Brain exhausted every eligible model. ${message}`);
        }
        if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) continue;
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
    }
  }

  async reviewPhase(
    missionGoal: string,
    plan: Plan,
    phase: Phase,
    completedTaskSummaries: Array<{ taskId: string; output: string; artifactNames: string[] }>,
    reviewIndex: number,
  ): Promise<MissionPhaseReview> {
    const routingSessionId = `${this.missionId}:phase-review:${phase.id}:${reviewIndex}`;
    const agentId = await this.getOrCreateAgent('phase-reviewer', PHASE_REVIEW_SYSTEM_PROMPT);
    const reviewContext = JSON.stringify({
      missionGoal,
      planSummary: plan.summary,
      phase: { id: phase.id, name: phase.name, goal: phase.goal },
      tasks: phase.tasks.map(({ id, title, description, expectedArtifacts }) => ({
        id,
        title,
        description,
        expectedArtifacts,
      })),
      completedTaskSummaries: completedTaskSummaries.map((summary) => ({
        taskId: summary.taskId,
        output: summary.output.slice(0, 1_200),
        artifactNames: summary.artifactNames,
      })),
    });
    let previousResponse = '';
    let validationIssue = '';

    for (let attempt = 1; ; attempt++) {
      const repair = attempt === 1
        ? ''
        : `\n\nYour previous review was rejected: ${validationIssue}\nPrevious response: ${previousResponse.slice(0, 2_000)}\nReturn a corrected JSON review.`;
      let output: string;
      try {
        const result = await this.executePromptTask(agentId, {
          taskId: `${this.missionId}:${phase.id}:review-${reviewIndex}:attempt-${attempt}`,
          type: 'phase-review',
          prompt: `Review whether this phase's work satisfies its goal.\n\n${reviewContext}${repair}`,
          phaseId: phase.id,
          context: {
            reviewAttempt: attempt,
            [BRAIN_ROUTING_SESSION_CONTEXT_KEY]: routingSessionId,
          },
          executionPolicy: PHASE_REVIEW_EXECUTION_POLICY,
        });
        output = result.output;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(BRAIN_MODEL_SELECTION_EXHAUSTED)) {
          throw new Error(`Unable to review phase ${phase.id}: Brain exhausted every eligible model. ${message}`);
        }
        if (message.includes(BRAIN_MODEL_SELECTION_RETRY)) continue;
        throw new Error(`Mission phase review failed for ${phase.id}: ${message}`);
      }

      previousResponse = output;
      let value: unknown;
      try {
        const normalized = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        value = JSON.parse(normalized);
      } catch (error) {
        validationIssue = `response must be valid JSON: ${error instanceof Error ? error.message : String(error)}`;
        continue;
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        validationIssue = 'response must be a JSON object';
        continue;
      }
      const review = value as Record<string, unknown>;
      if (
        typeof review.satisfied !== 'boolean'
        || !Array.isArray(review.gaps)
        || !review.gaps.every((gap) => typeof gap === 'string')
      ) {
        validationIssue = 'satisfied must be boolean and gaps must be a string array';
        continue;
      }
      if (review.satisfied) {
        if (review.followUpTask !== null && review.followUpTask !== undefined) {
          validationIssue = 'followUpTask must be null when satisfied is true';
          continue;
        }
        return { satisfied: true, gaps: review.gaps as string[] };
      }

      const followUpTask = review.followUpTask;
      if (!followUpTask || typeof followUpTask !== 'object' || Array.isArray(followUpTask)) {
        validationIssue = 'followUpTask must be supplied when the phase is incomplete';
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
      ) {
        validationIssue = 'followUpTask must contain non-empty title, description, agentRole, systemPrompt, and expectedArtifacts as non-empty strings no longer than 200 characters';
        continue;
      }
      return {
        satisfied: false,
        gaps: review.gaps as string[],
        followUpTask: {
          title: (proposal.title as string).trim(),
          description: (proposal.description as string).trim(),
          agentRole: (proposal.agentRole as string).trim(),
          systemPrompt: (proposal.systemPrompt as string).trim(),
          expectedArtifacts: (proposal.expectedArtifacts as string[]).map((artifact) => artifact.trim()),
        },
      };
    }
  }

  async getOrCreateAgent(agentRole: string, systemPrompt: string): Promise<string> {
    const cacheKey = agentRole.toLowerCase();
    if (this.agentCache.has(cacheKey)) {
      return this.agentCache.get(cacheKey)!;
    }

    const agentId = `agent-${this.missionId}-${cacheKey}`;
    try {
      const existing = await this.api<AgentDefinition>(
        `/missions/${this.missionId}/agents/${agentId}`
      );
      if (existing.id) {
        this.assertToolAccess(existing, agentRole);
        await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
        this.agentCache.set(cacheKey, agentId);
        return agentId;
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
      name: `${agentRole} Agent`,
      description: `Dynamic agent for role: ${agentRole} in mission ${this.missionId}`,
      type: agentRole,
      systemPrompt,
      tools: toolAccess.tools,
      ...(toolAccess.policy ? { toolPolicy: toolAccess.policy } : {}),
      metadata: { missionId: this.missionId, agentRole },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.api(`/missions/${this.missionId}/agents`, { method: 'POST', body: JSON.stringify(definition) });
    await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
    this.agentCache.set(cacheKey, agentId);
    return agentId;
  }

  private resolveToolAccess(agentRole: string): { tools: string[]; policy?: AgentToolPolicy } {
    const key = agentRole.trim().toLowerCase();
    const grant = this.agentToolPolicies.get(key) || this.agentToolPolicies.get('*');
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
  ): Promise<TaskExecutionResult> {
    const taskPrompt = this.buildTaskPrompt(task, phase, plan);
    return this.executePromptTask(agentId, {
      taskId: `${this.missionId}:${phase.id}:${task.id}`,
      type: task.agentRole,
      prompt: taskPrompt,
      phaseId: phase.id,
      expectedArtifacts: task.expectedArtifacts,
      requireCompletedReceipt,
      executionPolicy,
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
          ...(request.executionPolicy ? { executionPolicy: request.executionPolicy } : {}),
        },
      },
      priority: 1,
      status: 'pending',
    };

    const submitted = await this.api<AgentTask>(
      `/missions/${this.missionId}/agents/${agentId}/tasks`,
      { method: 'POST', body: JSON.stringify(taskData) }
    );

    const executePath = `/missions/${this.missionId}/agents/${agentId}/tasks/${submitted.taskId}/execute`;
    let completed: AgentTask | undefined;
    for (let retry = 0; retry <= MAX_SAFE_AGENT_TASK_RETRIES; retry++) {
      try {
        completed = await this.api<AgentTask>(executePath, {
          method: 'POST',
          body: JSON.stringify({ requireCompletedReceipt: request.requireCompletedReceipt || false }),
        });
        break;
      } catch (error) {
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
    if (!completed) throw new Error(`Agent task ${submitted.taskId} returned no execution response`);
    if (completed.status !== 'completed') {
      throw new Error(completed.error || `Agent task ${submitted.taskId} returned status '${completed.status}'`);
    }
    const result = completed.result as Partial<TaskExecutionResult> | undefined;
    const output = typeof result?.output === 'string' ? result.output : '';
    const artifacts = Array.isArray(result?.artifacts)
      ? result.artifacts
      : this.extractArtifacts(output, request.expectedArtifacts || []);
    const tokensUsed = typeof result?.tokensUsed === 'number' ? result.tokensUsed : 0;
    return { output, artifacts, tokensUsed };
  }

  private async markTaskCompleted(taskId: string, result: any): Promise<void> {
    try {
      const agentId = this.taskAgentMap.get(taskId);
      if (!agentId) {
        logger.warn({ taskId }, 'No agent found for task, cannot mark completed');
        return;
      }
      await this.api(
        `/missions/${this.missionId}/agents/${agentId}/tasks/${taskId}/complete`,
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
        `/missions/${this.missionId}/agents/${agentId}/tasks/${taskId}/fail`,
        { method: 'POST', body: JSON.stringify({ error }) }
      );
    } catch (err) {
      logger.warn({ taskId, err: err instanceof Error ? err.message : String(err) }, 'Failed to mark task failed in agent-runtime');
    }
  }

  private buildTaskPrompt(task: Task, phase: Phase, plan: Plan): string {
    return (
      `Task: ${task.title}\n\n` +
      `Description: ${task.description}\n\n` +
      `Task Instructions: ${task.systemPrompt}\n\n` +
      `Phase: ${phase.name} (${phase.goal})\n` +
      `Plan Summary: ${plan.summary}\n` +
      `Expected Artifacts: ${task.expectedArtifacts.join(', ')}\n\n` +
      'Execute this task now and return completed results for its expected artifacts. Do not return a plan, future-tense promises, or placeholders. If the work cannot be completed with available tools or context, state the specific blocker instead.'
    );
  }

  private async waitForTaskCompletion(taskId: string, maxWaitMs = 300000): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollInterval));
      try {
        const task = await this.api<AgentTask>(`/missions/${this.missionId}/agents/tasks/${taskId}`);
        if (task.status === 'completed') {
          return this.parseTaskResult(task);
        }
        if (task.status === 'failed') {
          throw new Error(task.error || 'Task failed');
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Task failed')) throw err;
      }
    }
    throw new Error(`Task ${taskId} timed out after ${maxWaitMs}ms`);
  }

  private parseTaskResult(task: AgentTask): TaskExecutionResult {
    const result = task.result as any;
    const output = result?.output || JSON.stringify(result || {});
    const artifacts = result?.artifacts || this.extractArtifacts(output, []);
    const tokensUsed = result?.tokensUsed || 0;
    return { output, artifacts, tokensUsed };
  }

  private extractArtifacts(content: string, expected: string[]): Array<{ name: string; type: string; content: string }> {
    const artifacts: Array<{ name: string; type: string; content: string }> = [];
    const sections = content.split(/^##\s+/m).filter((s) => s.trim());
    for (const section of sections) {
      const firstLine = section.split('\n')[0].trim();
      const name = firstLine.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const matched = expected.find((e) => e.toLowerCase().includes(name) || name.includes(e.toLowerCase().replace(/\.[^.]+$/, '')));
      artifacts.push({
        name: matched || `${name}.md`,
        type: this.inferType(section),
        content: section.trim(),
      });
    }
    if (artifacts.length === 0 && expected.length > 0) {
      artifacts.push({ name: expected[0], type: 'document', content: content.trim() });
    } else if (artifacts.length === 0) {
      artifacts.push({ name: 'output.md', type: 'document', content: content.trim() });
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
      return await this.api<AgentState>(`/missions/${this.missionId}/agents/${agentId}/state`);
    } catch (error) {
      if (error instanceof MissionAgentRuntimeApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  async createCollaboration(participants: string[], topic: string): Promise<string> {
    const collab = await this.api<AgentCollaboration>(
      `/missions/${this.missionId}/collaborations`,
      { method: 'POST', body: JSON.stringify({ participants }) }
    );
    return collab.collaborationId;
  }

  async sendCollaborationMessage(collabId: string, from: string, content: string): Promise<void> {
    await this.api(
      `/missions/${this.missionId}/collaborations/${collabId}/messages`,
      { method: 'POST', body: JSON.stringify({ from, content }) }
    );
  }
}