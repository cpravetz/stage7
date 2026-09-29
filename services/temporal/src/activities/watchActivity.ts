import { logger } from '@stage7-nextgen/shared'

/** Where watch run records are stored. */
export const WATCH_RESULTS_COLLECTION = 'watch-results'
/** Where watch definitions live. */
export const WATCHES_COLLECTION = 'watches'

/** Used only when a watch does not name a skill of its own. */
export const DEFAULT_WATCH_SKILL = 'career-job-discovery'
const DEFAULT_WATCH_ASSISTANT = 'watch-runner'

const artifactsUrl = (): string => process.env.ARTIFACTS_URL || ''

/** Throws when a call did not produce a 2xx, so a silent 500 cannot be mistaken for success. */
async function requireOk(res: Response, what: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    detail = (await res.text()).slice(0, 300)
  } catch {
    detail = '<unreadable body>'
  }
  throw new Error(`${what} failed: HTTP ${res.status} ${detail}`)
}

async function readWatch(watchId: string): Promise<Record<string, unknown> | null> {
  const base = artifactsUrl()
  if (!base) throw new Error('ARTIFACTS_URL not configured')
  const res = await fetch(`${base}/api/artifacts/documents/${encodeURIComponent(watchId)}`)
  if (res.status === 404) return null
  await requireOk(res, `Reading watch ${watchId}`)
  const doc = (await res.json()) as { data?: Record<string, unknown> }
  return (doc && doc.data) || {}
}

export async function fetchWatchActivity(input: { watchId: string }): Promise<Record<string, unknown> | null> {
  return readWatch(input.watchId)
}

/**
 * Which skill this watch runs.
 *
 * Previously every watch ran `career-job-discovery` regardless of what it declared, so a watch
 * configured for a different skill silently ran the wrong one. The watch document is now
 * authoritative and the old skill survives only as the fallback for watches that predate the field.
 */
function resolveSkill(watch: Record<string, unknown>): { skill: string; assistantId: string; explicit: boolean } {
  const declared = watch.skill ?? watch.skillId ?? watch.tool ?? watch.toolName
  const skill = typeof declared === 'string' && declared.trim() ? declared.trim() : DEFAULT_WATCH_SKILL
  const assistant = watch.assistantId
  const assistantId = typeof assistant === 'string' && assistant.trim() ? assistant.trim() : DEFAULT_WATCH_ASSISTANT
  return { skill, assistantId, explicit: skill !== DEFAULT_WATCH_SKILL }
}

/**
 * Decide whether a tool-executor response represents a real success, and describe the failure if not.
 *
 * The execute route does NOT answer with a top-level `success` boolean. It returns
 * `{ status: 'completed' | 'failed', output, error? }`, and the skill's own result is JSON-encoded
 * inside `output.output` with its own `success` / `status`. Reading a top-level `success` therefore
 * reported failure for every run, including the ones that worked.
 *
 * Returns null when the run genuinely succeeded.
 */
function toolOutcomeError(
  skill: string,
  res: { ok: boolean; status: number },
  body: Record<string, unknown> | null,
): string | null {
  if (!res.ok) {
    const detail = typeof body?.error === 'string' ? body.error : null
    return detail ? `${skill} failed with HTTP ${res.status}: ${detail}` : `${skill} failed with HTTP ${res.status}`
  }
  if (!body) return `${skill} returned an empty response`
  if (body.status === 'failed') {
    return (body.error as string) || (body.message as string) || `${skill} reported status "failed"`
  }
  // The not-connected path answers 500 with a `success: false` body, so accept that shape too
  // rather than requiring exactly one of the two encodings.
  if (body.success === false) {
    return (body.error as string) || (body.message as string) || `${skill} did not report success`
  }

  // Unwrap the skill's own result so a skill that ran but could not do the work is still reported.
  const output = body.output as Record<string, unknown> | undefined
  const encoded = output && typeof output.output === 'string' ? output.output : null
  if (encoded) {
    try {
      const inner = JSON.parse(encoded) as Record<string, unknown>
      if (inner && (inner.success === false || inner.status === 'error')) {
        return (inner.error as string) || (inner.message as string) || `${skill} did not report success`
      }
      return null
    } catch {
      // Not JSON; the executor completed it, so treat the run as successful.
      return null
    }
  }

  return null
}

