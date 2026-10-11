import { logger } from '@stage7-nextgen/shared';
import {
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
} from '@stage7-nextgen/shared';
import { Plan, Phase, Task } from '@stage7-nextgen/shared';

function getAgentRuntimeUrl(): string {
  return process.env.AGENT_RUNTIME_URL || 'http://agent-runtime:3400';
}

export interface MissionAgentConfig {
  missionId: string;
  tenantId: string;
  assistantId?: string;
  workerPoolUrl?: string;
  broadcast?: (event: any) => Promise<void>;
  agentRuntimeUrl?: string;
}

export interface TaskExecutionResult {
  output: string;
  artifacts: Array<{ name: string; type: string; content: string }>;
  tokensUsed: number;
}

export class MissionAgentRuntime {
  private missionId: string;
  private tenantId: string;
  private workerPoolUrl: string | undefined;
  private assistantId: string | undefined;
  private agentRuntimeUrl: string;
  private broadcast: MissionAgentConfig['broadcast'];
  private agentCache: Map<string, string> = new Map(); // agentRole -> agentId
  private taskAgentMap: Map<string, string> = new Map(); // taskId -> agentId

  constructor(config: MissionAgentConfig) {
    this.missionId = config.missionId;
    this.tenantId = config.tenantId;
    this.workerPoolUrl = config.workerPoolUrl;
    this.assistantId = config.assistantId;
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
      throw new Error(`Agent Runtime API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  async registerPlannerAgent(systemPrompt: string): Promise<string> {
    const agentId = `agent-${this.missionId}-planner`;
    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: 'Mission Planner',
      description: `Planner agent for mission ${this.missionId}`,
      type: 'planner',
      systemPrompt,
      model: 'openai/gpt-4o-mini',
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

  async getOrCreateWorkerAgent(agentRole: string, systemPrompt: string): Promise<string> {
    const cacheKey = agentRole.toLowerCase();
    if (this.agentCache.has(cacheKey)) {
      return this.agentCache.get(cacheKey)!;
    }

    const agentId = `agent-${this.missionId}-${cacheKey}`;
    try {
      const existing = await this.api<{ agent: AgentDefinition }>(
        `/missions/${this.missionId}/agents/${agentId}`
      );
      if (existing.agent) {
        this.agentCache.set(cacheKey, agentId);
        return agentId;
      }
    } catch {
      // Not found, create new
    }

    const definition: AgentDefinition = {
      id: agentId,
      tenantId: this.tenantId,
      name: `${agentRole} Agent`,
      description: `Dynamic agent for role: ${agentRole} in mission ${this.missionId}`,
      type: agentRole,
      systemPrompt,
      model: 'openai/gpt-4o-mini',
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
    plan: Plan
  ): Promise<TaskExecutionResult> {
    const taskPrompt = this.buildTaskPrompt(task, phase, plan);

    // Register task in agent-runtime for tracking
    const taskData = {
      type: task.agentRole,
      input: {
        prompt: taskPrompt,
        context: {
          missionId: this.missionId,
          phaseId: phase.id,
          taskId: task.id,
          expectedArtifacts: task.expectedArtifacts,
        },
      },
      priority: 1,
    };

    const submitted = await this.api<AgentTask>(
      `/missions/${this.missionId}/agents/${agentId}/tasks`,
      { method: 'POST', body: JSON.stringify(taskData) }
    );

    // Track which agent this task belongs to for completion reporting
    this.taskAgentMap.set(submitted.taskId, agentId);

    // Actually execute the task via worker-pool assistant if available
    if (this.assistantId && this.workerPoolUrl) {
      return this.executeViaAssistant(task, phase, plan, taskPrompt, submitted.taskId);
    }

    // Otherwise wait for agent-runtime to complete it (external executor)
    return this.waitForTaskCompletion(submitted.taskId);
  }

  private async executeViaAssistant(
    task: Task,
    phase: Phase,
    plan: Plan,
    taskPrompt: string,
    taskId: string
  ): Promise<TaskExecutionResult> {
    const res = await fetch(
      `${this.workerPoolUrl}/api/workers/assistants/${encodeURIComponent(this.assistantId!)}/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: taskPrompt,
          context: { missionId: this.missionId, phaseId: phase.id, taskId: task.id },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      await this.markTaskFailed(taskId, `Assistant executor failed (${res.status}): ${text.slice(0, 200)}`);
      throw new Error(`Assistant executor failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { success: boolean; output?: string; error?: string; tokensUsed?: number };
    if (!data.success) {
      await this.markTaskFailed(taskId, data.error || 'Assistant executor returned a failure result');
      throw new Error(data.error || 'Assistant executor returned a failure result');
    }

    const output = data.output || '';
    const artifacts = this.extractArtifacts(output, task.expectedArtifacts || []);
    await this.markTaskCompleted(taskId, { output, artifacts, tokensUsed: data.tokensUsed || 0 });

    logger.info(
      { task: task.title, phase: phase.name, assistantId: this.assistantId, tokensUsed: data.tokensUsed || 0 },
      'Worker task completed via assistant',
    );
    return { output, artifacts, tokensUsed: data.tokensUsed || 0 };
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
    } catch {
      return undefined;
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