import { v4 as uuidv4 } from 'uuid'
import { logger } from '@stage7-nextgen/shared'
import {
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
} from '../types'

export class AgentRuntime {
  private agents: Map<string, AgentDefinition> = new Map()
  private states: Map<string, AgentState> = new Map()
  private tasks: Map<string, AgentTask> = new Map()
  private collaborations: Map<string, AgentCollaboration> = new Map()
  private specializations: Map<string, AgentSpecialization[]> = new Map()

  registerAgent(definition: AgentDefinition): void {
    this.agents.set(definition.id, definition)
    logger.info({ agentId: definition.id }, 'Agent registered')
  }

  unregisterAgent(agentId: string): boolean {
    const existed = this.agents.delete(agentId)
    this.states.delete(agentId)
    this.specializations.delete(agentId)
    if (existed) {
      logger.info({ agentId }, 'Agent unregistered')
    }
    return existed
  }

  getAgent(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId)
  }

  listAgents(tenantId?: string): AgentDefinition[] {
    const all = Array.from(this.agents.values())
    if (!tenantId) return all
    return all.filter((a) => a.tenantId === tenantId)
  }

  startAgent(agentId: string, missionId: string): AgentState {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    const state: AgentState = {
      agentId,
      tenantId: agent.tenantId,
      missionId,
      status: 'running',
      context: {},
      artifacts: [],
      assignedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }

    this.states.set(agentId, state)
    logger.info({ agentId, missionId }, 'Agent started')
    return state
  }

  stopAgent(agentId: string): void {
    const state = this.states.get(agentId)
    if (state) {
      state.status = 'idle'
      state.completedAt = new Date().toISOString()
      this.states.set(agentId, state)
      logger.info({ agentId }, 'Agent stopped')
    }
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.states.get(agentId)
  }

  submitTask(agentId: string, task: Omit<AgentTask, 'taskId' | 'createdAt'>): AgentTask {
    const fullTask: AgentTask = {
      ...task,
      taskId: uuidv4(),
      createdAt: new Date().toISOString(),
    }
    this.tasks.set(fullTask.taskId, fullTask)
    logger.info({ agentId, taskId: fullTask.taskId }, 'Task submitted')
    return fullTask
  }

  completeTask(taskId: string, result?: any): AgentTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    task.result = result
    this.tasks.set(taskId, task)
    logger.info({ taskId }, 'Task completed')
    return task
  }

  failTask(taskId: string, error: string): AgentTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined
    task.status = 'failed'
    task.error = error
    this.tasks.set(taskId, task)
    logger.error({ taskId, error }, 'Task failed')
    return task
  }

  createCollaboration(participants: string[]): AgentCollaboration {
    const collaboration: AgentCollaboration = {
      collaborationId: uuidv4(),
      participants,
      status: 'active',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.collaborations.set(collaboration.collaborationId, collaboration)
    logger.info({ collaborationId: collaboration.collaborationId, participants }, 'Collaboration created')
    return collaboration
  }

  sendMessage(collaborationId: string, from: string, content: string): AgentCollaboration | undefined {
    const collaboration = this.collaborations.get(collaborationId)
    if (!collaboration) return undefined

    collaboration.messages.push({
      from,
      to: '',
      content,
      timestamp: new Date().toISOString(),
    })
    collaboration.updatedAt = new Date().toISOString()
    this.collaborations.set(collaborationId, collaboration)
    logger.info({ collaborationId, from }, 'Message sent')
    return collaboration
  }

  registerSpecialization(agentId: string, specialization: AgentSpecialization): void {
    const existing = this.specializations.get(agentId) || []
    existing.push(specialization)
    this.specializations.set(agentId, existing)
    logger.info({ agentId, domain: specialization.domain }, 'Specialization registered')
  }

  getSpecializations(agentId: string): AgentSpecialization[] {
    return this.specializations.get(agentId) || []
  }
}