export async function runWatchActivity(input: { watchId: string }) {
  const { watchId } = input
  const base = artifactsUrl()
  const toolExecutorUrl = process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500'
  if (!base) throw new Error('ARTIFACTS_URL not configured')

  const watch = await readWatch(watchId)
  if (!watch) throw new Error(`Watch ${watchId} not found`)

  const { skill, assistantId, explicit } = resolveSkill(watch)
  if (!explicit) {
    logger.warn(
      { watchId },
      'Watch does not declare a skill; falling back to the legacy default. Set data.skill on the watch to remove this warning.',
    )
  }

  const toolInput: Record<string, unknown> = {
    queries: watch.query ? [String(watch.query)] : [],
    locations: Array.isArray(watch.locations) ? watch.locations : [],
  }
  if (Array.isArray(watch.companies) && watch.companies.length > 0) {
    toolInput.companies = watch.companies
  }
  // Forward any additional arguments the watch declares for the skill.
  if (watch.arguments && typeof watch.arguments === 'object' && !Array.isArray(watch.arguments)) {
    Object.assign(toolInput, watch.arguments)
  }

  logger.info({ watchId, skill, assistantId }, 'Running watch via tool-executor')

  const runId = `watch-run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  // One timestamp for both the run record and the watch, so the two are always comparable.
  const runAt = new Date().toISOString()

  let execResult: Record<string, unknown> | null = null
  let toolError: string | null = null
  try {
    const res = await fetch(`${toolExecutorUrl}/api/tool-executor/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Assistant-Id': assistantId },
      // `type` and `isSkill` are required by the execute route before it consults the registry, and
      // a skill additionally needs assistant context. Omitting them made every watch fail validation
      // with "tool.name and tool.type are required".
      body: JSON.stringify({
        tool: { name: skill, type: 'code', isSkill: true },
        input: toolInput,
        assistantId,
      }),
    })
    execResult = (await res.json()) as Record<string, unknown>
    toolError = toolOutcomeError(skill, res, execResult)
  } catch (err) {
    toolError = err instanceof Error ? err.message : String(err)
    logger.warn({ watchId, err: toolError }, 'Tool-executor call failed for watch')
    execResult = { success: false, error: toolError }
  }

  // Persist the run record. A failure here is a real failure and is reported as one.
  let persisted = false
  let persistError: string | null = null
  try {
    const res = await fetch(`${base}/api/artifacts/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: runId,
        tenantId: (watch.tenantId as string) || 'default',
        collection: WATCH_RESULTS_COLLECTION,
        data: { watchId, runAt, skill, assistantId, success: toolError === null, result: execResult },
      }),
    })
    await requireOk(res, 'Persisting watch result')
    persisted = true
  } catch (err) {
    persistError = err instanceof Error ? err.message : String(err)
    logger.warn({ watchId, err: persistError }, 'Failed to persist watch result')
  }

  // Update the watch's lastRunAt, writing only the fields this feature owns. The read happens
  // immediately before the write to keep the read-modify-write window as small as the documents
  // API allows.
  let lastRunRecorded = false
  try {
    const current = (await readWatch(watchId)) || {}
    const res = await fetch(`${base}/api/artifacts/documents/${encodeURIComponent(watchId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          ...current,
          lastRunAt: runAt,
          lastRunOk: toolError === null,
          // Persist the reason too; `lastRunOk: false` on its own is not actionable.
          lastRunError: toolError,
        },
      }),
    })
    await requireOk(res, 'Updating watch lastRunAt')
    lastRunRecorded = true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    persistError = persistError ? `${persistError}; ${message}` : message
    logger.warn({ watchId, err: message }, 'Failed to update watch lastRunAt')
  }

  // The activity reports what actually happened. A tool failure, a failed persist, or a failed
  // lastRunAt update all surface here instead of being swallowed into a success.
  const error = toolError ?? persistError
  return {
    success: error === null,
    runId,
    skill,
    runAt,
    persisted,
    lastRunRecorded,
    error,
    result: execResult,
  }
}

/** Activity surface consumed by the workflow through `proxyActivities`. */
export const watchActivities = { runWatchActivity, fetchWatchActivity }
export type WatchActivities = typeof watchActivities
