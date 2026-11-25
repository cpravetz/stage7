import { NextFunction, Router, Request, Response } from 'express'
import { runtime } from '../utils/sharedInstance'
import { asyncHandler, NextGenError } from '@stage7-nextgen/shared'
import { AgentDefinition, AgentLearningInput, AgentTask, AgentCollaboration, AgentSpecialization } from '../types'
import { z } from 'zod'

const router: Router = Router()

const AgentLearningInputSchema = z.object({
  domain: z.string().trim().min(1).max(80),
  guidance: z.string().trim().min(1).max(1_000),
  evidence: z.string().max(2_000).optional(),
  source: z.enum(['human_feedback', 'validated_outcome']),
  sourceRef: z.string().trim().min(1).max(200),
  recordedBy: z.string().trim().min(1).max(120),
  confidence: z.number().finite().min(0).max(1),
}).strict()

function requireMissionAgent(missionId: string, agentId: string): AgentDefinition {
  const agent = runtime.listAgentsForMission(missionId).find((candidate) => candidate.id === agentId)
  if (!agent || agent.metadata.missionId !== missionId) throw NextGenError.notFound('Mission agent not found')
  const state = runtime.getAgentState(agentId)
  if (state && (state.missionId !== missionId || state.tenantId !== agent.tenantId)) {
    throw NextGenError.notFound('Mission agent not found')
  }
  return agent
}

function requireMissionTask(agentId: string, taskId: string): AgentTask {
  const task = runtime.getTask(taskId)
  if (!task || task.agentId !== agentId) throw NextGenError.notFound('Agent task not found')
  return task
}

// Mission-scoped agent endpoints
router.post('/missions/:missionId/agents', asyncHandler(async (req: Request, res: Response) => {
  const { missionId } = req.params as { missionId: string }
  const agent = req.body as AgentDefinition
  const created = runtime.registerAgentForMission(missionId, agent)
  res.status(201).json(created)
}))

router.get('/missions/:missionId/agents', asyncHandler(async (req: Request, res: Response) => {
  const { missionId } = req.params as { missionId: string }
  const tenantId = req.query.tenantId as string | undefined
  let agents = runtime.listAgentsForMission(missionId)
  if (tenantId) agents = agents.filter((a) => a.tenantId === tenantId)
  const agentsWithState = await Promise.all(agents.map(async (agent) => {
    const state = runtime.getAgentState(agent.id)
    const context = state?.context || {}
    const activeTaskId = typeof context.currentTaskId === 'string'
      ? context.currentTaskId
      : typeof context.activeTaskId === 'string'
        ? context.activeTaskId
        : undefined
    const activeCheckpoint = activeTaskId
      ? await runtime.getExecutionCheckpoint(agent.id, activeTaskId)
      : undefined
    return {
      ...agent,
      status: state?.status || 'idle',
      ...(activeTaskId ? { activeTaskId } : {}),
      ...(activeCheckpoint ? {
        progress: {
          brainCalls: typeof activeCheckpoint.brainCalls === 'number' ? activeCheckpoint.brainCalls : 0,
          toolCalls: typeof activeCheckpoint.toolCalls === 'number' ? activeCheckpoint.toolCalls : 0,
          lastAction: typeof activeCheckpoint.lastAction === 'string'
            ? activeCheckpoint.lastAction.split(':', 1)[0]
            : '',
        },
      } : {}),
      ...(typeof context.lastError === 'string' ? { lastError: context.lastError } : {}),
    }
  }))
  res.json({ agents: agentsWithState })
}))

router.get('/missions/:missionId/agents/:id', asyncHandler((req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  const agent = requireMissionAgent(missionId, id)
  res.json(agent)
}))

router.delete('/missions/:missionId/agents/:id', asyncHandler((req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const deleted = runtime.unregisterAgent(id)
  if (!deleted) throw NextGenError.notFound('Agent not found')
  res.status(204).send()
}))

router.post('/missions/:missionId/agents/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const state = await runtime.startAgent(id, missionId)
  res.status(201).json(state)
}))

router.post('/missions/:missionId/agents/stop-all', asyncHandler(async (req: Request, res: Response) => {
  const { missionId } = req.params as { missionId: string }
  if (typeof (runtime as any).stopAllAgentsForMission === 'function') {
    await (runtime as any).stopAllAgentsForMission(missionId)
  } else {
    const agents = runtime.listAgentsForMission(missionId)
    await Promise.allSettled(agents.map((a) => runtime.stopAgent(a.id)))
  }
  res.status(204).send()
}))

router.get('/missions/:missionId/agents/:id/state', asyncHandler((req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const state = runtime.getAgentState(id)
  if (!state) throw NextGenError.notFound('Agent state not found')
  res.json(state)
}))

