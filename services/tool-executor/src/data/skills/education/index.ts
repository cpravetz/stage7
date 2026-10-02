import { Tool } from '../../../types';
import { LESSON_ASSESSMENT_DRAFTING_USER } from './lesson-assessment-drafting';
import { LESSON_ASSESSMENT_DRAFTING_SCHEDULED } from './lesson-assessment-drafting-scheduled';
import { LEARNER_INSIGHT } from './learner-insight';
import { ADAPTIVE_PERSONALIZATION } from './adaptive-personalization';
import { RESOURCE_LIBRARY_OPS } from './resource-library-ops';
import { createWorkflow } from '../workflow-common';

export const educationSkills = [LESSON_ASSESSMENT_DRAFTING_USER, LESSON_ASSESSMENT_DRAFTING_SCHEDULED, LEARNER_INSIGHT, ADAPTIVE_PERSONALIZATION, RESOURCE_LIBRARY_OPS];

export const educationWorkflow = createWorkflow({
  assistant: 'Education',
  productObject: 'learner',
  flow: 'plan → assess → support',
  skills: educationSkills,
});

// CHANGE 1 verification: LEARNER_INSIGHT uses createExternalActionSkill.
// The factory at code-skill-factory.ts:290-298 already returns the honest not-connected
// contract when the endpoint is unconfigured (result.mode = "not-connected", success = false).
// LEARNER_INSIGHT inherits this correctly via createExternalActionSkill with no override.

// CHANGE 3: HO skill wrappers — wrap existing skills as proper higher-order skills
export const educationCanonicalSkills: Tool[] = [
  { ...LESSON_ASSESSMENT_DRAFTING_USER, isSkill: false },
  { ...LESSON_ASSESSMENT_DRAFTING_SCHEDULED, isSkill: false },
  { ...LEARNER_INSIGHT, isSkill: false },
  { ...ADAPTIVE_PERSONALIZATION, isSkill: false },
  { ...RESOURCE_LIBRARY_OPS, isSkill: true },
];
