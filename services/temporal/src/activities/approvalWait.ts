import { httpRequest, fetchLlmSettingsDoc, DEFAULT_APPROVAL_TIMEOUT_MS, DEFAULT_APPROVAL_POLL_INTERVAL_MS, logger } from '@stage7-nextgen/shared';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ApprovalTiming {
  timeout: number;
  pollInterval: number;
}

type SettingsFetch = () => Promise<{ approvalTimeoutMs?: number; approvalPollIntervalMs?: number } | null>;

/**
 * Reads the approval window and poll interval: the llm-config settings
 * document first, then the env vars, then the documented defaults (24 h
 * window, 3 s poll). The caller captures the result ONCE per wait — see
 * waitForApproval.
 */
export async function resolveApprovalTiming(
  fetchSettings: SettingsFetch = () => fetchLlmSettingsDoc(process.env.ARTIFACTS_URL || 'http://artifacts:4200'),
): Promise<ApprovalTiming> {
  const envTimeout = parseInt(process.env.APPROVAL_TIMEOUT_MS || '0', 10) || DEFAULT_APPROVAL_TIMEOUT_MS;
  const envPoll = parseInt(process.env.APPROVAL_POLL_INTERVAL_MS || '0', 10) || DEFAULT_APPROVAL_POLL_INTERVAL_MS;
  const settings = await fetchSettings();
  return {
    timeout: settings?.approvalTimeoutMs ?? envTimeout,
    pollInterval: settings?.approvalPollIntervalMs ?? envPoll,
  };
}

export interface ApprovalWaitOptions {
  missionId: string;
  phaseId: string;
  heartbeat?: () => void;
  controlCheckpoint?: () => Promise<void>;
  /** Test seam: replaces the artifacts HTTP GET of the phase endpoint. */
  checkPhase?: () => Promise<{ status: string; rejectionReason?: string } | undefined>;
  /** Test seam: overrides the shared settings fetcher. */
  fetchSettings?: SettingsFetch;
  /** Test seam: overrides the poll sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ApprovalOutcome {
  approved: boolean;
  reason?: string;
}

/**
 * Polls the phase endpoint until it is approved or rejected.
 *
 * The approval window and poll interval are captured BEFORE the loop starts.
 * A settings change made while a wait is running never retroactively shrinks
 * that wait's window; it applies from the next invocation onward.
 */
export async function waitForApproval(options: ApprovalWaitOptions): Promise<ApprovalOutcome> {
  const { missionId, phaseId } = options;
  const { timeout, pollInterval } = await resolveApprovalTiming(options.fetchSettings);
  const approvalUrl = `${process.env.ARTIFACTS_URL || 'http://artifacts:4200'}/api/artifacts/missions/${missionId}/phases/${phaseId}`;
  const startTime = Date.now();
  const doze = options.sleep ?? sleep;
  let checks = 0;
  while (Date.now() - startTime < timeout) {
    await doze(pollInterval);
    await options.controlCheckpoint?.();
    options.heartbeat?.();
    checks++;
    try {
      const phase = options.checkPhase
        ? await options.checkPhase()
        : await (async () => {
            const res = await httpRequest(approvalUrl, { timeoutMs: 5000 });
            if (!res.ok) {
              const text = await res.text();
              logger.warn({ missionId, phaseId, status: res.status, checks, url: approvalUrl, body: text.slice(0, 200) }, 'Approval poll returned non-ok');
              return undefined;
            }
            return await res.json() as { status: string; rejectionReason?: string };
          })();
      if (phase?.status === 'approved') return { approved: true };
      if (phase?.status === 'rejected') return { approved: false, reason: phase.rejectionReason };
    } catch (err) {
      logger.warn({ missionId, phaseId, checks, url: approvalUrl, err: (err as Error).message, stack: (err as Error).stack?.slice(0, 300) }, 'Approval poll fetch failed');
    }
  }
  logger.warn({ missionId, phaseId, checks, url: approvalUrl }, 'Approval timeout');
  return { approved: false, reason: 'Approval timeout' };
}
