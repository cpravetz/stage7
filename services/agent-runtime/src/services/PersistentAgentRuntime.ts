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

export class PersistentAgentRuntime {
  private runtime: AgentRuntime;
  private persistence: ArtifactsService;

  constructor(persistence: ArtifactsService) {
    this.runtime = new AgentRuntime();
    this.persistence = persistence;
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
    const state = this.runtime.startAgent(agentId, missionId);
    await this.persistence.saveAgentState(state as any);
    return state;
  }

  stopAgent(agentId: string): void {
    this.runtime.stopAgent(agentId);
    const state = this.runtime.getAgentState(agentId);
    if (state) {
      this.persistence.saveAgentState(state as any).catch(() => {});
    }
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.runtime.getAgentState(agentId);
  }

  async submitTask(agentId: string, task: Omit<AgentTask, 'taskId' | 'createdAt'>): Promise<AgentTask> {
    const fullTask = this.runtime.submitTask(agentId, task);
    await this.persistence.saveAgentState({
      agentId,
      tenantId: 'unknown',
      missionId: (task.input as any)?.missionId || 'unknown',
      status: 'running',
      context: { currentTask: fullTask.taskId },
      artifacts: [],
      createdAt: fullTask.createdAt,
      updatedAt: fullTask.createdAt,
    } as any).catch(() => {});
    return fullTask;
  }

  completeTask(taskId: string, result?: any): AgentTask | undefined {
    const task = this.runtime.completeTask(taskId, result);
    if (task) {
      this.persistence.saveAgentState({
        agentId: task.agentId,
        tenantId: 'unknown',
        missionId: 'unknown',
        status: 'completed',
        context: { result },
        artifacts: [],
        createdAt: task.createdAt,
        updatedAt: task.createdAt,
      } as any).catch(() => {});
    }
    return task;
  }

  failTask(taskId: string, error: string): AgentTask | undefined {
    const task = this.runtime.failTask(taskId, error);
    if (task) {
      this.persistence.saveAgentState({
        agentId: task.agentId,
        tenantId: 'unknown',
        missionId: 'unknown',
        status: 'failed',
        context: { error },
        artifacts: [],
        createdAt: task.createdAt,
        updatedAt: task.createdAt,
      } as any).catch(() => {});
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
}
