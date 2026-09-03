import { Router, Request, Response } from 'express'
import { runtime } from '../utils/sharedInstance'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError, BadRequestError, NotFoundError } from '../utils/errors'
import { AgentDefinition, AgentTask, AgentCollaboration, AgentSpecialization } from '../types'

const router: Router = Router()

router.post('/agents', asyncHandler((req: Request, res: Response) => {
  const agent = req.body as AgentDefinition
  runtime.registerAgent(agent)
  res.status(201).json(agent)
}))

router.get('/agents', asyncHandler((req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string | undefined
  const agents = runtime.listAgents(tenantId)
  res.json({ agents })
}))

router.get('/agents/:id', asyncHandler((req: Request, res: Response) => {
  const agent = runtime.getAgent(req.params.id as string)
  if (!agent) throw new NotFoundError('Agent')
  res.json(agent)
}))

router.delete('/agents/:id', asyncHandler((req: Request, res: Response) => {
  const deleted = runtime.unregisterAgent(req.params.id as string)
  if (!deleted) throw new NotFoundError('Agent')
  res.status(204).send()
}))

router.post('/agents/:id/start', asyncHandler((req: Request, res: Response) => {
  const { missionId } = req.body as { missionId: string }
  if (!missionId) throw new BadRequestError('missionId is required')
  const state = runtime.startAgent(req.params.id as string, missionId)
  res.status(201).json(state)
}))

router.post('/agents/:id/stop', asyncHandler((req: Request, res: Response) => {
  runtime.stopAgent(req.params.id as string)
  res.status(204).send()
}))

router.get('/agents/:id/state', asyncHandler((req: Request, res: Response) => {
  const state = runtime.getAgentState(req.params.id as string)
  if (!state) throw new NotFoundError('Agent state')
  res.json(state)
}))

router.post('/agents/:id/tasks', asyncHandler((req: Request, res: Response) => {
  const taskData = req.body as Omit<AgentTask, 'taskId' | 'createdAt'>
  const task = runtime.submitTask(req.params.id as string, taskData)
  res.status(201).json(task)
}))

router.post('/agents/:id/tasks/:taskId/complete', asyncHandler((req: Request, res: Response) => {
  const { result } = req.body as { result?: any }
  const task = runtime.completeTask(req.params.taskId as string, result)
  if (!task) throw new NotFoundError('Task')
  res.json(task)
}))

router.post('/collaborations', asyncHandler((req: Request, res: Response) => {
  const { participants } = req.body as { participants: string[] }
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new BadRequestError('participants array is required')
  }
  const collaboration = runtime.createCollaboration(participants)
  res.status(201).json(collaboration)
}))

router.post('/collaborations/:id/messages', asyncHandler((req: Request, res: Response) => {
  const { from, content } = req.body as { from: string; content: string }
  if (!from || !content) throw new BadRequestError('from and content are required')
  const collaboration = runtime.sendMessage(req.params.id as string, from, content)
  if (!collaboration) throw new NotFoundError('Collaboration')
  res.json(collaboration)
}))

router.post('/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  const specialization = req.body as AgentSpecialization
  runtime.registerSpecialization(req.params.id as string, specialization)
  res.status(201).json(specialization)
}))

router.get('/agents/:id/specializations', asyncHandler((req: Request, res: Response) => {
  const specializations = runtime.getSpecializations(req.params.id as string)
  res.json(specializations)
}))

export default router
