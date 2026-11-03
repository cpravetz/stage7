import type { Task } from '@stage7-nextgen/shared';

export function applyRuntimeTaskRequirements(task: Task): void {
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
  ].filter(Boolean).join('\n');
  const communicationOperation = /\b(?:send|deliver|transmit|submit|perform|execute|complete)\b[\s\S]{0,100}\b(?:text(?:\s+message)?|sms|email|message)\b/i
    .test(taskDescription)
    || /\b(?:text(?:\s+message)?|sms|email|message)\b[\s\S]{0,100}\b(?:send|deliver|transmit)\b/i
      .test(taskDescription);
  if (communicationOperation) task.requiresExternalAction = true;
}
