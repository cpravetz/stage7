import { WorkflowInput, WorkflowResult, WorkflowState } from '../types/workflow';
import { runMissionActivity } from '../activities/missionActivity';
import { logger } from '@stage7-nextgen/shared';

export async function missionWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const state: WorkflowState = {
    missionId: input.missionId,
    currentStep: 0,
    totalSteps: 1,
    history: [],
  };

  const startedAt = Date.now();

  try {
    state.history.push({
      step: 0,
      status: 'running',
      startedAt,
    });

    logger.info('Mission workflow started', { missionId: input.missionId });

    const result = await runMissionActivity(input);

    const outputs =
      result && typeof result === 'object'
        ? (result as { outputs?: { status?: string } }).outputs
        : undefined;
    let status: WorkflowResult['status'];
    if (outputs?.status === 'awaiting_clarification' || outputs?.status === 'rejected_at_phase') {
      status = 'awaiting_review';
    } else if (outputs?.status === 'incomplete') {
      status = 'incomplete';
    } else {
      status = 'completed';
    }

    state.history[0].status = status as any;
    state.history[0].completedAt = Date.now();
    state.history[0].result = result;

    logger.info('Mission workflow completed', { missionId: input.missionId, status });

    return {
      missionId: input.missionId,
      status,
      output: result,
      startedAt,
      completedAt: Date.now(),
    };
  } catch (error: any) {
    state.history[0].status = 'failed';
    state.history[0].completedAt = Date.now();
    state.history[0].error = error.message;

    logger.error('Mission workflow failed', { missionId: input.missionId, error: error.message });

    return {
      missionId: input.missionId,
      status: 'failed',
      error: error.message,
      startedAt,
      completedAt: Date.now(),
    };
  }
}
