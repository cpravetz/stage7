import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { MCPServerConfig } from '../services/MCPClient'
import { ValidationError } from '../utils/errors'
import asyncHandler from '../utils/asyncHandler'
import logger from '../utils/logger'
import { executor } from '../utils/sharedInstance'

const router: Router = Router()

const DEFAULT_CONFIG_PATH = '/tmp/stage7-mcp/mcp-servers.json'

/**
 * Header names whose values are always treated as secrets. Anything matched
 * here is redacted in both the HTTP response and the persisted file.
 */
const SECRET_HEADER_PATTERN = /authorization|api[-_]?key|token|secret|password|passwd|cookie/i

/**
 * Env var names that look like credentials. Their VALUES are never persisted
 * and never returned — only the key names are kept, so an operator can see
 * which variables a server needs without the file leaking credentials.
 */
const SECRET_ENV_PATTERN = /token|secret|password|passwd|key|credential|auth/i

export interface PersistedMCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  /** env KEY names only — values are intentionally dropped before persisting */
  envKeys?: string[]
  /** header KEY names only — values are intentionally dropped before persisting */
  headerKeys?: string[]
  enabled: boolean
  updatedAt: string
}

export interface PublicMCPServerView {
  id: string
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  envKeys: string[]
  headerKeys: string[]
  enabled: boolean
  updatedAt: string
}

function resolveConfigPath(): string {
  return process.env.MCP_CONFIG_PATH || DEFAULT_CONFIG_PATH
}

function transportOf(config: MCPServerConfig): 'stdio' | 'http' {
  return config.url ? 'http' : 'stdio'
}

function toPersisted(config: MCPServerConfig): PersistedMCPServerConfig {
  return {
    id: config.id,
    name: config.name,
    transport: transportOf(config),
    ...(config.command ? { command: config.command } : {}),
    ...(config.args ? { args: config.args } : {}),
    ...(config.url ? { url: config.url } : {}),
    envKeys: Object.keys(config.env || {}),
    headerKeys: Object.keys(config.headers || {}),
    enabled: true,
    updatedAt: new Date().toISOString(),
  }
}

function isPersistedConfig(value: unknown): value is PersistedMCPServerConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; name?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.name === 'string'
}

export function loadPersistedMCPServers(): PersistedMCPServerConfig[] {
  const file = resolveConfigPath()
  try {
    if (!fs.existsSync(file)) return []
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!Array.isArray(parsed)) {
      logger.warn({ file }, 'MCP config file is not an array, ignoring')
      return []
    }
    return parsed.filter(isPersistedConfig)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), file }, 'MCP config file unreadable, ignoring')
    return []
  }
}

export function savePersistedMCPServers(servers: PersistedMCPServerConfig[]): void {
  const file = resolveConfigPath()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmpFile = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmpFile, JSON.stringify(servers, null, 2), 'utf-8')
    fs.renameSync(tmpFile, file)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), file }, 'Failed to persist MCP config')
  }
}

function toPublicView(config: PersistedMCPServerConfig): PublicMCPServerView {
  return {
    id: config.id,
    name: config.name,
    transport: config.transport,
    ...(config.command ? { command: config.command } : {}),
    ...(config.args ? { args: config.args } : {}),
    ...(config.url ? { url: config.url } : {}),
    envKeys: config.envKeys || [],
    headerKeys: config.headerKeys || [],
    enabled: config.enabled !== false,
    updatedAt: config.updatedAt,
  }
}

const mcpServerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url().optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    headers: z.record(z.string()).optional(),
  })
  .refine((data) => Boolean(data.url) || Boolean(data.command), {
    message: 'Either "url" (http transport) or "command" (stdio transport) is required',
  })

router.get(
  '/mcp/servers',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ servers: loadPersistedMCPServers().map(toPublicView) })
  })
)

router.post(
  '/mcp/servers',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = mcpServerSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '))
    }
    const data = parsed.data

    if (data.url && data.command) {
      throw new ValidationError('Provide either "url" (http transport) or "command" (stdio transport), not both')
    }

    // Secrets ARE handed to the live MCP client in memory (an HTTP MCP server
    // needs its Authorization header to work at all). They are never echoed in
    // the response, never logged, and never written to disk: the persisted
    // record keeps env/header KEY NAMES only. A persisted server therefore has
    // to be re-supplied with its credentials on restart.
    const config: MCPServerConfig = {
      id: data.id,
      name: data.name,
      ...(data.url ? { url: data.url } : { command: data.command as string, args: data.args || [] }),
      ...(data.env ? { env: data.env } : {}),
      ...(data.headers ? { headers: data.headers } : {}),
    }

    executor.registerMCPServer(config)

    const persisted = loadPersistedMCPServers().filter((existing) => existing.id !== data.id)
    persisted.push(toPersisted(config))
    savePersistedMCPServers(persisted)

    logger.info({ serverId: data.id, name: data.name, transport: transportOf(config) }, 'MCP server registered over HTTP')
    res.status(201).json({ server: toPublicView(toPersisted(config)) })
  })
)

router.delete(
  '/mcp/servers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const existing = loadPersistedMCPServers()

    executor.unregisterMCPServer(id)
    savePersistedMCPServers(existing.filter((config) => config.id !== id))

    logger.info({ serverId: id }, 'MCP server unregistered')
    res.status(204).send()
  })
)

export default router
