import { logger } from '@stage7-nextgen/shared';
import type { MissionPhaseOutput } from '../activities/missionWorkflowActivities';
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

    const metadataEntityId = input.metadata?.entityId;
    const entityId = typeof metadataEntityId === 'string' && metadataEntityId.trim()
      ? metadataEntityId.trim()
      : input.assistantId || input.missionId;
    const url = `${(process.env.BRAIN_URL || 'http://brain:3100').replace(/\/+$/, '')}/api/brain/memory/entity`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35 * 60_000),
        body: JSON.stringify({
          tenantId: input.tenantId || 'tenant-1',
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
