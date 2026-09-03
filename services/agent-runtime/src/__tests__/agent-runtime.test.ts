import { AgentRuntime } from '../services/AgentRuntime'
import request from 'supertest'
import express from 'express'
import agentsRouter from '../routes/agents'
import { AgentDefinition, AgentTask, AgentSpecialization } from '../types'

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
    model: 'gpt-4',
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
    expect(state.status).toBe('running')
    expect(state.missionId).toBe('mission-1')
    runtime.stopAgent('agent-1')
    const stopped = runtime.getAgentState('agent-1')
    expect(stopped?.status).toBe('idle')
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
    const completed = runtime.completeTask(task.taskId, { output: 'done' })
    expect(completed?.status).toBe('completed')
    const failed = runtime.failTask(task.taskId, 'error')
    expect(failed?.status).toBe('failed')
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
      .post('/api/agent-runtime/agents')
      .send({
        id: 'agent-rest-1',
        tenantId: 'tenant-1',
        name: 'Rest Agent',
        description: 'REST test',
        type: 'assistant',
        systemPrompt: '',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    expect(res.status).toBe(201)
  })

  it('should list agents via GET /api/agent-runtime/agents', async () => {
    const res = await request(app).get('/api/agent-runtime/agents')
    expect(res.status).toBe(200)
    expect(res.body.agents).toBeDefined()
    expect(Array.isArray(res.body.agents)).toBe(true)
  })

  it('should start agent via POST /api/agent-runtime/agents/:id/start', async () => {
    await request(app)
      .post('/api/agent-runtime/agents')
      .send({
        id: 'agent-rest-2',
        tenantId: 'tenant-1',
        name: 'Rest Agent 2',
        description: 'REST test 2',
        type: 'assistant',
        systemPrompt: '',
        model: 'gpt-4',
        tools: [],
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    const res = await request(app)
      .post('/api/agent-runtime/agents/agent-rest-2/start')
      .send({ missionId: 'mission-1' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('running')
  })
})