router.post('/missions/:missionId/agents/:id/learnings', asyncHandler(async (req: Request, res: Response) => {
  const { missionId, id } = req.params as { missionId: string; id: string }
  requireMissionAgent(missionId, id)
  const parsed = AgentLearningInputSchema.safeParse(req.body)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ')
    throw NextGenError.badRequest(`Invalid Agent learning: ${details}`)
  }
  const input = parsed.data as AgentLearningInput
  const learning = await runtime.recordLearning(id, missionId, input)
  res.status(201).json(learning)
}))

router.get('/missions/:missionId/agents/:id/learnings', asyncHandler(async (req: Request, res: Response) => {
  const { missionId, id } = req.params as { missionId: string; id: string }
  requireMissionAgent(missionId, id)
  const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined
  const learnings = await runtime.getLearningsForAgent(id, missionId, domain)
  res.json({ learnings })
}))

router.post('/missions/:missionId/agents/:id/tasks', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const taskData = req.body as Omit<AgentTask, 'agentId' | 'taskId' | 'createdAt'> & { taskId?: string }
  const task = await runtime.submitTask(id, taskData)
  res.status(201).json(task)
}))

router.get('/missions/:missionId/agents/:id/tasks/:taskId', asyncHandler((req: Request, res: Response) => {
  const { missionId, id, taskId } = req.params as { missionId: string; id: string; taskId: string }
  requireMissionAgent(missionId, id)
  res.json(requireMissionTask(id, taskId))
}))

router.get('/missions/:missionId/agents/:id/tasks/:taskId/events', (req: Request, res: Response) => {
  const { missionId, id, taskId } = req.params as { missionId: string; id: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)

  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }).flushHeaders()

  let unsubscribe = () => {}
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)
  const cleanup = () => {
    clearInterval(heartbeat)
    unsubscribe()
  }
  res.on('close', cleanup)
  res.on('finish', cleanup)
  unsubscribe = runtime.subscribeToTaskUpdates(taskId, (task) => {
    if (res.destroyed || res.writableEnded) return
    res.write(`event: task\ndata: ${JSON.stringify(task)}\n\n`)
    if (task.status === 'completed' || task.status === 'failed') res.end()
  })
})

router.post('/missions/:missionId/agents/:id/tasks/:taskId/execute', asyncHandler(async (req: Request, res: Response) => {
  const { missionId, id, taskId } = req.params as { missionId: string; id: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)
  const requireCompletedReceipt = req.body.requireCompletedReceipt === true
  const retryGuidance = req.body.retryGuidance
  if (retryGuidance !== undefined && (typeof retryGuidance !== 'string' || retryGuidance.length > 4_000)) {
    throw NextGenError.badRequest('Retry guidance must be a string of at most 4000 characters')
  }
  res.json(await runtime.executeTask(id, taskId, requireCompletedReceipt, 0, retryGuidance))
}))

router.post('/missions/:missionId/agents/:id/tasks/:taskId/complete', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId, taskId } = req.params as { id: string; missionId: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)
  const { result } = req.body as { result?: any }
  const task = await runtime.completeTask(taskId, result)
  if (!task) throw NextGenError.notFound('Task not found')
  res.json(task)
}))

router.post('/missions/:missionId/agents/:id/tasks/:taskId/fail', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId, taskId } = req.params as { id: string; missionId: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)
  const { error } = req.body as { error: string }
  if (!error) throw NextGenError.badRequest('error is required')
  const task = runtime.failTask(taskId, error)
  if (!task) throw NextGenError.notFound('Task not found')
  res.json(task)
}))

// Collaborations scoped to missions as well
router.post('/missions/:missionId/collaborations', asyncHandler((req: Request, res: Response) => {
  const participants = req.body as { participants: string[] }
  const collaboration = runtime.createCollaboration(participants.participants)
  res.status(201).json(collaboration)
}))

router.post('/missions/:missionId/collaborations/:id/messages', asyncHandler((req: Request, res: Response) => {
  const { from, content } = req.body as { from: string; content: string }
  if (!from || !content) throw NextGenError.badRequest('from and content are required')
  const collaboration = runtime.sendMessage(req.params.id as string, from, content)
  if (!collaboration) throw NextGenError.notFound('Collaboration not found')
  res.json(collaboration)
}))

router.post('/missions/:missionId/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const specialization = req.body as AgentSpecialization
  runtime.registerSpecialization(id, specialization)
  res.status(201).json(specialization)
}))

router.get('/missions/:missionId/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const specializations = runtime.getSpecializations(id)
  res.json(specializations)
}))

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Defense for throws outside asyncHandler-wrapped routes; wrapped routes are
  // handled by the shared handler, which serializes NextGenError.toJson().
  const appError = err instanceof NextGenError
    ? err
    : new NextGenError(err instanceof Error ? err.message : 'Internal server error', 500)
  const failureCode = err && typeof err === 'object' && 'failureCode' in err
    && typeof err.failureCode === 'string' && /^[A-Z_]+$/.test(err.failureCode)
    ? err.failureCode
    : undefined
  res.status(appError.statusCode).json({
    success: false,
    error: appError.message,
    statusCode: appError.statusCode,
    ...(failureCode ? { failureCode } : {}),
  })
})

export default router
