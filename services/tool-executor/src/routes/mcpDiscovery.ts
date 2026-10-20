/**
 * MCP Tool Discovery routes (§3-9).
 *
 * Permission-based discovery with automatic integration:
 *   POST    /mcp/discover            - search MCP libraries, request permission
 *   POST    /mcp/permission/:id/decide - grant or deny a permission request
 *   GET     /mcp/grants              - list active granted tools (visibility §9)
 *   DELETE  /mcp/grants/:id          - revoke a grant (§9)
 *   GET     /mcp/audit               - audit log (§9)
 *   GET     /mcp/sources             - list approved MCP library sources (§5)
 */

import { Router, Request, Response, NextFunction } from 'express'
import asyncHandler from '../utils/asyncHandler'
import { z } from 'zod'
import logger from '../utils/logger'
import { mcpToolExecutive } from '../services/MCPToolExecutive'
import {
  buildPermissionRequest,
  getPermissionRequest,
  decidePermission,
  renderPermissionPrompt,
  listActiveGrants,
  revokeGrant,
} from '../services/ToolPermissionService'
import { toolAuditLog } from '../services/ToolAuditLog'
import { mcpLibrarySourceRegistry } from '../services/MCPLibrarySourceRegistry'
import { MCPToolDiscoveryRequiredError } from '../types'
import type { PermissionDecision } from '../types/mcp-discovery'

const router: Router = Router()

const discoverSchema = z.object({
  capability: z.string().min(1),
  task: z.string().optional(),
  actor: z.string().optional(),
  preApproveCurated: z.boolean().optional().default(true),
  preApprovedBy: z.string().optional(),
})

const decideSchema = z.object({
  decision: z.enum(['granted', 'denied']),
  scope: z.enum(['task', 'assistant', 'all_agents']).optional(),
  decidedBy: z.string().min(1),
  expiryDays: z.number().optional(),
})

router.post(
  '/mcp/discover',
  asyncHandler(async (req: Request, res: Response) => {
    const data = discoverSchema.parse(req.body)
    const resolution = await mcpToolExecutive.discoverAndRequestPermission({
      capability: data.capability,
      task: data.task,
      actor: data.actor,
      preApproveCurated: data.preApproveCurated,
      preApprovedBy: data.preApprovedBy,
    })

    if (resolution.satisfied && resolution.tool) {
      return res.json({
        satisfied: true,
        tool: resolution.tool,
        grant: resolution.grant,
        message: 'Capability resolved via integrated or pre-approved MCP tool.',
      })
    }

    if (resolution.permissionRequest) {
      return res.status(202).json({
        satisfied: false,
        permissionRequired: true,
        request: resolution.permissionRequest,
        prompt: renderPermissionPrompt(resolution.permissionRequest),
        candidate: resolution.candidate,
        message: resolution.permissionRequest
          ? `Permission required to use MCP tool "${resolution.candidate?.name}".`
          : resolution.error,
      })
    }

    return res.status(404).json({
      satisfied: false,
      error: resolution.error || 'No suitable MCP tool found for this capability.',
    })
  })
)

router.post(
  '/mcp/permission/:requestId/decide',
  asyncHandler(async (req: Request, res: Response) => {
    const { requestId } = req.params
    const data = decideSchema.parse(req.body)
    const decision: PermissionDecision = data.decision

    const resolution = await mcpToolExecutive.decidePermission({
      requestId,
      decision,
      scope: data.scope,
      decidedBy: data.decidedBy,
      expiryDays: data.expiryDays,
    })

    if (resolution.satisfied && resolution.tool) {
      return res.json({
        satisfied: true,
        decision: 'granted',
        tool: resolution.tool,
        grant: resolution.grant,
        message: 'Permission granted and MCP tool integrated automatically.',
      })
    }

    return res.status(403).json({
      satisfied: false,
      decision: 'denied',
      error: resolution.error || 'Permission denied.',
    })
  })
)

router.get(
  '/mcp/grants',
  asyncHandler(async (_req: Request, res: Response) => {
    const grants = listActiveGrants()
    res.json({ grants })
  })
)

router.delete(
  '/mcp/grants/:grantId',
  asyncHandler(async (req: Request, res: Response) => {
    const { grantId } = req.params
    const { revokedBy } = z.object({ revokedBy: z.string().min(1) }).parse(req.query)
    const revoked = mcpToolExecutive.revokeGrant(grantId, revokedBy)
    if (!revoked) {
      return res.status(404).json({ error: 'Grant not found' })
    }
    return res.status(204).send()
  })
)

router.get(
  '/mcp/audit',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const toolId = req.query.toolId as string | undefined
    const type = req.query.type as string | undefined

    let entries
    if (toolId) {
      entries = toolAuditLog.byTool(toolId, limit)
    } else if (type) {
      entries = toolAuditLog.byType(type as any, limit)
    } else {
      entries = toolAuditLog.recent(limit)
    }
    res.json({ entries, count: entries.length })
  })
)

router.get(
  '/mcp/sources',
  asyncHandler(async (_req: Request, res: Response) => {
    const sources = mcpLibrarySourceRegistry.allSources().map((s) => ({
      id: s.id,
      name: s.name,
      transport: s.transport,
      tier: s.tier,
      enabled: s.enabled,
    }))
    res.json({ sources })
  })
)

export default router
