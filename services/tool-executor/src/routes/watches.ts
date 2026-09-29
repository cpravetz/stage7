import { Router, Request, Response } from 'express'
import { z } from 'zod'
import asyncHandler from '../utils/asyncHandler'
import logger from '../utils/logger'

const router: Router = Router()

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || ''
const WATCH_COLLECTION = 'watches'

async function artifactsFetch(path: string, init?: RequestInit): Promise<any | null> {
  if (!ARTIFACTS_URL) return null
  try {
    const res = await fetch(`${ARTIFACTS_URL}/api/artifacts/documents${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), path }, 'Artifacts persistence unavailable')
    return null
  }
}

const CreateWatchSchema = z.object({
  id: z.string().optional(),
  ownerUserId: z.string(),
  name: z.string(),
  query: z.string(),
  companies: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  cadence: z.string().optional(),
  enabled: z.boolean().optional(),
  autoApply: z.boolean().optional(),
  // The skill this watch runs. Optional so watches created before this field existed keep
  // working; when absent the runner falls back to the legacy default and says so.
  skill: z.string().optional(),
  assistantId: z.string().optional(),
  arguments: z.record(z.unknown()).optional(),
})

const UpdateWatchSchema = z.object({
  data: z.record(z.unknown()).optional(),
})

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const parsed = CreateWatchSchema.parse(req.body)

  // Enforce user rule: disallow per-company probing when companies is empty
  const companies = Array.isArray(parsed.companies) && parsed.companies.length > 0 ? parsed.companies : undefined

  const watch = {
    id: parsed.id || `watch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tenantId: 'default',
    collection: WATCH_COLLECTION,
    data: {
      ownerUserId: parsed.ownerUserId,
      name: parsed.name,
      query: parsed.query,
      companies,
      allowCompanyProbing: companies ? true : false,
      locations: parsed.locations || [],
      cadence: parsed.cadence || 'daily',
      enabled: parsed.enabled === undefined ? true : parsed.enabled,
      autoApply: parsed.autoApply === true,
      skill: parsed.skill || null,
      assistantId: parsed.assistantId || null,
      arguments: parsed.arguments || null,
      lastRunAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }

  const created = await artifactsFetch('/', {
    method: 'POST',
    body: JSON.stringify(watch),
  })
  if (!created) throw new Error('Failed to persist watch')
  res.status(201).json(created)
}))

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  // list watches
  const result = await artifactsFetch('/search', {
    method: 'POST',
    body: JSON.stringify({ collection: WATCH_COLLECTION, limit: 500 }),
  })
  const docs = (result?.documents as any[]) || []
  res.json({ watches: docs.map((d) => d) })
}))

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const doc = await artifactsFetch(`/${encodeURIComponent(req.params.id)}`)
  if (!doc) return res.status(404).json({ error: 'Watch not found' })
  res.json(doc)
}))

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const parsed = UpdateWatchSchema.parse(req.body)

  // If companies provided and empty, ensure allowCompanyProbing false
  const watchData: any = parsed.data
  if (watchData && Object.prototype.hasOwnProperty.call(watchData, 'companies')) {
    const comps = watchData.companies
    if (Array.isArray(comps) && comps.length === 0) {
      watchData.companies = undefined
      watchData.allowCompanyProbing = false
    }
  }

  const updated = await artifactsFetch(`/${encodeURIComponent(req.params.id)}`, {
    method: 'PUT',
    // The documents API merges under a top-level `data` envelope. Sending the fields flat made every
    // watch update a silent no-op that still answered 200.
    body: JSON.stringify({ data: parsed.data || {} }),
  })
  if (!updated) return res.status(404).json({ error: 'Watch not found' })
  res.json(updated)
}))

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await artifactsFetch(`/${encodeURIComponent(req.params.id)}`, { method: 'DELETE' })
  if (deleted === null) return res.status(404).json({ error: 'Watch not found' })
  res.status(204).send()
}))

export default router
