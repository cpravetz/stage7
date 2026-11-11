import { Phase, Plan, Task } from '@stage7-nextgen/shared';
import { buildTaskPrompt } from '../src/agent/TaskPromptBuilder';

const task: Task = {
  id: 'phase-2-task-1',
  title: 'Send text message',
  description: 'Send the requested text message.',
  agentRole: 'assistant',
  systemPrompt: "Send 'Watson, come here.' to '347-772-8389'. Consume the output from task phase-1-task-1 (text_message_service) as input for this task.",
  dependsOnTaskIds: [],
  expectedArtifacts: [],
  requiredActions: [],
  status: 'pending',
  artifacts: [],
};
const phase: Phase = { id: 'phase-2', name: 'Send', goal: 'Send the text', tasks: [task], requiresApproval: false, status: 'pending' };
const plan: Plan = { summary: 'Send', estimatedDuration: 'short', estimatedCost: 'low', requiresClarification: false, clarificationQuestions: [], clarificationAnswers: [], phases: [phase] };

it('ignores removed setup dependencies but retains mission values', () => {
  const prompt = buildTaskPrompt(task, phase, plan, [], 'Send a text to 347-772-8389 that reads "Watson, come here."');
  expect(prompt).not.toContain('phase-1-task-1');
  expect(prompt).toContain('347-772-8389');
  expect(prompt).toContain('Watson, come here.');
});

it('retains a setup dependency when its producer is still in the plan', () => {
  const producer = { ...task, id: 'phase-1-task-1' };
  const prompt = buildTaskPrompt(task, phase, { ...plan, phases: [{ ...phase, tasks: [producer, task] }] }, []);
  expect(prompt).toContain('phase-1-task-1 (text_message_service)');
});
