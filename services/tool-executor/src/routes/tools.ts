import { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { Tool, PluginGenerationRequest, PluginGenerationResult, CredentialRequiredError, ConfirmationRequiredError, ApprovalSummary } from '../types'
import { createToolSchema } from '../types/manifest'
import { ToolNotFoundError, ValidationError } from '../utils/errors'
import asyncHandler from '../utils/asyncHandler'
import logger from '../utils/logger'
import { toolRegistry as registry, executor, pluginGenerator as generator } from '../utils/sharedInstance'
import { readFile } from 'fs/promises'
import { join, basename } from 'path'

const router: Router = Router()

const toolSchema = createToolSchema

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

    // Skills require an assistant context — reject direct execution without assistant id
    if (tool.isSkill && !req.header('x-assistant-id')) {
      throw new ValidationError('Skill execution requires assistant context (X-Assistant-Id header)');
    }

    try {
      const execution = await executor.executeOrRequestCredentials(
        tool,
        req.body.input || {},
        req.body.credentials,
        {
          workspaceId: req.body.workspaceId,
          assistantId: req.body.assistantId || req.header('x-assistant-id'),
          context: req.body.context,
        }
      )

      if (execution instanceof CredentialRequiredError) {
        res.status(428).json({ error: execution.message, request: execution.request })
        return;
      }

      const statusCode = execution.status === 'failed' ? 500 : 200
      res.status(statusCode).json(execution)
    } catch (err) {
      if (err instanceof ConfirmationRequiredError) {
        res.status(403).json({ error: err.message, toolId: err.toolId, toolName: err.toolName });
        return;
      }
      throw err;
    }
  })
)

router.post(
  '/tools/execute',
  asyncHandler(async (req: Request, res: Response) => {
    // Support both nested {tool, input, credentials} and flat {id, name, type, manifest, input, credentials, isSkill}
    const body = req.body as Record<string, unknown>;
    let tool: Partial<Tool>;
    let input: Record<string, unknown>;
    let credentials: Record<string, string> | undefined;

    if (body.tool && typeof body.tool === 'object') {
      // Nested payload: {tool, input, credentials}
      tool = body.tool as Partial<Tool>;
      input = (body.input as Record<string, unknown>) || {};
      credentials = body.credentials as Record<string, string> | undefined;
    } else {
      // Flat payload: {id, name, type, manifest, input, credentials, isSkill}
      const { tool: _tool, input: _input, credentials: _creds, ...toolFields } = body;
      tool = toolFields as Partial<Tool>;
      input = (body.input as Record<string, unknown>) || {};
      credentials = body.credentials as Record<string, string> | undefined;
    }

    if (!tool.name || !tool.type) {
      throw new ValidationError('tool.name and tool.type are required');
    }

    // Look up the registered tool/skill by name/id first so the assistant's
    // declared skill name resolves to the real implementation (code, manifest,
    // inputSchema) instead of an empty stub.
    const registered = tool.name ? registry.list().find((t) => t.name === tool.name || t.id === tool.name) : undefined;
    
    let fullTool: Tool;
    if (registered) {
      fullTool = registered;
      // Preserve isSkill from incoming payload if provided
      if (tool.isSkill !== undefined) {
        fullTool = { ...fullTool, isSkill: tool.isSkill };
      }
    } else {
      fullTool = {
        id: (tool.id as string) || `tool-${Date.now()}`,
        name: tool.name as string,
        description: (tool.description as string) || '',
        type: tool.type as Tool['type'],
        manifest: (tool.manifest as Record<string, unknown>) || {},
        inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
        outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        isSkill: tool.isSkill,
      };
    }

    // If the resolved tool is a skill, require assistant context header
    if (fullTool.isSkill && !req.header('x-assistant-id') && !req.body.assistantId) {
      throw new ValidationError('Skill execution requires assistant context (X-Assistant-Id header or assistantId body field)');
    }

    try {
      const execution = await executor.executeOrRequestCredentials(
        fullTool,
        input,
        credentials,
        {
          workspaceId: req.body.workspaceId,
          assistantId: req.body.assistantId || req.header('x-assistant-id'),
          context: req.body.context,
        }
      )

      if (execution instanceof CredentialRequiredError) {
        res.status(428).json({ error: execution.message, request: execution.request });
        return;
      }

      const statusCode = execution.status === 'failed' ? 500 : 200;
      res.status(statusCode).json(execution);
    } catch (err) {
      if (err instanceof ConfirmationRequiredError) {
        res.status(403).json({ error: err.message, toolId: err.toolId, toolName: err.toolName });
        return;
      }
      throw err;
    }
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

router.post(
  '/tools/:id/preview',
  asyncHandler(async (req: Request, res: Response) => {
    const tool = registry.get(req.params.id)
    if (!tool) {
      throw new ToolNotFoundError(req.params.id)
    }
    const summary = executor.previewAction(tool, req.body.input || {})
    res.json({ summary })
  })
)

const referenceDataLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

router.get(
  '/tools/reference-data/:sourceId',
  referenceDataLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { sourceId } = req.params
    const safeSourceId = basename(sourceId).replace(/[^a-zA-Z0-9_-]/g, '')
    const workspaceId = req.query.workspaceId as string | undefined
    const careerHome = process.env.CAREER_HOME || '/tmp/career'

    if (!safeSourceId) {
      res.json({
        success: true,
        data: {
          listings: [],
          source: sourceId,
          workspaceId,
        },
      })
      return
    }

    const candidatePaths = [
      join(careerHome, 'listings', 'default.json'),
      join('/tmp', safeSourceId, 'data.json'),
      join('/tmp', 'stage7-store', `${safeSourceId}.json`),
      join('/tmp', `${safeSourceId}.json`),
      join(process.cwd(), 'store', `${safeSourceId}.json`),
    ]

    let listings: unknown[] = []
    for (const path of candidatePaths) {
      try {
        const fileContent = await readFile(path, 'utf-8')
        const data = JSON.parse(fileContent)
        if (Array.isArray(data)) {
          listings = data
        } else if (data && typeof data === 'object') {
          listings = data.listings || data.items || data.ranked || data.results || data.data || []
        }
        if (Array.isArray(listings) && listings.length > 0) {
          break
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn({ err, sourceId, path }, 'Failed to read reference data file candidate')
        }
      }
    }

    res.json({
      success: true,
      data: {
        listings: Array.isArray(listings) ? listings : [],
        source: sourceId,
        workspaceId,
      },
    })
  })
)

export default router
