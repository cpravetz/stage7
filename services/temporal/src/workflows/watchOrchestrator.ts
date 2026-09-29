import { logger } from '@stage7-nextgen/shared'
import { proxyActivities, sleep } from '@temporalio/workflow'
import type { WatchActivities } from '../activities/watchActivity'
import { runWatchLoop } from './watchLoop'

const { runWatchActivity, fetchWatchActivity } = proxyActivities<WatchActivities>({
  startToCloseTimeout: '5m',
  // The loop already records a failed cycle and keeps going, so activity-level retries are kept
  // short: a genuinely down executor should surface as a failed cycle, not a five-minute stall.
  retry: { maximumAttempts: 3, initialInterval: '1s', backoffCoefficient: 2 },
})

/**
 * Durable watch orchestrator.
 *
 * The cadence wait goes through Temporal's `sleep` and the watch body runs as a proxied activity.
 * The previous version called the activity as a plain import and waited on a local `setTimeout`,
 * neither of which Temporal tracks: the sleep was lost on worker restart and the activity had no
 * timeout, retry, or heartbeat. The loop itself is shared with the in-process fallback via
 * `runWatchLoop`, so the two paths cannot drift apart.
 */
export async function watchOrchestrator(input: { watchId: string }) {
  const { watchId } = input
  logger.info({ watchId }, 'Watch orchestrator started')

  const result = await runWatchLoop(watchId, {
    fetchWatch: (id) => fetchWatchActivity({ watchId: id }),
    runWatch: (id) => runWatchActivity({ watchId: id }),
    sleep: (ms) => sleep(ms),
  })

  return { ...result, durable: true }
}
