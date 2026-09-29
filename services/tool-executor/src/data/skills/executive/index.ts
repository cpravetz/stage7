import { Tool } from '../../../types';
import { LEADERSHIP_ADVISORY } from './executive-leadership-advisory';
import { DEV_CAREER } from './executive-dev-career';
import { FEEDBACK } from './executive-feedback';
import { RISK_SCENARIO } from './executive-risk-scenario';
import { SPEECH_COMMUNICATION_COPILOT } from './executive-speech-communication-copilot';
import { TIME_STRATEGIC_FOCUS_PROXY } from './executive-time-strategic-focus-proxy';
import { annotateStages, createWorkflow, AssistantWorkflow } from '../workflow-common';

export const executiveSkills: Tool[] = [
  LEADERSHIP_ADVISORY,
  DEV_CAREER,
  FEEDBACK,
  RISK_SCENARIO,
  SPEECH_COMMUNICATION_COPILOT,
  TIME_STRATEGIC_FOCUS_PROXY,
];

annotateStages(executiveSkills, {
  'executive-leadership-advisory': 'recommendation',
  'executive-dev-career': 'analysis',
  'executive-feedback': 'review',
  'executive-risk-scenario': 'decision',
  'executive-speech-communication-copilot': 'recommendation',
  'executive-time-strategic-focus-proxy': 'recommendation',
});

export const executiveWorkflow: AssistantWorkflow = createWorkflow({
  assistant: 'Executive',
  productObject: 'organization / strategy',
  flow: 'review → analysis → recommendation → decision',
  stages: [
    { name: 'review', description: 'Review and feedback', stageIds: ['executive-feedback'] },
    { name: 'analysis', description: 'Analysis and research', stageIds: ['executive-dev-career'] },
    { name: 'recommendation', description: 'Advisory and recommendations', stageIds: ['executive-leadership-advisory', 'executive-speech-communication-copilot', 'executive-time-strategic-focus-proxy'] },
    { name: 'decision', description: 'Decision support and scenario evaluation', stageIds: ['executive-risk-scenario'] },
  ],
}, executiveSkills);
