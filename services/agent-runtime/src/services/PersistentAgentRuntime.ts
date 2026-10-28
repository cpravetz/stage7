import { AgentRuntime } from './AgentRuntime';
import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { logger } from '@stage7-nextgen/shared';
import { createHash } from 'crypto';
import {
  AgentLearning,
  AgentLearningInput,
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
} from '../types';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
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
    this.runtime.stopAgent(agentId)
    const state = this.runtime.getAgentState(agentId)
    if (state) {
      await this.persistState(state)
    }
  }

  async stopAllAgentsForMission(missionId: string): Promise<void> {
    if (typeof (this.runtime as any).stopAllAgentsForMission === 'function') {
      (this.runtime as any).stopAllAgentsForMission(missionId);
      const map = (this.runtime as any).missionAgents?.get(missionId);
      if (map) {
        for (const agentId of map.keys()) {
          const state = this.runtime.getAgentState(agentId);
          if (state) await this.persistState(state);
        }
      }
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
    retryGuidance?: string,
  ): Promise<AgentTask> {
    if (retryGuidance !== undefined && (typeof retryGuidance !== 'string' || retryGuidance.length > 4_000)) {
      throw new BadRequestError('Retry guidance must be a string of at most 4000 characters');
    }
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
      delete task.error;
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

    const taskContext = task.input.context && typeof task.input.context === 'object' && !Array.isArray(task.input.context)
      ? task.input.context as Record<string, unknown>
      : {};
    const domain = typeof taskContext.domain === 'string' && taskContext.domain.trim()
      ? taskContext.domain.trim()
      : task.type;
    const learnings = await this.getLearningsForAgent(agentId, state.missionId, domain);
    task.input = {
      ...task.input,
      context: {
        ...taskContext,
        agentLearnings: learnings.map((learning) => ({
          domain: learning.domain,
          guidance: learning.guidance,
          evidence: learning.evidence,
          source: learning.source,
          sourceRef: learning.sourceRef,
          confidence: learning.confidence,
        })),
      },
    };
    this.runtime.restoreTask(task);

    if (state.context.activeTaskId !== taskId) {
      state.context = { ...state.context, activeTaskId: taskId };
      state.status = 'running';
      await this.persistState(state);
    }
    return this.runtime.executeTask(agentId, taskId, delegationDepth, retryGuidance);
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

  async recordLearning(
    agentId: string,
    missionId: string,
    input: AgentLearningInput,
  ): Promise<AgentLearning> {
    const { state, definition } = this.getAgentScope(agentId, missionId);
    if (
      !input
      || typeof input.domain !== 'string'
      || !input.domain.trim()
      || input.domain.length > 80
      || typeof input.guidance !== 'string'
      || !input.guidance.trim()
      || input.guidance.length > 1_000
      || (input.evidence !== undefined && (typeof input.evidence !== 'string' || input.evidence.length > 2_000))
      || (input.source !== 'human_feedback' && input.source !== 'validated_outcome')
      || typeof input.sourceRef !== 'string'
      || !input.sourceRef.trim()
      || input.sourceRef.length > 200
      || typeof input.recordedBy !== 'string'
      || !input.recordedBy.trim()
      || input.recordedBy.length > 120
      || !Number.isFinite(input.confidence)
      || input.confidence < 0
      || input.confidence > 1
    ) {
      throw new BadRequestError('Agent learning requires bounded guidance and explicit, scoped provenance');
    }

    await this.persistence.ready();
    const id = `agent-learning-${createHash('sha256')
      .update(`${state.tenantId}\0${agentId}\0${input.sourceRef.trim()}`)
      .digest('hex')}`;
    const existing = await this.persistence.getDocument(id);
    if (existing) {
      if (existing.tenantId !== state.tenantId || existing.collection !== 'agent-learnings') {
        throw new ConflictError(`Agent learning provenance key ${input.sourceRef} is already owned by another scope`);
      }
      const stored = existing.data as unknown as AgentLearning;
      if (
        stored.agentId !== agentId
        || stored.sourceRef !== input.sourceRef.trim()
        || stored.domain !== input.domain.trim()
        || stored.guidance !== input.guidance.trim()
        || stored.evidence !== input.evidence?.trim()
        || stored.source !== input.source
        || stored.recordedBy !== input.recordedBy.trim()
        || stored.confidence !== input.confidence
      ) {
        throw new ConflictError(`Agent learning provenance key ${input.sourceRef} cannot be reused with different content`);
      }
      return stored;
    }

    const learning: AgentLearning = {
      id,
      tenantId: state.tenantId,
      agentId: definition.id,
      domain: input.domain.trim(),
      guidance: input.guidance.trim(),
      ...(input.evidence?.trim() ? { evidence: input.evidence.trim() } : {}),
      source: input.source,
      sourceRef: input.sourceRef.trim(),
      recordedBy: input.recordedBy.trim(),
      confidence: input.confidence,
      createdAt: new Date().toISOString(),
    };
    await this.persistence.createDocument({
      id,
      tenantId: state.tenantId,
      collection: 'agent-learnings',
      data: { ...learning },
    });
    logger.info(
      { agentId, missionId, domain: learning.domain, source: learning.source },
      'Tenant-scoped Agent learning recorded',
    );
    return learning;
  }

  async getLearningsForAgent(
    agentId: string,
    missionId: string,
    domain?: string,
  ): Promise<AgentLearning[]> {
    const { state } = this.getAgentScope(agentId, missionId);
    await this.persistence.ready();
    const { documents } = await this.persistence.queryDocuments({
      collection: 'agent-learnings',
      filter: { tenantId: state.tenantId },
      sort: { createdAt: -1 },
      limit: 100,
    });
    return documents
      .map((document) => document.data as unknown as AgentLearning)
      .filter((learning) => (
        learning.tenantId === state.tenantId
        && typeof learning.guidance === 'string'
        && (learning.domain === 'general' || learning.domain === domain)
      ))
      .slice(0, 5);
  }

  private getAgentScope(agentId: string, missionId: string): { state: AgentState; definition: AgentDefinition } {
    const definition = this.runtime.getAgent(agentId);
    const state = this.runtime.getAgentState(agentId);
    if (!definition || !state || state.missionId !== missionId || definition.tenantId !== state.tenantId) {
      throw new NotFoundError('Mission agent');
    }
    return { state, definition };
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
