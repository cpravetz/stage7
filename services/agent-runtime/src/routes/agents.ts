import { NextFunction, Router, Request, Response } from 'express'
import { runtime } from '../utils/sharedInstance'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError, BadRequestError, NotFoundError } from '../utils/errors'
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
  if (!agent || agent.metadata.missionId !== missionId) throw new NotFoundError('Mission agent')
  const state = runtime.getAgentState(agentId)
  if (state && (state.missionId !== missionId || state.tenantId !== agent.tenantId)) {
    throw new NotFoundError('Mission agent')
  }
  return agent
}

function requireMissionTask(agentId: string, taskId: string): AgentTask {
  const task = runtime.getTask(taskId)
  if (!task || task.agentId !== agentId) throw new NotFoundError('Agent task')
  return task
}

// Backward-compatible unscoped routes for clients that predate mission-scoped URLs.
router.post('/agents', asyncHandler(async (req: Request, res: Response) => {
  const created = await runtime.registerAgent(req.body as AgentDefinition)
  res.status(201).json(created)
}))

router.delete('/agents/:id', asyncHandler((req: Request, res: Response) => {
  if (!runtime.unregisterAgent(req.params.id as string)) throw new NotFoundError('Agent')
  res.status(204).send()
}))

router.post('/agents/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const state = await runtime.startAgent(req.params.id as string, req.body.missionId as string)
  res.status(201).json(state)
}))

router.get('/agents/:id/state', asyncHandler((req: Request, res: Response) => {
  const state = runtime.getAgentState(req.params.id as string)
  if (!state) throw new NotFoundError('Agent state')
  res.json(state)
}))

router.post('/agents/:id/tasks', asyncHandler(async (req: Request, res: Response) => {
  const task = await runtime.submitTask(req.params.id as string, req.body as Omit<AgentTask, 'taskId' | 'createdAt'>)
  res.status(201).json(task)
}))

router.post('/agents/:id/tasks/:taskId/complete', asyncHandler(async (req: Request, res: Response) => {
  const task = runtime.completeTask(req.params.taskId as string, req.body.result)
  if (!task) throw new NotFoundError('Task')
  res.json(task)
}))

router.post('/collaborations', asyncHandler((req: Request, res: Response) => {
  res.status(201).json(runtime.createCollaboration((req.body as { participants: string[] }).participants))
}))

router.post('/collaborations/:id/messages', asyncHandler((req: Request, res: Response) => {
  const { from, content } = req.body as { from: string; content: string }
  if (!from || !content) throw new BadRequestError('from and content are required')
  const collaboration = runtime.sendMessage(req.params.id as string, from, content)
  if (!collaboration) throw new NotFoundError('Collaboration')
  res.json(collaboration)
}))

router.post('/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  runtime.registerSpecialization(req.params.id as string, req.body as AgentSpecialization)
  res.status(201).json(req.body)
}))

router.get('/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  res.json(runtime.getSpecializations(req.params.id as string))
}))

// Mission-scoped agent endpoints
router.post('/missions/:missionId/agents', asyncHandler(async (req: Request, res: Response) => {
  const { missionId } = req.params as { missionId: string }
  const agent = req.body as AgentDefinition
  const created = runtime.registerAgentForMission(missionId, agent)
  res.status(201).json(created)
}))

router.get('/missions/:missionId/agents', asyncHandler((req: Request, res: Response) => {
  const { missionId } = req.params as { missionId: string }
  const tenantId = req.query.tenantId as string | undefined
  let agents = runtime.listAgentsForMission(missionId)
  if (tenantId) agents = agents.filter((a) => a.tenantId === tenantId)
  res.json({ agents })
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
  if (!deleted) throw new NotFoundError('Agent')
  res.status(204).send()
}))

router.post('/missions/:missionId/agents/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const state = await runtime.startAgent(id, missionId)
  res.status(201).json(state)
}))

router.post('/missions/:missionId/agents/:id/stop', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  await runtime.stopAgent(id)
  res.status(204).send()
}))

router.get('/missions/:missionId/agents/:id/state', asyncHandler((req: Request, res: Response) => {
  const { id, missionId } = req.params as { id: string; missionId: string }
  requireMissionAgent(missionId, id)
  const state = runtime.getAgentState(id)
  if (!state) throw new NotFoundError('Agent state')
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
    throw new BadRequestError(`Invalid Agent learning: ${details}`)
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

router.post('/missions/:missionId/agents/:id/tasks/:taskId/execute', asyncHandler(async (req: Request, res: Response) => {
  const { missionId, id, taskId } = req.params as { missionId: string; id: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)
  const requireCompletedReceipt = req.body.requireCompletedReceipt === true
  const retryGuidance = req.body.retryGuidance
  if (retryGuidance !== undefined && (typeof retryGuidance !== 'string' || retryGuidance.length > 4_000)) {
    throw new BadRequestError('Retry guidance must be a string of at most 4000 characters')
  }
  res.json(await runtime.executeTask(id, taskId, requireCompletedReceipt, 0, retryGuidance))
}))

router.post('/missions/:missionId/agents/:id/tasks/:taskId/complete', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId, taskId } = req.params as { id: string; missionId: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)
  const { result } = req.body as { result?: any }
  const task = await runtime.completeTask(taskId, result)
  if (!task) throw new NotFoundError('Task')
  res.json(task)
}))

router.post('/missions/:missionId/agents/:id/tasks/:taskId/fail', asyncHandler(async (req: Request, res: Response) => {
  const { id, missionId, taskId } = req.params as { id: string; missionId: string; taskId: string }
  requireMissionAgent(missionId, id)
  requireMissionTask(id, taskId)
  const { error } = req.body as { error: string }
  if (!error) throw new BadRequestError('error is required')
  const task = runtime.failTask(taskId, error)
  if (!task) throw new NotFoundError('Task')
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
  if (!from || !content) throw new BadRequestError('from and content are required')
  const collaboration = runtime.sendMessage(req.params.id as string, from, content)
  if (!collaboration) throw new NotFoundError('Collaboration')
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
  const appError = err instanceof AppError
    ? err
    : new AppError(500, err instanceof Error ? err.message : 'Internal server error', false)
  res.status(appError.statusCode).json({
    success: false,
    error: appError.message,
    statusCode: appError.statusCode,
  })
})

export default router
