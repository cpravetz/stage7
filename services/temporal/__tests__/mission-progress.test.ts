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
      clarificationAnswers: [],
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

import {
  recoveryProgressSignature,
  hasRecoveryProgress,
  missionExecutionEvidenceGaps,
  MAX_PHASE_RECOVERY_ROUNDS_SAFETY,
  MAX_NO_PROGRESS_RECOVERY_ATTEMPTS,
  type MissionPhaseEvidence,
} from '../src/types/workflow';

describe('progress-aware recovery (Tasks 3/7)', () => {
  it('detects no-progress when gaps and evidence state are unchanged, and progress when state changes', () => {
    const base = {
      gaps: ['Task "Send" (task-1) did not complete the required step "sms".'],
      completedTaskIds: ['task-1'],
      completedTaskStatuses: ['task-1:incomplete'],
      artifactNames: ['system-action-receipts.json'],
      outputs: ['No verified send.'],
    };
    const sig1 = recoveryProgressSignature(base);
    expect(hasRecoveryProgress(undefined, sig1)).toBe(true);
    expect(hasRecoveryProgress(sig1, recoveryProgressSignature(base))).toBe(false);
    expect(hasRecoveryProgress(sig1, recoveryProgressSignature({ ...base, artifactNames: ['system-action-receipts.json','sms-proof.txt'] }))).toBe(true);
    expect(hasRecoveryProgress(sig1, recoveryProgressSignature({ ...base, gaps: ['Different gap'] }))).toBe(true);
  });

  it('retains anti-runaway safety ceilings', () => {
    expect(MAX_PHASE_RECOVERY_ROUNDS_SAFETY).toBeGreaterThanOrEqual(5);
    expect(MAX_NO_PROGRESS_RECOVERY_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });

  it('credits recovery evidence toward the original unmet requirement without weakening binding checks', () => {
    const plan: Plan = {
      summary: 'Send text',
      estimatedDuration: 'short',
      estimatedCost: 'low',
      requiresClarification: false,
      clarificationQuestions: [],
      clarificationAnswers: [],
      phases: [{
        id: 'phase-1', name: 'Send', goal: 'Send', requiresApproval: false, status: 'in_progress',
        tasks: [
          {
            id: 'task-1', title: 'Send text', description: 'Send SMS to recipient', agentRole: 'worker',
            systemPrompt: 'Send', dependsOnTaskIds: [], expectedArtifacts: [], requiresExternalAction: true,
            requiredActions: [], status: 'incomplete', artifacts: [],
          },
          {
            id: 'phase-1-mission-recovery-1', title: 'Recovery', description: 'Recover send', agentRole: 'assistant',
            systemPrompt: 'Recover', dependsOnTaskIds: ['task-1'], expectedArtifacts: [], requiredActions: [],
            status: 'completed', artifacts: [],
          },
        ],
      }],
    };
    // Recovery task produced an authoritative matching receipt; original task record is incomplete.
    const phases: MissionPhaseEvidence[] = [{
      phaseId: 'phase-1', status: 'in_progress',
      tasks: [
        { taskId: 'task-1', status: 'incomplete', artifacts: [], output: 'No verified send.' },
        {
          taskId: 'phase-1-mission-recovery-1', status: 'completed',
          artifacts: [{
            name: 'system-action-receipts.json', type: 'evidence', purpose: 'execution-outcome',
            content: JSON.stringify([{
              toolId: 'text-service-twilio-sms', outcome: 'success', executionId: 'exec-1',
              operation: 'send_sms', providerRequestId: 'SM1',
              binding: { operation: 'send_sms', recipients: ['+15551234567'], message: 'Hello' },
              content: JSON.stringify({ sid: 'SM1', to: '+15551234567', body: 'Hello', status: 'sent' }),
            }]),
          }],
        },
      ],
    }];
    expect(missionExecutionEvidenceGaps(plan, phases)).toEqual([]);

    // Unrelated receipt must NOT credit the original requirement (binding preserved).
    phases[0].tasks[1].artifacts[0].content = JSON.stringify([{ toolId: 'email', outcome: 'success', content: '{"ok":true}' }]);
    expect(missionExecutionEvidenceGaps(plan, phases)).toEqual(expect.arrayContaining([
      expect.stringContaining('Task "Send text" (task-1)'),
    ]));
  });

  it('does not treat incomplete prerequisites as completed dependencies', () => {
    const resume = getMissionResumeProgress({
      summary: 'x', estimatedDuration: 's', estimatedCost: 'l', requiresClarification: false,
      clarificationQuestions: [], clarificationAnswers: [],
      phases: [{
        id: 'p1', name: 'p', goal: 'g', requiresApproval: false, status: 'in_progress',
        tasks: [
          { id: 'a', title: 'a', description: 'a', agentRole: 'w', systemPrompt: 'w', dependsOnTaskIds: [], expectedArtifacts: [], status: 'incomplete', artifacts: [] },
          { id: 'b', title: 'b', description: 'b', agentRole: 'w', systemPrompt: 'w', dependsOnTaskIds: ['a'], expectedArtifacts: [], status: 'pending', artifacts: [] },
        ],
      }],
    } as Plan);
    expect(resume.checkpoint.completedTasks).toEqual([]);
    expect(resume.resumeFromTaskId).toBe('a');
  });
});
