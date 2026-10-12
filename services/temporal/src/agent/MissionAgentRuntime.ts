import { logger } from '@stage7-nextgen/shared';
import {
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
  AgentExecutionPolicy,
} from '@stage7-nextgen/shared';
import { Plan, Phase, Task } from '@stage7-nextgen/shared';
import {
  PlannerCompletionRequest,
  PLANNER_EXECUTION_POLICY,
  PLANNER_SYSTEM_PROMPT,
  generateValidPlan,
} from '../planner/MissionPlanner';

function getAgentRuntimeUrl(): string {
  return process.env.AGENT_RUNTIME_URL || 'http://agent-runtime:3400';
}

export interface MissionAgentConfig {
  missionId: string;
  tenantId: string;
  broadcast?: (event: any) => Promise<void>;
  agentRuntimeUrl?: string;
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
  constructor(path: string, readonly status: number, details: string) {
    super(`Agent Runtime API ${path} failed (${status}): ${details.slice(0, 200)}`);
    this.name = 'MissionAgentRuntimeApiError';
  }
}

export class MissionAgentRuntime {
  private missionId: string;
  private tenantId: string;
  private agentRuntimeUrl: string;
  private broadcast: MissionAgentConfig['broadcast'];
  private agentCache: Map<string, string> = new Map(); // agentRole -> agentId
  private taskAgentMap: Map<string, string> = new Map(); // taskId -> agentId

  constructor(config: MissionAgentConfig) {
    this.missionId = config.missionId;
    this.tenantId = config.tenantId;
    this.agentRuntimeUrl = config.agentRuntimeUrl || getAgentRuntimeUrl();
    this.broadcast = config.broadcast || (async () => {});
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
        await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
        this.agentCache.set('planner', agentId);
        return agentId;
      }
    } catch (error) {
      if (!(error instanceof MissionAgentRuntimeApiError) || error.status !== 404) {
        throw error;
      }
    }

    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: 'Mission Planner',
      description: `Planner agent for mission ${this.missionId}`,
      type: 'planner',
      systemPrompt,
      tools: [],
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
        context: { plannerAttempt: request.attempt },
        executionPolicy: PLANNER_EXECUTION_POLICY,
      });
      return result.output;
    });
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
        await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
        this.agentCache.set(cacheKey, agentId);
        return agentId;
      }
    } catch (error) {
      if (!(error instanceof MissionAgentRuntimeApiError) || error.status !== 404) {
        throw error;
      }
    }

    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: `${agentRole} Agent`,
      description: `Dynamic agent for role: ${agentRole} in mission ${this.missionId}`,
      type: agentRole,
      systemPrompt,
      tools: [],
      metadata: { missionId: this.missionId, agentRole },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.api(`/missions/${this.missionId}/agents`, { method: 'POST', body: JSON.stringify(definition) });
    await this.api(`/missions/${this.missionId}/agents/${agentId}/start`, { method: 'POST' });
    this.agentCache.set(cacheKey, agentId);
    return agentId;
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

    const completed = await this.api<AgentTask>(
      `/missions/${this.missionId}/agents/${agentId}/tasks/${submitted.taskId}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({ requireCompletedReceipt: request.requireCompletedReceipt || false }),
      },
    );
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
      `Phase: ${phase.name} (${phase.goal})\n` +
      `Plan Summary: ${plan.summary}\n` +
      `Expected Artifacts: ${task.expectedArtifacts.join(', ')}\n\n` +
      `Execute this task thoroughly. Produce every expected artifact as a clearly labeled section.`
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