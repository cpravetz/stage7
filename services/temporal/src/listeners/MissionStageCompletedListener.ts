import { logger, httpRequest, DEFAULT_TENANT_ID, getBrainUrl } from '@stage7-nextgen/shared';
import type { MissionPhaseOutput } from '../types/workflow';
import type { Plan } from '@stage7-nextgen/shared';
import type { WorkflowInput } from '../types/workflow';

export class MissionStageCompletedListener {
  async onStageCompleted(input: WorkflowInput, plan: Plan, phase: MissionPhaseOutput): Promise<void> {
    const stageOutput = phase.tasks
      .filter((task) => task.status === 'completed')
      .map((task) => `${task.taskId}: ${task.output || '(no text output)'}`)
      .join('\n')
      .slice(0, 20_000);
    if (!stageOutput) return;

    // Missions without an entityId learn per-assistant: the read side
    // (BrainClient) falls back to the same assistantId, so extraction and
    // retrieval land on the same memory slot. A missionId fallback here wrote
    // slots nothing ever read back.
    const metadataEntityId = input.metadata?.entityId;
    const entityId = typeof metadataEntityId === 'string' && metadataEntityId.trim()
      ? metadataEntityId.trim()
      : input.assistantId || 'general';
    const url = `${getBrainUrl()}/api/brain/memory/entity`;
    try {
      const response = await httpRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 35 * 60_000,
        body: JSON.stringify({
          tenantId: input.tenantId || DEFAULT_TENANT_ID,
          entityId,
          assistantId: input.assistantId || 'general',
          missionId: input.missionId,
          stageName: phase.name || plan.summary,
          stageOutput,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Brain rejected entity memory rollup (${response.status}): ${detail.slice(0, 500)}`);
      }
      logger.info({ missionId: input.missionId, entityId, phaseId: phase.phaseId }, 'Entity memory rollup saved');
    } catch (error) {
      logger.error(
        { missionId: input.missionId, entityId, phaseId: phase.phaseId, error: error instanceof Error ? error.message : String(error) },
        'Entity memory rollup failed',
      );
    }
  }
}
