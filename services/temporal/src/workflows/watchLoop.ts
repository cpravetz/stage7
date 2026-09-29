import { logger } from '@stage7-nextgen/shared'

/** Default cadence when a watch does not declare a usable one. */
export const DEFAULT_CADENCE_MS = 24 * 60 * 60 * 1000
/** Backoff after an unexpected error while reading the watch document. */
export const RETRY_AFTER_ERROR_MS = 60 * 1000

/**
 * Convert a watch cadence into milliseconds.
 *
 * Accepts `hourly`, `daily`, and an explicit `<n>s|m|h|d` form. Anything unrecognised falls back to
 * daily rather than to a busy loop, so a typo in a watch cannot hammer the executor.
 */
export function cadenceToMs(cadence: unknown): number {
  if (cadence === undefined || cadence === null || cadence === '') return DEFAULT_CADENCE_MS
  const c = String(cadence).trim().toLowerCase()
  if (c === 'daily' || c === 'day') return DEFAULT_CADENCE_MS
  if (c === 'hourly' || c === 'hour') return 60 * 60 * 1000
  if (/^\d+[smhd]$/.test(c)) {
    const value = Number(c.slice(0, -1))
    const unit = c.slice(-1)
    if (unit === 's') return value * 1000
    if (unit === 'm') return value * 60 * 1000
    if (unit === 'h') return value * 60 * 60 * 1000
    if (unit === 'd') return value * 24 * 60 * 60 * 1000
  }
  return DEFAULT_CADENCE_MS
}

export interface WatchRunOutcome {
  success: boolean
  error?: string | null
  [key: string]: unknown
}

export interface WatchLoopDeps {
  /** Resolve the watch document, or null when it no longer exists. */
  fetchWatch(watchId: string): Promise<Record<string, unknown> | null>
  /** Run the watch once. A rejected promise or `success: false` is a failed cycle. */
  runWatch(watchId: string): Promise<WatchRunOutcome>
  /** How to wait between cycles. Injected so a durable workflow can pass Temporal's sleep. */
  sleep(ms: number): Promise<void>
}

export interface WatchLoopResult {
  watchId: string
  /** Cycles actually attempted, whether or not they succeeded. */
  cycles: number
  succeeded: number
  failed: number
  lastError: string | null
  reason: 'disabled' | 'missing' | 'max-cycles' | 'loop-ended'
}

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/**
 * The watch cadence loop, expressed without any Temporal imports.
 *
 * The durable workflow and the in-process fallback both drive this, passing different `sleep` and
 * `fetchWatch` implementations. Keeping the loop plain is what makes it testable and stops the
 * fallback from silently diverging from the durable path.
 */
export async function runWatchLoop(
  watchId: string,
  deps: WatchLoopDeps,
  options: { maxCycles?: number } = {},
): Promise<WatchLoopResult> {
  let cycles = 0
  let succeeded = 0
  let failed = 0
  let lastError: string | null = null
  let reason: WatchLoopResult['reason'] = 'loop-ended'

  for (;;) {
    let watch: Record<string, unknown> | null
    try {
      watch = await deps.fetchWatch(watchId)
    } catch (err) {
      // The watch document could not be read this cycle. Back off and try again rather than
      // exiting, because the orchestrator is the only thing that will restart it.
      lastError = errorMessage(err)
      logger.warn({ watchId, err: lastError }, 'Watch document read failed; retrying')
      await deps.sleep(RETRY_AFTER_ERROR_MS)
      continue
    }

    if (!watch) {
      reason = 'missing'
      break
    }
    if (watch.enabled !== true) {
      reason = 'disabled'
      break
    }

    // A failed cycle is recorded and the loop continues: a single bad run must not silently stop a
    // watch, and it must not be reported as a success either.
    cycles += 1
    try {
      const outcome = await deps.runWatch(watchId)
      if (outcome && outcome.success === true) {
        succeeded += 1
        lastError = null
      } else {
        failed += 1
        lastError = (outcome && outcome.error) || 'Watch run reported failure'
        logger.warn({ watchId, err: lastError }, 'Watch cycle failed')
      }
    } catch (err) {
      failed += 1
      lastError = errorMessage(err)
      logger.warn({ watchId, err: lastError }, 'Watch cycle threw')
    }

    if (options.maxCycles !== undefined && cycles >= options.maxCycles) {
      reason = 'max-cycles'
      break
    }

    await deps.sleep(cadenceToMs(watch.cadence))
  }

  logger.info({ watchId, cycles, succeeded, failed, reason, lastError }, 'Watch loop finished')
  return { watchId, cycles, succeeded, failed, lastError, reason }
}
