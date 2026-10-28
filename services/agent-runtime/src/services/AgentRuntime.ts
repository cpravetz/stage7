import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@stage7-nextgen/shared'
import {
  AgentDefinition,
  AgentState,
  AgentTask,
  AgentCollaboration,
  AgentSpecialization,
  DEFAULT_AGENT_EXECUTION_POLICY,
  AgentExecutionPolicy,
} from '../types'
import { BadRequestError, ConflictError } from '../utils/errors'
import {
  AgentExecutionCheckpoint,
  AgentExecutor,
  AgentDelegateRequest,
  parseAgentExecutionCheckpoint,
} from './AgentExecutor'

const MAX_AGENTS_PER_MISSION = 16

function readExecutionPolicy(value: unknown): AgentExecutionPolicy | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Agent execution policy must be an object')
  }
  const policy = {
    ...DEFAULT_AGENT_EXECUTION_POLICY,
    ...(value as Record<string, unknown>),
  }
  const keys: Array<keyof AgentExecutionPolicy> = [
    'maxBrainCalls',
    'maxActions',
    'maxCompletionTokens',
    'maxCompletionTokensPerCall',
    'maxDelegations',
  ]
  for (const key of keys) {
    const maximum = key === 'maxCompletionTokensPerCall' ? 8192 : DEFAULT_AGENT_EXECUTION_POLICY[key]
    const minimum = key === 'maxActions' || key === 'maxDelegations' ? 0 : 1
    const isUnlimited = policy[key] === Number.MAX_SAFE_INTEGER
    if (
      typeof policy[key] !== 'number'
      || !Number.isInteger(policy[key])
      || policy[key] < minimum
      || (!isUnlimited && policy[key] > maximum)
    ) {
      throw new Error(`Agent execution policy ${key} must be an integer between ${minimum} and ${maximum}, or ${Number.MAX_SAFE_INTEGER} for unlimited`)
    }
  }
  if (
    policy.maxCompletionTokensPerCall !== Number.MAX_SAFE_INTEGER
    && policy.maxCompletionTokens !== Number.MAX_SAFE_INTEGER
    && policy.maxCompletionTokensPerCall > policy.maxCompletionTokens
  ) {
    throw new Error('Agent execution policy maxCompletionTokensPerCall cannot exceed maxCompletionTokens')
  }
  return {
    maxBrainCalls: policy.maxBrainCalls as number,
    maxActions: policy.maxActions as number,
    maxCompletionTokens: policy.maxCompletionTokens as number,
    maxCompletionTokensPerCall: policy.maxCompletionTokensPerCall as number,
    maxDelegations: policy.maxDelegations as number,
  }
}

export class AgentRuntime {
  private agents: Map<string, AgentDefinition> = new Map()
  // missionId -> (agentId -> AgentDefinition)
  private missionAgents: Map<string, Map<string, AgentDefinition>> = new Map()
  private states: Map<string, AgentState> = new Map()
  private tasks: Map<string, AgentTask> = new Map()
  private collaborations: Map<string, AgentCollaboration> = new Map()
  private specializations: Map<string, AgentSpecialization[]> = new Map()
  private executor: AgentExecutor
  private persistAgentState?: (state: AgentState) => Promise<void>
  private startDelegatedAgent?: (agentId: string, missionId: string) => Promise<AgentState>
  private executeDelegatedTask?: (
    agentId: string,
    taskId: string,
    delegationDepth: number,
  ) => Promise<AgentTask>

  constructor(
    executor: AgentExecutor = new AgentExecutor(),
    persistAgentState?: (state: AgentState) => Promise<void>,
    startDelegatedAgent?: (agentId: string, missionId: string) => Promise<AgentState>,
    executeDelegatedTask?: (agentId: string, taskId: string, delegationDepth: number) => Promise<AgentTask>,
  ) {
    this.executor = executor
    this.persistAgentState = persistAgentState
    this.startDelegatedAgent = startDelegatedAgent
    this.executeDelegatedTask = executeDelegatedTask
  }

  registerAgent(definition: AgentDefinition): void {
    this.agents.set(definition.id, definition)
    logger.info({ agentId: definition.id }, 'Agent registered')
  }

