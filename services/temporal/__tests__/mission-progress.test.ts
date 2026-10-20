import { Plan } from '@stage7-nextgen/shared';
import { getMissionResumeProgress } from '../src/recovery/missionProgress';

describe('mission resume progress', () => {
  it('derives completed work and the first incomplete task from the persisted plan', () => {
    const plan: Plan = {
      summary: 'Resume safely',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Completed',
          goal: 'Finish the first phase',
          requiresApproval: false,
          status: 'completed',
          tasks: [{
            id: 'task-1',
            title: 'Completed task',
            description: 'Already finished.',
            agentRole: 'worker',
            systemPrompt: 'Work.',
            expectedArtifacts: [],
            status: 'completed',
            artifacts: [],
          }],
        },
        {
          id: 'phase-2',
          name: 'Interrupted',
          goal: 'Continue the mission',
          requiresApproval: false,
          status: 'in_progress',
          tasks: [
            {
              id: 'task-2',
              title: 'Pending task',
              description: 'Needs execution.',
              agentRole: 'worker',
              systemPrompt: 'Work.',
              expectedArtifacts: [],
              status: 'pending',
              artifacts: [],
            },
            {
              id: 'task-3',
              title: 'Saved task',
              description: 'Completed before interruption.',
              agentRole: 'worker',
              systemPrompt: 'Work.',
              expectedArtifacts: [],
              status: 'completed',
              artifacts: [],
            },
          ],
        },
      ],
    };

    expect(getMissionResumeProgress(plan)).toEqual({
      checkpoint: {
        version: 1,
        plan,
        completedTasks: [
          { phaseId: 'phase-1', taskId: 'task-1' },
          { phaseId: 'phase-2', taskId: 'task-3' },
        ],
        completedPhases: ['phase-1'],
      },
      resumeFromPhaseId: 'phase-2',
      resumeFromTaskId: 'task-2',
    });
  });
});
