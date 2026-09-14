import { Router, Request, Response } from 'express'
import { runtime } from '../utils/sharedInstance'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError, BadRequestError, NotFoundError } from '../utils/errors'
import { AgentDefinition, AgentTask, AgentCollaboration, AgentSpecialization } from '../types'

const router: Router = Router()

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
  const { id } = req.params
  const agent = runtime.getAgent(id)
  if (!agent) throw new NotFoundError('Agent')
  res.json(agent)
}))

router.delete('/missions/:missionId/agents/:id', asyncHandler((req: Request, res: Response) => {
  const deleted = runtime.unregisterAgent(req.params.id as string)
  if (!deleted) throw new NotFoundError('Agent')
  res.status(204).send()
}))

router.post('/missions/:missionId/agents/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const { missionId } = req.params as { missionId: string }
  const state = await runtime.startAgent(req.params.id as string, missionId)
  res.status(201).json(state)
}))

router.post('/missions/:missionId/agents/:id/stop', asyncHandler((req: Request, res: Response) => {
  runtime.stopAgent(req.params.id as string)
  res.status(204).send()
}))

router.get('/missions/:missionId/agents/:id/state', asyncHandler((req: Request, res: Response) => {
  const state = runtime.getAgentState(req.params.id as string)
  if (!state) throw new NotFoundError('Agent state')
  res.json(state)
}))

router.post('/missions/:missionId/agents/:id/tasks', asyncHandler(async (req: Request, res: Response) => {
  const taskData = req.body as Omit<AgentTask, 'taskId' | 'createdAt'>
  const task = await runtime.submitTask(req.params.id as string, taskData)
  res.status(201).json(task)
}))

router.post('/missions/:missionId/agents/:id/tasks/:taskId/complete', asyncHandler(async (req: Request, res: Response) => {
  const { result } = req.body as { result?: any }
  const task = await runtime.completeTask(req.params.taskId as string, result)
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
  const specialization = req.body as AgentSpecialization
  runtime.registerSpecialization(req.params.id as string, specialization)
  res.status(201).json(specialization)
}))

router.get('/missions/:missionId/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  const specializations = runtime.getSpecializations(req.params.id as string)
  res.json(specializations)
}))

export default router
