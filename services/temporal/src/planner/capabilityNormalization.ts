import { Plan } from '@stage7-nextgen/shared';

/**
 * Runtime resolves capabilities; the planner does not create or normalize
 * capability setup tasks. Tool and service creation is runtime infrastructure,
 * not a mission deliverable, so the planner leaves operational tasks alone and
 * lets the runtime discover, acquire, or create and register a capability.
 */
export function normalizeCapabilitySetupTasks(_plan: Plan, _missionGoal: string): number {
  return 0;
}