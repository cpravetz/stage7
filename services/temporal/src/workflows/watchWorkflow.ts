import { logger } from '@stage7-nextgen/shared'
import { proxyActivities } from '@temporalio/workflow'
import type { WatchActivities } from '../activities/watchActivity'
import { WorkflowResult } from '../types/workflow'

const { runWatchActivity } = proxyActivities<WatchActivities>({
  startToCloseTimeout: '5m',
  retry: { maximumAttempts: 3, initialInterval: '1s', backoffCoefficient: 2 },
})

/**
 * Single-shot watch run.
 *
 * The activity is invoked through `proxyActivities` rather than imported and called directly, so it
 * inherits Temporal's timeout, retry, and heartbeating. The result reports what the activity actually
 * did: a failed watch run completes as `failed` instead of being reported as `completed`.
 */
export async function watchWorkflow(input: { watchId: string }): Promise<WorkflowResult> {
  const startedAt = Date.now()
  const missionId = `watch-${input.watchId}`
  try {
    logger.info({ watchId: input.watchId }, 'Watch workflow started')
    const outcome = await runWatchActivity({ watchId: input.watchId })

    if (!outcome || outcome.success !== true) {
      const message = (outcome && outcome.error) || 'Watch run did not report success'
      logger.warn({ watchId: input.watchId, err: message }, 'Watch workflow did not succeed')
      return {
        missionId,
        status: 'failed',
        error: message,
        output: outcome,
        startedAt,
        completedAt: Date.now(),
      } as any
    }

    logger.info({ watchId: input.watchId, runId: outcome.runId }, 'Watch workflow completed')
    return {
      missionId,
      status: 'completed',
      output: outcome,
      startedAt,
      completedAt: Date.now(),
    } as any
  } catch (err: any) {
    logger.error({ watchId: input.watchId, err: err.message }, 'Watch workflow failed')
    return {
      missionId,
      status: 'failed',
      error: err.message,
      startedAt,
      completedAt: Date.now(),
    } as any
  }
}
