import { AgentRuntime } from './AgentRuntime';
import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { logger } from '@stage7-nextgen/shared';
import {
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
} from '../types';
import {
  AgentExecutor,
  isResumableDelegationCheckpoint,
  parseAgentExecutionCheckpoint,
} from './AgentExecutor';

export class PersistentAgentRuntime {
  private runtime: AgentRuntime;
  private persistence: ArtifactsService;

  constructor(persistence: ArtifactsService, executor: AgentExecutor = new AgentExecutor()) {
    this.persistence = persistence;
    this.runtime = new AgentRuntime(
      executor,
      (state) => this.persistState(state),
      (agentId, missionId) => this.startAgent(agentId, missionId),
      (agentId, taskId, delegationDepth) => this.executeTask(agentId, taskId, false, delegationDepth),
    );
  }

  registerAgentForMission(missionId: string, definition: AgentDefinition): AgentDefinition {
    return this.runtime.registerAgentForMission(missionId, definition)
  }

  listAgentsForMission(missionId: string): AgentDefinition[] {
    return this.runtime.listAgentsForMission(missionId)
  }

  async registerAgent(definition: AgentDefinition): Promise<AgentDefinition> {
    this.runtime.registerAgent(definition);
    logger.info({ agentId: definition.id, type: definition.type }, 'Agent registered (runtime-managed)');
    return definition;
  }

  unregisterAgent(agentId: string): boolean {
    const existed = this.runtime.unregisterAgent(agentId);
    if (existed) {
      logger.info({ agentId }, 'Agent unregistered');
    }
    return existed;
  }

  getAgent(agentId: string): AgentDefinition | undefined {
    return this.runtime.getAgent(agentId);
  }

  listAgents(tenantId?: string): AgentDefinition[] {
    return this.runtime.listAgents(tenantId);
  }

  async startAgent(agentId: string, missionId: string): Promise<AgentState> {
    const saved = await this.persistence.getAgentState(agentId);
    if (saved && saved.missionId === missionId) {
      const allowedStatuses: AgentState['status'][] = ['idle', 'running', 'waiting', 'completed', 'failed'];
      if (!allowedStatuses.includes(saved.status as AgentState['status'])) {
        throw new Error(`Cannot restore agent ${agentId} with unsupported status '${saved.status}'`);
      }
      const restored: AgentState = {
        agentId: saved.agentId,
        tenantId: saved.tenantId,
        missionId: saved.missionId,
        status: saved.status as AgentState['status'],
        context: saved.context,
        artifacts: saved.artifacts,
        assignedAt: new Date(saved.createdAt).toISOString(),
        startedAt: new Date(saved.createdAt).toISOString(),
        ...(saved.status === 'completed' ? { completedAt: new Date(saved.updatedAt).toISOString() } : {}),
      };
      this.runtime.restoreAgentState(restored);
      return restored;
    }
    const state = this.runtime.startAgent(agentId, missionId);
    await this.persistState(state);
    return state;
  }

  async stopAgent(agentId: string): Promise<void> {
    this.runtime.stopAgent(agentId);
    const state = this.runtime.getAgentState(agentId);
    if (state) {
      await this.persistState(state);
    }
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.runtime.getAgentState(agentId);
  }

  async submitTask(
    agentId: string,
    task: Omit<AgentTask, 'agentId' | 'taskId' | 'createdAt'> & { taskId?: string },
  ): Promise<AgentTask> {
    const fullTask = this.runtime.submitTask(agentId, task);
    const state = this.runtime.getAgentState(agentId);
    if (state) await this.persistState(state);
    return fullTask;
  }

