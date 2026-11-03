import { logger } from '@stage7-nextgen/shared';

export interface BrainComplaintConfig {
  missionId: string;
}

export class BrainComplaintReporter {
  private readonly missionId: string;

  constructor(config: BrainComplaintConfig) {
    this.missionId = config.missionId;
  }

  async reportComplaint(requestId: string | undefined, reason: string): Promise<void> {
    if (!requestId) {
      logger.warn(
        { missionId: this.missionId, reason },
        'Cannot report rejected Agent output to Brain without a request ID',
      );
      return;
    }

    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${brainUrl}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason, missionId: this.missionId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.text();
        logger.error(
          { missionId: this.missionId, requestId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected a mission Agent output complaint',
        );
        return;
      }
      logger.info({ missionId: this.missionId, requestId, reason }, 'Mission Agent reported a Brain output complaint');
    } catch (error) {
      logger.error(
        { missionId: this.missionId, requestId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report a mission Agent output complaint',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
