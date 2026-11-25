import { logger, httpRequest, interServiceTimeoutMs, missionSettings, resolveMissionSettings } from '@stage7-nextgen/shared';
import { MissionOrchestrator } from '../planner/MissionOrchestrator';
import { MissionActivityCheckpoint, WorkflowInput } from '../types/workflow';

interface MissionExecutionOptions {
  checkpoint?: MissionActivityCheckpoint;
  heartbeat?: (checkpoint: MissionActivityCheckpoint) => void;
  controlCheckpoint?: () => Promise<void>;
}

async function executeMissionActivity(
  input: WorkflowInput,
  options: MissionExecutionOptions = {},
): Promise<any> {
  logger.info({ missionId: input.missionId }, 'Mission activity started');
  let checkpoint = options.checkpoint || { version: 1 as const };
  const heartbeat = () => options.heartbeat?.(checkpoint);
  const saveCheckpoint = (next: MissionActivityCheckpoint) => {
    checkpoint = next;
    heartbeat();
  };
  heartbeat();

  const broadcast = async (event: { type: string; missionId: string; timestamp: number; data?: any }) => {
    const gatewayUrl = process.env.GATEWAY_URL;
    const persistenceUrl = process.env.ARTIFACTS_URL;
    let persistedEvent: Record<string, unknown> | undefined;
    // Persist event to persistence for replay/audit. The persisted copy carries
    // the single event id, and the gateway broadcast reuses it so the live
    // feed and the event log never diverge into two ids for one event.
    if (persistenceUrl) {
      try {
        const response = await httpRequest(`${persistenceUrl}/api/artifacts/missions/${input.missionId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          timeoutMs: interServiceTimeoutMs(),
        });
        if (response.ok) {
          try {
            const persisted = (await response.json()) as Record<string, unknown> | undefined;
            if (persisted?.id) persistedEvent = persisted;
          } catch {}
        } else {
          logger.warn({ missionId: input.missionId, status: response.status }, 'Event persist failed');
        }
      } catch (err) {
        logger.warn({ missionId: input.missionId, err: (err as Error).message }, 'Event persist failed');
      }
    }
    // Broadcast live to mission subscribers
    if (!gatewayUrl) return;
    try {
      await httpRequest(`${gatewayUrl}/api/gateway/broadcast/mission/${input.missionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persistedEvent ?? event),
        timeoutMs: interServiceTimeoutMs(),
      });
    } catch (err) {
      logger.warn({ missionId: input.missionId, err: (err as Error).message }, 'Broadcast failed');
    }
  };

  const broadcastAll = async (event: { type: string; timestamp: number; data?: any }) => {
    const gatewayUrl = process.env.GATEWAY_URL;
    if (!gatewayUrl) return;
    try {
      await httpRequest(`${gatewayUrl}/api/gateway/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        timeoutMs: interServiceTimeoutMs(),
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Broadcast-all failed');
    }
  };

  const waitForApproval = async (phaseId: string, question: string): Promise<{ approved: boolean; reason?: string }> => {
    logger.info({ missionId: input.missionId, phaseId, question }, 'Phase awaiting approval');
    const persistenceUrl = process.env.ARTIFACTS_URL || 'http://artifacts:4200';
    const startTime = Date.now();
    // Settings doc first, then the APPROVAL_* environment variables, then
    // built-in defaults. A failed or missing document leaves the environment
    // values in effect; the refresh is TTL-cached and bounded by the
    // inter-service timeout so it never stalls the wait.
    await missionSettings.refresh();
    const approvalSettings = resolveMissionSettings(missionSettings.current().overrides, process.env);
    const timeout = approvalSettings.approvalTimeoutMs;
    const pollInterval = approvalSettings.approvalPollIntervalMs;
    let checks = 0;
    const approvalUrl = `${persistenceUrl}/api/artifacts/missions/${input.missionId}/phases/${phaseId}`;
    while (Date.now() - startTime < timeout) {
      await new Promise((r) => setTimeout(r, pollInterval));
      await options.controlCheckpoint?.();
      heartbeat();
      checks++;
      try {
        const res = await httpRequest(approvalUrl, { timeoutMs: 5000 });
        if (res.ok) {
          const phase = await res.json() as { status: string; rejectionReason?: string };
          if (phase.status === 'approved') return { approved: true };
          if (phase.status === 'rejected') return { approved: false, reason: phase.rejectionReason };
        } else {
          const text = await res.text();
          logger.warn({ missionId: input.missionId, phaseId, status: res.status, checks, url: approvalUrl, body: text.slice(0, 200) }, 'Approval poll returned non-ok');
        }
      } catch (err) {
        logger.warn({ missionId: input.missionId, phaseId, checks, url: approvalUrl, err: (err as Error).message, stack: (err as Error).stack?.slice(0, 300) }, 'Approval poll fetch failed');
      }
    }
    logger.warn({ missionId: input.missionId, phaseId, checks, url: approvalUrl }, 'Approval timeout');
    return { approved: false, reason: 'Approval timeout' };
  };

const orchestrator = new MissionOrchestrator();
  const result = await orchestrator.run({
    missionId: input.missionId,
    prompt: input.prompt,
    tenantId: input.tenantId,
    assistantId: input.assistantId,
    metadata: {
      ...input.metadata,
      assistantId: input.assistantId,
      entityId: typeof input.metadata?.entityId === 'string' && input.metadata.entityId.trim()
        ? input.metadata.entityId.trim()
        : input.missionId,
    },
    retryGuidance: input.retryGuidance,
     persistenceUrl: process.env.ARTIFACTS_URL || 'http://artifacts:4200',
     gatewayUrl: process.env.GATEWAY_URL || 'http://gateway:3000',
     agentRuntimeUrl: process.env.AGENT_RUNTIME_URL,
     broadcast,
     broadcastAll,
     waitForApproval,
     ...(options.checkpoint ? { resumeCheckpoint: options.checkpoint } : {}),
     ...(input.clarificationAnswers && input.clarificationAnswers.length > 0 ? { clarificationAnswers: input.clarificationAnswers } : {}),
     ...(input.interactionResponse ? { interactionResponse: input.interactionResponse } : {}),
     ...(input.userMessages ? { userMessages: [...input.userMessages] } : {}),
     onCheckpoint: saveCheckpoint,
     heartbeat,
     controlCheckpoint: options.controlCheckpoint,
   });

  logger.info({ missionId: input.missionId, phases: result.plan.phases.length }, 'Mission activity completed');
  return result;
}

export async function runMissionDirect(
  input: WorkflowInput,
  checkpoint?: MissionActivityCheckpoint,
  controlCheckpoint?: () => Promise<void>,
): Promise<any> {
  if (!checkpoint && !input.interactionResponse && !input.clarificationAnswers?.length) {
    return executeMissionActivity(input, { checkpoint, controlCheckpoint });
  }
  const persistenceUrl = process.env.ARTIFACTS_URL || 'http://artifacts:4200';
  const response = await httpRequest(`${persistenceUrl}/api/artifacts/missions/${encodeURIComponent(input.missionId)}/events`, { timeoutMs: interServiceTimeoutMs() });
  if (!response.ok) throw new Error(`Failed to load mission user messages from Artifacts (${response.status})`);
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !Array.isArray((body as { events?: unknown }).events)) {
    throw new Error('Artifacts returned invalid mission events');
  }
  const userMessages = (body as { events: unknown[] }).events.flatMap((event) => {
    if (!event || typeof event !== 'object') return [];
    const entry = event as { type?: unknown; data?: { role?: unknown; content?: unknown } };
    return (entry.type === 'user' || entry.type === 'user_message')
      && entry.data?.role === 'user'
      && typeof entry.data.content === 'string'
      && entry.data.content.trim()
      ? [entry.data.content]
      : [];
  });
  return executeMissionActivity({ ...input, userMessages }, { checkpoint, controlCheckpoint });
}

export async function recordActivityMetrics(missionId: string): Promise<void> {
  logger.info({ missionId }, 'Recording activity metrics');
}

export async function cleanupActivity(missionId: string): Promise<void> {
  logger.info({ missionId }, 'Cleaning up activity resources');
}