  registerAgentForMission(missionId: string, definition: AgentDefinition): AgentDefinition {
    if (!missionId.trim()) throw new BadRequestError('Mission ID is required to register a mission Agent')
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new BadRequestError('Mission Agent definition must be an object')
    }
    if (typeof definition.tenantId !== 'string' || !definition.tenantId.trim()) {
      throw new BadRequestError('Mission Agent definition requires a tenant ID')
    }
    if (
      !Array.isArray(definition.tools)
      || !definition.tools.every((tool) => typeof tool === 'string' && tool.trim().length > 0)
    ) {
      throw new BadRequestError('Mission Agent definition tools must be an array of non-empty tool IDs')
    }
    if (
      definition.metadata !== undefined
      && (!definition.metadata || typeof definition.metadata !== 'object' || Array.isArray(definition.metadata))
    ) {
      throw new BadRequestError('Mission Agent definition metadata must be an object')
    }
    if (
      definition.toolPolicy !== undefined
      && (!definition.toolPolicy || !['all', 'allowlist'].includes(definition.toolPolicy.mode))
    ) {
      throw new BadRequestError('Mission Agent definition has an invalid tool policy')
    }
    const metadata = definition.metadata && typeof definition.metadata === 'object' && !Array.isArray(definition.metadata)
      ? definition.metadata
      : {}
    if (metadata.missionId !== undefined && metadata.missionId !== missionId) {
      throw new BadRequestError('Mission Agent metadata missionId must match its registration scope')
    }

