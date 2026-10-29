import { AgentExecutor } from '../src/services/AgentExecutor'
import { AgentRuntime } from '../src/services/AgentRuntime'
import request from 'supertest'
import express from 'express'
import agentsRouter from '../src/routes/agents'
import { AgentDefinition, AgentState, AgentTask, AgentSpecialization } from '../src/types'

const app = express()
app.use(express.json())
app.use('/api/agent-runtime', agentsRouter)

describe('AgentRuntime', () => {
  let runtime: AgentRuntime

  beforeEach(() => {
    runtime = new AgentRuntime()
  })

  const agent: AgentDefinition = {
    id: 'agent-1',
    tenantId: 'tenant-1',
    name: 'Test Agent',
    description: 'A test agent',
    type: 'assistant',
    systemPrompt: 'You are helpful',
    tools: ['bash'],
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('should register and retrieve an agent', () => {
    runtime.registerAgent(agent)
    expect(runtime.getAgent('agent-1')).toEqual(agent)
  })

  it('should unregister an agent', () => {
    runtime.registerAgent(agent)
    expect(runtime.unregisterAgent('agent-1')).toBe(true)
    expect(runtime.getAgent('agent-1')).toBeUndefined()
  })

  it('should list agents filtered by tenant', () => {
    runtime.registerAgent(agent)
    const agent2 = { ...agent, id: 'agent-2', tenantId: 'tenant-2' }
    runtime.registerAgent(agent2)
    expect(runtime.listAgents('tenant-1')).toHaveLength(1)
    expect(runtime.listAgents()).toHaveLength(2)
  })

  it('should start and stop an agent', () => {
    runtime.registerAgent(agent)
    const state = runtime.startAgent('agent-1', 'mission-1')
    expect(state.status).toBe('waiting')
    expect(state.missionId).toBe('mission-1')
    runtime.stopAgent('agent-1')
    const stopped = runtime.getAgentState('agent-1')
    expect(stopped?.status).toBe('idle')
  })

  it('restores an orphaned running agent as waiting until its task resumes', () => {
    runtime.registerAgent(agent)
    const restored: AgentState = {
      agentId: agent.id,
      tenantId: agent.tenantId,
      missionId: 'mission-1',
      status: 'running',
      context: { currentTaskId: 'task-1', activeTaskId: 'task-1' },
      artifacts: [],
      assignedAt: new Date().toISOString(),
    }

    runtime.restoreAgentState(restored)

    expect(runtime.getAgentState(agent.id)).toMatchObject({
      status: 'waiting',
      context: {},
    })
  })

  it('preserves uncertain action checkpoints when an existing agent is started again', () => {
    runtime.registerAgent(agent)
    const restored: AgentState = {
      agentId: agent.id,
      tenantId: agent.tenantId,
      missionId: 'mission-1',
      status: 'failed',
      context: {
        currentTaskId: 'task-1',
        activeTaskId: 'task-1',
        executionCheckpoints: {
          'task-1': { pendingAction: 'send_message:{}' },
        },
      },
      artifacts: [],
      assignedAt: new Date().toISOString(),
    }
    runtime.restoreAgentState(restored)

    const restarted = runtime.startAgent(agent.id, 'mission-1')

    expect(restarted.status).toBe('failed')
    expect(restarted.context.executionCheckpoints).toEqual({
      'task-1': { pendingAction: 'send_message:{}' },
    })
  })

  it('resumes a task left running after an Agent Runtime restart', async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      const body = url.endsWith('/api/tool-executor/tools')
        ? { tools: [] }
        : url.endsWith('/api/brain/complete')
          ? { content: 'Recovered task output.', requestId: 'recovery-request' }
          : null
      if (!body) throw new Error(`Unexpected request: ${url}`)
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response
    }
    runtime = new AgentRuntime(new AgentExecutor({ fetcher }))
    runtime.registerAgent(agent)
    runtime.restoreAgentState({
      agentId: agent.id,
      tenantId: agent.tenantId,
      missionId: 'mission-1',
      status: 'running',
      context: { currentTaskId: 'task-restart', activeTaskId: 'task-restart' },
      artifacts: [],
      assignedAt: new Date().toISOString(),
    })
    runtime.restoreTask({
      taskId: 'task-restart',
      agentId: agent.id,
      type: 'research',
      input: { prompt: 'Complete the goal', context: {} },
      priority: 1,
      status: 'running',
      createdAt: new Date().toISOString(),
    })

    const completed = await runtime.executeTask(agent.id, 'task-restart')

    expect(completed).toMatchObject({
      status: 'completed',
      result: { output: 'Recovered task output.' },
    })
    expect(runtime.getAgentState(agent.id)?.status).toBe('waiting')
  })

  it('should submit, complete, and fail tasks', () => {
    runtime.registerAgent(agent)
    const task = runtime.submitTask('agent-1', {
      agentId: 'agent-1',
      type: 'code',
      input: { prompt: 'write code' },
      priority: 1,
      status: 'pending',
    } as Omit<AgentTask, 'taskId' | 'createdAt'>)
    expect(task.taskId).toBeDefined()
    const failed = runtime.failTask(task.taskId, 'error')
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toBe('error')
    const completed = runtime.completeTask(task.taskId, { output: 'done' })
    expect(completed).toMatchObject({ status: 'completed', result: { output: 'done' } })
    expect(completed?.error).toBeUndefined()
  })

  it('clears stale errors when restoring a completed task', () => {
    runtime.registerAgent(agent)
    const restored = runtime.submitTask('agent-1', {
      agentId: 'agent-1',
      type: 'code',
      input: { prompt: 'write code' },
      priority: 1,
      status: 'completed',
      error: 'stale failure',
    } as Omit<AgentTask, 'taskId' | 'createdAt'>)

    runtime.restoreTask(restored)

    expect(runtime.getTask(restored.taskId)).toMatchObject({ status: 'completed' })
    expect(runtime.getTask(restored.taskId)?.error).toBeUndefined()
  })

  it('should create collaboration and send messages', () => {
    const collab = runtime.createCollaboration(['agent-1', 'agent-2'])
    expect(collab.collaborationId).toBeDefined()
    const updated = runtime.sendMessage(collab.collaborationId, 'agent-1', 'hello')
    expect(updated?.messages).toHaveLength(1)
    expect(updated?.messages[0].content).toBe('hello')
  })

  it('should register and retrieve specializations', () => {
    runtime.registerAgent(agent)
    const spec: AgentSpecialization = {
      domain: 'javascript',
      confidence: 0.9,
      examples: ['ts', 'js'],
      lastUsed: new Date().toISOString(),
    }
    runtime.registerSpecialization('agent-1', spec)
    expect(runtime.getSpecializations('agent-1')).toContainEqual(spec)
  })
})

