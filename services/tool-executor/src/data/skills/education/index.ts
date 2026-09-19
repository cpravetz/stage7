import { Tool } from '../../../types';
import { LESSON_ASSESSMENT_DRAFTING } from './lesson-assessment-drafting';
import { LEARNER_INSIGHT } from './learner-insight';
import { ADAPTIVE_PERSONALIZATION } from './adaptive-personalization';
import { RESOURCE_LIBRARY_OPS } from './resource-library-ops';

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

LESSON_ASSESSMENT_DRAFTING.manifest.workflowStage = 'assess';
LEARNER_INSIGHT.manifest.workflowStage = 'plan';
ADAPTIVE_PERSONALIZATION.manifest.workflowStage = 'plan';
RESOURCE_LIBRARY_OPS.manifest.workflowStage = 'support';

export const educationSkills = [LESSON_ASSESSMENT_DRAFTING, LEARNER_INSIGHT, ADAPTIVE_PERSONALIZATION, RESOURCE_LIBRARY_OPS];

export const educationWorkflow: AssistantWorkflow = {
  assistant: 'Education',
  productObject: 'learner',
  flow: 'plan → assess → support',
  stages: [
    { name: 'plan', description: 'Learner context and adaptive planning', skills: educationSkills.filter((s) => s.manifest.workflowStage === 'plan') },
    { name: 'assess', description: 'Lesson, quiz, and activity assessment drafting', skills: educationSkills.filter((s) => s.manifest.workflowStage === 'assess') },
    { name: 'support', description: 'Resource library and accessibility support', skills: educationSkills.filter((s) => s.manifest.workflowStage === 'support') },
  ],
};

// CHANGE 1 verification: LEARNER_INSIGHT uses createExternalActionSkill.
// The factory at code-skill-factory.ts:290-298 already returns the honest not-connected
// contract when the endpoint is unconfigured (result.mode = "not-connected", success = false).
// LEARNER_INSIGHT inherits this correctly via createExternalActionSkill with no override.

// CHANGE 3: HO skill wrappers — wrap existing skills as proper higher-order skills
export const educationCanonicalSkills: Tool[] = [
  { ...LESSON_ASSESSMENT_DRAFTING, isSkill: true },
  { ...LEARNER_INSIGHT, isSkill: true },
  { ...ADAPTIVE_PERSONALIZATION, isSkill: true },
  { ...RESOURCE_LIBRARY_OPS, isSkill: true },
];