  async executeTask(
    agentId: string,
    taskId: string,
    requireCompletedReceipt = false,
    delegationDepth = 0,
  ): Promise<AgentTask> {
    const state = this.runtime.getAgentState(agentId);
    if (!state) throw new Error(`Agent ${agentId} has not been started`);
    const receipts = state.context.taskReceipts && typeof state.context.taskReceipts === 'object'
      ? state.context.taskReceipts as Record<string, { status?: string; result?: unknown; error?: string; completedAt?: string }>
      : {};
    const receipt = receipts[taskId];
    const task = this.runtime.getTask(taskId);
    if (!task || task.agentId !== agentId) throw new Error(`Task ${taskId} not found for agent ${agentId}`);

    if (task.status === 'running') throw new Error(`Agent task ${taskId} is already running`);
    const checkpoints = state.context.executionCheckpoints;
    if (checkpoints !== undefined && (!checkpoints || typeof checkpoints !== 'object' || Array.isArray(checkpoints))) {
      throw new Error(`Agent ${agentId} has invalid persisted execution checkpoints`);
    }
    const executionCheckpoint = parseAgentExecutionCheckpoint(
      checkpoints ? (checkpoints as Record<string, unknown>)[taskId] : undefined,
    );
    if (requireCompletedReceipt && receipt?.status !== 'completed') {
      const reason = receipt?.status === 'failed'
        ? `Agent task ${taskId} has a failed receipt: ${receipt.error || 'unknown failure'}`
        : `Checkpointed task ${taskId} has no completed Agent receipt`;
      throw new Error(`${reason}; refusing to execute it again`);
    }
    if (receipt?.status === 'completed') {
      task.status = 'completed';
      task.result = receipt.result;
      task.completedAt = receipt.completedAt || new Date().toISOString();
      this.runtime.restoreTask(task);
      return task;
    }
    if (receipt?.status === 'failed') {
      const canResumeDelegation = executionCheckpoint?.pendingAction
        ? isResumableDelegationCheckpoint(executionCheckpoint)
        : false;
      if (!executionCheckpoint || (executionCheckpoint.pendingAction && !canResumeDelegation)) {
        task.status = 'failed';
        task.error = receipt.error || 'Task failed without a safe resumable checkpoint';
        task.completedAt = receipt.completedAt || new Date().toISOString();
        this.runtime.restoreTask(task);
        throw new Error(`${task.error}; refusing to replay the task without a safe checkpoint`);
      }
    }
    if (typeof state.context.activeTaskId === 'string' && state.context.activeTaskId !== taskId) {
      throw new Error(
        `Agent task ${state.context.activeTaskId} was interrupted before its outcome was persisted; refusing to start ${taskId}`,
      );
    }
    if (state.context.activeTaskId === taskId && !executionCheckpoint) {
      throw new Error(
        `Agent task ${taskId} was interrupted before an execution checkpoint was persisted; refusing to replay external actions automatically`,
      );
    }

    if (state.context.activeTaskId !== taskId) {
      state.context = { ...state.context, activeTaskId: taskId };
      state.status = 'running';
      await this.persistState(state);
    }
    return this.runtime.executeTask(agentId, taskId, delegationDepth);
  }

  getTask(taskId: string): AgentTask | undefined {
    return this.runtime.getTask(taskId);
  }

  async completeTask(taskId: string, result?: unknown): Promise<AgentTask | undefined> {
    const task = this.runtime.completeTask(taskId, result);
    if (task) {
      const state = this.runtime.getAgentState(task.agentId);
      if (state) await this.persistState(state);
    }
    return task;
  }

  async failTask(taskId: string, error: string): Promise<AgentTask | undefined> {
    const task = this.runtime.failTask(taskId, error);
    if (task) {
      const state = this.runtime.getAgentState(task.agentId);
      if (state) await this.persistState(state);
    }
    return task;
  }

  createCollaboration(participants: string[]): AgentCollaboration {
    return this.runtime.createCollaboration(participants);
  }

  sendMessage(collaborationId: string, from: string, content: string): AgentCollaboration | undefined {
    return this.runtime.sendMessage(collaborationId, from, content);
  }

  registerSpecialization(agentId: string, specialization: AgentSpecialization): void {
    this.runtime.registerSpecialization(agentId, specialization);
  }

  getSpecializations(agentId: string): AgentSpecialization[] {
    return this.runtime.getSpecializations(agentId);
  }

  private async persistState(state: AgentState): Promise<void> {
    const createdAt = new Date(state.assignedAt);
    const updatedAt = new Date();
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error(`Agent ${state.agentId} has an invalid assignedAt timestamp`);
    }
    await this.persistence.saveAgentState({
      agentId: state.agentId,
      tenantId: state.tenantId,
      missionId: state.missionId,
      status: state.status,
      context: state.context,
      artifacts: state.artifacts,
      createdAt,
      updatedAt,
    });
  }
}
