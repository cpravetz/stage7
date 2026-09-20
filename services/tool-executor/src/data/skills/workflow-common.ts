import { Tool } from '../../types';

export interface WorkflowStage {
  name: string;
  description: string;
  skills: Tool[];
}

export interface AssistantWorkflow {
  assistant: string;
  productObject: string;
  flow: string;
  stages: WorkflowStage[];
}

export interface AssistantWorkflowConfig {
  assistant: string;
  productObject: string;
  flow: string;
  stages: Array<{
    name: string;
    description: string;
    stageIds: string[];
  }>;
}

export function annotateStages(skills: Tool[], stageMap: Record<string, string>): void {
  for (const skill of skills) {
    if (stageMap[skill.id]) {
      skill.manifest.workflowStage = stageMap[skill.id];
    }
  }
}

export function createWorkflow(config: AssistantWorkflowConfig, allSkills: Tool[]): AssistantWorkflow {
  return {
    assistant: config.assistant,
    productObject: config.productObject,
    flow: config.flow,
    stages: config.stages.map((stage) => ({
      name: stage.name,
      description: stage.description,
      skills: allSkills.filter((s) => stage.stageIds.includes(s.id)),
    })),
  };
}
