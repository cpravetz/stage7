import { TemporalClient } from './client/TemporalClient'
import { logger } from '@stage7-nextgen/shared'

const ARTIFACTS_URL = process.env.ARTIFACTS_URL || ''
const POLL_MS = Number(process.env.WATCH_SCHEDULER_POLL_MS || '60000')

export function startWatchScheduler(client: TemporalClient) {
  if (!ARTIFACTS_URL) {
    logger.info('ARTIFACTS_URL not set, watch scheduler disabled')
    return
  }

  let running = true

  async function poll() {
    try {
      const res = await fetch(`${ARTIFACTS_URL}/api/artifacts/documents/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'watches', limit: 1000 }),
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

  // Start initial poll immediately
  poll()

  const handle = setInterval(() => {
    if (!running) return
    poll()
  }, POLL_MS)

  process.on('exit', () => {
    running = false
    clearInterval(handle)
  })

  logger.info({ pollMs: POLL_MS }, 'Watch scheduler started')
}
