import type { Task } from '@stage7-nextgen/shared';

export function applyRuntimeTaskRequirements(task: Task, missionGoal?: string): void {
  const requiredActions = task.requiredActions || [];
  const legacyExternalAction = requiredActions.some(
    (action) => action.toolId === '__external_action__',
  );
  if (legacyExternalAction) {
    task.requiredActions = requiredActions.filter(
      (action) => action.toolId !== '__external_action__',
    );
    task.requiresExternalAction = true;
  }

  const taskDescription = [
    task.title,
    task.description,
    task.systemPrompt,
    task.agentRole,
  ].filter(Boolean).join('\n');
  const communicationOperation = /\b(?:send|deliver|transmit|submit|perform|execute|complete)\b[\s\S]{0,100}\b(?:text(?:\s+message)?|sms|email|message)\b/i
    .test(taskDescription)
    || /\b(?:text(?:\s+message)?|sms|email|message)\b[\s\S]{0,100}\b(?:send|deliver|transmit)\b/i
      .test(taskDescription);
  const normalizedTaskDescription = taskDescription.replace(/([a-z])([A-Z])/g, '$1 $2');
  const delegatedCommunicationOperation = missionGoal
    && /\b(?:send|deliver|transmit|submit|perform|execute|complete)\b[\s\S]{0,100}\b(?:text(?:\s+message)?|sms|email|message)\b/i
      .test(missionGoal)
    && /\b(?:sender|send|deliver|transmit|dispatch)\b/i.test(normalizedTaskDescription)
    && /\b(?:text|sms|email|message|messaging)\b/i.test(normalizedTaskDescription);
  if (communicationOperation || delegatedCommunicationOperation) task.requiresExternalAction = true;
}
