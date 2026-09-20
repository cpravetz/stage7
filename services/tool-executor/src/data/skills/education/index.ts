import { Tool } from '../../../types';
import { LESSON_ASSESSMENT_DRAFTING } from './lesson-assessment-drafting';
import { LEARNER_INSIGHT } from './learner-insight';
import { ADAPTIVE_PERSONALIZATION } from './adaptive-personalization';
import { RESOURCE_LIBRARY_OPS } from './resource-library-ops';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const educationSkills = [LESSON_ASSESSMENT_DRAFTING, LEARNER_INSIGHT, ADAPTIVE_PERSONALIZATION, RESOURCE_LIBRARY_OPS];

annotateStages(educationSkills, {
  'education_lesson_assessment_drafting': 'assess',
  'education_learner_insight': 'plan',
  'education_adaptive_personalization': 'plan',
  'education_resource_library': 'support',
});

export const educationWorkflow = createWorkflow({
  assistant: 'Education',
  productObject: 'learner',
  flow: 'plan → assess → support',
  stages: [
    { name: 'plan', description: 'Learner context and adaptive planning', stageIds: ['education_learner_insight', 'education_adaptive_personalization'] },
    { name: 'assess', description: 'Lesson, quiz, and activity assessment drafting', stageIds: ['education_lesson_assessment_drafting'] },
    { name: 'support', description: 'Resource library and accessibility support', stageIds: ['education_resource_library'] },
  ],
}, educationSkills);

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
