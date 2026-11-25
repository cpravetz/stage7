import { httpRequest } from './httpClient';
import { logger } from './logger';
import { stripTrailingSlashes } from './stripTrailingSlashes';

/** Base URL of the Brain service: BRAIN_URL or the compose-network hostname. */
export function getBrainUrl(): string {
  return stripTrailingSlashes(process.env.BRAIN_URL || 'http://brain:3100');
}

export interface BrainComplaintInput {
  /** Brain request that produced the failed response; absent when the response carried no ID. */
  requestId: string | undefined;
  reason: string;
  missionId: string;
}

/**
 * Reports a response-quality complaint to the Brain so routing can learn from
 * it. Best-effort by design — complaint delivery must never break the agent
 * turn that produced it — so every failure mode logs and resolves.
 */
export async function reportBrainComplaint(complaint: BrainComplaintInput): Promise<void> {
  const { requestId, reason, missionId } = complaint;
  if (!requestId) {
    logger.warn({ missionId, reason }, 'Cannot report a Brain response-quality complaint without a request ID');
    return;
  }
  try {
    const response = await httpRequest(`${getBrainUrl()}/api/brain/complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, reason, missionId }),
      timeoutMs: 5_000,
    });
    if (!response.ok) {
      const details = await response.text();
      logger.error(
        { requestId, missionId, status: response.status, details: details.slice(0, 300) },
        'Brain rejected a response-quality complaint',
      );
      return;
    }
    logger.info({ requestId, missionId, reason }, 'Reported a Brain response-quality complaint');
  } catch (error) {
    logger.error(
      { requestId, missionId, error: error instanceof Error ? error.message : String(error) },
      'Failed to report a Brain response-quality complaint',
    );
  }
}
