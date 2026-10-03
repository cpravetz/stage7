import { Tool } from '../types';

/**
 * An assistant's declared scope.
 *
 * There are deliberately no stages and no lanes. A user arrives with a job to
 * do, not with a position in someone else's lifecycle, so a Skill is offered on
 * its own merits rather than as a step in an ordered sequence. `flow` is a
 * human-readable summary of the territory the assistant covers; it is not an
 * execution order and nothing validates or enforces it as one.
 */
export interface AssistantWorkflow {
  assistant: string;
  productObject: string;
  flow: string;
  skills: Tool[];
}

export interface AssistantWorkflowConfig {
  assistant: string;
  productObject: string;
  flow: string;
  skills: Tool[];
}

export function createWorkflow(config: AssistantWorkflowConfig): AssistantWorkflow {
  if (!config.assistant || !config.assistant.trim()) {
    throw new Error('workflow assistant is required');
  }
  if (!config.productObject || !config.productObject.trim()) {
    throw new Error(`workflow ${config.assistant} requires a product object`);
  }
  const skills = [...config.skills];
  const seen = new Set<string>();
  for (const skill of skills) {
    if (seen.has(skill.id)) {
      throw new Error(`Duplicate skill in workflow ${config.assistant}: ${skill.id}`);
    }
    seen.add(skill.id);
  }
  return {
    assistant: config.assistant,
    productObject: config.productObject,
    flow: config.flow ?? '',
    skills,
  };
}
