import { logger } from '@stage7-nextgen/shared';
import { MissionOrchestrator } from '../planner/MissionOrchestrator';

export async function runMissionActivity(input: {
  missionId: string;
  prompt: string;
  tenantId?: string;
  assistantId?: string;
  metadata?: Record<string, unknown>;
}): Promise<any> {
  logger.info({ missionId: input.missionId }, 'Mission activity started');

  const broadcast = async (event: { type: string; missionId: string; timestamp: number; data?: any }) => {
    const gatewayUrl = process.env.GATEWAY_URL;
    const persistenceUrl = process.env.ARTIFACTS_URL;
    // Persist event to persistence for replay/audit
    if (persistenceUrl) {
      try {
        await fetch(`${persistenceUrl}/api/artifacts/missions/${input.missionId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
      } catch (err) {
        logger.warn({ missionId: input.missionId, err: (err as Error).message }, 'Event persist failed');
      }
    }
    // Broadcast live to subscribers
    if (!gatewayUrl) return;
    try {
      await fetch(`${gatewayUrl}/api/gateway/broadcast/mission/${input.missionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch (err) {
      logger.warn({ missionId: input.missionId, err: (err as Error).message }, 'Broadcast failed');
    }
  };

  const waitForApproval = async (phaseId: string, question: string): Promise<{ approved: boolean; reason?: string }> => {
    logger.info({ missionId: input.missionId, phaseId, question }, 'Phase awaiting approval');
    const persistenceUrl = process.env.ARTIFACTS_URL;
    if (!persistenceUrl) return { approved: true };
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000;
    while (Date.now() - startTime < timeout) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`${persistenceUrl}/api/artifacts/missions/${input.missionId}/phases/${phaseId}`);
        if (res.ok) {
          const phase = await res.json() as { status: string; rejectionReason?: string };
          if (phase.status === 'approved') return { approved: true };
          if (phase.status === 'rejected') return { approved: false, reason: phase.rejectionReason };
        }
      } catch {
        // ignore
      }
    }
    return { approved: false, reason: 'Approval timeout' };
  };

  const orchestrator = new MissionOrchestrator();
  const result = await orchestrator.run({
    missionId: input.missionId,
    prompt: input.prompt,
    tenantId: input.tenantId,
    assistantId: input.assistantId,
    metadata: input.metadata,
    brainUrl: process.env.BRAIN_URL || 'http://brain:3100',
    persistenceUrl: process.env.ARTIFACTS_URL || 'http://artifacts:4200',
    gatewayUrl: process.env.GATEWAY_URL || 'http://gateway:3000',
    broadcast,
    waitForApproval,
  });

  logger.info({ missionId: input.missionId, phases: result.plan.phases.length }, 'Mission activity completed');
  return result;
}

export async function recordActivityMetrics(missionId: string): Promise<void> {
  logger.info({ missionId }, 'Recording activity metrics');
}

export async function cleanupActivity(missionId: string): Promise<void> {
  logger.info({ missionId }, 'Cleaning up activity resources');
}
