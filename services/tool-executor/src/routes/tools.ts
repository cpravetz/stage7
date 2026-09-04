import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { Tool, PluginGenerationRequest, PluginGenerationResult, CredentialRequiredError } from '../types'
import { ToolNotFoundError, ValidationError } from '../utils/errors'
import asyncHandler from '../utils/asyncHandler'
import logger from '../utils/logger'
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

    const execution = await executor.executeOrRequestCredentials(tool, req.body.input || {}, req.body.credentials)

    if (execution instanceof CredentialRequiredError) {
      res.status(428).json({ error: execution.message, request: execution.request })
      return;
    }

    const statusCode = execution.status === 'failed' ? 500 : 200
    res.status(statusCode).json(execution)
  })
)

router.post(
  '/tools/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const { tool, input, credentials } = req.body as { tool?: Partial<Tool>; input?: Record<string, unknown>; credentials?: Record<string, string> }
    if (!tool?.name || !tool?.type) {
      throw new ValidationError('tool.name and tool.type are required')
    }

    const fullTool: Tool = {
      id: tool.id || `tool-${Date.now()}`,
      name: tool.name,
      description: tool.description || '',
      type: tool.type as Tool['type'],
      manifest: tool.manifest || {},
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const execution = await executor.executeOrRequestCredentials(fullTool, input || {}, credentials)

    if (execution instanceof CredentialRequiredError) {
      res.status(428).json({ error: execution.message, request: execution.request })
      return;
    }

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
    if (result.success && result.tool) {
      try {
        const deployed = await generator.deploy(result.tool)
        if (deployed.success) {
          logger.info({ toolId: result.tool.id, deployPath: deployed.deployPath }, 'Generated plugin deployed and registered')
        } else {
          logger.warn({ toolId: result.tool.id, error: deployed.error }, 'Generated plugin deployment failed')
        }
      } catch (deployErr) {
        logger.warn({ toolId: result.tool.id, err: deployErr instanceof Error ? deployErr.message : String(deployErr) }, 'Generated plugin deployment threw')
      }
    }
    const statusCode = result.success ? 201 : 400
    res.status(statusCode).json(result)
  })
)

const credentialSubmissionSchema = z.object({
  credentials: z.record(z.string()),
  storeInVault: z.boolean().optional(),
  vaultSecretId: z.string().optional(),
})

router.get(
  '/executions/:executionId/credential-request',
  asyncHandler(async (req: Request, res: Response) => {
    const request = executor.getCredentialRequest(req.params.executionId)
    if (!request) {
      throw new ToolNotFoundError('credential request')
    }
    res.json(request)
  })
)

router.post(
  '/executions/:executionId/credentials',
  asyncHandler(async (req: Request, res: Response) => {
    const submission = credentialSubmissionSchema.parse(req.body)
    const result = await executor.submitCredentials(req.params.executionId, submission)

    if (result instanceof CredentialRequiredError) {
      res.status(428).json({ error: result.message, request: result.request })
      return;
    }

    const statusCode = result.status === 'completed' ? 200 : 500
    res.status(statusCode).json(result)
  })
)

export default router
