import { createHash } from 'node:crypto';
import { logger } from '@stage7-nextgen/shared';
import type {
  MissionTrajectoryLog,
  SkillCategory,
  TrajectoryAgentRole,
} from '@stage7-nextgen/shared';
import type { Plan } from '@stage7-nextgen/shared';
import type { MissionPhaseOutput } from '../activities/missionWorkflowActivities';
import type { WorkflowInput } from '../types/workflow';

const skillCategories = new Set<SkillCategory>([
  'analytics', 'career', 'content', 'cto', 'education', 'event', 'executive',
  'finance', 'general', 'healthcare', 'hotel', 'hr', 'investment', 'legal',
  'marketing', 'product', 'restaurant', 'sales', 'scriptwriting', 'songwriting',
  'sports', 'support',
]);
const knownRoles = new Set<TrajectoryAgentRole>([
  'Coordinator', 'Researcher', 'Creative', 'Critic', 'Executor', 'Domain Expert',
  'Coder', 'Analyst', 'Product Manager',
]);

function trajectoryFor(
  input: WorkflowInput,
  plan: Plan,
  phases: MissionPhaseOutput[],
): MissionTrajectoryLog {
  const taskDefinitions = new Map(
    plan.phases.flatMap((phase) => phase.tasks.map((task) => [task.id, task] as const)),
  );
  const steps = phases.flatMap((phase) => phase.tasks.map((task) => {
    const definition = taskDefinitions.get(task.taskId);
    const requestedRole = definition?.agentRole as TrajectoryAgentRole | undefined;
    return {
      stepId: `${phase.phaseId}:${task.taskId}`,
      agentRole: requestedRole && knownRoles.has(requestedRole) ? requestedRole : 'Executor',
      toolName: definition?.requiredActions?.[0]?.toolId || task.taskId,
      inputParameters: {
        task: definition?.title || task.taskId,
        description: definition?.description || '',
      },
      outputResult: {
        output: (task.output || '').slice(0, 1000),
        artifacts: task.artifacts.map((artifact) => ({ name: artifact.name, type: artifact.type })),
      },
      executionDurationMs: Math.max(0, (definition?.completedAt || 0) - (definition?.startedAt || 0)),
      status: task.status === 'completed' ? 'SUCCESS' as const : 'FAILED' as const,
    };
  })).slice(-25);
  const assistantCategory = input.assistantId.replace(/-canonical-assistant$/, '') as SkillCategory;
  const assistantId = input.assistantId || 'general';
  const goalDescription = [
    input.prompt,
    `Skill category: ${skillCategories.has(assistantCategory) ? assistantCategory : 'general'}`,
  ].join('\n');
  return {
    missionId: input.missionId,
    assistantId,
    goalDescription,
    steps,
    finalDeliverableSummary: phases
      .flatMap((phase) => phase.tasks.map((task) => task.output || ''))
      .filter(Boolean)
      .join('\n')
      .slice(0, 4_000),
    totalTokensUsed: 0,
  };
}

export class MissionCompletedListener {
  async onMissionCompleted(input: WorkflowInput, plan: Plan, phases: MissionPhaseOutput[]): Promise<void> {
    const trajectory = trajectoryFor(input, plan, phases);
    const assistantId = input.assistantId || 'general';
    const category = assistantId.replace(/-canonical-assistant$/, '') as SkillCategory;
    const targetCategory = skillCategories.has(category) ? category : 'general';
    const targetSkillName = `mission-${createHash('sha256').update(input.missionId).digest('hex').slice(0, 12)}`;
    const url = `${(process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500').replace(/\/+$/, '')}/api/v1/compile-skill`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(35 * 60_000),
        body: JSON.stringify({
          trajectory,
          targetSkillName,
          targetCategory,
          description: plan.summary || input.prompt,
          authorAssistantId: assistantId,
          enforceStrictSchemas: true,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Tool Executor rejected mission skill compilation (${response.status}): ${detail.slice(0, 500)}`);
      }
      logger.info({ missionId: input.missionId, assistantId }, 'Mission trajectory compiled into an ADK skill');
    } catch (error) {
      logger.error(
        { missionId: input.missionId, error: error instanceof Error ? error.message : String(error) },
        'Mission completion skill compilation failed',
      );
    }
  }
}
