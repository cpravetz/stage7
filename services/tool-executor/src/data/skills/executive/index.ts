import { Tool } from '../../../types';
import { LEADERSHIP_ADVISORY } from './executive-leadership-advisory';
import { DEV_CAREER } from './executive-dev-career';
import { FEEDBACK } from './executive-feedback';
import { RISK_SCENARIO } from './executive-risk-scenario';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const executiveSkills: Tool[] = [
  LEADERSHIP_ADVISORY,
  DEV_CAREER,
  FEEDBACK,
  RISK_SCENARIO,
];

annotateStages(executiveSkills, {
  'executive-leadership-advisory': 'recommendation',
  'executive-dev-career': 'analysis',
  'executive-feedback': 'review',
  'executive-risk-scenario': 'decision',
});

export const executiveWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Executive',
  productObject: 'organization / strategy',
  flow: 'review → analysis → recommendation → decision',
  stages: [
    { name: 'review', description: 'Review and feedback', stageIds: ['executive-feedback'] },
    { name: 'analysis', description: 'Analysis and research', stageIds: ['executive-dev-career'] },
    { name: 'recommendation', description: 'Advisory and recommendations', stageIds: ['executive-leadership-advisory'] },
    { name: 'decision', description: 'Decision support and scenario evaluation', stageIds: ['executive-risk-scenario'] },
  ],
}, executiveSkills);
