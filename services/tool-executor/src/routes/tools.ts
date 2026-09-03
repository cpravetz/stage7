import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { Tool, PluginGenerationRequest, PluginGenerationResult } from '../types'
import { ToolNotFoundError, ValidationError } from '../utils/errors'
import asyncHandler from '../utils/asyncHandler'
import { toolRegistry as registry, toolExecutor as executor, pluginGenerator as generator } from '../utils/sharedInstance'

const router: Router = Router()

const toolSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['mcp', 'openapi', 'code']),
  manifest: z.record(z.any()),
  inputSchema: z.record(z.any()).optional(),
  outputSchema: z.record(z.any()).optional(),
})

const pluginGenerationSchema = z.object({
  description: z.string(),
  requirements: z.array(z.string()).optional(),
  context: z.record(z.any()).optional(),
})

router.post(
  '/tools',
  asyncHandler(async (req: Request, res: Response) => {
    const data = toolSchema.parse(req.body)
    const tool: Tool = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    registry.register(tool)
    res.status(201).json(tool)
  })
)

router.get(
  '/tools',
  asyncHandler(async (_req: Request, res: Response) => {
    const tools = registry.list();
    res.json({ tools });
  })
)

  router.get(
  '/tools/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const tool = registry.get(req.params.id)
    if (!tool) {
      throw new ToolNotFoundError(req.params.id)
    }
    res.json(tool)
  })
)

router.delete(
  '/tools/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = registry.unregister(req.params.id)
    if (!deleted) {
      throw new ToolNotFoundError(req.params.id)
    }
    res.status(204).send()
  })
)

router.post(
  '/tools/:id/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const tool = registry.get(req.params.id)
    if (!tool) {
      throw new ToolNotFoundError(req.params.id)
    }

    const execution = await executor.execute(tool, req.body.input || {})
    const statusCode = execution.status === 'failed' ? 500 : 200
    res.status(statusCode).json(execution)
  })
)

router.post(
  '/plugins/generate',
  asyncHandler(async (req: Request, res: Response) => {
    const data = pluginGenerationSchema.parse(req.body)
    const request: PluginGenerationRequest = {
      description: data.description,
      requirements: data.requirements,
      context: data.context,
    }
    const result: PluginGenerationResult = await generator.generate(request)
    const statusCode = result.success ? 201 : 400
    res.status(statusCode).json(result)
  })
)

export default router