describe('REST endpoints', () => {
  it('should register an agent via POST /api/agent-runtime/agents', async () => {
    const res = await request(app)
      .post('/api/agent-runtime/missions/test-mission/agents')
      .send({
        id: 'agent-rest-1',
        tenantId: 'tenant-1',
        name: 'Rest Agent',
        description: 'REST test',
        type: 'assistant',
        systemPrompt: '',

        tools: [],
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    expect(res.status).toBe(201)
  })

  it('should list agents via GET /api/agent-runtime/agents', async () => {
    const res = await request(app).get('/api/agent-runtime/missions/test-mission/agents')
    expect(res.status).toBe(200)
    expect(res.body.agents).toBeDefined()
    expect(Array.isArray(res.body.agents)).toBe(true)
  })

  it('should start agent via POST /api/agent-runtime/agents/:id/start', async () => {
    await request(app)
      .post('/api/agent-runtime/missions/test-mission/agents')
      .send({
        id: 'agent-rest-2',
        tenantId: 'tenant-1',
        name: 'Rest Agent 2',
        description: 'REST test 2',
        type: 'assistant',
        systemPrompt: '',

        tools: [],
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    const res = await request(app)
      .post('/api/agent-runtime/missions/test-mission/agents/agent-rest-2/start')
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('waiting')
  })

  it('keeps mission-scoped agents and tasks within their registered mission', async () => {
    const missionId = `scope-test-${Date.now()}`
    const otherMissionId = `${missionId}-other`
    const agentId = `${missionId}-agent`
    const registration = await request(app)
      .post(`/api/agent-runtime/missions/${missionId}/agents`)
      .send({
        id: agentId,
        tenantId: 'tenant-scope-test',
        name: 'Scoped Agent',
        description: 'Mission scope regression',
        type: 'worker',
        systemPrompt: 'Complete the assigned task.',
        tools: [],
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

    expect(registration.status).toBe(201)
    expect(registration.body.metadata.missionId).toBe(missionId)
    const taskId = `${missionId}:task-1`
    await expect(request(app)
      .get(`/api/agent-runtime/missions/${otherMissionId}/agents/${agentId}`)
      .expect(404))
    await expect(request(app)
      .post(`/api/agent-runtime/missions/${otherMissionId}/agents/${agentId}/tasks`)
      .send({
        taskId: `${otherMissionId}:task-1`,
        type: 'work',
        input: { prompt: 'Should not be accepted.' },
        priority: 1,
        status: 'pending',
      })
      .expect(404))
    await request(app)
      .post(`/api/agent-runtime/missions/${missionId}/agents/${agentId}/tasks`)
      .send({
        taskId,
        type: 'work',
        input: { prompt: 'Retrieve this persisted task.' },
        priority: 1,
        status: 'pending',
      })
      .expect(201)
    const task = await request(app)
      .get(`/api/agent-runtime/missions/${missionId}/agents/${agentId}/tasks/${taskId}`)
      .expect(200)
    expect(task.body).toMatchObject({ agentId, taskId, status: 'pending' })
    await request(app)
      .get(`/api/agent-runtime/missions/${otherMissionId}/agents/${agentId}/tasks/${taskId}`)
      .expect(404)
    await request(app)
      .delete(`/api/agent-runtime/missions/${missionId}/agents/${agentId}`)
      .expect(204)
  })

  it('rejects registering an existing mission Agent ID in a different mission', async () => {
    const missionId = `collision-test-${Date.now()}`
    const agentId = `${missionId}-agent`
    const definition = {
      id: agentId,
      tenantId: 'tenant-scope-test',
      name: 'Scoped Agent',
      description: 'Mission ID collision regression',
      type: 'worker',
      systemPrompt: 'Complete the assigned task.',
      tools: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await request(app)
      .post(`/api/agent-runtime/missions/${missionId}/agents`)
      .send(definition)
      .expect(201)
    await request(app)
      .post(`/api/agent-runtime/missions/${missionId}-other/agents`)
      .send(definition)
      .expect(409)
    await request(app)
      .delete(`/api/agent-runtime/missions/${missionId}/agents/${agentId}`)
      .expect(204)
  })
})