    const map = this.missionAgents.get(missionId) || new Map<string, AgentDefinition>()
    const id = definition.id || `${missionId}:agent-${uuidv4()}`
    if (!id.trim()) throw new BadRequestError('Mission Agent ID cannot be empty')
    const defWithId: AgentDefinition = {
      ...definition,
      id,
      metadata: { ...metadata, missionId },
    }
    const existing = this.agents.get(id)
    const existingMissionAgent = map.get(id)
    if (existing && !existingMissionAgent) {
      throw new ConflictError(`Agent ID ${id} is already registered outside mission ${missionId}`)
    }
    if (existingMissionAgent) {
      const currentMode = existingMissionAgent.toolPolicy?.mode || 'all'
      const requestedMode = defWithId.toolPolicy?.mode || 'all'
      const currentTools = [...existingMissionAgent.tools].sort()
      const requestedTools = [...defWithId.tools].sort()
      if (
        existingMissionAgent.tenantId !== defWithId.tenantId
        || currentMode !== requestedMode
        || currentTools.length !== requestedTools.length
        || currentTools.some((tool, index) => tool !== requestedTools[index])
      ) {
        throw new ConflictError(`Mission Agent ${id} cannot be re-registered with a different tenant or tool policy`)
      }
      return existingMissionAgent
    }
    map.set(id, defWithId)
    this.missionAgents.set(missionId, map)
    this.agents.set(id, defWithId)
    logger.info({ agentId: id, missionId }, 'Agent registered for mission')
    return defWithId
  }

  unregisterAgent(agentId: string): boolean {
    const existed = this.agents.delete(agentId)
    this.states.delete(agentId)
    this.specializations.delete(agentId)
    // remove from any mission mapping
    for (const [missionId, map] of this.missionAgents.entries()) {
      if (map.delete(agentId)) {
        if (map.size === 0) this.missionAgents.delete(missionId)
        break
      }
    }
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

  listAgentsForMission(missionId: string): AgentDefinition[] {
    const map = this.missionAgents.get(missionId)
    if (!map) return []
    return Array.from(map.values())
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

  restoreAgentState(state: AgentState): void {
    if (!this.agents.has(state.agentId)) {
      throw new Error(`Agent ${state.agentId} must be registered before restoring its state`)
    }
    this.states.set(state.agentId, state)
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

  stopAllAgentsForMission(missionId: string): void {
    const map = this.missionAgents.get(missionId)
    if (!map) return
    for (const agentId of map.keys()) {
      const state = this.states.get(agentId)
      if (state) {
        state.status = 'idle'
        state.completedAt = state.completedAt || new Date().toISOString()
        this.states.set(agentId, state)
        logger.info({ agentId, missionId }, 'Agent stopped on mission completion')
      }
    }
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.states.get(agentId)
  }

  submitTask(
    agentId: string,
    task: Omit<AgentTask, 'agentId' | 'taskId' | 'createdAt'> & { taskId?: string },
  ): AgentTask {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} not found`)
    }
    const fullTask: AgentTask = {
      ...task,
      agentId,
      taskId: task.taskId || uuidv4(),
      createdAt: new Date().toISOString(),
    }
    const existing = this.tasks.get(fullTask.taskId)
    if (existing) {
      if (existing.agentId !== agentId) {
        throw new Error(`Task ${fullTask.taskId} is already assigned to another agent`)
      }
      return existing
    }
    this.tasks.set(fullTask.taskId, fullTask)
    logger.info({ agentId, taskId: fullTask.taskId }, 'Task submitted')
    return fullTask
  }

  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId)
  }

  restoreTask(task: AgentTask): void {
    if (!this.agents.has(task.agentId)) {
      throw new Error(`Agent ${task.agentId} must be registered before restoring task ${task.taskId}`)
    }
    if (task.status === 'completed') delete task.error
    this.tasks.set(task.taskId, task)
  }

  async executeTask(
    agentId: string,
    taskId: string,
    delegationDepth = 0,
    retryGuidance?: string,
  ): Promise<AgentTask> {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    const task = this.tasks.get(taskId)
    if (!task || task.agentId !== agentId) throw new Error(`Task ${taskId} not found for agent ${agentId}`)
    if (task.status === 'completed') return task
    if (task.status === 'running') throw new Error(`Task ${taskId} is already running`)

    const state = this.states.get(agentId)
    if (!state) throw new Error(`Agent ${agentId} has not been started`)
    task.status = 'running'
    state.status = 'running'
    state.context = { ...state.context, currentTaskId: taskId }

    try {
      const input = task.input && typeof task.input === 'object' && !Array.isArray(task.input)
        ? task.input as Record<string, unknown>
        : {}
      const taskContext = input.context && typeof input.context === 'object' && !Array.isArray(input.context)
        ? input.context as Record<string, unknown>
        : {}
      const executionPolicy = readExecutionPolicy(taskContext.executionPolicy)
      const checkpoints = state.context.executionCheckpoints
      if (checkpoints !== undefined && (!checkpoints || typeof checkpoints !== 'object' || Array.isArray(checkpoints))) {
        throw new Error(`Agent ${agentId} has invalid persisted execution checkpoints`)
      }
      const resumeCheckpoint = parseAgentExecutionCheckpoint(
        checkpoints ? (checkpoints as Record<string, unknown>)[taskId] : undefined,
      )
      const missionId = state.missionId
      const saveCheckpoint = this.persistAgentState
        ? async (checkpoint: AgentExecutionCheckpoint) => {
          const current = state.context.executionCheckpoints;
          const currentCheckpoints = current && typeof current === 'object' && !Array.isArray(current)
            ? current as Record<string, unknown>
            : {};
          state.context = {
            ...state.context,
            executionCheckpoints: { ...currentCheckpoints, [taskId]: checkpoint },
          };
          await this.persistAgentState?.(state);
        }
        : undefined;
      const result = await this.executor.execute(agent, task, {
        missionId,
        delegationDepth,
        ...(retryGuidance ? { retryGuidance } : {}),
        ...(executionPolicy ? { executionPolicy } : {}),
        delegate: (request) => this.delegateTask(agent, task, request, delegationDepth + 1),
        ...(resumeCheckpoint ? { resumeCheckpoint } : {}),
        ...(saveCheckpoint ? { saveCheckpoint } : {}),
      })

      task.status = 'completed'
      task.completedAt = new Date().toISOString()
      task.result = result
      delete task.error
      this.tasks.set(taskId, task)
      const receipts = state.context.taskReceipts && typeof state.context.taskReceipts === 'object'
        ? state.context.taskReceipts as Record<string, unknown>
        : {}
      state.context = {
        ...state.context,
        taskReceipts: {
          ...receipts,
          [taskId]: { status: 'completed', result, completedAt: task.completedAt },
        },
        activeTaskId: undefined,
        currentTaskId: undefined,
        executionCheckpoints: this.withoutTaskCheckpoint(state.context.executionCheckpoints, taskId),
        lastCompletedTaskId: taskId,
        lastTaskResult: result,
      }
      state.status = 'waiting'
      this.states.set(agentId, state)
      await this.persistAgentState?.(state)
      logger.info({ agentId, taskId, toolCalls: result.toolCalls }, 'Agent task completed')
      return task
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      task.status = 'failed'
      task.error = message
      task.completedAt = new Date().toISOString()
      this.tasks.set(taskId, task)
      state.status = 'failed'
      const receipts = state.context.taskReceipts && typeof state.context.taskReceipts === 'object'
        ? state.context.taskReceipts as Record<string, unknown>
        : {}
      state.context = {
        ...state.context,
        taskReceipts: {
          ...receipts,
          [taskId]: { status: 'failed', error: message, completedAt: task.completedAt },
        },
        activeTaskId: taskId,
        currentTaskId: undefined,
        lastFailedTaskId: taskId,
        lastError: message,
      }
      this.states.set(agentId, state)
      await this.persistAgentState?.(state)
      logger.error({ agentId, taskId, error: message }, 'Agent task failed')
      throw error
    }
  }

  private withoutTaskCheckpoint(value: unknown, taskId: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const checkpoints = value as Record<string, unknown>
    const { [taskId]: _removed, ...remaining } = checkpoints
    return remaining
  }

  private async delegateTask(
    parent: AgentDefinition,
    parentTask: AgentTask,
    request: AgentDelegateRequest,
    delegationDepth: number,
  ): Promise<unknown> {
    if (delegationDepth > this.executor.maxDelegationDepth) {
      throw new Error(`Maximum delegation depth of ${this.executor.maxDelegationDepth} exceeded`)
    }
    const parentState = this.states.get(parent.id)
    if (!parentState) throw new Error(`Parent agent ${parent.id} has no active mission state`)
    const missionAgents = this.missionAgents.get(parentState.missionId)
    const role = request.role?.trim() || 'delegate'
    const systemPrompt = request.systemPrompt || `You are a ${role} agent. Complete the delegated goal and report your findings.`
    const delegationId = createHash('sha256')
      .update(JSON.stringify({
        missionId: parentState.missionId,
        parentAgentId: parent.id,
        parentTaskId: parentTask.taskId,
        goal: request.goal,
        role,
        systemPrompt,
      }))
      .digest('hex')
      .slice(0, 24)
    const agentId = `agent-delegation-${delegationId}`
    if ((missionAgents?.size || 0) >= MAX_AGENTS_PER_MISSION && !missionAgents?.has(agentId)) {
      throw new Error(`Mission agent limit of ${MAX_AGENTS_PER_MISSION} reached`)
    }
    const now = new Date().toISOString()
    const child: AgentDefinition = {
      ...parent,
      id: agentId,
      name: `${role} agent`,
      description: `Mission-scoped delegate for ${parentTask.taskId}: ${request.goal}`,
      type: role,
      systemPrompt,
      metadata: { ...parent.metadata, missionId: parentState.missionId, parentAgentId: parent.id },
      createdAt: now,
      updatedAt: now,
    }
    this.registerAgentForMission(parentState.missionId, child)
    if (this.startDelegatedAgent) {
      await this.startDelegatedAgent(agentId, parentState.missionId)
    } else {
      this.startAgent(agentId, parentState.missionId)
    }

    const parentInput = parentTask.input && typeof parentTask.input === 'object' && !Array.isArray(parentTask.input)
      ? parentTask.input as Record<string, unknown>
      : {}
    const parentContext = parentInput.context && typeof parentInput.context === 'object' && !Array.isArray(parentInput.context)
      ? parentInput.context as Record<string, unknown>
      : {}
    const executionPolicy = readExecutionPolicy(parentContext.executionPolicy)
    const childTask = this.submitTask(agentId, {
      taskId: `${parentTask.taskId}:delegation:${delegationId}`,
      type: 'delegated',
      input: {
        prompt: request.goal,
        context: {
          missionId: parentState.missionId,
          parentAgentId: parent.id,
          parentTaskId: parentTask.taskId,
          ...(executionPolicy ? { executionPolicy } : {}),
        },
      },
      priority: parentTask.priority,
      status: 'pending',
    })
    const completed = this.executeDelegatedTask
      ? await this.executeDelegatedTask(agentId, childTask.taskId, delegationDepth)
      : await this.executeTask(agentId, childTask.taskId, delegationDepth)
    return completed.result
  }

  completeTask(taskId: string, result?: any): AgentTask | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    task.result = result
    delete task.error
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
