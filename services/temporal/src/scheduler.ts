import { TemporalClient } from './client/TemporalClient'
import { logger, httpRequest, interServiceTimeoutMs, getServiceAuthorizationHeaders, fetchLlmSettingsDoc, DEFAULT_WATCH_SCHEDULER_POLL_MS } from '@stage7-nextgen/shared'

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || ''

/**
 * Resolves the poll interval for the NEXT tick: the llm-config settings
 * document first (its own 30 s TTL cache amortizes the fetch), then the env
 * var, then the default. Read per tick so a saved change reaches the running
 * scheduler without a restart.
 */
export async function resolveWatchPollIntervalMs(
  fetchSettings: () => Promise<{ watchSchedulerPollMs?: number } | null> = () => fetchLlmSettingsDoc(ARTIFACTS_URL),
): Promise<number> {
  const configured = Number(process.env.WATCH_SCHEDULER_POLL_MS)
  const fallback = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WATCH_SCHEDULER_POLL_MS
  const settings = await fetchSettings()
  const settingsValue = settings?.watchSchedulerPollMs
  if (typeof settingsValue === 'number' && Number.isFinite(settingsValue) && settingsValue > 0) return settingsValue
  return fallback
}

export function startWatchScheduler(client: TemporalClient): () => void {
  if (!ARTIFACTS_URL) {
    logger.info('ARTIFACTS_URL not set, watch scheduler disabled')
    return () => {}
  }

  let running = true
  let timer: NodeJS.Timeout | undefined

  async function poll() {
    try {
      const res = await httpRequest(`${ARTIFACTS_URL}/api/artifacts/documents/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getServiceAuthorizationHeaders()) },
        body: JSON.stringify({ collection: 'watches', limit: 1000 }),
        timeoutMs: interServiceTimeoutMs(),
      })
      if (!res.ok) {
        logger.warn('Failed to fetch watches for scheduler')
        return
      }
      const data = (await res.json()) as { documents?: Array<Record<string, any>> }
      const docs = data.documents || []
      for (const d of docs) {
        const id = d.id || d._id || (d.data && d.data.id)
        const watch = d.data || {}
        if (!id) continue
        if (watch.enabled) {
          try {
            await client.startWatchOrchestrator(id)
          } catch (err: any) {
            logger.warn({ err: err.message, watchId: id }, 'Failed to start orchestrator for watch')
          }
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Watch scheduler poll failed')
    }
  }

  // Self-scheduling loop: each tick waits for the interval resolved AFTER the
  // previous poll, so interval changes apply from the next cycle onward.
  async function tick() {
    if (!running) return
    await poll()
    if (!running) return
    const pollMs = await resolveWatchPollIntervalMs()
    timer = setTimeout(tick, pollMs)
  }

  // Start initial poll immediately
  tick()

  process.on('exit', () => {
    running = false
    if (timer) clearTimeout(timer)
  })

  logger.info('Watch scheduler started')
  return () => {
    running = false
    if (timer) clearTimeout(timer)
  }
}
