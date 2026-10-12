export function missionIdFromWorkflowId(workflowId: string): string {
  return workflowId.startsWith('mission-')
    ? workflowId.slice('mission-'.length)
    : workflowId;
}
